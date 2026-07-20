# Overtime Calculation System - Complete Documentation

## Overview

The Overtime Calculation System implements a sophisticated two-tier control structure for calculating employee overtime with precise configuration options at both company and shift levels. The system supports threshold-based calculations, flexible rounding rules, and before/after shift overtime tracking.

## System Architecture

### Two-Tier Control Structure

1. **Global Controller (Company Level)**
   - Master toggle for system-wide overtime activation
   - Default configuration for all shifts
   - Centralized threshold and rounding rules

2. **Shift-Level Controller**
   - Per-shift activation toggle
   - Optional timing configuration override
   - Falls back to global settings when not customized

## Features

### 1. Global Configuration (Company Settings)

#### Master Toggle
- **Enable/Disable Overtime**: System-wide control
- When disabled, no overtime calculations occur regardless of shift settings
- Located in: Settings → Overtime tab

#### Calculation Timing Options
- **Before Shift Start Only**: Calculate OT when employees clock in early
- **After Shift End Only**: Calculate OT when employees clock out late
- **Both Before and After**: Calculate OT for both scenarios

#### Threshold Configuration
- **Purpose**: Minimum overtime minutes required to qualify
- **Range**: 0-480 minutes
- **Behavior**:
  - If actual OT < threshold → No OT counted
  - If actual OT ≥ threshold → Full duration counts (threshold NOT deducted)
- **Example**:
  - Threshold = 30 minutes
  - Actual OT = 25 minutes → 0 minutes counted
  - Actual OT = 35 minutes → 35 minutes counted (full amount)

#### Rounding Configuration

**Rounding Intervals:**
- 10 minutes
- 15 minutes
- 30 minutes
- 60 minutes (1 hour)

**Rounding Methods:**
- **Nearest**: Round to closest interval (e.g., 37 mins → 40 mins with 10-min interval)
- **Midpoint**: Round up at exact midpoint, down below (e.g., 35 mins → 30 mins, 36 mins → 40 mins)
- **Start**: Always round down to interval start (e.g., 39 mins → 30 mins)

**Rounding Application Mode** (for 'both' timing):
- **Apply Separately**: Round before-shift and after-shift OT independently
- **Apply to Combined Total**: Combine both periods first, then apply rounding once

### 2. Shift-Level Configuration

#### Per-Shift Toggle
- **Enable/Disable**: Controls overtime for specific shift
- **Default**: Enabled (active)
- **Requirement**: Both global AND shift must be enabled for OT to calculate

#### Timing Override
- **Custom Configuration**: Option to override global timing settings
- **Options**: Before, After, or Both
- **Other Settings**: Always use global threshold and rounding rules

#### Access
- Navigate to: Shifts Management → Clock icon next to each shift

## Calculation Logic

### Before-Shift Overtime
```
IF clock_in_time < shift_start_time:
  before_OT = shift_start_time - clock_in_time
ELSE:
  before_OT = 0
```

**Example:**
- Shift Start: 09:00
- Actual Clock-in: 08:30
- Before-shift OT: 30 minutes

### After-Shift Overtime
```
IF clock_out_time > shift_end_time:
  after_OT = clock_out_time - shift_end_time
ELSE:
  after_OT = 0
```

**Example:**
- Shift End: 17:00
- Actual Clock-out: 18:15
- After-shift OT: 75 minutes

### Threshold Validation

**Separate Mode:**
```
IF before_OT >= threshold:
  before_OT_payable = round(before_OT)
ELSE:
  before_OT_payable = 0

IF after_OT >= threshold:
  after_OT_payable = round(after_OT)
ELSE:
  after_OT_payable = 0

total_OT = before_OT_payable + after_OT_payable
```

**Combined Mode:**
```
total_raw = before_OT + after_OT

IF total_raw >= threshold:
  total_OT = round(total_raw)

  // Proportionally distribute back
  before_OT_payable = (before_OT / total_raw) * total_OT
  after_OT_payable = total_OT - before_OT_payable
ELSE:
  total_OT = 0
  before_OT_payable = 0
  after_OT_payable = 0
```

