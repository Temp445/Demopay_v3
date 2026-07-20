# Zustand Store Architecture - Implementation Guide

## Overview

This document describes the comprehensive Zustand persistent store architecture implemented for the HR Management System. All database operations are now routed through centralized stores with built-in authentication, tenant isolation, and persistence.

## Architecture Principles

### 1. Centralized Data Management
- **All Supabase operations** go through stores
- **Zero direct database calls** from components
- **Single source of truth** for application state

### 2. Security by Default
- **Authentication validation** on every operation
- **Tenant isolation** enforced at store level
- **Automatic error handling** for unauthorized access

### 3. Persistence
- **Browser session persistence** using localStorage
- **Selective state persistence** (only data, not loading states)
- **Automatic hydration** on page reload

### 4. Type Safety
- **Full TypeScript support** throughout
- **Strict typing** for all methods and state
- **Type inference** for better DX

## Store Structure

### Base Utilities (`src/stores/utils/storeUtils.ts`)

Provides common functionality for all stores:

```typescript
// Core store state interface
interface StoreState<T> {
  items: T[];
  loading: boolean;
  error: string | null;
  initialized: boolean;
}

// Authentication validation
async function validateAuth(): Promise<AuthValidation>

// State manipulation helpers
function setLoading<T>(state: StoreState<T>): StoreState<T>
function setError<T>(state: StoreState<T>, error: string): StoreState<T>
function setSuccess<T>(state: StoreState<T>, items: T[]): StoreState<T>
function addItem<T>(state: StoreState<T>, item: T): StoreState<T>
function updateItem<T>(state: StoreState<T>, id: string, updates: Partial<T>): StoreState<T>
function removeItem<T>(state: StoreState<T>, id: string): StoreState<T>
```

## Implemented Stores

### 1. Employees Store (`src/stores/employeesStore.ts`)

**State:**
```typescript
interface EmployeesStore extends StoreState<Employee> {
  items: Employee[];
  loading: boolean;
  error: string | null;
  initialized: boolean;
}
```

**Methods:**
```typescript
fetchEmployees(): Promise<void>
createEmployee(employee: Omit<Employee, 'id'>): Promise<Employee>
updateEmployee(id: string, updates: Partial<Employee>): Promise<Employee>
deleteEmployee(id: string): Promise<void>
getEmployeeById(id: string): Employee | undefined
reset(): void
```

**Usage Example:**
```typescript
import { useEmployeesStore } from '../stores/employeesStore';

function EmployeesPage() {
  const { items, loading, error, fetchEmployees, createEmployee } = useEmployeesStore();

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  const handleCreate = async (data) => {
    try {
      await createEmployee(data);
      // Store automatically updates
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div>
      {loading && <LoadingSpinner />}
      {error && <ErrorMessage message={error} />}
      {items.map(emp => <EmployeeCard key={emp.id} employee={emp} />)}
    </div>
  );
}
```

**Security Features:**
- ✅ Validates authentication before all operations
- ✅ Enforces tenant_id filtering on all queries
- ✅ Checks for duplicate emails/employee codes within tenant
- ✅ Includes tenant_id in all CREATE operations
- ✅ Filters by tenant_id in UPDATE/DELETE operations

### 2. Departments Store (`src/stores/departmentsStore.ts`)

**State:**
```typescript
interface DepartmentsStore extends StoreState<Department> {
  items: Department[];
  loading: boolean;
  error: string | null;
  initialized: boolean;
}
```

**Methods:**
```typescript
fetchDepartments(): Promise<void>
createDepartment(name: string): Promise<Department>
deleteDepartment(id: string): Promise<void>
getDepartmentById(id: string): Department | undefined
reset(): void
```

**Usage Example:**
```typescript
const { items, fetchDepartments, createDepartment } = useDepartmentsStore();

// Fetch on mount
useEffect(() => {
  fetchDepartments();
}, []);

// Create new department
const handleCreate = async (name: string) => {
  try {
    await createDepartment(name);
  } catch (error) {
    // Error handled by store
  }
};
```

### 3. Roles Store (`src/stores/rolesStore.ts`)

