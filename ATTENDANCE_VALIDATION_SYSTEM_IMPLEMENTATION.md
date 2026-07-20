# Attendance Validation System Implementation

## Overview
Implemented a comprehensive employee attendance validation system with configurable parameters and business rules. The system processes attendance records through a sequential validation flow considering grace periods, late entries, early exits, permissions, and half-day rules.

## Implementation Summary

### 1. Database Structure

#### New Tables Created

**`attendance_validation_config`** - Global configuration table
- Stores configurable parameters for attendance validation
- One configuration per tenant
- Fields:
  - Grace time settings (entry/exit)
  - Late entry settings (limit minutes, monthly count limit)
  - Early exit settings (limit minutes, monthly count limit)
  - Permission settings (min, max, total per month, round-up increment)
  - Half-day rules enable/disable flag

**`employee_permission_balance`** - Permission tracking per employee per month
- Tracks monthly permission balance for each employee
- Fields:
  - total_allowed_minutes, used_minutes, remaining_minutes
  - late_entry_count, early_exit_count
  - Unique constraint on (tenant_id, employee_id, month, year)

**`employee_attendance_history`** - Historical attendance action tracking
- Records each attendance validation action
- Fields:
  - action_type (grace_period, late_entry, early_exit, permission, etc.)
  - entry_time_gap_minutes, exit_time_gap_minutes
  - minutes_used, balance_after
  - Links to attendance_log_id for audit trail

### 2. Validation Logic Flow

The system processes attendance in the following order:

#### Step 1: Grace Period Check
- **Entry**: If clock-in time gap ≤ Entry Grace Time → Mark as Present
- **Exit**: If clock-out time gap ≤ Exit Grace Time → Mark as Present
- **Result**: If both within grace → Status: **Present**

#### Step 2: Half Day Rules (if enabled)
- **Employee exits before break start time** → Status: **Second Half Absent**
- **Employee enters after break end time** → Status: **First Half Absent**

#### Step 3: Late Entry Check
- **Conditions**:
  - EntryTimeGap > Entry Grace Time
  - EntryTimeGap ≤ Late Entry Limit
  - Monthly late count < Total Allowed Late Entry Count
- **Action**: Increment late_entry_count
- **Result**: Status: **Late**

#### Step 4: Early Exit Check
- **Conditions**:
  - ExitTimeGap > Exit Grace Time
  - ExitTimeGap ≤ Early Exit Limit
  - Monthly early count < Total Allowed Early Exit Count
- **Action**: Increment early_exit_count
- **Result**: Status: **Early Exit**

#### Step 5: Permission Check
- **Triggered when**:
  - EntryTimeGap > Late Entry Limit, OR
  - ExitTimeGap > Early Exit Limit, OR
  - Monthly count limits exceeded

- **Permission Validation**:
  1. Calculate gap: `max(EntryTimeGap, ExitTimeGap)`
  2. Round up to nearest increment (default: 30 minutes)
  3. Check if rounded minutes ≥ Minimum Permission (default: 30 min)
  4. Check if rounded minutes ≤ Maximum Permission (default: 60 min)
  5. Check if rounded minutes ≤ Available balance

- **Results**:
  - If all checks pass → Status: **Permission**, deduct from balance
  - If insufficient balance or invalid → Status: **First Off** or **Second Off** (Absent)

### 3. Core Files Created

#### `src/lib/attendanceValidation.ts`
Main validation logic implementation:
- `getValidationConfig()` - Fetches tenant configuration
- `getEmployeeBalance()` - Retrieves employee permission balance
- `validateAttendance()` - Core validation function
- `recordAttendanceHistory()` - Records validation actions
- Includes time gap calculation and rounding logic

#### `src/components/dashboard/settings/AttendanceValidationSettings.tsx`
UI component for configuration management:
- Real-time configuration editing
- Organized by setting categories
- Change tracking and save confirmation
- Validation flow information box
- Integrated into Settings Page with dedicated tab

### 4. Database Functions

**`initialize_employee_permission_balance`**
- Creates or updates permission balance for employee/month
- Pulls total allowed minutes from config
- Returns balance_id

**`get_employee_permission_balance`**
- Retrieves current balance for employee/date
- Auto-initializes if not found
- Returns balance details and counts

**`update_employee_permission_balance`**
- Updates used/remaining minutes
- Increments late/early counts
- Ensures data consistency

### 5. Integration Points

#### Updated `timeStampManagementStore.ts`
- Added import for validation functions
- Created `determineStatusWithValidation()` async function
- Maintains backward compatibility with legacy `determineStatus()`
- Falls back to legacy logic if validation fails

