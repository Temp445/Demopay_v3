# PAY Days Feature - Developer Quick Reference

## Quick Start

### Database Setup (Required First)

```bash
# Apply migrations in order:
1. PAY_DAYS_MIGRATION.sql
2. PAY_DAYS_FUNCTION_UPDATE.sql
```

### Code Changes Summary

**File:** `src/components/dashboard/payroll/StructureAssignmentPage.tsx`

**Added State:**
```typescript
const [payDaysType, setPayDaysType] = useState<'calendar_days' | 'custom'>('calendar_days');
const [customPayDays, setCustomPayDays] = useState<number>(30);
const [savingPayDays, setSavingPayDays] = useState(false);
```

**Modified Functions:**
- `loadExistingCommonComponentValues()` - Now loads PAY Days settings
- `saveCommonComponentValues()` - Now saves PAY Days settings

**New UI Section:** Located before "Common Component Default Values"

## Data Model

### Database Schema

```sql
-- Table: employee_salary_structure_assignments
pay_days_type text DEFAULT 'calendar_days'
  CHECK (pay_days_type IN ('calendar_days', 'custom'))

custom_pay_days numeric(5, 2)
  CHECK (custom_pay_days > 0)
```

### Storage Pattern

- **Structure-level settings:** Stored where `employee_id IS NULL`
- **Tenant isolation:** Filtered by `tenant_id`
- **Per structure:** Unique per `salary_structure_id`

## API Reference

### Load PAY Days

```typescript
const { data: assignment, error } = await supabase
  .from('employee_salary_structure_assignments')
  .select('pay_days_type, custom_pay_days')
  .eq('tenant_id', auth.tenantId)
  .eq('salary_structure_id', selectedStructureId)
  .is('employee_id', null)
  .maybeSingle();
```

### Save PAY Days

```typescript
const { error } = await supabase.rpc('upsert_common_salary_structure_assignment', {
  p_tenant_id: auth.tenantId,
  p_salary_structure_id: selectedStructureId,
  p_component_values: commonComponentValues,
  p_pay_days_type: payDaysType,
  p_custom_pay_days: payDaysType === 'custom' ? customPayDays : null,
});
```

## Validation Logic

### Frontend Validation

```typescript
// Validate custom pay days when type is custom
if (payDaysType === 'custom') {
  if (!customPayDays || customPayDays <= 0) {
    toast.error('Please enter a valid number of custom pay days (must be greater than 0)');
    return;
  }
}
```

### Database Validation

```sql
-- Function validates automatically
IF p_pay_days_type = 'custom' AND (p_custom_pay_days IS NULL OR p_custom_pay_days <= 0) THEN
  RAISE EXCEPTION 'custom_pay_days must be a positive number when pay_days_type is custom';
END IF;
```

## UI Components

### PAY Days Type Dropdown

```tsx
<select
  value={payDaysType}
  onChange={(e) => setPayDaysType(e.target.value as 'calendar_days' | 'custom')}
  className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3..."
>
  <option value="calendar_days">Calendar Days</option>
  <option value="custom">Custom</option>
</select>
```

### Custom Days Input (Conditional)

```tsx
{payDaysType === 'custom' && (
  <input
    type="number"
    min="1"
    max="365"
    step="0.01"
    value={customPayDays}
    onChange={(e) => setCustomPayDays(parseFloat(e.target.value) || 0)}
    className="w-full border border-gray-300 rounded-md..."
  />
)}
```

## Integration with Payroll

### How to Use PAY Days in Calculations

```typescript
// Fetch PAY Days configuration for a structure
const { data } = await supabase
  .from('employee_salary_structure_assignments')
  .select('pay_days_type, custom_pay_days')
  .eq('salary_structure_id', structureId)
  .is('employee_id', null)
  .single();

// Calculate days for payroll period
let payDays: number;
if (data.pay_days_type === 'calendar_days') {
  // Use actual calendar days
  payDays = getDaysInMonth(year, month);
} else {
  // Use custom days
  payDays = data.custom_pay_days;
}

// Calculate per-day salary
const perDaySalary = monthlyComponentValue / payDays;

// Calculate adjusted salary based on attendance
const adjustedSalary = perDaySalary * daysWorked;
```

## Testing

### Manual Test Cases

1. **Default Behavior**
   - Select structure → Should show "Calendar Days" selected
   - Custom input should be hidden
   - Save → Should persist

2. **Custom Days**
   - Select "Custom" → Custom input should appear
   - Enter 26 → Save → Should persist
   - Reload page → Should show 26

