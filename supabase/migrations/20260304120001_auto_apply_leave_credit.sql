/*
  # Auto Apply Leave Credit RPC

  Idempotent function that credits leave balance for an employee+leave_type for a given period.
  - Fixed/Yearly: credits `default_days` once per year
  - Fixed/Monthly: credits `default_days / 12` once per month  
  - Earned: credits based on `floor(worked_days / earned_days_to_work) * earned_days_credited`

  Returns: days_credited (0 if already run for this period)
*/

CREATE OR REPLACE FUNCTION auto_apply_leave_credit(
  p_employee_id   uuid,
  p_leave_type_id uuid,
  p_year          int,
  p_month         int,   -- pass 0 for yearly processing
  p_tenant_id     uuid
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_leave_type        leave_types%ROWTYPE;
  v_period            text;
  v_days_to_credit    numeric := 0;
  v_already_processed boolean := false;
  v_worked_days       int := 0;
  v_balance_id        uuid;
  v_current_total     numeric := 0;
BEGIN
  -- Load leave type settings
  SELECT * INTO v_leave_type
  FROM leave_types
  WHERE id = p_leave_type_id AND tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Determine period key and whether this period matches the policy frequency
  IF p_month = 0 OR p_month IS NULL THEN
    -- Yearly processing
    v_period := p_year::text;
    -- Only process if policy is yearly or if explicitly running yearly
    IF v_leave_type.credit_policy_type = 'fixed' AND v_leave_type.fixed_credit_frequency = 'monthly' THEN
      RETURN 0; -- Don't run yearly for monthly policies
    END IF;
  ELSE
    -- Monthly processing
    v_period := p_year::text || '-' || LPAD(p_month::text, 2, '0');
    -- Only process if policy is monthly
    IF v_leave_type.credit_policy_type = 'fixed' AND v_leave_type.fixed_credit_frequency = 'yearly' THEN
      RETURN 0; -- Don't run monthly for yearly policies
    END IF;
  END IF;

  -- Idempotency check: skip if already processed for this period
  SELECT EXISTS (
    SELECT 1 FROM leave_processing_logs
    WHERE employee_id    = p_employee_id
      AND leave_type_id  = p_leave_type_id
      AND tenant_id      = p_tenant_id
      AND process_type   = 'credit'
      AND period         = v_period
  ) INTO v_already_processed;

  IF v_already_processed THEN
    RETURN 0;
  END IF;

  -- Calculate days to credit based on policy
  IF v_leave_type.credit_policy_type = 'fixed' THEN
    IF v_leave_type.fixed_credit_frequency = 'yearly' THEN
      v_days_to_credit := COALESCE(v_leave_type.default_days, 0);
    ELSE
      -- Monthly: spread annual days across 12 months
      v_days_to_credit := ROUND(COALESCE(v_leave_type.default_days, 0) / 12.0, 2);
    END IF;

  ELSIF v_leave_type.credit_policy_type = 'earned' THEN
    -- Count working days from attendance for the period
    IF p_month > 0 THEN
      SELECT COUNT(*) INTO v_worked_days
      FROM attendance
      WHERE employee_id = p_employee_id
        AND tenant_id   = p_tenant_id
        AND EXTRACT(YEAR  FROM date) = p_year
        AND EXTRACT(MONTH FROM date) = p_month
        AND status IN ('Present', 'Half Day');
    ELSE
      SELECT COUNT(*) INTO v_worked_days
      FROM attendance
      WHERE employee_id = p_employee_id
        AND tenant_id   = p_tenant_id
        AND EXTRACT(YEAR FROM date) = p_year
        AND status IN ('Present', 'Half Day');
    END IF;

    IF COALESCE(v_leave_type.earned_days_to_work, 0) > 0 THEN
      v_days_to_credit := FLOOR(v_worked_days / v_leave_type.earned_days_to_work)
                          * COALESCE(v_leave_type.earned_days_credited, 0);
    END IF;

    -- Add initial credit for earned leaves (only on first credit ever for this employee+type)
    IF v_leave_type.earned_initial_credit > 0 THEN
      IF NOT EXISTS (
        SELECT 1 FROM leave_processing_logs
        WHERE employee_id   = p_employee_id
          AND leave_type_id = p_leave_type_id
          AND tenant_id     = p_tenant_id
          AND process_type  = 'credit'
      ) THEN
        v_days_to_credit := v_days_to_credit + v_leave_type.earned_initial_credit;
      END IF;
    END IF;
  END IF;

  IF v_days_to_credit <= 0 THEN
    RETURN 0;
  END IF;

  -- Ensure balance row exists for the year
  PERFORM auto_ensure_leave_balance_exists(p_employee_id, p_leave_type_id, p_year, p_tenant_id);

  -- Credit the balance
  UPDATE leave_balances
  SET total_days = total_days + v_days_to_credit,
      updated_at = now()
  WHERE employee_id   = p_employee_id
    AND leave_type_id = p_leave_type_id
    AND tenant_id     = p_tenant_id
    AND year          = p_year;

  -- Log the processing run
  INSERT INTO leave_processing_logs
    (tenant_id, process_type, employee_id, leave_type_id, period, days_affected, notes)
  VALUES
    (p_tenant_id, 'credit', p_employee_id, p_leave_type_id, v_period, v_days_to_credit,
     v_leave_type.credit_policy_type || '/' || COALESCE(v_leave_type.fixed_credit_frequency, 'earned'));

  RETURN v_days_to_credit;
END;
$$;

-- Helper to ensure balance row exists (safe upsert without the RPC dependency)
CREATE OR REPLACE FUNCTION public.auto_ensure_leave_balance_exists(p_employee_id uuid, p_leave_type_id uuid, p_year integer, p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE v_admin_user_id uuid;
BEGIN

	-- Get admin user_id for the tenant
	SELECT id
	INTO v_admin_user_id
	FROM user_profiles
	WHERE tenant_id = p_tenant_id AND lower(user_role) = 'admin'
	LIMIT 1;

	INSERT INTO leave_balances (employee_id, leave_type_id, year, total_days, used_days, created_by, tenant_id)
		SELECT p_employee_id, p_leave_type_id, p_year, 0, 0, v_admin_user_id, p_tenant_id
		WHERE NOT EXISTS (
		SELECT 1 FROM leave_balances
		WHERE employee_id   = p_employee_id
			AND leave_type_id = p_leave_type_id
			AND year          = p_year
			AND tenant_id     = p_tenant_id
		);
END;
$function$;;

GRANT EXECUTE ON FUNCTION auto_apply_leave_credit(uuid, uuid, int, int, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION auto_ensure_leave_balance_exists(uuid, uuid, int, uuid) TO authenticated;

COMMENT ON FUNCTION auto_apply_leave_credit IS 'Idempotent leave credit processor. Call on balance load. Returns days credited (0 if already processed).';
