# Zustand Stores - Quick Reference Guide

## Available Stores

| Store | File | Purpose |
|-------|------|---------|
| Employees | `employeesStore.ts` | Manage employee records |
| Departments | `departmentsStore.ts` | Manage department data |
| Roles | `rolesStore.ts` | Manage role definitions |
| Leave | `leaveStore.ts` | Manage leave types, balances, and requests |

## Quick Usage Examples

### Employees Store

```typescript
import { useEmployeesStore } from '../stores/employeesStore';

function MyComponent() {
  const {
    items,              // Employee[]
    loading,            // boolean
    error,              // string | null
    fetchEmployees,     // () => Promise<void>
    createEmployee,     // (data) => Promise<Employee>
    updateEmployee,     // (id, updates) => Promise<Employee>
    deleteEmployee,     // (id) => Promise<void>
    getEmployeeById,    // (id) => Employee | undefined
  } = useEmployeesStore();

  // Fetch on mount
  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  // Create
  const handleCreate = async (data) => {
    try {
      await createEmployee(data);
    } catch (error) {
      console.error(error);
    }
  };

  // Update
  const handleUpdate = async (id, updates) => {
    try {
      await updateEmployee(id, updates);
    } catch (error) {
      console.error(error);
    }
  };

  // Delete
  const handleDelete = async (id) => {
    try {
      await deleteEmployee(id);
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div>
      {loading && <div>Loading...</div>}
      {error && <div>Error: {error}</div>}
      {items.map(emp => <div key={emp.id}>{emp.name}</div>)}
    </div>
  );
}
```

### Departments Store

```typescript
import { useDepartmentsStore } from '../stores/departmentsStore';

function DepartmentsComponent() {
  const {
    items,                  // Department[]
    loading,                // boolean
    error,                  // string | null
    fetchDepartments,       // () => Promise<void>
    createDepartment,       // (name: string) => Promise<Department>
    deleteDepartment,       // (id: string) => Promise<void>
    getDepartmentById,      // (id: string) => Department | undefined
  } = useDepartmentsStore();

  useEffect(() => {
    fetchDepartments();
  }, [fetchDepartments]);

  return (
    <div>
      {items.map(dept => <div key={dept.id}>{dept.name}</div>)}
    </div>
  );
}
```

### Roles Store

```typescript
import { useRolesStore } from '../stores/rolesStore';

function RolesComponent() {
  const {
    items,              // Role[]
    loading,            // boolean
    error,              // string | null
    fetchRoles,         // () => Promise<void>
    createRole,         // (name: string) => Promise<Role>
    deleteRole,         // (id: string) => Promise<void>
    getRoleById,        // (id: string) => Role | undefined
  } = useRolesStore();

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  return (
    <div>
      {items.map(role => <div key={role.id}>{role.name}</div>)}
    </div>
  );
}
```

### Leave Store

```typescript
import { useLeaveStore } from '../stores/leaveStore';

function LeaveComponent() {
  const {
    // Leave Types
    leaveTypes: { items: types, loading: typesLoading },
    fetchLeaveTypes,
    createLeaveType,
    updateLeaveType,
    deleteLeaveType,

    // Leave Balances
    leaveBalances: { items: balances, loading: balancesLoading },
    fetchLeaveBalances,

    // Leave Requests
    leaveRequests: { items: requests, loading: requestsLoading },
    fetchLeaveRequests,
    submitLeaveRequest,
    updateLeaveRequestStatus,
    cancelLeaveRequest,
  } = useLeaveStore();

  useEffect(() => {
    fetchLeaveTypes();
    fetchLeaveBalances(employeeId, 2024);
    fetchLeaveRequests(employeeId);
  }, [employeeId]);

  // Submit leave request
  const handleSubmit = async (data) => {
    try {
      await submitLeaveRequest({
        employee_id: data.employeeId,
        leave_type_id: data.leaveTypeId,
        start_date: data.startDate,
        end_date: data.endDate,
        reason: data.reason,
        is_half_day_start: data.isHalfDayStart,
      });
    } catch (error) {
      console.error(error);
    }
  };

  // Approve request
  const handleApprove = async (requestId, userId) => {
    try {
      await updateLeaveRequestStatus(requestId, 'Approved', userId);
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div>
      {/* Leave types */}
      <div>
        {types.map(type => <div key={type.id}>{type.name}</div>)}
      </div>

      {/* Leave requests */}
      <div>
        {requests.map(req => <div key={req.id}>{req.reason}</div>)}
      </div>
    </div>
  );
}
```

## Common Patterns

### Pattern 1: Fetch on Mount

```typescript
const { items, fetchData } = useStore();

useEffect(() => {
  fetchData();
}, [fetchData]);
```

### Pattern 2: Loading State

```typescript
const { loading, error, items } = useStore();

if (loading) return <LoadingSpinner />;
if (error) return <ErrorAlert message={error} />;
if (!items.length) return <EmptyState />;

return <DataList items={items} />;
```

### Pattern 3: Create with Error Handling

```typescript
const { createItem } = useStore();

const handleCreate = async (data) => {
  try {
    await createItem(data);
    toast.success('Created successfully');
  } catch (error) {
    toast.error(error.message);
  }
};
```

### Pattern 4: Update with Optimistic UI

```typescript
const { updateItem } = useStore();

const handleUpdate = async (id, updates) => {
  try {
    // Store updates immediately
    await updateItem(id, updates);
  } catch (error) {
    // Store reverts on error
    toast.error(error.message);
  }
};
```

### Pattern 5: Delete with Confirmation

