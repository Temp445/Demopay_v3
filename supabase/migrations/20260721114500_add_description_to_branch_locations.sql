/*
  # Add Description to Branch Locations
  
  This migration formally documents the new `description` field in the 
  `branch_locations` JSONB array on the `company_settings` table, and 
  backfills existing records to ensure consistent data structure.
*/

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
