-- ============================================================================
-- PAYROLL CALCULATION COMPONENTS - SQL REFERENCE
-- ============================================================================
-- This file contains all SQL statements for the payroll calculation
-- components implementation.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- TASK 1: Insert Calculation Components into payroll_components Table
-- ----------------------------------------------------------------------------

INSERT INTO payroll_components (
  name,
  description,
  component_type,
  component_category,
  is_active,
  type_selection
) VALUES
  ('CalanderDays', 'Total calendar days in the payroll period', 'earning', 'calculation', true, 'individual'),
  ('WorkingDays', 'Total working days excluding weekends and holidays', 'earning', 'calculation', true, 'individual'),
  ('WeekOff', 'Total weekend/week off days in the period', 'earning', 'calculation', true, 'individual'),
  ('PaidHolidays', 'Total paid holidays in the period', 'earning', 'calculation', true, 'individual'),
  ('PresentDays', 'Total days employee was present', 'earning', 'calculation', true, 'individual'),
  ('AbsentDays', 'Total days employee was absent', 'earning', 'calculation', true, 'individual'),
  ('LeaveDays', 'Total leave days (paid + unpaid)', 'earning', 'calculation', true, 'individual'),
  ('PaidLeaveDays', 'Total paid leave days', 'earning', 'calculation', true, 'individual'),
  ('UnpaidLeaveDays', 'Total unpaid leave days', 'earning', 'calculation', true, 'individual'),
  ('PayableDays', 'Total payable days after all calculations', 'earning', 'calculation', true, 'individual'),
  ('PFApplicable', 'Indicates if PF is applicable for employee', 'earning', 'calculation', true, 'individual'),
  ('ESIApplicable', 'Indicates if ESI is applicable for employee', 'earning', 'calculation', true, 'individual')
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------------------
-- TASK 3: Add calculation_components Field to payroll Table
-- ----------------------------------------------------------------------------

-- Add the new JSONB column to store calculation components
ALTER TABLE payroll
ADD COLUMN IF NOT EXISTS calculation_components JSONB DEFAULT '{}'::jsonb;

-- ----------------------------------------------------------------------------
-- VERIFICATION QUERIES
-- ----------------------------------------------------------------------------

-- Verify calculation components were inserted
SELECT id, name, component_category, component_type, is_active
FROM payroll_components
WHERE component_category = 'calculation'
ORDER BY name;

-- Verify payroll table has the new column
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'payroll'
  AND column_name = 'calculation_components';

-- ----------------------------------------------------------------------------
-- QUERY EXAMPLES
-- ----------------------------------------------------------------------------

-- Example 1: Get all calculation component IDs and names
SELECT id, name, description
FROM payroll_components
WHERE component_category = 'calculation'
  AND is_active = true
ORDER BY name;

-- Example 2: Get calculation components for a specific payroll entry
SELECT
  p.id,
  p.employee_id,
  p.period_start,
  p.period_end,
  p.calculation_components,
  e.name as employee_name
FROM payroll p
JOIN employees e ON p.employee_id = e.id
WHERE p.id = 'your-payroll-id-here';

-- Example 3: Get payroll entries with specific calculation component values
-- For example, find all payroll entries where CalanderDays = 30
SELECT
  p.id,
  p.employee_id,
  p.period_start,
  p.period_end,
  p.calculation_components
FROM payroll p
CROSS JOIN payroll_components pc
WHERE pc.name = 'CalanderDays'
  AND pc.component_category = 'calculation'
  AND (p.calculation_components->>pc.id::text)::numeric = 30;

-- Example 4: Get all calculation component values for a payroll entry
-- This query unpacks the JSONB calculation_components into rows
SELECT
  p.id as payroll_id,
  pc.name as component_name,
  (p.calculation_components->>pc.id::text)::numeric as component_value,
  pc.description
FROM payroll p
CROSS JOIN payroll_components pc
WHERE p.id = 'your-payroll-id-here'
  AND pc.component_category = 'calculation'
  AND p.calculation_components ? pc.id::text
