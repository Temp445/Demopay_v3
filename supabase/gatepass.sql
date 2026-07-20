create table public.gate_pass_requests (
  id uuid not null default gen_random_uuid (),
  tenant_id uuid not null,
  employee_id uuid not null,
  start_date date not null,
  start_time time without time zone not null,
  end_date date not null,
  end_time time without time zone not null,
  reason text not null,
  status text not null default 'pending'::text,
  approved_start_date date null,
  approved_start_time time without time zone null,
  approved_end_date date null,
  approved_end_time time without time zone null,
  requested_by uuid null,
  requested_at timestamp with time zone null default now(),
  cancelled_at timestamp with time zone null,
  cancelled_by uuid null,
  cancellation_reason text null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  gate_pass_type text not null default 'normal'::text,
  company_name text null,
  latitude double precision null,
  longitude double precision null,
  address text null,
  city text null,
  state text null,
  country text null,
  postal_code text null,
  formatted_address text null,
  allowed_radius_meters integer null default 100,
  constraint gate_pass_requests_pkey primary key (id),
  constraint gate_pass_requests_tenant_id_fkey foreign KEY (tenant_id) references tenants (id) on delete CASCADE,
  constraint gate_pass_requests_requested_by_fkey foreign KEY (requested_by) references auth.users (id),
  constraint gate_pass_requests_cancelled_by_fkey foreign KEY (cancelled_by) references auth.users (id),
  constraint gate_pass_requests_employee_id_fkey foreign KEY (employee_id) references employees (id) on delete CASCADE,
  constraint valid_time_range check (
    (
      (end_date > start_date)
      or (
        (end_date = start_date)
        and (end_time > start_time)
      )
    )
  ),
  constraint gate_pass_requests_status_check check (
    (
      status = any (
        array[
          'pending'::text,
          'approved'::text,
          'assigned'::text,
          'in_progress'::text,
          'paused'::text,
          'completed'::text,
          'rejected'::text,
          'cancelled'::text
        ]
      )
    )
  ),
  constraint gate_pass_type_check check (
    (
      gate_pass_type = any (array['normal'::text, 'paid'::text])
    )
  ),
  constraint valid_date_range check ((end_date >= start_date))
) TABLESPACE pg_default;

create index IF not exists idx_gate_pass_requests_tenant_id on public.gate_pass_requests using btree (tenant_id) TABLESPACE pg_default;

create index IF not exists idx_gate_pass_requests_employee_id on public.gate_pass_requests using btree (employee_id) TABLESPACE pg_default;

create index IF not exists idx_gate_pass_requests_status on public.gate_pass_requests using btree (status) TABLESPACE pg_default;

create index IF not exists idx_gate_pass_requests_start_date on public.gate_pass_requests using btree (start_date) TABLESPACE pg_default;

create index IF not exists idx_gate_pass_requests_requested_by on public.gate_pass_requests using btree (requested_by) TABLESPACE pg_default;

create trigger log_gate_pass_changes
after INSERT
or
update on gate_pass_requests for EACH row
execute FUNCTION log_gate_pass_change ();

create trigger update_gate_pass_requests_updated_at BEFORE
update on gate_pass_requests for EACH row
execute FUNCTION update_gate_pass_updated_at ();



---------------------------------------------------------------------------------------------------------------------------------


CREATE OR REPLACE FUNCTION sync_gate_pass_status()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only trigger if this work location belongs to a gate pass
  IF NEW.gate_pass_id IS NOT NULL THEN
    UPDATE gate_pass_requests 
    SET 
      status = NEW.status, 
      updated_at = now()
    WHERE id = NEW.gate_pass_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. Attach the Trigger
DROP TRIGGER IF EXISTS trigger_sync_gate_pass_status ON work_locations;

CREATE TRIGGER trigger_sync_gate_pass_status
AFTER UPDATE OF status ON work_locations
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION sync_gate_pass_status();