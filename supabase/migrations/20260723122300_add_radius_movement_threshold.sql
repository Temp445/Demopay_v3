-- Add work_radius_minimum_movement_threshold_meters to location_settings
ALTER TABLE public.location_settings
ADD COLUMN IF NOT EXISTS work_radius_minimum_movement_threshold_meters integer NOT NULL DEFAULT 10;

COMMENT ON COLUMN public.location_settings.work_radius_minimum_movement_threshold_meters IS 'Minimum movement threshold in meters required to record a new GPS point during radius monitoring';
