
-- 2. Create comp_off_requests table
CREATE TABLE IF NOT EXISTS public.comp_off_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  leave_type_id uuid NOT NULL REFERENCES public.leave_types(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  worked_date date NOT NULL,
  reason text NOT NULL,
  status text NOT NULL CHECK (status IN ('Pending', 'Approved', 'Rejected')),
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  reject_reason text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(employee_id, worked_date)
);

-- 3. Enable RLS
ALTER TABLE public.comp_off_requests ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
CREATE POLICY "Users can view their own comp off requests"
  ON public.comp_off_requests
  FOR SELECT
  USING (
    auth.uid() IN (
      SELECT id FROM public.profiles WHERE id = employee_id
    ) OR
    auth.uid() IN (
      SELECT user_id FROM public.tenant_users WHERE tenant_id = comp_off_requests.tenant_id AND role IN ('admin', 'manager')
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

CREATE POLICY "Admins and managers can update comp off requests"
  ON public.comp_off_requests
  FOR UPDATE
  USING (
    auth.uid() IN (
      SELECT user_id FROM public.tenant_users WHERE tenant_id = comp_off_requests.tenant_id AND role IN ('admin', 'manager')
    )
  );

-- 5. Trigger to automatically credit leave balance when approved
CREATE OR REPLACE FUNCTION process_comp_off_approval()
RETURNS TRIGGER AS $$
DECLARE
  v_year integer;
BEGIN
  -- Only trigger when status changes to 'Approved'
  IF NEW.status = 'Approved' AND OLD.status != 'Approved' THEN
    v_year := extract(year from NEW.worked_date);
    
    -- Update leave_balances
    UPDATE public.leave_balances
    SET 
      total_days = total_days + 1,
      updated_at = now()
    WHERE employee_id = NEW.employee_id 
      AND leave_type_id = NEW.leave_type_id
      AND year = v_year;
      
    -- If no balance record exists for this year, insert one
    IF NOT FOUND THEN
      INSERT INTO public.leave_balances (
        employee_id,
        leave_type_id,
        year,
        total_days,
        used_days
      ) VALUES (
        NEW.employee_id,
        NEW.leave_type_id,
        v_year,
        1,
        0
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER comp_off_approval_trigger
  AFTER UPDATE OF status ON public.comp_off_requests
  FOR EACH ROW
  EXECUTE FUNCTION process_comp_off_approval();
