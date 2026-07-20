-- Migration to add is_reporting_head to employees table
ALTER TABLE employees
ADD COLUMN IF NOT EXISTS is_reporting_head boolean DEFAULT false;

COMMENT ON COLUMN employees.is_reporting_head IS 'Indicates if the employee is a reporting head (manager/lead)';
