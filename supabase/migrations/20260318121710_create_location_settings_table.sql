/*
  # Create Location Settings Table

  ## Summary
  Creates a per-tenant configuration table for controlling location-related system behavior.

  ## New Tables
  - `location_settings` - Stores toggles and configuration for the location tracking system per tenant

  ## Columns
  - `id` (uuid, PK)
  - `tenant_id` (uuid, FK → tenants)
  - `live_tracking_enabled` (boolean, default true)
  - `radius_monitoring_enabled` (boolean, default true)
  - `work_event_notifications_enabled` (boolean, default true)
  - `violation_notifications_enabled` (boolean, default true)
  - `created_at`, `updated_at` timestamps

  ## Security
  - RLS enabled with SELECT / INSERT / UPDATE policies via tenant_users membership
*/

CREATE TABLE IF NOT EXISTS location_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  live_tracking_enabled boolean NOT NULL DEFAULT true,
  radius_monitoring_enabled boolean NOT NULL DEFAULT true,
  work_event_notifications_enabled boolean NOT NULL DEFAULT true,
  violation_notifications_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id)
);

ALTER TABLE location_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view location settings"
  ON location_settings FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Tenant members can insert location settings"
  ON location_settings FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Tenant members can update location settings"
  ON location_settings FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
    )
  );
