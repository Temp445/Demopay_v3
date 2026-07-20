/*
  # Add User Settings Fields to Profiles Table

  This migration adds columns for storing user settings and preferences.

  Run this manually in your Supabase SQL Editor or via CLI:
  psql $DATABASE_URL < add_user_settings_migration.sql

  1. New Columns Added
    - `full_name` (text) - User's full name
    - `phone` (text) - User's phone number
    - `role` (text) - User role (Admin, HR, Employee)
    - `email_notifications` (boolean) - Email notification preference
    - `in_app_notifications` (boolean) - In-app notification preference
    - `sms_notifications` (boolean) - SMS notification preference
    - `dark_mode` (boolean) - Dark mode preference
    - `compact_view` (boolean) - Compact view preference
    - `language` (text) - Language preference
    - `two_factor_enabled` (boolean) - Two-factor authentication status

  2. Changes
    - All new fields have appropriate defaults
    - No breaking changes to existing data
    - RLS policies remain unchanged
*/

-- Add user settings fields to profiles table
DO $$
BEGIN
  -- Add full_name column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'full_name'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN full_name text;
  END IF;

  -- Add phone column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'phone'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN phone text;
  END IF;

  -- Add role column with default 'Employee'
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'role'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN role text DEFAULT 'Employee';
  END IF;

  -- Add email_notifications column with default true
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'email_notifications'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN email_notifications boolean DEFAULT true;
  END IF;

  -- Add in_app_notifications column with default true
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'in_app_notifications'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN in_app_notifications boolean DEFAULT true;
  END IF;

  -- Add sms_notifications column with default false
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'sms_notifications'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN sms_notifications boolean DEFAULT false;
  END IF;

  -- Add dark_mode column with default false
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'dark_mode'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN dark_mode boolean DEFAULT false;
  END IF;

  -- Add compact_view column with default false
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'compact_view'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN compact_view boolean DEFAULT false;
  END IF;

  -- Add language column with default 'en'
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'language'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN language text DEFAULT 'en';
  END IF;

  -- Add two_factor_enabled column with default false
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'two_factor_enabled'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN two_factor_enabled boolean DEFAULT false;
  END IF;
END $$;

-- Create index on role for faster queries
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- Add comment to role column
COMMENT ON COLUMN public.profiles.role IS 'User role: Admin, HR, or Employee';
