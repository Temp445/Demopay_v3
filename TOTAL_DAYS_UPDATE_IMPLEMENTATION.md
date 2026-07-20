# Total Days Update Implementation

## Overview
This document describes the enhancement made to automatically update the `total_days` field in the `leave_requests` table when a leave request is approved or revoked.

## Problem Statement
Previously, when a leave request was approved, the `total_days` field in the `leave_requests` table was not being updated to reflect the actual number of leave dates created in the `leave_approvals` table.

## Solution
Modified the leave approval tracking system to automatically calculate and update the `total_days` field based on the count of records created in the `leave_approvals` table.

## Changes Made

### 1. Modified `processLeaveApproval` Function
**File:** `src/lib/leaveApprovalTracking.ts`

**Enhancement:**
After inserting all leave approval records, the function now:
1. Counts the total number of approval records created
2. Updates the `leave_requests.total_days` field with this count

**Code Added:**
```typescript
// Update the total_days field in leave_requests table
const totalDays = approvalRecords.length;
const { error: updateError } = await supabase
  .from('leave_requests')
  .update({ total_days: totalDays })
  .eq('id', leaveRequestId)
  .eq('tenant_id', tenantId);

if (updateError) {
  console.error('Failed to update total_days in leave_requests:', updateError);
  throw updateError;
}
```

### 2. Modified `revokeLeaveApproval` Function
**File:** `src/lib/leaveApprovalTracking.ts`

**Enhancement:**
After deleting all leave approval records, the function now:
1. Resets the `leave_requests.total_days` field to 0

**Code Added:**
```typescript
// Reset the total_days field in leave_requests table
const { error: updateError } = await supabase
  .from('leave_requests')
  .update({ total_days: 0 })
  .eq('id', leaveRequestId)
  .eq('tenant_id', tenantId);

if (updateError) {
  console.error('Failed to reset total_days in leave_requests:', updateError);
  throw updateError;
}
```

## How It Works

### Approval Flow:
1. User clicks "Approve" button in LeaveList.tsx
2. `handleStatusUpdate` is called with status "Approved"
3. `updateLeaveRequestStatus` updates the status to "Approved"
4. `processLeaveApproval` is called:
   - Creates daily records in `leave_approvals` table
   - Counts total records created
   - **Updates `leave_requests.total_days` with the count**
5. UI refreshes to show updated information

### Revocation Flow:
1. User clicks "Revoke" button (changes status from Approved to Pending)
2. `handleStatusUpdate` is called with status "Pending"
3. `updateLeaveRequestStatus` updates the status to "Pending"
4. `revokeLeaveApproval` is called:
   - Deletes all records from `leave_approvals` table
   - **Resets `leave_requests.total_days` to 0**
5. UI refreshes to show updated information

## Total Days Calculation

The `total_days` value represents the **actual count** of leave dates created, which may include:
- Primary leave days (from start_date to end_date)
- Additional holidays before/after leave (if policies enabled)
- Additional weekoffs before/after leave (if policies enabled)
- Holidays within leave period (if policy enabled)
- Weekoffs within leave period (if policy enabled)

## Example Scenarios

### Example 1: Basic Leave (3 days)
**Request:** Jan 15-17, 2024 (no special policies)
**Result:**
- 3 records created in `leave_approvals`
- `total_days` updated to **3**

### Example 2: Leave with Before Holiday Policy
**Request:** Jan 15-17, 2024 with `before_leave_holiday = true`
**Context:** Jan 13-14 are holidays
**Result:**
- 5 records created (2 holidays + 3 primary days)
- `total_days` updated to **5**

### Example 3: Leave with After Weekoff Policy
**Request:** Jan 15-17, 2024 (Mon-Wed) with `after_leave_week_off = true`
**Context:** Jan 20-21 (Sat-Sun) are weekoffs
**Result:**
- 5 records created (3 primary days + 2 weekoffs)
- `total_days` updated to **5**

