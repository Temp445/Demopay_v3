-- Migration: Remove automatic Elite Trial subscription from handle_new_user
--
-- New registrations will no longer receive a 7-day trial automatically.
-- The tenant is still created with all required records (tenant, company_settings,
-- profile, tenant_users). Subscription assignment is now a manual/admin action.


--  NO need to run this script. It is for remove the auto trial subscription from handle_new_user function.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_tenant_id uuid;
  v_subdomain text;
  v_org_name text;
BEGIN
  -- Determine Organization Name from metadata or default
  v_org_name := COALESCE(new.raw_user_meta_data->>'company_name', 'My Organization');

  -- Generate a unique subdomain
  v_subdomain := LOWER(REPLACE(REPLACE(SPLIT_PART(new.email, '@', 1), '.', ''), ' ', '-'))
                 || '-' || SUBSTRING(new.id::text FROM 1 FOR 8);

  -- 1. Create the tenant/organization
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

  -- 3. Insert user profile
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

  -- NOTE: Step 5 (auto Elite Trial subscription) intentionally removed.
  -- New organizations start with no active subscription.
  -- Subscriptions must be assigned manually by an administrator.

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
