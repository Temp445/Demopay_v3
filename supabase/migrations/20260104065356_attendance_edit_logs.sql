/*
  # Attendance Edit Logs System

  1. New Table
    - `attendance_edit_logs`
      - Tracks all edits made to attendance records
      - Stores original and modified values
      - Records editor information and reason for change
      - Links to attendance_logs table

  2. Security
    - Enable RLS on attendance_edit_logs table
    - Policies for authenticated users based on tenant
    - Secure access to own tenant data only
*/

-- Attendance Edit Logs Table
CREATE TABLE IF NOT EXISTS public.attendance_edit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  attendance_log_id uuid NOT NULL REFERENCES public.attendance_logs(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,

  -- Original Values
  original_clock_in timestamptz,
  original_clock_out timestamptz,

  -- Modified Values
  modified_clock_in timestamptz,
  modified_clock_out timestamptz,

  -- Edit Details
  reason_for_change text NOT NULL,
  edited_by uuid NOT NULL REFERENCES auth.users(id),
  edited_by_name text,
  edited_at timestamptz DEFAULT now(),

  created_at timestamptz DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_attendance_edit_logs_tenant_id ON public.attendance_edit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_attendance_edit_logs_attendance_log_id ON public.attendance_edit_logs(attendance_log_id);
CREATE INDEX IF NOT EXISTS idx_attendance_edit_logs_employee_id ON public.attendance_edit_logs(employee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_edit_logs_edited_by ON public.attendance_edit_logs(edited_by);
CREATE INDEX IF NOT EXISTS idx_attendance_edit_logs_edited_at ON public.attendance_edit_logs(edited_at);

-- Enable Row Level Security
ALTER TABLE public.attendance_edit_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for attendance_edit_logs

-- Policy: Users can view edit logs in their tenant
CREATE POLICY "Users can view edit logs in their tenant"
  ON public.attendance_edit_logs
  FOR SELECT
  TO authenticated
  USING (tenant_id IN (SELECT get_user_tenant_ids()));

-- Policy: Users can create edit logs in their tenant
CREATE POLICY "Users can create edit logs in their tenant"
  ON public.attendance_edit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids()));

-- Function to automatically log attendance edits
CREATE OR REPLACE FUNCTION log_attendance_edit()
RETURNS TRIGGER AS $$
DECLARE
  v_user_name text;
  v_tenant_id uuid;
BEGIN
  -- Only log if clock_in or clock_out changed
  IF (OLD.clock_in IS DISTINCT FROM NEW.clock_in) OR (OLD.clock_out IS DISTINCT FROM NEW.clock_out) THEN
    -- Get tenant_id
    v_tenant_id := NEW.tenant_id;

    -- Get user name
    SELECT name INTO v_user_name
    FROM public.employees
    WHERE email = auth.jwt()->>'email'
    LIMIT 1;

    -- Insert edit log
    INSERT INTO public.attendance_edit_logs (
      tenant_id,
      attendance_log_id,
      employee_id,
      original_clock_in,
      original_clock_out,
      modified_clock_in,
      modified_clock_out,
      reason_for_change,
      edited_by,
      edited_by_name
    ) VALUES (
      v_tenant_id,
      NEW.id,
      NEW.employee_id,
      OLD.clock_in,
      OLD.clock_out,
      NEW.clock_in,
      NEW.clock_out,
      COALESCE(NEW.notes, 'Updated via time stamp management'),
      auth.uid(),
      COALESCE(v_user_name, 'System')
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to automatically log attendance edits
DROP TRIGGER IF EXISTS log_attendance_edits ON public.attendance_logs;
CREATE TRIGGER log_attendance_edits
  AFTER UPDATE ON public.attendance_logs
  FOR EACH ROW
  EXECUTE FUNCTION log_attendance_edit();