-- Migration: Add free trial configurations to domains_management and update handle_new_user

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_tenant_id uuid;
  v_subdomain text;
  v_org_name  text;
  v_hostname  text;
  v_domain_subscription boolean := false;
  v_domain_id uuid;
  v_base_config jsonb;
  v_free_trial_available boolean := false;
  v_free_trial_days integer := 7;
  v_trial_plan_name text := 'Elite Trial';
BEGIN

  -- ── Invited user ────────────────────────────────────────────────────────────
  IF (new.raw_user_meta_data->>'is_invite') = 'true' THEN
    -- Read the inviter's tenant_id from metadata
    v_tenant_id := (new.raw_user_meta_data->>'tenant_id')::uuid;

    -- Insert profile with tenant context.
    INSERT INTO public.profiles (id, email, full_name, tenant_id)
    VALUES (
      new.id,
      new.email,
      new.raw_user_meta_data->>'name',
      v_tenant_id
    )
    ON CONFLICT (id) DO NOTHING;

    -- Link user to the inviter's existing tenant
    IF v_tenant_id IS NOT NULL THEN
      INSERT INTO public.tenant_users (tenant_id, user_id, role, is_primary)
      VALUES (v_tenant_id, new.id, 'user', true)
      ON CONFLICT (tenant_id, user_id) DO NOTHING;
    END IF;

    RETURN new;
  END IF;

  -- ── Normal (admin) registration ─────────────────────────────────────────────
  v_org_name  := COALESCE(new.raw_user_meta_data->>'company_name', 'My Organization');
  v_subdomain := LOWER(REPLACE(REPLACE(SPLIT_PART(new.email, '@', 1), '.', ''), ' ', '-'))
                 || '-' || SUBSTRING(new.id::text FROM 1 FOR 8);
  v_hostname  := new.raw_user_meta_data->>'hostname';

  -- Check if domains_management has subscription_enabled = true for this hostname
  IF v_hostname IS NOT NULL THEN
    -- Get the domain_id, subscription_enabled, and free trial configs
    SELECT id, subscription_enabled, free_trial_available, free_trial_days, trial_plan_name
      INTO v_domain_id, v_domain_subscription, v_free_trial_available, v_free_trial_days, v_trial_plan_name
    FROM public.domains_management
    WHERE domain_name = v_hostname AND is_active = true
    LIMIT 1;

    -- Get the base config from domain_configurations
    IF v_domain_id IS NOT NULL THEN
      SELECT config INTO v_base_config
      FROM public.domain_configurations
      WHERE domain_id = v_domain_id AND tenant_id IS NULL
      LIMIT 1;

      IF v_base_config IS NULL THEN
        SELECT config INTO v_base_config
        FROM public.domain_configurations
        WHERE domain_id = v_domain_id
        LIMIT 1;
      END IF;
    END IF;
  END IF;

  -- 1. Create the tenant / organization
  INSERT INTO public.tenants (name, subdomain, subscription_enabled)
  VALUES (v_org_name, v_subdomain, COALESCE(v_domain_subscription, false))
  RETURNING id INTO v_tenant_id;

  -- 1.5. Link the tenant to the domain configuration so it appears under Manage Domains
  IF v_domain_id IS NOT NULL AND v_base_config IS NOT NULL THEN
    INSERT INTO public.domain_configurations (
      domain_id,
      tenant_id,
      config
    ) VALUES (
      v_domain_id,
      v_tenant_id,
      v_base_config
    ) ON CONFLICT ON CONSTRAINT domain_configurations_domain_id_tenant_id_key DO NOTHING;
  END IF;

  -- 2. Create the company_settings record
  INSERT INTO public.company_settings (
    tenant_id,
    company_name,
    email,
    phone
  ) VALUES (
    v_tenant_id,
    v_org_name,
    new.email,
    new.raw_user_meta_data->>'mobile_number'
  ) ON CONFLICT (tenant_id) DO UPDATE SET
    company_name = EXCLUDED.company_name,
    email        = EXCLUDED.email,
    phone        = EXCLUDED.phone;

  -- 3. Insert user profile as Admin
  INSERT INTO public.profiles (id, email, user_role, tenant_id, full_name, phone)
  VALUES (
    new.id,
    new.email,
    'Admin',
    v_tenant_id,
    new.raw_user_meta_data->>'name',
    new.raw_user_meta_data->>'mobile_number'
  );

  -- 4. Link user to tenant as the primary administrator
  INSERT INTO public.tenant_users (tenant_id, user_id, role, is_primary)
  VALUES (v_tenant_id, new.id, 'tenant_admin', true);

  -- 5. Automatically create trial subscription if enabled for the domain
  IF v_free_trial_available THEN
    INSERT INTO public.subscriptions (
      tenant_id,
      email,
      name,
      company,
      plan_name,
      billing_cycle,
      amount_paid,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      status,
      created_at,
      expires_at
    ) VALUES (
      v_tenant_id,
      new.email,
      new.raw_user_meta_data->>'name',
      v_org_name,
      v_trial_plan_name,
      v_free_trial_days || ' Days',
      0,
      'trial_' || REPLACE(new.id::text, '-', ''),
      'trial_' || REPLACE(new.id::text, '-', ''),
      'trial_generated',
      'active',
      now(),
      now() + (v_free_trial_days || ' days')::interval
    );
  END IF;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