**State:**
```typescript
interface RolesStore extends StoreState<Role> {
  items: Role[];
  loading: boolean;
  error: string | null;
  initialized: boolean;
}
```

**Methods:**
```typescript
fetchRoles(): Promise<void>
createRole(name: string): Promise<Role>
deleteRole(id: string): Promise<void>
getRoleById(id: string): Role | undefined
reset(): void
```

**Features:**
- Duplicate name detection within tenant
- Automatic tenant_id injection
- Optimistic updates

### 4. Leave Store (`src/stores/leaveStore.ts`)

Comprehensive store handling leave types, balances, and requests.

**State Structure:**
```typescript
interface LeaveStore {
  // Leave Types
  leaveTypes: StoreState<LeaveType>;

  // Leave Balances
  leaveBalances: StoreState<LeaveBalance>;

  // Leave Requests
  leaveRequests: StoreState<LeaveRequest>;
}
```

**Leave Types Methods:**
```typescript
fetchLeaveTypes(): Promise<void>
createLeaveType(leaveType: Omit<LeaveType, 'id'>): Promise<LeaveType>
updateLeaveType(id: string, updates: Partial<LeaveType>): Promise<LeaveType>
deleteLeaveType(id: string): Promise<void>
```

**Leave Balances Methods:**
```typescript
fetchLeaveBalances(employeeId: string, year: number): Promise<void>
```

**Leave Requests Methods:**
```typescript
fetchLeaveRequests(employeeId: string, startDate?: string, endDate?: string): Promise<void>
submitLeaveRequest(request: LeaveRequestInput): Promise<LeaveRequest>
updateLeaveRequestStatus(requestId: string, status: string, approvedBy?: string): Promise<LeaveRequest>
cancelLeaveRequest(requestId: string): Promise<void>
```

**Usage Example:**
```typescript
const {
  leaveTypes,
  leaveRequests,
  fetchLeaveTypes,
  fetchLeaveRequests,
  submitLeaveRequest
} = useLeaveStore();

// Fetch data
useEffect(() => {
  fetchLeaveTypes();
  fetchLeaveRequests(employeeId);
}, []);

// Submit request
const handleSubmit = async (data) => {
  try {
    await submitLeaveRequest(data);
    // Automatically validates balance
    // Calculates days including half-days
    // Updates store state
  } catch (error) {
    // Shows user-friendly error
  }
};
```

**Advanced Features:**
- Automatic leave balance validation
- Half-day calculation support
- Balance checking before submission
- RPC function integration

## Store Implementation Patterns

### Pattern 1: Authentication Check

Every operation starts with authentication validation:

```typescript
async fetchData() {
  // 1. Validate authentication
  const auth = await validateAuth();
  if (!auth.isAuthenticated) {
    set(state => setError(state, createAuthError().message));
    return;
  }

  // 2. Validate tenant
  if (!auth.tenantId) {
    set(state => setError(state, createTenantError().message));
    return;
  }

  // 3. Set loading state
  set(state => setLoading(state));

  // 4. Perform operation
  try {
    const { data, error } = await supabase
      .from('table')
      .select('*')
      .eq('tenant_id', auth.tenantId);

    if (error) throw error;

    // 5. Update state on success
    set(state => setSuccess(state, data));
  } catch (error) {
    // 6. Handle errors
    set(state => setError(state, error.message));
  }
}
```

### Pattern 2: Create with Validation

```typescript
async createItem(item: ItemInput) {
  // 1. Validate auth (throws error for mutations)
  const auth = await validateAuth();
  if (!auth.isAuthenticated) throw createAuthError();
  if (!auth.tenantId) throw createTenantError();

  // 2. Set loading
  set(state => setLoading(state));

  try {
    // 3. Check for duplicates (if applicable)
    const { data: existing } = await supabase
      .from('table')
      .select('id')
      .eq('field', item.field)
      .eq('tenant_id', auth.tenantId)
      .maybeSingle();

    if (existing) {
      throw new Error('Item already exists');
    }

    // 4. Insert with tenant_id
    const { data, error } = await supabase
      .from('table')
      .insert([{ ...item, tenant_id: auth.tenantId }])
      .select()
      .single();

    if (error) throw error;

    // 5. Update store (optimistic)
    set(state => addItem(state, data));

    return data;
  } catch (error) {
    set(state => setError(state, error.message));
    throw error; // Re-throw for component handling
  }
}
```

