/*
  # Update Visitor Management System

  1. Updates
    - Add missing fields to attendance_visitor table
    - Create new related tables
    - Add RLS policies
    - Create helper functions and triggers

  2. Security
    - Enable RLS on all tables
    - Policies for authenticated users based on tenant
*/

-- Add tenant_id to attendance_visitor if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'attendance_visitor' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE attendance_visitor ADD COLUMN tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_attendance_visitor_tenant_id ON attendance_visitor(tenant_id);
  END IF;
END $$;

-- Rename and add columns to attendance_visitor
DO $$
BEGIN
  -- Rename photo to visitor_image_data if needed
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'attendance_visitor' AND column_name = 'photo'
  ) THEN
    ALTER TABLE attendance_visitor RENAME COLUMN photo TO visitor_image_data;
  END IF;

  -- Rename total_visits to visit_count if needed
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'attendance_visitor' AND column_name = 'total_visits'
  ) THEN
    ALTER TABLE attendance_visitor RENAME COLUMN total_visits TO visit_count;
  END IF;

  -- Add new columns if they don't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'attendance_visitor' AND column_name = 'visitor_image'
  ) THEN
    ALTER TABLE attendance_visitor ADD COLUMN visitor_image text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'attendance_visitor' AND column_name = 'visitor_name'
  ) THEN
    ALTER TABLE attendance_visitor ADD COLUMN visitor_name text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'attendance_visitor' AND column_name = 'email'
  ) THEN
    ALTER TABLE attendance_visitor ADD COLUMN email text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'attendance_visitor' AND column_name = 'phone_number'
  ) THEN
    ALTER TABLE attendance_visitor ADD COLUMN phone_number text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'attendance_visitor' AND column_name = 'employee_to_visit'
  ) THEN
    ALTER TABLE attendance_visitor ADD COLUMN employee_to_visit uuid REFERENCES employees(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'attendance_visitor' AND column_name = 'reason_for_visit'
  ) THEN
    ALTER TABLE attendance_visitor ADD COLUMN reason_for_visit text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'attendance_visitor' AND column_name = 'visitor_status'
  ) THEN
    ALTER TABLE attendance_visitor ADD COLUMN visitor_status text DEFAULT 'pending' CHECK (visitor_status IN ('pending', 'approved', 'rejected', 'verification_pending'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'attendance_visitor' AND column_name = 'first_detected_at'
  ) THEN
    ALTER TABLE attendance_visitor ADD COLUMN first_detected_at timestamptz DEFAULT now();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'attendance_visitor' AND column_name = 'last_visit_at'
  ) THEN
    ALTER TABLE attendance_visitor ADD COLUMN last_visit_at timestamptz DEFAULT now();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'attendance_visitor' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE attendance_visitor ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
END $$;

-- Update attendance_visitor_timestamp table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'attendance_visitor_timestamp' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE attendance_visitor_timestamp ADD COLUMN tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'attendance_visitor_timestamp' AND column_name = 'is_confirmed'
  ) THEN
    ALTER TABLE attendance_visitor_timestamp ADD COLUMN is_confirmed boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'attendance_visitor_timestamp' AND column_name = 'confirmed_by'
  ) THEN
    ALTER TABLE attendance_visitor_timestamp ADD COLUMN confirmed_by uuid REFERENCES auth.users(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'attendance_visitor_timestamp' AND column_name = 'confirmed_at'
  ) THEN
    ALTER TABLE attendance_visitor_timestamp ADD COLUMN confirmed_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'attendance_visitor_timestamp' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE attendance_visitor_timestamp ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
END $$;

-- Create visitor_approvals table
CREATE TABLE IF NOT EXISTS visitor_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  visitor_id uuid NOT NULL REFERENCES attendance_visitor(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('approved', 'rejected')),
  reason text,
  approved_by uuid NOT NULL REFERENCES auth.users(id),
  approved_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Create visitor_notifications table
