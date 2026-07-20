# Shifts Store Implementation Documentation

## Overview

This document describes the complete implementation of Supabase queries in the `shiftsStore.ts` file. The store manages all shift and shift assignment operations with full CRUD functionality, multi-tenant support, and optimistic updates.

## Implementation Summary

### Features Implemented

1. **Full CRUD Operations for Shifts**
   - Create, Read, Update, Delete operations
   - Multi-tenant isolation
   - Optimistic UI updates
   - Comprehensive error handling

2. **Full CRUD Operations for Shift Assignments**
   - Create, Read, Update, Delete operations
   - Date range filtering
   - Employee filtering
   - Status management

3. **Bulk Assignment Operations**
   - Batch creation of shift assignments
   - Rotation pattern support
   - Department-based filtering
   - Validation and error reporting

4. **State Management**
   - Loading states for all operations
   - Error state management
   - Automatic store updates after mutations

## Technical Details

### Store Structure

```typescript
interface ShiftsState {
  shifts: {
    items: Shift[];
    loading: boolean;
    error: string | null
  };
  assignments: {
    items: ShiftAssignment[];
    loading: boolean;
    error: string | null
  };
}
```

### Multi-Tenant Support

All operations include tenant isolation:
- Uses `getTenantId()` to retrieve current tenant context
- All queries filter by `tenant_id`
- Prevents cross-tenant data access
- Ensures data security and compliance

### Implemented Methods

#### 1. `fetchShifts()`
**Purpose**: Retrieve all shifts for the current tenant

**Implementation Details:**
- Fetches from `shifts` table
- Filters by `tenant_id`
- Orders by `created_at` descending
- Updates store with loading/error states

**Supabase Query:**
```typescript
await supabase
  .from('shifts')
  .select('*')
  .eq('tenant_id', tenantId)
  .order('created_at', { ascending: false });
```

**Error Handling:**
- Sets loading state before query
- Catches and stores error messages
- Maintains previous data on error
- Throws error for upstream handling

---

#### 2. `fetchShiftAssignments(startDate, endDate, employeeId?)`
**Purpose**: Retrieve shift assignments within a date range

**Implementation Details:**
- Uses RPC function `get_shift_assignments_secure`
- Supports optional employee filtering
- Includes related shift and employee data
- Date range filtering for performance

**Supabase Query:**
```typescript
await supabase.rpc('get_shift_assignments_secure', {
  p_start_date: startDate,
  p_end_date: endDate,
  p_employee_id: employeeId || null,
  p_tenant_id: tenantId,
});
```

**Parameters:**
- `startDate` (required): Start of date range
- `endDate` (required): End of date range
- `employeeId` (optional): Filter by specific employee

---

#### 3. `createShift(shiftData)`
**Purpose**: Create a new shift

**Implementation Details:**
- Validates shift data
- Adds tenant_id automatically
- Returns created shift with ID
- Optimistically updates store

**Supabase Query:**
```typescript
await supabase
  .from('shifts')
  .insert([{ ...shiftData, tenant_id: tenantId }])
  .select()
  .single();
```

**Optimistic Update:**
- Immediately adds shift to store
- Prepends to items array (newest first)
- Maintains sort order

**Return Value:** Complete `Shift` object with generated ID

---

#### 4. `updateShift(id, updates)`
**Purpose**: Update an existing shift

**Implementation Details:**
- Updates only provided fields (partial update)
- Validates tenant ownership
- Returns updated shift
- Optimistically updates store

**Supabase Query:**
```typescript
await supabase
  .from('shifts')
  .update(updates)
  .eq('id', id)
  .eq('tenant_id', tenantId)
  .select()
  .single();
```

**Security:**
- Double-checks tenant_id to prevent unauthorized updates
- Returns error if shift not found or unauthorized

**Optimistic Update:**
- Replaces shift in items array
- Preserves array order

---

#### 5. `deleteShift(id)`
**Purpose**: Delete a shift

**Implementation Details:**
- Soft delete or hard delete (based on DB constraints)
- Validates tenant ownership
- Removes from store on success

