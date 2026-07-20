-- Add new location tracking configuration fields
ALTER TABLE public.location_settings
ADD COLUMN IF NOT EXISTS journey_tracking_interval_mins integer NOT NULL DEFAULT 5,
ADD COLUMN IF NOT EXISTS work_radius_tracking_interval_mins integer NOT NULL DEFAULT 15,
ADD COLUMN IF NOT EXISTS allow_add_new_location boolean NOT NULL DEFAULT false;

-- Create journey tracking logs table
CREATE TABLE IF NOT EXISTS public.journey_tracking_logs (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    work_location_id uuid, -- Nullable for journeys without a specific location (e.g. End Point Reached)
    event_type text NOT NULL, -- e.g. START_JOURNEY, LIVE_TRACK_JOURNEY, REACHED_LOCATION, START_WORK, LIVE_TRACK_WORK, PAUSE_WORK, RESUME_WORK, COMPLETE_WORK, START_RETURN_JOURNEY, REACHED_ENDPOINT
    latitude numeric(10, 8) NOT NULL,
    longitude numeric(11, 8) NOT NULL,
    accuracy numeric(10, 2),
    battery_level integer,
    timestamp timestamp with time zone NOT NULL DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT journey_tracking_logs_pkey PRIMARY KEY (id),
    CONSTRAINT journey_tracking_logs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE,
    CONSTRAINT journey_tracking_logs_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees (id) ON DELETE CASCADE,
    CONSTRAINT journey_tracking_logs_work_location_id_fkey FOREIGN KEY (work_location_id) REFERENCES public.work_locations (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_journey_tracking_logs_employee ON public.journey_tracking_logs USING btree (employee_id, timestamp desc);
CREATE INDEX IF NOT EXISTS idx_journey_tracking_logs_tenant ON public.journey_tracking_logs USING btree (tenant_id, timestamp desc);

-- Enable RLS for journey_tracking_logs
ALTER TABLE public.journey_tracking_logs ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view journey logs in their tenant" ON public.journey_tracking_logs
FOR SELECT USING (
    tenant_id = (SELECT tenant_id FROM auth.users WHERE auth.uid() = id)
);

CREATE POLICY "Users can insert journey logs in their tenant" ON public.journey_tracking_logs
FOR INSERT WITH CHECK (
    tenant_id = (SELECT tenant_id FROM auth.users WHERE auth.uid() = id)
);
