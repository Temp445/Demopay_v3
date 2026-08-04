-- =============================================================================
-- Migration: Create missed_punch_alerts table for cron job tracking
-- Run this in Supabase → SQL Editor
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.missed_punch_alerts (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    shift_id uuid NOT NULL,
    shift_date date NOT NULL,
    alert_type text NOT NULL CHECK (alert_type IN ('MISSING_IN', 'MISSING_OUT')),
    sent_at timestamp with time zone DEFAULT now(),
    
    CONSTRAINT missed_punch_alerts_pkey PRIMARY KEY (id),
    CONSTRAINT missed_punch_alerts_tenant_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE,
    CONSTRAINT missed_punch_alerts_employee_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE,
    CONSTRAINT missed_punch_alerts_shift_fkey FOREIGN KEY (shift_id) REFERENCES public.shifts(id) ON DELETE CASCADE,
    -- Ensure we only send one specific type of alert per employee per shift date
    CONSTRAINT missed_punch_alerts_unique_alert UNIQUE (tenant_id, employee_id, shift_date, alert_type)
);

-- Index for fast lookup by cron job
CREATE INDEX IF NOT EXISTS idx_missed_punch_alerts_lookup 
ON public.missed_punch_alerts(tenant_id, employee_id, shift_date);

-- Enable RLS
ALTER TABLE public.missed_punch_alerts ENABLE ROW LEVEL SECURITY;

-- Tenants can view their own alerts
CREATE POLICY "Users can view their tenant missed punch alerts"
  ON public.missed_punch_alerts
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
  );

-- Service role has full access automatically, but let's be explicit
CREATE POLICY "Service role full access on missed_punch_alerts"
  ON public.missed_punch_alerts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