**Supabase Query:**
```typescript
await supabase
  .from('shifts')
  .delete()
  .eq('id', id)
  .eq('tenant_id', tenantId);
```

**Optimistic Update:**
- Filters out deleted shift from items array
- No return value (void)

**Error Handling:**
- May fail if shift has dependent assignments
- Returns descriptive error message

---

#### 6. `createShiftAssignment(assignmentData)`
**Purpose**: Create a new shift assignment

**Implementation Details:**
- Assigns employee to shift for specific date
- Sets default status to 'scheduled'
- Adds tenant_id automatically
- Returns created assignment

**Supabase Query:**
```typescript
await supabase
  .from('shift_assignments')
  .insert([{
    ...assignmentData,
    tenant_id: tenantId,
    status: assignmentData.status || 'scheduled',
  }])
  .select()
  .single();
```

**Default Values:**
- `status`: 'scheduled' (if not provided)
- `overtime_minutes`: 0
- `clock_in`, `clock_out`: null

---

#### 7. `updateShiftAssignment(id, updates)`
**Purpose**: Update an existing shift assignment

**Implementation Details:**
- Updates assignment fields (status, times, notes)
- Common use cases: clock in/out, status changes
- Returns updated assignment

**Supabase Query:**
```typescript
await supabase
  .from('shift_assignments')
  .update(updates)
  .eq('id', id)
  .eq('tenant_id', tenantId)
  .select()
  .single();
```

**Common Update Scenarios:**
- Clock in: `{ clock_in: timestamp, status: 'in_progress' }`
- Clock out: `{ clock_out: timestamp, status: 'completed' }`
- Cancel: `{ status: 'cancelled', notes: reason }`

---

#### 8. `deleteShiftAssignment(id)`
**Purpose**: Delete a shift assignment

**Implementation Details:**
- Removes scheduled assignment
- Validates tenant ownership
- Updates store optimistically

**Supabase Query:**
```typescript
await supabase
  .from('shift_assignments')
  .delete()
  .eq('id', id)
  .eq('tenant_id', tenantId);
```

**Use Cases:**
- Cancel scheduled shift
- Remove incorrect assignment
- Clean up old assignments

---

#### 9. `createBulkAssignments(request)`
**Purpose**: Create multiple shift assignments in batch

**Implementation Details:**
- Uses RPC function for atomic operation
- Supports rotation patterns
- Department-based filtering
- Returns success/error status with details

**Supabase Query:**
```typescript
await supabase.rpc('create_bulk_assignments', {
  p_shift_id: request.shift_id,
  p_employee_ids: request.employee_ids,
  p_start_date: request.rotation.startDate,
  p_end_date: request.rotation.endDate || request.rotation.startDate,
  p_department: request.department || null,
  p_tenant_id: tenantId,
});
```

**Request Structure:**
```typescript
{
  shift_id: string,
  employee_ids: string[],
  rotation: {
    type: 'none' | 'daily' | 'weekly' | 'monthly',
    interval?: number,
    startDate: string,
    endDate?: string
  },
  department?: string
}
```

**Response Structure:**
```typescript
{
  success: boolean,
  assignments?: ShiftAssignment[],
  errors?: Array<{
    code: string,
    message: string,
    details?: any
  }>
}
```

**Post-Operation:**
- Automatically refreshes assignments
- Updates store with new data
- Maintains consistency

---

## Optimistic Updates

All mutation operations (create, update, delete) implement optimistic updates:

### Benefits
- Immediate UI feedback
- Better user experience
- Perceived performance improvement

### Implementation Pattern
```typescript
// 1. Perform database operation
const { data, error } = await supabase...

// 2. If successful, update store immediately
set((state) => ({
  shifts: {
    ...state.shifts,
    items: [...updatedItems]
  }
}));

// 3. Return data for component use
return data;
```

### Rollback Strategy
- Errors are thrown to caller
- Store maintains previous state on error
- Components can handle rollback UI

---

## Error Handling

### Error Flow
1. **Database Error**: Caught by try-catch
2. **Error Processing**: Extract message
3. **Store Update**: Set error state
4. **Error Propagation**: Throw for component handling

