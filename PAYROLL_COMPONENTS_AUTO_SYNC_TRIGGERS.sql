/*
  # Payroll Components Auto-Sync Triggers

  ## Overview
  This migration creates database triggers that automatically maintain payroll components
  when shifts and leave types are created or updated. This ensures data consistency
  between operational data (shifts/leave types) and payroll calculation components.

  ## Purpose
  - Auto-create payroll components when shifts are created
  - Auto-update payroll components when shifts are updated
  - Auto-create payroll components when leave types are created
  - Auto-update payroll components when leave types are updated

  ## Tables Affected
  - shifts (trigger source)
  - leave_types (trigger source)
  - payroll_components (trigger target)

  ## Trigger Specifications

  ### Shifts → Payroll Components Mapping
  - component_type: 'earning'
  - component_category: 'calculation'
  - type_selection: 'common'
  - amount_type: 'value'
  - value_set: 'at_executing'
  - is_attendance_linked: true
  - always_treat_as_full_day: false
  - is_active: matches shift.is_active
  - Links back via name pattern: "Shift: {shift_name}"

  ### Leave Types → Payroll Components Mapping
  - component_type: 'earning'
  - component_category: 'calculation'
  - type_selection: 'common'
  - amount_type: 'value'
  - value_set: 'at_executing'
  - is_attendance_linked: true
  - always_treat_as_full_day: false
  - is_active: true (always active)
  - Links back via name pattern: "Leave: {leave_type_name}"

  ## Safety Features
  - Uses SECURITY DEFINER for controlled execution
  - Handles errors gracefully with NULL returns
  - Idempotent operations (safe to run multiple times)
  - Preserves tenant_id for multi-tenant isolation
*/

-- ============================================================
-- FUNCTION: Sync Shift to Payroll Components
-- ============================================================
CREATE OR REPLACE FUNCTION public.sync_shift_to_payroll_component()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_component_name text;
  v_component_id uuid;
  v_tenant_id uuid;
BEGIN
  -- Get tenant_id (may be NULL for INSERT before tenant_id is set)
  v_tenant_id := COALESCE(NEW.tenant_id, OLD.tenant_id);

  -- Generate component name with prefix to identify source
  v_component_name := 'Shift: ' || NEW.name;

  -- For INSERT operations
  IF TG_OP = 'INSERT' THEN
    -- Check if component already exists for this shift
    SELECT id INTO v_component_id
    FROM payroll_components
    WHERE name = v_component_name
      AND (tenant_id = v_tenant_id OR v_tenant_id IS NULL)
      AND statutory_component_id IS NULL;

    -- Only insert if doesn't exist
    IF v_component_id IS NULL THEN
      INSERT INTO payroll_components (
        name,
        description,
        component_type,
        component_category,
        type_selection,
        amount_type,
        value_set,
        is_active,
        eligibility,
        tenant_id,
        statutory_component_id
      ) VALUES (
        v_component_name,
        'Auto-generated component for shift: ' || NEW.name ||
          CASE
            WHEN NEW.description IS NOT NULL THEN ' - ' || NEW.description
            ELSE ''
          END,
        'earning',
        'calculation',
        'common',
        'value',
        null,
        COALESCE(NEW.is_active, true),
        'all',
        v_tenant_id,
        NULL
      );
    END IF;

  -- For UPDATE operations
  ELSIF TG_OP = 'UPDATE' THEN
    -- If name changed, update the component name
    IF NEW.name != OLD.name THEN
      v_component_name := 'Shift: ' || OLD.name;

      UPDATE payroll_components
      SET
        name = 'Shift: ' || NEW.name,
        description = 'Auto-generated component for shift: ' || NEW.name ||
          CASE
            WHEN NEW.description IS NOT NULL THEN ' - ' || NEW.description
            ELSE ''
          END,
        is_active = COALESCE(NEW.is_active, true),
        updated_at = NOW()
      WHERE name = v_component_name
        AND (tenant_id = v_tenant_id OR v_tenant_id IS NULL)
        AND statutory_component_id IS NULL;
    ELSE
      -- Just update description and is_active
      UPDATE payroll_components
      SET
        description = 'Auto-generated component for shift: ' || NEW.name ||
          CASE
            WHEN NEW.description IS NOT NULL THEN ' - ' || NEW.description
            ELSE ''
          END,
        is_active = COALESCE(NEW.is_active, true),
        updated_at = NOW()
      WHERE name = v_component_name
        AND (tenant_id = v_tenant_id OR v_tenant_id IS NULL)
        AND statutory_component_id IS NULL;
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the trigger
    RAISE WARNING 'Error in sync_shift_to_payroll_component: %', SQLERRM;
    RETURN NEW;
END;
$function$;
$$;

-- ============================================================
-- FUNCTION: Sync Leave Type to Payroll Components
-- ============================================================

CREATE OR REPLACE FUNCTION public.sync_leave_type_to_payroll_component()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_component_name text;
  v_component_id uuid;
  v_tenant_id uuid;
