/*
  # Fix Leave Processing Logs Race Condition

  Problem:
    When two users open the Leave page for the same employee simultaneously,
    both pass the "already processed?" check before either inserts a log row,
    causing double (or multiple) credit: 40 → 80 → 120 etc.

  Fix:
    Add a UNIQUE constraint on (tenant_id, process_type, period, employee_id, leave_type_id)
    so the second concurrent INSERT fails and the RPC safely returns 0.

    Each RPC now uses INSERT...ON CONFLICT DO NOTHING to record the log entry FIRST
    (as a lock/guard), then does the balance update only if the insert succeeded.
*/

-- Add unique constraint to prevent duplicate processing log entries
ALTER TABLE leave_processing_logs
  DROP CONSTRAINT IF EXISTS uq_leave_processing_logs_period;

ALTER TABLE leave_processing_logs
  ADD CONSTRAINT uq_leave_processing_logs_period
  UNIQUE (tenant_id, process_type, period, employee_id, leave_type_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- Re-create auto_apply_leave_credit with atomic insert-first approach
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION auto_apply_leave_credit(
  p_employee_id   uuid,
  p_leave_type_id uuid,
  p_year          int,
  p_month         int,
  p_tenant_id     uuid
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_leave_type      leave_types%ROWTYPE;
  v_period          text;
  v_days_to_credit  numeric := 0;
  v_worked_days     int := 0;
  v_log_inserted    int;
BEGIN
  -- Load leave type settings
  SELECT * INTO v_leave_type
  FROM leave_types
  WHERE id = p_leave_type_id AND tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Determine period key and frequency match
  IF p_month IS NULL OR p_month = 0 THEN
    v_period := p_year::text;
    IF v_leave_type.credit_policy_type = 'fixed' AND v_leave_type.fixed_credit_frequency = 'monthly' THEN
      RETURN 0;
    END IF;
  ELSE
    v_period := p_year::text || '-' || LPAD(p_month::text, 2, '0');
    IF v_leave_type.credit_policy_type = 'fixed' AND v_leave_type.fixed_credit_frequency = 'yearly' THEN
      RETURN 0;
    END IF;
  END IF;

  -- ── ATOMIC LOCK: try to insert the log row first ──────────────────────────
  -- If another session already inserted it (race condition), ON CONFLICT silently
  -- does nothing and v_log_inserted = 0, so we return 0 immediately.
  INSERT INTO leave_processing_logs
    (tenant_id, process_type, employee_id, leave_type_id, period, days_affected, notes)
  VALUES
    (p_tenant_id, 'credit', p_employee_id, p_leave_type_id, v_period, 0, 'pending')
  ON CONFLICT (tenant_id, process_type, period, employee_id, leave_type_id)
  DO NOTHING;

  GET DIAGNOSTICS v_log_inserted = ROW_COUNT;

  -- Another session already claimed this period — skip
  IF v_log_inserted = 0 THEN
    RETURN 0;
  END IF;

  -- ── Calculate days to credit ──────────────────────────────────────────────
  IF v_leave_type.credit_policy_type = 'fixed' THEN
    IF v_leave_type.fixed_credit_frequency = 'yearly' THEN
      v_days_to_credit := COALESCE(v_leave_type.default_days, 0);
    ELSE
      v_days_to_credit := ROUND(COALESCE(v_leave_type.default_days, 0) / 12.0, 2);
    END IF;

  ELSIF v_leave_type.credit_policy_type = 'earned' THEN
    IF p_month > 0 THEN
      SELECT COUNT(*) INTO v_worked_days
      FROM attendance_logs
      WHERE employee_id = p_employee_id
        AND tenant_id   = p_tenant_id
        AND EXTRACT(YEAR  FROM date) = p_year
        AND EXTRACT(MONTH FROM date) = p_month
        AND status IN ('Present', 'Half Day');
    ELSE
      SELECT COUNT(*) INTO v_worked_days
      FROM attendance_logs
      WHERE employee_id = p_employee_id
        AND tenant_id   = p_tenant_id
        AND EXTRACT(YEAR FROM date) = p_year
        AND status IN ('Present', 'Half Day');
    END IF;

    IF COALESCE(v_leave_type.earned_days_to_work, 0) > 0 THEN
      v_days_to_credit := FLOOR(v_worked_days / v_leave_type.earned_days_to_work)
                          * COALESCE(v_leave_type.earned_days_credited, 0);
    END IF;

    -- Initial credit for earned leave (first time ever)
    IF v_leave_type.earned_initial_credit > 0 THEN
      -- Check how many prior logs exist EXCLUDING the one we just inserted (days_affected=0)
      IF (SELECT COUNT(*) FROM leave_processing_logs
          WHERE employee_id   = p_employee_id
            AND leave_type_id = p_leave_type_id
            AND tenant_id     = p_tenant_id
            AND process_type  = 'credit'
            AND days_affected > 0) = 0 THEN
        v_days_to_credit := v_days_to_credit + v_leave_type.earned_initial_credit;
      END IF;
    END IF;
  END IF;

  -- If nothing to credit, clean up the placeholder log row and exit
  IF v_days_to_credit <= 0 THEN
    DELETE FROM leave_processing_logs
    WHERE tenant_id     = p_tenant_id
      AND process_type  = 'credit'
      AND period        = v_period
      AND employee_id   = p_employee_id
      AND leave_type_id = p_leave_type_id
      AND notes         = 'pending';
    RETURN 0;
  END IF;

  -- Ensure balance row exists
  PERFORM auto_ensure_leave_balance_exists(p_employee_id, p_leave_type_id, p_year, p_tenant_id);

  -- Credit the balance
  UPDATE leave_balances
  SET total_days = total_days + v_days_to_credit,
      updated_at = now()
  WHERE employee_id   = p_employee_id
    AND leave_type_id = p_leave_type_id
    AND tenant_id     = p_tenant_id
    AND year          = p_year;

  -- Update the placeholder log row with actual result
  UPDATE leave_processing_logs
  SET days_affected = v_days_to_credit,
      notes         = v_leave_type.credit_policy_type || '/' || COALESCE(v_leave_type.fixed_credit_frequency, 'earned')
  WHERE tenant_id     = p_tenant_id
    AND process_type  = 'credit'
    AND period        = v_period
    AND employee_id   = p_employee_id
    AND leave_type_id = p_leave_type_id;

  RETURN v_days_to_credit;
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- Re-create auto_apply_carry_forward with atomic insert-first approach
-- ─────────────────────────────────────────────────────────────────────────────
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
  v_leave_type    leave_types%ROWTYPE;
  v_period        text;
  v_prior_balance leave_balances%ROWTYPE;
  v_unused_days   numeric := 0;
  v_carry_days    numeric := 0;
  v_log_inserted  int;
BEGIN
  SELECT * INTO v_leave_type
  FROM leave_types
  WHERE id = p_leave_type_id AND tenant_id = p_tenant_id;

  IF NOT FOUND THEN RETURN 0; END IF;

  v_period := p_from_year::text || '->' || p_to_year::text;

  -- Atomic lock
  INSERT INTO leave_processing_logs
    (tenant_id, process_type, employee_id, leave_type_id, period, days_affected, notes)
  VALUES
    (p_tenant_id, 'carry_forward', p_employee_id, p_leave_type_id, v_period, 0, 'pending')
  ON CONFLICT (tenant_id, process_type, period, employee_id, leave_type_id)
  DO NOTHING;

  GET DIAGNOSTICS v_log_inserted = ROW_COUNT;
  IF v_log_inserted = 0 THEN RETURN 0; END IF;

  -- Get prior year balance
  SELECT * INTO v_prior_balance
  FROM leave_balances
  WHERE employee_id   = p_employee_id
    AND leave_type_id = p_leave_type_id
    AND tenant_id     = p_tenant_id
    AND year          = p_from_year;

  IF NOT FOUND THEN
    UPDATE leave_processing_logs SET notes = 'No prior year balance', days_affected = 0
    WHERE tenant_id = p_tenant_id AND process_type = 'carry_forward'
      AND period = v_period AND employee_id = p_employee_id AND leave_type_id = p_leave_type_id;
    RETURN 0;
  END IF;

  v_unused_days := GREATEST(0, COALESCE(v_prior_balance.total_days, 0) - COALESCE(v_prior_balance.used_days, 0));

  IF v_leave_type.carry_forward_type = 'carry_forward' AND v_unused_days > 0 THEN
    IF COALESCE(v_leave_type.carry_forward_max_limit, 0) > 0 THEN
      v_carry_days := LEAST(v_unused_days, v_leave_type.carry_forward_max_limit);
    ELSE
      v_carry_days := v_unused_days;
    END IF;

    PERFORM auto_ensure_leave_balance_exists(p_employee_id, p_leave_type_id, p_to_year, p_tenant_id);

    UPDATE leave_balances
    SET total_days = total_days + v_carry_days, updated_at = now()
    WHERE employee_id = p_employee_id AND leave_type_id = p_leave_type_id
      AND tenant_id = p_tenant_id AND year = p_to_year;
  END IF;

  UPDATE leave_processing_logs
  SET days_affected = v_carry_days,
      notes = v_leave_type.carry_forward_type || ': ' || v_unused_days || ' unused → ' || v_carry_days || ' carried'
  WHERE tenant_id = p_tenant_id AND process_type = 'carry_forward'
    AND period = v_period AND employee_id = p_employee_id AND leave_type_id = p_leave_type_id;

  RETURN v_carry_days;
END;
$$;

GRANT EXECUTE ON FUNCTION auto_apply_leave_credit(uuid, uuid, int, int, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION auto_apply_carry_forward(uuid, uuid, int, int, uuid) TO authenticated;

COMMENT ON TABLE leave_processing_logs IS 'Audit + idempotency lock for leave processing. Unique constraint prevents race-condition double-credits.';
