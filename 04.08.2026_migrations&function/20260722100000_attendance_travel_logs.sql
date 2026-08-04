-- Migration: attendance_travel_logs
-- Adds GPS breadcrumb tracking for outside-office attendance sessions

-- 1. New table for storing GPS breadcrumbs per travel session
CREATE TABLE IF NOT EXISTS public.attendance_travel_logs (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id               uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  -- Links to the 'IN' attendance_timestamp row that started this session
  start_timestamp_id        uuid NOT NULL REFERENCES public.attendance_timestamp(id) ON DELETE CASCADE,
  latitude                  numeric(10, 8) NOT NULL,
  longitude                 numeric(11, 8) NOT NULL,
  accuracy                  numeric(10, 2),
  -- Running cumulative distance in meters at the time of this breadcrumb
  cumulative_distance_meters numeric(10, 2) DEFAULT 0,
  recorded_at               timestamptz NOT NULL DEFAULT now(),
  created_at                timestamptz DEFAULT now()
);

-- Indexes for fast querying
CREATE INDEX IF NOT EXISTS idx_travel_logs_start_timestamp
  ON public.attendance_travel_logs (start_timestamp_id, recorded_at);

CREATE INDEX IF NOT EXISTS idx_travel_logs_employee
  ON public.attendance_travel_logs (employee_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_travel_logs_tenant
  ON public.attendance_travel_logs (tenant_id);

-- RLS
ALTER TABLE public.attendance_travel_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view travel logs in their tenant"
  ON public.attendance_travel_logs FOR SELECT
  USING (tenant_id = (SELECT tenant_id FROM auth.users WHERE auth.uid() = id));

CREATE POLICY "Users can insert travel logs in their tenant"
  ON public.attendance_travel_logs FOR INSERT
  WITH CHECK (tenant_id = (SELECT tenant_id FROM auth.users WHERE auth.uid() = id));

-- 2. Add travel summary columns to attendance_timestamp
--    These are written once when tracking ends (clock-out or re-entry to office)
ALTER TABLE public.attendance_timestamp
  ADD COLUMN IF NOT EXISTS travel_distance_meters numeric(10, 2),
  ADD COLUMN IF NOT EXISTS travel_duration_seconds integer;
