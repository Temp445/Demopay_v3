-- Refined get_ot_eligible_employees RPC
-- This version simplifies eligibility checks for already approved records 
-- and ensures more reliable counting of hours.

CREATE OR REPLACE FUNCTION get_ot_eligible_employees(
  p_tenant_id uuid,
  p_period_start date,
  p_period_end date
)
RETURNS TABLE (
  employee_id uuid,
  employee_name text,
  employee_code text,
  department text,
  total_ot_hours numeric,
  ot_structure_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.id,
    e.name,
    e.employee_code,
    d.name as department,
    COALESCE(SUM(
      COALESCE(oa.corrected_ot_hours, oa.original_ot_hours)::numeric
    ), 0)::numeric(8,2) as total_ot_hours,
    NULL::uuid as ot_structure_id
  FROM public.employees e
  LEFT JOIN public.departments d ON e.department_id = d.id
  INNER JOIN public.ot_approvals oa ON oa.employee_id = e.id 
    AND oa.attendance_date BETWEEN p_period_start AND p_period_end
    AND oa.tenant_id = p_tenant_id
  WHERE e.tenant_id = p_tenant_id
    AND e.is_active = true
    AND oa.approval_status = 'approved'
  GROUP BY e.id, e.name, e.employee_code, d.name
  HAVING COALESCE(SUM(COALESCE(oa.corrected_ot_hours, oa.original_ot_hours)), 0) > 0
  ORDER BY e.employee_code;
END;
$$;


-----------------------------------------------------------------------------------------------------------


-- Function to check if employee is OT eligible
CREATE OR REPLACE FUNCTION is_employee_ot_eligible(
  p_employee_id uuid,
  p_tenant_id uuid,
  p_check_date date DEFAULT CURRENT_DATE
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_eligible boolean;
BEGIN
  SELECT is_ot_eligible
  INTO v_eligible
  FROM public.employee_ot_eligibility
  WHERE employee_id = p_employee_id
    AND tenant_id = p_tenant_id
    AND (effective_from IS NULL OR effective_from <= p_check_date)
  ORDER BY effective_from DESC
  LIMIT 1;
  
  -- If no record applies to p_check_date, it might be because the only record 
  -- is in the future. In that case, we should check what the earliest record says.
  IF v_eligible IS NULL THEN
    SELECT is_ot_eligible
    INTO v_eligible
    FROM public.employee_ot_eligibility
    WHERE employee_id = p_employee_id
      AND tenant_id = p_tenant_id
    ORDER BY effective_from ASC
    LIMIT 1;
  END IF;

  -- Default to true if no record exists at all
  RETURN COALESCE(v_eligible, true);
END;
$$;