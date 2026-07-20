create table public.hik_device_settings (
  id uuid not null default extensions.uuid_generate_v4 (),
  device_ip text not null,
  admin_user text not null,
  admin_password text not null,
  sync_interval_minutes integer null default 5,
  is_enabled boolean null default false,
  updated_at timestamp with time zone null default now(),
  tenant_id uuid not null,
  enable_auto_sync boolean not null default false,
  sync_mode text not null default 'INTERVAL'::text,
  auto_employee_upload boolean not null default false,
  device_name text not null default 'Main Device'::text,
  constraint hik_device_settings_pkey primary key (id),
  constraint hik_device_settings_tenant_id_fkey foreign KEY (tenant_id) references tenants (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_hik_device_settings_tenant_id on public.hik_device_settings using btree (tenant_id) TABLESPACE pg_default;

create trigger hik_device_settings_updated_at BEFORE
update on hik_device_settings for EACH row
execute FUNCTION handle_updated_at ();


-- hik_device_employees

create table public.hik_device_employees (
  id uuid not null default extensions.uuid_generate_v4 (),
  tenant_id uuid not null,
  employee_id uuid not null,
  employee_code text not null,
  device_employee_no text not null,
  upload_status text not null default 'not_uploaded'::text,
  has_face boolean not null default false,
  uploaded_at timestamp with time zone null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  settings_id uuid null,
  constraint hik_device_employees_pkey primary key (id),
  constraint hik_device_employees_tenant_device_employee_key unique (tenant_id, employee_id, settings_id),
  constraint hik_device_employees_employee_id_fkey foreign KEY (employee_id) references employees (id) on delete CASCADE,
  constraint hik_device_employees_settings_id_fkey foreign KEY (settings_id) references hik_device_settings (id) on delete CASCADE,
  constraint hik_device_employees_tenant_id_fkey foreign KEY (tenant_id) references tenants (id) on delete CASCADE,
  constraint hik_device_employees_upload_status_check check (
    (
      upload_status = any (
        array[
          'uploaded'::text,
          'not_uploaded'::text,
          'failed'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_hik_device_employees_settings_id on public.hik_device_employees using btree (settings_id) TABLESPACE pg_default;

create index IF not exists idx_hik_device_employees_tenant_id on public.hik_device_employees using btree (tenant_id) TABLESPACE pg_default;

create trigger hik_device_employees_updated_at BEFORE
update on hik_device_employees for EACH row
execute FUNCTION handle_updated_at ();


-- hik_attendance_events

create table public.hik_attendance_events (
  id uuid not null default extensions.uuid_generate_v4 (),
  employee_id text not null,
  event_time timestamp with time zone not null,
  device_ip text null,
  raw_data jsonb null,
  created_at timestamp with time zone null default now(),
  tenant_id uuid null,
  constraint hik_attendance_events_pkey primary key (id),
  constraint unique_employee_event_time unique (tenant_id, employee_id, event_time)
) TABLESPACE pg_default;

create trigger trg_push_hik_event
after INSERT on hik_attendance_events for EACH row
execute FUNCTION process_hik_event_to_attendance ();


--attendance_validation_config:

create table public.attendance_validation_config (
  id uuid not null default gen_random_uuid (),
  tenant_id uuid not null,
  entry_grace_time_minutes integer not null default 15,
  exit_grace_time_minutes integer not null default 15,
  late_entry_limit_minutes integer not null default 30,
  total_allowed_late_entry_count integer not null default 5,
  early_exit_limit_minutes integer not null default 30,
  total_allowed_early_exit_count integer not null default 5,
  min_permission_minutes integer not null default 30,
  max_permission_minutes integer not null default 60,
  total_permission_minutes_per_month integer not null default 180,
  permission_round_up_to_minutes integer not null default 30,
  enable_half_day_rules boolean not null default true,
  is_active boolean null default true,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  allow_manual_clock_in_out boolean not null default false,
  constraint attendance_validation_config_pkey primary key (id),
  constraint attendance_validation_config_tenant_id_key unique (tenant_id),
  constraint attendance_validation_config_tenant_id_fkey foreign KEY (tenant_id) references tenants (id) on delete CASCADE,
  constraint attendance_validation_config_exit_grace_time_minutes_check check ((exit_grace_time_minutes >= 0)),
  constraint attendance_validation_config_late_entry_limit_minutes_check check ((late_entry_limit_minutes >= 0)),
  constraint attendance_validation_config_min_permission_minutes_check check ((min_permission_minutes >= 0)),
  constraint attendance_validation_config_permission_round_up_to_minut_check check ((permission_round_up_to_minutes > 0)),
  constraint attendance_validation_config_total_allowed_early_exit_cou_check check ((total_allowed_early_exit_count >= 0)),
  constraint attendance_validation_config_total_allowed_late_entry_cou_check check ((total_allowed_late_entry_count >= 0)),
  constraint attendance_validation_config_check check (
    (max_permission_minutes >= min_permission_minutes)
  ),
  constraint attendance_validation_config_total_permission_minutes_per_check check ((total_permission_minutes_per_month >= 0)),
  constraint attendance_validation_config_early_exit_limit_minutes_check check ((early_exit_limit_minutes >= 0)),
  constraint attendance_validation_config_entry_grace_time_minutes_check check ((entry_grace_time_minutes >= 0))
) TABLESPACE pg_default;

create trigger attendance_validation_config_updated_at BEFORE
update on attendance_validation_config for EACH row
execute FUNCTION handle_updated_at ();

create trigger trigger_sync_config_to_balances
after
update on attendance_validation_config for EACH row
execute FUNCTION sync_config_to_permission_balances ();

-----------------------------------------------------------------------------------------------------------------------------

Functions :


-- 1. Create the Function
CREATE OR REPLACE FUNCTION process_hik_event_to_attendance()
RETURNS TRIGGER AS $$
DECLARE
    v_employee_uuid UUID;
    v_cooldown_minutes INT;
    v_last_punch TIMESTAMP WITH TIME ZONE;
    v_last_entry TEXT;
    v_new_entry TEXT;
    
    -- Variables for Shift Tracking
    v_shift_id UUID; 
    v_shift_start TIME;
    v_shift_end TIME;
    v_shift_type TEXT;
    
    -- Variables for Timing Logic
    v_event_date DATE;
    v_expected_start TIMESTAMP WITH TIME ZONE;
    v_expected_end TIMESTAMP WITH TIME ZONE;
    v_timing_status TEXT;
BEGIN
    -- Step 1: Get employee UUID
    SELECT id INTO v_employee_uuid
    FROM public.employees
    WHERE employee_code = NEW.employee_id AND tenant_id = NEW.tenant_id
    LIMIT 1;

    IF v_employee_uuid IS NULL THEN
        RETURN NEW; 
    END IF;

    -- Step 2: Get Cooldown Setting
    SELECT COALESCE(biometric_cooldown_minutes, 5) INTO v_cooldown_minutes
    FROM public.company_settings
    WHERE tenant_id = NEW.tenant_id
    LIMIT 1;

    -- Step 3 & 4: Cooldown Check
    SELECT "timestamp", entry INTO v_last_punch, v_last_entry
    FROM public.attendance_timestamp
    WHERE employee_id = v_employee_uuid AND tenant_id = NEW.tenant_id
    ORDER BY "timestamp" DESC
    LIMIT 1;

    IF v_last_punch IS NOT NULL THEN
        IF ABS(EXTRACT(EPOCH FROM (NEW.event_time - v_last_punch))) <= (v_cooldown_minutes * 60) THEN
            RETURN NEW; -- Skip within cooldown
        END IF;
    END IF;

    -- Step 5: Determine IN/OUT status using IST Timezone
    -- IMPORTANT: We check if it's the same day in IST, not UTC.
    IF v_last_punch IS NOT NULL AND 
       (v_last_punch AT TIME ZONE 'Asia/Kolkata')::DATE = (NEW.event_time AT TIME ZONE 'Asia/Kolkata')::DATE THEN
        v_new_entry := CASE WHEN v_last_entry = 'IN' THEN 'OUT' ELSE 'IN' END;
    ELSE
        v_new_entry := 'IN'; -- First punch of the day in IST
    END IF;

    -- Step 5.5: Fetch assigned shift for the IST Date
    v_event_date := (NEW.event_time AT TIME ZONE 'Asia/Kolkata')::DATE;

    SELECT sa.shift_id, s.start_time, s.end_time, s.shift_type::TEXT
    INTO v_shift_id, v_shift_start, v_shift_end, v_shift_type
    FROM public.shift_assignments sa
    LEFT JOIN public.shifts s ON sa.shift_id = s.id
    WHERE sa.employee_id = v_employee_uuid 
      AND sa.tenant_id = NEW.tenant_id
      AND sa.schedule_date = v_event_date
    LIMIT 1;

    -- Step 5.6: Evaluate timing_status
    IF v_shift_id IS NULL THEN
        v_timing_status := 'NO_SHIFT_ASSIGNED';
    ELSE
        -- Construct expected timestamps (Assumes start_time/end_time are local)
        v_expected_start := (v_event_date + v_shift_start) AT TIME ZONE 'Asia/Kolkata';
        
        IF v_shift_type = 'night' THEN
            v_expected_end := (v_event_date + v_shift_end + INTERVAL '1 day') AT TIME ZONE 'Asia/Kolkata';
        ELSE
            v_expected_end := (v_event_date + v_shift_end) AT TIME ZONE 'Asia/Kolkata';
        END IF;

        IF NEW.event_time >= (v_expected_start - INTERVAL '2 hours') AND 
           NEW.event_time <= (v_expected_end + INTERVAL '4 hours') THEN
            v_timing_status := 'OK';
        ELSE
            v_timing_status := 'OUTSIDE_SHIFT';
        END IF;
    END IF;

    -- Step 6: Insert into Final Attendance table
    INSERT INTO public.attendance_timestamp (
        employee_id, entry, "timestamp", timing_status, tenant_id, shift_id
    ) VALUES (
        v_employee_uuid, v_new_entry, NEW.event_time, v_timing_status, NEW.tenant_id, v_shift_id 
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Bind the Trigger
DROP TRIGGER IF EXISTS trg_push_hik_event ON public.hik_attendance_events;
CREATE TRIGGER trg_push_hik_event
AFTER INSERT ON public.hik_attendance_events 
FOR EACH ROW EXECUTE FUNCTION process_hik_event_to_attendance();

--------------------------------------------------------------------------------------------------------------------

-- 1. Enable extensions if not already present
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Clean up ALL previous individual sync jobs
SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname LIKE 'hik-%';


CREATE OR REPLACE FUNCTION public.sync_hikvision_burst()
RETURNS void AS $$
BEGIN
  -- We only call it ONCE. The function internally loops for 50 seconds.
  PERFORM net.http_post(
      url:='https://rqtodkgptdgfilhdur.supabase.co/functions/v1/cron-sync-all',
    headers:='{
      "Content-Type": "application/json", 
      "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJxdG9ka2dwdGRnZmlsaGR1cnh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg4ODY2NTUsImV4cCI6MjA1NDQ2MjY1NX0.1aCVwOODVHXflm0diAQ_xX3vk7mFP0eLBMjvRuabi4Y"
    }'::jsonb
  );
END;
$$ LANGUAGE plpgsql;