-- Add location_status to attendance_logs
SET statement_timeout = 0;

ALTER TABLE public.attendance_logs 
ADD COLUMN IF NOT EXISTS location_status text DEFAULT 'normal';

RESET statement_timeout;
