/*
  # Employee Leave Applicable Days
  This table stores per-employee configuration for leave applicability and overridden days.
*/

CREATE TABLE IF NOT EXISTS public.employee_leave_applicable (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,
  leave_type_id uuid REFERENCES public.leave_types(id) ON DELETE CASCADE,
  is_applicable boolean NOT NULL DEFAULT true,
  applicable_days numeric,
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id, employee_id, leave_type_id)
);

ALTER TABLE public.employee_leave_applicable ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant read access employee_leave_applicable"
  ON public.employee_leave_applicable
  FOR SELECT
  USING (tenant_id = (SELECT tenant_id FROM public.user_profiles WHERE id = auth.uid()));

CREATE POLICY "Tenant insert access employee_leave_applicable"
  ON public.employee_leave_applicable
  FOR INSERT
  WITH CHECK (tenant_id = (SELECT tenant_id FROM public.user_profiles WHERE id = auth.uid()));

CREATE POLICY "Tenant update access employee_leave_applicable"
  ON public.employee_leave_applicable
  FOR UPDATE
  USING (tenant_id = (SELECT tenant_id FROM public.user_profiles WHERE id = auth.uid()));

CREATE TRIGGER employee_leave_applicable_updated_at
  BEFORE UPDATE ON public.employee_leave_applicable
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();
