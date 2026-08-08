-- Migration: Fix application_screens seeding
-- 1. Backfill all tenants that are missing application_screens
-- 2. Update handle_new_user to seed screens on new tenant creation

-- ── Step 1: Backfill existing tenants missing application_screens ─────────────
DO $$
DECLARE
  tenant_record RECORD;
BEGIN
  FOR tenant_record IN
    -- Only target tenants that have NO screens at all
    SELECT id FROM public.tenants
    WHERE id NOT IN (SELECT DISTINCT tenant_id FROM public.application_screens WHERE tenant_id IS NOT NULL)
  LOOP
    INSERT INTO public.application_screens (tenant_id, screen_name, screen_route, screen_group, display_order) VALUES
    (tenant_record.id, 'Dashboard', '/dashboard', 'Main', 1),
    (tenant_record.id, 'Employees', '/dashboard/employees', 'Main', 2),
    (tenant_record.id, 'Face Enrollment', '/dashboard/attendance/face-enrollment', 'Attendance', 3),
    (tenant_record.id, 'Attendance Face', '/dashboard/attendance-face-verify', 'Attendance', 4),
    (tenant_record.id, 'Attendance Log', '/dashboard/attendance-logs', 'Attendance', 5),
    (tenant_record.id, 'Time Stamp Management', '/dashboard/time-stamp-management', 'Attendance', 6),
    (tenant_record.id, 'Leave', '/dashboard/leave', 'Attendance', 7),
    (tenant_record.id, 'Leave Types', '/dashboard/leave/types', 'Attendance', 8),
    (tenant_record.id, 'Leave Settings', '/dashboard/leave/settings', 'Attendance', 9),
    (tenant_record.id, 'Attendance Settings', '/dashboard/settings/attendance-settings', 'Attendance', 10),
    (tenant_record.id, 'Shifts', '/dashboard/shifts', 'Scheduling', 11),
    (tenant_record.id, 'Holidays', '/dashboard/holidays', 'Scheduling', 12),
    (tenant_record.id, 'Clock In/Out', '/dashboard/clockin-clockout', 'Attendance', 13),
    (tenant_record.id, 'Permission Request', '/dashboard/permissions/request', 'Permissions', 14),
    (tenant_record.id, 'Permission Approval', '/dashboard/permissions/approval', 'Permissions', 15),
    (tenant_record.id, 'Advance Request', '/dashboard/advances/request', 'Advances', 16),
    (tenant_record.id, 'Advance Approval', '/dashboard/advances/approval', 'Advances', 17),
    (tenant_record.id, 'Advance Settings', '/dashboard/advances/settings', 'Advances', 18),
    (tenant_record.id, 'Component Master', '/dashboard/component-master', 'Payroll', 19),
    (tenant_record.id, 'Salary Structures', '/dashboard/salary-structures', 'Payroll', 20),
    (tenant_record.id, 'Structure Assignments', '/dashboard/structure-assignments', 'Payroll', 21),
    (tenant_record.id, 'Payroll Process', '/dashboard/payroll-process', 'Payroll', 22),
    (tenant_record.id, 'Payroll', '/dashboard/payroll', 'Payroll', 23),
    (tenant_record.id, 'Payslip Sender', '/dashboard/payslip-sender', 'Payroll', 24),
    (tenant_record.id, 'Formula Tester', '/dashboard/formula-tester', 'Payroll', 25),
    (tenant_record.id, 'OT Employees', '/dashboard/overtime/employees', 'Overtime', 26),
    (tenant_record.id, 'OT Structures', '/dashboard/overtime/structures', 'Overtime', 27),
    (tenant_record.id, 'OT Time Stamp', '/dashboard/overtime/approvals', 'Overtime', 28),
    (tenant_record.id, 'OT Processing', '/dashboard/overtime/processing', 'Overtime', 29),
    (tenant_record.id, 'OT Settings', '/dashboard/overtime/settings', 'Overtime', 30),
    (tenant_record.id, 'Statutory', '/dashboard/statutory', 'Settings', 31),
    (tenant_record.id, 'Visitor Log', '/dashboard/visitor-records', 'Main', 32),
    (tenant_record.id, 'Reports', '/dashboard/reports', 'Reports', 33),
    (tenant_record.id, 'Gate Passes', '/dashboard/gate-passes', 'Location', 34),
    (tenant_record.id, 'Work Location Assignment', '/dashboard/work-location-assignment', 'Location', 35),
    (tenant_record.id, 'Travel Allowance Approvals', '/dashboard/travel-allowance-approvals', 'Location', 36),
    (tenant_record.id, 'Location Tracking', '/dashboard/location-tracking', 'Location', 37),
    (tenant_record.id, 'Work Location', '/dashboard/work-location', 'Location', 38),
    (tenant_record.id, 'Work Location Settings', '/dashboard/location-settings', 'Location', 39),
    (tenant_record.id, 'Employee Invite', '/dashboard/employee-invite', 'Settings', 40),
    (tenant_record.id, 'Company Settings', '/dashboard/settings/company-settings', 'Settings', 41),
    (tenant_record.id, 'Profile Settings', '/dashboard/settings/user-settings', 'Settings', 42),
    (tenant_record.id, 'User Management', '/dashboard/settings/user-management', 'Settings', 43),
    (tenant_record.id, 'Employee Reporting', '/dashboard/reporting', 'Settings', 44),
    (tenant_record.id, 'User Access Control', '/dashboard/access-control', 'Settings', 45),
    (tenant_record.id, 'Master Data Import', '/dashboard/settings/master-data-import', 'Settings', 46),
    (tenant_record.id, 'SMTP Configuration', '/dashboard/settings/smtp-configuration', 'Settings', 47),
    (tenant_record.id, 'Shift Attendance Notifier', '/dashboard/settings/shift-attendance-notifier', 'Settings', 48),
    (tenant_record.id, 'Notifications', '/dashboard/notifications', 'Settings', 49),
    (tenant_record.id, 'Biometric Device Manager', '/dashboard/settings/biometric-device-manager', 'Settings', 50),
    (tenant_record.id, 'Billing & Subscriptions', '/dashboard/billing', 'Settings', 51),
    (tenant_record.id, 'Hik Device Controller', '/dashboard/settings/hik-device-controller', 'Settings', 52)
    ON CONFLICT (tenant_id, screen_route) DO NOTHING;
  END LOOP;
