# Statutory Deduction Checkbox Implementation Guide

## Overview
This guide provides the exact code changes needed to add checkbox functionality for statutory deduction components in the AddPayStructureModal.tsx file.

## Database Changes Required

### Step 1: Add Column to Database

Create a migration to add the `is_applied_in_calculation` column to the `salary_structure_components` table:

```sql
-- Migration: add_is_applied_in_calculation_to_salary_structure_components.sql

/*
  # Add is_applied_in_calculation column to salary_structure_components

  1. Changes
    - Add `is_applied_in_calculation` column to `salary_structure_components` table
      - Type: boolean
      - Default: true (components are applied by default)
      - Purpose: Track whether a statutory deduction is applied in payroll calculations

  2. Notes
    - When true: Component is applied in payroll calculation
    - When false: Component appears in report but is NOT applied in calculation
    - Primarily used for statutory deductions
*/

-- Add is_applied_in_calculation column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'salary_structure_components'
    AND column_name = 'is_applied_in_calculation'
    AND table_schema = 'public'
  ) THEN
    ALTER TABLE salary_structure_components
    ADD COLUMN is_applied_in_calculation boolean DEFAULT true NOT NULL;
  END IF;
END $$;

-- Add comment for documentation
COMMENT ON COLUMN salary_structure_components.is_applied_in_calculation IS
'Indicates whether this component should be applied in payroll calculations. When false, component appears in reports but is not calculated. Primarily used for statutory deductions.';
```

## TypeScript Interface Changes

### Step 2: Update SalaryStructureComponent Interface

Add the new field to the `SalaryStructureComponent` type/interface (this should be in the store or type definition file):

```typescript
export interface SalaryStructureComponent {
  key: string;
  id: string;
  name: string;
  component_type: 'earning' | 'deduction';
  isCustom?: boolean;
  isStatutory?: boolean;
  calculation_type: 'value' | 'percentage';
  editability: 'fixed' | 'editable' | 'enter_later';
  amount?: number;
  percentage_value?: number;
  reference_components?: string[];
  is_taxable?: boolean;
  description?: string;
  display_order: number;
  is_attendance_linked?: boolean;
  always_treat_as_full_day?: boolean;
  is_locked?: boolean;
  is_applied_in_calculation?: boolean; // NEW FIELD
}
```

## Component Changes

### Step 3: Update getStatutoryDeductions Function

In the `getStatutoryDeductions` function, add the new field to all component creations:

```typescript
// Around line 147 in AddPayStructureModal.tsx
components.push({
  key: `SD${components.length + 1}`,
  id: payrollComponent.id,
  name: componentName,
  component_type: 'deduction',
  isCustom: false,
  isStatutory: true,
  calculation_type:
    config.calculation_method === 'percentage'
      ? 'percentage'
      : 'value',
  editability: editability,
  amount: amount,
  percentage_value: percentage_value,
  reference_components: [],
  is_taxable: false,
  description: `Statutory ${componentName}`,
  display_order: components.length,
  is_applied_in_calculation: true, // NEW: Default to true
});
```

### Step 4: Update addComponent Function

Add the field to new components (around line 386):

```typescript
let newComponent = {
  key: newKey,
  id: '',
  name: '',
  component_type: type,
  isCustom: false,
  calculation_type: 'value' as 'value' | 'percentage',
  editability: 'fixed' as 'fixed' | 'editable' | 'enter_later',
  is_taxable: type === 'earning',
  reference_components: [],
  display_order: prev.earnings.length + prev.deductions.length,
  is_attendance_linked: true,
  always_treat_as_full_day: false,
  is_locked: false,
  is_applied_in_calculation: true, // NEW: Default to true
};
```

### Step 5: Add Checkbox UI for Statutory Deductions

In the deductions rendering section (around line 1046-1448), add a checkbox for statutory components:

```typescript
{formData.deductions.map((component, index) => (
  <div
    key={component.key}
    className={`mb-4 p-4 border rounded-lg ${
      component.isStatutory
        ? 'bg-indigo-50 border-indigo-200'
        : 'bg-gray-50'
    }`}
  >
    {component.isStatutory && (
      <div className="mb-3">
        <div className="flex items-center mb-2 text-indigo-700 text-sm font-medium">
          <Lock className="h-4 w-4 mr-1" />
          Statutory Deduction (Locked)
        </div>

        {/* NEW: Add Checkbox for statutory components */}
        <label className="flex items-center cursor-pointer">
          <input
            type="checkbox"
            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
            checked={component.is_applied_in_calculation !== false}
            onChange={(e) =>
              updateComponent('deduction', index, {
                is_applied_in_calculation: e.target.checked,
              })
            }
          />
          <span className="ml-2 text-sm text-gray-700">
            Apply in payroll calculation
          </span>
        </label>

        {component.is_applied_in_calculation === false && (
          <p className="mt-1 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1">
            ⓘ This component will appear in payroll reports but will NOT be applied in calculations
          </p>
        )}
      </div>
    )}

    <div className="grid grid-cols-1 gap-4">
      {/* Rest of the component rendering */}
      ...
    </div>
  </div>
))}
```