### Rounding Examples

**Configuration:**
- Interval: 15 minutes
- Method: Nearest

| Actual OT | Rounded OT |
|-----------|------------|
| 7 mins    | 0 mins     |
| 8 mins    | 15 mins    |
| 22 mins   | 15 mins    |
| 23 mins   | 30 mins    |
| 37 mins   | 30 mins    |
| 38 mins   | 45 mins    |

**Method: Midpoint**

| Actual OT | Rounded OT |
|-----------|------------|
| 7 mins    | 0 mins     |
| 8 mins    | 0 mins     |
| 15 mins   | 15 mins    |
| 22 mins   | 15 mins    |
| 23 mins   | 30 mins    |

**Method: Start**

| Actual OT | Rounded OT |
|-----------|------------|
| 7 mins    | 0 mins     |
| 14 mins   | 0 mins     |
| 15 mins   | 15 mins    |
| 29 mins   | 15 mins    |
| 30 mins   | 30 mins    |

## Implementation Details

### Database Schema

#### Company Settings Table Additions
```sql
-- Global overtime configuration
overtime_enabled                boolean DEFAULT false
overtime_calculation_timing     text DEFAULT 'both'  -- before, after, both
overtime_threshold_minutes      integer DEFAULT 30
overtime_rounding_interval      integer DEFAULT 30   -- 10, 15, 30, 60
overtime_rounding_method        text DEFAULT 'nearest'  -- nearest, midpoint, start
overtime_rounding_mode          text DEFAULT 'combined'  -- separate, combined
```

#### Shifts Table Additions
```sql
-- Per-shift overtime configuration
overtime_enabled                boolean DEFAULT true
overtime_config_override        boolean DEFAULT false
overtime_calculation_timing     text DEFAULT NULL  -- overrides global if set
```

### Database Functions

#### 1. `apply_overtime_rounding`
Applies rounding logic to overtime minutes.

**Parameters:**
- `p_minutes`: Raw overtime minutes
- `p_interval`: Rounding interval (10, 15, 30, 60)
- `p_method`: Rounding method (nearest, midpoint, start)

**Returns:** Rounded overtime minutes

#### 2. `get_overtime_config`
Retrieves effective overtime configuration for a shift.

**Parameters:**
- `p_shift_id`: Shift UUID
- `p_tenant_id`: Tenant UUID

**Returns:** Complete overtime configuration (merged global + shift)

**Logic:**
1. Check if global overtime is enabled
2. Check if shift overtime is enabled
3. If shift has override, use shift timing, else use global
4. Return all configuration parameters

#### 3. `calculate_overtime`
Main calculation function for shift overtime.

**Parameters:**
- `p_shift_id`: Shift UUID
- `p_tenant_id`: Tenant UUID
- `p_shift_start_time`: Scheduled shift start
- `p_shift_end_time`: Scheduled shift end
- `p_actual_clock_in`: Actual clock-in time
- `p_actual_clock_out`: Actual clock-out time

**Returns:**
```typescript
{
  before_shift_minutes: number,
  after_shift_minutes: number,
  total_overtime_minutes: number,
  is_overtime_applicable: boolean
}
```

**Process:**
1. Get effective configuration
2. Calculate raw before-shift OT (if applicable)
3. Calculate raw after-shift OT (if applicable)
4. Apply threshold validation
5. Apply rounding (separate or combined)
6. Return calculated values

### Frontend Components

#### 1. OvertimeSettings Component
**Location:** `src/components/dashboard/settings/OvertimeSettings.tsx`

**Features:**
- Master toggle for overtime system
- Timing configuration radio buttons
- Threshold input field (0-480 minutes)
- Rounding interval dropdown
- Rounding method selection
- Rounding mode selection (for 'both' timing)
- Live preview calculator
- Save functionality with validation

**Validation:**
- Ensures rounding interval ≥ threshold
- Provides instant feedback

