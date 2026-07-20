/*
  # Implement Tenant-Based Row Level Security

  1. Purpose
    - Replace existing RLS policies with tenant-aware policies
    - Ensure complete data isolation between tenants
    - Maintain security while enabling proper access control

  2. Approach
    - Drop existing policies
    - Create new tenant-scoped policies
    - Use helper functions for tenant validation

  3. Security Model
    - Users can only access data from their associated tenants
    - All queries automatically filtered by tenant_id
    - Tenant admins have additional privileges within their tenant
*/

-- ============================================================================
-- PROFILES TABLE POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can read own profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ============================================================================
-- DEPARTMENTS TABLE POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can read departments" ON public.departments;
DROP POLICY IF EXISTS "Users can create departments" ON public.departments;

CREATE POLICY "Users can read departments in their tenant"
  ON public.departments
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (SELECT get_user_tenant_ids())
  );

CREATE POLICY "Users can create departments in their tenant"
  ON public.departments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = get_user_tenant_id()
  );

CREATE POLICY "Users can update departments in their tenant"
  ON public.departments
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (SELECT get_user_tenant_ids())
  )
  WITH CHECK (
    tenant_id IN (SELECT get_user_tenant_ids())
  );

CREATE POLICY "Users can delete departments in their tenant"
  ON public.departments
  FOR DELETE
  TO authenticated
  USING (
    tenant_id IN (SELECT get_user_tenant_ids())
  );

-- ============================================================================
-- ROLES TABLE POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can read roles" ON public.roles;
DROP POLICY IF EXISTS "Users can create roles" ON public.roles;

CREATE POLICY "Users can read roles in their tenant"
  ON public.roles
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (SELECT get_user_tenant_ids())
  );

CREATE POLICY "Users can create roles in their tenant"
  ON public.roles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = get_user_tenant_id()
  );

CREATE POLICY "Users can update roles in their tenant"
  ON public.roles
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (SELECT get_user_tenant_ids())
  )
  WITH CHECK (
    tenant_id IN (SELECT get_user_tenant_ids())
  );

CREATE POLICY "Users can delete roles in their tenant"
  ON public.roles
  FOR DELETE
  TO authenticated
  USING (
    tenant_id IN (SELECT get_user_tenant_ids())
  );

-- ============================================================================
-- EMPLOYEES TABLE POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can read employees" ON public.employees;
DROP POLICY IF EXISTS "Users can insert employees" ON public.employees;
DROP POLICY IF EXISTS "Users can update employees" ON public.employees;
DROP POLICY IF EXISTS "Users can delete employees" ON public.employees;

CREATE POLICY "Users can read employees in their tenant"
  ON public.employees
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (SELECT get_user_tenant_ids())
  );

CREATE POLICY "Users can insert employees in their tenant"
  ON public.employees
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = get_user_tenant_id()
  );

CREATE POLICY "Users can update employees in their tenant"
  ON public.employees
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (SELECT get_user_tenant_ids())
  )
  WITH CHECK (
    tenant_id IN (SELECT get_user_tenant_ids())
  );

CREATE POLICY "Users can delete employees in their tenant"
  ON public.employees
  FOR DELETE
  TO authenticated
  USING (
    tenant_id IN (SELECT get_user_tenant_ids())
  );

-- ============================================================================
-- EMPLOYEE_FACE_DATA TABLE POLICIES
-- ============================================================================

CREATE POLICY "Users can read face data in their tenant"
  ON public.employee_face_data
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (SELECT get_user_tenant_ids())
  );

CREATE POLICY "Users can insert face data in their tenant"
  ON public.employee_face_data
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = get_user_tenant_id()
  );

CREATE POLICY "Users can update face data in their tenant"
  ON public.employee_face_data
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (SELECT get_user_tenant_ids())
  )
  WITH CHECK (
    tenant_id IN (SELECT get_user_tenant_ids())
  );

CREATE POLICY "Users can delete face data in their tenant"
  ON public.employee_face_data
  FOR DELETE
  TO authenticated
  USING (
    tenant_id IN (SELECT get_user_tenant_ids())
  );

-- ============================================================================
-- ATTENDANCE_LOGS TABLE POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their own attendance" ON public.attendance_logs;
DROP POLICY IF EXISTS "Users can create their own attendance" ON public.attendance_logs;
DROP POLICY IF EXISTS "Users can update their own attendance" ON public.attendance_logs;

CREATE POLICY "Users can view attendance in their tenant"
  ON public.attendance_logs
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (SELECT get_user_tenant_ids())
  );

CREATE POLICY "Users can create attendance in their tenant"
  ON public.attendance_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = get_user_tenant_id()
  );

CREATE POLICY "Users can update attendance in their tenant"
  ON public.attendance_logs
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (SELECT get_user_tenant_ids())
  )
  WITH CHECK (
    tenant_id IN (SELECT get_user_tenant_ids())
  );

CREATE POLICY "Users can delete attendance in their tenant"
  ON public.attendance_logs
  FOR DELETE
  TO authenticated
  USING (
    tenant_id IN (SELECT get_user_tenant_ids())
  );