ORDER BY pc.name;

-- Example 5: Get statutory compliance summary
-- Shows PF and ESI applicability for all payroll entries
SELECT
  p.id as payroll_id,
  e.name as employee_name,
  p.period_start,
  p.period_end,
  (p.calculation_components->>(SELECT id::text FROM payroll_components WHERE name = 'PFApplicable'))::numeric as pf_applicable,
  (p.calculation_components->>(SELECT id::text FROM payroll_components WHERE name = 'ESIApplicable'))::numeric as esi_applicable
FROM payroll p
JOIN employees e ON p.employee_id = e.id
WHERE p.period_start >= '2024-01-01'
ORDER BY p.period_start DESC, e.name;

-- Example 6: Aggregate report - Average payable days per month
SELECT
  DATE_TRUNC('month', p.period_start) as month,
  COUNT(p.id) as total_employees,
  AVG((p.calculation_components->>(SELECT id::text FROM payroll_components WHERE name = 'PayableDays'))::numeric) as avg_payable_days,
  AVG((p.calculation_components->>(SELECT id::text FROM payroll_components WHERE name = 'AbsentDays'))::numeric) as avg_absent_days
FROM payroll p
WHERE p.period_start >= '2024-01-01'
GROUP BY DATE_TRUNC('month', p.period_start)
ORDER BY month DESC;

-- Example 7: Find employees with high absenteeism
-- Shows employees with more than 5 absent days
SELECT
  e.name as employee_name,
  p.period_start,
  p.period_end,
  (p.calculation_components->>(SELECT id::text FROM payroll_components WHERE name = 'AbsentDays'))::numeric as absent_days,
  (p.calculation_components->>(SELECT id::text FROM payroll_components WHERE name = 'PresentDays'))::numeric as present_days
FROM payroll p
JOIN employees e ON p.employee_id = e.id
CROSS JOIN payroll_components pc
WHERE pc.name = 'AbsentDays'
  AND pc.component_category = 'calculation'
  AND (p.calculation_components->>pc.id::text)::numeric > 5
ORDER BY absent_days DESC, e.name;

-- Example 8: Update calculation_components for a payroll entry
-- Note: This is typically done by the application, but can be done manually if needed
UPDATE payroll
SET calculation_components = '{
  "component-uuid-1": 30,
  "component-uuid-2": 22,
  "component-uuid-3": 8,
  "component-uuid-4": 2,
  "component-uuid-5": 20,
  "component-uuid-6": 2,
  "component-uuid-7": 1,
  "component-uuid-8": 1,
  "component-uuid-9": 0,
  "component-uuid-10": 29,
  "component-uuid-11": 1,
  "component-uuid-12": 0
}'::jsonb
WHERE id = 'your-payroll-id-here';

-- ----------------------------------------------------------------------------
-- MAINTENANCE QUERIES
-- ----------------------------------------------------------------------------

-- Check for payroll entries missing calculation_components
SELECT
  p.id,
  p.employee_id,
  p.period_start,
  p.period_end,
  p.calculation_components
FROM payroll p
WHERE p.calculation_components IS NULL
   OR p.calculation_components = '{}'::jsonb
ORDER BY p.period_start DESC;

-- Count payroll entries with calculation_components
SELECT
  COUNT(CASE WHEN calculation_components IS NOT NULL AND calculation_components != '{}'::jsonb THEN 1 END) as with_components,
  COUNT(CASE WHEN calculation_components IS NULL OR calculation_components = '{}'::jsonb THEN 1 END) as without_components,
  COUNT(*) as total
FROM payroll;

-- ----------------------------------------------------------------------------
-- ROLLBACK QUERIES (Use with caution!)
-- ----------------------------------------------------------------------------

-- Remove calculation_components column (if needed to rollback)
-- ALTER TABLE payroll DROP COLUMN IF EXISTS calculation_components;

-- Delete calculation components (if needed to rollback)
-- DELETE FROM payroll_components WHERE component_category = 'calculation';