BEGIN
  -- Get tenant_id (may be NULL for INSERT before tenant_id is set)
  v_tenant_id := COALESCE(NEW.tenant_id, OLD.tenant_id);

  -- Generate component name with prefix to identify source
  v_component_name := 'Leave: ' || NEW.name;

  -- For INSERT operations
  IF TG_OP = 'INSERT' THEN
    -- Check if component already exists for this leave type
    SELECT id INTO v_component_id
    FROM payroll_components
    WHERE name = v_component_name
      AND (tenant_id = v_tenant_id OR v_tenant_id IS NULL)
      AND statutory_component_id IS NULL;

    -- Only insert if doesn't exist
    IF v_component_id IS NULL THEN
      INSERT INTO payroll_components (
        name,
        description,
        component_type,
        component_category,
        type_selection,
        amount_type,
        value_set,
        is_active,
        eligibility,
        tenant_id,
        statutory_component_id
      ) VALUES (
        v_component_name,
        'Auto-generated component for leave type: ' || NEW.name ||
          CASE
            WHEN NEW.description IS NOT NULL THEN ' - ' || NEW.description
            ELSE ''
          END,
        'earning',
        'calculation',
        'common',
        'value',
        null,
        true,
        'all',
        v_tenant_id,
        NULL
      );
    END IF;

  -- For UPDATE operations
  ELSIF TG_OP = 'UPDATE' THEN
    -- If name changed, update the component name
    IF NEW.name != OLD.name THEN
      v_component_name := 'Leave: ' || OLD.name;

      UPDATE payroll_components
      SET
        name = 'Leave: ' || NEW.name,
        description = 'Auto-generated component for leave type: ' || NEW.name ||
          CASE
            WHEN NEW.description IS NOT NULL THEN ' - ' || NEW.description
            ELSE ''
          END,
        updated_at = NOW()
      WHERE name = v_component_name
        AND (tenant_id = v_tenant_id OR v_tenant_id IS NULL)
        AND statutory_component_id IS NULL;
    ELSE
      -- Just update description
      UPDATE payroll_components
      SET
        description = 'Auto-generated component for leave type: ' || NEW.name ||
          CASE
            WHEN NEW.description IS NOT NULL THEN ' - ' || NEW.description
            ELSE ''
          END,
        updated_at = NOW()
      WHERE name = v_component_name
        AND (tenant_id = v_tenant_id OR v_tenant_id IS NULL)
        AND statutory_component_id IS NULL;
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the trigger
    RAISE WARNING 'Error in sync_leave_type_to_payroll_component: %', SQLERRM;
    RETURN NEW;
END;
$function$;
$$;

-- ============================================================
-- DROP EXISTING TRIGGERS (if they exist)
-- ============================================================
DROP TRIGGER IF EXISTS sync_shift_to_payroll_component_insert ON shifts;
DROP TRIGGER IF EXISTS sync_shift_to_payroll_component_update ON shifts;
DROP TRIGGER IF EXISTS sync_leave_type_to_payroll_component_insert ON leave_types;
DROP TRIGGER IF EXISTS sync_leave_type_to_payroll_component_update ON leave_types;

-- ============================================================
-- CREATE TRIGGERS FOR SHIFTS
-- ============================================================

-- Trigger for INSERT operations on shifts
CREATE TRIGGER sync_shift_to_payroll_component_insert
  AFTER INSERT ON shifts
  FOR EACH ROW
  EXECUTE FUNCTION sync_shift_to_payroll_component();

-- Trigger for UPDATE operations on shifts
CREATE TRIGGER sync_shift_to_payroll_component_update
  AFTER UPDATE ON shifts
  FOR EACH ROW
  WHEN (
    NEW.name IS DISTINCT FROM OLD.name OR
    NEW.description IS DISTINCT FROM OLD.description OR
    NEW.is_active IS DISTINCT FROM OLD.is_active
  )
  EXECUTE FUNCTION sync_shift_to_payroll_component();

-- ============================================================
-- CREATE TRIGGERS FOR LEAVE TYPES
-- ============================================================

-- Trigger for INSERT operations on leave_types
CREATE TRIGGER sync_leave_type_to_payroll_component_insert
  AFTER INSERT ON leave_types
  FOR EACH ROW
  EXECUTE FUNCTION sync_leave_type_to_payroll_component();

-- Trigger for UPDATE operations on leave_types
CREATE TRIGGER sync_leave_type_to_payroll_component_update
  AFTER UPDATE ON leave_types
  FOR EACH ROW
  WHEN (
    NEW.name IS DISTINCT FROM OLD.name OR
    NEW.description IS DISTINCT FROM OLD.description
  )
  EXECUTE FUNCTION sync_leave_type_to_payroll_component();

-- ============================================================
-- ADD HELPFUL COMMENTS
-- ============================================================

COMMENT ON FUNCTION sync_shift_to_payroll_component IS
'Automatically creates or updates payroll components when shifts are inserted or updated.
Component names follow pattern: "Shift: {shift_name}"';

COMMENT ON FUNCTION sync_leave_type_to_payroll_component IS
'Automatically creates or updates payroll components when leave types are inserted or updated.
Component names follow pattern: "Leave: {leave_type_name}"';

COMMENT ON TRIGGER sync_shift_to_payroll_component_insert ON shifts IS
'Auto-creates payroll component when a new shift is created';

COMMENT ON TRIGGER sync_shift_to_payroll_component_update ON shifts IS
'Auto-updates payroll component when shift name, description, or status changes';

COMMENT ON TRIGGER sync_leave_type_to_payroll_component_insert ON leave_types IS
'Auto-creates payroll component when a new leave type is created';

COMMENT ON TRIGGER sync_leave_type_to_payroll_component_update ON leave_types IS
'Auto-updates payroll component when leave type name or description changes';
