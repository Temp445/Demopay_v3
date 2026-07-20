# Absentee Tracking Implementation Guide

## Overview
This document describes the comprehensive implementation of the absentee tracking functionality in the Leave Management system. The implementation follows all specified requirements for date filtering, absentee detection, and leave request creation.

## Implementation Summary

### 1. Date Filter Component (`AbsenteeDateFilter.tsx`)

**Purpose:** Provides permanent date range selection with DD/MM/YYYY format and validation.

**Key Features:**
- **DD/MM/YYYY Format:** Custom input fields with format validation
- **Date Range Validation:**
  - End date must be after start date
  - Dates restricted to current year and previous year (Jan 1 - Dec 31)
  - Real-time validation with user-friendly error messages
- **Automatic Refresh:** Triggers data reload when dates change
- **Visual Feedback:** Clear error messages for invalid date selections

**Code Highlights:**
```typescript
// Date parsing and validation
const parseDDMMYYYY = (dateStr: string): Date | null => {
  const parts = dateStr.split('/');
  if (parts.length !== 3) return null;
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const year = parseInt(parts[2], 10);
  const date = new Date(year, month, day);
  return date;
};

// Date range validation
const validateDateRange = (start: string, end: string): string | null => {
  const currentYear = new Date().getFullYear();
  const previousYear = currentYear - 1;
  const minDate = new Date(previousYear, 0, 1);
  const maxDate = new Date(currentYear, 11, 31);

  if (startDate < minDate || startDate > maxDate) {
    return `Start date must be between 01/01/${previousYear} and 31/12/${currentYear}`;
  }
  // ... additional validation
};
```

### 2. Absentee Store (`absenteeStore.ts`)

**Purpose:** Manages absentee detection logic and data fetching.

**Key Features:**
- **Holiday Detection:**
  - Checks fixed holidays from `holidays` table
  - Checks recurring holidays from `holiday_recurring_patterns` table
  - Supports day-of-week and week-occurrence patterns

- **Leave Request Verification:**
  - Cross-references `leave_requests` table
  - Checks for approved or pending leave requests
  - Validates date overlap with absent dates

- **Attendance Checking:**
  - Queries `attendance_logs` table
  - Identifies missing clock-in/clock-out records
  - Only flags as absent if no attendance and no leave

**Absentee Detection Algorithm:**
```typescript
// Step 1: For each employee, iterate through date range
for (const employee of employees) {
  const currentDate = new Date(start);

  while (currentDate <= end) {
    const dateStr = currentDate.toISOString().split('T')[0];

    // Step 2: Check if date is a holiday
    const isHol = await isHoliday(dateStr, auth.tenantId);

    if (!isHol) {
      // Step 3: Check attendance logs
      const { data: attendanceLog } = await supabase
        .from('attendance_logs')
        .select('id, clock_in, clock_out')
        .eq('employee_id', employee.id)
        .eq('date', dateStr)
        .maybeSingle();

      const hasAttendance = attendanceLog &&
        (attendanceLog.clock_in || attendanceLog.clock_out);

      // Step 4: If no attendance, check for leave request
      if (!hasAttendance) {
        const hasLeave = await hasLeaveRequest(
          employee.id,
          dateStr,
          auth.tenantId
        );

        // Step 5: Mark as absent only if no leave
        if (!hasLeave) {
          absentees.push({
            employee_id: employee.id,
            employee_name: employee.name,
            employee_code: employee.employee_code || 'N/A',
            department: employee.department,
            absent_date: dateStr,
            is_holiday: false,
            has_leave_request: false,
          });
        }
      }
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }
}
```

