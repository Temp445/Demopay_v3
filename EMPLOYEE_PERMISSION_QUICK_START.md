# Employee Permission - Quick Start Guide

## What's New

Two new screens have been added to manage employee permission requests:

1. **Permission Request** - For employees to submit and manage their requests
2. **Permission Approval** - For authorized personnel to review and approve requests

---

## How to Access

### In the Sidebar:
```
Dashboard
  └── Permissions (expand)
      ├── Permission Request
      └── Permission Approval
```

### Direct URLs:
- Permission Request: `/dashboard/permissions/request`
- Permission Approval: `/dashboard/permissions/approval`

---

## Permission Request Screen

### Submit a New Request

1. Click **"New Request"** button
2. Fill in the form:
   - **Employee**: Select from dropdown
   - **Start Date**: Pick date
   - **Start Time**: Set time
   - **End Date**: Pick date
   - **End Time**: Set time
   - **Reason**: Enter reason (required)
3. Click **"Submit Request"**

### Manage Your Requests

**View All Requests:**
- See all your permission requests in a table
- Color-coded status badges (Pending, Approved, Rejected, Cancelled)

**Edit Pending Request:**
- Click the **edit icon** (pencil)
- Modify any field
- Click **"Update Request"**
- ⚠️ Only works for **pending** requests

**Cancel Request:**
- Click the **cancel icon** (X)
- Confirm cancellation
- ⚠️ Only works for **pending** requests

**View Status:**
- **Pending** (yellow): Awaiting approval - can edit/cancel
- **Approved** (green): Approved - read-only
- **Rejected** (red): Rejected - read-only
- **Cancelled** (gray): Cancelled by you - read-only

---

## Permission Approval Screen

### Review Pending Requests

**Pending Approvals Section:**
- Shows all requests awaiting approval
- Click **"Review"** to open details

### Approve or Reject

1. Click **"Review"** on any pending request
2. Review the details
3. (Optional) Click **"Edit"** to modify request details
4. Choose action:
   - **Approve**: Sets status to approved
   - **Reject**: Sets status to rejected

### View All Requests

**All Requests Section:**
- Shows historical requests (approved, rejected, cancelled)
- Click **"Logs"** to view change history

### Change History (Logs)

Shows complete audit trail:
- What changed (field name)
- Old value → New value
- Who made the change
- When it was changed

---

## Status Workflow

```
New Request
    ↓
  Pending ──→ Approved (by approver)
    ↓
    ├─────→ Rejected (by approver)
    ↓
    └─────→ Cancelled (by employee)
```

**Rules:**
- Employees can only edit **pending** requests
- Once approved/rejected, no changes allowed
- Approvers can modify before approving
- All changes are logged

---

## Key Features

### ✅ For Employees:
- Submit permission requests
- Edit pending requests
- Cancel pending requests
- View request status
- See all your requests

### ✅ For Approvers:
- View all pending requests
- Modify request details before approval
- Approve or reject requests
- View complete change history
- See all requests (not just pending)

### ✅ Automatic Logging:
- Every change is recorded
- Who changed what and when
- Complete audit trail
- Cannot be deleted or modified

---

## Required Fields

When creating/editing a request:
- ✓ Employee
- ✓ Start Date
- ✓ Start Time
- ✓ End Date
- ✓ End Time
- ✓ Reason (must not be empty)

---

## Common Scenarios

### Scenario 1: Employee Needs Time Off
```
1. Employee creates request
2. Status: Pending
3. Employee can edit if needed
4. Approver reviews and approves
5. Status: Approved
6. Employee can view but not edit
```

### Scenario 2: Employee Made a Mistake
```
1. Employee created request with wrong time
2. Status: Pending
3. Employee clicks edit
4. Updates the time
5. Change is logged
6. Approver sees updated request
```

### Scenario 3: Approver Needs to Adjust
```
1. Request submitted for 2 hours
2. Approver opens review
3. Clicks "Edit"
4. Changes to 1.5 hours
5. Clicks "Approve"
6. Change is logged
7. Status: Approved
```

### Scenario 4: View History
```
1. Go to Permission Approval
2. Find any processed request
3. Click "Logs"
4. See all changes:
   - Original submission
   - Any edits
   - Approval/rejection
```

---

## Tips

### For Employees:
- ✓ Fill all fields before submitting
- ✓ Double-check dates and times
- ✓ Provide clear reason
- ✓ Edit before it's approved (can't change after)
- ✓ Cancel if you no longer need it

### For Approvers:
- ✓ Review all fields carefully
- ✓ Edit if adjustment needed
- ✓ Check logs to see if request was modified
- ✓ Reject with clear reason if needed
- ✓ Approve only valid requests

---

## FAQ

**Q: Can I edit an approved request?**
A: No, only pending requests can be edited.

**Q: Can I delete a request?**
A: No, but you can cancel pending requests. Approved/rejected requests remain for audit purposes.

**Q: Who can see my requests?**
A: Only you and authorized approvers in your organization.

**Q: Are changes tracked?**
A: Yes, every change is logged automatically with timestamp and user info.

**Q: Can I create multiple requests?**
A: Yes, create as many as needed.

**Q: What happens if I cancel a request?**
A: It's marked as cancelled and cannot be edited. You can submit a new request if needed.

**Q: Can approvers see cancelled requests?**
A: Yes, all requests appear in the "All Requests" section.

**Q: How do I know if my request was approved?**
A: Check the status badge on the Permission Request page. Green = Approved.

---

## Troubleshooting

**Problem**: Can't see the Permission menu
- **Solution**: Check with your administrator - you may not have access permissions

**Problem**: Can't edit a request
- **Solution**: Check the status - only pending requests can be edited

**Problem**: Submit button is disabled
- **Solution**: Fill in all required fields (marked with *)

**Problem**: Changes not showing
- **Solution**: Refresh the page

**Problem**: Don't see logs button
- **Solution**: Logs are only available for processed requests (approved/rejected/cancelled)

---

## Need Help?

Contact your system administrator if:
- You can't access the Permission screens
- You see errors when submitting
- Your requests aren't showing up
- You need to modify an approved request

---

**Version:** 1.0.0
**Last Updated:** March 9, 2026
