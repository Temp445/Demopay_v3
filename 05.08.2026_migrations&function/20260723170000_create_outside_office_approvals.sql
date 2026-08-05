-- Create outside_office_approvals table
CREATE TABLE IF NOT EXISTS public.outside_office_approvals (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  timestamp_id uuid NOT NULL REFERENCES public.attendance_timestamp(id) ON DELETE CASCADE,
  clock_in_time timestamptz NOT NULL,
  clock_out_time timestamptz,
  inside_office_clock_in_time timestamptz,
  attendance_location text,
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  reject_reason text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_outside_office_approvals_tenant ON public.outside_office_approvals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_outside_office_approvals_employee ON public.outside_office_approvals(employee_id);
CREATE INDEX IF NOT EXISTS idx_outside_office_approvals_status ON public.outside_office_approvals(status);
CREATE INDEX IF NOT EXISTS idx_outside_office_approvals_clock_in ON public.outside_office_approvals(clock_in_time);

-- RLS
ALTER TABLE public.outside_office_approvals ENABLE ROW LEVEL SECURITY;

-- Employees can view their own requests
CREATE POLICY "Employees can view own outside office approvals"
  ON public.outside_office_approvals FOR SELECT
  USING (
    employee_id IN (
      SELECT id FROM public.employees WHERE email = auth.jwt()->>'email'
    )
    OR
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
  );

-- Employees can insert their own requests
CREATE POLICY "Employees can insert own outside office approvals"
  ON public.outside_office_approvals FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
  );

-- Employees can update their own reason (before review), admins can update status
CREATE POLICY "Allow update on outside office approvals"
  ON public.outside_office_approvals FOR UPDATE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
  );

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_outside_office_approvals_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_outside_office_approvals_updated_at ON public.outside_office_approvals;
CREATE TRIGGER set_outside_office_approvals_updated_at
  BEFORE UPDATE ON public.outside_office_approvals
  FOR EACH ROW EXECUTE FUNCTION public.update_outside_office_approvals_updated_at();
