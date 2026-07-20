-- Create subscriptions table to record all successful payments
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid not null default gen_random_uuid (),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  email text not null,
  name text null,
  company text null,
  plan_name text not null,
  billing_cycle text not null default 'monthly'::text,
  amount_paid_paise integer not null,
  razorpay_order_id text not null,
  razorpay_payment_id text not null,
  razorpay_signature text not null,
  status text not null default 'active'::text,
  created_at timestamp with time zone not null default now(),
  expires_at timestamp with time zone null,
  constraint subscriptions_pkey primary key (id),
  constraint subscriptions_razorpay_order_id_key unique (razorpay_order_id)
) TABLESPACE pg_default;

-- Index for fast lookup by tenant_id
CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant_id ON public.subscriptions(tenant_id);

-- Enable Row Level Security
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Allow anonymous reads (for checking subscription by tenant_id on the pricing page)
CREATE POLICY "Allow read by tenant_id" ON public.subscriptions
  FOR SELECT USING (true);

-- Only the service role (Edge Function) can insert/update
CREATE POLICY "Service role can manage subscriptions" ON public.subscriptions
  FOR ALL USING (auth.role() = 'service_role');
