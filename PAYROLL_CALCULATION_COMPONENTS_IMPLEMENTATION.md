# Payroll Calculation Components Implementation

## Overview
This document details the implementation of payroll calculation components tracking system that maps various attendance and leave metrics to payroll component IDs for storage and retrieval.

## Task 1: Database Setup - Calculation Components

### Migration: `add_calculation_components_to_payroll_components_v2.sql`

Added 12 new calculation-type components to the `payroll_components` table:

| Component Name | Description | Maps To |
|----------------|-------------|---------|
| CalanderDays | Total calendar days in the payroll period | totalCalendarDays |
| WorkingDays | Total working days excluding weekends and holidays | totalWorkingDays |
| WeekOff | Total weekend/week off days in the period | totalWeekendDays |
| PaidHolidays | Total paid holidays in the period | totalHolidays |
| PresentDays | Total days employee was present | totalPresentDays |
| AbsentDays | Total days employee was absent | totalAbsentDays |
| LeaveDays | Total leave days (paid + unpaid) | totalLeaveDays |
| PaidLeaveDays | Total paid leave days | totalPaidLeaveDays |
| UnpaidLeaveDays | Total unpaid leave days | totalUnpaidLeaveDays |
| PayableDays | Total payable days after all calculations | totalPayableDays |
| PFApplicable | Indicates if PF is applicable for employee | pf_number IS NOT NULL |
| ESIApplicable | Indicates if ESI is applicable for employee | esi_number IS NOT NULL |

**SQL Implementation:**
```sql
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
```

## Task 2: Code Implementation - Component Mapping

### File: `src/lib/payrollCalculation.ts`

#### Updated Interface: `PayrollCalculationResult`
```typescript
export interface PayrollCalculationResult {
  totalCalendarDays: number;
  totalWorkingDays: number;
  totalWeekendDays: number;
  totalHolidays: number;
  totalPresentDays: number;
  totalAbsentDays: number;
  totalLeaveDays: number;
  totalPaidLeaveDays: number;
  totalUnpaidLeaveDays: number;
  totalPayableDays: number;
  payableDaysFactor: number;
  payableDaysBreakdown: PayableDay[];
  validationErrors: string[];
  validationWarnings: string[];
  calculationComponents?: Record<string, number>; // NEW: Maps component_id to calculated value
  pfApplicable?: boolean;  // NEW: PF applicability
  esiApplicable?: boolean; // NEW: ESI applicability
}
```

#### Enhanced Function: `validatePayrollPeriod`

**Added Data Fetching:**
```typescript
// Fetch calculation components
const { data: calculationComponents, error: componentsError } = await supabase
  .from('payroll_components')
  .select('id, name')
  .eq('component_category', 'calculation')
  .eq('is_active', true);

// Fetch employee statutory information
const { data: statutoryData, error: statutoryError } = await supabase
  .from('employee_statutory_ids')
  .select('pf_number, esi_number')
  .eq('employee_id', employeeId)
  .eq('tenant_id', tenantId)
  .maybeSingle();

// Determine PF and ESI applicability
const pfApplicable = statutoryData?.pf_number != null && statutoryData?.pf_number !== '';
const esiApplicable = statutoryData?.esi_number != null && statutoryData?.esi_number !== '';

result.pfApplicable = pfApplicable;
result.esiApplicable = esiApplicable;
```

**Added Component Mapping Logic:**
```typescript
// Build calculation_components mapping
const calculationComponentsMap: Record<string, number> = {};

if (calculationComponents) {
  calculationComponents.forEach((component: any) => {
    switch (component.name) {
      case 'CalanderDays':
        calculationComponentsMap[component.id] = result.totalCalendarDays;
        break;
      case 'WorkingDays':
        calculationComponentsMap[component.id] = result.totalWorkingDays;
        break;
      case 'WeekOff':
        calculationComponentsMap[component.id] = result.totalWeekendDays;
        break;
      case 'PaidHolidays':
        calculationComponentsMap[component.id] = result.totalHolidays;
        break;
      case 'PresentDays':
        calculationComponentsMap[component.id] = result.totalPresentDays;
        break;
      case 'AbsentDays':
        calculationComponentsMap[component.id] = result.totalAbsentDays;
        break;
      case 'LeaveDays':
        calculationComponentsMap[component.id] = result.totalLeaveDays;
        break;
      case 'PaidLeaveDays':
        calculationComponentsMap[component.id] = result.totalPaidLeaveDays;
        break;
      case 'UnpaidLeaveDays':
        calculationComponentsMap[component.id] = result.totalUnpaidLeaveDays;
        break;
      case 'PayableDays':
        calculationComponentsMap[component.id] = result.totalPayableDays;
        break;
      case 'PFApplicable':
        calculationComponentsMap[component.id] = pfApplicable ? 1 : 0;
        break;
      case 'ESIApplicable':
        calculationComponentsMap[component.id] = esiApplicable ? 1 : 0;
        break;
    }
  });
}

result.calculationComponents = calculationComponentsMap;
```

## Task 3: Data Persistence

### Migration: `add_calculation_components_field_to_payroll.sql`

Added `calculation_components` field to the `payroll` table:

```sql
ALTER TABLE payroll
ADD COLUMN calculation_components JSONB DEFAULT '{}'::jsonb;
```

