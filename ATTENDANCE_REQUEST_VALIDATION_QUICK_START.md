# Attendance Request Validation - Quick Start Guide

## What's New

The attendance system now validates Gate Pass and Permission requests before finalizing employee attendance status. This ensures accurate attendance marking and fair treatment of employees with approved time-off.

---

## Key Changes

### 1. New Attendance Statuses

**"Pending Approval"** (Yellow Badge)
- Employee has a pending Gate Pass or Permission request
- Attendance status not finalized until request is approved/rejected
- No action required from attendance manager yet

**"Requires Review"** (Orange Badge)
- Employee has approved request but actual time doesn't align
- Example: Approved for 30-min late, but arrived 60 mins late
- Manual review and decision needed

### 2. New Tab: "Pending Review"

Location: Time Stamp Management Page
- Shows all records needing attention
- Includes both "Pending Approval" and "Requires Review" statuses
- Orange badge with count

---

## How It Works

### Scenario 1: Employee with Pending Request

**What Happens:**
1. Employee submits Gate Pass for late arrival (9:00 AM - 10:00 AM)
2. Request status: Pending
3. Employee clocks in at 9:45 AM
4. System assigns status: **"Pending Approval"**

**What You See:**
- Yellow "Pending Approval" badge on attendance record
- Record appears in "Pending Review" tab
- Cannot finalize until request is approved/rejected

**What To Do:**
1. Review and approve/reject the Gate Pass request
2. System will automatically update attendance status
3. If approved and aligned → Marked "Present"
4. If approved but misaligned → Moves to "Requires Review"

---

### Scenario 2: Approved Request - Time Aligned

**What Happens:**
1. Gate Pass approved for 9:00 AM - 10:00 AM (1-hour late)
2. Employee clocks in at 9:45 AM (within approved time)
3. System automatically assigns status: **"Present"**

**What You See:**
- Normal "Present" status
- No special badges
- No manual action needed

**Why This Works:**
- Employee is 45 minutes late
- Approved time allows up to 60 minutes
- Within allowed range (with 15-min grace)
- Auto-marked Present

---

### Scenario 3: Approved Request - Time Misaligned

**What Happens:**
1. Permission approved for 9:00 AM - 9:30 AM (30-min late)
2. Employee clocks in at 10:15 AM (75 mins late)
3. System assigns status: **"Requires Review"**
4. Notification sent to authorized personnel

**What You See:**
- Orange "Requires Review" badge
- Record in "Pending Review" tab
- Notification with details

**Notification Says:**
```
Title: Attendance Review Required
Message: Manual review required for Jane Smith (EMP002):
         Employee arrived 45 minutes later than
         approved permission time
```

**What To Do:**
1. Review the case
2. Check reason for additional delay
3. Decide: Accept as "Present" or mark as "Late"
4. Edit attendance record manually if needed

---

## Using the System

### For Attendance Managers

**Step 1: Check "Pending Review" Tab**
- Click "Pending Review" tab in Time Stamp Management
- See count of records needing attention
- Review each record

**Step 2: Handle "Pending Approval" Records**
- These have pending Gate Pass/Permission requests
- Go to Gate Pass Approval or Permission Approval page
- Approve or reject the request
- System will auto-update attendance status

**Step 3: Handle "Requires Review" Records**
- These have approved requests but time misalignment
- Check notification for specific reason
- Review employee's explanation (if provided)
- Make manual decision:
  - Accept: Edit record, mark as "Present"
  - Reject: Keep as calculated status (Late, Absent, etc.)

---

### For Employees

**Nothing Changes!**
- Submit Gate Pass/Permission requests as before
- Clock in/out normally
- System automatically validates

**Benefits for You:**
- Approved requests automatically mark you Present
- Fair treatment for legitimate late arrivals
- Clear status visibility

---

## Status Badge Guide

| Badge | Color | Meaning | Action Required |
|-------|-------|---------|-----------------|
| Pending Approval | Yellow | Has pending request | Wait for approval |
| Requires Review | Orange | Time mismatch | Manager review |
| Present | Green | Normal/Approved | None |
| Late | Red | Late without approval | None |
| Absent | Gray | No attendance | None |

---

## Workflow Diagram

