/*
  Verification Script: calculation_type → amount_type Migration

  Run this script to verify the migration was successful.
  All queries should return expected results as documented.
*/

-- ============================================================================
-- TEST 1: Verify amount_type column exists
-- ============================================================================
-- Expected: 1 row showing (amount_type, text, NO)
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'payroll_structure_components'
  AND column_name = 'amount_type';

-- ============================================================================
-- TEST 2: Verify calculation_type column does NOT exist
-- ============================================================================
-- Expected: 0 rows (empty result)
SELECT
  column_name
FROM information_schema.columns
WHERE table_name = 'payroll_structure_components'
  AND column_name = 'calculation_type';

-- ============================================================================
-- TEST 3: Verify data is accessible with new column name
-- ============================================================================
-- Expected: Returns rows with amount_type values ('value', 'percentage', or 'expression')
SELECT
  id,
  component_id,
  amount_type,
  editability,
  amount,
  percentage
FROM payroll_structure_components
LIMIT 5;

-- ============================================================================
-- TEST 4: Verify get_payroll_structure_details function works
-- ============================================================================
-- Replace <structure_id> and <tenant_id> with actual UUIDs
-- Expected: Returns structure details with components containing 'amount_type' field
/*
SELECT * FROM get_payroll_structure_details(
  '<structure_id>'::uuid,
  '<tenant_id>'::uuid
);
*/

-- ============================================================================
-- TEST 5: Verify insert_pay_structure_component function signature
-- ============================================================================
-- Expected: Shows function with p_amount_type parameter (not p_calculation_type)
SELECT
  routine_name,
  parameter_name,
  data_type,
  ordinal_position
FROM information_schema.parameters
WHERE specific_schema = 'public'
  AND routine_name = 'insert_pay_structure_component'
  AND parameter_name LIKE '%amount%'
ORDER BY ordinal_position;

-- ============================================================================
-- TEST 6: Count records by amount_type
-- ============================================================================
-- Expected: Shows distribution of value, percentage, and expression types
SELECT
  amount_type,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM payroll_structure_components
GROUP BY amount_type
ORDER BY count DESC;

-- ============================================================================
-- TEST 7: Verify no orphaned calculation_type references in functions
-- ============================================================================
-- Expected: 0 rows (no functions should reference calculation_type anymore)
SELECT
  routine_name,
  routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_definition ILIKE '%calculation_type%'
  AND routine_definition NOT ILIKE '%comment%'
  AND routine_definition NOT ILIKE '%note%';

-- ============================================================================
-- TEST 8: Verify function definitions include amount_type
-- ============================================================================
-- Expected: 2 rows (both functions should reference amount_type)
SELECT
  routine_name,
  routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND (
    routine_name = 'get_payroll_structure_details'
    OR routine_name = 'insert_pay_structure_component'
  )
  AND routine_definition ILIKE '%amount_type%';

-- ============================================================================
-- TEST 9: Verify amount_type values are valid
-- ============================================================================
-- Expected: All rows should have amount_type in ('value', 'percentage', 'expression')
-- If any rows returned, there's invalid data
SELECT
  id,
  amount_type,
  'Invalid amount_type value' as issue
FROM payroll_structure_components
WHERE amount_type NOT IN ('value', 'percentage', 'expression');

-- ============================================================================
-- TEST 10: Check for NULL amount_type values
-- ============================================================================
-- Expected: 0 rows (amount_type should be NOT NULL)
SELECT
  COUNT(*) as null_count
FROM payroll_structure_components
WHERE amount_type IS NULL;

-- ============================================================================
-- SUMMARY REPORT
-- ============================================================================
SELECT
  'Migration Verification Complete' as status,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'payroll_structure_components'
        AND column_name = 'amount_type'
    ) THEN '✅ PASS'
    ELSE '❌ FAIL'
  END as column_renamed,
  CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'payroll_structure_components'
        AND column_name = 'calculation_type'
    ) THEN '✅ PASS'
    ELSE '❌ FAIL'
  END as old_column_removed,
  CASE
    WHEN (
      SELECT COUNT(*) FROM information_schema.routines
      WHERE routine_schema = 'public'
        AND routine_name IN ('get_payroll_structure_details', 'insert_pay_structure_component')
        AND routine_definition ILIKE '%amount_type%'
    ) = 2 THEN '✅ PASS'
    ELSE '❌ FAIL'
  END as functions_updated,
  (
    SELECT COUNT(*) FROM payroll_structure_components
  ) as total_records,
  (
    SELECT COUNT(*) FROM payroll_structure_components
    WHERE amount_type IS NOT NULL
  ) as valid_records;

-- ============================================================================
-- If all tests show ✅ PASS, the migration was successful!
-- ============================================================================
