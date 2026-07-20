# Total Days Auto-Update - Quick Summary

## What Changed

Enhanced the leave approval system to automatically update the `total_days` field in the `leave_requests` table.

## Files Modified

1. **`src/lib/leaveApprovalTracking.ts`**
   - `processLeaveApproval()`: Now updates `total_days` after creating approval records
   - `revokeLeaveApproval()`: Now resets `total_days` to 0 after deleting records

## How It Works

### When Approving a Leave:
```
User clicks "Approve"
  → Status changes to "Approved"
  → processLeaveApproval() creates daily records
  → total_days = count of records created ✓
  → UI refreshes
```

### When Revoking a Leave:
```
User clicks "Revoke"
  → Status changes to "Pending"
  → revokeLeaveApproval() deletes all records
  → total_days = 0 ✓
  → UI refreshes
```

## Total Days Calculation

**total_days** = Count of records in `leave_approvals` table

This includes:
- Primary leave days (start_date to end_date)
- Before holidays (if policy enabled)
- Before weekoffs (if policy enabled)
- After holidays (if policy enabled)
- After weekoffs (if policy enabled)
- In-between holidays (if policy enabled)
- In-between weekoffs (if policy enabled)

## Example

**Scenario:**
- Leave request: Jan 15-17 (3 days)
- Before holiday: Jan 14
- Policy: `before_leave_holiday = true`

**Result:**
- 4 records created in `leave_approvals`
- `total_days` automatically set to **4**

## Verification

Check if total_days is correct:
```sql
SELECT
  lr.id,
  lr.total_days,
  COUNT(la.id) as actual_count
FROM leave_requests lr
LEFT JOIN leave_approvals la ON lr.id = la.leave_request_id
WHERE lr.status = 'Approved'
GROUP BY lr.id, lr.total_days;
```

Expected: `total_days` should equal `actual_count`

## Key Benefits

✅ **Automatic** - No manual calculation needed
✅ **Accurate** - Always matches actual leave dates
✅ **Policy-Aware** - Includes all policy-based dates
✅ **Consistent** - Synced with leave_approvals table
✅ **Reversible** - Resets when revoked

## Integration

No changes needed to LeaveList.tsx - it already calls:
- `processLeaveApproval()` on approval
- `revokeLeaveApproval()` on revocation

The total_days update happens automatically inside these functions.

## Testing

1. ✓ Approve a leave → Check total_days is set
2. ✓ Revoke a leave → Check total_days is reset to 0
3. ✓ Re-approve → Check total_days is recalculated
4. ✓ Different policies → Check count includes policy dates

## Build Status

✅ Application builds successfully
✅ No breaking changes
✅ All existing features preserved

## Documentation

- Full details: `TOTAL_DAYS_UPDATE_IMPLEMENTATION.md`
- Leave approval system: `LEAVE_APPROVAL_TRACKING_IMPLEMENTATION.md`