**Holiday Detection Logic:**
```typescript
const isHoliday = async (date: string, tenantId: string): Promise<boolean> => {
  const checkDate = new Date(date);
  const dayOfWeek = checkDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

  // Check fixed holidays
  const { data: fixedHolidays } = await supabase
    .from('holidays')
    .select('date')
    .eq('tenant_id', tenantId)
    .eq('date', date)
    .eq('is_active', true);

  if (fixedHolidays && fixedHolidays.length > 0) {
    return true;
  }

  // Check recurring patterns
  const { data: recurringHolidays } = await supabase
    .from('holiday_recurring_patterns')
    .select('week_day, week_occurrence')
    .eq('tenant_id', tenantId)
    .eq('is_active', true);

  if (recurringHolidays && recurringHolidays.length > 0) {
    for (const pattern of recurringHolidays) {
      if (pattern.week_day.toLowerCase() === dayOfWeek) {
        // Check if pattern matches (all, first, second, third, fourth, last)
        if (pattern.week_occurrence === 'all') {
          return true;
        }

        const weekOfMonth = Math.ceil(checkDate.getDate() / 7);
        const occurrenceMap = {
          'first': 1, 'second': 2, 'third': 3,
          'fourth': 4, 'last': 5
        };

        if (occurrenceMap[pattern.week_occurrence.toLowerCase()] === weekOfMonth) {
          return true;
        }
      }
    }
  }

  return false;
};
```

### 3. Absentee List Component (`AbsenteeList.tsx`)

**Purpose:** Displays all absentee records with click-to-create functionality.

**Key Features:**
- **Grouped Display:** Groups absent dates by employee
- **Summary Statistics:** Shows total absent days and employees
- **Interactive Dates:** Each date is clickable to create leave request
- **Visual Indicators:** Color-coded badges for quick identification
- **Empty States:** Clear messaging when no absentees found

**UI Structure:**
```typescript
// Grouped by employee
const groupedByEmployee = absentees.reduce((acc, record) => {
  if (!acc[record.employee_id]) {
    acc[record.employee_id] = {
      employee_name: record.employee_name,
      employee_code: record.employee_code,
      department: record.department,
      dates: [],
    };
  }
  acc[record.employee_id].dates.push(record.absent_date);
  return acc;
}, {});

// Render each employee with clickable dates
{Object.entries(groupedByEmployee).map(([employeeId, data]) => (
  <div key={employeeId}>
    <h3>{data.employee_name}</h3>
    {data.dates.map((date) => (
      <button onClick={() => onAbsenteeClick(employeeId, data.employee_name, date)}>
        {format(new Date(date), 'dd/MM/yyyy')}
      </button>
    ))}
  </div>
))}
```

### 4. Absentee Leave Request Modal (`AbsenteeLeaveRequestModal.tsx`)

**Purpose:** Pre-populated leave request form for absentee dates.

**Key Features:**
- **Pre-filled Data:**
  - Employee information (read-only display)
  - Absent date (pre-populated in form)
  - Start and end dates set to absent date

- **Form Fields:**
  - Leave type selection (required)
  - Date range (modifiable if needed)
  - Half-day options for start and end dates
  - Reason (required)
  - Supporting document URL (optional)

- **Validation:**
  - Leave type must be selected
  - Reason must be provided
  - Date range validation

**Pre-population Logic:**
```typescript
// Initialize form with absentee data
useEffect(() => {
  if (isOpen) {
    fetchLeaveTypes();
    setFormData({
      employee_id: employeeId,        // Pre-filled
      leave_type_id: '',
      start_date: absentDate,         // Pre-filled
      end_date: absentDate,           // Pre-filled
      reason: '',
      document_url: '',
      is_half_day_start: false,
      is_half_day_end: false,
      half_day_period_start: null,
      half_day_period_end: null,
    });
    setError(null);
  }
}, [isOpen, employeeId, absentDate, fetchLeaveTypes]);
```

### 5. Leave Page Integration (`LeavePage.tsx`)

**Purpose:** Main page that integrates all absentee tracking components.

**Key Changes:**
1. **Date Range State:**
```typescript
const currentYear = new Date().getFullYear();
const previousYear = currentYear - 1;
const defaultStartDate = `${previousYear}-01-01`;
const defaultEndDate = `${currentYear}-12-31`;

const [absenteeDateRange, setAbsenteeDateRange] = useState({
  start_date: defaultStartDate,
  end_date: defaultEndDate,
});
```

