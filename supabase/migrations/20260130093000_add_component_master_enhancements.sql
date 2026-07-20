/*
  # Component Master and Salary Structure Enhancements

  1. New Columns for payroll_components table
    - `component_category` - Categorizes components as 'general' or 'calculation'
    - `type_selection` - Specifies if component is 'common' or 'individual'
    - `amount_type` - Specifies if component uses 'value' or 'percentage'

  2. Purpose
    - General type components: Allow manual value entry in salary structures
    - Calculation type components: Automatically calculated, restrict editing except name
    - Type selection determines if component applies to all employees or individually
    - Amount type determines how the component value is specified

  3. Backward Compatibility
    - All new columns have default values to maintain compatibility with existing data
    - Existing components default to 'general' category, 'common' type, and 'value' amount type

  4. Security
    - No changes to RLS policies required
    - All existing security remains intact
*/

-- Add new columns to payroll_components table
ALTER TABLE public.payroll_components
ADD COLUMN IF NOT EXISTS component_category text DEFAULT 'general' CHECK (component_category IN ('general', 'calculation')),
ADD COLUMN IF NOT EXISTS type_selection text DEFAULT 'common' CHECK (type_selection IN ('common', 'individual')),
ADD COLUMN IF NOT EXISTS amount_type text DEFAULT 'value' CHECK (amount_type IN ('value', 'percentage'));

-- Update existing null values to defaults (for any data that might have null)
UPDATE public.payroll_components
SET component_category = 'general'
WHERE component_category IS NULL;

UPDATE public.payroll_components
SET type_selection = 'common'
WHERE type_selection IS NULL;

UPDATE public.payroll_components
SET amount_type = 'value'
WHERE amount_type IS NULL;

-- Create index for better query performance when filtering by component_category
CREATE INDEX IF NOT EXISTS idx_payroll_components_category
  ON public.payroll_components(component_category);

-- Create index for better query performance when filtering by type_selection
CREATE INDEX IF NOT EXISTS idx_payroll_components_type_selection
  ON public.payroll_components(type_selection);

-- Add comment to table describing the new columns
COMMENT ON COLUMN public.payroll_components.component_category IS 'Categorizes components as general (manual entry) or calculation (auto-calculated)';
COMMENT ON COLUMN public.payroll_components.type_selection IS 'Specifies if component is common (applies to all) or individual (per employee)';
COMMENT ON COLUMN public.payroll_components.amount_type IS 'Specifies if component uses value (fixed amount) or percentage';
