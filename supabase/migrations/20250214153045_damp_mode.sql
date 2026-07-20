-- Create shift types enum
CREATE TYPE public.shift_type AS ENUM ('morning', 'afternoon', 'night');
CREATE TYPE public.shift_status AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled');
CREATE TYPE public.shift_swap_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled');

-- Create shifts table
CREATE TABLE IF NOT EXISTS public.shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  start_time time NOT NULL,
  end_time time NOT NULL,
  break_duration interval NOT NULL DEFAULT '00:30:00',
  shift_type shift_type NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create shift schedules table for recurring shifts
CREATE TABLE IF NOT EXISTS public.shift_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid REFERENCES public.shifts(id) ON DELETE CASCADE,
  recurrence_type text NOT NULL CHECK (recurrence_type IN ('daily', 'weekly', 'monthly')),
  recurrence_days integer[] DEFAULT NULL, -- For weekly: [1,2,3,4,5] (Monday to Friday)
  start_date date NOT NULL,
  end_date date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create shift assignments table
CREATE TABLE IF NOT EXISTS public.shift_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid REFERENCES public.shifts(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  schedule_date date NOT NULL,
  status shift_status DEFAULT 'scheduled',
  clock_in timestamptz,
  clock_out timestamptz,
  actual_break_duration interval,
  overtime_minutes integer DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(shift_id, employee_id, schedule_date)
);

-- Create shift swaps table
CREATE TABLE IF NOT EXISTS public.shift_swaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid REFERENCES public.shift_assignments(id) ON DELETE CASCADE,
  requested_by uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_to uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  status shift_swap_status DEFAULT 'pending',
  reason text,
  response_notes text,
  responded_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create shift notifications table
CREATE TABLE IF NOT EXISTS public.shift_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  assignment_id uuid REFERENCES public.shift_assignments(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('upcoming_shift', 'shift_swap_request', 'shift_swap_response', 'shift_modified')),
  title text NOT NULL,
  message text NOT NULL,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_swaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_notifications ENABLE ROW LEVEL SECURITY;

-- Create indexes for better performance
CREATE INDEX idx_shift_assignments_employee_date ON public.shift_assignments(employee_id, schedule_date);
CREATE INDEX idx_shift_assignments_status ON public.shift_assignments(status);
CREATE INDEX idx_shift_swaps_status ON public.shift_swaps(status);
CREATE INDEX idx_shift_notifications_employee ON public.shift_notifications(employee_id, is_read);
CREATE INDEX idx_shift_schedules_dates ON public.shift_schedules(start_date, end_date);

-- Add updated_at triggers
CREATE TRIGGER shifts_updated_at
  BEFORE UPDATE ON public.shifts
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER shift_schedules_updated_at
  BEFORE UPDATE ON public.shift_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER shift_assignments_updated_at
  BEFORE UPDATE ON public.shift_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER shift_swaps_updated_at
  BEFORE UPDATE ON public.shift_swaps
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER shift_notifications_updated_at
  BEFORE UPDATE ON public.shift_notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Create RLS Policies

-- Shifts policies
CREATE POLICY "Users can view shifts"
  ON public.shifts
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can manage shifts"
  ON public.shifts
  USING (true);

-- Shift schedules policies
CREATE POLICY "Users can view shift schedules"
  ON public.shift_schedules
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can manage shift schedules"
  ON public.shift_schedules
  USING (true);

-- Shift assignments policies
CREATE POLICY "Users can view their shift assignments"
  ON public.shift_assignments
  FOR SELECT
  TO authenticated
  USING (
    employee_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.department IN (
        SELECT department FROM public.employees
        WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can update their shift assignments"
  ON public.shift_assignments
  FOR UPDATE
  TO authenticated
  USING (employee_id = auth.uid());

-- Shift swaps policies
CREATE POLICY "Users can view their shift swaps"
  ON public.shift_swaps
  FOR SELECT
  TO authenticated
  USING (
    requested_by = auth.uid() OR
    requested_to = auth.uid()
  );

CREATE POLICY "Users can create shift swaps"
  ON public.shift_swaps
  FOR INSERT
  TO authenticated
  WITH CHECK (
    requested_by = auth.uid()
  );

CREATE POLICY "Users can update their shift swaps"
  ON public.shift_swaps
  FOR UPDATE
  TO authenticated
  USING (
    requested_by = auth.uid() OR
    requested_to = auth.uid()
  );

-- Shift notifications policies
CREATE POLICY "Users can view their notifications"
  ON public.shift_notifications
  FOR SELECT
  TO authenticated
  USING (employee_id = auth.uid());

CREATE POLICY "Users can update their notifications"
  ON public.shift_notifications
  FOR UPDATE
  TO authenticated
  USING (employee_id = auth.uid());

-- Helper functions

-- Function to get available employees for shift swap
CREATE OR REPLACE FUNCTION get_available_employees_for_swap(
  p_assignment_id uuid,
  p_date date
)
RETURNS TABLE (
  employee_id uuid,
  name text,
  department text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.id,
    e.name,
    e.department
  FROM public.employees e
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.shift_assignments sa
    WHERE sa.employee_id = e.id
    AND sa.schedule_date = p_date
  )
  AND e.status = 'Active'
  AND e.id != (
    SELECT employee_id
    FROM public.shift_assignments
    WHERE id = p_assignment_id
  );
END;
$$;

-- Function to create shift assignments from schedule
CREATE OR REPLACE FUNCTION create_shift_assignments_from_schedule()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_schedule record;
  v_date date;
  v_weekday integer;
BEGIN
  -- Get all active schedules that need assignments
  FOR v_schedule IN
    SELECT 
      ss.*,
      s.id as shift_id
    FROM public.shift_schedules ss
    JOIN public.shifts s ON s.id = ss.shift_id
    WHERE s.is_active = true
    AND (ss.end_date IS NULL OR ss.end_date >= CURRENT_DATE)
    AND ss.start_date <= CURRENT_DATE + interval '7 days'
  LOOP
    -- Generate assignments for the next 7 days
    v_date := CURRENT_DATE;
    WHILE v_date <= CURRENT_DATE + interval '7 days' LOOP
      v_weekday := EXTRACT(DOW FROM v_date);
      
      -- Check if this day is in the recurrence pattern
      IF (
        (v_schedule.recurrence_type = 'daily') OR
        (v_schedule.recurrence_type = 'weekly' AND v_weekday = ANY(v_schedule.recurrence_days)) OR
        (v_schedule.recurrence_type = 'monthly' AND EXTRACT(DAY FROM v_date) = EXTRACT(DAY FROM v_schedule.start_date))
      ) THEN
        -- Create assignment if it doesn't exist
        INSERT INTO public.shift_assignments (
          shift_id,
          schedule_date,
          status
        )
        SELECT
          v_schedule.shift_id,
          v_date,
          'scheduled'
        WHERE NOT EXISTS (
          SELECT 1
          FROM public.shift_assignments
          WHERE shift_id = v_schedule.shift_id
          AND schedule_date = v_date
        );
      END IF;
      
      v_date := v_date + interval '1 day';
    END LOOP;
  END LOOP;
END;
$$;