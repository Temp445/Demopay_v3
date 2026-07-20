-- Update ensure_leave_balance function to handle duplicates gracefully
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
  -- Get default days from leave type
  SELECT default_days INTO v_default_days
  FROM public.leave_types
  WHERE id = p_leave_type_id;

  -- Insert new balance only if it doesn't exist
  INSERT INTO public.leave_balances (
    employee_id,
    leave_type_id,
    year,
    total_days,
    used_days
  )
  VALUES (
    p_employee_id,
    p_leave_type_id,
    p_year,
    COALESCE(v_default_days, 0),
    0
  )
  ON CONFLICT (employee_id, leave_type_id, year) DO NOTHING;
END;
$$;