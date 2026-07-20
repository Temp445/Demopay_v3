/*
  # Add Google Maps Configuration to Location Settings

  1. Modified Tables
    - `location_settings`
      - Added `google_maps_enabled` (boolean, default false) - toggle for Google Maps provider
      - Added `google_maps_api_key` (text, nullable) - encrypted API key for Google Maps

  2. Important Notes
    - When google_maps_enabled is false, the system uses react-leaflet (OpenStreetMap)
    - When google_maps_enabled is true AND a valid API key is present, system switches to Google Maps
    - API key validation happens on the frontend before saving
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'location_settings' AND column_name = 'google_maps_enabled'
  ) THEN
    ALTER TABLE location_settings ADD COLUMN google_maps_enabled boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'location_settings' AND column_name = 'google_maps_api_key'
  ) THEN
    ALTER TABLE location_settings ADD COLUMN google_maps_api_key text DEFAULT NULL;
  END IF;
END $$;
