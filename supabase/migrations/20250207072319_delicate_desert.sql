/*
  # Add Component Types Tables

  1. New Tables
    - `salary_component_types`
      - `id` (uuid, primary key)
      - `name` (text, unique)
      - `description` (text)
      - `is_active` (boolean)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
    
    - `deduction_component_types`
      - `id` (uuid, primary key)
      - `name` (text, unique)
      - `description` (text)
      - `is_active` (boolean)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on both tables
    - Add policies for authenticated users to read and manage component types
*/

-- Create salary component types table
CREATE TABLE IF NOT EXISTS public.salary_component_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  description text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create deduction component types table
CREATE TABLE IF NOT EXISTS public.deduction_component_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  description text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.salary_component_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deduction_component_types ENABLE ROW LEVEL SECURITY;

-- Create policies for salary component types
CREATE POLICY "Users can read salary component types"
  ON public.salary_component_types
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can create salary component types"
  ON public.salary_component_types
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update salary component types"
  ON public.salary_component_types
  FOR UPDATE
  TO authenticated
  USING (true);

-- Create policies for deduction component types
CREATE POLICY "Users can read deduction component types"
  ON public.deduction_component_types
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can create deduction component types"
  ON public.deduction_component_types
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update deduction component types"
  ON public.deduction_component_types
  FOR UPDATE
  TO authenticated
  USING (true);

-- Add updated_at triggers
CREATE TRIGGER salary_component_types_updated_at
  BEFORE UPDATE ON public.salary_component_types
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER deduction_component_types_updated_at
  BEFORE UPDATE ON public.deduction_component_types
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Insert some default component types
INSERT INTO public.salary_component_types (name, description) VALUES
  ('Basic Salary', 'Base salary component'),
  ('Housing Allowance', 'Monthly housing allowance'),
  ('Transport Allowance', 'Monthly transport allowance'),
  ('Performance Bonus', 'Performance-based bonus component'),
  ('Meal Allowance', 'Food and meal allowance')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.deduction_component_types (name, description) VALUES
  ('Income Tax', 'Mandatory income tax deduction'),
  ('Health Insurance', 'Employee health insurance premium'),
  ('Pension Fund', 'Retirement fund contribution'),
  ('Social Security', 'Social security contribution'),
  ('Professional Tax', 'Professional tax deduction')
ON CONFLICT (name) DO NOTHING;