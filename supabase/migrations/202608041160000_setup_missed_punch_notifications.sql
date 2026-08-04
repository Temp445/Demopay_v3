-- =============================================================================
-- Migration: Create missed_punch_notification_settings table
-- Run this in Supabase → SQL Editor
-- =============================================================================

CREATE TABLE IF NOT EXISTS missed_punch_notification_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  
  -- Master Enable
  is_enabled boolean NOT NULL DEFAULT true,
  
  -- Delivery Methods
  notify_via_email boolean NOT NULL DEFAULT true,
  notify_via_app boolean NOT NULL DEFAULT true,
  
  -- Recipients
  notify_employee boolean NOT NULL DEFAULT true,
  notify_reporting_head boolean NOT NULL DEFAULT true,
  notify_hr_admin boolean NOT NULL DEFAULT false,
  
  -- Configuration
  grace_buffer_start_minutes int NOT NULL DEFAULT 30,
  grace_buffer_end_minutes int NOT NULL DEFAULT 30,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT missed_punch_notif_settings_tenant_unique UNIQUE (tenant_id)
);

-- Index for fast tenant lookup
CREATE INDEX IF NOT EXISTS idx_missed_punch_notif_settings_tenant
  ON missed_punch_notification_settings (tenant_id);

-- Row Level Security
ALTER TABLE missed_punch_notification_settings ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users in the same tenant to read/write their own settings
CREATE POLICY "Tenant access" 
  ON missed_punch_notification_settings 
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid() LIMIT 1))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid() LIMIT 1));
