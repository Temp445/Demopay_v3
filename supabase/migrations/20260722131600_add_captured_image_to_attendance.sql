-- Migration to add captured_image column to attendance_timestamp for face recognition images

ALTER TABLE public.attendance_timestamp
ADD COLUMN IF NOT EXISTS captured_image text;
