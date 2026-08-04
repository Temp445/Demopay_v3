ALTER TABLE IF EXISTS public.company_settings 
ADD COLUMN IF NOT EXISTS branch_locations jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.company_settings.branch_locations IS 'Array of branch location objects with id, name, address, latitude, longitude, and radius fields';


-- Update the column comment to reflect the new field
COMMENT ON COLUMN public.company_settings.branch_locations IS 'Array of branch location objects with id, name, description, address, latitude, longitude, and radius fields';

-- Safely backfill existing branch locations to include an empty description if missing
UPDATE public.company_settings
SET branch_locations = (
  SELECT COALESCE(
    jsonb_agg(
      CASE 
        WHEN loc ? 'description' THEN loc
        ELSE loc || '{"description": ""}'::jsonb
      END
    ),
    '[]'::jsonb
  )
  FROM jsonb_array_elements(branch_locations) AS loc
)
WHERE branch_locations IS NOT NULL 
  AND jsonb_typeof(branch_locations) = 'array' 
  AND jsonb_array_length(branch_locations) > 0;


-- 1. Add columns to company_settings
ALTER TABLE company_settings
ADD COLUMN IF NOT EXISTS google_maps_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS google_maps_api_key TEXT;

-- 2. Migrate existing data from location_settings
DO $$
DECLARE
    ls_record RECORD;
BEGIN
    FOR ls_record IN SELECT tenant_id, google_maps_enabled, google_maps_api_key FROM location_settings LOOP
        UPDATE company_settings
        SET 
            google_maps_enabled = COALESCE(ls_record.google_maps_enabled, false),
            google_maps_api_key = ls_record.google_maps_api_key
        WHERE tenant_id = ls_record.tenant_id;
    END LOOP;
END $$;

-- 3. Drop columns from location_settings
ALTER TABLE location_settings
DROP COLUMN IF EXISTS google_maps_enabled,
DROP COLUMN IF EXISTS google_maps_api_key;


-- Add API settings to company_settings table
ALTER TABLE company_settings ADD COLUMN enable_directions_api boolean DEFAULT false, ADD COLUMN enable_distance_matrix_api boolean DEFAULT false, ADD COLUMN enable_places_api boolean DEFAULT false;

ALTER TABLE public.company_settings 
ADD COLUMN IF NOT EXISTS is_hikvision_enabled BOOLEAN DEFAULT false;


ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS enable_roads_api BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN company_settings.enable_roads_api IS
  'When true, stopTravelTracking() calls snapToRoads (Roads API) and computeRoutes (Routes API) '
  'to calculate actual road distance and planned O→D distance instead of Haversine.';


ALTER TABLE attendance_timestamp
  ADD COLUMN IF NOT EXISTS planned_distance_meters INTEGER,
  ADD COLUMN IF NOT EXISTS roads_api_warnings TEXT[];

COMMENT ON COLUMN attendance_timestamp.planned_distance_meters IS
  'Planned origin-to-destination driving distance in metres from the Routes API. '
  'NULL when Roads API is disabled or the call fails.';

COMMENT ON COLUMN attendance_timestamp.roads_api_warnings IS
  'Array of human-readable warnings produced by roadsDistanceService (GPS gaps, '
  'API fallbacks, filtered points, etc.). NULL when no warnings were generated.';