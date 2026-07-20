/*
  # Add Statutory Component ID Reference to Payroll Components

  1. Changes
    - Add `statutory_component_id` column to `payroll_components` table
    - This field references the `statutory_configurations` table
    - Enables direct ID-based relationship instead of name-based lookups

  2. Column Details
    - `statutory_component_id` (uuid, nullable)
    - Foreign key to `statutory_configurations.id`
    - Nullable to allow non-statutory components
    - Indexed for performance

  3. Data Integrity
    - Foreign key constraint ensures referential integrity
    - Cascade delete not used to preserve historical data
    - Existing records remain unaffected
*/

-- Add statutory_component_id column to payroll_components table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payroll_components' AND column_name = 'statutory_component_id'
  ) THEN
    ALTER TABLE public.payroll_components
    ADD COLUMN statutory_component_id uuid REFERENCES public.statutory_configurations(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_payroll_components_statutory_id
ON public.payroll_components(statutory_component_id);

-- Add comment for documentation
COMMENT ON COLUMN public.payroll_components.statutory_component_id IS
'References statutory_configurations.id for statutory deductions. NULL for non-statutory components.';
