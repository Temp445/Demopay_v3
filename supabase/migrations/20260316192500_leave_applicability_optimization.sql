-- 1. Update ensure_leave_balance to skip non-applicable leaves
CREATE OR REPLACE FUNCTION public.ensure_leave_balance(p_employee_id uuid, p_leave_type_id uuid, p_year integer, p_tenant_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_credit_policy_type  text;
  v_initial_days        numeric;
  v_created_by          uuid;
  v_settings            record;
BEGIN
  -- Get effective settings from priority logic
  SELECT * INTO v_settings 
  FROM public.get_employee_leave_settings(p_employee_id, p_year, p_tenant_id)
  WHERE leave_type_id = p_leave_type_id;

  -- EXIT EARLY IF NOT APPLICABLE
  IF v_settings.priority_source = 'not_applicable' THEN
    RETURN;
  END IF;

  -- get current user or fallback to admin
  v_created_by := auth.uid();
  IF v_created_by IS NULL THEN
    SELECT id INTO v_created_by FROM user_profiles
    WHERE tenant_id = p_tenant_id AND lower(user_role) = 'admin' LIMIT 1;
  END IF;

  -- Get leave type configuration
  SELECT credit_policy_type INTO v_credit_policy_type
  FROM public.leave_types
  WHERE id = p_leave_type_id AND tenant_id = p_tenant_id;

  -- Determine initial days based on credit policy and priority
  IF v_settings.priority_source = 'opening_balance' THEN
    v_initial_days := v_settings.effective_days;
  ELSE
    IF v_credit_policy_type IS NOT NULL AND v_credit_policy_type <> '' THEN
      v_initial_days := 0;
    ELSE
      v_initial_days := v_settings.effective_days;
    END IF;
  END IF;

  -- Insert balance row only if it doesn't exist yet
  INSERT INTO public.leave_balances (
    employee_id, leave_type_id, year, total_days, used_days, created_by, tenant_id
  ) VALUES (
    p_employee_id, p_leave_type_id, p_year, v_initial_days, 0, v_created_by, p_tenant_id
  ) ON CONFLICT (employee_id, leave_type_id, year) DO NOTHING;
END;
$function$;

-- 2. Update get_leave_balances to filter non-applicable leaves from the final view
CREATE OR REPLACE FUNCTION public.get_leave_balances(
  p_employee_id uuid,
  p_year integer,
  p_tenant_id uuid
)
RETURNS TABLE (
  id uuid,
  employee_id uuid,
  leave_type_id uuid,
  year integer,
  total_days numeric,
  used_days numeric,
  created_at timestamptz,
  updated_at timestamptz,
  leave_types jsonb
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 1. Trigger the robust universal sync for this employee/year
  PERFORM public.sync_leave_balances(p_employee_id, p_year, p_tenant_id);

  -- 2. Return ONLY applicable balances
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
  -- CROSS JOIN LATERAL to check applicability on the fly
  CROSS JOIN LATERAL public.get_employee_leave_settings(lb.employee_id, lb.year, lb.tenant_id) settings
  WHERE lb.employee_id = p_employee_id
    AND lb.year = p_year
    AND lb.tenant_id = p_tenant_id
    AND settings.leave_type_id = lb.leave_type_id
    AND settings.priority_source <> 'not_applicable'
  ORDER BY lt.name;
END;
$$;
