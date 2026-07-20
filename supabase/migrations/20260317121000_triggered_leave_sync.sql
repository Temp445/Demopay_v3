-- 1. Function to sync leave balances for a SINGLE employee
-- This handles initial seeding, carry-forwards, and catch-up accruals
CREATE OR REPLACE FUNCTION public.sync_leave_balances(
  p_employee_id uuid,
  p_year integer,
  p_tenant_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_user_id uuid;
  v_leave_type_id uuid;
  v_leave_type_name text;
  v_current_month int;
  v_m int;
  v_settings record;
  v_credit_policy_type text;
  v_fixed_credit_frequency text;
  v_base_days numeric;
  v_logged_credits numeric;
  v_logged_carried numeric;
BEGIN

  SELECT id INTO v_admin_user_id FROM user_profiles
	WHERE tenant_id = p_tenant_id AND lower(user_role) = 'admin' LIMIT 1;

  -- Determine how far to catch up credits based on the year
  IF p_year < EXTRACT(YEAR FROM CURRENT_DATE) THEN
    v_current_month := 12;
  ELSIF p_year = EXTRACT(YEAR FROM CURRENT_DATE) THEN
    v_current_month := EXTRACT(MONTH FROM CURRENT_DATE);
  ELSE
    v_current_month := 0; -- Future years only get year-start credit (if any)
  END IF;

  -- Loop through active leave types for the tenant
  FOR v_leave_type_id, v_leave_type_name IN 
    SELECT id, name FROM public.leave_types 
    WHERE tenant_id = p_tenant_id AND is_active = true
  LOOP
    -- 1. Get CURRENT settings for this employee/year (Opening Balance, Applicability, etc.)
    SELECT * INTO v_settings 
    FROM public.get_employee_leave_settings(p_employee_id, p_year, p_tenant_id)
    WHERE leave_type_id = v_leave_type_id;

    -- 2. Get leave type policy
    SELECT credit_policy_type, fixed_credit_frequency 
    INTO v_credit_policy_type, v_fixed_credit_frequency
    FROM public.leave_types WHERE id = v_leave_type_id;

    -- 3. Calculate "Correct Base" (preserving Credit Policy logic)
    IF v_settings.priority_source = 'not_applicable' THEN
        v_base_days := 0;
        
        -- Skip further processing for this leave type
        CONTINUE;
    ELSIF v_settings.priority_source = 'opening_balance' THEN
        v_base_days := v_settings.effective_days;
    ELSE
        -- For 'applicable_days' or 'master_default':
        -- If it has a credit policy, base starts at 0 (credits added later)
        IF v_credit_policy_type IS NOT NULL AND v_credit_policy_type <> '' THEN
            v_base_days := 0;
        ELSE
            v_base_days := v_settings.effective_days;
        END IF;
    END IF;

    /*
    -- 4. Re-calculate Total Days from Logs to preserve historically processed amounts
    -- This handles credits and carry-forwards already recorded
    SELECT COALESCE(SUM(days_affected), 0) INTO v_logged_credits
    FROM public.leave_processing_logs
    WHERE employee_id = p_employee_id AND leave_type_id = v_leave_type_id AND tenant_id = p_tenant_id
      AND process_type = 'credit' AND period LIKE (p_year::text || '%');

    SELECT COALESCE(SUM(days_affected), 0) INTO v_logged_carried
    FROM public.leave_processing_logs
    WHERE employee_id = p_employee_id AND leave_type_id = v_leave_type_id AND tenant_id = p_tenant_id
      AND process_type = 'carry_forward' AND period LIKE ('%->' || p_year::text);

    -- 5. UPSERT the refreshed balance row
    -- Note: We don't touch 'used_days' here as they are managed by leave requests
    INSERT INTO public.leave_balances (employee_id, leave_type_id, year, total_days, used_days, created_by, tenant_id)
    VALUES (p_employee_id, v_leave_type_id, p_year, v_base_days + v_logged_credits + v_logged_carried, 0, v_admin_user_id, p_tenant_id)
    ON CONFLICT (employee_id, leave_type_id, year) 
    DO UPDATE SET 
        total_days = v_base_days + v_logged_credits + v_logged_carried,
        updated_at = now();
    */
    
    -- 6. Now run missing catch-up logic (improves on step 4 if any months weren't processed yet)
    
    -- A. Run Carry Forward (from prev year to current)
    IF p_year > 2024 THEN
       PERFORM public.auto_apply_carry_forward(p_employee_id, v_leave_type_id, p_year - 1, p_year, p_tenant_id);
    END IF;

    -- B. Run catch-up credits (Jan to determined Month) - MATCHING PREVIOUS FRONTEND LOGIC
    IF v_credit_policy_type = 'fixed' AND v_fixed_credit_frequency = 'yearly' THEN
        -- Yearly: credit once per year (month=0)
        PERFORM public.auto_apply_leave_credit(p_employee_id, v_leave_type_id, p_year, 0, p_tenant_id);
    ELSIF v_credit_policy_type = 'fixed' OR v_credit_policy_type = 'earned' THEN
        -- Monthly/Earned: loop every month Jan→now to catch missed past months
        IF v_current_month > 0 THEN
          FOR v_m IN 1..v_current_month LOOP
             PERFORM public.auto_apply_leave_credit(p_employee_id, v_leave_type_id, p_year, v_m, p_tenant_id);
          END LOOP;
        END IF;
    END IF;

  END LOOP;
END;
$$;

-- 2. Function to sync leave balances for ALL employees (or a specific department)
-- Useful for Reports and Payroll Processing
CREATE OR REPLACE FUNCTION public.sync_all_leave_balances(
  p_year integer,
  p_tenant_id uuid,
  p_department_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_emp_id uuid;
BEGIN
  FOR v_emp_id IN 
    SELECT id FROM public.employees 
    WHERE tenant_id = p_tenant_id 
      AND status = 'Active'
      AND (p_department_id IS NULL OR department_id = p_department_id)
  LOOP
    PERFORM public.sync_leave_balances(v_emp_id, p_year, p_tenant_id);
  END LOOP;
END;
$$;