END $$;


-- ── Step 2: Create a reusable function to seed screens for a tenant ────────────
CREATE OR REPLACE FUNCTION public.seed_application_screens(p_tenant_id uuid)
RETURNS void AS $$
BEGIN
  INSERT INTO public.application_screens (tenant_id, screen_name, screen_route, screen_group, display_order) VALUES
    (tenant_record.id, 'Dashboard', '/dashboard', 'Main', 1),
    (tenant_record.id, 'Employees', '/dashboard/employees', 'Main', 2),
    (tenant_record.id, 'Face Enrollment', '/dashboard/attendance/face-enrollment', 'Attendance', 3),
    (tenant_record.id, 'Attendance Face', '/dashboard/attendance-face-verify', 'Attendance', 4),
    (tenant_record.id, 'Attendance Log', '/dashboard/attendance-logs', 'Attendance', 5),
    (tenant_record.id, 'Time Stamp Management', '/dashboard/time-stamp-management', 'Attendance', 6),
    (tenant_record.id, 'Leave', '/dashboard/leave', 'Attendance', 7),
    (tenant_record.id, 'Leave Types', '/dashboard/leave/types', 'Attendance', 8),
    (tenant_record.id, 'Leave Settings', '/dashboard/leave/settings', 'Attendance', 9),
    (tenant_record.id, 'Attendance Settings', '/dashboard/settings/attendance-settings', 'Attendance', 10),
    (tenant_record.id, 'Shifts', '/dashboard/shifts', 'Scheduling', 11),
    (tenant_record.id, 'Holidays', '/dashboard/holidays', 'Scheduling', 12),
    (tenant_record.id, 'Clock In/Out', '/dashboard/clockin-clockout', 'Attendance', 13),
    (tenant_record.id, 'Permission Request', '/dashboard/permissions/request', 'Permissions', 14),
    (tenant_record.id, 'Permission Approval', '/dashboard/permissions/approval', 'Permissions', 15),
    (tenant_record.id, 'Advance Request', '/dashboard/advances/request', 'Advances', 16),
    (tenant_record.id, 'Advance Approval', '/dashboard/advances/approval', 'Advances', 17),
    (tenant_record.id, 'Advance Settings', '/dashboard/advances/settings', 'Advances', 18),
    (tenant_record.id, 'Component Master', '/dashboard/component-master', 'Payroll', 19),
    (tenant_record.id, 'Salary Structures', '/dashboard/salary-structures', 'Payroll', 20),
    (tenant_record.id, 'Structure Assignments', '/dashboard/structure-assignments', 'Payroll', 21),
    (tenant_record.id, 'Payroll Process', '/dashboard/payroll-process', 'Payroll', 22),
    (tenant_record.id, 'Payroll', '/dashboard/payroll', 'Payroll', 23),
    (tenant_record.id, 'Payslip Sender', '/dashboard/payslip-sender', 'Payroll', 24),
    (tenant_record.id, 'Formula Tester', '/dashboard/formula-tester', 'Payroll', 25),
    (tenant_record.id, 'OT Employees', '/dashboard/overtime/employees', 'Overtime', 26),
    (tenant_record.id, 'OT Structures', '/dashboard/overtime/structures', 'Overtime', 27),
    (tenant_record.id, 'OT Time Stamp', '/dashboard/overtime/approvals', 'Overtime', 28),
    (tenant_record.id, 'OT Processing', '/dashboard/overtime/processing', 'Overtime', 29),
    (tenant_record.id, 'OT Settings', '/dashboard/overtime/settings', 'Overtime', 30),
    (tenant_record.id, 'Statutory', '/dashboard/statutory', 'Settings', 31),
    (tenant_record.id, 'Visitor Log', '/dashboard/visitor-records', 'Main', 32),
    (tenant_record.id, 'Reports', '/dashboard/reports', 'Reports', 33),
    (tenant_record.id, 'Gate Passes', '/dashboard/gate-passes', 'Location', 34),
    (tenant_record.id, 'Work Location Assignment', '/dashboard/work-location-assignment', 'Location', 35),
    (tenant_record.id, 'Travel Allowance Approvals', '/dashboard/travel-allowance-approvals', 'Location', 36),
    (tenant_record.id, 'Location Tracking', '/dashboard/location-tracking', 'Location', 37),
    (tenant_record.id, 'Work Location', '/dashboard/work-location', 'Location', 38),
    (tenant_record.id, 'Work Location Settings', '/dashboard/location-settings', 'Location', 39),
    (tenant_record.id, 'Employee Invite', '/dashboard/employee-invite', 'Settings', 40),
    (tenant_record.id, 'Company Settings', '/dashboard/settings/company-settings', 'Settings', 41),
    (tenant_record.id, 'Profile Settings', '/dashboard/settings/user-settings', 'Settings', 42),
    (tenant_record.id, 'User Management', '/dashboard/settings/user-management', 'Settings', 43),
    (tenant_record.id, 'Employee Reporting', '/dashboard/reporting', 'Settings', 44),
    (tenant_record.id, 'User Access Control', '/dashboard/access-control', 'Settings', 45),
    (tenant_record.id, 'Master Data Import', '/dashboard/settings/master-data-import', 'Settings', 46),
    (tenant_record.id, 'SMTP Configuration', '/dashboard/settings/smtp-configuration', 'Settings', 47),
    (tenant_record.id, 'Shift Attendance Notifier', '/dashboard/settings/shift-attendance-notifier', 'Settings', 48),
    (tenant_record.id, 'Notifications', '/dashboard/notifications', 'Settings', 49),
    (tenant_record.id, 'Biometric Device Manager', '/dashboard/settings/biometric-device-manager', 'Settings', 50),
    (tenant_record.id, 'Billing & Subscriptions', '/dashboard/billing', 'Settings', 51),
    (tenant_record.id, 'Hik Device Controller', '/dashboard/settings/hik-device-controller', 'Settings', 52)
  ON CONFLICT (tenant_id, screen_route) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ── Step 3: Update handle_new_user to call seed_application_screens ───────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_tenant_id uuid;
  v_subdomain text;
  v_org_name  text;
  v_hostname  text;
  v_domain_subscription boolean := false;
  v_domain_id uuid;
  v_base_config jsonb;
  v_free_trial_available boolean := false;
  v_free_trial_days integer := 7;
  v_trial_plan_name text := 'Elite Trial';
