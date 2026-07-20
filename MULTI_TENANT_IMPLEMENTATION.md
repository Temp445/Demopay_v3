# Multi-Tenant Architecture Implementation

## Overview

This document describes the comprehensive multi-tenant architecture implementation for the HR Management System. The application now supports multiple organizations (tenants) with complete data isolation and security.

## Architecture Components

### 1. Database Schema

#### Core Tenant Tables

**`tenants`**
- Stores organization/company information
- Fields: `id`, `name`, `subdomain`, `status`, `settings`, `created_at`, `updated_at`
- Status values: Active, Suspended, Inactive

**`tenant_users`**
- Junction table linking users to tenants
- Supports multi-tenant users (users can belong to multiple organizations)
- Fields: `id`, `tenant_id`, `user_id`, `role`, `is_primary`, `created_at`, `updated_at`
- Roles: tenant_admin, manager, user
- `is_primary` flag indicates user's default tenant

#### Tenant-Scoped Tables

All business data tables now include `tenant_id` column:
- `departments`
- `roles`
- `employees`
- `employee_face_data`
- `attendance_logs`
- `attendance_settings`
- `leave_types`
- `leave_balances`
- `leave_requests`
- `shifts` and related shift tables
- `payroll` and related payroll tables
- `salary_structures` and components
- `user_notifications`

### 2. Row Level Security (RLS)

All tables have been updated with tenant-aware RLS policies:

**Policy Pattern:**
```sql
-- SELECT policies allow users to view data from their tenants
USING (tenant_id IN (SELECT get_user_tenant_ids()))

-- INSERT policies ensure data is created in user's primary tenant
WITH CHECK (tenant_id = get_user_tenant_id())
```

**Helper Functions:**
- `get_user_tenant_id()` - Returns user's primary tenant ID
- `user_belongs_to_tenant(p_tenant_id)` - Checks tenant membership
- `get_user_tenant_ids()` - Returns all tenant IDs for user

### 3. Application Layer

#### TypeScript Interfaces

All domain interfaces updated with `tenant_id`:
```typescript
export interface Employee {
  id: string;
  name: string;
  // ... other fields
  tenant_id?: string;
  created_at?: string;
  updated_at?: string;
}
```

#### Service Layer Updates

All service functions automatically include tenant context:

**Example Pattern:**
```typescript
export async function createEmployee(employee, user_id) {
  // Get user's tenant_id
  const { data: tenantData } = await supabase.rpc('get_user_tenant_id');
  const tenant_id = tenantData;

  if (!tenant_id) {
    throw new Error('User is not associated with a tenant');
  }

  // Include tenant_id in insert
  const { data, error } = await supabase
    .from('employees')
    .insert([{ ...employee, tenant_id }])
    .select()
    .single();

  // ... error handling
}
```

#### Tenant Context Management

**TenantContext** provides:
- `currentTenant` - Active tenant object
- `userTenants` - All tenants user belongs to
- `switchTenant(tenantId)` - Switch active tenant
- `refreshTenants()` - Reload tenant data

### 4. User Interface Components

#### TenantSwitcher Component
- Dropdown in dashboard header
- Shows all user's tenants
- Allows switching between organizations
- Displays current tenant name and user's role

#### TenantSettings Component
- Organization details management
- User listing for current tenant
- Status management
- Located in Settings > Organization tab

## Migration Files

Three sequential migrations implement multi-tenancy:

1. **`20251027123113_create_tenants.sql`**
   - Creates `tenants` and `tenant_users` tables
   - Implements RLS policies
   - Creates helper functions
   - Updates `handle_new_user()` to create default tenant

2. **`20251027123114_add_tenant_id_to_tables.sql`**
   - Adds `tenant_id` column to all business tables
   - Creates indexes for performance
   - Adds foreign key constraints

3. **`20251027123115_implement_tenant_rls.sql`**
   - Replaces existing RLS policies with tenant-aware versions
   - Implements consistent security model across all tables

## User Onboarding Flow

1. New user registers
2. `handle_new_user()` trigger executes:
   - Creates profile record
   - Creates default tenant (organization)
   - Links user to tenant as `tenant_admin`
   - Sets tenant as primary

3. User logs in and sees their organization data

## Multi-Tenant User Support

Users can belong to multiple tenants:
- Each tenant membership has a role (tenant_admin, manager, user)
- One tenant is marked as primary (default)
- Users can switch between tenants via TenantSwitcher
- Switching reloads application with new tenant context

## Data Isolation Guarantees

