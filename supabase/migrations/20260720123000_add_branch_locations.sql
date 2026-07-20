/*
  # Add Branch Locations to Company Settings
  
  This migration adds a `branch_locations` column to the `company_settings` table
  to store multiple company/branch locations as a JSONB array.
*/

ALTER TABLE IF EXISTS public.company_settings 
ADD COLUMN IF NOT EXISTS branch_locations jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.company_settings.branch_locations IS 'Array of branch location objects with id, name, address, latitude, longitude, and radius fields';
