-- =============================================================================
-- Migration: Create shift_report_settings and shift_report_logs tables
-- =============================================================================

-- 1. SHIFT REPORT SETTINGS (one row per tenant)
CREATE TABLE IF NOT EXISTS public.shift_report_settings (
  tenant_id           uuid        PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  shift_id            text        NOT NULL DEFAULT 'all',
  delay_minutes       integer     NOT NULL DEFAULT 15,
  is_monitoring       boolean     NOT NULL DEFAULT false,
  selected_employee_ids uuid[]    NOT NULL DEFAULT '{}',
  custom_recipients   jsonb       NOT NULL DEFAULT '[]',
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shift_report_settings ENABLE ROW LEVEL SECURITY;

-- Only allow tenant members to read/write their own settings
CREATE POLICY "shift_report_settings_tenant_access"
  ON public.shift_report_settings
  FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users
      WHERE user_id = auth.uid()
    )
  );

-- Service role bypass (needed for Edge Function cron reads)
CREATE POLICY "shift_report_settings_service_role"
  ON public.shift_report_settings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);


-- 2. SHIFT REPORT LOGS (append-only, one row per send attempt)
CREATE TABLE IF NOT EXISTS public.shift_report_logs (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  shift_id            text        NOT NULL,
  shift_name          text        NOT NULL,
  sent_at             timestamptz NOT NULL DEFAULT now(),
  recipients_count    integer     NOT NULL DEFAULT 0,
  present_count       integer     NOT NULL DEFAULT 0,
  absent_count        integer     NOT NULL DEFAULT 0,
  total_count         integer     NOT NULL DEFAULT 0,
  triggered_by        text        NOT NULL DEFAULT 'cron',  -- 'cron' | 'manual'
  status              text        NOT NULL DEFAULT 'success', -- 'success' | 'error'
  error_message       text,
  recipient_emails    text[]      NOT NULL DEFAULT '{}'::text[]
);

ALTER TABLE public.shift_report_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shift_report_logs_tenant_access"
  ON public.shift_report_logs
  FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "shift_report_logs_service_role"
  ON public.shift_report_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Index for fast recent-log lookups per tenant
CREATE INDEX IF NOT EXISTS idx_shift_report_logs_tenant_sent
  ON public.shift_report_logs (tenant_id, sent_at DESC);

-- Index for deduplication check (cron: already-sent-today check)
CREATE INDEX IF NOT EXISTS idx_shift_report_logs_tenant_shift_date
  ON public.shift_report_logs (tenant_id, shift_id, sent_at);


----------------------------------------

-- Schedule with Authorization Header
SELECT cron.schedule(
  'shift-report-cron-job',
  '* * * * *',
  $$
    SELECT net.http_post(
      url:='https://uqdxqmouxtdbnveibnoe.supabase.co/functions/v1/shift-report-cron',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJxdG9ka2dwdGRnZmlsaGR1cnh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg4ODY2NTUsImV4cCI6MjA1NDQ2MjY1NX0.1aCVwOODVHXflm0diAQ_xX3vk7mFP0eLBMjvRuabi4Y"}'::jsonb,
      timeout_milliseconds:=10000
    )
  $$
);