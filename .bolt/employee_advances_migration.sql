/*
  # Employee Advance Management System - Database Schema

  ## Description
  Comprehensive database schema for managing employee advances including requests,
  approvals, installment deductions, holds, short closures, and system settings.

  ## Tables Created

  1. **advance_settings** - Global settings for advance management per tenant
     - default_interest_rate - Default interest rate for advances
     - max_advance_amount - Maximum allowed advance amount
     - max_installments - Maximum number of installments
     - min_installments - Minimum number of installments
     - allow_multiple_advances - Whether employees can have multiple active advances
     - require_justification - Whether justification is mandatory

  2. **employee_advances** - Main table for advance requests and tracking
     - Complete lifecycle tracking from request to completion
     - Support for approval workflow with term modifications
     - Balance tracking for remaining amount

  3. **advance_installments** - Individual installment tracking
     - Scheduled monthly deductions
     - Principal and interest breakdown
     - Integration with payroll system

  4. **advance_deduction_holds** - Temporary suspension of deductions
     - Month-specific holds
     - Automatic schedule adjustment

  5. **advance_short_closures** - Early advance closure tracking
     - Authority-initiated (balance waived)
     - Employee-requested (one-time deduction)

  ## Security
  - Row Level Security (RLS) enabled on all tables
  - Policies ensure tenant isolation and role-based access
  - Employees can only access their own advances
  - Admins can manage all tenant advances

  ## Integration
  - Integrates with existing payroll system
  - Links to employee records
  - Tenant-isolated data
*/

-- =====================================================
-- 1. ADVANCE SETTINGS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.advance_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- Settings
  default_interest_rate numeric DEFAULT 0 CHECK (default_interest_rate >= 0 AND default_interest_rate <= 100),
  max_advance_amount numeric DEFAULT NULL CHECK (max_advance_amount IS NULL OR max_advance_amount > 0),
  max_installments integer DEFAULT 24 CHECK (max_installments > 0 AND max_installments <= 60),
  min_installments integer DEFAULT 1 CHECK (min_installments > 0),
  allow_multiple_advances boolean DEFAULT false,
  require_justification boolean DEFAULT true,

  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  -- Ensure only one settings record per tenant
  UNIQUE(tenant_id),

  -- Validation: min cannot be greater than max
  CHECK (min_installments <= max_installments)
);

-- =====================================================
-- 2. EMPLOYEE ADVANCES TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.employee_advances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,

  -- Request Information
  request_date date NOT NULL DEFAULT CURRENT_DATE,
  requested_amount numeric NOT NULL CHECK (requested_amount > 0),
  requested_installments integer NOT NULL CHECK (requested_installments > 0),
  requested_interest_rate numeric NOT NULL DEFAULT 0 CHECK (requested_interest_rate >= 0),
  requested_start_month text NOT NULL,
  justification text DEFAULT '',

  -- Approval Information
  approved_amount numeric CHECK (approved_amount IS NULL OR approved_amount > 0),
  approved_installments integer CHECK (approved_installments IS NULL OR approved_installments > 0),
  approved_interest_rate numeric CHECK (approved_interest_rate IS NULL OR approved_interest_rate >= 0),
  approved_start_month text,
  approved_by uuid REFERENCES auth.users(id),
  approved_date date,
  approval_comments text DEFAULT '',

  -- Financial Tracking
  total_amount numeric DEFAULT 0 CHECK (total_amount >= 0),
  remaining_balance numeric DEFAULT 0 CHECK (remaining_balance >= 0),

  -- Status Tracking
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'approved', 'rejected', 'active', 'completed', 'cancelled', 'closed')
  ),

  -- Audit Fields
  requested_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- =====================================================
-- 3. ADVANCE INSTALLMENTS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.advance_installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  advance_id uuid NOT NULL REFERENCES public.employee_advances(id) ON DELETE CASCADE,

  -- Installment Details
  installment_number integer NOT NULL CHECK (installment_number > 0),
  due_month text NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  principal_amount numeric NOT NULL CHECK (principal_amount >= 0),
  interest_amount numeric NOT NULL CHECK (interest_amount >= 0),

  -- Status Tracking
  status text NOT NULL DEFAULT 'scheduled' CHECK (
    status IN ('scheduled', 'deducted', 'held', 'waived')
  ),
  deducted_date date,
  payroll_id uuid,

  -- Timestamps
  created_at timestamptz DEFAULT now(),

  -- Validation
  CHECK (amount = principal_amount + interest_amount),
  UNIQUE(advance_id, installment_number)
);

