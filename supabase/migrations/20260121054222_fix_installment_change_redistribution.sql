/*
  # Fix Installment Change System - Add Missing Redistribution Methods
  
  1. Updates
    - Add `p_extension_months` parameter to `modify_advance_installments` function
    - Implement `last_installment` redistribution strategy
    - Implement `new_installment` redistribution strategy (creates new installments)
    - Update constraint to include `last_installment` method
  
  2. Changes
    - Extends existing RPC function with full redistribution support
    - Allows creating new installments beyond the original schedule
    - Maintains backward compatibility with existing calls
*/

-- Update the constraint to include last_installment
ALTER TABLE advance_installment_changes 
  DROP CONSTRAINT IF EXISTS advance_installment_changes_redistribution_method_check;

ALTER TABLE advance_installment_changes 
  ADD CONSTRAINT advance_installment_changes_redistribution_method_check 
  CHECK (redistribution_method IN ('equal', 'proportional', 'last_installment', 'new_installment'));

-- Drop and recreate the function with the new parameter and logic
DROP FUNCTION IF EXISTS modify_advance_installments(uuid, uuid, jsonb, text, text, uuid);

CREATE OR REPLACE FUNCTION modify_advance_installments(
  p_tenant_id uuid,
  p_advance_id uuid,
  p_installment_changes jsonb,
  p_redistribution_method text,
  p_extension_months integer DEFAULT 0,
  p_reason text DEFAULT '',
  p_changed_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_change jsonb;
  v_installment_id uuid;
  v_new_amount numeric;
  v_old_amount numeric;
  v_change_type text;
  v_total_remaining numeric;
  v_affected_installments jsonb := '[]'::jsonb;
  v_result jsonb;
  v_expected_remaining numeric;
  v_advance_total numeric;
  v_last_installment record;
  v_new_month text;
  v_amount_per_new_month numeric;
  i integer;
BEGIN
  -- Validate tenant access
  IF p_tenant_id NOT IN (SELECT get_user_tenant_id()) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Validate advance exists and is in valid status
  IF NOT EXISTS (
    SELECT 1 FROM employee_advances
    WHERE id = p_advance_id
    AND tenant_id = p_tenant_id
    AND status IN ('approved', 'active')
  ) THEN
    RAISE EXCEPTION 'Advance not found or not in valid status for modification';
  END IF;

  -- Get advance details
  SELECT total_amount, remaining_balance
  INTO v_advance_total, v_expected_remaining
  FROM employee_advances
  WHERE id = p_advance_id;

  -- Process each installment change
  FOR v_change IN SELECT * FROM jsonb_array_elements(p_installment_changes)
  LOOP
    v_installment_id := (v_change->>'installment_id')::uuid;
    v_new_amount := (v_change->>'new_amount')::numeric;

    -- Get old amount and validate installment
    SELECT amount INTO v_old_amount
    FROM advance_installments
    WHERE id = v_installment_id
    AND advance_id = p_advance_id
    AND tenant_id = p_tenant_id
    AND status = 'scheduled';

    IF v_old_amount IS NULL THEN
      RAISE EXCEPTION 'Installment not found or not in scheduled status';
    END IF;

    -- Validate new amount is positive
    IF v_new_amount <= 0 THEN
      RAISE EXCEPTION 'New amount must be positive';
    END IF;

    -- Determine change type
    IF v_new_amount > v_old_amount THEN
      v_change_type := 'amount_increase';
    ELSIF v_new_amount < v_old_amount THEN
      v_change_type := 'amount_decrease';
    ELSE
      CONTINUE; -- No change, skip
    END IF;

    -- Update the installment
    UPDATE advance_installments
    SET 
      amount = v_new_amount,
      principal_amount = v_new_amount * (principal_amount / NULLIF(amount, 0)),
      interest_amount = v_new_amount * (interest_amount / NULLIF(amount, 0))
    WHERE id = v_installment_id;

    -- Add to affected installments log
    v_affected_installments := v_affected_installments || jsonb_build_object(
      'installment_id', v_installment_id,
      'old_amount', v_old_amount,
      'new_amount', v_new_amount,
      'change_type', v_change_type
    );

    -- Create change log entry
    INSERT INTO advance_installment_changes (
      tenant_id,
      advance_id,
      installment_id,
      change_type,
      old_amount,
      new_amount,
      redistribution_method,
      reason,
      changed_by
    ) VALUES (
      p_tenant_id,
      p_advance_id,
      v_installment_id,
      v_change_type,
      v_old_amount,
      v_new_amount,
      NULL, -- Individual changes don't have redistribution method
      p_reason,
      p_changed_by
    );
  END LOOP;

  -- Calculate remaining balance after manual changes
  SELECT COALESCE(SUM(amount), 0)
  INTO v_total_remaining
  FROM advance_installments
  WHERE advance_id = p_advance_id
  AND tenant_id = p_tenant_id
  AND status = 'scheduled';

  -- Apply redistribution based on method
  IF p_redistribution_method = 'equal' THEN
    -- Equal distribution: divide remaining equally among unpaid installments
    DECLARE
      v_count integer;
      v_equal_amount numeric;
    BEGIN
      SELECT COUNT(*)
      INTO v_count
      FROM advance_installments
      WHERE advance_id = p_advance_id
      AND tenant_id = p_tenant_id
      AND status = 'scheduled';

      IF v_count > 0 THEN
        v_equal_amount := v_expected_remaining / v_count;

        UPDATE advance_installments
        SET 
          amount = v_equal_amount,
          principal_amount = v_equal_amount * (principal_amount / NULLIF(amount, 0)),
          interest_amount = v_equal_amount * (interest_amount / NULLIF(amount, 0))
        WHERE advance_id = p_advance_id
        AND tenant_id = p_tenant_id
        AND status = 'scheduled';
      END IF;
    END;

  ELSIF p_redistribution_method = 'proportional' THEN
    -- Proportional: adjust based on original ratios
    DECLARE
      v_original_total numeric;
    BEGIN
      SELECT SUM(amount)
      INTO v_original_total
      FROM advance_installments
      WHERE advance_id = p_advance_id
      AND tenant_id = p_tenant_id
      AND status = 'scheduled';

      IF v_original_total > 0 THEN
        UPDATE advance_installments
        SET 
          amount = (amount / v_original_total) * v_expected_remaining,
          principal_amount = ((amount / v_original_total) * v_expected_remaining) * (principal_amount / NULLIF(amount, 0)),
          interest_amount = ((amount / v_original_total) * v_expected_remaining) * (interest_amount / NULLIF(amount, 0))
        WHERE advance_id = p_advance_id
        AND tenant_id = p_tenant_id
        AND status = 'scheduled';
      END IF;
    END;

  ELSIF p_redistribution_method = 'last_installment' THEN
    -- Add all difference to the last scheduled installment
    DECLARE
      v_last_installment_id uuid;
      v_difference numeric;
    BEGIN
      -- Get the last scheduled installment
      SELECT id INTO v_last_installment_id
      FROM advance_installments
      WHERE advance_id = p_advance_id
      AND tenant_id = p_tenant_id
      AND status = 'scheduled'
      ORDER BY installment_number DESC
      LIMIT 1;

      IF v_last_installment_id IS NOT NULL THEN
        -- Calculate difference between expected and current total
        v_difference := v_expected_remaining - v_total_remaining;
        
        -- Update the last installment
        UPDATE advance_installments
        SET 
          amount = amount + v_difference,
          principal_amount = (amount + v_difference) * (principal_amount / NULLIF(amount, 0)),
          interest_amount = (amount + v_difference) * (interest_amount / NULLIF(amount, 0))
        WHERE id = v_last_installment_id
        AND amount + v_difference >= 0; -- Ensure non-negative
      END IF;
    END;

  ELSIF p_redistribution_method = 'new_installment' AND p_extension_months > 0 THEN
    -- Create new installments at the end
    DECLARE
      v_difference numeric;
      v_last_due_month text;
      v_last_number integer;
      v_next_month_date date;
    BEGIN
      -- Calculate the difference to distribute
      v_difference := v_expected_remaining - v_total_remaining;
      
      IF v_difference > 0 THEN
        -- Get last installment details
        SELECT due_month, installment_number
        INTO v_last_due_month, v_last_number
        FROM advance_installments
        WHERE advance_id = p_advance_id
        AND tenant_id = p_tenant_id
        ORDER BY installment_number DESC
        LIMIT 1;

        -- Amount per new installment
        v_amount_per_new_month := v_difference / p_extension_months;

        -- Create new installments
        FOR i IN 1..p_extension_months LOOP
          -- Calculate next month
          v_next_month_date := (v_last_due_month || '-01')::date + (i || ' months')::interval;
          v_new_month := to_char(v_next_month_date, 'YYYY-MM');
          
          -- Insert new installment
          INSERT INTO advance_installments (
            tenant_id,
            advance_id,
            installment_number,
            due_month,
            amount,
            principal_amount,
            interest_amount,
            status
          ) VALUES (
            p_tenant_id,
            p_advance_id,
            v_last_number + i,
            v_new_month,
            v_amount_per_new_month,
            v_amount_per_new_month, -- Simplified for new installments
            0, -- No interest on extension
            'scheduled'
          );
        END LOOP;
      END IF;
    END;
  END IF;

  -- Update advance remaining balance
  UPDATE employee_advances
  SET remaining_balance = (
    SELECT COALESCE(SUM(amount), 0)
    FROM advance_installments
    WHERE advance_id = p_advance_id
    AND status IN ('scheduled', 'held')
  )
  WHERE id = p_advance_id;

  -- Return success with summary
  SELECT jsonb_build_object(
    'success', true,
    'affected_count', jsonb_array_length(v_affected_installments),
    'affected_installments', v_affected_installments,
    'redistribution_applied', p_redistribution_method IS NOT NULL
  ) INTO v_result;

  RETURN v_result;
END;
$$;
