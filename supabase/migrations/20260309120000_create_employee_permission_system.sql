/*
  # Employee Permission System

  1. New Tables
    - employee_permissions: Store permission requests
    - employee_permission_logs: Audit log for all changes

  2. Security
    - Enable RLS on both tables
    - Employees can manage their own requests
    - Authorized users can approve/reject requests
*/

-- Create employee_permissions table
CREATE TABLE IF NOT EXISTS employee_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  start_time time NOT NULL,
  end_date date NOT NULL,
  end_time time NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  requested_by uuid NOT NULL REFERENCES auth.users(id),
  approved_by uuid REFERENCES auth.users(id),
  approval_date timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create employee_permission_logs table
CREATE TABLE IF NOT EXISTS employee_permission_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permission_id uuid NOT NULL REFERENCES employee_permissions(id) ON DELETE CASCADE,
  modified_by uuid NOT NULL REFERENCES auth.users(id),
  field_name text NOT NULL,
  old_value text,
  new_value text,
  modified_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_employee_permissions_tenant_id ON employee_permissions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_employee_permissions_employee_id ON employee_permissions(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_permissions_status ON employee_permissions(status);
CREATE INDEX IF NOT EXISTS idx_employee_permissions_requested_by ON employee_permissions(requested_by);
CREATE INDEX IF NOT EXISTS idx_permission_logs_permission_id ON employee_permission_logs(permission_id);

-- Enable RLS
ALTER TABLE employee_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_permission_logs ENABLE ROW LEVEL SECURITY;

-- Policies for employee_permissions
CREATE POLICY "Employees can view own permission requests"
  ON employee_permissions FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (SELECT tenant_id FROM employees WHERE user_id = auth.uid())
    AND employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
  );

CREATE POLICY "Authorized users can view all permission requests"
  ON employee_permissions FOR SELECT
  TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM employees WHERE user_id = auth.uid()));

CREATE POLICY "Employees can create permission requests"
  ON employee_permissions FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM employees WHERE user_id = auth.uid())
    AND requested_by = auth.uid()
  );

CREATE POLICY "Employees can update own pending requests"
  ON employee_permissions FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (SELECT tenant_id FROM employees WHERE user_id = auth.uid())
    AND employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
    AND status = 'pending'
  )
  WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM employees WHERE user_id = auth.uid())
    AND employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
  );

CREATE POLICY "Authorized users can update permission requests"
  ON employee_permissions FOR UPDATE
  TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM employees WHERE user_id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM employees WHERE user_id = auth.uid()));

-- Policies for logs
CREATE POLICY "Users can view permission logs"
  ON employee_permission_logs FOR SELECT
  TO authenticated
  USING (
    permission_id IN (
      SELECT id FROM employee_permissions
      WHERE tenant_id IN (SELECT tenant_id FROM employees WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Users can create permission logs"
  ON employee_permission_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    modified_by = auth.uid()
    AND permission_id IN (
      SELECT id FROM employee_permissions
      WHERE tenant_id IN (SELECT tenant_id FROM employees WHERE user_id = auth.uid())
    )
  );

-- Triggers
CREATE OR REPLACE FUNCTION update_employee_permission_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_employee_permissions_timestamp ON employee_permissions;
CREATE TRIGGER update_employee_permissions_timestamp
  BEFORE UPDATE ON employee_permissions
  FOR EACH ROW
  EXECUTE FUNCTION update_employee_permission_timestamp();

CREATE OR REPLACE FUNCTION log_permission_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.start_date IS DISTINCT FROM NEW.start_date THEN
    INSERT INTO employee_permission_logs (permission_id, modified_by, field_name, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'start_date', OLD.start_date::text, NEW.start_date::text);
  END IF;

  IF OLD.start_time IS DISTINCT FROM NEW.start_time THEN
    INSERT INTO employee_permission_logs (permission_id, modified_by, field_name, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'start_time', OLD.start_time::text, NEW.start_time::text);
  END IF;

  IF OLD.end_date IS DISTINCT FROM NEW.end_date THEN
    INSERT INTO employee_permission_logs (permission_id, modified_by, field_name, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'end_date', OLD.end_date::text, NEW.end_date::text);
  END IF;

  IF OLD.end_time IS DISTINCT FROM NEW.end_time THEN
    INSERT INTO employee_permission_logs (permission_id, modified_by, field_name, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'end_time', OLD.end_time::text, NEW.end_time::text);
  END IF;

  IF OLD.reason IS DISTINCT FROM NEW.reason THEN
    INSERT INTO employee_permission_logs (permission_id, modified_by, field_name, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'reason', OLD.reason, NEW.reason);
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO employee_permission_logs (permission_id, modified_by, field_name, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'status', OLD.status, NEW.status);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS log_employee_permission_changes ON employee_permissions;
CREATE TRIGGER log_employee_permission_changes
  AFTER UPDATE ON employee_permissions
  FOR EACH ROW
  EXECUTE FUNCTION log_permission_changes();
