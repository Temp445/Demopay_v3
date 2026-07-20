/*
  # Add Fractional Leave Support

  1. Changes to leave_requests table
    - Add `is_half_day_start` (boolean) - Indicates if the start date is a half day
    - Add `is_half_day_end` (boolean) - Indicates if the end date is a half day
    - Add `half_day_period_start` (text) - Specifies '1st half' or '2nd half' for start date
    - Add `half_day_period_end` (text) - Specifies '1st half' or '2nd half' for end date
    - Add `total_days` (numeric) - Stores the calculated fractional days (e.g., 0.5, 1.5, 2.5)

  2. Purpose
    - Enable employees to request fractional leave (0.5, 1.5, 2.5 days, etc.)
    - Support half-day leave with morning (1st half) or afternoon (2nd half) options
    - Maintain backward compatibility with existing full-day leave requests

  3. Notes
    - Default values ensure existing records remain valid
    - total_days defaults to calculated days for backward compatibility
    - Half-day flags default to false for existing full-day requests
*/

-- Add half-day support columns to leave_requests table
DO $$
BEGIN
  -- Add is_half_day_start column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leave_requests' AND column_name = 'is_half_day_start'
  ) THEN
    ALTER TABLE public.leave_requests ADD COLUMN is_half_day_start boolean DEFAULT false NOT NULL;
  END IF;

  -- Add is_half_day_end column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leave_requests' AND column_name = 'is_half_day_end'
  ) THEN
    ALTER TABLE public.leave_requests ADD COLUMN is_half_day_end boolean DEFAULT false NOT NULL;
  END IF;

  -- Add half_day_period_start column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leave_requests' AND column_name = 'half_day_period_start'
  ) THEN
    ALTER TABLE public.leave_requests ADD COLUMN half_day_period_start text CHECK (half_day_period_start IN ('1st half', '2nd half', NULL));
  END IF;

  -- Add half_day_period_end column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leave_requests' AND column_name = 'half_day_period_end'
  ) THEN
    ALTER TABLE public.leave_requests ADD COLUMN half_day_period_end text CHECK (half_day_period_end IN ('1st half', '2nd half', NULL));
  END IF;

  -- Add total_days column to store fractional days
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leave_requests' AND column_name = 'total_days'
  ) THEN
    ALTER TABLE public.leave_requests ADD COLUMN total_days numeric(4,1) DEFAULT 0 NOT NULL;
  END IF;
END $$;

-- Update existing records to calculate their total_days
UPDATE public.leave_requests
SET total_days = (end_date - start_date + 1)::integer
WHERE total_days = 0;

-- Update the update_leave_balance function to use the total_days column
CREATE OR REPLACE FUNCTION update_leave_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_days numeric;
BEGIN
  -- Use the total_days column which now supports fractional values
  v_days := NEW.total_days;

  -- Update leave balance if request is approved
  IF NEW.status = 'Approved' AND OLD.status != 'Approved' THEN
    UPDATE public.leave_balances
    SET used_days = used_days + v_days
    WHERE
      employee_id = NEW.employee_id
      AND leave_type_id = NEW.leave_type_id
      AND year = EXTRACT(year FROM NEW.start_date)::integer;
  -- Restore leave balance if request is no longer approved
  ELSIF OLD.status = 'Approved' AND NEW.status != 'Approved' THEN
    UPDATE public.leave_balances
    SET used_days = GREATEST(0, used_days - v_days)
    WHERE
      employee_id = NEW.employee_id
      AND leave_type_id = NEW.leave_type_id
      AND year = EXTRACT(year FROM NEW.start_date)::integer;
  -- Handle changes in approved leave days
  ELSIF OLD.status = 'Approved' AND NEW.status = 'Approved' AND OLD.total_days != NEW.total_days THEN
    UPDATE public.leave_balances
    SET used_days = used_days - OLD.total_days + NEW.total_days
    WHERE
      employee_id = NEW.employee_id
      AND leave_type_id = NEW.leave_type_id
      AND year = EXTRACT(year FROM NEW.start_date)::integer;
  END IF;

  RETURN NEW;
END;
$$;

-- Add comment for documentation
COMMENT ON COLUMN public.leave_requests.is_half_day_start IS 'Indicates if the start date is a half day';
COMMENT ON COLUMN public.leave_requests.is_half_day_end IS 'Indicates if the end date is a half day';
COMMENT ON COLUMN public.leave_requests.half_day_period_start IS 'Specifies which half of the day for start date: 1st half (morning) or 2nd half (afternoon)';
COMMENT ON COLUMN public.leave_requests.half_day_period_end IS 'Specifies which half of the day for end date: 1st half (morning) or 2nd half (afternoon)';
COMMENT ON COLUMN public.leave_requests.total_days IS 'Total number of leave days including fractional days (e.g., 0.5, 1.5, 2.5)';