1. **Database Level:**
   - RLS policies enforce tenant_id filtering on all queries
   - Foreign keys include tenant context
   - Indexes optimize tenant-scoped queries

2. **Application Level:**
   - All service functions include tenant_id
   - Context provider manages active tenant
   - Helper functions ensure consistent tenant access

3. **Security:**
   - Users cannot access data from tenants they don't belong to
   - All insert operations include tenant_id
   - Tenant switching requires proper membership

## Best Practices for Development

### Adding New Tables

When adding new business data tables:

1. Include `tenant_id` column:
```sql
CREATE TABLE my_new_table (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- other columns
);

CREATE INDEX idx_my_new_table_tenant_id ON my_new_table(tenant_id);
```

2. Enable RLS and add policies:
```sql
ALTER TABLE my_new_table ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view records in their tenant"
  ON my_new_table FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT get_user_tenant_ids()));

CREATE POLICY "Users can create records in their tenant"
  ON my_new_table FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_user_tenant_id());
```

### Adding Service Functions

Always include tenant context:

```typescript
export async function createRecord(data) {
  // Get tenant_id
  const { data: tenantData } = await supabase.rpc('get_user_tenant_id');
  const tenant_id = tenantData;

  if (!tenant_id) {
    throw new Error('User is not associated with a tenant');
  }

  // Include in insert
  const { data: result, error } = await supabase
    .from('my_table')
    .insert([{ ...data, tenant_id }])
    .select()
    .single();

  // Handle error and return
}
```

## Testing Multi-Tenancy

### Test Scenarios

1. **Data Isolation:**
   - Create two tenants with separate users
   - Create records in each tenant
   - Verify users cannot see other tenant's data

2. **Multi-Tenant Users:**
   - Add user to multiple tenants
   - Switch between tenants
   - Verify correct data appears for each tenant

3. **RLS Enforcement:**
   - Attempt direct SQL queries across tenants
   - Verify RLS blocks unauthorized access

4. **Tenant Switching:**
   - Switch to different tenant
   - Verify UI updates with new tenant data
   - Verify operations use correct tenant context

## Performance Considerations

1. **Indexes:**
   - All `tenant_id` columns are indexed
   - Composite indexes created where needed

2. **Query Patterns:**
   - RLS automatically filters by tenant_id
   - Application queries don't need explicit tenant filtering
   - Helper functions are marked STABLE for caching

3. **Connection Pooling:**
   - Supabase handles connection pooling
   - Each user session maintains tenant context

## Monitoring and Maintenance

### Key Metrics to Monitor

1. Tenant count and growth
2. Users per tenant distribution
3. Query performance by tenant
4. Storage usage per tenant

### Regular Maintenance

1. Review RLS policies when adding tables
2. Verify tenant_id present in all business tables
3. Check for orphaned records without tenant_id
4. Monitor tenant switching patterns

## Migration Path for Existing Data

If you have existing data before multi-tenancy:

1. Create a default tenant
2. Update all existing records to reference default tenant:
```sql
UPDATE employees SET tenant_id = (SELECT id FROM tenants LIMIT 1)
WHERE tenant_id IS NULL;
```
3. Make tenant_id NOT NULL after migration
4. Rebuild indexes

## Troubleshooting

### Common Issues

**Issue:** User sees no data after tenant implementation
- **Solution:** Verify user has tenant_users record with valid tenant_id

**Issue:** Cannot create records
- **Solution:** Check get_user_tenant_id() returns valid tenant

**Issue:** RLS policy errors
- **Solution:** Verify helper functions exist and user is authenticated

**Issue:** Tenant switcher not showing
- **Solution:** Ensure user has multiple tenant memberships

## Future Enhancements

Potential improvements:
1. Tenant-specific branding/theming
2. Tenant usage analytics dashboard
3. Cross-tenant reporting (for super admins)
4. Tenant invitation system
5. Tenant billing and subscription management
6. Tenant-level feature flags
7. Data export per tenant
8. Tenant activity audit logs

## Security Considerations

1. **Always use RLS:** Never bypass RLS policies in application code
2. **Validate tenant membership:** Check user belongs to tenant before operations
3. **Audit tenant access:** Log tenant switching and sensitive operations
4. **Tenant isolation testing:** Regularly test data isolation
5. **Service role usage:** Use service role only for administrative functions

## Conclusion

This multi-tenant implementation provides:
- Complete data isolation between tenants
- Secure, policy-enforced access control
- Flexible multi-tenant user support
- Scalable architecture for growth
- User-friendly tenant management

All existing features remain functional while now being properly scoped to tenants.
