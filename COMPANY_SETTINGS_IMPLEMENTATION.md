# Company Settings Implementation

## Overview
This document describes the complete implementation of the company settings feature, which includes database storage, state management, and a comprehensive UI for managing company-wide configuration.

## Implementation Summary

### 1. Database Schema

**Table: `company_settings`**

A new Supabase table has been created to store comprehensive company settings for each tenant.

**Location:** `.bolt/company_settings_migration.sql`

**Key Columns:**
- Company Information: `company_name`, `legal_name`, `tax_id`, `registration_number`
- Address: `address` (JSONB with street, city, state, postalCode, country)
- Contact: `phone`, `email`, `website`
- Pay Period Settings: `pay_period_type`, `pay_period_start_day`, `pay_period_end_day`, `payment_day`
- Bank Details: `bank_name`, `account_number`, `routing_number`, `account_type`
- Approval Workflow: `require_approval_for_payroll`, `approval_levels`, `approver_roles` (JSONB array)
- Department Structure: `department_structure` (JSONB array)
- Tenant Isolation: `tenant_id` (FK to tenants table)

**Security Features:**
- Row Level Security (RLS) enabled
- Users can view their tenant's settings
- Only tenant admins can insert/update settings
- Unique constraint ensures one settings record per tenant
- Automatic `updated_at` timestamp trigger

### 2. State Management

**File:** `src/stores/settingsStore.ts`

**New Type Definitions:**
```typescript
export interface CompanySettings {
  id?: string;
  tenant_id?: string;
  company_name: string;
  legal_name: string;
  tax_id: string;
  registration_number: string;
  address: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  phone: string;
  email: string;
  website: string;
  pay_period_type: 'weekly' | 'biweekly' | 'semimonthly' | 'monthly';
  pay_period_start_day: string;
  pay_period_end_day: string;
  payment_day: string;
  bank_name: string;
  account_number: string;
  routing_number: string;
  account_type: 'checking' | 'savings' | 'business';
  require_approval_for_payroll: boolean;
  approval_levels: number;
  approver_roles: string[];
  department_structure: Array<{
    id: string;
    name: string;
    costCenter: string;
  }>;
  created_at?: string;
  updated_at?: string;
}
```

**New Store Methods:**
- `fetchCompanySettings()`: Loads company settings from database
- `saveCompanySettings()`: Creates or updates company settings
- `updateCompanySettings()`: Updates specific fields

**State Properties:**
- `companySettings`: Stores the current company settings
- `loading`: Loading state for async operations
- `error`: Error messages from failed operations

### 3. Component Enhancement

**File:** `src/components/dashboard/settings/CompanySettings.tsx`

**Key Features:**

1. **Data Loading:**
   - Automatically fetches company settings on mount
   - Populates form with existing data
   - Shows loading spinner while fetching

2. **Form Management:**
   - Comprehensive form with 8 sections:
     - Company Information
     - Company Address
     - Pay Period Settings
     - Bank Account Details
     - Approval Workflow
     - Statutory Elements (PF, ESI, PT, TDS)
     - Department Structure
   - Real-time form validation
   - Error display for invalid fields

3. **Data Persistence:**
   - Saves to Supabase via settingsStore
   - Handles both create and update operations
   - Shows success/error toasts
   - Properly formats data before saving

4. **User Experience:**
   - Loading states with spinner
   - Error messages displayed inline
   - Validation feedback
   - Toast notifications for success/error
   - Disabled submit button during save

5. **Department Management:**
   - Add new departments with cost centers
   - Remove existing departments
   - Dynamic department list

### 4. Data Flow

```
User Interface (CompanySettings.tsx)
        ↓
   Validation
        ↓
State Management (settingsStore)
        ↓
  Supabase Client
        ↓
Database (company_settings table)
        ↓
Row Level Security Check
        ↓
   Store or Retrieve Data
```

### 5. Key Features Implemented