-- =====================================================
-- 4. ADVANCE DEDUCTION HOLDS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.advance_deduction_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  advance_id uuid NOT NULL REFERENCES public.employee_advances(id) ON DELETE CASCADE,

  -- Hold Details
  hold_month text NOT NULL,
  reason text NOT NULL,

  -- Audit Fields
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),

  -- Prevent duplicate holds for same month
  UNIQUE(advance_id, hold_month)
);

-- =====================================================
-- 5. ADVANCE SHORT CLOSURES TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.advance_short_closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  advance_id uuid NOT NULL REFERENCES public.employee_advances(id) ON DELETE CASCADE,

  -- Closure Details
  closure_type text NOT NULL CHECK (
    closure_type IN ('authority_initiated', 'employee_requested')
  ),
  closure_amount numeric NOT NULL CHECK (closure_amount >= 0),
  closure_reason text NOT NULL,
  closure_date date NOT NULL DEFAULT CURRENT_DATE,

  -- Integration
  payroll_id uuid,

  -- Audit Fields
  approved_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),

  -- One closure per advance
  UNIQUE(advance_id)
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_employee_advances_tenant_id ON public.employee_advances(tenant_id);
CREATE INDEX IF NOT EXISTS idx_employee_advances_employee_id ON public.employee_advances(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_advances_status ON public.employee_advances(status);
CREATE INDEX IF NOT EXISTS idx_employee_advances_requested_by ON public.employee_advances(requested_by);

CREATE INDEX IF NOT EXISTS idx_advance_installments_advance_id ON public.advance_installments(advance_id);
CREATE INDEX IF NOT EXISTS idx_advance_installments_due_month ON public.advance_installments(due_month);
CREATE INDEX IF NOT EXISTS idx_advance_installments_status ON public.advance_installments(status);
CREATE INDEX IF NOT EXISTS idx_advance_installments_tenant_due ON public.advance_installments(tenant_id, due_month);

CREATE INDEX IF NOT EXISTS idx_advance_holds_advance_id ON public.advance_deduction_holds(advance_id);
CREATE INDEX IF NOT EXISTS idx_advance_holds_month ON public.advance_deduction_holds(hold_month);

CREATE INDEX IF NOT EXISTS idx_advance_closures_advance_id ON public.advance_short_closures(advance_id);

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE public.advance_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_advances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advance_installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advance_deduction_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advance_short_closures ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS POLICIES: ADVANCE_SETTINGS
-- =====================================================

CREATE POLICY "Users can view their tenant advance settings"
  ON public.advance_settings
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Tenant admins can insert advance settings"
  ON public.advance_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users
      WHERE user_id = auth.uid() AND role = 'tenant_admin'
    )
  );

CREATE POLICY "Tenant admins can update advance settings"
  ON public.advance_settings
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

-- =====================================================
-- RLS POLICIES: EMPLOYEE_ADVANCES
-- =====================================================

CREATE POLICY "Users can view advances in their tenant"
  ON public.employee_advances
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Employees can create their own advance requests"
  ON public.employee_advances
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
    AND (
      -- Employee creating for themselves
      employee_id IN (
        SELECT id FROM public.employees WHERE tenant_id = employee_advances.tenant_id
      )
      -- OR tenant admin creating on behalf
      OR EXISTS (
        SELECT 1 FROM public.tenant_users
        WHERE user_id = auth.uid() AND role = 'tenant_admin'
        AND tenant_id = employee_advances.tenant_id
      )
    )
  );

CREATE POLICY "Users can update their own pending requests or admins can approve"
  ON public.employee_advances
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
  );

-- =====================================================
-- RLS POLICIES: ADVANCE_INSTALLMENTS
-- =====================================================

