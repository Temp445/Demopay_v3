/*
  # Add Calculation Components Field to Payroll Table

  1. Changes
    - Add 'calculation_components' JSONB field to payroll table
    - This field will store calculation component values mapped to their component IDs
    - Format: { "component_id": value, ... }
    - Example: { "uuid1": 30, "uuid2": 22, "uuid3": 8, ... }

  2. Notes
    - Uses JSONB for efficient storage and querying
    - Default value is empty JSON object
    - Allows flexible storage of component calculations
*/

-- Add calculation_components field to payroll table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payroll' AND column_name = 'calculation_components'
  ) THEN
    ALTER TABLE payroll 
    ADD COLUMN calculation_components JSONB DEFAULT '{}'::jsonb;
  END IF;
END $$;