-- Migration: Fix handle_new_user to skip tenant creation for invited users
--
-- When a user registers via an employee invite link, they pass:
--   is_invite = 'true'
--   tenant_id = <inviter's tenant uuid>
-- in their signup metadata (set by AcceptInvitePage.tsx).
--
-- In this case we must NOT create a new tenant. Instead we use the tenant_id
-- from metadata to immediately set up the profile with the correct tenant
-- and link the user to tenant_users so they have full access on first login.
--
-- The accept_invitation() RPC will then update the user_role (Employee / HR Team).

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_tenant_id uuid;
  v_subdomain text;
  v_org_name  text;
BEGIN

  -- ── Invited user ────────────────────────────────────────────────────────────
  IF (new.raw_user_meta_data->>'is_invite') = 'true' THEN

    -- Read the inviter's tenant_id from metadata
    v_tenant_id := (new.raw_user_meta_data->>'tenant_id')::uuid;

    -- Insert profile with tenant context.
    -- user_role is intentionally left NULL here; accept_invitation() sets it.
    INSERT INTO public.profiles (id, email, full_name, tenant_id)
    VALUES (
      new.id,
      new.email,
      new.raw_user_meta_data->>'name',
      v_tenant_id
    )
    ON CONFLICT (id) DO NOTHING;

    -- Link user to the inviter's existing tenant (not tenant_admin)
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

  -- 1. Create the tenant / organization
  INSERT INTO public.tenants (name, subdomain)
  VALUES (v_org_name, v_subdomain)
  RETURNING id INTO v_tenant_id;

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

  -- 5. Automatically create a 7-day "Elite Trial" subscription
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
    'Elite Trial',
    '7 Days',
    0.00,
    'trial_' || REPLACE(new.id::text, '-', ''),
    'trial_' || REPLACE(new.id::text, '-', ''),
    'trial_generated',
    'active',
    now(),
    now() + interval '6 days' 
  );

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
