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
