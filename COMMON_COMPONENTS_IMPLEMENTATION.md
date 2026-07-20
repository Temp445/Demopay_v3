# Common Components (Master Entry) Implementation

## Overview
This document describes the implementation of Common Components with `master_entry` value_set in the `StructureAssignmentPage.tsx` file. These components represent structure-level default values that apply to all employees assigned to a particular salary structure.

## Objective
Enable users to define default values for common components directly at the salary structure level, which are then inherited by all employees assigned to that structure. These values are stored separately from individual employee assignments.

## Implementation Details

### 1. New State Variables

```typescript
// Common Components with master_entry value_set (structure-level defaults)
const [commonMasterEntryComponents, setCommonMasterEntryComponents] = useState<any[]>([]);
const [commonComponentValues, setCommonComponentValues] = useState<Record<string, number>>({});
const [savingCommonComponents, setSavingCommonComponents] = useState(false);
```

- **`commonMasterEntryComponents`**: Stores the list of components that are:
  - `type_selection = 'common'`
  - `value_set = 'master_entry'`
- **`commonComponentValues`**: Stores the entered values keyed by component ID
- **`savingCommonComponents`**: Loading state for save operation

### 2. New Functions

#### A. `loadCommonMasterEntryComponents()`
**Purpose**: Fetch common components from the database

**Logic**:
```typescript
const { data: components } = await supabase
  .from('payroll_components')
  .select('id, name, component_type, amount_type, description')
  .eq('tenant_id', auth.tenantId)
  .eq('type_selection', 'common')        // Filter: common components
  .eq('value_set', 'master_entry')       // Filter: master_entry value_set
  .eq('is_active', true)
  .order('name', { ascending: true });
```

**Key Points**:
- Fetches from `payroll_components` table
- Applies exact filters as specified: `type_selection = 'common'` AND `value_set = 'master_entry'`
- Orders results alphabetically by name
- Only fetches active components

#### B. `loadExistingCommonComponentValues()`
**Purpose**: Load previously saved common component values for the structure

**Logic**:
```typescript
const { data: assignment } = await supabase
  .from('employee_salary_structure_assignments')
  .select('individual_component_values')
  .eq('tenant_id', auth.tenantId)
  .eq('salary_structure_id', selectedStructureId)
  .is('employee_id', null)  // Critical: NULL for structure-level values
  .maybeSingle();
```

**Key Points**:
- Queries `employee_salary_structure_assignments` table
- **Critical**: Filters for `employee_id IS NULL` to get structure-level values
- Uses `maybeSingle()` to handle cases where no record exists yet

#### C. `saveCommonComponentValues()`
**Purpose**: Save common component values to the database

**Logic**:
```typescript
await supabase
  .from('employee_salary_structure_assignments')
  .upsert({
    salary_structure_id: selectedStructureId,
    employee_id: null,  // Critical: NULL for structure-level values
    individual_component_values: commonComponentValues,
    tenant_id: auth.tenantId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, {
    onConflict: 'salary_structure_id,tenant_id,employee_id',
  });
```

**Key Points**:
- Uses `upsert` to create or update the record
- **Critical**: Sets `employee_id = NULL` to distinguish from individual employee assignments
- Stores all component values in the `individual_component_values` JSONB field
- Uses component IDs as keys (consistent with the ID migration implementation)

#### D. `handleCommonComponentValueChange()`
**Purpose**: Update state when user changes a component value

**Logic**:
```typescript
const handleCommonComponentValueChange = (componentId: string, value: string) => {
  const numericValue = parseFloat(value) || 0;
  setCommonComponentValues(prev => ({
    ...prev,
    [componentId]: numericValue,
  }));
};
```

### 3. Updated useEffect Hook

The main `useEffect` now triggers three operations when a structure is selected:
```typescript
useEffect(() => {
  if (selectedStructureId) {
    loadStructureDetails();
    fetchAssignmentsByStructure(selectedStructureId);
    loadCommonMasterEntryComponents();      // NEW: Load common components
    loadExistingCommonComponentValues();    // NEW: Load saved values
    setStagedEmployees([]);
  } else {
    // Clear all states including new common component states
    setCommonMasterEntryComponents([]);
    setCommonComponentValues({});
  }
}, [selectedStructureId]);
```

### 4. New UI Section

The UI section is rendered between the Structure Selector and the Pending Assignments sections:

```tsx
{selectedStructureId && commonMasterEntryComponents.length > 0 && (
  <div className="bg-white shadow-md rounded-lg p-6">
    {/* Header with Save button */}
    <div className="flex items-center justify-between mb-4">
      <div>
        <h2>Common Component Default Values</h2>
        <p>Set default values for common components...</p>
      </div>
      <button onClick={saveCommonComponentValues}>
        Save Common Values
      </button>
    </div>

    {/* Grid of component input fields */}
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {commonMasterEntryComponents.map((component) => (
        <div key={component.id}>
          {/* Component name and type indicator */}
          {/* Input field (value or percentage based on amount_type) */}
          {/* Earning/Deduction badge */}
        </div>
      ))}
    </div>
  </div>
)}
```

**UI Features**:
- **Responsive Grid**: 1 column on mobile, 2 on tablet, 3 on desktop
- **Dynamic Input Type**: Shows currency (₹) input for `amount_type='value'` and percentage (%) input for `amount_type='percentage'`
- **Visual Indicators**:
  - Currency/Percentage icons
  - Earning (green) / Deduction (red) badges
  - Component descriptions when available
- **Save Button**: Positioned in the header with loading state
- **Validation**: Checks that all components have values before saving

## Data Structure

### Database Table: `employee_salary_structure_assignments`

