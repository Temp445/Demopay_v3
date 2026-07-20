/*
  # SMTP Configuration Table Migration

  1. New Tables
    - `smtp_configurations`
      - `id` (uuid, primary key) - Unique identifier for the configuration
      - `tenant_id` (uuid, foreign key) - References tenants table for multi-tenancy
      - `host` (text) - SMTP server hostname or IP address
      - `port` (integer) - SMTP server port number
      - `username` (text) - SMTP authentication username
      - `password` (text) - SMTP authentication password (should be encrypted in production)
      - `encryption` (text) - Encryption type: 'ssl', 'tls', or 'none'
      - `sender_email` (text) - Email address that appears in "From" field
      - `sender_name` (text) - Display name for the sender
      - `is_active` (boolean) - Whether this configuration is currently active
      - `created_at` (timestamptz) - Timestamp when configuration was created
      - `updated_at` (timestamptz) - Timestamp when configuration was last updated

  2. Security
    - Enable RLS on `smtp_configurations` table
    - Add policies for authenticated users to manage their tenant's SMTP configuration
    - Only allow users to access SMTP configurations for their own tenant

  3. Indexes
    - Index on tenant_id for fast lookups
    - Unique constraint on tenant_id to ensure one configuration per tenant
*/

-- Create smtp_configurations table
CREATE TABLE IF NOT EXISTS smtp_configurations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  host text NOT NULL,
  port integer NOT NULL CHECK (port > 0 AND port <= 65535),
  username text NOT NULL,
  password text NOT NULL,
  encryption text NOT NULL CHECK (encryption IN ('ssl', 'tls', 'none')),
  sender_email text NOT NULL CHECK (sender_email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  sender_name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add unique constraint to ensure one SMTP configuration per tenant
ALTER TABLE smtp_configurations
ADD CONSTRAINT smtp_configurations_tenant_id_key UNIQUE (tenant_id);

-- Create index on tenant_id for performance
CREATE INDEX IF NOT EXISTS smtp_configurations_tenant_id_idx
ON smtp_configurations(tenant_id);

-- Enable Row Level Security
ALTER TABLE smtp_configurations ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own tenant's SMTP configuration
CREATE POLICY "Users can view own tenant SMTP configuration"
  ON smtp_configurations
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id
      FROM user_tenants
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can insert SMTP configuration for their tenant
CREATE POLICY "Users can insert SMTP configuration for own tenant"
  ON smtp_configurations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id
      FROM user_tenants
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can update their own tenant's SMTP configuration
CREATE POLICY "Users can update own tenant SMTP configuration"
  ON smtp_configurations
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id
      FROM user_tenants
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id
      FROM user_tenants
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can delete their own tenant's SMTP configuration
CREATE POLICY "Users can delete own tenant SMTP configuration"
  ON smtp_configurations
  FOR DELETE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id
      FROM user_tenants
      WHERE user_id = auth.uid()
    )
  );

-- Create function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_smtp_configurations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at on changes
CREATE TRIGGER update_smtp_configurations_updated_at
  BEFORE UPDATE ON smtp_configurations
  FOR EACH ROW
  EXECUTE FUNCTION update_smtp_configurations_updated_at();

-- Add comment to table
COMMENT ON TABLE smtp_configurations IS 'Stores SMTP email server configuration for each tenant';
COMMENT ON COLUMN smtp_configurations.host IS 'SMTP server hostname or IP address';
COMMENT ON COLUMN smtp_configurations.port IS 'SMTP server port (1-65535)';
COMMENT ON COLUMN smtp_configurations.encryption IS 'Encryption type: ssl, tls, or none';
COMMENT ON COLUMN smtp_configurations.sender_email IS 'Email address shown in From field';
COMMENT ON COLUMN smtp_configurations.sender_name IS 'Display name for sender';
COMMENT ON COLUMN smtp_configurations.is_active IS 'Whether configuration is currently enabled';