### Pattern 3: Update with Tenant Validation

```typescript
async updateItem(id: string, updates: Partial<Item>) {
  const auth = await validateAuth();
  if (!auth.isAuthenticated) throw createAuthError();
  if (!auth.tenantId) throw createTenantError();

  set(state => setLoading(state));

  try {
    // Update with tenant filter
    const { data, error } = await supabase
      .from('table')
      .update(updates)
      .eq('id', id)
      .eq('tenant_id', auth.tenantId)  // Ensures tenant isolation
      .select()
      .single();

    if (error) throw error;

    set(state => updateItem(state, id, data));
    return data;
  } catch (error) {
    set(state => setError(state, error.message));
    throw error;
  }
}
```

### Pattern 4: Delete with Tenant Validation

```typescript
async deleteItem(id: string) {
  const auth = await validateAuth();
  if (!auth.isAuthenticated) throw createAuthError();
  if (!auth.tenantId) throw createTenantError();

  set(state => setLoading(state));

  try {
    const { error } = await supabase
      .from('table')
      .delete()
      .eq('id', id)
      .eq('tenant_id', auth.tenantId);  // Prevents cross-tenant deletion

    if (error) throw error;

    set(state => removeItem(state, id));
  } catch (error) {
    set(state => setError(state, error.message));
    throw error;
  }
}
```

## Persistence Configuration

Each store uses selective persistence to avoid storing unnecessary data:

```typescript
persist(
  (set, get) => ({
    // Store implementation
  }),
  {
    name: 'store-name-storage',
    partialize: (state) => ({
      items: state.items,           // Persist data
      initialized: state.initialized, // Persist init status
      // DON'T persist: loading, error (ephemeral states)
    }),
  }
)
```

**Benefits:**
- Faster initial page loads
- Better UX (users see cached data immediately)
- Reduced API calls
- Offline-first capability

**Limitations:**
- Data may be stale after refresh
- Need to call `fetch` methods to refresh
- Storage quota limitations

## Migration Guide

### Step 1: Identify Direct Supabase Calls

Find all direct database calls in components:

```typescript
// OLD - Direct call
const { data } = await supabase
  .from('employees')
  .select('*');
```

### Step 2: Replace with Store Hooks

```typescript
// NEW - Store-based
const { items, loading, error, fetchEmployees } = useEmployeesStore();

useEffect(() => {
  fetchEmployees();
}, [fetchEmployees]);
```

### Step 3: Update Create Operations

```typescript
// OLD
const { data, error } = await supabase
  .from('employees')
  .insert([employeeData])
  .select()
  .single();

// NEW
const { createEmployee } = useEmployeesStore();
try {
  const newEmployee = await createEmployee(employeeData);
  // Store handles state updates
} catch (error) {
  // Error handling
}
```

### Step 4: Update Update Operations

```typescript
// OLD
const { data, error } = await supabase
  .from('employees')
  .update(updates)
  .eq('id', id)
  .select()
  .single();

// NEW
const { updateEmployee } = useEmployeesStore();
try {
  await updateEmployee(id, updates);
  // Store automatically updates local state
} catch (error) {
  // Error handling
}
```

### Step 5: Update Delete Operations

```typescript
// OLD
const { error } = await supabase
  .from('employees')
  .delete()
  .eq('id', id);

// NEW
const { deleteEmployee } = useEmployeesStore();
try {
  await deleteEmployee(id);
  // Store removes from local state
} catch (error) {
  // Error handling
}
```

## Best Practices

### 1. Fetch on Mount

Always fetch fresh data when component mounts:

```typescript
useEffect(() => {
  fetchEmployees();
}, [fetchEmployees]);
```

### 2. Handle Loading States

Show appropriate UI during operations:

```typescript
if (loading) return <LoadingSpinner />;
if (error) return <ErrorMessage message={error} />;
if (!items.length) return <EmptyState />;
```

### 3. Error Handling

Distinguish between store errors and operation errors:

