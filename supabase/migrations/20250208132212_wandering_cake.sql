/*
  # Add Attendance and Leave Management Schema

  1. New Tables
    - `attendance_logs`
      - Records employee clock in/out times and status
      - Tracks daily attendance with timestamps
    - `leave_types`
      - Defines different types of leave (Annual, Sick, etc.)
      - Includes default allocation days
    - `leave_balances`
      - Tracks available leave days per type for each employee
    - `leave_requests`
      - Stores leave applications with approval workflow
      - Includes leave dates, type, and status

  2. Security
    - Enable RLS on all tables
    - Add policies for proper access control
    - Ensure data integrity with foreign key constraints

  3. Functions
    - Add functions for leave balance calculations
    - Add attendance status determination
*/

-- Create attendance_logs table
CREATE TABLE IF NOT EXISTS public.attendance_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  clock_in timestamptz,
  clock_out timestamptz,
  status text NOT NULL CHECK (status IN ('Present', 'Absent', 'Late', 'Half Day')),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(employee_id, date)
);

-- Create leave_types table
CREATE TABLE IF NOT EXISTS public.leave_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  default_days integer NOT NULL DEFAULT 0,
  requires_approval boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create leave_balances table
CREATE TABLE IF NOT EXISTS public.leave_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,
  leave_type_id uuid REFERENCES public.leave_types(id) ON DELETE CASCADE,
  year integer NOT NULL,
  total_days integer NOT NULL,
  used_days integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(employee_id, leave_type_id, year)
);

-- Create leave_requests table
CREATE TABLE IF NOT EXISTS public.leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,
  leave_type_id uuid REFERENCES public.leave_types(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text NOT NULL,
  status text NOT NULL CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Cancelled')),
  document_url text,
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.attendance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

-- Create policies for attendance_logs
CREATE POLICY "Users can view their own attendance"
  ON public.attendance_logs
  FOR SELECT
  USING (
    auth.uid() IN (
      SELECT id FROM public.profiles WHERE id = employee_id
    )
  );

CREATE POLICY "Users can create their own attendance"
  ON public.attendance_logs
  FOR INSERT
  WITH CHECK (
    auth.uid() IN (
      SELECT id FROM public.profiles WHERE id = employee_id
    )
  );

CREATE POLICY "Users can update their own attendance"
  ON public.attendance_logs
  FOR UPDATE
  USING (
    auth.uid() IN (
      SELECT id FROM public.profiles WHERE id = employee_id
    )
  );

-- Create policies for leave_types
CREATE POLICY "Everyone can view leave types"
  ON public.leave_types
  FOR SELECT
  TO authenticated
  USING (true);

-- Create policies for leave_balances
CREATE POLICY "Users can view their own leave balances"
  ON public.leave_balances
  FOR SELECT
  USING (
    auth.uid() IN (
      SELECT id FROM public.profiles WHERE id = employee_id
    )
  );

-- Create policies for leave_requests
CREATE POLICY "Users can view their own leave requests"
  ON public.leave_requests
  FOR SELECT
  USING (
    auth.uid() IN (
      SELECT id FROM public.profiles WHERE id = employee_id
    )
  );

CREATE POLICY "Users can create their own leave requests"
  ON public.leave_requests
  FOR INSERT
  WITH CHECK (
    auth.uid() IN (
      SELECT id FROM public.profiles WHERE id = employee_id
    )
  );

CREATE POLICY "Users can update their own pending leave requests"
  ON public.leave_requests
  FOR UPDATE
  USING (
    auth.uid() IN (
      SELECT id FROM public.profiles WHERE id = employee_id
    ) AND
    status = 'Pending'
  );

-- Add updated_at triggers
CREATE TRIGGER attendance_logs_updated_at
  BEFORE UPDATE ON public.attendance_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER leave_types_updated_at
  BEFORE UPDATE ON public.leave_types
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER leave_balances_updated_at
  BEFORE UPDATE ON public.leave_balances
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER leave_requests_updated_at
  BEFORE UPDATE ON public.leave_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Insert default leave types
INSERT INTO public.leave_types (name, description, default_days) VALUES
  ('Annual Leave', 'Regular paid vacation days', 20),
  ('Sick Leave', 'Leave for medical reasons', 10),
  ('Personal Leave', 'Leave for personal matters', 5),
  ('Maternity Leave', 'Leave for childbirth and care', 90),
  ('Paternity Leave', 'Leave for new fathers', 10),
  ('Bereavement Leave', 'Leave for family loss', 5)
ON CONFLICT (name) DO NOTHING;

-- Create function to calculate leave balance
CREATE OR REPLACE FUNCTION calculate_leave_balance(
  p_employee_id uuid,
  p_leave_type_id uuid,
  p_year integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_days integer;
  v_used_days integer;
BEGIN
  -- Get total and used days
  SELECT 
    total_days,
    used_days
  INTO
    v_total_days,
    v_used_days
  FROM public.leave_balances
  WHERE 
    employee_id = p_employee_id
    AND leave_type_id = p_leave_type_id
    AND year = p_year;

  -- Return available days
  RETURN COALESCE(v_total_days, 0) - COALESCE(v_used_days, 0);
END;
$$;

-- Create function to update leave balance
CREATE OR REPLACE FUNCTION update_leave_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_days integer;
BEGIN
  -- Calculate days between start and end date
  v_days := (NEW.end_date - NEW.start_date + 1)::integer;

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
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger for leave balance updates
CREATE TRIGGER update_leave_balance_trigger
  AFTER UPDATE ON public.leave_requests
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION update_leave_balance();