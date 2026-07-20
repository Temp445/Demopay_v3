/*
  # Add calculation_type field to payroll_components

  1. Changes
    - Add new column `calculation_type` with values 'simple' or 'expression'
    - Default value is 'simple'
    - Migrate existing 'expression' amount_type records to use calculation_type='expression'

  2. Migration Logic
    - Components with amount_type='expression' will have calculation_type='expression'
    - All other components will have calculation_type='simple'
    - After migration, amount_type will only contain 'value' or 'percentage'

  3. Data Integrity
    - All existing data preserved
    - Backward compatible with existing queries
*/

-- Step 1: Add calculation_type column
ALTER TABLE public.payroll_components
ADD COLUMN IF NOT EXISTS calculation_type text DEFAULT 'simple';

-- Step 2: Add check constraint for calculation_type values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'payroll_components_calculation_type_check'
  ) THEN
    ALTER TABLE public.payroll_components
    ADD CONSTRAINT payroll_components_calculation_type_check
    CHECK (calculation_type IN ('simple', 'expression'));
  END IF;
END $$;

-- Step 3: Migrate existing data - Set calculation_type='expression' for components with amount_type='expression'
UPDATE public.payroll_components
SET calculation_type = 'expression'
WHERE amount_type = 'expression';

-- Step 4: Update amount_type from 'expression' to 'value' for migrated records
-- This ensures amount_type only contains 'value' or 'percentage' going forward
UPDATE public.payroll_components
SET amount_type = 'value'
WHERE amount_type = 'expression';

-- Step 5: Update check constraint for amount_type to remove 'expression'
-- First drop the old constraint if it exists
ALTER TABLE public.payroll_components
DROP CONSTRAINT IF EXISTS payroll_components_amount_type_check;

-- Add new constraint without 'expression'
ALTER TABLE public.payroll_components
ADD CONSTRAINT payroll_components_amount_type_check
CHECK (amount_type IN ('value', 'percentage'));

-- Step 6: Add comment for documentation
COMMENT ON COLUMN public.payroll_components.calculation_type IS 
'Determines calculation method: simple (direct value/percentage) or expression (formula-based)';

-- Verification query (commented out for production)
-- SELECT 
--   id, 
--   name, 
--   amount_type, 
--   calculation_type,
--   'Migrated successfully' as status
-- FROM public.payroll_components
-- WHERE calculation_type = 'expression';
