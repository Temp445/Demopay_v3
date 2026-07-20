# PAY Days Feature Implementation Guide

## Overview

The PAY Days feature has been successfully added to the Salary Structure Assignment page. This feature allows HR administrators to configure how many days should be used for salary calculations within each salary structure.

## What Was Added

### 1. Database Schema Changes

**New Columns in `employee_salary_structure_assignments` table:**

- **`pay_days_type`** (text)
  - Values: `'calendar_days'` or `'custom'`
  - Default: `'calendar_days'`
  - Purpose: Determines which calculation method to use

- **`custom_pay_days`** (numeric(5,2))
  - Nullable field (only used when `pay_days_type = 'custom'`)
  - Must be greater than 0 when specified
  - Purpose: Stores the custom number of days to use for calculations

**Storage Location:**
- These settings are stored in the structure-level record (where `employee_id IS NULL`)
- This means all employees in the structure share the same PAY Days configuration

### 2. UI Changes in StructureAssignmentPage.tsx

**New Section: "PAY Days Configuration"**
- Located BEFORE the "Common Component Default Values" section
- Appears when a salary structure is selected
- Contains:
  1. **PAY Days Type Dropdown** - Choose between "Calendar Days" or "Custom"
  2. **Custom Days Input** - Appears only when "Custom" is selected
  3. **Information Box** - Explains how PAY Days affect calculations

**Layout:**
```
┌─────────────────────────────────────────────────────────┐
│  PAY Days Configuration                                 │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  PAY Days Type *        Custom Days * (if Custom)      │
│  ┌─────────────────┐   ┌──────────────────────┐       │
│  │ Calendar Days ▼ │   │ 26                   │       │
│  └─────────────────┘   └──────────────────────────┘       │
│                                                         │
│  ℹ How PAY Days Affect Calculations                    │
│  • Calendar Days: Uses actual days in month (28-31)    │
│  • Custom Days: Uses your fixed number of days         │
│  • Affects per-day salary for attendance components    │
└─────────────────────────────────────────────────────────┘
```

### 3. State Management

**New State Variables:**
```typescript
const [payDaysType, setPayDaysType] = useState<'calendar_days' | 'custom'>('calendar_days');
const [customPayDays, setCustomPayDays] = useState<number>(30);
const [savingPayDays, setSavingPayDays] = useState(false);
```

### 4. Data Flow

**Loading PAY Days Configuration:**
- When a salary structure is selected, `loadExistingCommonComponentValues()` fetches the PAY Days settings
- If no configuration exists, defaults are set:
  - `pay_days_type`: `'calendar_days'`
  - `custom_pay_days`: `30`

**Saving PAY Days Configuration:**
- Saved together with Common Component Values via `saveCommonComponentValues()`
- Validates custom pay days value when type is 'custom'
- Calls `upsert_common_salary_structure_assignment` RPC function with PAY Days parameters

### 5. Database Function Updates

**Updated Function: `upsert_common_salary_structure_assignment`**

New signature:
```sql
CREATE OR REPLACE FUNCTION upsert_common_salary_structure_assignment(
  p_tenant_id uuid,
  p_salary_structure_id uuid,
  p_component_values jsonb,
  p_pay_days_type text DEFAULT 'calendar_days',
  p_custom_pay_days numeric DEFAULT NULL
)
```

Features:
- Validates `pay_days_type` is either 'calendar_days' or 'custom'
- Validates `custom_pay_days` is positive when type is 'custom'
- Sets `custom_pay_days` to NULL when type is 'calendar_days'
- Upserts structure-level record (employee_id IS NULL)

## Installation Instructions

### Step 1: Apply Database Migrations

You need to apply two SQL scripts in order:

#### 1.1. Apply Schema Changes
```sql
-- File: PAY_DAYS_MIGRATION.sql
-- This adds the new columns to the table
```

**How to apply:**
1. Open your Supabase Dashboard
2. Navigate to SQL Editor
3. Copy the contents of `PAY_DAYS_MIGRATION.sql`
4. Paste and execute

#### 1.2. Update Database Function
```sql
-- File: PAY_DAYS_FUNCTION_UPDATE.sql
-- This updates the upsert function to handle PAY Days
```

**How to apply:**
1. In Supabase SQL Editor
2. Copy the contents of `PAY_DAYS_FUNCTION_UPDATE.sql`
3. Paste and execute

### Step 2: Verify Installation

The frontend code is already updated. After applying the database migrations:

1. Navigate to the Salary Structure Assignments page
2. Select a salary structure
3. You should see the new "PAY Days Configuration" section
4. Test both options:
   - Select "Calendar Days" - Custom Days input should hide
   - Select "Custom" - Custom Days input should appear
5. Enter a custom value and save
6. Refresh the page - Your settings should persist

## Usage Guide

### For HR Administrators

**Setting up Calendar Days (Default):**
1. Go to Salary Structure Assignments
2. Select a salary structure
3. In "PAY Days Configuration" section:
   - Select "Calendar Days" from dropdown
4. Click "Save Configuration"

**Setting up Custom Days:**
1. Go to Salary Structure Assignments
2. Select a salary structure
3. In "PAY Days Configuration" section:
   - Select "Custom" from dropdown
   - Enter number of days (e.g., 26, 30)
   - Must be greater than 0
   - Can include decimals (e.g., 26.5)
4. Click "Save Configuration"

### How It Affects Payroll Calculations

**Calendar Days Mode:**
- Payroll system uses the actual number of days in the calendar month
- January: 31 days
- February: 28 or 29 days
- April: 30 days
- etc.

**Custom Mode:**
- Payroll system uses your specified fixed number of days
- Same value used every month regardless of actual calendar days
- Common values:
  - 26 days (typical working days per month)
  - 30 days (standardized month)
  - 22 days (working days excluding weekends)