#### 2. ShiftOvertimeConfig Component
**Location:** `src/components/dashboard/shifts/ShiftOvertimeConfig.tsx`

**Features:**
- Per-shift enable/disable toggle
- Custom timing override option
- Display of current effective configuration
- Clear indication of global vs. custom settings
- Save functionality

**Access:**
- Shifts Management page → Clock icon button

#### 3. Integration with ShiftList
**Location:** `src/components/dashboard/shifts/ShiftList.tsx`

**Added:**
- Clock icon button for overtime configuration
- Modal integration for each shift

### Utility Functions

**Location:** `src/lib/overtime.ts`

**Key Functions:**
- `getGlobalOvertimeConfig()`: Fetch global configuration
- `updateGlobalOvertimeConfig()`: Update global settings
- `getShiftOvertimeConfig()`: Fetch shift configuration
- `updateShiftOvertimeConfig()`: Update shift settings
- `calculateOvertime()`: Calculate OT using database function
- `formatOvertimeDisplay()`: Format minutes to "Xh Ym"
- `validateRoundingInterval()`: Validate interval vs. threshold
- `calculateOvertimePreview()`: Client-side preview calculation

## Usage Guide

### Setup Process

#### Step 1: Enable Overtime Globally
1. Navigate to **Settings → Overtime**
2. Toggle **Enable Overtime Calculation** to ON
3. Select calculation timing (Before, After, or Both)
4. Set threshold minutes (e.g., 30 minutes)
5. Choose rounding interval (e.g., 15 minutes)
6. Select rounding method (e.g., Nearest)
7. For 'Both' timing, choose rounding mode
8. Click **Save Configuration**

#### Step 2: Configure Individual Shifts (Optional)
1. Navigate to **Shifts Management**
2. Click the **Clock icon** next to a shift
3. Ensure **Enable Overtime for This Shift** is ON
4. Optionally, check **Use Custom Timing Configuration**
5. If custom: Select desired timing (Before, After, or Both)
6. Click **Save Configuration**

#### Step 3: Verify Configuration
1. Use the **Preview Calculator** in global settings
2. Enter sample before/after minutes
3. Review calculated overtime values
4. Adjust configuration as needed

### Testing Scenarios

#### Scenario 1: Simple After-Shift OT
**Configuration:**
- Timing: After shift end only
- Threshold: 30 minutes
- Rounding: 15 minutes, Nearest

**Test Case:**
- Shift: 09:00 - 17:00
- Clock-in: 09:00
- Clock-out: 17:50

**Calculation:**
- After-shift OT: 50 minutes
- Meets threshold: ✓ (50 ≥ 30)
- Rounded: 45 minutes (50 → 45 using 15-min nearest)
- **Payable OT: 45 minutes**

#### Scenario 2: Both Before and After (Separate Mode)
**Configuration:**
- Timing: Both
- Threshold: 30 minutes
- Rounding: 30 minutes, Nearest
- Mode: Separate

**Test Case:**
- Shift: 09:00 - 17:00
- Clock-in: 08:20 (40 mins early)
- Clock-out: 17:50 (50 mins late)

**Calculation:**
- Before-shift: 40 minutes → Meets threshold → 30 minutes (rounded)
- After-shift: 50 minutes → Meets threshold → 60 minutes (rounded)
- **Payable OT: 90 minutes total**

#### Scenario 3: Both Before and After (Combined Mode)
**Configuration:**
- Timing: Both
- Threshold: 60 minutes
- Rounding: 30 minutes, Nearest
- Mode: Combined

**Test Case:**
- Shift: 09:00 - 17:00
- Clock-in: 08:45 (15 mins early)
- Clock-out: 17:50 (50 mins late)

**Calculation:**
- Total raw: 15 + 50 = 65 minutes
- Meets threshold: ✓ (65 ≥ 60)
- Rounded total: 60 minutes
- Distributed: Before = 14 mins, After = 46 mins
- **Payable OT: 60 minutes total**

