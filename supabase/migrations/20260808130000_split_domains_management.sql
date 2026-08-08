-- Migration: Split domain_configurations into domains_management and domain_configurations

-- 1. Create domains_management table
CREATE TABLE IF NOT EXISTS public.domains_management (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  domain_name text NOT NULL,
  allow_to_landing_page boolean NULL DEFAULT true,
  subscription_enabled boolean NULL DEFAULT true,
  is_active boolean NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT domains_management_pkey PRIMARY KEY (id),
  CONSTRAINT domains_management_domain_name_key UNIQUE (domain_name)
) TABLESPACE pg_default;

-- 2. Migrate existing unique domains into domains_management
-- Pick the values from the row where tenant_id IS NULL (the master row), or fallback if none exists.
INSERT INTO public.domains_management (domain_name, allow_to_landing_page, subscription_enabled, is_active)
SELECT DISTINCT ON (domain_name)
  domain_name,
  allow_to_landing_page,
  subscription_enabled,
  is_active
FROM public.domain_configurations
ORDER BY domain_name, (tenant_id IS NULL) DESC, created_at ASC;

-- 3. Add domain_id column to domain_configurations
ALTER TABLE public.domain_configurations
ADD COLUMN domain_id uuid NULL;

-- 4. Update domain_id based on domain_name
UPDATE public.domain_configurations dc
SET domain_id = dm.id
FROM public.domains_management dm
WHERE dc.domain_name = dm.domain_name;

-- 5. Delete rows where domain_id is null (just in case) and make domain_id NOT NULL
DELETE FROM public.domain_configurations WHERE domain_id IS NULL;

ALTER TABLE public.domain_configurations
ALTER COLUMN domain_id SET NOT NULL;

-- 6. Add foreign key constraint
ALTER TABLE public.domain_configurations
ADD CONSTRAINT domain_configurations_domain_id_fkey FOREIGN KEY (domain_id) REFERENCES public.domains_management(id) ON DELETE CASCADE;

-- 7. Modify constraints on domain_configurations
ALTER TABLE public.domain_configurations
DROP CONSTRAINT IF EXISTS domain_configurations_domain_name_tenant_id_key;

ALTER TABLE public.domain_configurations
ADD CONSTRAINT domain_configurations_domain_id_tenant_id_key UNIQUE (domain_id, tenant_id);

-- 7.5 Drop dependent triggers
DROP TRIGGER IF EXISTS cascade_domain_subscription ON public.domain_configurations;

-- 8. Drop old columns
ALTER TABLE public.domain_configurations
DROP COLUMN IF EXISTS domain_name CASCADE,
DROP COLUMN IF EXISTS allow_to_landing_page CASCADE,
DROP COLUMN IF EXISTS subscription_enabled CASCADE,
DROP COLUMN IF EXISTS is_active CASCADE;

-- 9. Add RLS policies for domains_management
ALTER TABLE public.domains_management ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access to all authenticated users"
    ON public.domains_management
    AS PERMISSIVE
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Allow anon read domains_management"
    ON public.domains_management
    AS PERMISSIVE
    FOR SELECT
    TO anon
    USING (true);

CREATE POLICY "Allow full access to tenant admins"
    ON public.domains_management
    AS PERMISSIVE
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- 10. Update handle_new_user function to use the new schema
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
    -- Get the domain_id and subscription_enabled
    SELECT id, subscription_enabled INTO v_domain_id, v_domain_subscription
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

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
