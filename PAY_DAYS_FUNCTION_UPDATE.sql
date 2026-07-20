/*
  # Update upsert_common_salary_structure_assignment Function

  IMPORTANT: This migration needs to be applied to your Supabase database AFTER the PAY_DAYS_MIGRATION.sql

  Instructions:
  1. First apply PAY_DAYS_MIGRATION.sql
  2. Then apply this migration
  3. Go to your Supabase Dashboard > SQL Editor
  4. Copy and paste this SQL script
  5. Execute the script

  Purpose:
  - Updates the upsert_common_salary_structure_assignment function to include PAY Days parameters
  - Allows saving pay_days_type and custom_pay_days along with component values
*/

-- Drop the existing function first
DROP FUNCTION IF EXISTS upsert_common_salary_structure_assignment(uuid, uuid, jsonb);

-- Create the updated function with PAY Days parameters
CREATE OR REPLACE FUNCTION upsert_common_salary_structure_assignment(
  p_tenant_id uuid,
  p_salary_structure_id uuid,
  p_component_values jsonb,
  p_pay_days_type text DEFAULT 'calendar_days',
  p_custom_pay_days numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing_assignment record;
  v_result jsonb;
BEGIN
  -- Validate pay_days_type
  IF p_pay_days_type NOT IN ('calendar_days', 'custom') THEN
    RAISE EXCEPTION 'Invalid pay_days_type. Must be calendar_days or custom';
  END IF;

  -- Validate custom_pay_days when type is custom
  IF p_pay_days_type = 'custom' AND (p_custom_pay_days IS NULL OR p_custom_pay_days <= 0) THEN
    RAISE EXCEPTION 'custom_pay_days must be a positive number when pay_days_type is custom';
  END IF;

  -- Check if structure-level assignment already exists (where employee_id IS NULL)
  SELECT * INTO v_existing_assignment
  FROM employee_salary_structure_assignments
  WHERE tenant_id = p_tenant_id
    AND salary_structure_id = p_salary_structure_id
    AND employee_id IS NULL;

  -- If exists, update it
  IF FOUND THEN
    UPDATE employee_salary_structure_assignments
    SET
      individual_component_values = p_component_values,
      pay_days_type = p_pay_days_type,
      custom_pay_days = CASE
        WHEN p_pay_days_type = 'custom' THEN p_custom_pay_days
        ELSE NULL
      END,
      updated_at = now()
    WHERE tenant_id = p_tenant_id
      AND salary_structure_id = p_salary_structure_id
      AND employee_id IS NULL;

    v_result := jsonb_build_object(
      'success', true,
      'action', 'updated',
      'structure_id', p_salary_structure_id
    );
  ELSE
    -- Create new structure-level assignment
    INSERT INTO employee_salary_structure_assignments (
      tenant_id,
      salary_structure_id,
      employee_id,
      individual_component_values,
      pay_days_type,
      custom_pay_days
    ) VALUES (
      p_tenant_id,
      p_salary_structure_id,
      NULL, -- Critical: NULL for structure-level settings
      p_component_values,
      p_pay_days_type,
      CASE
        WHEN p_pay_days_type = 'custom' THEN p_custom_pay_days
        ELSE NULL
      END
    );

    v_result := jsonb_build_object(
      'success', true,
      'action', 'created',
      'structure_id', p_salary_structure_id
    );
  END IF;

  RETURN v_result;
END;
$$;

-- Add comment to the function
COMMENT ON FUNCTION upsert_common_salary_structure_assignment IS
'Upsert structure-level settings including common component values and PAY Days configuration.
Used for storing defaults that apply to all employees in the structure.';
