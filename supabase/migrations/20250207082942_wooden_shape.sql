/*
  # Add calculation methods to payroll components

  1. Changes
    - Add calculation_method and reference_component fields to salary_components and deduction_components
    - Update validation functions to handle percentage calculations
    - Add percentage validation check

  2. New Fields
    - calculation_method: 'fixed' or 'percentage'
    - percentage_value: stores the percentage when using percentage calculation
    - reference_component: name of the component used as base for percentage calculation
*/

-- Modify the payroll table to update the components structure
ALTER TABLE public.payroll
ADD COLUMN IF NOT EXISTS salary_components_extended jsonb NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS deduction_components_extended jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Update validation functions to handle the new structure
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
  IF NEW.salary_components_extended IS NULL OR jsonb_array_length(NEW.salary_components_extended) = 0 THEN
    IF NEW.base_salary != 0 THEN
      RAISE EXCEPTION 'Base salary must be 0 when no salary components are provided';
    END IF;
    RETURN NEW;
  END IF;

  -- Calculate total from components
  FOR component IN SELECT * FROM jsonb_array_elements(NEW.salary_components_extended)
  LOOP
    IF NOT (
      component ? 'name' AND 
      component ? 'amount' AND 
      component ? 'calculation_method' AND
      jsonb_typeof(component->'name') = 'string' AND 
      jsonb_typeof(component->'amount') = 'number' AND
      jsonb_typeof(component->'calculation_method') = 'string'
    ) THEN
      RAISE EXCEPTION 'Invalid salary component structure';
    END IF;

    -- Validate percentage if applicable
    IF (component->>'calculation_method') = 'percentage' THEN
      IF NOT (
        component ? 'percentage_value' AND
        component ? 'reference_component' AND
        (component->>'percentage_value')::numeric BETWEEN 0 AND 100
      ) THEN
        RAISE EXCEPTION 'Invalid percentage calculation configuration';
      END IF;
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

-- Update deduction validation function
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
  IF NEW.deduction_components_extended IS NULL OR jsonb_array_length(NEW.deduction_components_extended) = 0 THEN
    IF NEW.deductions != 0 THEN
      RAISE EXCEPTION 'Deductions must be 0 when no deduction components are provided';
    END IF;
    RETURN NEW;
  END IF;

  -- Calculate total from components
  FOR component IN SELECT * FROM jsonb_array_elements(NEW.deduction_components_extended)
  LOOP
    IF NOT (
      component ? 'name' AND 
      component ? 'amount' AND 
      component ? 'calculation_method' AND
      jsonb_typeof(component->'name') = 'string' AND 
      jsonb_typeof(component->'amount') = 'number' AND
      jsonb_typeof(component->'calculation_method') = 'string'
    ) THEN
      RAISE EXCEPTION 'Invalid deduction component structure';
    END IF;

    -- Validate percentage if applicable
    IF (component->>'calculation_method') = 'percentage' THEN
      IF NOT (
        component ? 'percentage_value' AND
        component ? 'reference_component' AND
        (component->>'percentage_value')::numeric BETWEEN 0 AND 100
      ) THEN
        RAISE EXCEPTION 'Invalid percentage calculation configuration';
      END IF;
    END IF;

    total_deductions := total_deductions + (component->>'amount')::numeric;
  END LOOP;

  -- Verify total matches deductions
  IF round(total_deductions::numeric, 2) != round(NEW.deductions::numeric, 2) THEN
    RAISE EXCEPTION 'Deduction components total (%) does not match deductions (%)', total_deductions, NEW.deductions;
  END IF;

  RETURN NEW;
END;
$$;