### Example 4: Complex Leave with Multiple Policies
**Request:** Jan 15-17, 2024 with all policies enabled
**Context:**
- Jan 14 is weekoff before
- Jan 16 is holiday within
- Jan 20-21 are weekoffs after (but Jan 18 is not)
**Result:**
- 4 records created (1 before weekoff + 3 primary days including 1 holiday)
- `total_days` updated to **4**
- Note: After weekoffs not included because Jan 18 breaks the consecutive chain

## Benefits

1. **Accurate Count:** Total days reflects the actual number of leave dates
2. **Automatic:** No manual calculation required
3. **Policy-Aware:** Includes all days based on leave type policies
4. **Consistent:** Always in sync with leave_approvals table
5. **Auditable:** Can verify total_days by counting leave_approvals records

## Verification Query

To verify that total_days matches the actual count:

```sql
SELECT
  lr.id,
  lr.total_days,
  COUNT(la.id) as actual_count,
  lr.total_days = COUNT(la.id) as is_consistent
FROM leave_requests lr
LEFT JOIN leave_approvals la ON lr.id = la.leave_request_id
WHERE lr.status = 'Approved'
GROUP BY lr.id, lr.total_days;
```

Expected result: `is_consistent` should be `true` for all approved leaves.

## Edge Cases Handled

1. **No Records Created:** If no approval records are created (shouldn't happen), total_days is not updated
2. **Error During Insert:** If insertion fails, update also fails (transaction-like behavior)
3. **Error During Update:** Logged and thrown to ensure visibility
4. **Revoked Leave:** total_days reset to 0, can be recalculated if re-approved
5. **Tenant Isolation:** All updates include tenant_id filter for security

## Testing Recommendations

### Test Case 1: Basic Approval
1. Create a simple leave request (3 days, no policies)
2. Approve the leave
3. Verify `total_days` = 3
4. Verify 3 records in `leave_approvals`

### Test Case 2: Approval with Policies
1. Create a leave request with policies enabled
2. Ensure holidays/weekoffs exist before/after/within
3. Approve the leave
4. Verify `total_days` matches count in `leave_approvals`

### Test Case 3: Revocation
1. Approve a leave (verify total_days is set)
2. Revoke the leave
3. Verify `total_days` = 0
4. Verify no records in `leave_approvals`

### Test Case 4: Re-approval
1. Create a leave and approve it (note total_days)
2. Revoke the leave (total_days = 0)
3. Re-approve the leave
4. Verify total_days is recalculated correctly

### Test Case 5: Multiple Approvals
1. Approve multiple leave requests for different employees
2. Verify each has correct total_days
3. Verify no cross-contamination between requests

## Impact on Existing Features

**Preserved:**
- All existing leave approval functionality
- Status changes (Approved, Rejected, Cancelled, Pending)
- UI behavior and user experience
- Error handling and logging

**Enhanced:**
- `total_days` field now accurately reflects actual leave dates
- Automatic calculation eliminates manual updates
- Consistent data between `leave_requests` and `leave_approvals`

## Database Fields Affected

**Table:** `leave_requests`
**Field:** `total_days` (numeric)
**Operations:**
- Set to count of leave_approvals records on approval
- Reset to 0 on revocation

## Related Documentation

- See `LEAVE_APPROVAL_TRACKING_IMPLEMENTATION.md` for complete leave approval system documentation
- See `LEAVE_APPROVAL_QUICK_REFERENCE.md` for quick reference guide

## Future Enhancements

Potential improvements:
1. Add a database trigger to auto-update total_days when leave_approvals change
2. Create a view that joins leave_requests with count of leave_approvals
3. Add validation to ensure total_days never exceeds a maximum threshold
4. Create audit log for total_days changes
5. Add API endpoint to recalculate total_days for existing approved leaves

## Notes

- The `total_days` field is only meaningful for approved leaves
- For pending/rejected/cancelled leaves, total_days may be 0 or outdated
- The field provides quick access to the count without joining tables
- For detailed breakdown, always query the `leave_approvals` table
