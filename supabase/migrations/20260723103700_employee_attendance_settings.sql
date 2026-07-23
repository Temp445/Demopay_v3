-- Migration: employee_attendance_settings

-- 1. Add capture_image_while_face_clockin to attendance_validation_config
ALTER TABLE public.attendance_validation_config 
ADD COLUMN IF NOT EXISTS capture_image_while_face_clockin BOOLEAN DEFAULT false;

-- 2. Create employee_attendance_settings table
CREATE TABLE IF NOT EXISTS public.employee_attendance_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE NOT NULL,
  
  allow_manual_clock_in_out boolean NOT NULL DEFAULT false,
  require_location boolean NOT NULL DEFAULT false,
  enable_travel_tracking boolean NOT NULL DEFAULT false,
  capture_image_while_face_clockin boolean NOT NULL DEFAULT false,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  UNIQUE(tenant_id, employee_id)
);

-- Enable RLS
ALTER TABLE public.employee_attendance_settings ENABLE ROW LEVEL SECURITY;

-- Add updated_at trigger
CREATE TRIGGER employee_attendance_settings_updated_at
  BEFORE UPDATE ON public.employee_attendance_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- RLS Policies
CREATE POLICY "Users can view employee attendance settings"
  ON public.employee_attendance_settings
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert employee attendance settings"
  ON public.employee_attendance_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update employee attendance settings"
  ON public.employee_attendance_settings
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete employee attendance settings"
  ON public.employee_attendance_settings
  FOR DELETE
  TO authenticated
  USING (true);
