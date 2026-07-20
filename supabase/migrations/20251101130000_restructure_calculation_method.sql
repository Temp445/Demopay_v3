/*
  # Restructure Calculation Method to Two-Set System

  1. Changes to salary_structure_components
    - Rename `calculation_method` to `calculation_type` with new values ('percentage', 'value')
    - Add new `editability` field with values ('fixed', 'editable', 'enter_later')
    - Migrate existing data to new structure

  2. Data Migration Logic
    Old System:
    - 'fixed' → calculation_type='value', editability='fixed'
    - 'direct' → calculation_type='value', editability='editable'
    - 'percentage' → calculation_type='percentage', editability='fixed'

  3. Backward Compatibility
    - Preserve all existing data
    - Update CHECK constraints
    - Maintain referential integrity
*/

-- Step 1: Add new columns
DO $$
BEGIN
  -- Add calculation_type column (will replace calculation_method)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'salary_structure_components' AND column_name = 'calculation_type'
  ) THEN
    ALTER TABLE public.salary_structure_components
    ADD COLUMN calculation_type text;
  END IF;

  -- Add editability column (new field)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'salary_structure_components' AND column_name = 'editability'
  ) THEN
    ALTER TABLE public.salary_structure_components
    ADD COLUMN editability text;
  END IF;
END $$;

-- Step 2: Migrate existing data
UPDATE public.salary_structure_components
SET
  calculation_type = CASE
    WHEN calculation_method = 'percentage' THEN 'percentage'
    WHEN calculation_method IN ('fixed', 'direct') THEN 'value'
    ELSE calculation_method
  END,
  editability = CASE
    WHEN calculation_method = 'fixed' THEN 'fixed'
    WHEN calculation_method = 'direct' THEN 'editable'
    WHEN calculation_method = 'percentage' THEN 'fixed'
    ELSE 'fixed'
  END
WHERE calculation_type IS NULL;

-- Step 3: Add NOT NULL constraints after data migration
ALTER TABLE public.salary_structure_components
  ALTER COLUMN calculation_type SET NOT NULL;

ALTER TABLE public.salary_structure_components
  ALTER COLUMN editability SET NOT NULL;

-- Step 4: Add CHECK constraints for new columns
ALTER TABLE public.salary_structure_components
  DROP CONSTRAINT IF EXISTS salary_structure_components_calculation_type_check;

ALTER TABLE public.salary_structure_components
  ADD CONSTRAINT salary_structure_components_calculation_type_check
  CHECK (calculation_type IN ('percentage', 'value'));

ALTER TABLE public.salary_structure_components
  DROP CONSTRAINT IF EXISTS salary_structure_components_editability_check;

ALTER TABLE public.salary_structure_components
  ADD CONSTRAINT salary_structure_components_editability_check
  CHECK (editability IN ('fixed', 'editable', 'enter_later'));

-- Step 5: Drop old calculation_method column (optional - keep for backward compatibility)
-- Commenting out to maintain backward compatibility
-- ALTER TABLE public.salary_structure_components
--   DROP COLUMN IF EXISTS calculation_method;

-- Step 6: Add comments for documentation
COMMENT ON COLUMN public.salary_structure_components.calculation_type IS
'Determines how the component value is calculated: percentage (of other components) or value (fixed amount)';

COMMENT ON COLUMN public.salary_structure_components.editability IS
'Determines editability in payroll entry: fixed (not editable), editable (can modify value), enter_later (must enter in payroll)';

-- Step 7: Create index for common queries
CREATE INDEX IF NOT EXISTS idx_salary_structure_components_calculation_type
ON public.salary_structure_components(calculation_type);

CREATE INDEX IF NOT EXISTS idx_salary_structure_components_editability
ON public.salary_structure_components(editability);
