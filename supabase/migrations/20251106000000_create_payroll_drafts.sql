/*
  # Create Payroll Drafts Table for Auto-Save Functionality

  ## Overview
  This migration creates a table to store draft payroll data entered by users before final processing.
  It enables automatic saving and loading of "Enter Later" and "Editable" component values.

  ## New Tables
    - `payroll_drafts`
      - `id` (uuid, primary key) - Unique identifier for each draft
      - `employee_id` (uuid, foreign key) - Reference to employee
      - `structure_id` (uuid, foreign key) - Reference to salary structure
      - `period_start` (date) - Start date of payroll period
      - `period_end` (date) - End date of payroll period
      - `component_values` (jsonb) - Stores all editable component values as key-value pairs
      - `tenant_id` (uuid, foreign key) - Tenant identifier for multi-tenant isolation
      - `created_by` (uuid, foreign key) - User who created the draft
      - `created_at` (timestamptz) - Creation timestamp
      - `updated_at` (timestamptz) - Last update timestamp
      - `last_modified_by` (uuid, foreign key) - User who last modified the draft

  ## Indexes
    - Composite unique index on (employee_id, structure_id, period_start, period_end, tenant_id)
    - Index on tenant_id for RLS performance
    - Index on updated_at for querying recent drafts

  ## Security
    - Enable RLS on `payroll_drafts` table
    - Users can view drafts in their tenant
    - Users can create drafts in their tenant
    - Users can update drafts in their tenant
    - Users can delete their own drafts

  ## Important Notes
    - The composite unique index ensures only one draft per employee per period per structure
    - UPSERT operations will update existing drafts instead of creating duplicates
    - component_values stores data as: {"Component Name": amount, ...}
    - Automatic timestamp updates via trigger
*/

-- ============================================================================
-- PART 1: Create payroll_drafts table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.payroll_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  structure_id uuid NOT NULL REFERENCES public.salary_structures(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  component_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  last_modified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT payroll_drafts_valid_period CHECK (period_start <= period_end)
);

-- ============================================================================
-- PART 2: Create indexes for performance
-- ============================================================================

-- Composite unique index to prevent duplicate drafts for same employee/period/structure
CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_drafts_unique_employee_period
  ON public.payroll_drafts(employee_id, structure_id, period_start, period_end, tenant_id);

-- Index on tenant_id for RLS performance
CREATE INDEX IF NOT EXISTS idx_payroll_drafts_tenant_id
  ON public.payroll_drafts(tenant_id);

-- Index on updated_at for querying recent drafts
CREATE INDEX IF NOT EXISTS idx_payroll_drafts_updated_at
  ON public.payroll_drafts(updated_at DESC);

-- Index on employee_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_payroll_drafts_employee_id
  ON public.payroll_drafts(employee_id);

-- ============================================================================
-- PART 3: Create trigger for automatic updated_at timestamp
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_payroll_drafts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_payroll_drafts_updated_at ON public.payroll_drafts;

CREATE TRIGGER trigger_payroll_drafts_updated_at
  BEFORE UPDATE ON public.payroll_drafts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_payroll_drafts_updated_at();

-- ============================================================================
-- PART 4: Enable Row Level Security
-- ============================================================================

ALTER TABLE public.payroll_drafts ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PART 5: Create RLS Policies
-- ============================================================================

-- Policy: Users can view drafts in their tenant
DROP POLICY IF EXISTS "Users can view payroll drafts in their tenant" ON public.payroll_drafts;

CREATE POLICY "Users can view payroll drafts in their tenant"
  ON public.payroll_drafts
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (SELECT get_user_tenant_ids())
  );

-- Policy: Users can create drafts in their tenant
DROP POLICY IF EXISTS "Users can create payroll drafts in their tenant" ON public.payroll_drafts;

CREATE POLICY "Users can create payroll drafts in their tenant"
  ON public.payroll_drafts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = get_user_tenant_id()
  );

-- Policy: Users can update drafts in their tenant
DROP POLICY IF EXISTS "Users can update payroll drafts in their tenant" ON public.payroll_drafts;

CREATE POLICY "Users can update payroll drafts in their tenant"
  ON public.payroll_drafts
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (SELECT get_user_tenant_ids())
  )
  WITH CHECK (
    tenant_id = get_user_tenant_id()
  );

-- Policy: Users can delete drafts in their tenant
DROP POLICY IF EXISTS "Users can delete payroll drafts in their tenant" ON public.payroll_drafts;

CREATE POLICY "Users can delete payroll drafts in their tenant"
  ON public.payroll_drafts
  FOR DELETE
  TO authenticated
  USING (
    tenant_id IN (SELECT get_user_tenant_ids())
  );

-- ============================================================================
-- PART 6: Add comments for documentation
-- ============================================================================

COMMENT ON TABLE public.payroll_drafts IS 'Stores draft payroll data for auto-save functionality. Allows users to save and retrieve editable component values before final processing.';

COMMENT ON COLUMN public.payroll_drafts.id IS 'Unique identifier for the draft record';
COMMENT ON COLUMN public.payroll_drafts.employee_id IS 'Reference to the employee this draft belongs to';
COMMENT ON COLUMN public.payroll_drafts.structure_id IS 'Reference to the salary structure being used';
COMMENT ON COLUMN public.payroll_drafts.period_start IS 'Start date of the payroll period';
COMMENT ON COLUMN public.payroll_drafts.period_end IS 'End date of the payroll period';
COMMENT ON COLUMN public.payroll_drafts.component_values IS 'JSONB object storing component names as keys and their values as amounts. Example: {"Overtime Hours": 10, "Bonus": 5000}';
COMMENT ON COLUMN public.payroll_drafts.tenant_id IS 'Tenant identifier for multi-tenant data isolation';
COMMENT ON COLUMN public.payroll_drafts.created_by IS 'User who created this draft';
COMMENT ON COLUMN public.payroll_drafts.created_at IS 'Timestamp when the draft was created';
COMMENT ON COLUMN public.payroll_drafts.updated_at IS 'Timestamp when the draft was last updated (auto-updated by trigger)';
COMMENT ON COLUMN public.payroll_drafts.last_modified_by IS 'User who last modified this draft';
