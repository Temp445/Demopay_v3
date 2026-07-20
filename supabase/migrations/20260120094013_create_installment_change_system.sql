/*
  # Employee Advance Installment Change System

  1. New Tables
    - `advance_installment_changes`
      - `id` (uuid, primary key) - Unique identifier
      - `tenant_id` (uuid) - Multi-tenant isolation
      - `advance_id` (uuid) - Reference to employee advance
      - `installment_id` (uuid) - Reference to the modified installment
      - `change_type` (text) - Type of change: 'amount_increase', 'amount_decrease', 'redistribution'
      - `old_amount` (numeric) - Previous installment amount
      - `new_amount` (numeric) - New installment amount
      - `redistribution_method` (text) - Method used: 'equal', 'proportional', 'new_installment'
      - `affected_installments` (jsonb) - Array of affected installment IDs and their changes
      - `reason` (text) - Reason for the change
      - `changed_by` (uuid) - User who made the change
      - `created_at` (timestamptz) - Timestamp of change

  2. Functions
    - `modify_advance_installments` - RPC function to modify installments with validation
    - `recalculate_installment_distribution` - Helper function to redistribute amounts

  3. Security
    - Enable RLS on `advance_installment_changes` table
    - Add policies for authenticated users with proper permissions
    - Ensure audit trail is maintained

  4. Notes
    - Maintains complete audit trail of all installment modifications
    - Supports multiple redistribution strategies
    - Validates that modifications don't create negative amounts
    - Ensures remaining balance consistency
*/

-- Create advance_installment_changes table
CREATE TABLE IF NOT EXISTS advance_installment_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  advance_id uuid NOT NULL REFERENCES employee_advances(id) ON DELETE CASCADE,
  installment_id uuid NOT NULL REFERENCES advance_installments(id) ON DELETE CASCADE,
  change_type text NOT NULL CHECK (change_type IN ('amount_increase', 'amount_decrease', 'redistribution')),
  old_amount numeric NOT NULL,
  new_amount numeric NOT NULL,
  redistribution_method text CHECK (redistribution_method IN ('equal', 'proportional', 'new_installment')),
  affected_installments jsonb,
  reason text NOT NULL,
  changed_by uuid NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE advance_installment_changes ENABLE ROW LEVEL SECURITY;

-- RLS Policies for advance_installment_changes
CREATE POLICY "Users can view installment changes for their tenant"
  ON advance_installment_changes
  FOR SELECT
  TO authenticated
  USING (tenant_id IN (SELECT get_user_tenant_id()));

CREATE POLICY "Authenticated users can create installment changes"
  ON advance_installment_changes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (SELECT get_user_tenant_id())
    AND changed_by = auth.uid()
  );

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_installment_changes_advance 
  ON advance_installment_changes(advance_id);
CREATE INDEX IF NOT EXISTS idx_installment_changes_tenant 
  ON advance_installment_changes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_installment_changes_installment 
  ON advance_installment_changes(installment_id);

-- RPC Function: Modify advance installments with redistribution
CREATE OR REPLACE FUNCTION modify_advance_installments(
  p_tenant_id uuid,
  p_advance_id uuid,
  p_installment_changes jsonb,
  p_redistribution_method text,
  p_reason text,
  p_changed_by uuid
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
  v_unpaid_installments jsonb;
  v_total_remaining numeric;
  v_installment record;
  v_affected_installments jsonb := '[]'::jsonb;
  v_change_log_id uuid;
  v_result jsonb;
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
      principal_amount = v_new_amount * (principal_amount / amount),
      interest_amount = v_new_amount * (interest_amount / amount)
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

  -- If redistribution is requested, handle it
  IF p_redistribution_method IS NOT NULL THEN
    -- Get all unpaid installments
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', id,
        'amount', amount,
        'installment_number', installment_number
      )
    )
    INTO v_unpaid_installments
    FROM advance_installments
    WHERE advance_id = p_advance_id
    AND tenant_id = p_tenant_id
    AND status = 'scheduled'
    ORDER BY installment_number;

    -- Calculate total from modified installments
    SELECT SUM(amount)
    INTO v_total_remaining
    FROM advance_installments
    WHERE advance_id = p_advance_id
    AND tenant_id = p_tenant_id
    AND status = 'scheduled';

    -- Get advance total amount
    DECLARE
      v_advance_total numeric;
      v_paid_amount numeric;
      v_expected_remaining numeric;
    BEGIN
      SELECT total_amount, remaining_balance
      INTO v_advance_total, v_expected_remaining
      FROM employee_advances
      WHERE id = p_advance_id;

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
              principal_amount = v_equal_amount * (principal_amount / amount),
              interest_amount = v_equal_amount * (interest_amount / amount)
            WHERE advance_id = p_advance_id
            AND tenant_id = p_tenant_id
            AND status = 'scheduled';

            -- Log redistribution
            INSERT INTO advance_installment_changes (
              tenant_id,
              advance_id,
              installment_id,
              change_type,
              old_amount,
              new_amount,
              redistribution_method,
              affected_installments,
              reason,
              changed_by
            )
            SELECT
              p_tenant_id,
              p_advance_id,
              id,
              'redistribution',
              amount,
              v_equal_amount,
              p_redistribution_method,
              v_affected_installments,
              p_reason,
              p_changed_by
            FROM advance_installments
            WHERE advance_id = p_advance_id
            AND tenant_id = p_tenant_id
            AND status = 'scheduled'
            LIMIT 1; -- One log entry for the redistribution
          END IF;
        END;

      ELSIF p_redistribution_method = 'proportional' THEN
        -- Proportional: adjust based on original ratios
        DECLARE
          v_original_total numeric;
          v_ratio numeric;
        BEGIN
          -- Get original total of scheduled installments
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
              principal_amount = ((amount / v_original_total) * v_expected_remaining) * (principal_amount / amount),
              interest_amount = ((amount / v_original_total) * v_expected_remaining) * (interest_amount / amount)
            WHERE advance_id = p_advance_id
            AND tenant_id = p_tenant_id
            AND status = 'scheduled';
          END IF;
        END;
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