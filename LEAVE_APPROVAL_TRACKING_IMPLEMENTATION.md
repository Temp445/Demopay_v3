# Leave Approval Tracking Enhancement Implementation

## Overview
This document details the implementation of the enhanced leave approval tracking system that creates detailed daily records for each leave request, including holidays and weekoffs based on leave type policies.

## Database Changes

### New Table: `leave_approvals`

A new table has been created to store individual daily leave records for comprehensive tracking.

**Table Structure:**
```sql
CREATE TABLE leave_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_request_id uuid NOT NULL REFERENCES leave_requests(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_date date NOT NULL,
  leave_type_id uuid NOT NULL REFERENCES leave_types(id),
  is_holiday boolean DEFAULT false,
  is_weekoff boolean DEFAULT false,
  is_within_leave_period boolean DEFAULT true,
  policy_type text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  tenant_id uuid
);
```

**Field Descriptions:**
- `id`: Unique identifier for each approval record
- `leave_request_id`: References the parent leave request
- `employee_id`: The employee taking the leave
- `leave_date`: Specific date of the leave (one record per day)
- `leave_type_id`: Type of leave being taken
- `is_holiday`: Whether this date is a holiday
- `is_weekoff`: Whether this date is a weekoff
- `is_within_leave_period`: Whether the date is within the original start_date to end_date range
- `policy_type`: The policy that triggered this record (e.g., 'primary', 'before_leave_holiday', 'after_leave_week_off', 'in_between_leave_holiday')
- `tenant_id`: Tenant isolation

**Indexes Created:**
- `idx_leave_approvals_request_id` - Fast lookups by leave request
- `idx_leave_approvals_employee_id` - Employee-specific queries
- `idx_leave_approvals_leave_date` - Date range queries
- `idx_leave_approvals_tenant_id` - Tenant filtering
- `idx_leave_approvals_employee_date` - Composite index for uniqueness and performance

**Row Level Security:**
- RLS enabled with policies for authenticated users
- Policies allow read, insert, update, and delete operations for tenant users

## Code Implementation

### 1. New Utility Module: `leaveApprovalTracking.ts`

Created a new utility module at `src/lib/leaveApprovalTracking.ts` with two main functions:

#### `processLeaveApproval(leaveRequestId: string)`

This function is called when a leave request is approved. It:

1. **Fetches leave request details** including leave type policies
2. **Queries holidays** from the `holidays` table
3. **Queries weekoffs** using the `get_weekly_off_list` RPC function
4. **Creates daily records** for the following scenarios:

**Primary Leave Days:**
- One record per day from `start_date` to `end_date` (inclusive)
- Policy type: `'primary'`

**Before Leave Period:**
- If `before_leave_holiday` is enabled:
  - Checks for consecutive holidays immediately before `start_date`
  - Creates records for all consecutive holidays found
  - Policy type: `'before_leave_holiday'`
  - Stops when a non-holiday is encountered

- If `before_leave_week_off` is enabled:
  - Checks for consecutive weekoffs immediately before `start_date`
  - Creates records for all consecutive weekoffs found
  - Policy type: `'before_leave_week_off'`
  - Stops when a non-weekoff is encountered

**After Leave Period:**
- If `after_leave_holiday` is enabled:
  - Checks for consecutive holidays immediately after `end_date`
  - Creates records for all consecutive holidays found
  - Policy type: `'after_leave_holiday'`
  - Stops when a non-holiday is encountered

- If `after_leave_week_off` is enabled:
  - Checks for consecutive weekoffs immediately after `end_date`
  - Creates records for all consecutive weekoffs found
  - Policy type: `'after_leave_week_off'`
  - Stops when a non-weekoff is encountered

**Within Leave Period:**
- If `in_between_leave_holiday` is enabled:
  - Includes holiday dates that fall within the leave period
  - Policy type: `'in_between_leave_holiday'`

- If `in_between_leave_week_off` is enabled:
  - Includes weekoff dates that fall within the leave period
  - Policy type: `'in_between_leave_week_off'`

**Safety Limits:**
- Maximum of 7 consecutive days checked before/after to prevent infinite loops
- Extended date range (±7 days) fetched for holidays/weekoffs to ensure coverage

#### `revokeLeaveApproval(leaveRequestId: string)`

This function is called when a leave approval is revoked. It:
- Deletes all `leave_approvals` records associated with the leave request
- Ensures clean state when approval status changes

### 2. Modified Component: `LeaveList.tsx`

Enhanced the leave approval functionality in the LeaveList component:

**Import Added:**
```typescript
import { processLeaveApproval, revokeLeaveApproval } from '../../../lib/leaveApprovalTracking';
```

