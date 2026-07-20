-- Create shift attendance settings table
CREATE TABLE IF NOT EXISTS public.shift_attendance_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid REFERENCES public.shifts(id) ON DELETE CASCADE,
  clock_in_start_offset interval NOT NULL DEFAULT '00:00:00',
  clock_in_end_offset interval NOT NULL DEFAULT '02:00:00',
  clock_out_start_offset interval NOT NULL DEFAULT '-01:00:00',
  clock_out_end_offset interval NOT NULL DEFAULT '01:00:00',
  late_threshold_minutes integer NOT NULL DEFAULT 15 CHECK (late_threshold_minutes >= 0),
  half_day_threshold_minutes integer NOT NULL DEFAULT 240 CHECK (half_day_threshold_minutes >= 0),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(shift_id)
);

-- Enable RLS
ALTER TABLE public.shift_attendance_settings ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view shift attendance settings"
  ON public.shift_attendance_settings
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can manage shift attendance settings"
  ON public.shift_attendance_settings
  FOR ALL
  TO authenticated
  USING (true);

-- Add updated_at trigger
CREATE TRIGGER shift_attendance_settings_updated_at
  BEFORE UPDATE ON public.shift_attendance_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Create function to automatically create default settings for new shifts
CREATE OR REPLACE FUNCTION create_default_shift_attendance_settings()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.shift_attendance_settings (shift_id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically create settings for new shifts
CREATE TRIGGER create_shift_attendance_settings
  AFTER INSERT ON public.shifts
  FOR EACH ROW
  EXECUTE FUNCTION create_default_shift_attendance_settings();

-- Create function to get shift-specific attendance settings
CREATE OR REPLACE FUNCTION get_shift_attendance_settings(
  p_shift_id uuid,
  p_date date
)
RETURNS TABLE (
  clock_in_start time,
  clock_in_end time,
  clock_out_start time,
  clock_out_end time,
  late_threshold_minutes integer,
  half_day_threshold_minutes integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_shift record;
  v_settings record;
BEGIN
  -- Get shift details
  SELECT * INTO v_shift
  FROM public.shifts
  WHERE id = p_shift_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shift not found';
  END IF;

  -- Get shift-specific settings
  SELECT * INTO v_settings
  FROM public.shift_attendance_settings
  WHERE shift_id = p_shift_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shift attendance settings not found';
  END IF;

  -- Calculate actual times based on shift time and offsets
  RETURN QUERY
  SELECT
    (v_shift.start_time::time + v_settings.clock_in_start_offset)::time as clock_in_start,
    (v_shift.start_time::time + v_settings.clock_in_end_offset)::time as clock_in_end,
    (v_shift.end_time::time + v_settings.clock_out_start_offset)::time as clock_out_start,
    (v_shift.end_time::time + v_settings.clock_out_end_offset)::time as clock_out_end,
    v_settings.late_threshold_minutes,
    v_settings.half_day_threshold_minutes;
END;
$$;