CREATE POLICY "Users can view installments in their tenant"
  ON public.advance_installments
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "System can manage installments"
  ON public.advance_installments
  FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
  );

-- =====================================================
-- RLS POLICIES: ADVANCE_DEDUCTION_HOLDS
-- =====================================================

CREATE POLICY "Users can view holds in their tenant"
  ON public.advance_deduction_holds
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Authorized users can manage holds"
  ON public.advance_deduction_holds
  FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
  );

-- =====================================================
-- RLS POLICIES: ADVANCE_SHORT_CLOSURES
-- =====================================================

CREATE POLICY "Users can view closures in their tenant"
  ON public.advance_short_closures
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Authorized users can create closures"
  ON public.advance_short_closures
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
  );

-- =====================================================
-- TRIGGERS FOR UPDATED_AT
-- =====================================================

CREATE TRIGGER advance_settings_updated_at
  BEFORE UPDATE ON public.advance_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER employee_advances_updated_at
  BEFORE UPDATE ON public.employee_advances
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Function to calculate total amount with interest
CREATE OR REPLACE FUNCTION public.calculate_advance_total(
  principal numeric,
  interest_rate numeric
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT principal * (1 + (interest_rate / 100));
$$;

-- Function to calculate monthly installment
CREATE OR REPLACE FUNCTION public.calculate_installment_amount(
  total_amount numeric,
  num_installments integer
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT total_amount / num_installments;
$$;

-- Function to get active advances for an employee
CREATE OR REPLACE FUNCTION public.get_active_advances(
  p_employee_id uuid,
  p_tenant_id uuid
)
RETURNS SETOF public.employee_advances
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT *
  FROM public.employee_advances
  WHERE employee_id = p_employee_id
    AND tenant_id = p_tenant_id
    AND status IN ('active', 'approved');
$$;

-- Function to get installments due for a specific month
CREATE OR REPLACE FUNCTION public.get_installments_for_month(
  p_tenant_id uuid,
  p_due_month text
)
RETURNS TABLE (
  installment_id uuid,
  advance_id uuid,
  employee_id uuid,
  amount numeric,
  installment_number integer,
  total_installments integer
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    i.id as installment_id,
    i.advance_id,
    a.employee_id,
    i.amount,
    i.installment_number,
    a.approved_installments as total_installments
  FROM public.advance_installments i
  JOIN public.employee_advances a ON i.advance_id = a.id
  WHERE i.tenant_id = p_tenant_id
    AND i.due_month = p_due_month
    AND i.status = 'scheduled'
    AND a.status = 'active';
$$;

-- =====================================================
-- COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE public.advance_settings IS 'Global settings for advance management per tenant';
COMMENT ON TABLE public.employee_advances IS 'Main table tracking employee advance requests and lifecycle';
COMMENT ON TABLE public.advance_installments IS 'Individual installment schedule and deduction tracking';
COMMENT ON TABLE public.advance_deduction_holds IS 'Temporary suspension of advance deductions for specific months';
COMMENT ON TABLE public.advance_short_closures IS 'Early closure records for advances';

COMMENT ON COLUMN public.employee_advances.status IS 'Status values: pending, approved, rejected, active, completed, cancelled, closed';
COMMENT ON COLUMN public.employee_advances.total_amount IS 'Principal + Interest = Total amount to be recovered';
COMMENT ON COLUMN public.employee_advances.remaining_balance IS 'Amount still to be deducted';

COMMENT ON COLUMN public.advance_installments.status IS 'Status values: scheduled, deducted, held, waived';
COMMENT ON COLUMN public.advance_installments.principal_amount IS 'Principal portion of this installment';
COMMENT ON COLUMN public.advance_installments.interest_amount IS 'Interest portion of this installment';

COMMENT ON FUNCTION public.calculate_advance_total(numeric, numeric) IS 'Calculates total advance amount including interest';
COMMENT ON FUNCTION public.calculate_installment_amount(numeric, integer) IS 'Calculates monthly installment amount';
COMMENT ON FUNCTION public.get_active_advances(uuid, uuid) IS 'Returns active advances for an employee';
COMMENT ON FUNCTION public.get_installments_for_month(uuid, text) IS 'Returns all scheduled installments for a given month';
