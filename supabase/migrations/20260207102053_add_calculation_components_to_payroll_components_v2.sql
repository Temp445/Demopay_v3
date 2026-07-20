/*
  # Add Calculation Components to Payroll Components Table

  1. New Records
    - Insert 12 calculation-type components into payroll_components table
    - These components track various payroll calculation metrics:
      - CalanderDays: Total calendar days in the period
      - WorkingDays: Total working days (excluding weekends/holidays)
      - WeekOff: Total weekend days
      - PaidHolidays: Total paid holidays
      - PresentDays: Days employee was present
      - AbsentDays: Days employee was absent
      - LeaveDays: Total leave days
      - PaidLeaveDays: Paid leave days
      - UnpaidLeaveDays: Unpaid leave days
      - PayableDays: Total payable days after calculations
      - PFApplicable: Boolean indicating if PF is applicable
      - ESIApplicable: Boolean indicating if ESI is applicable

  2. Notes
    - All components are of type 'earning' (not 'earnings')
    - All components are of category 'calculation'
    - These are system-level components for calculation tracking
*/

-- Insert calculation components
INSERT INTO payroll_components (
  name,
  description,
  component_type,
  component_category,
  is_active,
  type_selection
) VALUES 
  ('CalanderDays', 'Total calendar days in the payroll period', 'earning', 'calculation', true, 'individual'),
  ('WorkingDays', 'Total working days excluding weekends and holidays', 'earning', 'calculation', true, 'individual'),
  ('WeekOff', 'Total weekend/week off days in the period', 'earning', 'calculation', true, 'individual'),
  ('PaidHolidays', 'Total paid holidays in the period', 'earning', 'calculation', true, 'individual'),
  ('PresentDays', 'Total days employee was present', 'earning', 'calculation', true, 'individual'),
  ('AbsentDays', 'Total days employee was absent', 'earning', 'calculation', true, 'individual'),
  ('LeaveDays', 'Total leave days (paid + unpaid)', 'earning', 'calculation', true, 'individual'),
  ('PaidLeaveDays', 'Total paid leave days', 'earning', 'calculation', true, 'individual'),
  ('UnpaidLeaveDays', 'Total unpaid leave days', 'earning', 'calculation', true, 'individual'),
  ('PayableDays', 'Total payable days after all calculations', 'earning', 'calculation', true, 'individual'),
  ('PFApplicable', 'Indicates if PF is applicable for employee', 'earning', 'calculation', true, 'individual'),
  ('ESIApplicable', 'Indicates if ESI is applicable for employee', 'earning', 'calculation', true, 'individual')
ON CONFLICT DO NOTHING;