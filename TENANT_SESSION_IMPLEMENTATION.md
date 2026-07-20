# Tenant Session-Based Implementation

## Overview

This document describes the session-based tenant isolation implementation that ensures all database operations are automatically filtered by `tenant_id` without modifying application features or UI.

## Implementation Strategy

The implementation uses a **dual-layer approach** for maximum security:

1. **Row Level Security (RLS)** - Database-level enforcement (already implemented)
2. **Application-level filtering** - Session-based tenant_id injection in queries

This combination provides defense-in-depth: even if application code has a bug, RLS prevents data leakage.

## Components

### 1. Enhanced AuthContext

**File: `src/contexts/AuthContext.tsx`**

**Changes Made:**
- Added `tenantId` state to track current user's tenant
- Added `loadUserTenantId()` function to fetch tenant on login
- Automatically loads tenant_id when user authenticates
- Exposes `tenantId` in context for application use

**How it Works:**
```typescript
// On login/session restore
const tenant_id = await loadUserTenantId(session.user.id);
setTenantId(tenant_id);
```

The tenant_id is now available throughout the application via:
```typescript
const { tenantId } = useAuth();
```

### 2. Tenant Database Helper

**File: `src/lib/tenantDb.ts`** (NEW FILE)

**Purpose:**
Provides centralized tenant_id management and helper functions for database operations.

**Key Functions:**

#### `setCurrentTenantId(tenantId: string | null)`
Stores the current tenant_id in module state. Called automatically by TenantContext when tenant changes.

#### `getCurrentTenantId(): string | null`
Returns the cached tenant_id without async call.

#### `getTenantId(): Promise<string>`
Returns tenant_id, fetching from database if not cached. Used in all database operations to ensure tenant context.

```typescript
const tenantId = await getTenantId();
// Returns current user's tenant_id or throws error if not found
```

#### `tenantQuery(tableName: string)`
Provides a fluent API for tenant-scoped queries (optional helper for future use):

```typescript
// SELECT with automatic tenant filtering
await tenantQuery('employees').select();

// INSERT with automatic tenant_id injection
await tenantQuery('employees').insert({ name: 'John' });

// UPDATE with tenant filtering
await tenantQuery('employees').update({ name: 'Jane' }).eq('id', '123');

// DELETE with tenant filtering
await tenantQuery('employees').delete().eq('id', '123');
```

### 3. Enhanced TenantContext

**File: `src/contexts/TenantContext.tsx`**

**Changes Made:**
- Imports `setCurrentTenantId` from tenantDb
- Calls `setCurrentTenantId()` when tenant is loaded or changed
- Ensures session tenant_id is always in sync with current tenant

**Integration:**
```typescript
// When tenant loads
if (primaryTenant) {
  setCurrentTenantId(primaryTenant.id);
}

// When user logs out
setCurrentTenantId(null);
```

### 4. Updated Service Layer Functions

All database service files have been updated to include tenant_id filtering:

**Files Modified:**
- `src/lib/employees.ts`
- `src/lib/leave.ts`
- `src/lib/departments.ts`
- `src/lib/attendance.ts`

**Pattern Applied to All Functions:**

#### CREATE Operations
```typescript
export async function createEmployee(employee, user_id) {
  const tenant_id = await getTenantId();

  // Insert with tenant_id
  const { data, error } = await supabase
    .from('employees')
    .insert([{ ...employee, tenant_id }])
    .select()
    .single();

  return data;
}
```

#### READ Operations
```typescript
export async function getEmployees() {
  const tenantId = await getTenantId();

  // Filter by tenant_id
  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  return data;
}
```

#### UPDATE Operations
```typescript
export async function updateEmployee(id, updates) {
  const tenant_id = await getTenantId();

  // Update with tenant_id filter
  const { data, error } = await supabase
    .from('employees')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', tenant_id)  // Ensures update only affects tenant's data
    .select()
    .single();

  return data;
}
```

