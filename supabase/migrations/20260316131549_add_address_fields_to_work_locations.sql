/*
  # Add Address Fields to Work Locations

  Adds comprehensive address storage fields to work_locations table
  for better location identification and display
*/

ALTER TABLE work_locations 
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS city TEXT,
ADD COLUMN IF NOT EXISTS state TEXT,
ADD COLUMN IF NOT EXISTS country TEXT,
ADD COLUMN IF NOT EXISTS postal_code TEXT,
ADD COLUMN IF NOT EXISTS formatted_address TEXT;

COMMENT ON COLUMN work_locations.address IS 'Street address';
COMMENT ON COLUMN work_locations.formatted_address IS 'Full formatted address from geocoding service';