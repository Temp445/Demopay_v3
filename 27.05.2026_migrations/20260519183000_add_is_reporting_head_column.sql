-- Migration to add is_reporting_head to employees table
ALTER TABLE employees
ADD COLUMN IF NOT EXISTS is_reporting_head boolean DEFAULT false;

COMMENT ON COLUMN employees.is_reporting_head IS 'Indicates if the employee is a reporting head (manager/lead)';

-- Migration to add reporting_to (supports multiple managers) to employees table and register the Employee Reporting screen
ALTER TABLE employees
ADD COLUMN IF NOT EXISTS reporting_to uuid[];

COMMENT ON COLUMN employees.reporting_to IS 'Array of employee IDs they report to (supports multiple managers)';

