-- location_settings

create table public.location_settings (
  id uuid not null default gen_random_uuid (),
  tenant_id uuid not null,
  live_tracking_enabled boolean not null default true,
  radius_monitoring_enabled boolean not null default true,
  work_event_notifications_enabled boolean not null default true,
  violation_notifications_enabled boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  google_maps_enabled boolean not null default false,
  google_maps_api_key text null,
  constraint location_settings_pkey primary key (id),
  constraint location_settings_tenant_id_key unique (tenant_id),
  constraint location_settings_tenant_id_fkey foreign KEY (tenant_id) references tenants (id) on delete CASCADE
) TABLESPACE pg_default;


-- work_location_logs

create table public.work_location_logs (
  id uuid not null default gen_random_uuid (),
  user_id uuid null,
  user_name text null,
  company_name text not null,
  latitude double precision not null,
  longitude double precision not null,
  status text null,
  created_at timestamp with time zone null default now(),
  tenant_id uuid null,
  constraint work_location_logs_pkey primary key (id),
  constraint work_location_logs_user_id_fkey foreign KEY (user_id) references auth.users (id)
) TABLESPACE pg_default;

create index IF not exists idx_work_location_logs_tenant_id on public.work_location_logs using btree (tenant_id) TABLESPACE pg_default;

create index IF not exists idx_work_location_logs_user_id on public.work_location_logs using btree (user_id) TABLESPACE pg_default;

create index IF not exists idx_work_location_logs_created_at on public.work_location_logs using btree (created_at) TABLESPACE pg_default;


-- work_location_notifications

