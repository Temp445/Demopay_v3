-- Add hybrid travel allowance settings to location_settings table
ALTER TABLE public.location_settings
ADD COLUMN IF NOT EXISTS travel_allowance_method text NOT NULL DEFAULT 'manual' CHECK (travel_allowance_method IN ('manual', 'distance', 'fixed')),
ADD COLUMN IF NOT EXISTS travel_allowance_rate numeric(10,2) NOT NULL DEFAULT 0.00;

COMMENT ON COLUMN public.location_settings.travel_allowance_method IS 'Method for calculating travel allowance: manual, distance, or fixed';
COMMENT ON COLUMN public.location_settings.travel_allowance_rate IS 'Rate used for calculation: per km rate for distance, or flat rate for fixed method';
