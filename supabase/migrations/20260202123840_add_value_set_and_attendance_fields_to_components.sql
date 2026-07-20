/*
  # Add Value Set and Attendance Fields to Payroll Components

  1. Changes
    - Add `value_set` field for defining when component values are set
    - Add `is_attendance_linked` field for attendance linking
    - Add `always_treat_as_full_day` field for full day treatment option

  2. Purpose
    - Enable value set configuration for general category components
    - Support attendance-based proration at component master level
    - Configure full day treatment option for half-day attendance scenarios

  3. Field Details
    - value_set: 'master_entry' | 'at_structure' | 'at_executing'
    - is_attendance_linked: boolean (default true)
    - always_treat_as_full_day: boolean (default false)
*/

-- Add value_set field (for General category components)
ALTER TABLE payroll_components
ADD COLUMN IF NOT EXISTS value_set text CHECK (value_set IN ('master_entry', 'at_structure', 'at_executing'));

-- Add attendance linking fields
ALTER TABLE payroll_components
ADD COLUMN IF NOT EXISTS is_attendance_linked boolean DEFAULT true;

ALTER TABLE payroll_components
ADD COLUMN IF NOT EXISTS always_treat_as_full_day boolean DEFAULT false;

-- Add comments for documentation
COMMENT ON COLUMN payroll_components.value_set IS 'Defines when component values are set: master_entry (at component creation), at_structure (at structure creation), at_executing (during payroll execution)';
COMMENT ON COLUMN payroll_components.is_attendance_linked IS 'Whether component amount should be prorated based on attendance';
COMMENT ON COLUMN payroll_components.always_treat_as_full_day IS 'When true, half-day attendance is treated as full day for this component';
