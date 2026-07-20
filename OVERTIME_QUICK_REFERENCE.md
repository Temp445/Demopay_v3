# Overtime System - Quick Reference Guide

## Quick Setup (5 Minutes)

### Step 1: Enable Globally
1. Go to **Settings → Overtime** tab
2. Toggle **Enable Overtime** ON
3. Set **Threshold**: 30 minutes (recommended)
4. Set **Rounding**: 15 minutes, Nearest
5. Click **Save**

### Step 2: Configure Shifts (Optional)
1. Go to **Shifts Management**
2. Click **Clock icon** (⏰) next to any shift
3. Verify **Enable Overtime** is ON
4. Save if making changes

### Step 3: Test
1. In Settings → Overtime, expand **Preview Calculator**
2. Enter test values (e.g., Before: 25, After: 45)
3. Verify calculation is correct

## Configuration Options

| Setting | Options | Recommended |
|---------|---------|-------------|
| **Enable** | ON/OFF | ON |
| **Timing** | Before, After, Both | Both |
| **Threshold** | 0-480 minutes | 30 minutes |
| **Rounding Interval** | 10, 15, 30, 60 min | 15 minutes |
| **Rounding Method** | Nearest, Midpoint, Start | Nearest |
| **Rounding Mode** | Separate, Combined | Combined |

## Calculation Formula

### Simple Case (After-shift only)
```
If clock_out > shift_end:
  OT = clock_out - shift_end
  If OT >= threshold:
    Payable_OT = round(OT, interval, method)
  Else:
    Payable_OT = 0
```

### Example
- Shift End: 17:00
- Clock Out: 17:50
- Raw OT: 50 minutes
- Threshold: 30 ✓ (passes)
- Rounded (15 min, nearest): **45 minutes payable**

## Common Scenarios

### Scenario: Employee Works 40 mins Late
**Config**: After-only, 30-min threshold, 15-min rounding
- Raw OT: 40 minutes
- Threshold: ✓ (40 ≥ 30)
- Rounded: 45 minutes
- **Result: 45 minutes OT**

### Scenario: Employee Works 25 mins Late
**Config**: After-only, 30-min threshold
- Raw OT: 25 minutes
- Threshold: ✗ (25 < 30)
- **Result: 0 minutes OT**

### Scenario: Early & Late (Combined)
**Config**: Both, 60-min threshold, 30-min rounding, Combined mode
- Clock-in 20 mins early: 20 minutes
- Clock-out 45 mins late: 45 minutes
- Total: 65 minutes
- Threshold: ✓ (65 ≥ 60)
- Rounded: 60 minutes
- **Result: 60 minutes OT**

### Scenario: Early & Late (Separate)
**Config**: Both, 30-min threshold, 15-min rounding, Separate mode
- Clock-in 25 mins early: Below threshold → 0
- Clock-out 45 mins late: Above threshold → 45 minutes
- **Result: 45 minutes OT**

## Rounding Method Examples

**Given: 37 minutes raw OT, 15-minute interval**

| Method | Result | Why |
|--------|--------|-----|
| Nearest | 30 | 37 is closer to 30 than 45 |
| Midpoint | 45 | 37 > midpoint (22.5), rounds up |
| Start | 30 | Always rounds down |

## Access Points

| Feature | Location | Icon |
|---------|----------|------|
| Global Config | Settings → Overtime | ⏰ Clock |
| Shift Config | Shifts → Clock icon | ⏰ Clock |
| Preview Calc | Settings → Overtime → Show Preview | ℹ️ Info |

## Validation Rules

✓ **Valid:**
- Threshold: 30, Interval: 30
- Threshold: 30, Interval: 60
- Threshold: 15, Interval: 30

✗ **Invalid:**
- Threshold: 30, Interval: 10 (interval < threshold)
- Threshold: 25, Interval: 30 (not multiple)

## Troubleshooting

| Problem | Solution |
|---------|----------|
| No OT calculated | Check global & shift both enabled |
| Wrong OT amount | Review threshold and rounding |
| Config won't save | Verify user permissions |
| Shift override not working | Ensure "Use Custom Timing" checked |

## Database Functions

### Calculate Overtime (Direct Call)
```sql
SELECT * FROM calculate_overtime(
  'shift-uuid'::uuid,
  'tenant-uuid'::uuid,
  '09:00'::time,  -- shift start
  '17:00'::time,  -- shift end
  '08:30'::time,  -- actual clock-in
  '17:45'::time   -- actual clock-out
);
```

### Get Configuration
```sql
SELECT * FROM get_overtime_config(
  'shift-uuid'::uuid,
  'tenant-uuid'::uuid
);
```

## Frontend Integration

### Calculate OT in Code
```typescript
import { calculateOvertime } from '../lib/overtime';

const result = await calculateOvertime(
  shiftId,
  shiftStartTime,
  shiftEndTime,
  actualClockIn,
  actualClockOut
);

console.log(`Total OT: ${result.total_overtime_minutes} minutes`);
```

### Format for Display
```typescript
import { formatOvertimeDisplay } from '../lib/overtime';

const formatted = formatOvertimeDisplay(95);
// Returns: "1h 35m"
```

## Key Design Decisions

1. **Threshold is NOT deducted** - When threshold is met, full duration counts
2. **Both levels must enable** - Global AND shift must both be ON
3. **Shift can override timing only** - Threshold/rounding always from global
4. **Database does calculation** - Ensures consistency across all access points
5. **Separate tracking** - Before and after OT tracked separately for reporting

## Testing Checklist

- [ ] Enable global overtime
- [ ] Set threshold and rounding
- [ ] Test with preview calculator
- [ ] Enable on test shift
- [ ] Create test attendance record
- [ ] Verify OT calculated correctly
- [ ] Test shift override
- [ ] Test disable scenarios
- [ ] Verify payroll integration

## Files Modified

| File | Purpose |
|------|---------|
| `create_overtime_calculation_system.sql` | Database migration |
| `src/lib/overtime.ts` | Core utilities |
| `src/components/dashboard/settings/OvertimeSettings.tsx` | Global config UI |
| `src/components/dashboard/shifts/ShiftOvertimeConfig.tsx` | Shift config UI |
| `src/components/dashboard/settings/SettingsPage.tsx` | Added overtime tab |
| `src/components/dashboard/shifts/ShiftList.tsx` | Added config button |

## Support

- Documentation: `OVERTIME_CALCULATION_SYSTEM.md`
- Configuration: Settings → Overtime
- Test Tool: Preview Calculator (in settings)

---

**Version**: 1.0
**Last Updated**: 2024
**Status**: ✅ Production Ready