create table public.work_location_notifications (
  id uuid not null default gen_random_uuid (),
  tenant_id uuid not null,
  work_location_id uuid null,
  recipient_user_id uuid null,
  recipient_employee_id uuid null,
  notification_type text not null,
  title text not null,
  message text not null,
  is_read boolean null default false,
  read_at timestamp with time zone null,
  created_at timestamp with time zone null default now(),
  constraint work_location_notifications_pkey primary key (id),
  constraint work_location_notifications_recipient_employee_id_fkey foreign KEY (recipient_employee_id) references employees (id),
  constraint work_location_notifications_recipient_user_id_fkey foreign KEY (recipient_user_id) references auth.users (id),
  constraint work_location_notifications_tenant_id_fkey foreign KEY (tenant_id) references tenants (id) on delete CASCADE,
  constraint work_location_notifications_work_location_id_fkey foreign KEY (work_location_id) references work_locations (id) on delete CASCADE,
  constraint work_location_notifications_notification_type_check check (
    (
      notification_type = any (
        array[
          'work_assigned'::text,
          'work_started'::text,
          'work_completed'::text,
          'radius_violation'::text,
          'work_approved'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_wl_notifications_recipient on public.work_location_notifications using btree (recipient_user_id, is_read, created_at desc) TABLESPACE pg_default;


-- work_location_pauses

create table public.work_location_pauses (
  id uuid not null default gen_random_uuid (),
  work_location_id uuid not null,
  pause_reason text not null,
  paused_at timestamp with time zone not null default now(),
  resumed_at timestamp with time zone null,
  constraint work_location_pauses_pkey primary key (id),
  constraint work_location_pauses_work_location_id_fkey foreign KEY (work_location_id) references work_locations (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_work_location_pauses_work on public.work_location_pauses using btree (work_location_id) TABLESPACE pg_default;


-- work_location_tracking

create table public.work_location_tracking (
  id uuid not null default gen_random_uuid (),
  tenant_id uuid not null,
  work_location_id uuid not null,
  employee_id uuid not null,
  latitude numeric(10, 8) not null,
  longitude numeric(11, 8) not null,
  accuracy numeric(10, 2) null,
  distance_from_center numeric(10, 2) null,
  is_within_radius boolean null default true,
  recorded_at timestamp with time zone null default now(),
  battery_level integer null,
  created_at timestamp with time zone null default now(),
  constraint work_location_tracking_pkey primary key (id),
  constraint work_location_tracking_employee_id_fkey foreign KEY (employee_id) references employees (id) on delete CASCADE,
  constraint work_location_tracking_tenant_id_fkey foreign KEY (tenant_id) references tenants (id) on delete CASCADE,
  constraint work_location_tracking_work_location_id_fkey foreign KEY (work_location_id) references work_locations (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_tracking_work_location on public.work_location_tracking using btree (work_location_id, recorded_at desc) TABLESPACE pg_default;

create trigger tracking_radius_check BEFORE INSERT on work_location_tracking for EACH row
execute FUNCTION check_radius_violation ();


-- work_location_violations

create table public.work_location_violations (
  id uuid not null default gen_random_uuid (),
  tenant_id uuid not null,
  work_location_id uuid not null,
  employee_id uuid not null,
  violation_type text not null default 'radius_exit'::text,
  latitude numeric(10, 8) not null,
  longitude numeric(11, 8) not null,
  distance_from_center numeric(10, 2) not null,
  notification_sent boolean null default false,
  notification_sent_at timestamp with time zone null,
  violated_at timestamp with time zone null default now(),
  created_at timestamp with time zone null default now(),
  constraint work_location_violations_pkey primary key (id),
  constraint work_location_violations_employee_id_fkey foreign KEY (employee_id) references employees (id) on delete CASCADE,
  constraint work_location_violations_tenant_id_fkey foreign KEY (tenant_id) references tenants (id) on delete CASCADE,
  constraint work_location_violations_work_location_id_fkey foreign KEY (work_location_id) references work_locations (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_violations_work_location on public.work_location_violations using btree (work_location_id, violated_at desc) TABLESPACE pg_default;


-- work_locations

create table public.work_locations (
  id uuid not null default gen_random_uuid (),
  tenant_id uuid not null,
  employee_id uuid not null,
  assigned_by uuid not null,
  location_name text not null,
  location_description text null,
  latitude numeric(10, 8) not null,
  longitude numeric(11, 8) not null,
  allowed_radius_meters numeric(10, 2) not null default 100,
  assignment_date date not null default CURRENT_DATE,
  work_description text not null,
  status text not null default 'assigned'::text,
  started_at timestamp with time zone null,
  completed_at timestamp with time zone null,
  approved_at timestamp with time zone null,
  approved_by uuid null,
  work_amount numeric(10, 2) null,
  work_amount_unit text null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  address text null,
  city text null,
  state text null,
  country text null,
  postal_code text null,
  formatted_address text null,
  cancel_reason text null,
  update_reason text null,
  complete_reason text null,
  constraint work_locations_pkey primary key (id),
  constraint work_locations_approved_by_fkey foreign KEY (approved_by) references auth.users (id),
  constraint work_locations_assigned_by_fkey foreign KEY (assigned_by) references auth.users (id),
  constraint work_locations_employee_id_fkey foreign KEY (employee_id) references employees (id) on delete CASCADE,
  constraint work_locations_tenant_id_fkey foreign KEY (tenant_id) references tenants (id) on delete CASCADE,
  constraint work_locations_status_check check (
    (
      status = any (
        array[
          'assigned'::text,
          'in_progress'::text,
          'paused'::text,
          'completed'::text,
          'approved'::text,
          'cancelled'::text,
          'denied'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_work_locations_employee on public.work_locations using btree (employee_id, tenant_id) TABLESPACE pg_default;

create index IF not exists idx_work_locations_status on public.work_locations using btree (status, tenant_id) TABLESPACE pg_default;

create trigger work_location_assigned
after INSERT on work_locations for EACH row
execute FUNCTION notify_work_assignment ();

create trigger work_locations_updated_at BEFORE
update on work_locations for EACH row
execute FUNCTION update_work_location_updated_at ();


 ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
Functions:

CREATE OR REPLACE FUNCTION public.notify_work_assignment()
 RETURNS trigger
 LANGUAGE plpgsql
AS $$
BEGIN
INSERT INTO work_location_notifications (tenant_id, work_location_id, recipient_employee_id, notification_type, title, message)
SELECT NEW.tenant_id, NEW.id, NEW.employee_id, 'work_assigned', 'New Work Location Assigned',
'You have been assigned to work at ' || NEW.location_name || ' on ' || NEW.assignment_date::TEXT;
RETURN NEW;
END;
$$;


CREATE OR REPLACE FUNCTION public.check_radius_violation()
 RETURNS trigger
 LANGUAGE plpgsql
AS $$
DECLARE location_record RECORD; is_within BOOLEAN; last_violation RECORD;
BEGIN
SELECT * INTO location_record FROM work_locations WHERE id = NEW.work_location_id AND status = 'in_progress';
IF NOT FOUND THEN RETURN NEW; END IF;

is_within := is_within_radius(NEW.work_location_id, NEW.latitude, NEW.longitude);
NEW.is_within_radius := is_within;

IF NOT is_within THEN
SELECT * INTO last_violation FROM work_location_violations
WHERE work_location_id = NEW.work_location_id AND violation_type = 'radius_exit'
AND violated_at > now() - INTERVAL '5 minutes' ORDER BY violated_at DESC LIMIT 1;

IF NOT FOUND THEN
INSERT INTO work_location_violations (tenant_id, work_location_id, employee_id, violation_type, latitude, longitude, distance_from_center)
VALUES (NEW.tenant_id, NEW.work_location_id, NEW.employee_id, 'radius_exit', NEW.latitude, NEW.longitude, NEW.distance_from_center);

INSERT INTO work_location_notifications (tenant_id, work_location_id, recipient_user_id, notification_type, title, message)
SELECT NEW.tenant_id, NEW.work_location_id, location_record.assigned_by, 'radius_violation', 'Work Location Violation',
(SELECT name FROM employees WHERE id = NEW.employee_id) || ' has exited the allowed radius';
END IF;
END IF;
RETURN NEW;
END;
$$

 
CREATE OR REPLACE FUNCTION public.update_work_location_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$