**Enhanced `handleStatusUpdate` Function:**
```typescript
const handleStatusUpdate = async (
  requestId: string,
  newStatus: 'Approved' | 'Rejected' | 'Cancelled' | 'Pending',
  currentStatus?: string
) => {
  try {
    const currentRequest = requests.find(r => r.id === requestId);
    const previousStatus = currentRequest?.status;

    // Update the leave request status
    await updateLeaveRequestStatus(requestId, newStatus);

    // Handle leave approval tracking
    if (newStatus === 'Approved' && previousStatus !== 'Approved') {
      // Create daily leave approval records when approving
      await processLeaveApproval(requestId);
    } else if (previousStatus === 'Approved' && newStatus !== 'Approved') {
      // Delete leave approval records when revoking approval
      await revokeLeaveApproval(requestId);
    }

    onRefresh();
  } catch (err) {
    console.error('Failed to update request status:', err);
  }
};
```

**Key Changes:**
1. Detects when status changes TO 'Approved' → calls `processLeaveApproval()`
2. Detects when status changes FROM 'Approved' → calls `revokeLeaveApproval()`
3. Error handling ensures the UI continues to work even if tracking fails
4. All existing functionality preserved (Approve, Reject, Revoke, Cancel buttons)

## Usage Examples

### Example 1: Basic Leave Approval

**Scenario:**
- Employee requests leave from Jan 15-17, 2024
- Leave type has no special policies enabled
- Jan 16 is a holiday

**Result in `leave_approvals` table:**
```
| leave_date | is_holiday | is_weekoff | is_within_leave_period | policy_type |
|------------|------------|------------|------------------------|-------------|
| 2024-01-15 | false      | false      | true                   | primary     |
| 2024-01-16 | true       | false      | true                   | primary     |
| 2024-01-17 | false      | false      | true                   | primary     |
```

### Example 2: Leave with Before Holiday Policy

**Scenario:**
- Employee requests leave from Jan 15-17, 2024
- Leave type has `before_leave_holiday = true`
- Jan 13-14 are consecutive holidays before the leave

**Result in `leave_approvals` table:**
```
| leave_date | is_holiday | is_weekoff | is_within_leave_period | policy_type           |
|------------|------------|------------|------------------------|-----------------------|
| 2024-01-13 | true       | false      | false                  | before_leave_holiday  |
| 2024-01-14 | true       | false      | false                  | before_leave_holiday  |
| 2024-01-15 | false      | false      | true                   | primary               |
| 2024-01-16 | false      | false      | true                   | primary               |
| 2024-01-17 | false      | false      | true                   | primary               |
```

### Example 3: Leave with After Weekoff Policy

**Scenario:**
- Employee requests leave from Jan 15-17, 2024 (Mon-Wed)
- Leave type has `after_leave_week_off = true`
- Jan 18-19 (Thu-Fri) are not weekoffs
- Jan 20-21 (Sat-Sun) are weekoffs

**Result in `leave_approvals` table:**
```
| leave_date | is_holiday | is_weekoff | is_within_leave_period | policy_type          |
|------------|------------|------------|------------------------|----------------------|
| 2024-01-15 | false      | false      | true                   | primary              |
| 2024-01-16 | false      | false      | true                   | primary              |
| 2024-01-17 | false      | false      | true                   | primary              |
| 2024-01-20 | false      | true       | false                  | after_leave_week_off |
| 2024-01-21 | false      | true       | false                  | after_leave_week_off |
```
Note: Jan 18-19 are NOT included because they are not weekoffs (stops at first non-weekoff).

### Example 4: Leave with In Between Holiday Policy

**Scenario:**
- Employee requests leave from Jan 15-20, 2024
- Leave type has `in_between_leave_holiday = true`
- Jan 17 and Jan 19 are holidays within the period

**Result in `leave_approvals` table:**
```
| leave_date | is_holiday | is_weekoff | is_within_leave_period | policy_type               |
|------------|------------|------------|------------------------|---------------------------|
| 2024-01-15 | false      | false      | true                   | primary                   |
| 2024-01-16 | false      | false      | true                   | primary                   |
| 2024-01-17 | true       | false      | true                   | in_between_leave_holiday  |
| 2024-01-18 | false      | false      | true                   | primary                   |
| 2024-01-19 | true       | false      | true                   | in_between_leave_holiday  |
| 2024-01-20 | false      | false      | true                   | primary                   |
```

### Example 5: Complex Leave with Multiple Policies

**Scenario:**
- Employee requests leave from Jan 15-17, 2024 (Mon-Wed)
- Leave type has ALL policies enabled
- Jan 14 (Sun) is a weekoff before leave
- Jan 16 (Tue) is a holiday within leave
- Jan 18 (Thu) is not a weekoff/holiday
- Jan 20-21 (Sat-Sun) are weekoffs after leave

**Result in `leave_approvals` table:**
```
| leave_date | is_holiday | is_weekoff | is_within_leave_period | policy_type              |
|------------|------------|------------|------------------------|--------------------------|
| 2024-01-14 | false      | true       | false                  | before_leave_week_off    |
| 2024-01-15 | false      | false      | true                   | primary                  |
| 2024-01-16 | true       | false      | true                   | in_between_leave_holiday |
| 2024-01-17 | false      | false      | true                   | primary                  |
```
Note: After leave weekoffs (Jan 20-21) are NOT included because Jan 18 is not a weekoff (stops at first non-weekoff after end_date).

