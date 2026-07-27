-- Fix all RLS policies for comp_off_requests to use correct role 'tenant_admin' instead of 'admin'

-- 1. Drop existing incorrect policies
DROP POLICY IF EXISTS "Users can view their own comp off requests" ON public.comp_off_requests;
DROP POLICY IF EXISTS "Admins and managers can create comp off requests" ON public.comp_off_requests;
DROP POLICY IF EXISTS "Users can create their own comp off requests" ON public.comp_off_requests;
DROP POLICY IF EXISTS "Admins and managers can update comp off requests" ON public.comp_off_requests;

-- 2. Recreate with correct roles ('tenant_admin', 'manager')
CREATE POLICY "Users can view their own comp off requests"
  ON public.comp_off_requests
  FOR SELECT
  USING (
    auth.uid() IN (
      SELECT id FROM public.profiles WHERE id = employee_id
    ) OR
    auth.uid() IN (
      SELECT user_id FROM public.tenant_users WHERE tenant_id = comp_off_requests.tenant_id AND role IN ('tenant_admin', 'manager')
    )
  );

CREATE POLICY "Users can create their own comp off requests"
  ON public.comp_off_requests
  FOR INSERT
  WITH CHECK (
    auth.uid() IN (
      SELECT id FROM public.profiles WHERE id = employee_id
    )
  );

CREATE POLICY "Admins and managers can create comp off requests"
  ON public.comp_off_requests
  FOR INSERT
  WITH CHECK (
    auth.uid() IN (
      SELECT user_id FROM public.tenant_users WHERE tenant_id = comp_off_requests.tenant_id AND role IN ('tenant_admin', 'manager')
    )
  );

CREATE POLICY "Admins and managers can update comp off requests"
  ON public.comp_off_requests
  FOR UPDATE
  USING (
    auth.uid() IN (
      SELECT user_id FROM public.tenant_users WHERE tenant_id = comp_off_requests.tenant_id AND role IN ('tenant_admin', 'manager')
    )
  );