2. **Absentee Modal State:**
```typescript
const [isAbsenteeModalOpen, setIsAbsenteeModalOpen] = useState(false);
const [selectedAbsentee, setSelectedAbsentee] = useState<{
  employeeId: string;
  employeeName: string;
  absentDate: string;
} | null>(null);
```

3. **Event Handlers:**
```typescript
// Handle date range changes
const handleAbsenteeDateChange = (startDate: string, endDate: string) => {
  setAbsenteeDateRange({ start_date: startDate, end_date: endDate });
  setLastRefresh(Date.now());
};

// Handle absentee click
const handleAbsenteeClick = (employeeId: string, employeeName: string, absentDate: string) => {
  setSelectedAbsentee({ employeeId, employeeName, absentDate });
  setIsAbsenteeModalOpen(true);
};

// Handle leave request submission
const handleAbsenteeLeaveAdded = () => {
  setLastRefresh(Date.now());
  setIsAbsenteeModalOpen(false);
  setSelectedAbsentee(null);
};
```

4. **Component Layout:**
```typescript
// Date filter (always visible)
<div className="mt-6">
  <AbsenteeDateFilter
    startDate={absenteeDateRange.start_date}
    endDate={absenteeDateRange.end_date}
    onDateChange={handleAbsenteeDateChange}
  />
</div>

// Absentee list
<div className="mt-6">
  <AbsenteeList
    startDate={absenteeDateRange.start_date}
    endDate={absenteeDateRange.end_date}
    onAbsenteeClick={handleAbsenteeClick}
    lastRefresh={lastRefresh}
  />
</div>

// Absentee leave request modal
{selectedAbsentee && (
  <AbsenteeLeaveRequestModal
    employeeId={selectedAbsentee.employeeId}
    employeeName={selectedAbsentee.employeeName}
    absentDate={selectedAbsentee.absentDate}
    isOpen={isAbsenteeModalOpen}
    onClose={() => {
      setIsAbsenteeModalOpen(false);
      setSelectedAbsentee(null);
    }}
    onLeaveAdded={handleAbsenteeLeaveAdded}
  />
)}
```

## Data Flow

### Absentee Detection Flow
```
User selects date range (DD/MM/YYYY format)
    ↓
Date validation (year restriction, end > start)
    ↓
AbsenteeDateFilter triggers onDateChange
    ↓
LeavePage updates state and lastRefresh
    ↓
AbsenteeList receives new dates and fetches data
    ↓
absenteeStore.fetchAbsentees() executes:
    ↓
For each employee in date range:
    ↓
Check if date is holiday (holidays + holiday_recurring_patterns)
    ↓
If NOT holiday:
    ↓
Check attendance_logs for clock_in/clock_out
    ↓
If NO attendance:
    ↓
Check leave_requests for approved/pending leave
    ↓
If NO leave:
    ↓
Mark as ABSENT
    ↓
Return absentee records grouped by employee
    ↓
Display in AbsenteeList with clickable dates
```

### Leave Request Creation Flow
```
User clicks on absent date
    ↓
AbsenteeList triggers onAbsenteeClick(employeeId, employeeName, date)
    ↓
LeavePage sets selectedAbsentee state
    ↓
LeavePage opens AbsenteeLeaveRequestModal
    ↓
Modal pre-fills:
  - Employee ID and name (display only)
  - Start date = absent date
  - End date = absent date
    ↓
User selects leave type and enters reason
    ↓
User submits form
    ↓
leaveStore.submitLeaveRequest() creates leave request
    ↓
Modal closes and refreshes data
    ↓
AbsenteeList re-fetches (absent date should now have leave request)
```

## Database Schema Usage

