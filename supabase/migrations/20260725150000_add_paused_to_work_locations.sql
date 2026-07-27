-- Migration: Add 'paused' to the work_locations status check constraint

ALTER TABLE work_locations
  DROP CONSTRAINT IF EXISTS work_locations_status_check;

ALTER TABLE work_locations
  ADD CONSTRAINT work_locations_status_check
  CHECK (status IN ('assigned', 'in_progress', 'paused', 'completed', 'approved', 'cancelled', 'denied'));