-- ============================================================================
-- ATTENDANCE_SETTINGS TABLE POLICIES
-- ============================================================================

CREATE POLICY "Users can view attendance settings in their tenant"
  ON public.attendance_settings
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (SELECT get_user_tenant_ids())
  );

CREATE POLICY "Users can create attendance settings in their tenant"
  ON public.attendance_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = get_user_tenant_id()
  );

CREATE POLICY "Users can update attendance settings in their tenant"
  ON public.attendance_settings
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (SELECT get_user_tenant_ids())
  )
  WITH CHECK (
    tenant_id IN (SELECT get_user_tenant_ids())
  );

-- ============================================================================
-- LEAVE_TYPES TABLE POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Everyone can view leave types" ON public.leave_types;

CREATE POLICY "Users can view leave types in their tenant"
  ON public.leave_types
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (SELECT get_user_tenant_ids())
  );

CREATE POLICY "Users can create leave types in their tenant"
  ON public.leave_types
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = get_user_tenant_id()
  );

CREATE POLICY "Users can update leave types in their tenant"
  ON public.leave_types
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (SELECT get_user_tenant_ids())
  )
  WITH CHECK (
    tenant_id IN (SELECT get_user_tenant_ids())
  );

CREATE POLICY "Users can delete leave types in their tenant"
  ON public.leave_types
  FOR DELETE
  TO authenticated
  USING (
    tenant_id IN (SELECT get_user_tenant_ids())
  );

-- ============================================================================
-- LEAVE_BALANCES TABLE POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their own leave balances" ON public.leave_balances;

CREATE POLICY "Users can view leave balances in their tenant"
  ON public.leave_balances
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (SELECT get_user_tenant_ids())
  );

CREATE POLICY "Users can create leave balances in their tenant"
  ON public.leave_balances
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = get_user_tenant_id()
  );

CREATE POLICY "Users can update leave balances in their tenant"
  ON public.leave_balances
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (SELECT get_user_tenant_ids())
  )
  WITH CHECK (
    tenant_id IN (SELECT get_user_tenant_ids())
  );

-- ============================================================================
-- LEAVE_REQUESTS TABLE POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their own leave requests" ON public.leave_requests;
DROP POLICY IF EXISTS "Users can create their own leave requests" ON public.leave_requests;
DROP POLICY IF EXISTS "Users can update their own pending leave requests" ON public.leave_requests;

CREATE POLICY "Users can view leave requests in their tenant"
  ON public.leave_requests
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (SELECT get_user_tenant_ids())
  );

CREATE POLICY "Users can create leave requests in their tenant"
  ON public.leave_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = get_user_tenant_id()
  );

CREATE POLICY "Users can update leave requests in their tenant"
  ON public.leave_requests
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (SELECT get_user_tenant_ids())
  )
  WITH CHECK (
    tenant_id IN (SELECT get_user_tenant_ids())
  );

-- ============================================================================
-- SHIFTS TABLE POLICIES
-- ============================================================================

CREATE POLICY "Users can view shifts in their tenant"
  ON public.shifts
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (SELECT get_user_tenant_ids())
  );

CREATE POLICY "Users can create shifts in their tenant"
  ON public.shifts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = get_user_tenant_id()
  );

CREATE POLICY "Users can update shifts in their tenant"
  ON public.shifts
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (SELECT get_user_tenant_ids())
  )
  WITH CHECK (
    tenant_id IN (SELECT get_user_tenant_ids())
  );

CREATE POLICY "Users can delete shifts in their tenant"
  ON public.shifts
  FOR DELETE
  TO authenticated
  USING (
    tenant_id IN (SELECT get_user_tenant_ids())
  );

-- ============================================================================
-- SHIFT_SCHEDULES TABLE POLICIES
-- ============================================================================

CREATE POLICY "Users can view shift schedules in their tenant"
  ON public.shift_schedules
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (SELECT get_user_tenant_ids())
  );

CREATE POLICY "Users can create shift schedules in their tenant"
  ON public.shift_schedules
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = get_user_tenant_id()
  );

CREATE POLICY "Users can update shift schedules in their tenant"
  ON public.shift_schedules
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (SELECT get_user_tenant_ids())
  )
  WITH CHECK (
    tenant_id IN (SELECT get_user_tenant_ids())
  );

CREATE POLICY "Users can delete shift schedules in their tenant"
  ON public.shift_schedules
  FOR DELETE
  TO authenticated
  USING (
    tenant_id IN (SELECT get_user_tenant_ids())
  );

-- ============================================================================
-- SHIFT_ASSIGNMENTS TABLE POLICIES
-- ============================================================================

CREATE POLICY "Users can view shift assignments in their tenant"
  ON public.shift_assignments
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (SELECT get_user_tenant_ids())
  );

CREATE POLICY "Users can create shift assignments in their tenant"
  ON public.shift_assignments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = get_user_tenant_id()
  );