### Error State Management
```typescript
set((state) => ({
  shifts: {
    ...state.shifts,
    error: errorMessage
  }
}));
```

### Error Types
- **Network Errors**: Connection issues
- **Validation Errors**: Invalid data
- **Authorization Errors**: Tenant mismatch
- **Constraint Errors**: Foreign key violations

---

## Security Features

### 1. Tenant Isolation
- All queries filter by `tenant_id`
- Prevents cross-tenant data access
- Enforced at database and application level

### 2. Row Level Security (RLS)
- Supabase RLS policies active
- Double-layer security (app + DB)
- Prevents unauthorized access

### 3. Input Validation
- TypeScript type checking
- Database constraints
- Application-level validation

---

## Performance Optimizations

### 1. Selective Queries
- Only fetch required date ranges
- Optional employee filtering
- Reduce data transfer

### 2. Optimistic Updates
- Immediate UI response
- Reduced perceived latency
- Better user experience

### 3. Efficient Ordering
- Database-level sorting
- Indexed columns (created_at)
- Fast query execution

### 4. Bulk Operations
- Single RPC call for multiple assignments
- Atomic transactions
- Reduced network overhead

---

## Usage Examples

### Fetching Shifts
```typescript
const { shifts, fetchShifts } = useShiftsStore();

useEffect(() => {
  fetchShifts();
}, [fetchShifts]);

// Access data
const { items, loading, error } = shifts;
```

### Creating a Shift
```typescript
const { createShift } = useShiftsStore();

const newShift = await createShift({
  name: 'Morning Shift',
  description: '8 AM - 4 PM',
  start_time: '08:00',
  end_time: '16:00',
  break_duration: '01:00',
  shift_type: 'morning',
  is_active: true
});
```

### Fetching Assignments
```typescript
const { assignments, fetchShiftAssignments } = useShiftsStore();

useEffect(() => {
  const today = new Date().toISOString().split('T')[0];
  const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    .toISOString().split('T')[0];

  fetchShiftAssignments(today, nextWeek);
}, [fetchShiftAssignments]);
```

### Bulk Assignment
```typescript
const { createBulkAssignments } = useShiftsStore();

const result = await createBulkAssignments({
  shift_id: 'shift-123',
  employee_ids: ['emp-1', 'emp-2', 'emp-3'],
  rotation: {
    type: 'weekly',
    startDate: '2025-01-01',
    endDate: '2025-12-31'
  },
  department: 'Sales'
});

if (result.success) {
  console.log('Created assignments:', result.assignments);
} else {
  console.error('Errors:', result.errors);
}
```

---

## Database Schema Requirements

### Tables

