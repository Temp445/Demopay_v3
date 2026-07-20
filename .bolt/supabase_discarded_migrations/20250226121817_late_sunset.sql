-- Create holidays table
CREATE TABLE IF NOT EXISTS public.holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  date date NOT NULL,
  holiday_type text NOT NULL CHECK (holiday_type IN ('public', 'company')),
  description text,
  is_recurring boolean DEFAULT false,
  notification_sent boolean DEFAULT false,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Everyone can view holidays"
  ON public.holidays
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Only admins can manage holidays"
  ON public.holidays
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.user_id = auth.uid()
      AND e.role = 'admin'
    )
  );

-- Add updated_at trigger
CREATE TRIGGER holidays_updated_at
  BEFORE UPDATE ON public.holidays
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Create index for efficient date querying
CREATE INDEX idx_holidays_date ON public.holidays(date);

-- Create function to get holidays for a date range
CREATE OR REPLACE FUNCTION get_holidays(
  p_start_date date,
  p_end_date date
)
RETURNS TABLE (
  id uuid,
  name text,
  date date,
  holiday_type text,
  description text,
  is_recurring boolean,
  created_by uuid,
  created_at timestamptz,
  created_by_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    h.id,
    h.name,
    h.date,
    h.holiday_type,
    h.description,
    h.is_recurring,
    h.created_by,
    h.created_at,
    e.name as created_by_name
  FROM public.holidays h
  LEFT JOIN public.employees e ON e.user_id = h.created_by
  WHERE h.date BETWEEN p_start_date AND p_end_date
  ORDER BY h.date;
END;
$$;

-- Create function to get recurring holidays for a year
CREATE OR REPLACE FUNCTION get_recurring_holidays(p_year integer)
RETURNS TABLE (
  id uuid,
  name text,
  date date,
  holiday_type text,
  description text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    h.id,
    h.name,
    (p_year || TO_CHAR(h.date, '-MM-DD'))::date as date,
    h.holiday_type,
    h.description
  FROM public.holidays h
  WHERE h.is_recurring = true
  AND EXTRACT(YEAR FROM h.date) <= p_year
  ORDER BY date;
END;
$$;

-- Create function to notify users of new holidays
CREATE OR REPLACE FUNCTION notify_new_holiday()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Insert notification for all active employees
  INSERT INTO public.shift_notifications (
    employee_id,
    type,
    title,
    message
  )
  SELECT 
    e.user_id,
    'holiday_added',
    'New Holiday Added: ' || NEW.name,
    'A new holiday has been added for ' || TO_CHAR(NEW.date, 'Month DD, YYYY')
  FROM public.employees e
  WHERE e.status = 'Active';

  -- Mark notification as sent
  UPDATE public.holidays
  SET notification_sent = true
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

-- Create trigger for holiday notifications
CREATE TRIGGER notify_holiday_added
  AFTER INSERT ON public.holidays
  FOR EACH ROW
  WHEN (NEW.notification_sent = false)
  EXECUTE FUNCTION notify_new_holiday();

-- Insert some default public holidays
INSERT INTO public.holidays (
  name,
  date,
  holiday_type,
  description,
  is_recurring,
  notification_sent
) VALUES
  ('New Year''s Day', '2025-01-01', 'public', 'First day of the year', true, true),
  ('Christmas Day', '2025-12-25', 'public', 'Christmas celebration', true, true),
  ('Independence Day', '2025-07-04', 'public', 'US Independence Day celebration', true, true),
  ('Labor Day', '2025-09-01', 'public', 'Labor Day celebration', true, true),
  ('Thanksgiving Day', '2025-11-27', 'public', 'Thanksgiving celebration', true, true)
ON CONFLICT DO NOTHING;