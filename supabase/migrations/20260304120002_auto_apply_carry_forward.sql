/*
  # Auto Apply Leave Carry Forward RPC

  Idempotent function to carry forward (or expire) leave balance from one year to the next.

  Logic:
  - carry_forward: carry min(unused, max_limit) days → add to new year balance
  - elapsed: do nothing (balance stays at 0 for new year, prior year marked as elapsed)

  Returns: days carried forward (0 if already run or policy=elapsed)
*/

CREATE OR REPLACE FUNCTION auto_apply_carry_forward(
  p_employee_id   uuid,
  p_leave_type_id uuid,
  p_from_year     int,
  p_to_year       int,
  p_tenant_id     uuid
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_leave_type        leave_types%ROWTYPE;
  v_period            text;
  v_already_processed boolean := false;
  v_prior_balance     leave_balances%ROWTYPE;
  v_unused_days       numeric := 0;
  v_carry_days        numeric := 0;
BEGIN
  -- Load leave type settings
  SELECT * INTO v_leave_type
  FROM leave_types
  WHERE id = p_leave_type_id AND tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  v_period := p_from_year::text || '->' || p_to_year::text;

  -- Idempotency check
  SELECT EXISTS (
    SELECT 1 FROM leave_processing_logs
    WHERE employee_id   = p_employee_id
      AND leave_type_id = p_leave_type_id
      AND tenant_id     = p_tenant_id
      AND process_type  = 'carry_forward'
      AND period        = v_period
  ) INTO v_already_processed;

  IF v_already_processed THEN
    RETURN 0;
  END IF;

  -- Get prior year balance
  SELECT * INTO v_prior_balance
  FROM leave_balances
  WHERE employee_id   = p_employee_id
    AND leave_type_id = p_leave_type_id
    AND tenant_id     = p_tenant_id
    AND year          = p_from_year;

  IF NOT FOUND THEN
    -- No prior balance to carry forward; log as 0
    INSERT INTO leave_processing_logs
      (tenant_id, process_type, employee_id, leave_type_id, period, days_affected, notes)
    VALUES
      (p_tenant_id, 'carry_forward', p_employee_id, p_leave_type_id, v_period, 0,
       'No prior year balance found');
    RETURN 0;
  END IF;

  v_unused_days := GREATEST(0, COALESCE(v_prior_balance.total_days, 0) - COALESCE(v_prior_balance.used_days, 0));

  IF v_leave_type.carry_forward_type = 'carry_forward' AND v_unused_days > 0 THEN
    -- Respect max limit (0 means no limit)
    IF COALESCE(v_leave_type.carry_forward_max_limit, 0) > 0 THEN
      v_carry_days := LEAST(v_unused_days, v_leave_type.carry_forward_max_limit);
    ELSE
      v_carry_days := v_unused_days;
    END IF;

    -- Ensure new year balance row exists
    PERFORM auto_ensure_leave_balance_exists(p_employee_id, p_leave_type_id, p_to_year, p_tenant_id);

    -- Add carried days to new year
    UPDATE leave_balances
    SET total_days = total_days + v_carry_days,
        updated_at = now()
    WHERE employee_id   = p_employee_id
      AND leave_type_id = p_leave_type_id
      AND tenant_id     = p_tenant_id
      AND year          = p_to_year;

  ELSE
    -- elapsed: nothing to carry, v_carry_days stays 0
    v_carry_days := 0;
  END IF;

  -- Log the processing run
  INSERT INTO leave_processing_logs
    (tenant_id, process_type, employee_id, leave_type_id, period, days_affected, notes)
  VALUES
    (p_tenant_id, 'carry_forward', p_employee_id, p_leave_type_id, v_period, v_carry_days,
     v_leave_type.carry_forward_type || ': ' || v_unused_days || ' unused days → ' || v_carry_days || ' carried');

  RETURN v_carry_days;
END;
$$;

GRANT EXECUTE ON FUNCTION auto_apply_carry_forward(uuid, uuid, int, int, uuid) TO authenticated;

COMMENT ON FUNCTION auto_apply_carry_forward IS 'Idempotent carry-forward processor. Call when opening a new year balance. Returns days carried.';
