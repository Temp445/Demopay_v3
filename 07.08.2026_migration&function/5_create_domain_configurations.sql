create table public.domains_management (
  id uuid not null default gen_random_uuid (),
  domain_name text not null,
  allow_to_landing_page boolean null default true,
  subscription_enabled boolean null default true,
  is_active boolean null default true,
  created_at timestamp with time zone not null default timezone ('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone ('utc'::text, now()),
  free_trial_available boolean null default true,
  free_trial_days integer null default 7,
  trial_plan_name text null default 'Elite Trial'::text,
  constraint domains_management_pkey primary key (id),
  constraint domains_management_domain_name_key unique (domain_name)
) TABLESPACE pg_default;

create trigger cascade_domain_subscription
after
update OF subscription_enabled on domains_management for EACH row
execute FUNCTION cascade_domain_subscription_to_tenants ();


create table public.domain_configurations (
  id uuid not null default gen_random_uuid (),
  config jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default timezone ('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone ('utc'::text, now()),
  tenant_id uuid null,
  domain_id uuid not null,
  is_active boolean null default true,
  constraint domain_configurations_pkey primary key (id),
  constraint domain_configurations_domain_id_tenant_id_key unique (domain_id, tenant_id),
  constraint domain_configurations_domain_id_fkey foreign KEY (domain_id) references domains_management (id) on delete CASCADE,
  constraint domain_configurations_tenant_id_fkey foreign KEY (tenant_id) references tenants (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_domain_configurations_tenant on public.domain_configurations using btree (tenant_id) TABLESPACE pg_default;

create trigger update_domain_configurations_updated_at BEFORE
update on domain_configurations for EACH row
execute FUNCTION update_domain_configurations_updated_at ();


-- Add subscription_enabled to tenants
ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS subscription_enabled boolean DEFAULT false;