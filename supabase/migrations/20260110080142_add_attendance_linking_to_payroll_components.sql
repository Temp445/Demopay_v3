/*
  # Add Attendance Linking Fields to Payroll Components

  1. Changes
    - Add `is_attendance_linked` boolean field to `payroll_structure_components`
      - Default: true (checked by default)
      - Determines if component amount should be prorated based on attendance
    
    - Add `always_treat_as_full_day` boolean field to `payroll_structure_components`
      - Default: false (unchecked by default)
      - Only applies when is_attendance_linked is true
      - When true, component is paid/deducted in full regardless of attendance
      - When false, component is prorated based on (Present Days + Approved Leave Days) / Total Working Days

  2. Purpose
    - Enable flexible payroll calculation for fixed amount components
    - Allow components to be either:
      a) Attendance-linked and prorated (default behavior)
      b) Attendance-linked but always full day (override proration)
      c) Not attendance-linked (always full amount)

  3. Default Behavior
    - Existing records: is_attendance_linked = true, always_treat_as_full_day = false
    - This maintains backward compatibility with current payroll calculations
*/

-- Add attendance linking fields to payroll_structure_components
ALTER TABLE payroll_structure_components
ADD COLUMN IF NOT EXISTS is_attendance_linked BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS always_treat_as_full_day BOOLEAN DEFAULT false;

-- Add helpful comments to the columns
COMMENT ON COLUMN payroll_structure_components.is_attendance_linked IS 
'Determines if this component should be prorated based on attendance. When true and always_treat_as_full_day is false, amount is calculated as: Fixed Amount * ((Present Days + Approved Leave Days) / Total Working Days)';

COMMENT ON COLUMN payroll_structure_components.always_treat_as_full_day IS 
'When is_attendance_linked is true and this is true, component is paid/deducted in full regardless of attendance. Only applies to components with calculation_type = ''value''';

-- Update existing records to have the default values
UPDATE payroll_structure_components
SET is_attendance_linked = true,
    always_treat_as_full_day = false
WHERE is_attendance_linked IS NULL;
