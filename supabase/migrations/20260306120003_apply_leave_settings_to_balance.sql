/*
  # Apply Leave Settings to Balance
  
  1. Updates ensure_leave_balance to respect the priority logic (opening balance > applicable > default).
  2. Updates auto_ensure_leave_balance_exists similarly.
  3. Creates apply_leave_settings_to_balance to force a re-calc when settings are changed from UI.
*/

-- 1. Update ensure_leave_balance
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
  -- get current user
  v_created_by := auth.uid();
  IF v_created_by IS NULL THEN
    SELECT id INTO v_created_by FROM user_profiles
    WHERE tenant_id = p_tenant_id AND lower(user_role) = 'admin' LIMIT 1;
  END IF;

  -- Get leave type configuration
  SELECT credit_policy_type INTO v_credit_policy_type
  FROM public.leave_types
  WHERE id = p_leave_type_id AND tenant_id = p_tenant_id;

  -- Get effective settings from priority logic
  SELECT * INTO v_settings 
  FROM public.get_employee_leave_settings(p_employee_id, p_year, p_tenant_id)
  WHERE leave_type_id = p_leave_type_id;

  -- Determine initial days based on credit policy and priority
  IF v_settings.priority_source = 'not_applicable' THEN
    v_initial_days := 0;
  ELSIF v_settings.priority_source = 'opening_balance' THEN
    -- Explicit opening balance always wins, even for credit policies
    v_initial_days := v_settings.effective_days;
  ELSE
    -- For applicable/default days:
    -- If it has a credit policy, it accrues over time, so start at 0.
    -- If no credit policy, grant the full amount immediately.
    IF v_credit_policy_type IS NOT NULL AND v_credit_policy_type <> '' THEN
      v_initial_days := 0;
    ELSE
      v_initial_days := v_settings.effective_days;
    END IF;
  END IF;

  -- Insert balance row only if it doesn't exist yet
  IF NOT EXISTS (
    SELECT 1 FROM public.leave_balances
    WHERE employee_id = p_employee_id AND leave_type_id = p_leave_type_id AND year = p_year
  ) THEN
    INSERT INTO public.leave_balances (
      employee_id, leave_type_id, year, total_days, used_days, created_by, tenant_id
    ) VALUES (
      p_employee_id, p_leave_type_id, p_year, v_initial_days, 0, v_created_by, p_tenant_id
    ) ON CONFLICT (employee_id, leave_type_id, year) DO NOTHING;
  END IF;
END;
$function$;


-- 2. Update auto_ensure_leave_balance_exists (same logic, used by credit processor)
CREATE OR REPLACE FUNCTION public.auto_ensure_leave_balance_exists(p_employee_id uuid, p_leave_type_id uuid, p_year integer, p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_admin_user_id uuid;
  v_credit_policy_type text;
  v_initial_days numeric;
  v_settings record;
BEGIN
	SELECT id INTO v_admin_user_id FROM user_profiles
	WHERE tenant_id = p_tenant_id AND lower(user_role) = 'admin' LIMIT 1;

    SELECT credit_policy_type INTO v_credit_policy_type
    FROM public.leave_types WHERE id = p_leave_type_id AND tenant_id = p_tenant_id;

    SELECT * INTO v_settings 
    FROM public.get_employee_leave_settings(p_employee_id, p_year, p_tenant_id)
    WHERE leave_type_id = p_leave_type_id;

    IF v_settings.priority_source = 'not_applicable' THEN
      v_initial_days := 0;
    ELSIF v_settings.priority_source = 'opening_balance' THEN
      v_initial_days := v_settings.effective_days;
    ELSE
      IF v_credit_policy_type IS NOT NULL AND v_credit_policy_type <> '' THEN
        v_initial_days := 0;
      ELSE
        v_initial_days := v_settings.effective_days;
      END IF;
    END IF;

	INSERT INTO leave_balances (employee_id, leave_type_id, year, total_days, used_days, created_by, tenant_id)
    SELECT p_employee_id, p_leave_type_id, p_year, v_initial_days, 0, v_admin_user_id, p_tenant_id
    WHERE NOT EXISTS (
      SELECT 1 FROM leave_balances
      WHERE employee_id = p_employee_id AND leave_type_id = p_leave_type_id AND year = p_year AND tenant_id = p_tenant_id
    );
END;
$function$;


-- 3. Create function to recalculate and FORCE apply settings to an existing balance (used when saving settings)
CREATE OR REPLACE FUNCTION public.apply_leave_settings_to_balance(p_employee_id uuid, p_year int, p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    rec record;
    v_credit_policy_type text;
    v_new_total numeric;
    v_credits_already_applied numeric;
BEGIN
    -- Loop through all leave types for this employee for the given year
    FOR rec IN 
        SELECT * FROM public.get_employee_leave_settings(p_employee_id, p_year, p_tenant_id)
    LOOP
        SELECT credit_policy_type INTO v_credit_policy_type
        FROM public.leave_types 
        WHERE id = rec.leave_type_id AND tenant_id = p_tenant_id;

        -- Check how many credits have been applied historically by auto_apply_leave_credit
        -- We extract this from the logs so we don't lose credits when resetting the base balance
        SELECT COALESCE(SUM(days_affected), 0) INTO v_credits_already_applied
        FROM leave_processing_logs
        WHERE employee_id = p_employee_id 
          AND leave_type_id = rec.leave_type_id 
          AND tenant_id = p_tenant_id
          AND process_type = 'credit'
          AND period LIKE (p_year::text || '%');

        -- Determine the base total days
        IF rec.priority_source = 'not_applicable' THEN
            v_new_total := 0;
        ELSIF rec.priority_source = 'opening_balance' THEN
             -- Add opening balance + any credits that accrued over the year
            v_new_total := rec.effective_days + v_credits_already_applied;
        ELSE
            IF v_credit_policy_type IS NOT NULL AND v_credit_policy_type <> '' THEN
                -- Starts at 0, plus any credits accrued
                v_new_total := 0 + v_credits_already_applied;
            ELSE
                -- Full amount granted at once
                v_new_total := rec.effective_days;
            END IF;
        END IF;

        -- Update existing balance or do nothing if it doesn't exist yet (will be handled by ensure_balance later)
        UPDATE public.leave_balances
        SET total_days = v_new_total,
            updated_at = now()
        WHERE employee_id = p_employee_id 
          AND leave_type_id = rec.leave_type_id 
          AND year = p_year
          AND tenant_id = p_tenant_id;

    END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_leave_settings_to_balance(uuid, int, uuid) TO authenticated;
