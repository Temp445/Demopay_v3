ALTER TABLE public.subscriptions 
ADD COLUMN IF NOT EXISTS mobile_number text null;
