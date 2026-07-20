# Leave Approval Tracking - Quick Reference

## What Was Implemented

Enhanced leave approval system that creates individual daily records for each leave date, including holidays and weekoffs based on leave type policies.

## Key Files Modified/Created

### 1. Database
- **Table Created:** `leave_approvals`
- **Migration File:** `create_leave_approvals_table_v2.sql`

### 2. Code Files
- **Created:** `src/lib/leaveApprovalTracking.ts` - Core tracking logic
- **Modified:** `src/components/dashboard/leave/LeaveList.tsx` - Enhanced approval functionality

## How It Works

### When Approving a Leave:
1. User clicks "Approve" button in LeaveList component
2. Leave request status updates to "Approved"
3. `processLeaveApproval()` automatically creates daily records in `leave_approvals` table

### Records Created:
- **Primary:** One record per day from start_date to end_date
- **Before Leave:** Consecutive holidays/weekoffs immediately before start_date (if policies enabled)
- **After Leave:** Consecutive holidays/weekoffs immediately after end_date (if policies enabled)
- **In Between:** Holidays/weekoffs within leave period (if policies enabled)

### When Revoking a Leave:
1. User clicks "Revoke" button (changes status from Approved to Pending)
2. `revokeLeaveApproval()` deletes all associated daily records

## Leave Type Policies

These boolean flags control what gets included:

| Policy Field | Description |
|--------------|-------------|
| `before_leave_holiday` | Include consecutive holidays before start_date |
| `before_leave_week_off` | Include consecutive weekoffs before start_date |
| `after_leave_holiday` | Include consecutive holidays after end_date |
| `after_leave_week_off` | Include consecutive weekoffs after end_date |
| `in_between_leave_holiday` | Include holidays within leave period |
| `in_between_leave_week_off` | Include weekoffs within leave period |

## Database Schema

```sql
leave_approvals
├── id (uuid, PK)
├── leave_request_id (uuid, FK to leave_requests)
├── employee_id (uuid, FK to employees)
├── leave_date (date) - Individual date
├── leave_type_id (uuid, FK to leave_types)
├── is_holiday (boolean)
├── is_weekoff (boolean)
├── is_within_leave_period (boolean)
├── policy_type (text) - 'primary', 'before_leave_holiday', etc.
├── created_at (timestamptz)
├── updated_at (timestamptz)
└── tenant_id (uuid)
```

## Quick Query Examples

### View all leave days for a request:
```sql
SELECT leave_date, is_holiday, is_weekoff, policy_type
FROM leave_approvals
WHERE leave_request_id = 'your-request-id'
ORDER BY leave_date;
```

### Count days by type:
```sql
SELECT
  COUNT(*) FILTER (WHERE is_within_leave_period) as primary_days,
  COUNT(*) FILTER (WHERE NOT is_within_leave_period AND is_holiday) as extra_holidays,
  COUNT(*) FILTER (WHERE NOT is_within_leave_period AND is_weekoff) as extra_weekoffs
FROM leave_approvals
WHERE leave_request_id = 'your-request-id';
```

### Find who's on leave today:
```sql
SELECT e.name, lt.name as leave_type
FROM leave_approvals la
JOIN employees e ON la.employee_id = e.id
JOIN leave_types lt ON la.leave_type_id = lt.id
WHERE la.leave_date = CURRENT_DATE
  AND la.tenant_id = 'your-tenant-id';
```

## Testing Checklist

- [ ] Approve a basic leave (no policies) → Verify daily records created
- [ ] Enable `before_leave_holiday` → Verify holidays before are included
- [ ] Enable `after_leave_week_off` → Verify weekoffs after are included
- [ ] Enable `in_between_leave_holiday` → Verify holidays during are included
- [ ] Revoke an approved leave → Verify all records deleted
- [ ] Check existing features still work (Reject, Cancel, etc.)

## Important Notes

1. **Non-Breaking:** All existing leave functionality preserved
2. **Automatic:** Tracking happens automatically on approval/revocation
3. **Consecutive Only:** Before/after policies stop at first non-matching day
4. **Safety Limit:** Maximum 7 consecutive days checked to prevent loops
5. **Error Handling:** Leave approval succeeds even if tracking fails
6. **Cascade Delete:** Records auto-delete when leave request is deleted

## Data Sources

- **Holidays:** `holidays` table (filtered by tenant, is_active, date range)
- **Weekoffs:** `get_weekly_off_list()` RPC function
- **Policies:** `leave_types` table (6 boolean policy fields)

## Benefits

✅ Detailed daily tracking for reporting
✅ Automatic policy compliance
✅ Complete audit trail
✅ Easy calendar integration
✅ Flexible querying capabilities
✅ Reversible (auto-cleanup on revoke)

## Need More Details?

See `LEAVE_APPROVAL_TRACKING_IMPLEMENTATION.md` for comprehensive documentation including:
- Detailed flow diagrams
- Multiple usage examples
- Complex scenario handling
- Query examples
- Testing recommendations
