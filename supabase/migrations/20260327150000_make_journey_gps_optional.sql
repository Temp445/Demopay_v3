-- Relax GPS coordinate constraints to support users who have live tracking and radius monitoring disabled by admins.
ALTER TABLE public.journey_tracking_logs ALTER COLUMN latitude DROP NOT NULL;
ALTER TABLE public.journey_tracking_logs ALTER COLUMN longitude DROP NOT NULL;