CREATE TABLE IF NOT EXISTS visitor_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  visitor_id uuid NOT NULL REFERENCES attendance_visitor(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  notification_type text NOT NULL CHECK (notification_type IN ('pending_approval', 'approved', 'rejected', 'visitor_arrived', 'visitor_left', 'confirmation_required')),
  message text NOT NULL,
  is_read boolean DEFAULT false,
  read_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Create visitor_settings table
CREATE TABLE IF NOT EXISTS visitor_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid UNIQUE NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  enable_employee_notifications boolean DEFAULT true,
  require_employee_approval boolean DEFAULT true,
  require_exit_confirmation boolean DEFAULT true,
  allow_automatic_entry boolean DEFAULT false,
  face_match_threshold decimal(3,2) DEFAULT 0.60,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_attendance_visitor_status ON attendance_visitor(visitor_status);
CREATE INDEX IF NOT EXISTS idx_attendance_visitor_employee ON attendance_visitor(employee_to_visit);
CREATE INDEX IF NOT EXISTS idx_visitor_timestamp_tenant_id ON attendance_visitor_timestamp(tenant_id);
CREATE INDEX IF NOT EXISTS idx_visitor_approvals_visitor_id ON visitor_approvals(visitor_id);
CREATE INDEX IF NOT EXISTS idx_visitor_approvals_employee_id ON visitor_approvals(employee_id);
CREATE INDEX IF NOT EXISTS idx_visitor_notifications_employee_id ON visitor_notifications(employee_id);
CREATE INDEX IF NOT EXISTS idx_visitor_notifications_is_read ON visitor_notifications(is_read);

-- Enable RLS
ALTER TABLE attendance_visitor ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_visitor_timestamp ENABLE ROW LEVEL SECURITY;
ALTER TABLE visitor_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE visitor_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE visitor_settings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist and recreate
DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can view visitors in their tenant" ON attendance_visitor;
  DROP POLICY IF EXISTS "Users can insert visitors in their tenant" ON attendance_visitor;
  DROP POLICY IF EXISTS "Users can update visitors in their tenant" ON attendance_visitor;
  DROP POLICY IF EXISTS "Users can delete visitors in their tenant" ON attendance_visitor;
END $$;

-- Policies for attendance_visitor (simplified - all authenticated users in tenant)
CREATE POLICY "Users can view visitors in their tenant"
  ON attendance_visitor FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM employees WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );

CREATE POLICY "Users can insert visitors in their tenant"
  ON attendance_visitor FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM employees WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );

CREATE POLICY "Users can update visitors in their tenant"
  ON attendance_visitor FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM employees WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );

CREATE POLICY "Users can delete visitors in their tenant"
  ON attendance_visitor FOR DELETE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM employees WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );

-- Policies for attendance_visitor_timestamp
CREATE POLICY "Users can view visitor timestamps in their tenant"
  ON attendance_visitor_timestamp FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM employees WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );

CREATE POLICY "Users can insert visitor timestamps in their tenant"
  ON attendance_visitor_timestamp FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM employees WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );

CREATE POLICY "Users can update visitor timestamps in their tenant"
  ON attendance_visitor_timestamp FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM employees WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );

-- Policies for visitor_approvals
CREATE POLICY "Users can view visitor approvals in their tenant"
  ON visitor_approvals FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM employees WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );

CREATE POLICY "Users can create approvals in their tenant"
  ON visitor_approvals FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM employees WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );

-- Policies for visitor_notifications
CREATE POLICY "Employees can view notifications in their tenant"
  ON visitor_notifications FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM employees WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );

CREATE POLICY "Users can insert notifications in their tenant"
  ON visitor_notifications FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM employees WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );

CREATE POLICY "Users can update notifications in their tenant"
  ON visitor_notifications FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM employees WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );

-- Policies for visitor_settings
CREATE POLICY "Users can view visitor settings in their tenant"
  ON visitor_settings FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM employees WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );

CREATE POLICY "Users can insert visitor settings in their tenant"
  ON visitor_settings FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM employees WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );

CREATE POLICY "Users can update visitor settings in their tenant"
  ON visitor_settings FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM employees WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_visitor_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_attendance_visitor_updated_at ON attendance_visitor;
CREATE TRIGGER update_attendance_visitor_updated_at
  BEFORE UPDATE ON attendance_visitor
  FOR EACH ROW
  EXECUTE FUNCTION update_visitor_updated_at();

DROP TRIGGER IF EXISTS update_visitor_timestamp_updated_at ON attendance_visitor_timestamp;
CREATE TRIGGER update_visitor_timestamp_updated_at
  BEFORE UPDATE ON attendance_visitor_timestamp
  FOR EACH ROW
  EXECUTE FUNCTION update_visitor_updated_at();

DROP TRIGGER IF EXISTS update_visitor_settings_updated_at ON visitor_settings;
CREATE TRIGGER update_visitor_settings_updated_at
  BEFORE UPDATE ON visitor_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_visitor_updated_at();