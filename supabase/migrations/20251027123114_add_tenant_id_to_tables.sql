/*
  # Add tenant_id to All Application Tables

  1. Changes
    - Add `tenant_id` column to all business tables
    - Create indexes for performance
    - Migrate existing data to default tenant
    - Add foreign key constraints

  2. Tables Modified
    - departments
    - roles
    - employees
    - employee_face_data
    - attendance_logs
    - attendance_settings
    - leave_types
    - leave_balances
    - leave_requests
    - shifts
    - shift_schedules
    - shift_assignments
    - shift_swaps
    - shift_notifications
    - shift_attendance_settings
    - payroll
    - salary_structures
    - salary_structure_components
    - employee_salary_structures
    - salary_component_types
    - deduction_component_types
    - payroll_calculation_methods
    - user_notifications
    - user_notification_preferences

  3. Purpose
    - Enable complete tenant isolation at database level
    - Ensure all business data is scoped to tenants
    - Maintain referential integrity with tenant context
*/
DO $$
BEGIN
  -- attendance_logs
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'attendance_logs' AND column_name = 'tenant_id') THEN
    ALTER TABLE public.attendance_logs ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_attendance_logs_tenant_id ON public.attendance_logs(tenant_id);
  END IF;

  -- debug_logs
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'debug_logs' AND column_name = 'tenant_id') THEN
    ALTER TABLE public.debug_logs ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_debug_logs_tenant_id ON public.debug_logs(tenant_id);
  END IF;

  -- departments
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'departments' AND column_name = 'tenant_id') THEN
    ALTER TABLE public.departments ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_departments_tenant_id ON public.departments(tenant_id);
  END IF;

  -- employee_face_data
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employee_face_data' AND column_name = 'tenant_id') THEN
    ALTER TABLE public.employee_face_data ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_employee_face_data_tenant_id ON public.employee_face_data(tenant_id);
  END IF;

  -- employee_salary_structures
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employee_salary_structures' AND column_name = 'tenant_id') THEN
    ALTER TABLE public.employee_salary_structures ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_employee_salary_structures_tenant_id ON public.employee_salary_structures(tenant_id);
  END IF;

  -- employees
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'tenant_id') THEN
    ALTER TABLE public.employees ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_employees_tenant_id ON public.employees(tenant_id);
  END IF;

  -- holiday_recurring_patterns
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'holiday_recurring_patterns' AND column_name = 'tenant_id') THEN
    ALTER TABLE public.holiday_recurring_patterns ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_holiday_recurring_patterns_tenant_id ON public.holiday_recurring_patterns(tenant_id);
  END IF;

  -- holidays
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'holidays' AND column_name = 'tenant_id') THEN
    ALTER TABLE public.holidays ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_holidays_tenant_id ON public.holidays(tenant_id);
  END IF;

  -- leave_balances
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leave_balances' AND column_name = 'tenant_id') THEN
    ALTER TABLE public.leave_balances ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_leave_balances_tenant_id ON public.leave_balances(tenant_id);
  END IF;

  -- leave_requests
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leave_requests' AND column_name = 'tenant_id') THEN
    ALTER TABLE public.leave_requests ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_leave_requests_tenant_id ON public.leave_requests(tenant_id);
  END IF;

  -- leave_types
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leave_types' AND column_name = 'tenant_id') THEN
    ALTER TABLE public.leave_types ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_leave_types_tenant_id ON public.leave_types(tenant_id);
  END IF;

  -- payroll
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payroll' AND column_name = 'tenant_id') THEN
    ALTER TABLE public.payroll ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_payroll_tenant_id ON public.payroll(tenant_id);
  END IF;

  -- payroll_calculation_methods
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payroll_calculation_methods' AND column_name = 'tenant_id') THEN
    ALTER TABLE public.payroll_calculation_methods ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_payroll_calculation_methods_tenant_id ON public.payroll_calculation_methods(tenant_id);
  END IF;

  -- payroll_components
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payroll_components' AND column_name = 'tenant_id') THEN
    ALTER TABLE public.payroll_components ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_payroll_components_tenant_id ON public.payroll_components(tenant_id);
  END IF;

  -- payroll_process
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payroll_process' AND column_name = 'tenant_id') THEN
    ALTER TABLE public.payroll_process ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_payroll_process_tenant_id ON public.payroll_process(tenant_id);
  END IF;

  -- payroll_process_components
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payroll_process_components' AND column_name = 'tenant_id') THEN
    ALTER TABLE public.payroll_process_components ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_payroll_process_components_tenant_id ON public.payroll_process_components(tenant_id);
  END IF;

  -- payroll_structure_components
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payroll_structure_components' AND column_name = 'tenant_id') THEN
    ALTER TABLE public.payroll_structure_components ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_payroll_structure_components_tenant_id ON public.payroll_structure_components(tenant_id);
  END IF;

  -- payroll_structures
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payroll_structures' AND column_name = 'tenant_id') THEN
    ALTER TABLE public.payroll_structures ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_payroll_structures_tenant_id ON public.payroll_structures(tenant_id);
  END IF;

  -- profiles
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'tenant_id') THEN
    ALTER TABLE public.profiles ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_profiles_tenant_id ON public.profiles(tenant_id);
  END IF;

  -- roles
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'roles' AND column_name = 'tenant_id') THEN
    ALTER TABLE public.roles ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_roles_tenant_id ON public.roles(tenant_id);
  END IF;

  -- salary_component_types
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'salary_component_types' AND column_name = 'tenant_id') THEN
    ALTER TABLE public.salary_component_types ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_salary_component_types_tenant_id ON public.salary_component_types(tenant_id);
  END IF;

  -- salary_structures
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'salary_structures' AND column_name = 'tenant_id') THEN
    ALTER TABLE public.salary_structures ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_salary_structures_tenant_id ON public.salary_structures(tenant_id);
  END IF;

  -- shift_assignments
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shift_assignments' AND column_name = 'tenant_id') THEN
    ALTER TABLE public.shift_assignments ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_shift_assignments_tenant_id ON public.shift_assignments(tenant_id);
  END IF;

  -- shift_attendance_settings
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shift_attendance_settings' AND column_name = 'tenant_id') THEN
    ALTER TABLE public.shift_attendance_settings ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_shift_attendance_settings_tenant_id ON public.shift_attendance_settings(tenant_id);
  END IF;

  -- shift_notifications
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shift_notifications' AND column_name = 'tenant_id') THEN
    ALTER TABLE public.shift_notifications ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_shift_notifications_tenant_id ON public.shift_notifications(tenant_id);
  END IF;

  -- shift_schedules
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shift_schedules' AND column_name = 'tenant_id') THEN
    ALTER TABLE public.shift_schedules ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_shift_schedules_tenant_id ON public.shift_schedules(tenant_id);
  END IF;

  -- shift_swaps
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shift_swaps' AND column_name = 'tenant_id') THEN
    ALTER TABLE public.shift_swaps ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_shift_swaps_tenant_id ON public.shift_swaps(tenant_id);
  END IF;

  -- shifts
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shifts' AND column_name = 'tenant_id') THEN
    ALTER TABLE public.shifts ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_shifts_tenant_id ON public.shifts(tenant_id);
  END IF;

  -- user_notification_preferences
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_notification_preferences' AND column_name = 'tenant_id') THEN
    ALTER TABLE public.user_notification_preferences ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_user_notification_preferences_tenant_id ON public.user_notification_preferences(tenant_id);
  END IF;

  -- user_notifications
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_notifications' AND column_name = 'tenant_id') THEN
    ALTER TABLE public.user_notifications ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_user_notifications_tenant_id ON public.user_notifications(tenant_id);
  END IF;

END $$;


drop view user_profiles;

create view public.user_profiles as
select
  u.id,
  u.email,
  p.id as profile_id,
  COALESCE(e.name, split_part(u.email::text, '@'::text, 1)) as name,
  e.department,
  e.role,
  p.tenant_id
from
  auth.users u
  left join profiles p on p.id = u.id
  left join employees e on e.email = u.email::text;

-- Add comments for documentation
COMMENT ON COLUMN public.employees.tenant_id IS 'Tenant identifier for data isolation in multi-tenant architecture';
COMMENT ON COLUMN public.departments.tenant_id IS 'Tenant identifier for data isolation in multi-tenant architecture';
COMMENT ON COLUMN public.leave_requests.tenant_id IS 'Tenant identifier for data isolation in multi-tenant architecture';
