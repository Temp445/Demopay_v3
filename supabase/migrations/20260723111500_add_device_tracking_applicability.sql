-- Add device_tracking_applicability to attendance_validation_config
ALTER TABLE public.attendance_validation_config 
ADD COLUMN IF NOT EXISTS device_tracking_applicability text DEFAULT 'common' CHECK (device_tracking_applicability IN ('common', 'specific'));
