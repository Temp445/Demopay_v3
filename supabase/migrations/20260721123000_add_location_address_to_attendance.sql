ALTER TABLE attendance_timestamp ADD COLUMN IF NOT EXISTS location_address text;

ALTER TABLE public.attendance_timestamp
ADD COLUMN IF NOT EXISTS captured_image text;