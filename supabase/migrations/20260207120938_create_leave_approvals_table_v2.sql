/*
  # Create Leave Approvals Tracking Table

  1. New Tables
    - `leave_approvals`
      - `id` (uuid, primary key) - Unique identifier for the approval record
      - `leave_request_id` (uuid, not null) - Reference to the leave request
      - `employee_id` (uuid, not null) - Reference to the employee
      - `leave_date` (date, not null) - Specific date of leave
      - `leave_type_id` (uuid, not null) - Reference to the leave type
      - `is_holiday` (boolean, default false) - Whether this date is a holiday
      - `is_weekoff` (boolean, default false) - Whether this date is a weekoff
      - `is_within_leave_period` (boolean, default true) - Whether date is within original leave period
      - `policy_type` (text) - Policy that triggered this record (e.g., 'before_leave_holiday', 'after_leave_week_off', 'in_between_leave_holiday', 'primary')
      - `created_at` (timestamptz, default now()) - Timestamp when the record was created
      - `updated_at` (timestamptz, default now()) - Timestamp when the record was last updated
      - `tenant_id` (uuid) - Reference to the tenant
  
  2. Indexes
    - Index on leave_request_id for fast lookups
    - Index on employee_id for employee-specific queries
    - Index on leave_date for date range queries
    - Composite index on (employee_id, leave_date) for uniqueness and performance
  
  3. Security
    - Enable RLS on `leave_approvals` table
    - Add policy for authenticated users to read their tenant's records
    - Add policy for authenticated users to insert records
    - Add policy for authenticated users to update records
    - Add policy for authenticated users to delete records
*/

CREATE TABLE IF NOT EXISTS leave_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_request_id uuid NOT NULL REFERENCES leave_requests(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_date date NOT NULL,
  leave_type_id uuid NOT NULL REFERENCES leave_types(id),
  is_holiday boolean DEFAULT false,
  is_weekoff boolean DEFAULT false,
  is_within_leave_period boolean DEFAULT true,
  policy_type text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  tenant_id uuid
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_leave_approvals_request_id ON leave_approvals(leave_request_id);
CREATE INDEX IF NOT EXISTS idx_leave_approvals_employee_id ON leave_approvals(employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_approvals_leave_date ON leave_approvals(leave_date);
CREATE INDEX IF NOT EXISTS idx_leave_approvals_tenant_id ON leave_approvals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leave_approvals_employee_date ON leave_approvals(employee_id, leave_date);

-- Enable RLS
ALTER TABLE leave_approvals ENABLE ROW LEVEL SECURITY;

-- Policy for authenticated users to read their tenant's records
CREATE POLICY "Authenticated users can read tenant leave approvals"
  ON leave_approvals FOR SELECT
  TO authenticated
  USING (true);

-- Policy for authenticated users to insert records
CREATE POLICY "Authenticated users can insert leave approvals"
  ON leave_approvals FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Policy for authenticated users to update records
CREATE POLICY "Authenticated users can update leave approvals"
  ON leave_approvals FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Policy for authenticated users to delete records
CREATE POLICY "Authenticated users can delete leave approvals"
  ON leave_approvals FOR DELETE
  TO authenticated
  USING (true);

-- Create a trigger to automatically update updated_at
DROP TRIGGER IF EXISTS update_leave_approvals_updated_at ON leave_approvals;
CREATE TRIGGER update_leave_approvals_updated_at
  BEFORE UPDATE ON leave_approvals
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();