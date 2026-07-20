/*
  # Add payroll_component_id to statutory_configurations
  
  1. Changes
    - Add `payroll_component_id` column to `statutory_configurations` table
    - Links configurations to specific payroll components (Employee vs Employer)
    - Allows multiple configurations per statutory element
    - Add foreign key constraint to payroll_components
    - Add composite index for query performance
  
  2. Purpose
    - Enables separate configurations for Employee and Employer statutory components
    - Supports split PF/ESI handling with independent calculation logic
    - Maintains backward compatibility (nullable column)
*/

-- Add payroll_component_id column to statutory_configurations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'statutory_configurations' AND column_name = 'payroll_component_id'
  ) THEN
    ALTER TABLE statutory_configurations 
    ADD COLUMN payroll_component_id uuid REFERENCES payroll_components(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create composite index for query performance
CREATE INDEX IF NOT EXISTS idx_statutory_configurations_element_component 
ON statutory_configurations(tenant_id, statutory_element, payroll_component_id);

-- Add comment for documentation
COMMENT ON COLUMN statutory_configurations.payroll_component_id IS 
'References specific payroll component (Employee or Employer) for split statutory configurations like PF and ESI';