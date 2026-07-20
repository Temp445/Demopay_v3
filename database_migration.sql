/*
  # Add is_applied_in_calculation to salary_structure_components

  1. Changes
    - Add `is_applied_in_calculation` column to `salary_structure_components` table
      - Type: boolean
      - Default: true (all components are applied by default)
      - NOT NULL constraint

  2. Purpose
    - Track whether a statutory deduction should be applied in payroll calculations
    - When true: Component is applied in payroll calculation
    - When false: Component appears in report but is NOT applied in calculation
    - Primarily used for statutory deductions (PF, ESI, etc.)

  3. Security
    - No RLS changes needed (inherits from table RLS)
    - Default value ensures backward compatibility
*/

-- Add is_applied_in_calculation column to salary_structure_components
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'salary_structure_components'
    AND column_name = 'is_applied_in_calculation'
    AND table_schema = 'public'
  ) THEN
    ALTER TABLE salary_structure_components
    ADD COLUMN is_applied_in_calculation boolean DEFAULT true NOT NULL;
  END IF;
END $$;

-- Add index for query performance (optional but recommended)
CREATE INDEX IF NOT EXISTS idx_salary_structure_components_applied
ON salary_structure_components(is_applied_in_calculation)
WHERE component_type = 'deduction';

-- Add comment for documentation
COMMENT ON COLUMN salary_structure_components.is_applied_in_calculation IS
'Indicates whether this component should be applied in payroll calculations. When false, component appears in reports but is not calculated. Primarily used for statutory deductions.';
