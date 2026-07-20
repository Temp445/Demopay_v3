/*
  # Create payroll schema

  1. New Tables
    - `payroll`
      - `id` (uuid, primary key)
      - `employee_id` (uuid, foreign key to employees)
      - `period_start` (date)
      - `period_end` (date)
      - `base_salary` (numeric)
      - `overtime_hours` (numeric)
      - `overtime_rate` (numeric)
      - `deductions` (numeric)
      - `bonus` (numeric)
      - `total_amount` (numeric)
      - `status` (text)
      - `payment_date` (timestamptz)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Functions
    - `get_payroll_summary`: Calculates payroll statistics for a given period
      - Total payroll amount
      - Total number of employees
      - Total overtime amount
      - Total bonus amount

  3. Security
    - Enable RLS on payroll table
    - Add policies for authenticated users to manage payroll entries
*/

-- Create payroll table
CREATE TABLE IF NOT EXISTS public.payroll (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  base_salary numeric(10,2) NOT NULL CHECK (base_salary >= 0),
  overtime_hours numeric(5,2) DEFAULT 0 CHECK (overtime_hours >= 0),
  overtime_rate numeric(10,2) DEFAULT 0 CHECK (overtime_rate >= 0),
  deductions numeric(10,2) DEFAULT 0 CHECK (deductions >= 0),
  bonus numeric(10,2) DEFAULT 0 CHECK (bonus >= 0),
  total_amount numeric(10,2) NOT NULL CHECK (total_amount >= 0),
  status text NOT NULL CHECK (status IN ('Draft', 'Pending', 'Approved', 'Paid')),
  payment_date timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.payroll ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can read payroll entries"
  ON public.payroll
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can create payroll entries"
  ON public.payroll
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update payroll entries"
  ON public.payroll
  FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Users can delete payroll entries"
  ON public.payroll
  FOR DELETE
  TO authenticated
  USING (true);

-- Create updated_at trigger
CREATE TRIGGER payroll_updated_at
  BEFORE UPDATE ON public.payroll
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Create payroll summary function
CREATE OR REPLACE FUNCTION public.get_payroll_summary(p_start date, p_end date)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'total_payroll', COALESCE(SUM(total_amount), 0),
    'total_employees', COUNT(DISTINCT employee_id),
    'total_overtime', COALESCE(SUM(overtime_hours * overtime_rate), 0),
    'total_bonus', COALESCE(SUM(bonus), 0)
  )
  INTO result
  FROM public.payroll
  WHERE period_start >= p_start
  AND period_end <= p_end;

  RETURN result;
END;
$$;