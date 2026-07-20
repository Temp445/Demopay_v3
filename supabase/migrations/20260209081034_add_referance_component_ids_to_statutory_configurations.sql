/*
  # Add Reference Component IDs to Statutory Configurations

  1. Changes
    - Add `referance_component_ids` column to `statutory_configurations` table
      - Type: uuid[] (array of UUIDs)
      - Stores selected payroll component IDs for percentage-based calculations
      - Nullable: true (not all statutory configurations use percentage method)

  2. Purpose
    - Enable percentage-based statutory calculations to reference specific payroll components
    - Support multi-select of components for calculation base
    - Enhance flexibility in statutory configuration logic
*/

-- Add referance_component_ids column to statutory_configurations table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'statutory_configurations' 
    AND column_name = 'referance_component_ids'
    AND table_schema = 'public'
  ) THEN
    ALTER TABLE statutory_configurations 
    ADD COLUMN referance_component_ids uuid[];
  END IF;
END $$;