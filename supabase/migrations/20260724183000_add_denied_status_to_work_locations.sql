-- Migration: Add 'denied' to the work_locations status check constraint
-- The old constraint only allowed: assigned, in_progress, completed, approved, cancelled
-- This migration drops the old constraint and adds a new one that also allows 'denied'

ALTER TABLE work_locations
  DROP CONSTRAINT IF EXISTS work_locations_status_check;

ALTER TABLE work_locations
  ADD CONSTRAINT work_locations_status_check
  CHECK (status IN ('assigned', 'in_progress', 'completed', 'approved', 'cancelled', 'denied'));