```typescript
const { deleteItem } = useStore();

const handleDelete = async (id) => {
  if (!confirm('Are you sure?')) return;

  try {
    await deleteItem(id);
    toast.success('Deleted successfully');
  } catch (error) {
    toast.error(error.message);
  }
};
```

### Pattern 6: Reset on Logout

```typescript
const { reset: resetEmployees } = useEmployeesStore();
const { reset: resetLeave } = useLeaveStore();
const { reset: resetDepartments } = useDepartmentsStore();

const handleLogout = async () => {
  await signOut();
  resetEmployees();
  resetLeave();
  resetDepartments();
  // Clear all stores
};
```

## Error Messages

### Authentication Errors

```
"You must be logged in to perform this action"
```

**Solution:** Ensure user is authenticated before accessing protected pages.

### Tenant Errors

```
"User is not associated with a tenant"
```

**Solution:** Verify user has been assigned to a tenant in `tenant_users` table.

### Duplicate Errors

```
"An employee with this email already exists in your organization"
"A department with this name already exists"
"A role with this name already exists"
```

**Solution:** These are validation errors - inform user to use different value.

### Permission Errors

```
"You do not have permission to perform this action"
```

**Solution:** Check user's role and permissions within tenant.

## Store State Structure

Every store follows this pattern:

```typescript
{
  items: T[],           // Array of data items
  loading: boolean,     // Is operation in progress?
  error: string | null, // Error message if any
  initialized: boolean, // Has data been loaded once?
}
```

## TypeScript Types

### Employee

```typescript
interface Employee {
  id: string;
  name: string;
  email: string;
  department: string;
  role: string;
  status: 'Active' | 'On Leave' | 'Terminated';
  start_date: string;
  employee_code?: string;
  address?: string;
  date_of_birth?: string;
  tenant_id?: string;
  created_at?: string;
  updated_at?: string;
}
```

### Department

```typescript
interface Department {
  id: string;
  name: string;
  tenant_id?: string;
  created_at?: string;
  updated_at?: string;
}
```

### Role

```typescript
interface Role {
  id: string;
  name: string;
  tenant_id?: string;
  created_at?: string;
  updated_at?: string;
}
```

### LeaveType

```typescript
interface LeaveType {
  id: string;
  name: string;
  description: string | null;
  default_days: number;
  requires_approval: boolean;
  is_active: boolean;
  is_paid: boolean;
  tenant_id?: string;
  created_at?: string;
  updated_at?: string;
}
```

### LeaveRequest

```typescript
interface LeaveRequest {
  id: string;
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
  document_url: string | null;
  approved_by: string | null;
  approved_at: string | null;
  is_half_day_start?: boolean;
  is_half_day_end?: boolean;
  half_day_period_start?: '1st half' | '2nd half' | null;
  half_day_period_end?: '1st half' | '2nd half' | null;
  total_days?: number;
  tenant_id?: string;
  created_at?: string;
  updated_at?: string;
  leave_type: {
    name: string;
  };
}
```

## Best Practices Checklist

- [ ] Always call `fetch` methods on component mount
- [ ] Handle `loading` states in UI
- [ ] Display `error` messages to users
- [ ] Use try-catch blocks for create/update/delete operations
- [ ] Reset stores on logout
- [ ] Don't call Supabase directly from components
- [ ] Use TypeScript types for type safety
- [ ] Test error scenarios (not authenticated, no tenant)
- [ ] Implement optimistic UI updates
- [ ] Show confirmation dialogs for destructive actions

## Migration Checklist

When migrating a component to use stores:

- [ ] Replace `import { supabase }` with store imports
- [ ] Replace direct `.from()` calls with store methods
- [ ] Add `useEffect` to fetch data on mount
- [ ] Update state management to use store state
- [ ] Remove local loading/error state (use store's)
- [ ] Update create/update/delete handlers to use store methods
- [ ] Test all CRUD operations
- [ ] Verify tenant isolation works
- [ ] Check authentication requirement

## Performance Tips

1. **Selective Fetching:** Only fetch data you need
2. **Caching:** Stores cache automatically - no need to refetch unnecessarily
3. **Optimistic Updates:** UI updates immediately, errors revert
4. **Pagination:** For large datasets, implement pagination
5. **Lazy Loading:** Fetch data only when component mounts
6. **Debouncing:** Debounce search/filter operations

## Debugging

### Check Store State

```typescript
const store = useEmployeesStore();
console.log('Store state:', store);
```

### Check Authentication

```typescript
import { validateAuth } from '../stores/utils/storeUtils';

const auth = await validateAuth();
console.log('Auth:', auth);
```

### Check Persistence

```typescript
// Clear store cache
localStorage.removeItem('employees-storage');
localStorage.removeItem('leave-storage');
```

### Enable Zustand DevTools

```typescript
import { devtools } from 'zustand/middleware';

export const useStore = create(
  devtools(
    persist(/* ... */),
    { name: 'MyStore' }
  )
);
```

## Support

For issues or questions:

1. Check this quick reference
2. Review full documentation: `ZUSTAND_STORE_ARCHITECTURE.md`
3. Inspect store state with console.log
4. Verify authentication and tenant assignment
5. Check browser console for errors

## Summary

**Key Takeaways:**

✅ All database operations go through stores
✅ Stores handle authentication and tenant isolation automatically
✅ Use stores for better state management and UX
✅ Follow the patterns shown in this guide
✅ Always handle loading and error states
✅ Reset stores on logout

The Zustand store architecture provides a secure, type-safe, and user-friendly way to manage application data with built-in persistence and multi-tenancy support.