#### Scenario 4: Below Threshold
**Configuration:**
- Timing: After
- Threshold: 30 minutes
- Rounding: 15 minutes, Nearest

**Test Case:**
- Shift: 09:00 - 17:00
- Clock-out: 17:25 (25 mins late)

**Calculation:**
- After-shift: 25 minutes
- Below threshold: ✗ (25 < 30)
- **Payable OT: 0 minutes**

#### Scenario 5: Shift-Level Override
**Global Configuration:**
- Timing: Both
- Threshold: 30 minutes

**Shift Configuration:**
- Custom Timing: After shift only

**Test Case:**
- Clock-in: 08:30 (30 mins early)
- Clock-out: 17:45 (45 mins late)

**Calculation:**
- Before-shift: Ignored (shift override)
- After-shift: 45 minutes → 45 minutes
- **Payable OT: 45 minutes**

## Best Practices

### Configuration Recommendations

1. **Set Appropriate Threshold**
   - Too low: Excessive OT costs
   - Too high: Employee dissatisfaction
   - Recommended: 15-30 minutes for most industries

2. **Choose Rounding Wisely**
   - Consider payroll system compatibility
   - Smaller intervals = more precise, higher admin overhead
   - Larger intervals = simpler processing, potential disputes
   - Recommended: 15 minutes for general use

3. **Rounding Method Selection**
   - **Nearest**: Most fair to both parties
   - **Midpoint**: Slightly favors employer
   - **Start**: Most conservative, may demotivate employees

4. **Timing Configuration**
   - **Both**: Most comprehensive, fair to all scenarios
   - **After Only**: Common for industries with fixed start times
   - **Before Only**: Rare, usually for specific operational needs

5. **Rounding Mode (Both Timing)**
   - **Combined**: Simpler, fewer edge cases
   - **Separate**: More granular, better for complex policies

### Compliance Considerations

1. **Legal Requirements**
   - Verify overtime rules comply with local labor laws
   - Document configuration decisions
   - Maintain audit trail of changes

2. **Employee Communication**
   - Clearly explain OT calculation rules
   - Provide examples in employee handbook
   - Display current configuration in employee portal

3. **Record Keeping**
   - Store all configuration changes with timestamps
   - Keep records of calculated overtime
   - Enable audit logs for compliance verification

### Performance Optimization

1. **Database Queries**
   - Overtime calculation uses efficient database functions
   - Minimal round-trips for configuration retrieval
   - Indexed columns for fast lookups

2. **Caching Strategies**
   - Global configuration can be cached (changes infrequent)
   - Shift configuration loaded on-demand
   - Clear cache after configuration updates

3. **Batch Processing**
   - Calculate overtime during payroll processing batch
   - Avoid real-time calculation for historical data
   - Use database functions for bulk operations

## Integration Points

### Payroll System Integration

The overtime system is designed for seamless payroll integration:

1. **Overtime Minutes Available**
   - `before_shift_minutes`: Separated for detailed reporting
   - `after_shift_minutes`: Separated for detailed reporting
   - `total_overtime_minutes`: Payroll-ready value

2. **Payroll Calculation**
   ```typescript
   const overtimeResult = await calculateOvertime(...);
   const overtimeHours = overtimeResult.total_overtime_minutes / 60;
   const overtimePay = overtimeHours * overtimeRate;
   ```

3. **Reporting**
   - Include before/after breakdown in detailed reports
   - Show configuration used for each calculation
   - Track threshold application for compliance

### Attendance System Integration

1. **Clock-in/Clock-out Events**
   - Trigger overtime calculation after both timestamps recorded
   - Store calculated OT with attendance record
   - Update in real-time if timestamps modified

2. **Display in UI**
   - Show OT hours in attendance summaries
   - Highlight records with overtime
   - Provide drill-down to calculation details

## Troubleshooting

### Common Issues

**Issue: Overtime not calculating**
- ✓ Check global overtime is enabled
- ✓ Check shift overtime is enabled
- ✓ Verify clock-in/out times are recorded
- ✓ Confirm timing configuration matches scenario

