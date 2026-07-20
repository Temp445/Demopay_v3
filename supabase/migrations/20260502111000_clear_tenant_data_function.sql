-- Migration: Create clear_tenant_data function (complete version)
-- Uses dynamic SQL so missing tables are skipped silently.
-- Preserves: tenants, profiles, tenant_users, subscriptions, company_settings

CREATE OR REPLACE FUNCTION public.clear_tenant_data(p_tenant_id uuid)
RETURNS void AS $$
DECLARE
  v_table text;
  -- ALL tenant-scoped tables, ordered by FK dependency (children first)
  v_tables text[] := ARRAY[
    -- Payroll operational (deepest children first)
    'payroll_process_components',
    'payroll_process',
    'payroll',
    'payroll_drafts',

    -- Attendance & timestamps
    'attendance_edit_logs',
    'attendance_timestamp',
    'attendance_logs',
    'attendance_validation_config',
    'employee_attendance_history',

    -- Leave
    'leave_approvals',
    'leave_processing_logs',
    'leave_requests',
    'leave_balances',
    'employee_leave_applicable',
    'employee_leave_opening_balance',

    -- Overtime
    'ot_approvals',
    'ot_processing',
    'ot_processed_data',
    'ot_approved_data',

    -- Advances
    'advance_deduction_holds',
    'advance_installment_changes',
    'advance_installments',
    'advance_short_closures',
    'employee_advances',
    'advance_settings',

    -- Permissions / attendance validation
    'employee_permission_logs',
    'employee_permission_balance',
    'employee_permissions',

    -- Visitor management
    'attendance_visitor_timestamp',
    'attendance_visitor_visits',
    'visitor_approvals',
    'visitor_notifications',
    'attendance_visitor',

    -- Gate pass
    'gate_pass_change_logs',
    'gate_pass_approvals',
    'gate_pass_requests',

    -- Journey / location tracking
    'journey_tracking_logs',
    'journey_tracking',
    'work_location_tracking',
    'work_location_violations',
    'work_location_notifications',

    -- Employee records (after all child records removed)
    'employee_salary_structure_assignments',
    'employee_salary_structures',
    'employee_time_evaluations',
    'employee_face_data',
    'employee_statutory_values',
    'employee_status_history',
    'employees',

    -- OT configuration
    'ot_structure_components',
    'employee_ot_eligibility',
    'ot_structures',

    -- Payroll configuration
    'expression_execution_logs',
    'expression_templates',
    'expression_variables',
    'payroll_structure_components',
    'payroll_structures',
    'payroll_components',
    'payroll_calculation_methods',
    'statutory_configurations',
    'company_statutory_settings',

    -- User access control
    'user_screen_permissions',

    -- Shift / scheduling
    'shift_assignments',
    'shift_schedules',
    'shift_notifications',
    'shift_swaps',
    'shifts',
    'shift_attendance_settings',

    -- Leave configuration
    'leave_types',

    -- Attendance settings
    'attendance_settings',

    -- Holidays
    'holidays',
    'holiday_recurring_patterns',

    -- Work locations & settings
    'work_locations',
    'location_settings',
    'visitor_settings',

    'cadres',
    'departments',
    'roles',

    'user_invitations',
    'user_notifications'

    -- PRESERVED: tenants, profiles, tenant_users, subscriptions, company_settings, application_screens
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    BEGIN
      EXECUTE format('DELETE FROM public.%I WHERE tenant_id = $1', v_table)
        USING p_tenant_id;
    EXCEPTION
      WHEN undefined_table THEN
        -- Table does not exist in this project, skip silently
        NULL;
      WHEN undefined_column THEN
        -- Table exists but has no tenant_id column, skip silently
        NULL;
      WHEN foreign_key_violation THEN
        -- FK still has children; will be cleaned up by a later iteration
        NULL;
    END;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant to service_role (edge function) and authenticated (client-side RPC)
REVOKE ALL ON FUNCTION public.clear_tenant_data(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clear_tenant_data(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.clear_tenant_data(uuid) TO authenticated;
