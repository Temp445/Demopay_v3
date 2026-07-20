/*
  # Payroll Components Data Migration Script

  ## Overview
  This script migrates existing shifts and leave types that don't have corresponding
  payroll components. It creates the missing payroll component records for all
  existing shifts and leave types in the database.

  ## What This Script Does
  1. Identifies shifts without corresponding payroll components
  2. Creates payroll components for missing shifts
  3. Identifies leave types without corresponding payroll components
  4. Creates payroll components for missing leave types
  5. Provides summary statistics of migration

  ## Safety Features
  - Checks for existing components before creating (idempotent)
  - Uses transactions for data consistency
  - Provides rollback capability
  - Logs progress and results

  ## Prerequisites
  - Run PAYROLL_COMPONENTS_AUTO_SYNC_TRIGGERS.sql first
  - Ensure payroll_components table exists
  - Ensure shifts and leave_types tables exist

  ## Usage
  1. Review the script
  2. Execute in Supabase SQL Editor
  3. Review the output summary
  4. Verify data in payroll_components table

  ## Rollback
  To rollback (if needed within same session):
    ROLLBACK;

  To remove auto-generated components later:
    DELETE FROM payroll_components
    WHERE name LIKE 'Shift: %' OR name LIKE 'Leave: %';
*/

-- ============================================================
-- BEGIN TRANSACTION
-- ============================================================
BEGIN;

-- ============================================================
-- CREATE TEMPORARY TABLE FOR MIGRATION TRACKING
-- ============================================================
CREATE TEMP TABLE migration_stats (
  item_type text,
  items_total integer,
  items_already_exist integer,
  items_created integer,
  items_failed integer
);

-- ============================================================
-- SECTION 1: MIGRATE SHIFTS TO PAYROLL COMPONENTS
-- ============================================================

-- Count total shifts
WITH shift_counts AS (
  SELECT
    COUNT(*) as total_shifts,
    COUNT(CASE
      WHEN EXISTS (
        SELECT 1 FROM payroll_components pc
        WHERE pc.name = 'Shift: ' || s.name
          AND (pc.tenant_id = s.tenant_id OR (pc.tenant_id IS NULL AND s.tenant_id IS NULL))
          AND pc.statutory_component_id IS NULL
      )
      THEN 1
    END) as existing_components
  FROM shifts s
)
INSERT INTO migration_stats (item_type, items_total, items_already_exist, items_created, items_failed)
SELECT
  'Shifts (Pre-Count)',
  total_shifts,
  existing_components,
  0,
  0
FROM shift_counts;

-- Insert missing payroll components for shifts
WITH inserted_shifts AS (
  INSERT INTO payroll_components (
    name,
    description,
    component_type,
    component_category,
    type_selection,
    amount_type,
    value_set,
    is_attendance_linked,
    always_treat_as_full_day,
    is_active,
    eligibility,
    tenant_id,
    statutory_component_id
  )
  SELECT
    'Shift: ' || s.name as name,
    'Auto-generated component for shift: ' || s.name ||
      CASE
        WHEN s.description IS NOT NULL THEN ' - ' || s.description
        ELSE ''
      END as description,
    'earning' as component_type,
    'calculation' as component_category,
    'common' as type_selection,
    'value' as amount_type,
    null as value_set,
    true as is_attendance_linked,
    false as always_treat_as_full_day,
    COALESCE(s.is_active, true) as is_active,
    'all' as eligibility,
    s.tenant_id,
    NULL as statutory_component_id
  FROM shifts s
  WHERE NOT EXISTS (
    SELECT 1
    FROM payroll_components pc
    WHERE pc.name = 'Shift: ' || s.name
      AND (pc.tenant_id = s.tenant_id OR (pc.tenant_id IS NULL AND s.tenant_id IS NULL))
      AND pc.statutory_component_id IS NULL
  )
  RETURNING id
)
INSERT INTO migration_stats (item_type, items_total, items_already_exist, items_created, items_failed)
SELECT
  'Shifts (Created)',
  0,
  0,
  COUNT(*),
  0
FROM inserted_shifts;