**Impact on Calculations:**
When calculating per-day salary for attendance-based components:
- Per Day Salary = Monthly Component Value / PAY Days
- Example with BASIC = ₹30,000:
  - Calendar Days (January): ₹30,000 / 31 = ₹967.74 per day
  - Custom 26 Days: ₹30,000 / 26 = ₹1,153.85 per day

## Validation Rules

### UI Validations:
1. **Custom Days must be greater than 0**
   - Error shown if value is 0 or negative
   - Prevents saving until corrected

2. **Custom Days required when type is Custom**
   - Error shown if Custom selected but no value entered
   - Prevents saving until value provided

### Database Validations:
1. **Check constraint on pay_days_type**
   - Only allows 'calendar_days' or 'custom'
   - Database rejects invalid values

2. **Check constraint on custom_pay_days**
   - Must be greater than 0
   - Database rejects 0 or negative values

## Technical Details

### Component Structure

```typescript
// State
const [payDaysType, setPayDaysType] = useState<'calendar_days' | 'custom'>('calendar_days');
const [customPayDays, setCustomPayDays] = useState<number>(30);

// Load function
const loadExistingCommonComponentValues = async () => {
  // Fetches pay_days_type and custom_pay_days from DB
  // Sets state with loaded values or defaults
};

// Save function
const saveCommonComponentValues = async () => {
  // Validates custom pay days if type is custom
  // Calls upsert_common_salary_structure_assignment with PAY Days params
  // Shows success/error toast
};
```

### Database Schema

```sql
-- Table: employee_salary_structure_assignments
pay_days_type text DEFAULT 'calendar_days'
  CHECK (pay_days_type IN ('calendar_days', 'custom'))

custom_pay_days numeric(5, 2)
  CHECK (custom_pay_days > 0)
```

### API Call

```typescript
const { error } = await supabase.rpc('upsert_common_salary_structure_assignment', {
  p_tenant_id: auth.tenantId,
  p_salary_structure_id: selectedStructureId,
  p_component_values: commonComponentValues,
  p_pay_days_type: payDaysType,
  p_custom_pay_days: payDaysType === 'custom' ? customPayDays : null,
});
```

## Files Modified

### Frontend:
1. **`src/components/dashboard/payroll/StructureAssignmentPage.tsx`**
   - Added PAY Days state variables
   - Added PAY Days UI section
   - Updated load function to fetch PAY Days settings
   - Updated save function to persist PAY Days settings
   - Added validation for custom pay days

### Database:
1. **`PAY_DAYS_MIGRATION.sql`** (New file)
   - Adds `pay_days_type` column
   - Adds `custom_pay_days` column
   - Adds check constraints
   - Adds index
   - Updates existing records

2. **`PAY_DAYS_FUNCTION_UPDATE.sql`** (New file)
   - Drops old function
   - Creates new function with PAY Days parameters
   - Adds validation logic
   - Handles NULL values correctly

## Testing Checklist

- [x] Build successful - No TypeScript errors
- [ ] Database migrations applied successfully
- [ ] UI displays PAY Days section when structure selected
- [ ] Calendar Days option works correctly
- [ ] Custom option shows/hides input field
- [ ] Validation prevents saving invalid custom days
- [ ] Data persists after page refresh
- [ ] Multiple structures can have different PAY Days settings
- [ ] Existing structures without PAY Days get defaults

## Backward Compatibility

✅ **Fully Backward Compatible**

- Existing records without PAY Days settings get default values
- Default is 'calendar_days' which maintains existing behavior
- No impact on existing payroll calculations until user changes settings
- Old code that doesn't use PAY Days continues to work

## Future Enhancements

Potential improvements for future versions:

1. **Per-Employee PAY Days Override**
   - Allow specific employees to have different PAY Days settings
   - Store in employee-level record (where employee_id IS NOT NULL)

2. **Historical PAY Days Tracking**
   - Track changes to PAY Days settings over time
   - Useful for audit trails and historical payroll recalculations

3. **PAY Days Templates**
   - Predefined templates (e.g., "26 Working Days", "30 Days", etc.)
   - Quick selection for common scenarios

4. **Validation Against Attendance Data**
   - Warn if custom days is less than typical working days
   - Suggest appropriate values based on company attendance patterns

5. **Reporting**
   - Show PAY Days configuration in payroll reports
   - Include in salary structure documentation

## Troubleshooting

### Issue: Custom Days input not showing
**Solution:** Make sure "Custom" is selected in the dropdown

### Issue: Save button doesn't work
**Solution:** Check console for validation errors. Ensure:
- Custom days is greater than 0 when Custom is selected
- All common component values are filled (if any exist)

### Issue: Settings not persisting
**Solution:**
1. Check database migrations are applied
2. Verify `upsert_common_salary_structure_assignment` function exists
3. Check browser console for API errors

### Issue: Database error when saving
**Solution:**
1. Ensure PAY_DAYS_MIGRATION.sql was applied first
2. Then ensure PAY_DAYS_FUNCTION_UPDATE.sql was applied
3. Check Supabase logs for specific error details

## Support

For issues or questions:
1. Check this documentation first
2. Review the code comments in StructureAssignmentPage.tsx
3. Verify database migrations are applied correctly
4. Check browser console and Supabase logs for errors

## Summary

The PAY Days feature provides flexible salary calculation options:
- **Simple**: Choose Calendar Days for automatic month-to-month adjustment
- **Predictable**: Choose Custom Days for consistent calculations
- **Configurable**: Set per salary structure for different employee groups
- **Validated**: Built-in checks prevent invalid configurations
- **Persisted**: Settings saved to database and loaded automatically

This feature enhances payroll accuracy and flexibility while maintaining ease of use.
