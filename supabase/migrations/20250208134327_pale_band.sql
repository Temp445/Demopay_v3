-- Add profiles view for user information
CREATE OR REPLACE VIEW public.user_profiles AS
SELECT 
  u.id,
  u.email,
  p.id as profile_id,
  COALESCE(e.name, split_part(u.email, '@', 1)) as name,
  e.department,
  e.role
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
LEFT JOIN public.employees e ON e.email = u.email;

-- Update leave_requests to use user_profiles instead of profiles
DROP POLICY IF EXISTS "Users can view their own leave requests" ON public.leave_requests;

CREATE POLICY "Users can view their own leave requests"
  ON public.leave_requests
  FOR SELECT
  USING (
    auth.uid() = employee_id OR
    auth.uid() IN (
      SELECT id FROM auth.users 
      WHERE auth.uid() = approved_by
    )
  );

-- Add function to safely get attendance log
CREATE OR REPLACE FUNCTION get_attendance_log(
  p_employee_id uuid,
  p_date date
)
RETURNS TABLE (
  id uuid,
  employee_id uuid,
  date date,
  clock_in timestamptz,
  clock_out timestamptz,
  status text,
  notes text,
  created_at timestamptz,
  updated_at timestamptz
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.attendance_logs
  WHERE employee_id = p_employee_id
  AND date = p_date;
END;
$$;

-- Add function to safely get leave request details
CREATE OR REPLACE FUNCTION get_leave_request_details(
  p_employee_id uuid,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  employee_id uuid,
  leave_type_id uuid,
  start_date date,
  end_date date,
  reason text,
  status text,
  document_url text,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  leave_type_name text,
  approved_by_email text
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    lr.*,
    lt.name as leave_type_name,
    up.email as approved_by_email
  FROM public.leave_requests lr
  JOIN public.leave_types lt ON lt.id = lr.leave_type_id
  LEFT JOIN public.user_profiles up ON up.id = lr.approved_by
  WHERE lr.employee_id = p_employee_id
  AND (p_start_date IS NULL OR lr.start_date >= p_start_date)
  AND (p_end_date IS NULL OR lr.end_date <= p_end_date)
  ORDER BY lr.created_at DESC;
END;
$$;