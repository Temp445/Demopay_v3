/*
  # Replace Break Duration with Break Start and End Times

  1. Changes to shifts table
    - Add break_start_time column (time)
    - Add break_end_time column (time)
    - Remove break_duration column (interval)

  2. Changes to shift_assignments table
    - Add actual_break_start column (timestamptz)
    - Add actual_break_end column (timestamptz)
    - Remove actual_break_duration column (interval)

  3. Data Migration
    - Migrate existing break_duration data to break times
    - Provide default values for existing records

  4. Security
    - Maintain existing RLS policies
*/

-- Step 1: Add new columns to shifts table
ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS break_start_time time,
  ADD COLUMN IF NOT EXISTS break_end_time time;

-- Step 2: Migrate existing break_duration data to break times
-- For existing records, assume break starts at mid-shift
UPDATE public.shifts
SET
  break_start_time = (start_time::interval + (end_time::interval - start_time::interval) / 2)::time,
  break_end_time = (start_time::interval + (end_time::interval - start_time::interval) / 2 + break_duration)::time
WHERE break_start_time IS NULL
  AND break_end_time IS NULL
  AND break_duration IS NOT NULL;

-- Step 3: Set default values for records without break_duration
UPDATE public.shifts
SET
  break_start_time = '12:00:00'::time,
  break_end_time = '12:30:00'::time
WHERE break_start_time IS NULL
  AND break_end_time IS NULL;

-- Step 4: Make the new columns NOT NULL after migration
ALTER TABLE public.shifts
  ALTER COLUMN break_start_time SET NOT NULL,
  ALTER COLUMN break_end_time SET NOT NULL;

-- Step 5: Drop the old break_duration column
ALTER TABLE public.shifts
  DROP COLUMN IF EXISTS break_duration;

-- Step 6: Add new columns to shift_assignments table
ALTER TABLE public.shift_assignments
  ADD COLUMN IF NOT EXISTS actual_break_start timestamptz,
  ADD COLUMN IF NOT EXISTS actual_break_end timestamptz;

-- Step 7: Drop the old actual_break_duration column from shift_assignments
ALTER TABLE public.shift_assignments
  DROP COLUMN IF EXISTS actual_break_duration;

-- Step 8: Add check constraint to ensure break_end_time is after break_start_time

ALTER TABLE public.shifts
  DROP CONSTRAINT IF EXISTS check_break_time_order;

ALTER TABLE public.shifts
  ADD CONSTRAINT check_break_time_order
  CHECK (
    (break_end_time > break_start_time) OR 
    (shift_type = 'night' AND break_end_time < break_start_time)
  );


-- Step 9: Create index for break times
CREATE INDEX IF NOT EXISTS idx_shifts_break_times
  ON public.shifts(break_start_time, break_end_time);

-- Step 10: Create index for actual break times in assignments
CREATE INDEX IF NOT EXISTS idx_shift_assignments_actual_break
  ON public.shift_assignments(actual_break_start, actual_break_end);
