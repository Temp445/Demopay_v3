/*
  # Enhance payroll system with component breakdowns and employee code

  1. Changes
    - Add employee_code column to payroll table
    - Add salary_components and deduction_components columns to store component breakdowns
    - Add triggers to validate component totals match base salary and deductions

  2. New Columns
    - employee_code (text, nullable): Optional employee code identifier
    - salary_components (jsonb): Array of salary components with name and amount
    - deduction_components (jsonb): Array of deduction components with name and amount

  3. Schema Validation
    - Added triggers to ensure component totals match base salary and deductions
    - Added validation for component structure using triggers
*/

-- Add new columns to payroll table
ALTER TABLE public.payroll
ADD COLUMN IF NOT EXISTS employee_code text,
ADD COLUMN IF NOT EXISTS salary_components jsonb NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS deduction_components jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Create function to validate salary components
CREATE OR REPLACE FUNCTION validate_salary_components()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  total_salary numeric;
  component jsonb;
BEGIN
  -- Calculate total from components
  total_salary := 0;
  FOR component IN SELECT * FROM jsonb_array_elements(NEW.salary_components)
  LOOP
    IF NOT (
      component ? 'name' AND 
      component ? 'amount' AND 
      jsonb_typeof(component->'name') = 'string' AND 
      jsonb_typeof(component->'amount') = 'number'
    ) THEN
      RAISE EXCEPTION 'Invalid salary component structure';
    END IF;
    total_salary := total_salary + (component->>'amount')::numeric;
  END LOOP;

  -- Verify total matches base_salary
  IF total_salary != NEW.base_salary THEN
    RAISE EXCEPTION 'Salary components total (%) does not match base salary (%)', total_salary, NEW.base_salary;
  END IF;

  RETURN NEW;
END;
$$;

-- Create function to validate deduction components
CREATE OR REPLACE FUNCTION validate_deduction_components()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  total_deductions numeric;
  component jsonb;
BEGIN
  -- Calculate total from components
  total_deductions := 0;
  FOR component IN SELECT * FROM jsonb_array_elements(NEW.deduction_components)
  LOOP
    IF NOT (
      component ? 'name' AND 
      component ? 'amount' AND 
      jsonb_typeof(component->'name') = 'string' AND 
      jsonb_typeof(component->'amount') = 'number'
    ) THEN
      RAISE EXCEPTION 'Invalid deduction component structure';
    END IF;
    total_deductions := total_deductions + (component->>'amount')::numeric;
  END LOOP;

  -- Verify total matches deductions
  IF total_deductions != NEW.deductions THEN
    RAISE EXCEPTION 'Deduction components total (%) does not match deductions (%)', total_deductions, NEW.deductions;
  END IF;

  RETURN NEW;
END;
$$;

-- Create triggers for validation
CREATE TRIGGER validate_salary_components_trigger
  BEFORE INSERT OR UPDATE ON public.payroll
  FOR EACH ROW
  EXECUTE FUNCTION validate_salary_components();

CREATE TRIGGER validate_deduction_components_trigger
  BEFORE INSERT OR UPDATE ON public.payroll
  FOR EACH ROW
  EXECUTE FUNCTION validate_deduction_components();

-- Update get_payroll_summary function to include component breakdowns
CREATE OR REPLACE FUNCTION public.get_payroll_summary(p_start date, p_end date)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
  total_salary_components numeric;
  total_deduction_components numeric;
BEGIN
  -- Calculate component totals
  SELECT 
    COALESCE(SUM((comp->>'amount')::numeric), 0),
    COALESCE(SUM((ded->>'amount')::numeric), 0)
  INTO
    total_salary_components,
    total_deduction_components
  FROM public.payroll,
    jsonb_array_elements(salary_components) comp,
    jsonb_array_elements(deduction_components) ded
  WHERE period_start >= p_start
  AND period_end <= p_end;

  -- Build summary
  SELECT json_build_object(
    'total_payroll', COALESCE(SUM(p.total_amount), 0),
    'total_employees', COUNT(DISTINCT p.employee_id),
    'total_overtime', COALESCE(SUM(p.overtime_hours * p.overtime_rate), 0),
    'total_bonus', COALESCE(SUM(p.bonus), 0),
    'total_salary_components', total_salary_components,
    'total_deduction_components', total_deduction_components
  )
  INTO result
  FROM public.payroll p
  WHERE p.period_start >= p_start
  AND p.period_end <= p_end;

  RETURN result;
END;
$$;