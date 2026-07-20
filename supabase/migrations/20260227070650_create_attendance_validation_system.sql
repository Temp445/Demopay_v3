/*
  # Create Attendance Validation System

  1. New Tables
    - `attendance_validation_config`: Global attendance validation configuration
      - Entry grace time, exit grace time
      - Late entry/early exit limits and monthly count limits
      - Permission settings (min, max, total per month, increment)
    
    - `employee_permission_balance`: Track monthly permission balance per employee
      - employee_id, month, year
      - total_allowed_minutes, used_minutes, remaining_minutes
      - late_entry_count, early_exit_count

    - `employee_attendance_history`: Track attendance actions for validation
      - employee_id, date, action_type
      - minutes_used, balance_after
      - Related attendance_log_id

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users
*/

-- Create attendance validation configuration table
CREATE TABLE IF NOT EXISTS public.attendance_validation_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  
  -- Grace Time Settings
  entry_grace_time_minutes integer NOT NULL DEFAULT 15 CHECK (entry_grace_time_minutes >= 0),
  exit_grace_time_minutes integer NOT NULL DEFAULT 15 CHECK (exit_grace_time_minutes >= 0),
  
  -- Late Entry Settings
  late_entry_limit_minutes integer NOT NULL DEFAULT 30 CHECK (late_entry_limit_minutes >= 0),
  total_allowed_late_entry_count integer NOT NULL DEFAULT 5 CHECK (total_allowed_late_entry_count >= 0),
  
  -- Early Exit Settings
  early_exit_limit_minutes integer NOT NULL DEFAULT 30 CHECK (early_exit_limit_minutes >= 0),
  total_allowed_early_exit_count integer NOT NULL DEFAULT 5 CHECK (total_allowed_early_exit_count >= 0),
  
  -- Permission Settings
  min_permission_minutes integer NOT NULL DEFAULT 30 CHECK (min_permission_minutes >= 0),
  max_permission_minutes integer NOT NULL DEFAULT 60 CHECK (max_permission_minutes >= min_permission_minutes),
  total_permission_minutes_per_month integer NOT NULL DEFAULT 180 CHECK (total_permission_minutes_per_month >= 0),
  permission_round_up_to_minutes integer NOT NULL DEFAULT 30 CHECK (permission_round_up_to_minutes > 0),
  
  -- Half Day Settings
  enable_half_day_rules boolean NOT NULL DEFAULT true,
  
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  UNIQUE(tenant_id)
);

-- Create employee permission balance tracking table
CREATE TABLE IF NOT EXISTS public.employee_permission_balance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  employee_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  
  month integer NOT NULL CHECK (month >= 1 AND month <= 12),
  year integer NOT NULL CHECK (year >= 2020),
  
  total_allowed_minutes integer NOT NULL DEFAULT 180,
  used_minutes integer NOT NULL DEFAULT 0,
  remaining_minutes integer NOT NULL DEFAULT 180,
  
  late_entry_count integer NOT NULL DEFAULT 0,
  early_exit_count integer NOT NULL DEFAULT 0,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  UNIQUE(tenant_id, employee_id, month, year),
  CHECK (remaining_minutes >= 0),
  CHECK (used_minutes >= 0),
  CHECK (late_entry_count >= 0),
  CHECK (early_exit_count >= 0)
);

-- Create employee attendance history tracking table
CREATE TABLE IF NOT EXISTS public.employee_attendance_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  employee_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  attendance_log_id uuid REFERENCES public.attendance_logs(id) ON DELETE CASCADE,
  
  date date NOT NULL,
  action_type text NOT NULL CHECK (action_type IN (
    'grace_period', 
    'late_entry', 
    'early_exit', 
    'permission', 
    'half_day_first', 
    'half_day_second', 
    'first_off', 
    'second_off',
    'absent'
  )),
  
  entry_time_gap_minutes integer,
  exit_time_gap_minutes integer,
  minutes_used integer DEFAULT 0,
  balance_after integer,
  
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.attendance_validation_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_permission_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_attendance_history ENABLE ROW LEVEL SECURITY;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_permission_balance_employee_month 
  ON public.employee_permission_balance(employee_id, year, month);

CREATE INDEX IF NOT EXISTS idx_permission_balance_tenant 
  ON public.employee_permission_balance(tenant_id, year, month);

CREATE INDEX IF NOT EXISTS idx_attendance_history_employee_date 
  ON public.employee_attendance_history(employee_id, date);

CREATE INDEX IF NOT EXISTS idx_attendance_history_tenant 
  ON public.employee_attendance_history(tenant_id, date);