```
Employee Clocks In
        ↓
Check for Gate Pass/Permission Request
        ↓
    ┌───┴───┐
    │       │
Pending?  Approved?
    │       │
    Yes     Yes
    ↓       ↓
"Pending   Check Time Alignment
Approval"  ├─────────┬──────────┐
           │         │          │
        Aligned   Misaligned  No Request
           │         │          │
           ↓         ↓          ↓
      "Present"  "Requires   Standard
                 Review"    Validation
                    +
              Notification
```

---

## Time Alignment Rules

**Grace Period:** 15 minutes
- If employee is late by 45 mins
- And approved for 30 mins
- Difference: 15 mins
- Within grace → **Aligned**

**Examples:**

| Shift Start | Approved Late | Actual Clock-in | Late Minutes | Aligned? |
|-------------|---------------|-----------------|--------------|----------|
| 9:00 AM | 30 mins | 9:25 AM | 25 | ✓ Yes (25 ≤ 30+15) |
| 9:00 AM | 30 mins | 9:50 AM | 50 | ✗ No (50 > 30+15) |
| 9:00 AM | 60 mins | 10:10 AM | 70 | ✗ No (70 > 60+15) |
| 9:00 AM | 60 mins | 9:45 AM | 45 | ✓ Yes (45 ≤ 60+15) |

---

## Notifications

### What Gets Notified

**Triggers:**
- Approved request + time misalignment
- Employee exceeds approved time limits

**Contains:**
- Employee name and code
- Specific reason (e.g., "45 minutes later than approved")
- Link to attendance record
- Request details (Gate Pass or Permission)

**Appears In:**
- Notifications dropdown (bell icon)
- Can be filtered by type: "attendance_review"

---

## Common Questions

**Q: What if employee has both Gate Pass and Permission?**
A: System checks Gate Pass first. If found, uses that. Otherwise checks Permission.

**Q: Can I edit a "Pending Approval" record?**
A: No. Wait for the request to be approved/rejected first.

**Q: Can I edit a "Requires Review" record?**
A: Yes. You can manually update status, times, etc.

**Q: What happens if request is rejected after being pending?**
A: System recalculates using standard validation (will likely be "Late" or "Absent").

**Q: Does this work for early departures?**
A: Yes! System also validates end times if Permission includes end time.

**Q: What if employee forgets to submit request?**
A: Attendance marked normally (Late/Absent). They can submit retroactive request for review.

---

## Tips for Managers

### Best Practices

1. **Check "Pending Review" tab daily**
   - Don't let records pile up
   - Quick review keeps system clean

2. **Approve/reject requests promptly**
   - Pending requests block attendance finalization
   - Faster approvals = faster payroll processing

3. **Review notification reasons carefully**
   - Each notification explains the specific issue
   - Make informed decisions

4. **Use edit function wisely**
   - "Requires Review" can be manually corrected
   - Document reason in notes field

5. **Set expectations with employees**
   - Submit requests in advance
   - Clock in/out within approved times
   - Communicate additional delays

---

## Tips for Employees

### Best Practices

1. **Submit requests early**
   - Don't wait until the last minute
   - Gives managers time to approve

2. **Clock in within approved times**
   - If approved for 30 mins late, arrive within 30+15 mins
   - Exceeding limits triggers review

3. **Communicate delays**
   - If you'll exceed approved time, inform manager
   - Proactive communication helps

4. **Check request status**
   - Ensure requests are approved before the day
   - Pending requests delay attendance finalization

---

## Troubleshooting

**Issue:** My approved request didn't mark me Present
- **Check:** Did you clock in within approved time + 15 mins?
- **Solution:** If yes, contact HR. If no, expect manual review.

**Issue:** Record shows "Pending Approval" but request was approved
- **Check:** Refresh the page
- **Solution:** System may take a moment to update. Contact IT if persists.

**Issue:** Don't see "Pending Review" tab
- **Check:** Are there any pending/review records?
- **Solution:** Tab only shows if count > 0. Check main dashboard.

---

## What Hasn't Changed

✓ **Gate Pass request process** - Same as before
✓ **Permission request process** - Same as before
✓ **Clock in/out process** - Same as before
✓ **Attendance reports** - Same as before
✓ **Payroll integration** - Same as before

---

## Support

**For Questions:**
- Contact your HR manager
- Check system documentation
- Submit support ticket

**For Issues:**
- Report bugs to IT department
- Provide screenshot and details
- Include employee ID and date

---

**Version:** 2.0.0
**Last Updated:** March 10, 2026
**Status:** ✅ Active
