/*
  # Fix component validation

  1. Changes
    - Update validation functions to handle empty arrays correctly
    - Fix calculation of totals for empty arrays
    - Ensure proper handling of NULL values

  2. Security
    - Maintains existing RLS policies
    - No changes to access control
*/

-- Update the salary components validation function to handle empty arrays
CREATE OR REPLACE FUNCTION validate_salary_components()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  total_salary numeric;
  component jsonb;
BEGIN
  -- Initialize total
  total_salary := 0;
  
  -- Handle empty or NULL arrays
  IF NEW.salary_components IS NULL OR jsonb_array_length(NEW.salary_components) = 0 THEN
    IF NEW.base_salary != 0 THEN
      RAISE EXCEPTION 'Base salary must be 0 when no salary components are provided';
    END IF;
    RETURN NEW;
  END IF;

  -- Calculate total from components
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
  IF round(total_salary::numeric, 2) != round(NEW.base_salary::numeric, 2) THEN
    RAISE EXCEPTION 'Salary components total (%) does not match base salary (%)', total_salary, NEW.base_salary;
  END IF;

  RETURN NEW;
END;
$$;

-- Update the deduction components validation function to handle empty arrays
CREATE OR REPLACE FUNCTION validate_deduction_components()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  total_deductions numeric;
  component jsonb;
BEGIN
  -- Initialize total
  total_deductions := 0;
  
  -- Handle empty or NULL arrays
  IF NEW.deduction_components IS NULL OR jsonb_array_length(NEW.deduction_components) = 0 THEN
    IF NEW.deductions != 0 THEN
      RAISE EXCEPTION 'Deductions must be 0 when no deduction components are provided';
    END IF;
    RETURN NEW;
  END IF;

  -- Calculate total from components
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

  -- Verify total matches deductions with proper rounding
  IF round(total_deductions::numeric, 2) != round(NEW.deductions::numeric, 2) THEN
    RAISE EXCEPTION 'Deduction components total (%) does not match deductions (%)', total_deductions, NEW.deductions;
  END IF;

  RETURN NEW;
END;
$$;

-- Update get_payroll_summary function to handle empty arrays
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
  -- Calculate component totals with proper handling of empty arrays
  SELECT 
    COALESCE(SUM(
      CASE 
        WHEN jsonb_array_length(salary_components) > 0 
        THEN (comp->>'amount')::numeric 
        ELSE 0 
      END
    ), 0),
    COALESCE(SUM(
      CASE 
        WHEN jsonb_array_length(deduction_components) > 0 
        THEN (ded->>'amount')::numeric 
        ELSE 0 
      END
    ), 0)
  INTO
    total_salary_components,
    total_deduction_components
  FROM public.payroll p
  LEFT JOIN LATERAL jsonb_array_elements(
    CASE 
      WHEN jsonb_array_length(p.salary_components) > 0 
      THEN p.salary_components 
      ELSE '[{"amount": 0}]'::jsonb 
    END
  ) comp ON true
  LEFT JOIN LATERAL jsonb_array_elements(
    CASE 
      WHEN jsonb_array_length(p.deduction_components) > 0 
      THEN p.deduction_components 
      ELSE '[{"amount": 0}]'::jsonb 
    END
  ) ded ON true
  WHERE p.period_start >= p_start
  AND p.period_end <= p_end;

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