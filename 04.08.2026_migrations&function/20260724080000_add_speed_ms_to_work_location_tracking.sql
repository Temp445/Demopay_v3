-- Add speed_ms to work_location_tracking (paid gatepass / work location breadcrumbs)
ALTER TABLE public.work_location_tracking
  ADD COLUMN IF NOT EXISTS speed_ms FLOAT DEFAULT NULL;

COMMENT ON COLUMN public.work_location_tracking.speed_ms IS 'Raw GPS speed in metres per second at the time of recording. NULL means the device could not determine speed (e.g. desktop/WiFi). 0 = stationary, <8 = walking/cycling, >=8 = driving.';

-- Add speed_ms to journey_tracking_logs (journey events: start, live-track, reached, etc.)
ALTER TABLE public.journey_tracking_logs
  ADD COLUMN IF NOT EXISTS speed_ms FLOAT DEFAULT NULL;

COMMENT ON COLUMN public.journey_tracking_logs.speed_ms IS 'Raw GPS speed in metres per second at time of journey event. NULL if device cannot determine speed.';


ALTER TABLE public.outside_office_approvals
ADD COLUMN IF NOT EXISTS distance_meters numeric,
ADD COLUMN IF NOT EXISTS travel_allowance_amount numeric,
ADD COLUMN IF NOT EXISTS travel_allowance_unit text;


ALTER TABLE work_locations
  DROP CONSTRAINT IF EXISTS work_locations_status_check;

ALTER TABLE work_locations
  ADD CONSTRAINT work_locations_status_check
  CHECK (status IN ('assigned', 'in_progress', 'paused', 'completed', 'approved', 'cancelled', 'denied'));