**Field Specification:**
- **Type:** JSONB
- **Default:** Empty JSON object `{}`
- **Purpose:** Store calculation component values mapped to their component IDs
- **Format:** `{ "component_id_uuid": value, ... }`
- **Example:**
```json
{
  "a1b2c3d4-...": 30,  // CalanderDays
  "b2c3d4e5-...": 22,  // WorkingDays
  "c3d4e5f6-...": 8,   // WeekOff
  "d4e5f6g7-...": 2,   // PaidHolidays
  ...
}
```

### Updated TypeScript Interfaces

#### File: `src/lib/payroll.ts`

**PayrollEntry Interface:**
```typescript
export interface PayrollEntry {
  id: string;
  employee_id: string;
  employee_code?: string;
  period_start: string;
  period_end: string;
  base_salary: number;
  salary_components: SalaryComponent[];
  overtime_hours: number;
  overtime_rate: number;
  deductions: number;
  deduction_components: DeductionComponent[];
  bonus: number;
  total_amount: number;
  status: 'Draft' | 'Pending' | 'Approved' | 'Paid';
  payment_date: string | null;
  attendance_summary?: {
    total_working_days: number;
    total_present_days: number;
    total_absent_days: number;
    total_leave_days: number;
    total_paid_leave_days: number;
    payable_days_factor: number;
  };
  calculation_components?: Record<string, number>; // NEW FIELD
  created_at?: string;
  updated_at?: string;
  employee?: {
    name: string;
    email: string;
    department_id?: string;
    role_id?: string;
  };
}
```

**PayrollProcessEntry Interface:**
```typescript
export interface PayrollProcessEntry {
  id: string;
  employee_id: string;
  employee_code?: string;
  period_start: string;
  period_end: string;
  salary_components: SalaryComponent[];
  deduction_components: DeductionComponent[];
  total_amount: number;
  status: 'Draft' | 'Pending' | 'Approved' | 'Paid';
  payment_date: string | null;
  attendance_summary?: {
    total_working_days: number;
    total_present_days: number;
    total_absent_days: number;
    total_leave_days: number;
    total_paid_leave_days: number;
    payable_days_factor: number;
  };
  calculation_components?: Record<string, number>; // NEW FIELD
  created_at?: string;
  updated_at?: string;
  employee?: {
    name: string;
    email: string;
    department_id?: string;
    role_id?: string;
  };
}
```

### Updated Store Methods

#### File: `src/stores/payrollStore.ts`

**Enhanced `createPayrollEntry` method:**
```typescript
createPayrollEntry: async (entry) => {
  // ... existing code ...

  const attendanceData = entry.attendance_summary
    ? { attendance_summary: entry.attendance_summary }
    : {};

  // NEW: Extract calculation_components if present
  const calculationComponents = (entry as any).calculation_components
    ? { calculation_components: (entry as any).calculation_components }
    : {};

  const { data, error } = await supabase
    .from('payroll')
    .insert([
      {
        ...entry,
        salary_components: salaryComponents,
        deduction_components: deductionComponents,
        base_salary: salaryComponents.reduce((sum, comp) => sum + comp.amount, 0),
        deductions: deductionComponents.reduce((sum, comp) => sum + comp.amount, 0),
        ...attendanceData,
        ...calculationComponents, // NEW: Include calculation components
        tenant_id: auth.tenantId,
      },
    ])
    .select()
    .single();

  // ... existing code ...
},
```

## Usage Example

### In Payroll Processing:

```typescript
import { validatePayrollPeriod } from './lib/payrollCalculation';

// Calculate payroll period metrics
const result = await validatePayrollPeriod({
  startDate: '2024-01-01',
  endDate: '2024-01-31',
  employeeId: 'employee-uuid-here'
});

// Access calculation components
console.log(result.calculationComponents);
// Output: { "uuid-1": 31, "uuid-2": 22, "uuid-3": 8, ... }

// Create payroll entry with calculation components
await createPayrollEntry({
  employee_id: 'employee-uuid-here',
  period_start: '2024-01-01',
  period_end: '2024-01-31',
  salary_components: [...],
  deduction_components: [...],
  calculation_components: result.calculationComponents, // Include calculated values
  // ... other fields
});
```

## Benefits

1. **Structured Data Storage:** Component values are stored with their IDs, making queries and reporting easier
2. **Flexibility:** New calculation components can be added without code changes
3. **Audit Trail:** Historical calculation data is preserved in the payroll records
4. **Statutory Compliance:** PF and ESI applicability is automatically tracked
5. **Reporting:** Easy to generate reports based on specific calculation components

## Database Schema Changes Summary

### Tables Modified:
1. **payroll_components** - Added 12 new calculation-type components
2. **payroll** - Added `calculation_components` JSONB field

### Data Flow:
1. `validatePayrollPeriod()` calculates attendance metrics
2. Fetches calculation component IDs from `payroll_components` table
3. Fetches statutory info from `employee_statutory_ids` table
4. Maps calculated values to component IDs
5. Returns `calculationComponents` object
6. Saved to `payroll.calculation_components` field during payroll creation

## Testing Recommendations

1. Verify all 12 calculation components are inserted correctly
2. Test `validatePayrollPeriod` with various scenarios (full month, partial month, leaves, absences)
3. Verify PF and ESI applicability logic
4. Test payroll entry creation with calculation_components
5. Query payroll records to verify calculation_components are stored correctly
6. Test with employees who have/don't have PF/ESI numbers

## Migration Files Created

1. `add_calculation_components_to_payroll_components_v2.sql` - Inserts 12 calculation components
2. `add_calculation_components_field_to_payroll.sql` - Adds calculation_components field to payroll table