BEGIN

  -- ── Invited user ────────────────────────────────────────────────────────────
  IF (new.raw_user_meta_data->>'is_invite') = 'true' THEN
    v_tenant_id := (new.raw_user_meta_data->>'tenant_id')::uuid;

    INSERT INTO public.profiles (id, email, full_name, tenant_id)
    VALUES (
      new.id,
      new.email,
      new.raw_user_meta_data->>'name',
      v_tenant_id
    )
    ON CONFLICT (id) DO NOTHING;

    IF v_tenant_id IS NOT NULL THEN
      INSERT INTO public.tenant_users (tenant_id, user_id, role, is_primary)
      VALUES (v_tenant_id, new.id, 'user', true)
      ON CONFLICT (tenant_id, user_id) DO NOTHING;
    END IF;

    RETURN new;
  END IF;

  -- ── Normal (admin) registration ─────────────────────────────────────────────
  v_org_name  := COALESCE(new.raw_user_meta_data->>'company_name', 'My Organization');
  v_subdomain := LOWER(REPLACE(REPLACE(SPLIT_PART(new.email, '@', 1), '.', ''), ' ', '-'))
                 || '-' || SUBSTRING(new.id::text FROM 1 FOR 8);
  v_hostname  := new.raw_user_meta_data->>'hostname';

  -- Check if domains_management has subscription_enabled = true for this hostname
  IF v_hostname IS NOT NULL THEN
    SELECT id, subscription_enabled, free_trial_available, free_trial_days, trial_plan_name
      INTO v_domain_id, v_domain_subscription, v_free_trial_available, v_free_trial_days, v_trial_plan_name
    FROM public.domains_management
    WHERE domain_name = v_hostname AND is_active = true
    LIMIT 1;

    IF v_domain_id IS NOT NULL THEN
      SELECT config INTO v_base_config
      FROM public.domain_configurations
      WHERE domain_id = v_domain_id AND tenant_id IS NULL
      LIMIT 1;

      IF v_base_config IS NULL THEN
        SELECT config INTO v_base_config
        FROM public.domain_configurations
        WHERE domain_id = v_domain_id
        LIMIT 1;
      END IF;
    END IF;
  END IF;

  -- 1. Create the tenant / organization
  INSERT INTO public.tenants (name, subdomain, subscription_enabled)
  VALUES (v_org_name, v_subdomain, COALESCE(v_domain_subscription, false))
  RETURNING id INTO v_tenant_id;

  -- 1.5. Link the tenant to the domain configuration
  IF v_domain_id IS NOT NULL AND v_base_config IS NOT NULL THEN
    INSERT INTO public.domain_configurations (domain_id, tenant_id, config)
    VALUES (v_domain_id, v_tenant_id, v_base_config)
    ON CONFLICT ON CONSTRAINT domain_configurations_domain_id_tenant_id_key DO NOTHING;
  END IF;

  -- 2. Create the company_settings record
  INSERT INTO public.company_settings (tenant_id, company_name, email, phone)
  VALUES (
    v_tenant_id,
    v_org_name,
    new.email,
    new.raw_user_meta_data->>'mobile_number'
  ) ON CONFLICT (tenant_id) DO UPDATE SET
    company_name = EXCLUDED.company_name,
    email        = EXCLUDED.email,
    phone        = EXCLUDED.phone;

  -- 3. Insert user profile as Admin
  INSERT INTO public.profiles (id, email, user_role, tenant_id, full_name, phone)
  VALUES (
    new.id,
    new.email,
    'Admin',
    v_tenant_id,
    new.raw_user_meta_data->>'name',
    new.raw_user_meta_data->>'mobile_number'
  );

  -- 4. Link user to tenant as the primary administrator
  INSERT INTO public.tenant_users (tenant_id, user_id, role, is_primary)
  VALUES (v_tenant_id, new.id, 'tenant_admin', true);

  -- 5. Seed default application screens for the new tenant
  PERFORM public.seed_application_screens(v_tenant_id);

  -- 6. Automatically create trial subscription if enabled for the domain
  IF v_free_trial_available THEN
    INSERT INTO public.subscriptions (
      tenant_id, email, name, company, plan_name, billing_cycle, amount_paid,
      razorpay_order_id, razorpay_payment_id, razorpay_signature, status, created_at, expires_at
    ) VALUES (
      v_tenant_id,
      new.email,
      new.raw_user_meta_data->>'name',
      v_org_name,
      v_trial_plan_name,
      v_free_trial_days || ' Days',
      0,
      'trial_' || REPLACE(new.id::text, '-', ''),
      'trial_' || REPLACE(new.id::text, '-', ''),
      'trial_generated',
      'active',
      now(),
      now() + (v_free_trial_days || ' days')::interval
    );
  END IF;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
