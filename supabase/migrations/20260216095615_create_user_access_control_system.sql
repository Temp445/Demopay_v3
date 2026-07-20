/*
  # Create User Access Control System

  1. New Tables
    - `application_screens`
      - Stores all available screens in the application
      - Includes screen name, route, description, and group
    
    - `user_screen_permissions`
      - Stores user-specific screen access permissions
      - Links users to screens with enabled/disabled status
      - Only applies to non-admin users (HR Team and Employee)

  2. Permissions Logic
    - Admin users: Automatic access to all screens (no records needed)
    - HR Team/Employee users: Access controlled by user_screen_permissions table
    - Default behavior: If no permission record exists, screen is enabled by default

  3. Security
    - Enable RLS on all tables
    - Add policies for authenticated users
    - Admins can manage all permissions

  4. Business Rules
    - Admin role is identified by role name 'Admin' or similar
    - Permission checks happen at login and navigation
    - Permissions are role-agnostic (per user, not per role)
*/

-- Application Screens Table
CREATE TABLE IF NOT EXISTS application_screens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  screen_name text NOT NULL,
  screen_route text NOT NULL,
  screen_group text,
  description text,
  display_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id, screen_route)
);

-- User Screen Permissions Table
CREATE TABLE IF NOT EXISTS user_screen_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  screen_id uuid NOT NULL REFERENCES application_screens(id) ON DELETE CASCADE,
  is_enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  UNIQUE(tenant_id, user_id, screen_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_application_screens_tenant ON application_screens(tenant_id);
CREATE INDEX IF NOT EXISTS idx_application_screens_route ON application_screens(screen_route);
CREATE INDEX IF NOT EXISTS idx_user_screen_permissions_tenant ON user_screen_permissions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_screen_permissions_user ON user_screen_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_screen_permissions_screen ON user_screen_permissions(screen_id);

-- Enable Row Level Security
ALTER TABLE application_screens ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_screen_permissions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for application_screens
CREATE POLICY "Users can view own tenant screens"
  ON application_screens FOR SELECT
  TO authenticated
  USING (tenant_id IN (
    SELECT tenant_id FROM auth.users WHERE id = auth.uid()
  ));

CREATE POLICY "Users can insert own tenant screens"
  ON application_screens FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id IN (
    SELECT tenant_id FROM auth.users WHERE id = auth.uid()
  ));

CREATE POLICY "Users can update own tenant screens"
  ON application_screens FOR UPDATE
  TO authenticated
  USING (tenant_id IN (
    SELECT tenant_id FROM auth.users WHERE id = auth.uid()
  ));

CREATE POLICY "Users can delete own tenant screens"
  ON application_screens FOR DELETE
  TO authenticated
  USING (tenant_id IN (
    SELECT tenant_id FROM auth.users WHERE id = auth.uid()
  ));

-- RLS Policies for user_screen_permissions
CREATE POLICY "Users can view own tenant permissions"
  ON user_screen_permissions FOR SELECT
  TO authenticated
  USING (tenant_id IN (
    SELECT tenant_id FROM auth.users WHERE id = auth.uid()
  ));

CREATE POLICY "Users can insert own tenant permissions"
  ON user_screen_permissions FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id IN (
    SELECT tenant_id FROM auth.users WHERE id = auth.uid()
  ));

CREATE POLICY "Users can update own tenant permissions"
  ON user_screen_permissions FOR UPDATE
  TO authenticated
  USING (tenant_id IN (
    SELECT tenant_id FROM auth.users WHERE id = auth.uid()
  ));

CREATE POLICY "Users can delete own tenant permissions"
  ON user_screen_permissions FOR DELETE
  TO authenticated
  USING (tenant_id IN (
    SELECT tenant_id FROM auth.users WHERE id = auth.uid()
  ));

