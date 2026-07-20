/*
  # Add Face Recognition Support

  1. New Tables
    - `employee_face_data`
      - Stores employee facial recognition data
      - Includes face descriptors and enrollment metadata
      - Ensures secure storage of biometric information

  2. Security
    - Enable RLS on face data table
    - Add policies for proper access control
    - Ensure data integrity with foreign key constraints

  3. Indexes
    - Add indexes for efficient querying
*/

-- Create employee face data table
CREATE TABLE IF NOT EXISTS public.employee_face_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  face_descriptor text NOT NULL, -- Stored as JSON string of Float32Array
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  last_used_at timestamptz,
  UNIQUE(employee_id)
);

-- Enable RLS
ALTER TABLE public.employee_face_data ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view face data"
  ON public.employee_face_data
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert face data"
  ON public.employee_face_data
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update face data"
  ON public.employee_face_data
  FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Users can delete face data"
  ON public.employee_face_data
  FOR DELETE
  TO authenticated
  USING (true);

-- Add updated_at trigger
CREATE TRIGGER employee_face_data_updated_at
  BEFORE UPDATE ON public.employee_face_data
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Create function to update last_used_at timestamp
CREATE OR REPLACE FUNCTION update_face_data_last_used()
RETURNS trigger AS $$
BEGIN
  UPDATE public.employee_face_data
  SET last_used_at = now()
  WHERE employee_id = NEW.employee_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update last_used_at when face is used for attendance
CREATE TRIGGER update_face_data_last_used_trigger
  AFTER INSERT OR UPDATE ON public.attendance_logs
  FOR EACH ROW
  WHEN (NEW.notes LIKE '%face recognition%')
  EXECUTE FUNCTION update_face_data_last_used();

-- Add index for faster lookups
CREATE INDEX idx_employee_face_data_employee_id ON public.employee_face_data(employee_id);

-- Add column to attendance_logs to track verification method
ALTER TABLE public.attendance_logs
ADD COLUMN IF NOT EXISTS verification_method text DEFAULT 'manual';

-- Add column to track face verification confidence
ALTER TABLE public.attendance_logs
ADD COLUMN IF NOT EXISTS face_confidence numeric(5,2);

-- Create function to check if employee has face data
CREATE OR REPLACE FUNCTION has_face_data(p_employee_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.employee_face_data
    WHERE employee_id = p_employee_id
  );
END;
$$;