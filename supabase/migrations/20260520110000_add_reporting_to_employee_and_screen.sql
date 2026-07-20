-- Migration to add reporting_to (supports multiple managers) to employees table and register the Employee Reporting screen
ALTER TABLE employees
ADD COLUMN IF NOT EXISTS reporting_to uuid[];

COMMENT ON COLUMN employees.reporting_to IS 'Array of employee IDs they report to (supports multiple managers)';

