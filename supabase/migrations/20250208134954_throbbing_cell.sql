-- Create function to ensure leave balance exists
CREATE OR REPLACE FUNCTION ensure_leave_balance(
  p_employee_id uuid,
  p_leave_type_id uuid,
  p_year integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_default_days integer;
BEGIN
  -- Check if balance already exists
  IF NOT EXISTS (
    SELECT 1 
    FROM public.leave_balances
    WHERE employee_id = p_employee_id
    AND leave_type_id = p_leave_type_id
    AND year = p_year
  ) THEN
    -- Get default days from leave type
    SELECT default_days INTO v_default_days
    FROM public.leave_types
    WHERE id = p_leave_type_id;

    -- Create new balance
    INSERT INTO public.leave_balances (
      employee_id,
      leave_type_id,
      year,
      total_days,
      used_days
    ) VALUES (
      p_employee_id,
      p_leave_type_id,
      p_year,
      COALESCE(v_default_days, 0),
      0
    );
  END IF;
END;
$$;

-- Update get_leave_balances function to ensure balances exist
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
  FOR v_leave_type_id IN SELECT id FROM public.leave_types
  LOOP
    PERFORM ensure_leave_balance(p_employee_id, v_leave_type_id, p_year);
  END LOOP;

  -- Return all balances
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