-- Drop existing foreign key constraints
ALTER TABLE IF EXISTS public.shift_assignments
DROP CONSTRAINT IF EXISTS shift_assignments_employee_id_fkey;

-- Update employees table to reference auth.users
ALTER TABLE public.employees
ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS employees_user_id_idx ON public.employees(user_id);

-- Update shift_assignments to reference employees through user_id
ALTER TABLE public.shift_assignments
ADD CONSTRAINT shift_assignments_employee_id_fkey 
FOREIGN KEY (employee_id) 
REFERENCES auth.users(id) 
ON DELETE CASCADE;

-- Create view for employee details with user info
CREATE OR REPLACE VIEW public.employee_details AS
SELECT 
  e.id,
  e.name,
  e.email,
  e.department,
  e.role,
  e.status,
  e.start_date,
  e.employee_code,
  e.user_id,
  u.email as user_email
FROM public.employees e
LEFT JOIN auth.users u ON u.id = e.user_id;

-- Update RLS policies for shift_assignments
DROP POLICY IF EXISTS "Users can view their shift assignments" ON public.shift_assignments;
DROP POLICY IF EXISTS "Users can update their shift assignments" ON public.shift_assignments;

CREATE POLICY "Users can view their shift assignments"
  ON public.shift_assignments
  FOR SELECT
  TO authenticated
  USING (
    employee_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.user_id = auth.uid()
      AND e.department IN (
        SELECT department FROM public.employees
        WHERE user_id = employee_id
      )
    )
  );

CREATE POLICY "Users can update their shift assignments"
  ON public.shift_assignments
  FOR UPDATE
  TO authenticated
  USING (
    employee_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.user_id = auth.uid()
      AND e.department IN (
        SELECT department FROM public.employees
        WHERE user_id = employee_id
      )
    )
  );

-- Function to get shift assignments with employee details
CREATE OR REPLACE FUNCTION get_shift_assignments(
  p_start_date date,
  p_end_date date,
  p_employee_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  shift_id uuid,
  employee_id uuid,
  schedule_date date,
  status text,
  clock_in timestamptz,
  clock_out timestamptz,
  actual_break_duration interval,
  overtime_minutes integer,
  notes text,
  created_at timestamptz,
  updated_at timestamptz,
  shift jsonb,
  employee jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    sa.id,
    sa.shift_id,
    sa.employee_id,
    sa.schedule_date,
    sa.status::text,
    sa.clock_in,
    sa.clock_out,
    sa.actual_break_duration,
    sa.overtime_minutes,
    sa.notes,
    sa.created_at,
    sa.updated_at,
    to_jsonb(s.*) AS shift,
    jsonb_build_object(
      'name', e.name,
      'email', e.email,
      'department', e.department
    ) AS employee
  FROM public.shift_assignments sa
  JOIN public.shifts s ON s.id = sa.shift_id
  LEFT JOIN public.employees e ON e.user_id = sa.employee_id
  WHERE sa.schedule_date >= p_start_date
  AND sa.schedule_date <= p_end_date
  AND (p_employee_id IS NULL OR sa.employee_id = p_employee_id)
  ORDER BY sa.schedule_date;
END;
$$;