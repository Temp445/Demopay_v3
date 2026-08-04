-- =============================================================================
-- Migration: Setup pg_cron for missing-punch-cron Edge Function
-- Run this in Supabase → SQL Editor
-- 
-- IMPORTANT: Replace [YOUR_PROJECT_REF] and [YOUR_ANON_KEY] before running
-- =============================================================================

-- Enable pg_cron and pg_net extensions if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Unschedule if it exists to avoid duplicates
SELECT cron.unschedule('invoke-missing-punch-cron');

-- Schedule the job to run every 5 minutes
SELECT cron.schedule(
    'invoke-missing-punch-cron', -- name of the cron job
    '*/5 * * * *',               -- run every 5 minutes
    $$
    SELECT net.http_post(
        url:='https://rqtodkgptdgfilhdurxv.supabase.co/functions/v1/missing-punch-cron',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer [YOUR_ANON_KEY]"}'::jsonb
    )
    $$
);
