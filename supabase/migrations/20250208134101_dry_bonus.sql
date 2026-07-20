-- Drop existing foreign key constraints
ALTER TABLE IF EXISTS public.attendance_logs
DROP CONSTRAINT IF EXISTS attendance_logs_employee_id_fkey;

ALTER TABLE IF EXISTS public.leave_requests 
DROP CONSTRAINT IF EXISTS leave_requests_employee_id_fkey;

ALTER TABLE IF EXISTS public.leave_balances
DROP CONSTRAINT IF EXISTS leave_balances_employee_id_fkey;

-- Update foreign key constraints to reference auth.users instead of employees
ALTER TABLE public.attendance_logs
  ADD CONSTRAINT attendance_logs_employee_id_fkey 
  FOREIGN KEY (employee_id) 
  REFERENCES auth.users(id) 
  ON DELETE CASCADE;

ALTER TABLE public.leave_requests
  ADD CONSTRAINT leave_requests_employee_id_fkey 
  FOREIGN KEY (employee_id) 
  REFERENCES auth.users(id) 
  ON DELETE CASCADE;

ALTER TABLE public.leave_balances
  ADD CONSTRAINT leave_balances_employee_id_fkey 
  FOREIGN KEY (employee_id) 
  REFERENCES auth.users(id) 
  ON DELETE CASCADE;

-- Update RLS policies for attendance_logs
DROP POLICY IF EXISTS "Users can view their own attendance" ON public.attendance_logs;
DROP POLICY IF EXISTS "Users can create their own attendance" ON public.attendance_logs;
DROP POLICY IF EXISTS "Users can update their own attendance" ON public.attendance_logs;

CREATE POLICY "Users can view their own attendance"
  ON public.attendance_logs
  FOR SELECT
  USING (auth.uid() = employee_id);

CREATE POLICY "Users can create their own attendance"
  ON public.attendance_logs
  FOR INSERT
  WITH CHECK (auth.uid() = employee_id);

CREATE POLICY "Users can update their own attendance"
  ON public.attendance_logs
  FOR UPDATE
  USING (auth.uid() = employee_id);

-- Update RLS policies for leave_requests
DROP POLICY IF EXISTS "Users can view their own leave requests" ON public.leave_requests;
DROP POLICY IF EXISTS "Users can create their own leave requests" ON public.leave_requests;
DROP POLICY IF EXISTS "Users can update their own pending leave requests" ON public.leave_requests;

CREATE POLICY "Users can view their own leave requests"
  ON public.leave_requests
  FOR SELECT
  USING (auth.uid() = employee_id);

CREATE POLICY "Users can create their own leave requests"
  ON public.leave_requests
  FOR INSERT
  WITH CHECK (auth.uid() = employee_id);

CREATE POLICY "Users can update their own pending leave requests"
  ON public.leave_requests
  FOR UPDATE
  USING (auth.uid() = employee_id AND status = 'Pending');

-- Update RLS policies for leave_balances
DROP POLICY IF EXISTS "Users can view their own leave balances" ON public.leave_balances;

CREATE POLICY "Users can view their own leave balances"
  ON public.leave_balances
  FOR SELECT
  USING (auth.uid() = employee_id);

-- Create function to initialize leave balances for new users
CREATE OR REPLACE FUNCTION public.initialize_leave_balances()
RETURNS trigger AS $$
DECLARE
  leave_type record;
BEGIN
  -- Create leave balances for each leave type
  FOR leave_type IN SELECT id, default_days FROM public.leave_types
  LOOP
    INSERT INTO public.leave_balances (
      employee_id,
      leave_type_id,
      year,
      total_days,
      used_days
    ) VALUES (
      NEW.id,
      leave_type.id,
      EXTRACT(YEAR FROM CURRENT_DATE)::integer,
      leave_type.default_days,
      0
    );
  END LOOP;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to initialize leave balances for new users
DROP TRIGGER IF EXISTS initialize_leave_balances_trigger ON auth.users;

CREATE TRIGGER initialize_leave_balances_trigger
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.initialize_leave_balances();