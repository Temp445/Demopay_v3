/*
  # Create Multi-Tenant Infrastructure

  1. New Tables
    - `tenants`
      - `id` (uuid, primary key) - Unique identifier for each tenant/organization
      - `name` (text) - Organization/company name
      - `subdomain` (text, unique) - Unique subdomain for tenant
      - `status` (text) - Active, Suspended, Inactive
      - `settings` (jsonb) - Tenant-specific settings
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `tenant_users`
      - `id` (uuid, primary key)
      - `tenant_id` (uuid) - Reference to tenants table
      - `user_id` (uuid) - Reference to auth.users
      - `role` (text) - tenant_admin, manager, user
      - `is_primary` (boolean) - Primary tenant for user (supports multi-tenant users)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Add policies for tenant isolation
    - Create helper functions for tenant context

  3. Purpose
    - Establish multi-tenant foundation
    - Support multiple organizations with complete data isolation
    - Enable users to belong to multiple tenants
    - Provide tenant-level configuration and settings
*/

-- Create tenants table
CREATE TABLE IF NOT EXISTS public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  subdomain text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Suspended', 'Inactive')),
  settings jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create tenant_users junction table (supports users belonging to multiple tenants)
CREATE TABLE IF NOT EXISTS public.tenant_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('tenant_admin', 'manager', 'user')),
  is_primary boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id, user_id)
);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_tenant_users_user_id ON public.tenant_users(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant_id ON public.tenant_users(tenant_id);

-- Enable RLS
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_users ENABLE ROW LEVEL SECURITY;

-- RLS Policies for tenants table
CREATE POLICY "Users can view their own tenants"
  ON public.tenants
  FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Tenant admins can update their tenant"
  ON public.tenants
  FOR UPDATE
  TO authenticated
  USING (
    id IN (
      SELECT tenant_id FROM public.tenant_users
      WHERE user_id = auth.uid() AND role = 'tenant_admin'
    )
  )
  WITH CHECK (
    id IN (
      SELECT tenant_id FROM public.tenant_users
      WHERE user_id = auth.uid() AND role = 'tenant_admin'
    )
  );

-- RLS Policies for tenant_users table
CREATE POLICY "Users can view their own tenant memberships"
  ON public.tenant_users
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can view other users in their tenants"
  ON public.tenant_users
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Tenant admins can manage users in their tenant"
  ON public.tenant_users
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users
      WHERE user_id = auth.uid() AND role = 'tenant_admin'
    )
  );

CREATE POLICY "Tenant admins can update users in their tenant"
  ON public.tenant_users
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users
      WHERE user_id = auth.uid() AND role = 'tenant_admin'
    )
  );

CREATE POLICY "Tenant admins can delete users from their tenant"
  ON public.tenant_users
  FOR DELETE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users
      WHERE user_id = auth.uid() AND role = 'tenant_admin'
    )
  );

-- Add updated_at triggers
CREATE TRIGGER tenants_updated_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER tenant_users_updated_at
  BEFORE UPDATE ON public.tenant_users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Helper function to get current user's tenant_id (returns primary tenant)
CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT tenant_id
  FROM public.tenant_users
  WHERE user_id = auth.uid() AND is_primary = true
  LIMIT 1;
$$;

-- Helper function to check if user belongs to a specific tenant
CREATE OR REPLACE FUNCTION public.user_belongs_to_tenant(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS(
    SELECT 1
    FROM public.tenant_users
    WHERE user_id = auth.uid() AND tenant_id = p_tenant_id
  );
$$;

-- Helper function to get all tenant IDs for current user
CREATE OR REPLACE FUNCTION public.get_user_tenant_ids()
RETURNS TABLE(tenant_id uuid)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT tenant_id
  FROM public.tenant_users
  WHERE user_id = auth.uid();
$$;

-- Update handle_new_user function to create default tenant for new users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_tenant_id uuid;
  v_subdomain text;
BEGIN
  -- Insert profile
  INSERT INTO public.profiles (id, email)
  VALUES (new.id, new.email);

  -- Create a default tenant for the new user
  -- Generate subdomain from email (remove special chars and domain)
  v_subdomain := LOWER(REPLACE(SPLIT_PART(new.email, '@', 1), '.', '')) || '-' || SUBSTRING(new.id::text FROM 1 FOR 8);

  -- Create tenant
  INSERT INTO public.tenants (name, subdomain)
  VALUES ('My Organization', v_subdomain)
  RETURNING id INTO v_tenant_id;

  -- Link user to tenant as admin
  INSERT INTO public.tenant_users (tenant_id, user_id, role, is_primary)
  VALUES (v_tenant_id, new.id, 'tenant_admin', true);

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment for documentation
COMMENT ON TABLE public.tenants IS 'Stores tenant/organization information for multi-tenant architecture';
COMMENT ON TABLE public.tenant_users IS 'Junction table linking users to tenants with roles';
COMMENT ON FUNCTION public.get_user_tenant_id() IS 'Returns the primary tenant_id for the current authenticated user';
COMMENT ON FUNCTION public.user_belongs_to_tenant(uuid) IS 'Checks if current user belongs to specified tenant';