**Record for Common Components** (structure-level):
```json
{
  "id": "uuid-1",
  "salary_structure_id": "structure-uuid",
  "employee_id": null,  // NULL indicates structure-level values
  "individual_component_values": {
    "component-id-1": 5000,
    "component-id-2": 2000,
    "component-id-3": 10.5
  },
  "tenant_id": "tenant-uuid",
  "created_at": "2024-02-03T10:00:00Z",
  "updated_at": "2024-02-03T10:00:00Z"
}
```

**Record for Individual Employee**:
```json
{
  "id": "uuid-2",
  "salary_structure_id": "structure-uuid",
  "employee_id": "employee-uuid",  // Specific employee
  "individual_component_values": {
    "individual-component-id-1": 3000,
    "individual-component-id-2": 1500
  },
  "tenant_id": "tenant-uuid",
  "created_at": "2024-02-03T11:00:00Z",
  "updated_at": "2024-02-03T11:00:00Z"
}
```

## Component Flow

### 1. User Selects Structure
```
User selects structure
    ↓
loadCommonMasterEntryComponents()
    ↓
Fetch components: type_selection='common' AND value_set='master_entry'
    ↓
loadExistingCommonComponentValues()
    ↓
Fetch saved values: employee_id IS NULL
    ↓
Display component input fields
```

### 2. User Enters Values
```
User enters value
    ↓
handleCommonComponentValueChange()
    ↓
Update commonComponentValues state
    ↓
UI reflects new value
```

### 3. User Saves Values
```
User clicks "Save Common Values"
    ↓
saveCommonComponentValues()
    ↓
Validate all components have values
    ↓
Upsert to database with employee_id = NULL
    ↓
Show success toast
```

## Key Differences: Common vs Individual Components

| Aspect | Common Components | Individual Components |
|--------|------------------|---------------------|
| **Type Selection** | `type_selection = 'common'` | `type_selection = 'individual'` |
| **Value Set** | `value_set = 'master_entry'` | `value_set = 'master_entry'` |
| **Employee ID** | `NULL` (structure-level) | Specific employee ID |
| **When Entered** | Once per structure | Per employee assignment |
| **Where Displayed** | Common Components section | Staging table per employee |
| **Scope** | All employees in structure | Specific employee only |

## Benefits

1. **Efficiency**: Define common values once instead of per employee
2. **Consistency**: Ensures uniform values across all employees
3. **Flexibility**: Can be overridden at individual level if needed
4. **Maintainability**: Easy to update values for entire structure
5. **Data Integrity**: Clear separation between structure-level and employee-level values

## Usage in Payroll Processing

When processing payroll, the `PayrollProcessPage` will:

1. Check `value_set` of each component
2. For components with `value_set = 'master_entry'`:
   - If `type_selection = 'individual'`: Fetch from assignment with specific `employee_id`
   - If `type_selection = 'common'`: Fetch from assignment with `employee_id = NULL`
3. Apply the fetched values during payroll calculation

## Error Handling

The implementation includes comprehensive error handling:

1. **Authentication Validation**: Checks user authentication before all database operations
2. **Null Checks**: Handles cases where no components or values exist
3. **Validation**: Ensures all components have values before saving
4. **Toast Notifications**: Provides user feedback for all operations
5. **Try-Catch Blocks**: Captures and logs errors for debugging

## Testing Checklist

- [ ] Select a salary structure
- [ ] Verify common components are displayed (if any exist)
- [ ] Enter values for all common components
- [ ] Click "Save Common Values" button
- [ ] Verify success toast appears
- [ ] Refresh page and select same structure
- [ ] Verify previously entered values are loaded
- [ ] Modify values and save again
- [ ] Verify values are updated (upsert works)
- [ ] Test with both value and percentage type components
- [ ] Verify earning and deduction components display correctly
- [ ] Test responsive layout on different screen sizes
- [ ] Verify validation prevents saving with missing values
- [ ] Check database to confirm `employee_id` is NULL
- [ ] Verify component IDs are used as keys (not names)

## Database Constraints

The implementation assumes the following database constraints exist:

```sql
-- Unique constraint to prevent duplicate records
UNIQUE (salary_structure_id, tenant_id, employee_id)

-- This allows:
-- - One record per structure with employee_id = NULL (common values)
-- - One record per employee per structure (individual values)
```

## Migration Considerations

If you have existing data, ensure:

1. Existing records for individual employees remain unchanged
2. New records for common components use `employee_id = NULL`
3. No conflicts with existing unique constraints
4. RLS policies allow both NULL and non-NULL employee_id values

## Future Enhancements

Potential improvements for future iterations:

1. **Bulk Import**: Allow importing common values from CSV/Excel
2. **Copy Values**: Copy common values from another structure
3. **History**: Track changes to common values over time
4. **Approval Workflow**: Require approval before saving
5. **Preview**: Show how values will apply to employees
6. **Validation Rules**: Add min/max constraints per component
7. **Formula Support**: Allow calculated values based on other components

## Summary

This implementation successfully adds the ability to define and manage structure-level default values for common components. The solution:

- ✅ Filters components correctly (`type_selection='common'` AND `value_set='master_entry'`)
- ✅ Stores values with `employee_id = NULL` as required
- ✅ Uses component IDs as keys for data integrity
- ✅ Provides intuitive UI with proper input types
- ✅ Handles both value and percentage component types
- ✅ Includes validation and error handling
- ✅ Maintains backward compatibility
- ✅ Follows existing code patterns and conventions

The feature integrates seamlessly with the existing salary structure assignment workflow and sets the foundation for hierarchical component value management.
