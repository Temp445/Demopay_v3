-- Migration: add_travel_tracking_config
-- Adds configuration columns for Field Travel Tracking to attendance_validation_config

ALTER TABLE public.attendance_validation_config
  ADD COLUMN IF NOT EXISTS enable_travel_tracking BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS gps_sampling_interval_mins INTEGER DEFAULT 5,
  ADD COLUMN IF NOT EXISTS min_movement_threshold_meters INTEGER DEFAULT 20;