CREATE POLICY "Users can update shift assignments in their tenant"
  ON public.shift_assignments
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (SELECT get_user_tenant_ids())
  )
  WITH CHECK (
    tenant_id IN (SELECT get_user_tenant_ids())
  );

CREATE POLICY "Users can delete shift assignments in their tenant"
  ON public.shift_assignments
  FOR DELETE
  TO authenticated
  USING (
    tenant_id IN (SELECT get_user_tenant_ids())
  );

-- ============================================================================
-- PAYROLL TABLE POLICIES
-- ============================================================================

CREATE POLICY "Users can view payroll in their tenant"
  ON public.payroll
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (SELECT get_user_tenant_ids())
  );

CREATE POLICY "Users can create payroll in their tenant"
  ON public.payroll
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = get_user_tenant_id()
  );

CREATE POLICY "Users can update payroll in their tenant"
  ON public.payroll
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (SELECT get_user_tenant_ids())
  )
  WITH CHECK (
    tenant_id IN (SELECT get_user_tenant_ids())
  );

CREATE POLICY "Users can delete payroll in their tenant"
  ON public.payroll
  FOR DELETE
  TO authenticated
  USING (
    tenant_id IN (SELECT get_user_tenant_ids())
  );

-- ============================================================================
-- SALARY_STRUCTURES TABLE POLICIES
-- ============================================================================

CREATE POLICY "Users can view salary structures in their tenant"
  ON public.salary_structures
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (SELECT get_user_tenant_ids())
  );

CREATE POLICY "Users can create salary structures in their tenant"
  ON public.salary_structures
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = get_user_tenant_id()
  );

CREATE POLICY "Users can update salary structures in their tenant"
  ON public.salary_structures
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (SELECT get_user_tenant_ids())
  )
  WITH CHECK (
    tenant_id IN (SELECT get_user_tenant_ids())
  );

CREATE POLICY "Users can delete salary structures in their tenant"
  ON public.salary_structures
  FOR DELETE
  TO authenticated
  USING (
    tenant_id IN (SELECT get_user_tenant_ids())
  );

-- ============================================================================
-- USER_NOTIFICATIONS TABLE POLICIES
-- ============================================================================

CREATE POLICY "Users can view notifications in their tenant"
  ON public.user_notifications
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (SELECT get_user_tenant_ids()) AND user_id = auth.uid()
  );

CREATE POLICY "Users can create notifications in their tenant"
  ON public.user_notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = get_user_tenant_id()
  );

CREATE POLICY "Users can update their notifications in their tenant"
  ON public.user_notifications
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (SELECT get_user_tenant_ids()) AND user_id = auth.uid()
  )
  WITH CHECK (
    tenant_id IN (SELECT get_user_tenant_ids()) AND user_id = auth.uid()
  );

CREATE POLICY "Users can delete their notifications in their tenant"
  ON public.user_notifications
  FOR DELETE
  TO authenticated
  USING (
    tenant_id IN (SELECT get_user_tenant_ids()) AND user_id = auth.uid()
  );

-- Add policies for remaining tables following the same pattern
-- (shift_swaps, shift_notifications, shift_attendance_settings, etc.)

CREATE POLICY "Users can view shift swaps in their tenant"
  ON public.shift_swaps
  FOR SELECT
  TO authenticated
  USING (tenant_id IN (SELECT get_user_tenant_ids()));

CREATE POLICY "Users can view shift notifications in their tenant"
  ON public.shift_notifications
  FOR SELECT
  TO authenticated
  USING (tenant_id IN (SELECT get_user_tenant_ids()));

CREATE POLICY "Users can view shift attendance settings in their tenant"
  ON public.shift_attendance_settings
  FOR SELECT
  TO authenticated
  USING (tenant_id IN (SELECT get_user_tenant_ids()));

CREATE POLICY "Users can view salary structure components in their tenant"
  ON public.salary_structure_components
  FOR SELECT
  TO authenticated
  USING (tenant_id IN (SELECT get_user_tenant_ids()));

CREATE POLICY "Users can view employee salary structures in their tenant"
  ON public.employee_salary_structures
  FOR SELECT
  TO authenticated
  USING (tenant_id IN (SELECT get_user_tenant_ids()));

CREATE POLICY "Users can view salary component types in their tenant"
  ON public.salary_component_types
  FOR SELECT
  TO authenticated
  USING (tenant_id IN (SELECT get_user_tenant_ids()));

CREATE POLICY "Users can view deduction component types in their tenant"
  ON public.deduction_component_types
  FOR SELECT
  TO authenticated
  USING (tenant_id IN (SELECT get_user_tenant_ids()));

CREATE POLICY "Users can view payroll calculation methods in their tenant"
  ON public.payroll_calculation_methods
  FOR SELECT
  TO authenticated
  USING (tenant_id IN (SELECT get_user_tenant_ids()));

CREATE POLICY "Users can view notification preferences in their tenant"
  ON public.user_notification_preferences
  FOR SELECT
  TO authenticated
  USING (tenant_id IN (SELECT get_user_tenant_ids()) AND user_id = auth.uid());
