-- Drop and recreate get_leave_balances function with proper column qualification
CREATE OR REPLACE FUNCTION get_leave_balances(
  p_employee_id uuid,
  p_year integer
)
RETURNS TABLE (
  id uuid,
  employee_id uuid,
  leave_type_id uuid,
  year integer,
  total_days integer,
  used_days integer,
  created_at timestamptz,
  updated_at timestamptz,
  leave_types jsonb
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_leave_type_id uuid;
BEGIN
  -- Ensure balances exist for all leave types
  FOR v_leave_type_id IN SELECT lt.id FROM public.leave_types lt
  LOOP
    PERFORM ensure_leave_balance(p_employee_id, v_leave_type_id, p_year);
  END LOOP;

  -- Return all balances with properly qualified column references
  RETURN QUERY
  SELECT 
    lb.id,
    lb.employee_id,
    lb.leave_type_id,
    lb.year,
    lb.total_days,
    lb.used_days,
    lb.created_at,
    lb.updated_at,
    jsonb_build_object('name', lt.name) as leave_types
  FROM public.leave_balances lb
  JOIN public.leave_types lt ON lt.id = lb.leave_type_id
  WHERE lb.employee_id = p_employee_id
  AND lb.year = p_year
  ORDER BY lt.name;
END;
$$;