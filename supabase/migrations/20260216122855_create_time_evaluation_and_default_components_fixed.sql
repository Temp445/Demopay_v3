/*
  # Create Time Evaluation System and Default Components

  1. New Tables
    - `employee_time_evaluations` - Stores comprehensive time evaluation data for each employee per period
    
  2. Default Components
    - Ensures all required payroll components exist in the database
    - Includes all time wage types and calculation components
    
  3. Purpose
    - Support comprehensive attendance-based payroll calculation
    - Store evaluated time data (Present Days, Absent Days, Leave Days, Shifts, GatePass, etc.)
    - Provide Sum and Count versions of all metrics
    - Enable expression-based salary calculations
*/

-- Create employee_time_evaluations table
CREATE TABLE IF NOT EXISTS employee_time_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  period text NOT NULL,
  
  calendar_days numeric DEFAULT 0,
  pay_days numeric DEFAULT 0,
  working_days numeric DEFAULT 0,
  
  present_days numeric DEFAULT 0,
  present_days_count integer DEFAULT 0,
  
  absent_days numeric DEFAULT 0,
  absent_days_count integer DEFAULT 0,
  
  paid_leave_days numeric DEFAULT 0,
  paid_leave_days_count integer DEFAULT 0,
  
  unpaid_leave_days numeric DEFAULT 0,
  unpaid_leave_days_count integer DEFAULT 0,
  
  leave_days numeric DEFAULT 0,
  leave_count integer DEFAULT 0,
  
  week_off_days numeric DEFAULT 0,
  week_off_days_count integer DEFAULT 0,
  
  paid_holidays numeric DEFAULT 0,
  paid_holidays_count integer DEFAULT 0,
  
  shift_days numeric DEFAULT 0,
  shift_days_count integer DEFAULT 0,
  
  gate_pass_hours numeric DEFAULT 0,
  gate_pass_count integer DEFAULT 0,
  
  payable_days numeric DEFAULT 0,
  payable_days_count integer DEFAULT 0,
  
  shift_breakdown jsonb DEFAULT '{}',
  shift_count_breakdown jsonb DEFAULT '{}',
  leave_type_breakdown jsonb DEFAULT '{}',
  gate_pass_type_breakdown jsonb DEFAULT '{}',
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  UNIQUE(tenant_id, employee_id, period)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_time_evaluations_tenant ON employee_time_evaluations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_time_evaluations_employee ON employee_time_evaluations(employee_id);
CREATE INDEX IF NOT EXISTS idx_time_evaluations_period ON employee_time_evaluations(period);

-- Enable Row Level Security
ALTER TABLE employee_time_evaluations ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own tenant time evaluations"
  ON employee_time_evaluations FOR SELECT
  TO authenticated
  USING (tenant_id IN (
    SELECT tenant_id FROM auth.users WHERE id = auth.uid()
  ));

CREATE POLICY "Users can insert own tenant time evaluations"
  ON employee_time_evaluations FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id IN (
    SELECT tenant_id FROM auth.users WHERE id = auth.uid()
  ));

CREATE POLICY "Users can update own tenant time evaluations"
  ON employee_time_evaluations FOR UPDATE
  TO authenticated
  USING (tenant_id IN (
    SELECT tenant_id FROM auth.users WHERE id = auth.uid()
  ));

CREATE POLICY "Users can delete own tenant time evaluations"
  ON employee_time_evaluations FOR DELETE
  TO authenticated
  USING (tenant_id IN (
    SELECT tenant_id FROM auth.users WHERE id = auth.uid()
  ));

-- Function to ensure default components exist for all tenants
CREATE OR REPLACE FUNCTION ensure_default_payroll_components()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  tenant_record RECORD;
  component_exists boolean;
  shift_name text;
