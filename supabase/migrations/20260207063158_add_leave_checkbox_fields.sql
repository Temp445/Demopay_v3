/*
  # Add Leave Checkbox Fields to leave_types Table

  1. Changes
    - Add `before_leave_holiday` (boolean) - Track if holidays before leave should be considered
    - Add `before_leave_week_off` (boolean) - Track if week offs before leave should be considered
    - Add `after_leave_holiday` (boolean) - Track if holidays after leave should be considered
    - Add `after_leave_week_off` (boolean) - Track if week offs after leave should be considered
    - Add `in_between_leave_holiday` (boolean) - Track if holidays in between leave should be considered
    - Add `in_between_leave_week_off` (boolean) - Track if week offs in between leave should be considered

  2. Security
    - No RLS changes needed as the table already has RLS enabled
*/

-- Add new checkbox fields to leave_types table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leave_types' AND column_name = 'before_leave_holiday'
  ) THEN
    ALTER TABLE leave_types ADD COLUMN before_leave_holiday boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leave_types' AND column_name = 'before_leave_week_off'
  ) THEN
    ALTER TABLE leave_types ADD COLUMN before_leave_week_off boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leave_types' AND column_name = 'after_leave_holiday'
  ) THEN
    ALTER TABLE leave_types ADD COLUMN after_leave_holiday boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leave_types' AND column_name = 'after_leave_week_off'
  ) THEN
    ALTER TABLE leave_types ADD COLUMN after_leave_week_off boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leave_types' AND column_name = 'in_between_leave_holiday'
  ) THEN
    ALTER TABLE leave_types ADD COLUMN in_between_leave_holiday boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leave_types' AND column_name = 'in_between_leave_week_off'
  ) THEN
    ALTER TABLE leave_types ADD COLUMN in_between_leave_week_off boolean DEFAULT false;
  END IF;
END $$;