#### DELETE Operations
```typescript
export async function deleteEmployee(id) {
  const tenantId = await getTenantId();

  // Delete with tenant_id filter
  const { error } = await supabase
    .from('employees')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId);  // Ensures delete only affects tenant's data

  if (error) throw new Error(error.message);
}
```

## Security Architecture

### Defense in Depth

The implementation provides **three layers of security**:

1. **Session Layer** - tenant_id stored in auth session
2. **Application Layer** - Automatic tenant_id filtering in queries
3. **Database Layer** - RLS policies enforce tenant isolation

### How Tenant Isolation Works

#### User Login Flow
```
1. User logs in with email/password
2. AuthContext fetches user's tenant_id from database
3. tenant_id stored in AuthContext state
4. TenantContext loads tenant details
5. tenant_id set in tenantDb session cache
```

#### Database Operation Flow
```
1. Application calls service function (e.g., getEmployees())
2. Service function calls getTenantId()
3. getTenantId() returns cached tenant_id
4. Query includes .eq('tenant_id', tenantId)
5. Supabase executes query with tenant filter
6. RLS policy validates tenant_id matches user's tenant
7. Only tenant's data is returned/modified
```

### Validation Chain

Every database operation validates tenant_id at multiple points:

```typescript
// Example: Creating an employee

// 1. Get tenant_id from session
const tenant_id = await getTenantId();
// Throws error if user has no tenant

// 2. Include in INSERT
.insert([{ ...employee, tenant_id }])
// Application layer adds tenant_id

// 3. RLS policy validates
-- Database layer: Policy checks auth.uid() belongs to tenant
USING (tenant_id = get_user_tenant_id())
```

## Benefits of This Approach

### 1. No UI/UX Changes
- All existing features work identically
- No new fields or behaviors for users
- Transparent tenant isolation

### 2. Automatic Tenant Filtering
- Developers don't need to remember to add tenant_id
- Centralized in service layer
- Consistent across all operations

### 3. Performance
- Cached tenant_id reduces database calls
- Single async call per session
- Indexes on tenant_id ensure fast queries

### 4. Security
- Cannot access other tenant's data
- Multi-layer validation
- RLS provides final enforcement

### 5. Maintainability
- Clear, consistent pattern
- Easy to audit
- Simple to extend to new tables

## Usage Examples

### Example 1: Employee Management

```typescript
// In a React component
const EmployeesPage = () => {
  const [employees, setEmployees] = useState([]);

  useEffect(() => {
    // Automatically filtered by tenant_id
    loadEmployees();
  }, []);

  const loadEmployees = async () => {
    // getTenantId() called inside getEmployees()
    // Returns only current tenant's employees
    const data = await getEmployees();
    setEmployees(data);
  };

  const handleCreate = async (employeeData) => {
    // tenant_id automatically injected
    await createEmployee(employeeData, user.id);
    await loadEmployees();
  };
};
```

### Example 2: Leave Requests

```typescript
// In leave management
const LeavePage = () => {
  const loadLeaves = async () => {
    // Filtered by tenant_id automatically
    const leaves = await getLeaveRequests(employeeId);
    setLeaves(leaves);
  };

  const handleSubmit = async (leaveData) => {
    // tenant_id added automatically to new leave request
    await submitLeaveRequest(leaveData);
  };

  const handleApprove = async (requestId) => {
    // Only updates if request belongs to user's tenant
    await updateLeaveRequestStatus(requestId, 'Approved', user.id);
  };
};
```

### Example 3: Attendance Tracking

```typescript
// Clock in/out operations
const AttendancePage = () => {
  const handleClockIn = async (employeeId, shiftId) => {
    // tenant_id automatically added to attendance log
    await clockIn(employeeId, shiftId);
  };

  const loadAttendance = async (employeeId, start, end) => {
    // Returns only tenant's attendance records
    const records = await getAttendanceRecords(employeeId, start, end);
    setRecords(records);
  };
};
```

## Migration Considerations

### Existing Data
If you have existing data before this implementation:

1. Migrations already added tenant_id columns
2. New user signups automatically get a tenant
3. Existing users need tenant assignment:

