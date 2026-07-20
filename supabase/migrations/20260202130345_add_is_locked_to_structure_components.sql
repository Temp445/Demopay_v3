/*
  # Add is_locked Field to Payroll Structure Components

  1. Changes
    - Add is_locked boolean field to payroll_structure_components table
    - Default value is false (not locked)
    - This field controls whether a component value can be edited during payroll entry

  2. Purpose
    - Replace the removed editability options with a simpler is_locked flag
    - For components with value_set = 'at_structure', this flag determines if the value is locked
    - When is_locked = true, the component value cannot be changed during payroll processing
    - When is_locked = false, the component value can be modified during payroll processing
*/

-- Add is_locked column to payroll_structure_components table
ALTER TABLE payroll_structure_components
ADD COLUMN IF NOT EXISTS is_locked boolean DEFAULT false;

-- Add comment for documentation
COMMENT ON COLUMN payroll_structure_components.is_locked IS 'When true, component value is locked and cannot be changed during payroll processing';