BEGIN
  FOR tenant_record IN SELECT id FROM tenants LOOP
    -- CalendarDays
    SELECT EXISTS (
      SELECT 1 FROM payroll_components 
      WHERE tenant_id = tenant_record.id AND name = 'CalanderDays'
    ) INTO component_exists;
    IF NOT component_exists THEN
      INSERT INTO payroll_components (tenant_id, name, component_type, component_category, is_active, description)
      VALUES (tenant_record.id, 'CalanderDays', 'earning', 'calculation', true, 'Total calendar days in the payroll period');
    END IF;
    
    -- Pay Days
    SELECT EXISTS (
      SELECT 1 FROM payroll_components 
      WHERE tenant_id = tenant_record.id AND name = 'Pay Days'
    ) INTO component_exists;
    IF NOT component_exists THEN
      INSERT INTO payroll_components (tenant_id, name, component_type, component_category, is_active, description)
      VALUES (tenant_record.id, 'Pay Days', 'earning', 'calculation', true, 'CalanderDays OR user-defined days');
    END IF;
    
    -- WeekOff
    SELECT EXISTS (
      SELECT 1 FROM payroll_components 
      WHERE tenant_id = tenant_record.id AND name = 'WeekOff'
    ) INTO component_exists;
    IF NOT component_exists THEN
      INSERT INTO payroll_components (tenant_id, name, component_type, component_category, is_active, description)
      VALUES (tenant_record.id, 'WeekOff', 'earning', 'calculation', true, 'Total weekend/week off days in the period');
    END IF;
    
    -- PaidHolidays
    SELECT EXISTS (
      SELECT 1 FROM payroll_components 
      WHERE tenant_id = tenant_record.id AND name = 'PaidHolidays'
    ) INTO component_exists;
    IF NOT component_exists THEN
      INSERT INTO payroll_components (tenant_id, name, component_type, component_category, is_active, description)
      VALUES (tenant_record.id, 'PaidHolidays', 'earning', 'calculation', true, 'Total paid holidays in the period');
    END IF;
    
    -- WorkingDays
    SELECT EXISTS (
      SELECT 1 FROM payroll_components 
      WHERE tenant_id = tenant_record.id AND name = 'WorkingDays'
    ) INTO component_exists;
    IF NOT component_exists THEN
      INSERT INTO payroll_components (tenant_id, name, component_type, component_category, is_active, description)
      VALUES (tenant_record.id, 'WorkingDays', 'earning', 'calculation', true, 'Total working days excluding weekend/week off days and holidays');
    END IF;
    
    -- PresentDays
    SELECT EXISTS (
      SELECT 1 FROM payroll_components 
      WHERE tenant_id = tenant_record.id AND name = 'PresentDays'
    ) INTO component_exists;
    IF NOT component_exists THEN
      INSERT INTO payroll_components (tenant_id, name, component_type, component_category, is_active, description)
      VALUES (tenant_record.id, 'PresentDays', 'earning', 'calculation', true, 'Total days (Sum) employee was present');
    END IF;
    
    -- PresentDays Count
    SELECT EXISTS (
      SELECT 1 FROM payroll_components 
      WHERE tenant_id = tenant_record.id AND name = 'PresentDays Count'
    ) INTO component_exists;
    IF NOT component_exists THEN
      INSERT INTO payroll_components (tenant_id, name, component_type, component_category, is_active, description)
      VALUES (tenant_record.id, 'PresentDays Count', 'earning', 'calculation', true, 'Count of present Day occurrences');
    END IF;
    
    -- AbsentDays
    SELECT EXISTS (
      SELECT 1 FROM payroll_components 
      WHERE tenant_id = tenant_record.id AND name = 'AbsentDays'
    ) INTO component_exists;
    IF NOT component_exists THEN
      INSERT INTO payroll_components (tenant_id, name, component_type, component_category, is_active, description)
      VALUES (tenant_record.id, 'AbsentDays', 'earning', 'calculation', true, 'Total days employee was absent');
    END IF;
    
    -- AbsentDays Count
    SELECT EXISTS (
      SELECT 1 FROM payroll_components 
      WHERE tenant_id = tenant_record.id AND name = 'AbsentDays Count'
    ) INTO component_exists;
    IF NOT component_exists THEN
      INSERT INTO payroll_components (tenant_id, name, component_type, component_category, is_active, description)
      VALUES (tenant_record.id, 'AbsentDays Count', 'earning', 'calculation', true, 'Number of absent occurrences');
    END IF;
    
    -- PaidLeaveDays
    SELECT EXISTS (
      SELECT 1 FROM payroll_components 
      WHERE tenant_id = tenant_record.id AND name = 'PaidLeaveDays'
    ) INTO component_exists;
    IF NOT component_exists THEN
      INSERT INTO payroll_components (tenant_id, name, component_type, component_category, is_active, description)
      VALUES (tenant_record.id, 'PaidLeaveDays', 'earning', 'calculation', true, 'Total paid leave days');
    END IF;
    
    -- PaidLeaveDays Count
    SELECT EXISTS (
      SELECT 1 FROM payroll_components 
      WHERE tenant_id = tenant_record.id AND name = 'PaidLeaveDays Count'
    ) INTO component_exists;
    IF NOT component_exists THEN
      INSERT INTO payroll_components (tenant_id, name, component_type, component_category, is_active, description)
      VALUES (tenant_record.id, 'PaidLeaveDays Count', 'earning', 'calculation', true, 'Number of paid leave occurrences');
    END IF;
    
    -- UnpaidLeaveDays
    SELECT EXISTS (
      SELECT 1 FROM payroll_components 
      WHERE tenant_id = tenant_record.id AND name = 'UnpaidLeaveDays'
    ) INTO component_exists;
    IF NOT component_exists THEN
      INSERT INTO payroll_components (tenant_id, name, component_type, component_category, is_active, description)
      VALUES (tenant_record.id, 'UnpaidLeaveDays', 'earning', 'calculation', true, 'Total unpaid leave days (LOP)');
    END IF;
    
    -- UnpaidLeaveDays Count
    SELECT EXISTS (
      SELECT 1 FROM payroll_components 
      WHERE tenant_id = tenant_record.id AND name = 'UnpaidLeaveDays Count'
    ) INTO component_exists;
    IF NOT component_exists THEN
      INSERT INTO payroll_components (tenant_id, name, component_type, component_category, is_active, description)
      VALUES (tenant_record.id, 'UnpaidLeaveDays Count', 'earning', 'calculation', true, 'Number of unpaid leave occurrences (LOP)');
    END IF;
    
    -- LeaveDays
    SELECT EXISTS (
      SELECT 1 FROM payroll_components 
      WHERE tenant_id = tenant_record.id AND name = 'LeaveDays'
    ) INTO component_exists;
    IF NOT component_exists THEN
      INSERT INTO payroll_components (tenant_id, name, component_type, component_category, is_active, description)
      VALUES (tenant_record.id, 'LeaveDays', 'earning', 'calculation', true, 'Total leave days (PaidLeaveDays + UnpaidLeaveDays)');
    END IF;
    
    -- Leave Count
    SELECT EXISTS (
      SELECT 1 FROM payroll_components 
      WHERE tenant_id = tenant_record.id AND name = 'Leave Count'
    ) INTO component_exists;
    IF NOT component_exists THEN
      INSERT INTO payroll_components (tenant_id, name, component_type, component_category, is_active, description)
      VALUES (tenant_record.id, 'Leave Count', 'earning', 'calculation', true, 'Number of leave occurrences');
    END IF;
    
    -- CL (Casual Leave)
    SELECT EXISTS (
      SELECT 1 FROM payroll_components 
      WHERE tenant_id = tenant_record.id AND name = 'CL'
    ) INTO component_exists;
    IF NOT component_exists THEN
      INSERT INTO payroll_components (tenant_id, name, component_type, component_category, is_active, description)
      VALUES (tenant_record.id, 'CL', 'earning', 'calculation', true, 'Total CL (Casual Leave) days taken by the employee');
    END IF;
    
    -- SL (Sick Leave)
    SELECT EXISTS (
      SELECT 1 FROM payroll_components 
      WHERE tenant_id = tenant_record.id AND name = 'SL'
    ) INTO component_exists;
    IF NOT component_exists THEN
      INSERT INTO payroll_components (tenant_id, name, component_type, component_category, is_active, description)
      VALUES (tenant_record.id, 'SL', 'earning', 'calculation', true, 'Total SL (Sick Leave) days taken by the employee');
    END IF;
    
    -- Payable Days
    SELECT EXISTS (
      SELECT 1 FROM payroll_components 
      WHERE tenant_id = tenant_record.id AND name = 'Payable Days'
    ) INTO component_exists;
    IF NOT component_exists THEN
      INSERT INTO payroll_components (tenant_id, name, component_type, component_category, is_active, description)
      VALUES (tenant_record.id, 'Payable Days', 'earning', 'calculation', true, 'Total days eligible for salary payment after all attendance and leave adjustments');
    END IF;
    
    -- Payable Days Count
    SELECT EXISTS (
      SELECT 1 FROM payroll_components 
      WHERE tenant_id = tenant_record.id AND name = 'Payable Days Count'
    ) INTO component_exists;
    IF NOT component_exists THEN
      INSERT INTO payroll_components (tenant_id, name, component_type, component_category, is_active, description)
      VALUES (tenant_record.id, 'Payable Days Count', 'earning', 'calculation', true, 'Number of payable day occurrences used for salary calculation');
    END IF;
    
    -- Shift Days
    SELECT EXISTS (
      SELECT 1 FROM payroll_components 
      WHERE tenant_id = tenant_record.id AND name = 'Shift Days'
    ) INTO component_exists;
    IF NOT component_exists THEN
      INSERT INTO payroll_components (tenant_id, name, component_type, component_category, is_active, description)
      VALUES (tenant_record.id, 'Shift Days', 'earning', 'calculation', true, 'Total days the employee worked in assigned shifts');
    END IF;
    
    -- Shift Days Count
    SELECT EXISTS (
      SELECT 1 FROM payroll_components 
      WHERE tenant_id = tenant_record.id AND name = 'Shift Days Count'
    ) INTO component_exists;
    IF NOT component_exists THEN
      INSERT INTO payroll_components (tenant_id, name, component_type, component_category, is_active, description)
      VALUES (tenant_record.id, 'Shift Days Count', 'earning', 'calculation', true, 'Number of present occurrences in shifts');
    END IF;
    
    -- Individual Shift Components (SH1, SH2, SH3, GS)
    FOREACH shift_name IN ARRAY ARRAY['SH1', 'SH2', 'SH3', 'GS'] LOOP
      IF NOT EXISTS (
        SELECT 1 FROM payroll_components 
        WHERE tenant_id = tenant_record.id AND name = shift_name
      ) THEN
        INSERT INTO payroll_components (tenant_id, name, component_type, component_category, is_active, description)
        VALUES (tenant_record.id, shift_name, 'earning', 'calculation', true, 
                'Total Days employee Present in the shift');
      END IF;
    END LOOP;
    
    -- GatePass Hours
    SELECT EXISTS (
      SELECT 1 FROM payroll_components 
      WHERE tenant_id = tenant_record.id AND name = 'GatePass Hours'
    ) INTO component_exists;
    IF NOT component_exists THEN
      INSERT INTO payroll_components (tenant_id, name, component_type, component_category, is_active, description)
      VALUES (tenant_record.id, 'GatePass Hours', 'earning', 'calculation', true, 'Total Gatepass Hours');
    END IF;
    
    -- GatePass Count
    SELECT EXISTS (
      SELECT 1 FROM payroll_components 
      WHERE tenant_id = tenant_record.id AND name = 'GatePass Count'
    ) INTO component_exists;
    IF NOT component_exists THEN
      INSERT INTO payroll_components (tenant_id, name, component_type, component_category, is_active, description)
      VALUES (tenant_record.id, 'GatePass Count', 'earning', 'calculation', true, 'Reasonwise Gatepass Count');
    END IF;
    
    -- Advance
    SELECT EXISTS (
      SELECT 1 FROM payroll_components 
      WHERE tenant_id = tenant_record.id AND name = 'Advance'
    ) INTO component_exists;
    IF NOT component_exists THEN
      INSERT INTO payroll_components (tenant_id, name, component_type, component_category, is_active, description)
      VALUES (tenant_record.id, 'Advance', 'deduction', 'calculation', true, 'Salary advance amount to be deducted');
    END IF;
    
  END LOOP;
END;
$$;

-- Execute the function to ensure default components exist
SELECT ensure_default_payroll_components();