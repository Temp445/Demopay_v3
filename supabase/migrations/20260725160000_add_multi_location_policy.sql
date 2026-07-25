-- Add multi_location_policy to location_settings
ALTER TABLE public.location_settings
ADD COLUMN IF NOT EXISTS multi_location_policy text NOT NULL DEFAULT 'separate';

COMMENT ON COLUMN public.location_settings.multi_location_policy IS 'Determines how multi-location travel allowances are calculated: ''combine'' or ''separate''.';

-- Add check constraint to ensure only valid values
ALTER TABLE public.location_settings
ADD CONSTRAINT valid_multi_location_policy 
CHECK (multi_location_policy IN ('combine', 'separate'));