-- Add updated_at triggers
CREATE TRIGGER attendance_validation_config_updated_at
  BEFORE UPDATE ON public.attendance_validation_config
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER employee_permission_balance_updated_at
  BEFORE UPDATE ON public.employee_permission_balance
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER employee_attendance_history_updated_at
  BEFORE UPDATE ON public.employee_attendance_history
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Create RLS Policies for attendance_validation_config
CREATE POLICY "Users can view validation config"
  ON public.attendance_validation_config
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert validation config"
  ON public.attendance_validation_config
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update validation config"
  ON public.attendance_validation_config
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create RLS Policies for employee_permission_balance
CREATE POLICY "Users can view permission balance"
  ON public.employee_permission_balance
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert permission balance"
  ON public.employee_permission_balance
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update permission balance"
  ON public.employee_permission_balance
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create RLS Policies for employee_attendance_history
CREATE POLICY "Users can view attendance history"
  ON public.employee_attendance_history
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert attendance history"
  ON public.employee_attendance_history
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Function to initialize employee permission balance for a given month/year
CREATE OR REPLACE FUNCTION initialize_employee_permission_balance(
  p_tenant_id uuid,
  p_employee_id uuid,
  p_month integer,
  p_year integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_balance_id uuid;
  v_total_minutes integer;
BEGIN
  -- Get the total allowed minutes from config
  SELECT total_permission_minutes_per_month 
  INTO v_total_minutes
  FROM attendance_validation_config
  WHERE tenant_id = p_tenant_id
  AND is_active = true
  LIMIT 1;

  -- Default to 180 if no config found
  IF v_total_minutes IS NULL THEN
    v_total_minutes := 180;
  END IF;

  -- Insert or update the balance
  INSERT INTO employee_permission_balance (
    tenant_id,
    employee_id,
    month,
    year,
    total_allowed_minutes,
    used_minutes,
    remaining_minutes
  ) VALUES (
    p_tenant_id,
    p_employee_id,
    p_month,
    p_year,
    v_total_minutes,
    0,
    v_total_minutes
  )
  ON CONFLICT (tenant_id, employee_id, month, year)
  DO UPDATE SET
    total_allowed_minutes = EXCLUDED.total_allowed_minutes,
    remaining_minutes = employee_permission_balance.remaining_minutes + (EXCLUDED.total_allowed_minutes - employee_permission_balance.total_allowed_minutes)
  RETURNING id INTO v_balance_id;

  RETURN v_balance_id;
END;
$$;

-- Function to get or create employee permission balance
CREATE OR REPLACE FUNCTION get_employee_permission_balance(
  p_tenant_id uuid,
  p_employee_id uuid,
  p_date date
)
RETURNS TABLE (
  balance_id uuid,
  total_allowed integer,
  used integer,
  remaining integer,
  late_count integer,
  early_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_month integer;
  v_year integer;
  v_balance_id uuid;
BEGIN
  v_month := EXTRACT(MONTH FROM p_date);
  v_year := EXTRACT(YEAR FROM p_date);

  -- Try to get existing balance
  SELECT 
    id,
    total_allowed_minutes,
    used_minutes,
    remaining_minutes,
    late_entry_count,
    early_exit_count
  INTO
    balance_id,
    total_allowed,
    used,
    remaining,
    late_count,
    early_count
  FROM employee_permission_balance
  WHERE tenant_id = p_tenant_id
    AND employee_id = p_employee_id
    AND month = v_month
    AND year = v_year;

  -- If not found, initialize it
  IF balance_id IS NULL THEN
    v_balance_id := initialize_employee_permission_balance(
      p_tenant_id,
      p_employee_id,
      v_month,
      v_year
    );

    SELECT 
      id,
      total_allowed_minutes,
      used_minutes,
      remaining_minutes,
      late_entry_count,
      early_exit_count
    INTO
      balance_id,
      total_allowed,
      used,
      remaining,
      late_count,
      early_count
    FROM employee_permission_balance
    WHERE id = v_balance_id;
  END IF;

  RETURN NEXT;
END;
$$;

-- Function to update employee permission balance
CREATE OR REPLACE FUNCTION update_employee_permission_balance(
  p_tenant_id uuid,
  p_employee_id uuid,
  p_date date,
  p_minutes_used integer DEFAULT 0,
  p_late_entry_increment integer DEFAULT 0,
  p_early_exit_increment integer DEFAULT 0
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_month integer;
  v_year integer;
BEGIN
  v_month := EXTRACT(MONTH FROM p_date);
  v_year := EXTRACT(YEAR FROM p_date);

  -- Update the balance
  UPDATE employee_permission_balance
  SET
    used_minutes = used_minutes + p_minutes_used,
    remaining_minutes = remaining_minutes - p_minutes_used,
    late_entry_count = late_entry_count + p_late_entry_increment,
    early_exit_count = early_exit_count + p_early_exit_increment,
    updated_at = now()
  WHERE tenant_id = p_tenant_id
    AND employee_id = p_employee_id
    AND month = v_month
    AND year = v_year;

  RETURN FOUND;
END;
$$;
