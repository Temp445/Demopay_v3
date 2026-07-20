/*
  # Leave Encashment RPC

  Calculates and applies leave encashment for an employee+leave_type.

  Logic:
    encashable = min(max(0, remaining - encashment_min_limit), encashment_max_limit)

  Modes:
  - preview=true  → returns encashable_days WITHOUT touching balance
  - preview=false → deducts from balance and logs the run (idempotent per period)

  Returns: encashable_days (numeric)
*/

CREATE OR REPLACE FUNCTION apply_leave_encashment(
  p_employee_id   uuid,
  p_leave_type_id uuid,
  p_year          int,
  p_month         int,    -- 0 for yearly
  p_tenant_id     uuid,
  p_preview       boolean DEFAULT true
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_leave_type      leave_types%ROWTYPE;
  v_balance         leave_balances%ROWTYPE;
  v_period          text;
  v_remaining       numeric := 0;
  v_encashable      numeric := 0;
  v_already_run     boolean := false;
BEGIN
  -- Load leave type
  SELECT * INTO v_leave_type
  FROM leave_types
  WHERE id = p_leave_type_id AND tenant_id = p_tenant_id;

  IF NOT FOUND OR NOT COALESCE(v_leave_type.encashment_applicable, false) THEN
    RETURN 0;
  END IF;

  -- Determine period key
  IF p_month = 0 OR p_month IS NULL THEN
    v_period := p_year::text;
    -- Check frequency match
    IF v_leave_type.encashment_frequency = 'monthly' THEN
      RETURN 0; -- Yearly call on monthly policy makes no sense
    END IF;
  ELSE
    v_period := p_year::text || '-' || LPAD(p_month::text, 2, '0');
    IF v_leave_type.encashment_frequency = 'yearly' THEN
      RETURN 0; -- Monthly call on yearly policy makes no sense
    END IF;
  END IF;

  -- Get current balance
  SELECT * INTO v_balance
  FROM leave_balances
  WHERE employee_id   = p_employee_id
    AND leave_type_id = p_leave_type_id
    AND tenant_id     = p_tenant_id
    AND year          = p_year;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  v_remaining := GREATEST(0, COALESCE(v_balance.total_days, 0) - COALESCE(v_balance.used_days, 0));

  -- Calculate encashable days
  -- Must have more than min_limit before any encashment is allowed
  IF v_remaining <= COALESCE(v_leave_type.encashment_min_limit, 0) THEN
    RETURN 0;
  END IF;

  v_encashable := v_remaining - COALESCE(v_leave_type.encashment_min_limit, 0);

  -- Cap at max_limit (0 = no cap)
  IF COALESCE(v_leave_type.encashment_max_limit, 0) > 0 THEN
    v_encashable := LEAST(v_encashable, v_leave_type.encashment_max_limit);
  END IF;

  -- Preview mode: just return the number
  IF p_preview THEN
    RETURN v_encashable;
  END IF;

  -- Idempotency check for actual processing
  SELECT EXISTS (
    SELECT 1 FROM leave_processing_logs
    WHERE employee_id   = p_employee_id
      AND leave_type_id = p_leave_type_id
      AND tenant_id     = p_tenant_id
      AND process_type  = 'encashment'
      AND period        = v_period
  ) INTO v_already_run;

  IF v_already_run THEN
    RETURN 0; -- Already encashed for this period
  END IF;

  -- Apply: deduct from total_days (encashed days reduce the balance)
  UPDATE leave_balances
  SET total_days = total_days - v_encashable,
      updated_at = now()
  WHERE employee_id   = p_employee_id
    AND leave_type_id = p_leave_type_id
    AND tenant_id     = p_tenant_id
    AND year          = p_year;

  -- Log
  INSERT INTO leave_processing_logs
    (tenant_id, process_type, employee_id, leave_type_id, period, days_affected, notes)
  VALUES
    (p_tenant_id, 'encashment', p_employee_id, p_leave_type_id, v_period, v_encashable,
     'Encashed: remaining=' || v_remaining || ', min_limit=' || COALESCE(v_leave_type.encashment_min_limit, 0)
     || ', max_limit=' || COALESCE(v_leave_type.encashment_max_limit, 0));

  RETURN v_encashable;
END;
$$;

GRANT EXECUTE ON FUNCTION apply_leave_encashment(uuid, uuid, int, int, uuid, boolean) TO authenticated;

COMMENT ON FUNCTION apply_leave_encashment IS 'Leave encashment: preview=true returns encashable days without touching balance; preview=false deducts and logs.';
