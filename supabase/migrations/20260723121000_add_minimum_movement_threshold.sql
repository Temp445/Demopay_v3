-- Add minimum_movement_threshold_meters to location_settings
ALTER TABLE public.location_settings
ADD COLUMN IF NOT EXISTS minimum_movement_threshold_meters integer NOT NULL DEFAULT 10;

COMMENT ON COLUMN public.location_settings.minimum_movement_threshold_meters IS 'Minimum movement threshold in meters required to record a new GPS point during live tracking';

-- Add work_radius_minimum_movement_threshold_meters to location_settings
ALTER TABLE public.location_settings
ADD COLUMN IF NOT EXISTS work_radius_minimum_movement_threshold_meters integer NOT NULL DEFAULT 10;

COMMENT ON COLUMN public.location_settings.work_radius_minimum_movement_threshold_meters IS 'Minimum movement threshold in meters required to record a new GPS point during radius monitoring';


-- Add hybrid travel allowance settings to location_settings table
ALTER TABLE public.location_settings
ADD COLUMN IF NOT EXISTS travel_allowance_method text NOT NULL DEFAULT 'manual' CHECK (travel_allowance_method IN ('manual', 'distance', 'fixed')),
ADD COLUMN IF NOT EXISTS travel_allowance_rate numeric(10,2) NOT NULL DEFAULT 0.00;

COMMENT ON COLUMN public.location_settings.travel_allowance_method IS 'Method for calculating travel allowance: manual, distance, or fixed';
COMMENT ON COLUMN public.location_settings.travel_allowance_rate IS 'Rate used for calculation: per km rate for distance, or flat rate for fixed method';


-- Add multi_location_policy to location_settings
ALTER TABLE public.location_settings
ADD COLUMN IF NOT EXISTS multi_location_policy text NOT NULL DEFAULT 'separate';

COMMENT ON COLUMN public.location_settings.multi_location_policy IS 'Determines how multi-location travel allowances are calculated: ''combine'' or ''separate''.';

-- Add check constraint to ensure only valid values
ALTER TABLE public.location_settings
ADD CONSTRAINT valid_multi_location_policy 
CHECK (multi_location_policy IN ('combine', 'separate'));