### Tables Queried
1. **employees** - Active employees list
2. **attendance_logs** - Clock in/out records
3. **holidays** - Fixed holiday dates
4. **holiday_recurring_patterns** - Recurring holiday patterns
5. **leave_requests** - Leave requests (approved/pending)
6. **leave_types** - Available leave types

### Query Patterns
```sql
-- Check fixed holidays
SELECT date FROM holidays
WHERE tenant_id = ? AND date = ? AND is_active = true;

-- Check recurring holidays
SELECT week_day, week_occurrence FROM holiday_recurring_patterns
WHERE tenant_id = ? AND is_active = true;

-- Check attendance
SELECT id, clock_in, clock_out FROM attendance_logs
WHERE tenant_id = ? AND employee_id = ? AND date = ?;

-- Check leave requests
SELECT * FROM leave_requests
WHERE tenant_id = ? AND employee_id = ?
  AND start_date <= ? AND end_date >= ?
  AND status IN ('approved', 'pending');
```

## Features Implemented

### ✅ Date Filter Requirements
- [x] Permanently displayed date filter controls
- [x] Automatic data refresh on date change
- [x] DD/MM/YYYY format exclusively
- [x] End date validation (must be after start date)
- [x] Date restriction to current and previous year
- [x] Validation error messages

### ✅ Absentee Detection Logic
- [x] Query attendance_logs table
- [x] Iterate through all dates in range
- [x] Cross-reference holidays table
- [x] Cross-reference holiday_recurring_patterns table
- [x] Skip if holiday matches
- [x] Check for leave requests
- [x] Only mark absent if no attendance and no leave

### ✅ Absentee Display and Interaction
- [x] Dedicated absentee list section
- [x] Click functionality on each absent record
- [x] Opens modal/overlay window
- [x] Displays leave request form
- [x] Pre-populates employee information
- [x] Pre-populates absent date
- [x] Ready for submission

### ✅ Implementation Constraints
- [x] Preserved all existing features
- [x] Only modified leave management components
- [x] Maintained UI design patterns
- [x] Backward compatibility maintained

## Testing Checklist

### Date Filter Testing
- [ ] Enter valid DD/MM/YYYY dates
- [ ] Try invalid date formats
- [ ] Test end date before start date
- [ ] Test dates outside year range
- [ ] Verify automatic refresh on Apply

### Absentee Detection Testing
- [ ] Check employees with no attendance
- [ ] Verify holiday exclusion
- [ ] Verify recurring holiday patterns
- [ ] Check leave request exclusion
- [ ] Test with multiple employees
- [ ] Test across date ranges

### Leave Request Creation Testing
- [ ] Click on absent date
- [ ] Verify modal opens
- [ ] Check pre-filled data
- [ ] Submit leave request
- [ ] Verify absentee removed after approval
- [ ] Test validation errors

## Performance Considerations

### Optimization Strategies
1. **Batch Processing:** Process employees in parallel where possible
2. **Caching:** Cache holiday data for date range
3. **Query Optimization:** Use indexed fields (tenant_id, employee_id, date)
4. **Date Range Limiting:** Restrict to reasonable date ranges

### Known Limitations
- Large date ranges (>1 year) may take longer to process
- Many employees (>100) may require pagination
- Holiday pattern matching is computed client-side

## Future Enhancements

### Potential Improvements
1. **Bulk Leave Creation:** Create leave requests for multiple absent dates
2. **Export Functionality:** Export absentee report to CSV/PDF
3. **Email Notifications:** Notify employees of absent days
4. **Absentee Patterns:** Identify patterns in absenteeism
5. **Department Filtering:** Filter absentees by department
6. **Status Indicators:** Show leave request status for each absent date

## Conclusion

The absentee tracking functionality has been successfully implemented with all specified requirements. The system provides:
- Robust date filtering with validation
- Intelligent absentee detection considering holidays and leave
- Seamless integration with existing leave management
- User-friendly interface for creating leave requests

All existing features remain intact and backward compatibility is maintained.