## Data Sources

### Holidays
- **Table:** `holidays`
- **Query:** Filtered by `tenant_id`, `is_active = true`, and date range
- **Fields Used:** `date`

### Weekoffs
- **RPC Function:** `get_weekly_off_list`
- **Parameters:** `p_start_date`, `p_end_date`, `p_tenant_id`
- **Returns:** List of weekoff dates

### Leave Type Policies
- **Table:** `leave_types`
- **Policy Fields:**
  - `before_leave_holiday` (boolean)
  - `before_leave_week_off` (boolean)
  - `after_leave_holiday` (boolean)
  - `after_leave_week_off` (boolean)
  - `in_between_leave_holiday` (boolean)
  - `in_between_leave_week_off` (boolean)

## Benefits

1. **Detailed Tracking:** Each day of leave is tracked individually
2. **Policy Compliance:** Automatically applies leave type policies
3. **Audit Trail:** Complete history of which days were included and why
4. **Flexible Reporting:** Easy to generate reports on leave patterns
5. **Calendar Integration:** Can be used to populate calendars with leave days
6. **Holiday/Weekoff Visibility:** Clear indication of which days are holidays/weekoffs
7. **Reversible:** When approval is revoked, all records are automatically cleaned up

## Query Examples

### Get all leave days for an employee in a date range:
```sql
SELECT
  la.leave_date,
  lt.name as leave_type,
  la.is_holiday,
  la.is_weekoff,
  la.policy_type
FROM leave_approvals la
JOIN leave_types lt ON la.leave_type_id = lt.id
WHERE la.employee_id = 'employee-uuid'
  AND la.leave_date BETWEEN '2024-01-01' AND '2024-01-31'
ORDER BY la.leave_date;
```

### Count leave days by policy type:
```sql
SELECT
  policy_type,
  COUNT(*) as day_count
FROM leave_approvals
WHERE leave_request_id = 'request-uuid'
GROUP BY policy_type;
```

### Find employees on leave on a specific date:
```sql
SELECT DISTINCT
  e.id,
  e.name,
  lt.name as leave_type
FROM leave_approvals la
JOIN employees e ON la.employee_id = e.id
JOIN leave_types lt ON la.leave_type_id = lt.id
WHERE la.leave_date = '2024-01-15'
  AND la.tenant_id = 'tenant-uuid';
```

### Get monthly leave summary for an employee:
```sql
SELECT
  DATE_TRUNC('month', leave_date) as month,
  COUNT(*) as total_days,
  COUNT(*) FILTER (WHERE is_holiday) as holiday_days,
  COUNT(*) FILTER (WHERE is_weekoff) as weekoff_days,
  COUNT(*) FILTER (WHERE is_within_leave_period) as primary_leave_days
FROM leave_approvals
WHERE employee_id = 'employee-uuid'
  AND leave_date BETWEEN '2024-01-01' AND '2024-12-31'
GROUP BY DATE_TRUNC('month', leave_date)
ORDER BY month;
```

## Testing Recommendations

1. **Test Basic Approval:**
   - Approve a simple leave request (no holidays/weekoffs)
   - Verify records created for each day

2. **Test Before Policies:**
   - Create leave with holidays before start_date
   - Enable `before_leave_holiday` policy
   - Verify consecutive holidays are included

3. **Test After Policies:**
   - Create leave with weekoffs after end_date
   - Enable `after_leave_week_off` policy
   - Verify consecutive weekoffs are included

4. **Test In Between Policies:**
   - Create leave with holidays/weekoffs in the middle
   - Enable `in_between_leave_holiday` and `in_between_leave_week_off`
   - Verify they are included

5. **Test Revocation:**
   - Approve a leave
   - Verify records are created
   - Revoke the approval
   - Verify all records are deleted

6. **Test Edge Cases:**
   - Leave request spanning month boundaries
   - Leave request on a single day (half-day)
   - Multiple consecutive leaves
   - Leave with all policies enabled

## Migration Files

1. **`create_leave_approvals_table_v2.sql`** - Creates the leave_approvals table with all necessary fields, indexes, and RLS policies

## Constraints & Considerations

1. **Preserved Functionality:** All existing leave approval features remain unchanged
2. **Non-Breaking:** If tracking fails, leave approval still succeeds
3. **Performance:** Indexed for efficient querying
4. **Safety Limits:** Maximum 7 days checked before/after to prevent infinite loops
5. **Tenant Isolation:** All queries are tenant-aware
6. **Cascade Deletes:** When a leave_request is deleted, all associated approval records are automatically deleted

## Future Enhancements

Potential future improvements could include:
1. Analytics dashboard showing leave patterns
2. Calendar view with color-coded leave types
3. Conflict detection (overlapping leaves)
4. Leave balance integration
5. Automated notifications for leave days
6. Export functionality for leave calendars