-- Function to check if user has access to a screen
CREATE OR REPLACE FUNCTION check_user_screen_access(
  p_user_id uuid,
  p_screen_route text,
  p_tenant_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_screen_id uuid;
  v_permission_exists boolean;
  v_is_enabled boolean;
  v_is_admin boolean;
BEGIN
  -- Check if user is an admin (admins have access to all screens)
  SELECT EXISTS (
    SELECT 1 FROM employees e
    JOIN roles r ON e.role_id = r.id
    WHERE e.email = (SELECT email FROM auth.users WHERE id = p_user_id)
    AND e.tenant_id = p_tenant_id
    AND LOWER(r.name) LIKE '%admin%'
  ) INTO v_is_admin;
  
  -- If admin, grant access
  IF v_is_admin THEN
    RETURN true;
  END IF;
  
  -- Get screen ID
  SELECT id INTO v_screen_id
  FROM application_screens
  WHERE screen_route = p_screen_route
  AND tenant_id = p_tenant_id;
  
  -- If screen doesn't exist in the table, allow access (backward compatibility)
  IF v_screen_id IS NULL THEN
    RETURN true;
  END IF;
  
  -- Check if permission record exists
  SELECT EXISTS (
    SELECT 1 FROM user_screen_permissions
    WHERE user_id = p_user_id
    AND screen_id = v_screen_id
    AND tenant_id = p_tenant_id
  ) INTO v_permission_exists;
  
  -- If no permission record exists, grant access (default behavior)
  IF NOT v_permission_exists THEN
    RETURN true;
  END IF;
  
  -- Get permission status
  SELECT is_enabled INTO v_is_enabled
  FROM user_screen_permissions
  WHERE user_id = p_user_id
  AND screen_id = v_screen_id
  AND tenant_id = p_tenant_id;
  
  RETURN COALESCE(v_is_enabled, true);
END;
$$;

-- Function to get user accessible screens
CREATE OR REPLACE FUNCTION get_user_accessible_screens(
  p_user_id uuid,
  p_tenant_id uuid
)
RETURNS TABLE (
  screen_id uuid,
  screen_name text,
  screen_route text,
  screen_group text,
  is_enabled boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  -- Check if user is an admin
  SELECT EXISTS (
    SELECT 1 FROM employees e
    JOIN roles r ON e.role_id = r.id
    WHERE e.email = (SELECT email FROM auth.users WHERE id = p_user_id)
    AND e.tenant_id = p_tenant_id
    AND LOWER(r.name) LIKE '%admin%'
  ) INTO v_is_admin;
  
  -- If admin, return all screens as enabled
  IF v_is_admin THEN
    RETURN QUERY
    SELECT 
      s.id,
      s.screen_name,
      s.screen_route,
      s.screen_group,
      true as is_enabled
    FROM application_screens s
    WHERE s.tenant_id = p_tenant_id
    AND s.is_active = true
    ORDER BY s.display_order, s.screen_name;
  ELSE
    -- For non-admin users, return screens with permission status
    RETURN QUERY
    SELECT 
      s.id,
      s.screen_name,
      s.screen_route,
      s.screen_group,
      COALESCE(p.is_enabled, true) as is_enabled
    FROM application_screens s
    LEFT JOIN user_screen_permissions p ON s.id = p.screen_id AND p.user_id = p_user_id
    WHERE s.tenant_id = p_tenant_id
    AND s.is_active = true
    ORDER BY s.display_order, s.screen_name;
  END IF;
END;
$$;

-- Insert default screens for all existing tenants
DO $$
DECLARE
  tenant_record RECORD;
BEGIN
  FOR tenant_record IN SELECT id FROM tenants LOOP
    INSERT INTO application_screens (tenant_id, screen_name, screen_route, screen_group, display_order) VALUES
    (tenant_record.id, 'Dashboard', '/dashboard', 'Main', 1),
    (tenant_record.id, 'Employees', '/dashboard/employees', 'Main', 2),
    (tenant_record.id, 'Face Enrollment', '/dashboard/attendance/face-enrollment', 'Attendance', 3),
    (tenant_record.id, 'Attendance Face', '/dashboard/attendance-face-verify', 'Attendance', 4),
    (tenant_record.id, 'Attendance Log', '/dashboard/attendance-logs', 'Attendance', 5),
    (tenant_record.id, 'Time Stamp Management', '/dashboard/time-stamp-management', 'Attendance', 6),
    (tenant_record.id, 'Leave', '/dashboard/leave', 'Attendance', 7),
    (tenant_record.id, 'Leave Types', '/dashboard/leave/types', 'Attendance', 8),
    (tenant_record.id, 'Shifts', '/dashboard/shifts', 'Scheduling', 9),
    (tenant_record.id, 'Holidays', '/dashboard/holidays', 'Scheduling', 10),
    (tenant_record.id, 'Gate Passes', '/dashboard/gate-passes', 'Main', 11),
    (tenant_record.id, 'Advance Request', '/dashboard/advances/request', 'Advances', 12),
    (tenant_record.id, 'Advance Approval', '/dashboard/advances/approval', 'Advances', 13),
    (tenant_record.id, 'Advance Settings', '/dashboard/advances/settings', 'Advances', 14),
    (tenant_record.id, 'Component Master', '/dashboard/component-master', 'Payroll', 15),
    (tenant_record.id, 'Salary Structures', '/dashboard/salary-structures', 'Payroll', 16),
    (tenant_record.id, 'Structure Assignments', '/dashboard/structure-assignments', 'Payroll', 17),
    (tenant_record.id, 'Payroll Process', '/dashboard/payroll-process', 'Payroll', 18),
    (tenant_record.id, 'Payroll', '/dashboard/payroll', 'Payroll', 19),
    (tenant_record.id, 'Formula Builder', '/dashboard/formula-builder', 'Payroll', 20),
    (tenant_record.id, 'OT Employees', '/dashboard/overtime/employees', 'Overtime', 21),
    (tenant_record.id, 'OT Structures', '/dashboard/overtime/structures', 'Overtime', 22),
    (tenant_record.id, 'OT Approvals', '/dashboard/overtime/approvals', 'Overtime', 23),
    (tenant_record.id, 'OT Processing', '/dashboard/overtime/processing', 'Overtime', 24),
    (tenant_record.id, 'OT Settings', '/dashboard/overtime/settings', 'Overtime', 25),
    (tenant_record.id, 'Statutory', '/dashboard/statutory', 'Settings', 26),
    (tenant_record.id, 'Visitor Log', '/dashboard/visitor-records', 'Main', 27),
    (tenant_record.id, 'Reports', '/dashboard/reports', 'Reports', 28),
    (tenant_record.id, 'Notifications', '/dashboard/notifications', 'Main', 29),
    (tenant_record.id, 'Work Location', '/dashboard/work-location', 'Location', 30),
    (tenant_record.id, 'Work Location Approval', '/dashboard/work-location-approval', 'Location', 31),
    (tenant_record.id, 'Settings', '/dashboard/settings', 'Settings', 32)
    ON CONFLICT (tenant_id, screen_route) DO NOTHING;
  END LOOP;
END $$;