#### Settings Page Integration
- Added new "Attendance Validation" tab
- Integrated with existing settings navigation
- Uses consistent UI patterns

## Configuration Parameters

### Grace Time Settings
- **Entry Grace Time**: Minutes allowed after shift start (default: 15)
- **Exit Grace Time**: Minutes allowed before shift end (default: 15)

### Late Entry Settings
- **Late Entry Limit**: Maximum minutes to mark as late (default: 30)
- **Monthly Late Count Limit**: Allowed late entries per month (default: 5)

### Early Exit Settings
- **Early Exit Limit**: Maximum minutes to mark as early exit (default: 30)
- **Monthly Early Count Limit**: Allowed early exits per month (default: 5)

### Permission Settings
- **Minimum Permission**: Minimum minutes per occurrence (default: 30)
- **Maximum Permission**: Maximum minutes per occurrence (default: 60)
- **Total Monthly Permission**: Total minutes allowed per month (default: 180)
- **Round Up Increment**: Permission rounding increment (default: 30)

### Half Day Rules
- **Enable Half Day Rules**: Toggle for half-day absence detection (default: true)

## Status Values

The system can assign the following status values:
- **Present** - Within grace period or normal attendance
- **Late** - Late entry within acceptable limits
- **Early Exit** - Early exit within acceptable limits
- **Permission** - Using permission balance
- **Half Day** - Incomplete attendance
- **First Half Absent** - Entered after break time
- **Second Half Absent** - Exited before break time
- **First Off** - First absence violation
- **Second Off** - Second absence violation
- **Absent** - No attendance recorded

## Security Features

1. **Row Level Security (RLS)**
   - Enabled on all new tables
   - Policies restrict access to authenticated users
   - Tenant isolation maintained

2. **Data Validation**
   - Check constraints on all numeric fields
   - Unique constraints prevent duplicates
   - Foreign key constraints ensure referential integrity

3. **Audit Trail**
   - All actions recorded in employee_attendance_history
   - Tracks time gaps, minutes used, and balance changes
   - Links to attendance logs for complete history

## Usage

### For Administrators
1. Navigate to Settings > Attendance Validation
2. Configure validation parameters according to organization policy
3. Save changes
4. System automatically applies rules to all attendance records

### For System
1. When attendance is recorded, system automatically:
   - Retrieves current configuration
   - Fetches employee balance
   - Processes validation rules in sequence
   - Updates balances and counts
   - Records history for audit

### For Employees
- Permission balance resets monthly
- Late/early counts reset monthly
- Can view their status through attendance records
- Actions are automatically tracked

## Migration Notes

- Existing attendance records remain unchanged
- New validation applies to records processed after implementation
- Legacy `determineStatus()` function maintained for backward compatibility
- Configuration defaults align with common HR practices

## Testing Performed

- Build successful: `npm run build` completed without errors
- All TypeScript types properly defined
- Database migration applied successfully
- UI component renders correctly
- Integration with existing settings page verified

## Future Enhancements

1. **Employee Self-Service Portal**
   - View permission balance
   - See late/early count status
   - Request permission in advance

2. **Reporting Dashboard**
   - Permission usage analytics
   - Late/early trend analysis
   - Department-wise comparison

3. **Notifications**
   - Alert when balance is low
   - Notify on count limit approaching
   - Manager notifications for violations

4. **Advanced Rules**
   - Different rules for different departments
   - Seasonal adjustments
   - Holiday considerations
   - Role-based exceptions

## Breaking Changes

None - System is fully backward compatible with existing attendance functionality.

## Files Modified/Created

### New Files
1. `supabase/migrations/[timestamp]_create_attendance_validation_system.sql`
2. `src/lib/attendanceValidation.ts`
3. `src/components/dashboard/settings/AttendanceValidationSettings.tsx`
4. `ATTENDANCE_VALIDATION_SYSTEM_IMPLEMENTATION.md` (this file)

### Modified Files
1. `src/stores/timeStampManagementStore.ts` - Added validation integration
2. `src/components/dashboard/settings/SettingsPage.tsx` - Added new tab

## Support

For issues or questions:
1. Check configuration in Settings > Attendance Validation
2. Review employee_attendance_history for detailed action log
3. Verify permission balances in employee_permission_balance table
4. Check validation logic in attendanceValidation.ts

## Conclusion

The attendance validation system provides a comprehensive, configurable solution for managing employee attendance with clear business rules and automated enforcement. The implementation maintains backward compatibility while introducing powerful new capabilities for HR management.
