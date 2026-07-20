-- Create attendance settings table
CREATE TABLE IF NOT EXISTS public.attendance_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  clock_in_start time NOT NULL,
  clock_in_end time NOT NULL,
  clock_out_start time NOT NULL,
  clock_out_end time NOT NULL,
  late_threshold_minutes integer NOT NULL CHECK (late_threshold_minutes >= 0),
  half_day_threshold_minutes integer NOT NULL CHECK (half_day_threshold_minutes >= 0),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.attendance_settings ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view attendance settings"
  ON public.attendance_settings
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can manage attendance settings"
  ON public.attendance_settings
  FOR ALL
  TO authenticated
  USING (true);

-- Add updated_at trigger
CREATE TRIGGER attendance_settings_updated_at
  BEFORE UPDATE ON public.attendance_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Insert default settings
INSERT INTO public.attendance_settings (
  name,
  description,
  clock_in_start,
  clock_in_end,
  clock_out_start,
  clock_out_end,
  late_threshold_minutes,
  half_day_threshold_minutes
) VALUES (
  'Default Settings',
  'Default attendance settings',
  '08:00',
  '10:00',
  '16:00',
  '19:00',
  15,
  240
) ON CONFLICT DO NOTHING;