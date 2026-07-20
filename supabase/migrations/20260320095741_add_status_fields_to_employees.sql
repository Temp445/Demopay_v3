/*
  # Add Status Date and Reason Fields to Employees

  1. Changes to employees table
    - Add `status_date` (date, nullable) - Date when status change becomes effective
    - Add `status_reason` (text, nullable) - Reason for status change (Suspended/Resigned/Terminated)

  2. Purpose
    - Track effective date and reason when employee status changes to Suspended, Resigned, or Terminated
    - Enable filtering logic based on resignation dates in TimeStampManagementPage

  3. Notes
    - Fields are nullable to maintain backward compatibility
    - Only used when status is Suspended, Resigned, or Terminated
*/

-- Add status_date column to employees table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'status_date'
  ) THEN
    ALTER TABLE employees ADD COLUMN status_date date;
  END IF;
END $$;

-- Add status_reason column to employees table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'status_reason'
  ) THEN
    ALTER TABLE employees ADD COLUMN status_reason text;
  END IF;
END $$;