### Step 6: Update Database Load/Save Operations

Ensure the field is properly loaded when fetching structure details (around line 286):

```typescript
const updatedDeductions = fetchedStructureDetails[0].components
  .filter((c) => c.component_type === 'deduction')
  .map((comp) => {
    const isStatutory = comp.id
      ? statutoryComponentIds.has(comp.id)
      : false;

    return {
      ...comp,
      key: isStatutory
        ? `SD${++maxKeyNumber}`
        : `D${++maxKeyNumber}`,
      isStatutory: isStatutory,
      calculation_type:
        comp.calculation_type ||
        (comp.calculation_method === 'percentage'
          ? 'percentage'
          : 'value'),
      editability: comp.editability || 'fixed',
      is_applied_in_calculation: comp.is_applied_in_calculation ?? true, // NEW: Load with default
    };
  });
```

## Testing Checklist

After implementation, verify:

1. ✅ Checkbox appears only for statutory deductions
2. ✅ Checkbox state persists when modal is closed and reopened
3. ✅ Checkbox state is saved to database
4. ✅ When unchecked, warning message appears
5. ✅ Unchecked components still appear in payroll reports
6. ✅ Unchecked components are NOT applied in calculations
7. ✅ Default state is checked (applied)
8. ✅ Checkbox works for both PF Employee and PF Employer
9. ✅ Checkbox works for both ESI Employee and ESI Employer
10. ✅ Checkbox works for Professional Tax and TDS

## Payroll Calculation Integration

In the payroll calculation logic, add a check for `is_applied_in_calculation`:

```typescript
// In payroll calculation function
const calculateDeductions = (components: SalaryStructureComponent[]) => {
  return components
    .filter(c => c.component_type === 'deduction')
    .filter(c => c.is_applied_in_calculation !== false) // NEW: Only include if applied
    .reduce((total, component) => {
      return total + calculateComponentAmount(component);
    }, 0);
};
```

## Payroll Report Display

In the payroll report, show all components regardless of `is_applied_in_calculation`:

```typescript
// In payroll report generation
const displayDeductions = (components: SalaryStructureComponent[]) => {
  return components
    .filter(c => c.component_type === 'deduction')
    // No filter on is_applied_in_calculation - show all
    .map(component => ({
      name: component.name,
      amount: component.is_applied_in_calculation !== false
        ? calculateComponentAmount(component)
        : 0, // Show 0 or greyed out
      isApplied: component.is_applied_in_calculation !== false
    }));
};
```

## UI/UX Considerations

1. **Visual Feedback**: Use amber/yellow for warning when unchecked
2. **Clear Labeling**: "Apply in payroll calculation" is clear and concise
3. **Help Text**: Warning message explains the behavior
4. **Positioning**: Checkbox appears at the top of statutory component card
5. **Accessibility**: Proper label association with checkbox

## Default Behavior

- **New Components**: Default to `is_applied_in_calculation: true`
- **Existing Components**: If field is missing in database, treat as `true`
- **UI Display**: Checkbox checked by default

## Migration Strategy

For existing salary structures in the database:

1. Run migration to add column with DEFAULT true
2. All existing components will automatically have `is_applied_in_calculation = true`
3. No data migration needed
4. Backward compatible

## Code Style Notes

- Follow existing naming conventions (`is_applied_in_calculation` matches `is_locked`, `is_taxable`)
- Use TypeScript optional chaining: `component.is_applied_in_calculation !== false`
- Consistent with existing checkbox styling (see `is_locked` checkbox around line 836)
- Use inline comments sparingly, only for clarification

## Summary

This implementation adds checkbox functionality that:
- ✅ Allows users to toggle whether statutory deductions are applied
- ✅ Persists the state to database
- ✅ Maintains backward compatibility
- ✅ Provides clear visual feedback
- ✅ Integrates with existing payroll calculation logic
- ✅ Shows all components in reports regardless of checkbox state