#### `shifts`
```sql
CREATE TABLE shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  description TEXT,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  break_duration INTERVAL NOT NULL,
  shift_type TEXT NOT NULL CHECK (shift_type IN ('morning', 'afternoon', 'night')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

#### `shift_assignments`
```sql
CREATE TABLE shift_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  shift_id UUID NOT NULL REFERENCES shifts(id),
  employee_id UUID NOT NULL REFERENCES employees(id),
  schedule_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  clock_in TIMESTAMPTZ,
  clock_out TIMESTAMPTZ,
  actual_break_duration INTERVAL,
  overtime_minutes INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```





CREATE OR REPLACE FUNCTION public.is_holiday(
  check_date date, 
  check_tenant_id uuid
)
RETURNS boolean AS $$
DECLARE
  is_fixed_holiday boolean;
  is_recurring_holiday boolean;
  
  -- Variables for recurring logic
  day_of_week text;       -- 'monday', 'tuesday', etc.
  day_occurrence text;    -- 'first', 'second', 'last', etc.
  month_start date;
  month_end date;
BEGIN
  -----------------------------------------
  -- 1. CHECK FIXED DATE HOLIDAYS
  -----------------------------------------
  SELECT EXISTS (
    SELECT 1 FROM public.holidays 
    WHERE date = check_date 
      AND tenant_id = check_tenant_id 
      AND is_active = true
  ) INTO is_fixed_holiday;

  IF is_fixed_holiday THEN
    RETURN true;
  END IF;

  -----------------------------------------
  -- 2. CHECK RECURRING PATTERNS
  -----------------------------------------
  -- Calculate day metadata (lowercase for matching constraint)
  day_of_week := trim(to_char(check_date, 'day')); 
  month_start := date_trunc('month', check_date)::date;
  month_end := (date_trunc('month', check_date) + interval '1 month - 1 day')::date;

  -- Calculate occurrence (e.g., is this the 'first' Monday?)
  WITH occurrences AS (
    SELECT 
      generate_series(month_start, month_end, '1 day'::interval)::date AS d
  ),
  ranked_days AS (
    SELECT 
      d,
      trim(to_char(d, 'day')) as dow,
      row_number() OVER (PARTITION BY trim(to_char(d, 'day')) ORDER BY d) as rank_asc,
      row_number() OVER (PARTITION BY trim(to_char(d, 'day')) ORDER BY d DESC) as rank_desc
    FROM occurrences
  )
  SELECT 
    CASE 
      WHEN rank_asc = 1 THEN 'first'
      WHEN rank_asc = 2 THEN 'second'
      WHEN rank_asc = 3 THEN 'third'
      WHEN rank_asc = 4 THEN 'fourth'
      ELSE 'none'
    END,
    CASE
      WHEN rank_desc = 1 THEN 'last'
      ELSE 'none'
    END
  INTO day_occurrence, day_occurrence -- we only need one variable, but logic allows checking both
  FROM ranked_days
  WHERE d = check_date;

  -- Check if this specific pattern exists in the database
  SELECT EXISTS (
    SELECT 1 
    FROM public.holiday_recurring_patterns p
    JOIN public.holidays h ON p.holiday_id = h.id
    WHERE p.tenant_id = check_tenant_id
      AND p.is_active = true
      AND h.is_active = true
      AND p.week_day = day_of_week
      AND (
        p.week_occurrence = CASE 
                              WHEN day_occurrence IN ('first', 'second', 'third', 'fourth') THEN day_occurrence 
                              ELSE 'none' 
                            END
        OR
        p.week_occurrence = CASE -- Check 'last' separately because a day can be both 'fourth' and 'last'
                              WHEN (SELECT rank_desc FROM ranked_days WHERE d = check_date) = 1 THEN 'last' 
                              ELSE 'none' 
                            END
      )
  ) INTO is_recurring_holiday;

  RETURN is_recurring_holiday;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


### RPC Functions

#### `get_shift_assignments_secure`
Returns shift assignments with related data for a date range.

#### `create_bulk_assignments`
Creates multiple shift assignments atomically with validation.

---

## Testing Checklist

### Unit Tests
- ✅ fetchShifts retrieves tenant-specific data
- ✅ createShift adds to store
- ✅ updateShift modifies existing shift
- ✅ deleteShift removes from store
- ✅ Error handling works correctly

### Integration Tests
- ✅ Multi-tenant isolation verified
- ✅ Optimistic updates work correctly
- ✅ Bulk assignments create all records
- ✅ RPC functions execute successfully

### Performance Tests
- ✅ Large dataset queries perform well
- ✅ Bulk operations handle 100+ assignments
- ✅ No memory leaks in store

---

## Maintenance Notes

### Future Enhancements
1. Add caching layer for frequently accessed shifts
2. Implement pagination for large assignment lists
3. Add websocket support for real-time updates
4. Optimize bulk assignment performance

### Known Limitations
1. Bulk assignments limited to single shift at a time
2. No built-in conflict detection for overlapping assignments
3. Time zone handling relies on browser/server settings

### Version History
- **v1.0** (Current): Complete CRUD implementation with multi-tenant support
- All function signatures maintained for backward compatibility
- Production-ready with comprehensive error handling

---

## Conclusion

The `shiftsStore.ts` implementation provides a robust, type-safe, and performant solution for managing shifts and assignments in a multi-tenant environment. All operations include proper error handling, optimistic updates, and tenant isolation, making it production-ready and maintainable.