3. **Validation**
   - Select "Custom", enter 0 → Save should fail with error
   - Select "Custom", enter -5 → Save should fail with error
   - Select "Custom", leave empty → Save should fail with error

4. **Multiple Structures**
   - Structure A: Set to Calendar Days
   - Structure B: Set to Custom 26
   - Each should maintain separate settings

### Unit Test Template

```typescript
describe('PAY Days Configuration', () => {
  it('should default to calendar_days', () => {
    // Test default state
  });

  it('should show custom input when custom selected', () => {
    // Test conditional rendering
  });

  it('should validate custom days value', () => {
    // Test validation logic
  });

  it('should persist settings to database', () => {
    // Test save functionality
  });

  it('should load settings from database', () => {
    // Test load functionality
  });
});
```

## Common Patterns

### Pattern 1: Load Settings on Structure Change

```typescript
useEffect(() => {
  if (selectedStructureId) {
    loadExistingCommonComponentValues(); // Loads PAY Days too
  }
}, [selectedStructureId]);
```

### Pattern 2: Conditional Custom Days

```typescript
// Always set custom_pay_days to null when type is calendar_days
p_custom_pay_days: payDaysType === 'custom' ? customPayDays : null
```

### Pattern 3: Type-Safe State Management

```typescript
// Use TypeScript union types
const [payDaysType, setPayDaysType] = useState<'calendar_days' | 'custom'>('calendar_days');

// Type assertion when setting from string
setPayDaysType(e.target.value as 'calendar_days' | 'custom')
```

## Debugging Tips

### Check Database Record

```sql
SELECT
  salary_structure_id,
  pay_days_type,
  custom_pay_days,
  individual_component_values
FROM employee_salary_structure_assignments
WHERE employee_id IS NULL
  AND tenant_id = 'your-tenant-id';
```

### Console Logging

```typescript
console.log('PAY Days Type:', payDaysType);
console.log('Custom Days:', customPayDays);
console.log('Saving with params:', {
  p_pay_days_type: payDaysType,
  p_custom_pay_days: payDaysType === 'custom' ? customPayDays : null
});
```

### Common Issues

1. **Custom input not showing**
   - Check: `payDaysType === 'custom'`
   - Verify state is updating correctly

2. **Validation not working**
   - Check: Validation runs before API call
   - Verify error messages display

3. **Settings not persisting**
   - Check: Database migrations applied
   - Verify function signature matches API call
   - Check browser network tab for API errors

## Best Practices

1. **Always validate on both frontend and backend**
2. **Set custom_pay_days to null when type is calendar_days**
3. **Use type-safe state management**
4. **Show clear error messages to users**
5. **Test with multiple structures**
6. **Document any new calculations that use PAY Days**

## Migration Checklist

When deploying to production:

- [ ] Backup database
- [ ] Apply PAY_DAYS_MIGRATION.sql
- [ ] Verify columns added successfully
- [ ] Apply PAY_DAYS_FUNCTION_UPDATE.sql
- [ ] Verify function created successfully
- [ ] Test on staging environment first
- [ ] Deploy frontend code
- [ ] Verify UI displays correctly
- [ ] Test save/load functionality
- [ ] Monitor for errors in production

## Performance Considerations

- **Index on pay_days_type:** Already created for queries filtering by type
- **Single record per structure:** Minimal storage overhead
- **Loaded with common components:** No additional query needed

## Security Considerations

- **RLS Policies:** Inherit from table (already secure)
- **Function Security:** SECURITY DEFINER with validation
- **Tenant Isolation:** Enforced at function level
- **Input Validation:** Check constraints on database

## Future Integration Points

When building features that use PAY Days:

1. **Payroll Processing:**
   ```typescript
   // Fetch PAY Days configuration
   const payDays = await getPayDaysForStructure(structureId);
   // Use in calculations
   ```

2. **Attendance Reports:**
   ```typescript
   // Show PAY Days basis in reports
   const basis = payDaysType === 'calendar_days' ? 'Calendar Days' : `${customPayDays} Days`;
   ```

3. **Salary Slips:**
   ```typescript
   // Display PAY Days information
   PAY Days: {payDaysType === 'calendar_days' ? `${actualDays} (Calendar)` : `${customPayDays} (Custom)`}
   ```

## References

- Main Documentation: `PAY_DAYS_FEATURE_IMPLEMENTATION.md`
- Database Migrations:
  - `PAY_DAYS_MIGRATION.sql`
  - `PAY_DAYS_FUNCTION_UPDATE.sql`
- Modified Code: `src/components/dashboard/payroll/StructureAssignmentPage.tsx`