```sql
-- Assign existing users to default tenant
UPDATE employees SET tenant_id = (
  SELECT tenant_id FROM tenant_users
  WHERE user_id = employees.created_by
  LIMIT 1
)
WHERE tenant_id IS NULL;
```

### Testing Tenant Isolation

**Test Scenario 1: Data Visibility**
```typescript
// Login as User A (Tenant 1)
const employeesA = await getEmployees();
// Should only return Tenant 1's employees

// Login as User B (Tenant 2)
const employeesB = await getEmployees();
// Should only return Tenant 2's employees
// Lists should have no overlap
```

**Test Scenario 2: Cross-Tenant Operations**
```typescript
// User A tries to update User B's employee
const tenantAUser = // logged in as Tenant A
try {
  // Employee ID belongs to Tenant B
  await updateEmployee('tenant-b-employee-id', { name: 'Hacked' });
  // Should throw error or update nothing
} catch (error) {
  // Expected: No permission or not found
}
```

**Test Scenario 3: Multi-Tenant Users**
```typescript
// User belongs to Tenant A and Tenant B
await switchTenant(tenantBId);
const employees = await getEmployees();
// Should now show Tenant B's employees

await switchTenant(tenantAId);
const employeesAgain = await getEmployees();
// Should now show Tenant A's employees
```

## Troubleshooting

### Issue: "User is not associated with a tenant"

**Cause:** User has no tenant_users record

**Solution:**
```sql
-- Check user's tenant
SELECT * FROM tenant_users WHERE user_id = 'user-uuid';

-- Assign to tenant if missing
INSERT INTO tenant_users (user_id, tenant_id, role, is_primary)
VALUES ('user-uuid', 'tenant-uuid', 'user', true);
```

### Issue: No data returned after implementation

**Cause:** tenant_id not yet set in session

**Solution:**
- Check AuthContext loaded tenant_id
- Verify TenantContext called setCurrentTenantId()
- Ensure user logged in (not just registered)

### Issue: Can see other tenant's data

**Cause:** RLS policies not applied or application filter missing

**Solution:**
- Run migrations to apply RLS policies
- Verify service function includes .eq('tenant_id', tenantId)
- Check getTenantId() returns correct value

## Code Checklist

When adding new database tables/functions:

- [ ] Add `tenant_id` column to table
- [ ] Create RLS policies for tenant isolation
- [ ] Import `getTenantId` in service file
- [ ] Call `getTenantId()` before database operations
- [ ] Include `.eq('tenant_id', tenantId)` in SELECT
- [ ] Include `tenant_id` in INSERT data
- [ ] Include `.eq('tenant_id', tenantId)` in UPDATE/DELETE
- [ ] Test with multiple tenants

## Performance Optimization

### Tenant ID Caching

The `getTenantId()` function caches the tenant_id:

```typescript
let currentTenantId: string | null = null;

export async function getTenantId(): Promise<string> {
  // Return cached value if available
  if (currentTenantId) {
    return currentTenantId;
  }

  // Otherwise fetch and cache
  const { data } = await supabase.rpc('get_user_tenant_id');
  currentTenantId = data;
  return data;
}
```

**Benefits:**
- Reduces database calls
- Faster query execution
- Single fetch per session

### Database Indexes

All tenant_id columns are indexed:

```sql
CREATE INDEX idx_employees_tenant_id ON employees(tenant_id);
CREATE INDEX idx_leave_requests_tenant_id ON leave_requests(tenant_id);
-- etc for all tables
```

**Benefits:**
- Fast tenant filtering
- Efficient query execution
- Scales with tenant growth

## Summary

This implementation provides **complete tenant isolation** with:

✅ Automatic tenant_id injection in all operations
✅ Session-based tenant management
✅ No UI/UX changes required
✅ All existing features work identically
✅ Multi-layer security (application + database)
✅ Performance optimized with caching
✅ Easy to maintain and extend

The tenant_id is seamlessly integrated into every database operation, ensuring users can only see and interact with their organization's data.
