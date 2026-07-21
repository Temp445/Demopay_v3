/*
  # Add Branch Locations to Company Settings
  
  This migration adds a `branch_locations` column to the `company_settings` table
  to store multiple company/branch locations as a JSONB array.
*/

ALTER TABLE IF EXISTS public.company_settings 
ADD COLUMN IF NOT EXISTS branch_locations jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.company_settings.branch_locations IS 'Array of branch location objects with id, name, address, latitude, longitude, and radius fields';

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