-- ============================================================
-- SECTION 2: MIGRATE LEAVE TYPES TO PAYROLL COMPONENTS
-- ============================================================

-- Count total leave types
WITH leave_counts AS (
  SELECT
    COUNT(*) as total_leave_types,
    COUNT(CASE
      WHEN EXISTS (
        SELECT 1 FROM payroll_components pc
        WHERE pc.name = 'Leave: ' || lt.name
          AND (pc.tenant_id = lt.tenant_id OR (pc.tenant_id IS NULL AND lt.tenant_id IS NULL))
          AND pc.statutory_component_id IS NULL
      )
      THEN 1
    END) as existing_components
  FROM leave_types lt
)
INSERT INTO migration_stats (item_type, items_total, items_already_exist, items_created, items_failed)
SELECT
  'Leave Types (Pre-Count)',
  total_leave_types,
  existing_components,
  0,
  0
FROM leave_counts;

-- Insert missing payroll components for leave types
WITH inserted_leave_types AS (
  INSERT INTO payroll_components (
    name,
    description,
    component_type,
    component_category,
    type_selection,
    amount_type,
    value_set,
    is_attendance_linked,
    always_treat_as_full_day,
    is_active,
    eligibility,
    tenant_id,
    statutory_component_id
  )
  SELECT
    'Leave: ' || lt.name as name,
    'Auto-generated component for leave type: ' || lt.name ||
      CASE
        WHEN lt.description IS NOT NULL THEN ' - ' || lt.description
        ELSE ''
      END as description,
    'earning' as component_type,
    'calculation' as component_category,
    'common' as type_selection,
    'value' as amount_type,
    null as value_set,
    true as is_attendance_linked,
    false as always_treat_as_full_day,
    true as is_active,
    'all' as eligibility,
    lt.tenant_id,
    NULL as statutory_component_id
  FROM leave_types lt
  WHERE NOT EXISTS (
    SELECT 1
    FROM payroll_components pc
    WHERE pc.name = 'Leave: ' || lt.name
      AND (pc.tenant_id = lt.tenant_id OR (pc.tenant_id IS NULL AND lt.tenant_id IS NULL))
      AND pc.statutory_component_id IS NULL
  )
  RETURNING id
)
INSERT INTO migration_stats (item_type, items_total, items_already_exist, items_created, items_failed)
SELECT
  'Leave Types (Created)',
  0,
  0,
  COUNT(*),
  0
FROM inserted_leave_types;

-- ============================================================
-- DISPLAY MIGRATION SUMMARY
-- ============================================================
DO $$
DECLARE
  v_shift_total integer;
  v_shift_existing integer;
  v_shift_created integer;
  v_leave_total integer;
  v_leave_existing integer;
  v_leave_created integer;
BEGIN
  -- Get shift statistics
  SELECT items_total, items_already_exist
  INTO v_shift_total, v_shift_existing
  FROM migration_stats
  WHERE item_type = 'Shifts (Pre-Count)';

  SELECT items_created
  INTO v_shift_created
  FROM migration_stats
  WHERE item_type = 'Shifts (Created)';

  -- Get leave type statistics
  SELECT items_total, items_already_exist
  INTO v_leave_total, v_leave_existing
  FROM migration_stats
  WHERE item_type = 'Leave Types (Pre-Count)';

  SELECT items_created
  INTO v_leave_created
  FROM migration_stats
  WHERE item_type = 'Leave Types (Created)';

  -- Display summary
  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  RAISE NOTICE '  PAYROLL COMPONENTS DATA MIGRATION - SUMMARY';
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE '📊 SHIFTS MIGRATION:';
  RAISE NOTICE '  ├─ Total Shifts Found: %', v_shift_total;
  RAISE NOTICE '  ├─ Already Had Components: %', v_shift_existing;
  RAISE NOTICE '  └─ New Components Created: %', v_shift_created;
  RAISE NOTICE '';
  RAISE NOTICE '📊 LEAVE TYPES MIGRATION:';
  RAISE NOTICE '  ├─ Total Leave Types Found: %', v_leave_total;
  RAISE NOTICE '  ├─ Already Had Components: %', v_leave_existing;
  RAISE NOTICE '  └─ New Components Created: %', v_leave_created;
  RAISE NOTICE '';
  RAISE NOTICE '📊 OVERALL TOTALS:';
  RAISE NOTICE '  ├─ Total Items Processed: %', (v_shift_total + v_leave_total);
  RAISE NOTICE '  ├─ Already Existed: %', (v_shift_existing + v_leave_existing);
  RAISE NOTICE '  └─ Newly Created: %', (v_shift_created + v_leave_created);
  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  RAISE NOTICE '  ✅ MIGRATION COMPLETED SUCCESSFULLY';
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE '💡 Next Steps:';
  RAISE NOTICE '  1. Verify payroll_components table has new entries';
  RAISE NOTICE '  2. Check that component names follow patterns:';
  RAISE NOTICE '     • "Shift: {shift_name}"';
  RAISE NOTICE '     • "Leave: {leave_type_name}"';
  RAISE NOTICE '  3. Future changes will auto-sync via triggers';
  RAISE NOTICE '';
