-- Migration: add_roads_api_fields
-- Adds:
--   1. enable_roads_api toggle to company_settings
--   2. planned_distance_meters to attendance_timestamp (from Routes API)
--   3. roads_api_warnings[] to attendance_timestamp (diagnostic warnings)

-- ── 1. company_settings ──────────────────────────────────────────────────────
ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS enable_roads_api BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN company_settings.enable_roads_api IS
  'When true, stopTravelTracking() calls snapToRoads (Roads API) and computeRoutes (Routes API) '
  'to calculate actual road distance and planned O→D distance instead of Haversine.';

-- ── 2. attendance_timestamp ───────────────────────────────────────────────────
ALTER TABLE attendance_timestamp
  ADD COLUMN IF NOT EXISTS planned_distance_meters INTEGER,
  ADD COLUMN IF NOT EXISTS roads_api_warnings TEXT[];

COMMENT ON COLUMN attendance_timestamp.planned_distance_meters IS
  'Planned origin-to-destination driving distance in metres from the Routes API. '
  'NULL when Roads API is disabled or the call fails.';

COMMENT ON COLUMN attendance_timestamp.roads_api_warnings IS
  'Array of human-readable warnings produced by roadsDistanceService (GPS gaps, '
  'API fallbacks, filtered points, etc.). NULL when no warnings were generated.';