1. **Tenant Isolation:**
   - All settings are scoped to the current tenant
   - RLS policies ensure data security
   - Users can only access their tenant's data

2. **Comprehensive Validation:**
   - Required field validation (company name, tax ID)
   - Email format validation
   - Phone number format validation
   - Bank account number validation (8-17 digits)
   - Routing number validation (9 digits)

3. **Flexible Data Storage:**
   - Address stored as JSONB for flexibility
   - Department structure stored as JSONB array
   - Approver roles stored as JSONB array
   - Supports international addresses

4. **Error Handling:**
   - Graceful error handling throughout
   - User-friendly error messages
   - Automatic retry on auth errors
   - Network error handling

5. **Default Values:**
   - Sensible defaults for all fields
   - Pre-populated department structure
   - Default pay period settings
   - Default approval workflow

### 6. Integration Points

**With Existing Features:**
- Uses existing `validateAuth()` utility
- Integrates with tenant context
- Uses existing error handling patterns
- Follows established store architecture

**With Statutory Settings:**
- Saves statutory elements alongside company settings
- Maintains existing statutory functionality
- No breaking changes to statutory features

## Usage

### For Users:

1. Navigate to Settings → Company Settings
2. Fill in company information
3. Configure pay period settings
4. Add bank account details (optional)
5. Set up approval workflow
6. Select applicable statutory elements
7. Manage department structure
8. Click "Save Settings"

### For Developers:

**Accessing Company Settings:**
```typescript
import { useSettingsStore } from '../stores/settingsStore';

function MyComponent() {
  const { companySettings, fetchCompanySettings } = useSettingsStore();

  useEffect(() => {
    fetchCompanySettings();
  }, []);

  // Access settings
  const companyName = companySettings?.company_name;
}
```

**Updating Settings:**
```typescript
const { updateCompanySettings } = useSettingsStore();

await updateCompanySettings({
  company_name: 'New Company Name'
});
```

## Database Migration

**IMPORTANT:** The database migration needs to be applied to your Supabase instance.

**Steps to Apply:**

1. **Via Supabase Dashboard:**
   - Open Supabase Dashboard
   - Go to SQL Editor
   - Copy content from `.bolt/company_settings_migration.sql`
   - Execute the SQL

2. **Via Supabase CLI:**
   ```bash
   supabase migration new create_company_settings
   # Copy the content from .bolt/company_settings_migration.sql
   supabase db push
   ```

## Testing Checklist

- [ ] Can create new company settings
- [ ] Can load existing company settings
- [ ] Can update company settings
- [ ] Form validation works correctly
- [ ] Tenant isolation works (users only see their tenant's settings)
- [ ] RLS policies prevent unauthorized access
- [ ] Loading states display correctly
- [ ] Error messages display correctly
- [ ] Success toast appears after save
- [ ] Department management works (add/remove)
- [ ] Statutory elements save correctly
- [ ] Form populates with existing data on load

## Security Considerations

1. **Row Level Security:** All database operations are protected by RLS policies
2. **Tenant Isolation:** Users can only access their tenant's data
3. **Role-Based Access:** Only tenant admins can modify settings
4. **Bank Account Data:** Consider encrypting sensitive bank information at the application level
5. **Input Validation:** All inputs are validated before saving

## Future Enhancements

Potential improvements for future versions:
- Bank account encryption
- Settings version history/audit log
- Settings import/export
- Multi-language support for addresses
- Advanced approval workflow configuration
- Settings templates for quick setup
- Settings backup and restore

## Files Modified

1. `src/stores/settingsStore.ts` - Added company settings state management
2. `src/components/dashboard/settings/CompanySettings.tsx` - Enhanced with database integration
3. `.bolt/company_settings_migration.sql` - New database migration file
4. `COMPANY_SETTINGS_IMPLEMENTATION.md` - This documentation file

## Backward Compatibility

- No breaking changes to existing functionality
- Statutory settings continue to work as before
- Existing store methods remain unchanged
- Component props interface maintained for compatibility