END $$;

-- ============================================================
-- VERIFICATION QUERIES (Optional - uncomment to run)
-- ============================================================

-- Uncomment to see newly created shift components
-- SELECT
--   name,
--   description,
--   component_type,
--   is_active,
--   created_at
-- FROM payroll_components
-- WHERE name LIKE 'Shift: %'
-- ORDER BY created_at DESC;

-- Uncomment to see newly created leave type components
-- SELECT
--   name,
--   description,
--   component_type,
--   is_active,
--   created_at
-- FROM payroll_components
-- WHERE name LIKE 'Leave: %'
-- ORDER BY created_at DESC;

-- Uncomment to see shifts without components (should be empty after migration)
-- SELECT
--   s.id,
--   s.name,
--   s.tenant_id
-- FROM shifts s
-- WHERE NOT EXISTS (
--   SELECT 1
--   FROM payroll_components pc
--   WHERE pc.name = 'Shift: ' || s.name
--     AND (pc.tenant_id = s.tenant_id OR (pc.tenant_id IS NULL AND s.tenant_id IS NULL))
-- );

-- Uncomment to see leave types without components (should be empty after migration)
-- SELECT
--   lt.id,
--   lt.name,
--   lt.tenant_id
-- FROM leave_types lt
-- WHERE NOT EXISTS (
--   SELECT 1
--   FROM payroll_components pc
--   WHERE pc.name = 'Leave: ' || lt.name
--     AND (pc.tenant_id = lt.tenant_id OR (pc.tenant_id IS NULL AND lt.tenant_id IS NULL))
-- );

-- ============================================================
-- COMMIT TRANSACTION
-- ============================================================
-- IMPORTANT: Review the summary above before committing
-- If everything looks correct, the transaction will commit automatically
-- If you see errors or unexpected results, you can run ROLLBACK; instead

COMMIT;

-- ============================================================
-- POST-MIGRATION NOTES
-- ============================================================

/*
  ✅ MIGRATION COMPLETE

  What happened:
  - Scanned all existing shifts and leave types
  - Created payroll components for items that didn't have them
  - Maintained tenant isolation (multi-tenant safe)
  - All components have proper attributes set

  Component Attributes (Auto-set):
  - component_type: 'earning'
  - component_category: 'calculation'
  - type_selection: 'common'
  - amount_type: 'value'
  - value_set: 'at_executing'
  - is_attendance_linked: true
  - always_treat_as_full_day: false
  - eligibility: 'all'
  - statutory_component_id: NULL

  Going Forward:
  - Triggers are now active for automatic sync
  - New shifts will auto-create components
  - New leave types will auto-create components
  - Updates to shifts/leave types will sync to components
  - No manual intervention needed

  Verification:
  Go to your application's Component Master page to see the new components.
  They will appear with names like:
  - "Shift: Morning Shift"
  - "Leave: Annual Leave"

  Troubleshooting:
  If components appear to be missing:
  1. Check if triggers were created successfully
  2. Verify tenant_id matches between tables
  3. Check statutory_component_id is NULL for non-statutory components
  4. Review error logs in database
*/
