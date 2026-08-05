-- Migration: attendance_mode_and_location

-- 1. Add branch_location_id to hik_device_settings
ALTER TABLE public.hik_device_settings ADD COLUMN IF NOT EXISTS branch_location_id TEXT;
COMMENT ON COLUMN public.hik_device_settings.branch_location_id IS 'ID of the branch location (from company_settings JSON) this device is physically located at.';

-- 2. Add new columns to attendance_timestamp and Add latitude and longitude to attendance_timestamp
ALTER TABLE public.attendance_timestamp ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 8);
ALTER TABLE public.attendance_timestamp ADD COLUMN IF NOT EXISTS longitude NUMERIC(10, 8);
ALTER TABLE public.attendance_timestamp ADD COLUMN IF NOT EXISTS attendance_mode TEXT;
ALTER TABLE public.attendance_timestamp ADD COLUMN IF NOT EXISTS manual_reason TEXT;
ALTER TABLE public.attendance_timestamp ADD COLUMN IF NOT EXISTS distance_from_branch NUMERIC(10, 2);
ALTER TABLE public.attendance_timestamp ADD COLUMN IF NOT EXISTS office_location_status TEXT;
ALTER TABLE public.attendance_timestamp ADD COLUMN IF NOT EXISTS office_arrival_processed BOOLEAN DEFAULT false;

-- 2. Add require_location to attendance_validation_config
ALTER TABLE public.attendance_validation_config ADD COLUMN IF NOT EXISTS require_location BOOLEAN DEFAULT false;



ALTER TABLE attendance_timestamp ADD COLUMN IF NOT EXISTS location_address text;

ALTER TABLE public.attendance_timestamp
ADD COLUMN IF NOT EXISTS captured_image text;
