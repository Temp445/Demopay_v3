/*
  # Add employee code field

  1. Changes
    - Add optional employee_code column to employees table
    - Add unique constraint to ensure no duplicate codes
*/

-- Add employee_code column
ALTER TABLE public.employees
ADD COLUMN IF NOT EXISTS employee_code text UNIQUE;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS employees_employee_code_idx ON public.employees (employee_code);