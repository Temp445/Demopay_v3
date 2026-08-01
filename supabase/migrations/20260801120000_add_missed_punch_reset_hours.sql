-- Add missed_punch_reset_hours to global attendance validation config
ALTER TABLE attendance_validation_config 
ADD COLUMN IF NOT EXISTS missed_punch_reset_hours integer NOT NULL DEFAULT 16;

-- Add missed_punch_reset_hours to employee-specific attendance settings
ALTER TABLE employee_attendance_settings
ADD COLUMN IF NOT EXISTS missed_punch_reset_hours integer NOT NULL DEFAULT 16;
