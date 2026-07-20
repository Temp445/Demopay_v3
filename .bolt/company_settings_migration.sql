/*
  # Create Company Settings Table

  ## Description
  This migration creates a comprehensive company settings table to store all company-wide
  configuration including company information, address, contact details, pay period settings,
  bank account information, approval workflows, and department structures.

  ## Changes

  1. New Tables
    - `company_settings`
      - `id` (uuid, primary key) - Unique identifier
      - `tenant_id` (uuid, foreign key) - Reference to tenant
      - `company_name` (text) - Company display name
      - `legal_name` (text) - Legal business name
      - `tax_id` (text) - Tax ID / EIN
      - `registration_number` (text) - Business registration number
      - `address` (jsonb) - Company address (street, city, state, postalCode, country)
      - `phone` (text) - Company phone number
      - `email` (text) - Company email address
      - `website` (text) - Company website URL
      - `pay_period_type` (text) - weekly, biweekly, semimonthly, monthly
      - `pay_period_start_day` (text) - Day when pay period starts
      - `pay_period_end_day` (text) - Day when pay period ends
      - `payment_day` (text) - Day when payments are made
      - `bank_name` (text) - Bank name for company account
      - `account_number` (text) - Bank account number (encrypted)
      - `routing_number` (text) - Bank routing number
      - `account_type` (text) - checking, savings, business
      - `require_approval_for_payroll` (boolean) - Whether payroll requires approval
      - `approval_levels` (integer) - Number of approval levels required
      - `approver_roles` (jsonb) - Array of roles that can approve (e.g., ["Manager", "Director"])
      - `department_structure` (jsonb) - Array of departments with cost centers
      - `created_at` (timestamptz) - Record creation timestamp
      - `updated_at` (timestamptz) - Last update timestamp

  2. Security
    - Enable RLS on `company_settings` table
    - Add policy for authenticated users to read their tenant's settings
    - Add policy for tenant admins to update their tenant's settings

  3. Indexes
    - Index on tenant_id for fast lookups

  ## Notes
  - Only one settings record should exist per tenant
  - Address and department_structure stored as JSONB for flexibility
  - Bank account details should be handled carefully (consider encryption at app level)
  - Default values provided for common settings

  ## How to Apply
  This migration needs to be applied to your Supabase database. You can:
  1. Copy this SQL and run it in the Supabase SQL Editor
  2. Use the Supabase CLI: `supabase migration new create_company_settings` and paste this content
*/

-- Create company_settings table
CREATE TABLE IF NOT EXISTS public.company_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- Company Information
  company_name text DEFAULT '',
  legal_name text DEFAULT '',
  tax_id text DEFAULT '',
  registration_number text DEFAULT '',

  -- Address (stored as JSONB for flexibility)
  address jsonb DEFAULT '{"street": "", "city": "", "state": "", "postalCode": "", "country": "United States"}'::jsonb,

  -- Contact Information
  phone text DEFAULT '',
  email text DEFAULT '',
  website text DEFAULT '',

  -- Pay Period Settings
  pay_period_type text DEFAULT 'monthly' CHECK (pay_period_type IN ('weekly', 'biweekly', 'semimonthly', 'monthly')),
  pay_period_start_day text DEFAULT '1',
  pay_period_end_day text DEFAULT 'last',
  payment_day text DEFAULT '5',

  -- Bank Account Details
  bank_name text DEFAULT '',
  account_number text DEFAULT '',
  routing_number text DEFAULT '',
  account_type text DEFAULT 'checking' CHECK (account_type IN ('checking', 'savings', 'business')),

  -- Approval Workflow
  require_approval_for_payroll boolean DEFAULT true,
  approval_levels integer DEFAULT 1 CHECK (approval_levels >= 1 AND approval_levels <= 3),
  approver_roles jsonb DEFAULT '["Manager"]'::jsonb,

  -- Department Structure
  department_structure jsonb DEFAULT '[]'::jsonb,

  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  -- Ensure only one settings record per tenant
  UNIQUE(tenant_id)
);

-- Create index for tenant_id lookups
CREATE INDEX IF NOT EXISTS idx_company_settings_tenant_id ON public.company_settings(tenant_id);

-- Enable RLS
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view their tenant's company settings
CREATE POLICY "Users can view their tenant company settings"
  ON public.company_settings
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
  );

-- RLS Policy: Tenant admins can insert company settings for their tenant
CREATE POLICY "Tenant admins can insert company settings"
  ON public.company_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users
      WHERE user_id = auth.uid() AND role = 'tenant_admin'
    )
  );

-- RLS Policy: Tenant admins can update their tenant's company settings
CREATE POLICY "Tenant admins can update company settings"
  ON public.company_settings
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users
      WHERE user_id = auth.uid() AND role = 'tenant_admin'
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users
      WHERE user_id = auth.uid() AND role = 'tenant_admin'
    )
  );

-- Add updated_at trigger
CREATE TRIGGER company_settings_updated_at
  BEFORE UPDATE ON public.company_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Add helpful comments
COMMENT ON TABLE public.company_settings IS 'Stores comprehensive company-wide settings for each tenant including company info, pay periods, bank details, and approval workflows';
COMMENT ON COLUMN public.company_settings.address IS 'Company address stored as JSONB with fields: street, city, state, postalCode, country';
COMMENT ON COLUMN public.company_settings.department_structure IS 'Array of department objects with id, name, and costCenter fields';
COMMENT ON COLUMN public.company_settings.approver_roles IS 'Array of role names that can approve payroll';