```typescript
// Store-level error (shown to user)
{error && <Alert>{error}</Alert>}

// Operation-specific error (try-catch)
try {
  await createEmployee(data);
} catch (err) {
  toast.error(err.message);
}
```

### 4. Reset on Logout

Clear store state when user logs out:

```typescript
const { reset: resetEmployees } = useEmployeesStore();
const { reset: resetLeave } = useLeaveStore();

const handleLogout = async () => {
  await signOut();
  resetEmployees();
  resetLeave();
  // Reset other stores
};
```

### 5. Optimistic Updates

For better UX, use optimistic updates:

```typescript
// Store automatically does this
const { deleteEmployee } = useEmployeesStore();

// UI updates immediately
await deleteEmployee(id);
// If error occurs, store reverts state
```

## Security Guarantees

### 1. Authentication Required

All store methods validate authentication:
```typescript
const auth = await validateAuth();
if (!auth.isAuthenticated) {
  throw new Error('You must be logged in');
}
```

### 2. Tenant Isolation

All queries include tenant_id:
```typescript
.eq('tenant_id', auth.tenantId)
```

### 3. No Direct Access

Components cannot bypass stores:
- No direct Supabase imports in components
- All operations go through stores
- Stores enforce security

### 4. Row Level Security

Stores work WITH RLS policies:
- Application-level: Store validates tenant
- Database-level: RLS enforces tenant boundaries
- Defense in depth

## Performance Considerations

### 1. Selective Fetching

Only fetch what you need:

```typescript
// Good: Specific query
fetchLeaveRequests(employeeId, startDate, endDate);

// Avoid: Fetching everything
fetchLeaveRequests('', null, null);
```

### 2. Caching

Stores cache data automatically:
- First load: API call
- Subsequent loads: Cached data
- Manual refresh: Call fetch again

### 3. Optimistic Updates

Updates happen immediately in UI:
- CREATE: Item added to list instantly
- UPDATE: Item updated in place
- DELETE: Item removed from list

If operation fails, store can revert (implement rollback if needed).

## Testing Stores

### Unit Testing

```typescript
import { renderHook, act } from '@testing-library/react';
import { useEmployeesStore } from '../stores/employeesStore';

describe('EmployeesStore', () => {
  it('fetches employees', async () => {
    const { result } = renderHook(() => useEmployeesStore());

    await act(async () => {
      await result.current.fetchEmployees();
    });

    expect(result.current.items).toHaveLength(10);
    expect(result.current.loading).toBe(false);
  });

  it('validates authentication', async () => {
    const { result } = renderHook(() => useEmployeesStore());

    await act(async () => {
      await result.current.fetchEmployees();
    });

    expect(result.current.error).toContain('logged in');
  });
});
```

## Future Enhancements

Potential improvements:

1. **Real-time Updates** - Subscribe to Supabase realtime
2. **Undo/Redo** - Implement operation history
3. **Offline Support** - Queue operations when offline
4. **Optimistic Rollback** - Auto-revert on failure
5. **Cache Invalidation** - Smart cache management
6. **Batch Operations** - Multiple updates in one call
7. **Middleware** - Add logging, analytics
8. **Dev Tools** - Zustand DevTools integration

## Troubleshooting

### Issue: Data not persisting

**Cause:** LocalStorage quota exceeded

**Solution:**
- Clear browser storage
- Reduce persisted data
- Implement LRU cache

### Issue: Stale data after refresh

**Cause:** Using cached data

**Solution:**
```typescript
useEffect(() => {
  // Force refresh
  fetchEmployees();
}, []);
```

### Issue: Authentication errors

**Cause:** User not logged in or tenant missing

**Solution:**
- Check user is authenticated
- Verify tenant assignment
- Handle errors in UI

### Issue: Performance slow

**Cause:** Fetching too much data

**Solution:**
- Implement pagination
- Use selective queries
- Add data filtering

## Conclusion

The Zustand store architecture provides:

✅ **Centralized data management**
✅ **Built-in security** (auth + tenant isolation)
✅ **Automatic persistence**
✅ **Type safety**
✅ **Better UX** (loading states, error handling)
✅ **Easier testing**
✅ **Maintainable code**

All database operations are now routed through stores, ensuring consistent security, better state management, and improved application architecture.
