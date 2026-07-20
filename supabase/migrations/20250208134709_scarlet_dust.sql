-- Drop existing function if it exists
DROP FUNCTION IF EXISTS get_leave_request_details;

-- Create updated function with correct return type
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
  leave_type jsonb,
  approved_by_user jsonb
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    lr.id,
    lr.employee_id,
    lr.leave_type_id,
    lr.start_date,
    lr.end_date,
    lr.reason,
    lr.status,
    lr.document_url,
    lr.approved_by,
    lr.approved_at,
    lr.created_at,
    lr.updated_at,
    jsonb_build_object('name', lt.name) as leave_type,
    CASE 
      WHEN lr.approved_by IS NOT NULL THEN
        jsonb_build_object('email', up.email)
      ELSE NULL
    END as approved_by_user
  FROM public.leave_requests lr
  JOIN public.leave_types lt ON lt.id = lr.leave_type_id
  LEFT JOIN public.user_profiles up ON up.id = lr.approved_by
  WHERE lr.employee_id = p_employee_id
  AND (p_start_date IS NULL OR lr.start_date >= p_start_date)
  AND (p_end_date IS NULL OR lr.end_date <= p_end_date)
  ORDER BY lr.created_at DESC;
END;
$$;