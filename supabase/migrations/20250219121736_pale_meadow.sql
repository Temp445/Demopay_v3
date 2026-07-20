-- Add new columns to employees table
ALTER TABLE public.employees
ADD COLUMN IF NOT EXISTS address text,
ADD COLUMN IF NOT EXISTS date_of_birth date;

-- Add validation for date_of_birth
ALTER TABLE public.employees
ADD CONSTRAINT employee_date_of_birth_check
CHECK (date_of_birth <= CURRENT_DATE);