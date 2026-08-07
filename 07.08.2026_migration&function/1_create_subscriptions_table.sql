create table public.subscriptions (
  id uuid not null default gen_random_uuid (),
  tenant_id uuid not null,
  email text not null,
  name text null,
  company text null,
  plan_name text not null,
  billing_cycle text not null default 'monthly'::text,
  razorpay_order_id text not null,
  razorpay_payment_id text not null,
  razorpay_signature text not null,
  status text not null default 'active'::text,
  created_at timestamp with time zone not null default now(),
  expires_at timestamp with time zone null,
  gst_number text null default ''::text,
  invoice_number text null default ''::text,
  amount_paid numeric(15, 2) null default 0.00,
  mobile_number text null,
  constraint subscriptions_pkey primary key (id),
  constraint subscriptions_razorpay_order_id_key unique (razorpay_order_id),
  constraint subscriptions_tenant_id_fkey foreign KEY (tenant_id) references tenants (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_subscriptions_tenant_id on public.subscriptions using btree (tenant_id) TABLESPACE pg_default;

create unique INDEX IF not exists idx_subscriptions_invoice_number on public.subscriptions using btree (invoice_number) TABLESPACE pg_default
where
  (invoice_number <> ''::text);