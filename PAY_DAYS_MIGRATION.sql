/*
  # Add PAY Days Configuration to Structure Assignments

  IMPORTANT: This migration needs to be applied to your Supabase database

  Instructions:
  1. Go to your Supabase Dashboard
  2. Navigate to SQL Editor
  3. Copy and paste this SQL script
  4. Execute the script

  OR use Supabase CLI:
  supabase migration new add_pay_days_to_structure_assignments
  Then copy this content to the generated file and apply with:
  supabase db push

  1. Schema Changes
    - Add `pay_days_type` column to employee_salary_structure_assignments
      - Type: text with check constraint ('calendar_days' or 'custom')
      - Default: 'calendar_days'
    - Add `custom_pay_days` column to employee_salary_structure_assignments
      - Type: numeric (for storing custom days value)
      - Nullable (only used when pay_days_type = 'custom')

  2. Purpose
    - Store PAY days configuration at structure level
    - Stored in rows where employee_id IS NULL (structure-level settings)
    - calendar_days: Use calendar month days for payroll calculation
    - custom: Use a custom number of days specified by user

  3. Security
    - No RLS changes needed (inherits from table)
    - Validation via check constraint

  4. Notes
    - This configuration applies to all employees in the structure
    - Affects payroll calculations based on attendance/absence
*/

-- Add pay_days_type column with check constraint
ALTER TABLE employee_salary_structure_assignments
ADD COLUMN IF NOT EXISTS pay_days_type text DEFAULT 'calendar_days'
CHECK (pay_days_type IN ('calendar_days', 'custom'));

-- Add custom_pay_days column
ALTER TABLE employee_salary_structure_assignments
ADD COLUMN IF NOT EXISTS custom_pay_days numeric(5, 2) CHECK (custom_pay_days > 0);

-- Add comment for documentation
COMMENT ON COLUMN employee_salary_structure_assignments.pay_days_type IS
'Type of pay days calculation: calendar_days (use actual calendar days) or custom (use specified custom_pay_days value)';

COMMENT ON COLUMN employee_salary_structure_assignments.custom_pay_days IS
'Custom number of pay days to use when pay_days_type is custom. Must be positive number.';

-- Update existing common component records (where employee_id IS NULL) to have default values
UPDATE employee_salary_structure_assignments
SET
  pay_days_type = 'calendar_days',
  custom_pay_days = NULL
WHERE employee_id IS NULL
  AND pay_days_type IS NULL;

-- Create index for better query performance on pay_days_type
CREATE INDEX IF NOT EXISTS idx_assignments_pay_days_type
ON employee_salary_structure_assignments(pay_days_type)
WHERE employee_id IS NULL;