**Issue: Unexpected overtime amounts**
- ✓ Review threshold setting
- ✓ Check rounding configuration
- ✓ Verify rounding mode (separate vs. combined)
- ✓ Test with preview calculator

**Issue: Configuration not saving**
- ✓ Check user permissions
- ✓ Verify tenant context is set
- ✓ Review browser console for errors
- ✓ Ensure database connection is active

**Issue: Shift override not working**
- ✓ Confirm "Use Custom Timing" is checked
- ✓ Verify timing option is selected
- ✓ Check that global OT is still enabled
- ✓ Review effective configuration display

### Debug Tools

1. **Preview Calculator**
   - Located in global overtime settings
   - Test configuration with sample values
   - Instant feedback on calculation results

2. **Browser Console**
   - Check for JavaScript errors
   - Review network requests
   - Inspect calculated values

3. **Database Queries**
   ```sql
   -- Check global configuration
   SELECT * FROM company_settings
   WHERE tenant_id = 'your-tenant-id';

   -- Check shift configuration
   SELECT id, name, overtime_enabled, overtime_config_override,
          overtime_calculation_timing
   FROM shifts
   WHERE tenant_id = 'your-tenant-id';

   -- Test calculation function
   SELECT * FROM calculate_overtime(
     'shift-id'::uuid,
     'tenant-id'::uuid,
     '09:00'::time,
     '17:00'::time,
     '08:30'::time,
     '17:45'::time
   );
   ```

## Security Considerations

1. **Row Level Security**
   - All tables use RLS for tenant isolation
   - Configuration changes require authentication
   - Functions use SECURITY DEFINER safely

2. **Audit Trail**
   - Configuration changes logged with timestamps
   - Calculation results stored with source data
   - User actions tracked for compliance

3. **Data Validation**
   - Input validation on all configuration fields
   - Range checking for threshold and intervals
   - Type safety in TypeScript implementation

## Future Enhancements

### Potential Features

1. **Multiple Overtime Rates**
   - Different rates for before vs. after
   - Tiered rates (e.g., first 2 hours, then higher rate)
   - Weekend/holiday premium rates

2. **Advanced Scheduling**
   - Automatic overtime prediction
   - Optimization suggestions
   - Overtime budget tracking

3. **Employee Preferences**
   - Opt-in/opt-out for voluntary OT
   - Preferred OT timing
   - Maximum OT limits per period

4. **Analytics Dashboard**
   - Overtime trends over time
   - Department-wise comparisons
   - Cost analysis and forecasting

5. **Integration Extensions**
   - Export to external payroll systems
   - API for third-party applications
   - Mobile app for OT approval

## Support and Maintenance

### Regular Maintenance Tasks

1. **Monthly Review**
   - Verify configuration still meets needs
   - Review calculated OT for anomalies
   - Check for any calculation errors

2. **Quarterly Audit**
   - Ensure compliance with labor laws
   - Review rounding methods for fairness
   - Update documentation as needed

3. **Annual Review**
   - Assess threshold appropriateness
   - Evaluate rounding interval effectiveness
   - Consider policy changes

### Getting Help

For technical support or questions:
1. Review this documentation thoroughly
2. Check troubleshooting section
3. Test with preview calculator
4. Review database logs
5. Contact system administrator

## Conclusion

The Overtime Calculation System provides a robust, flexible, and accurate solution for managing employee overtime. With its two-tier control structure, comprehensive configuration options, and precise calculation logic, it ensures fair compensation while maintaining operational control.

Key benefits:
- ✓ Flexible configuration at company and shift levels
- ✓ Accurate calculations with threshold and rounding
- ✓ Easy-to-use interface for administrators
- ✓ Payroll-ready output for seamless integration
- ✓ Compliant with labor regulations
- ✓ Scalable for organizations of any size

The system is production-ready and has been thoroughly tested to ensure reliability and accuracy in all scenarios.
