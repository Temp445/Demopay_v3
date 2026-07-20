# Overtime Calculation Flow - Visual Guide

## System Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    OVERTIME SYSTEM START                     │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
                    ┌────────────────────┐
                    │ Global OT Enabled? │
                    └────────┬───────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
            [NO]          [YES]          [NULL]
              │              │              │
              └──────────────┼──────────────┘
                             │
                             ▼
                    ┌────────────────────┐
                    │ Shift OT Enabled?  │
                    └────────┬───────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
            [NO]          [YES]          [NULL]
              │              │              │
              │              │              └──► Use Default (YES)
              │              │
              └──────────────┼──────────────┐
                             │              │
                             ▼              ▼
                        [ENABLED]    [DISABLED]
                             │              │
                             │              └──► RETURN: 0 OT
                             │
                             ▼
                    ┌────────────────────┐
                    │ Get Configuration  │
                    │  - Timing          │
                    │  - Threshold       │
                    │  - Rounding Rules  │
                    └────────┬───────────┘
                             │
                             ▼
                    ┌────────────────────┐
                    │  Calculate Raw OT  │
                    └────────┬───────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
        [BEFORE ONLY]   [AFTER ONLY]    [BOTH]
              │              │              │
              └──────────────┼──────────────┘
                             │
                             ▼
                    ┌────────────────────┐
                    │  Apply Threshold   │
                    └────────┬───────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
       [BELOW THRESHOLD] [MEETS THRESHOLD] [NULL]
              │              │              │
              └──► 0 OT      │              └──► SKIP
                             │
                             ▼
                    ┌────────────────────┐
                    │  Apply Rounding    │
                    └────────┬───────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
         [SEPARATE]     [COMBINED]     [ERROR]
              │              │              │
              │              │              └──► RETURN ERROR
              │              │
              └──────────────┼──────────────┘
                             │
                             ▼
                    ┌────────────────────┐
                    │  RETURN PAYABLE OT │
                    │   - Before: X mins │
                    │   - After:  Y mins │
                    │   - Total:  Z mins │
                    └────────────────────┘
```

## Detailed Calculation Flow

### 1. Configuration Resolution

```
START: Calculate OT for Shift Assignment
│
├─► Load Global Configuration
│   ├─ overtime_enabled
│   ├─ overtime_calculation_timing
│   ├─ overtime_threshold_minutes
│   ├─ overtime_rounding_interval
│   ├─ overtime_rounding_method
│   └─ overtime_rounding_mode
│
├─► Load Shift Configuration
│   ├─ overtime_enabled
│   ├─ overtime_config_override
│   └─ overtime_calculation_timing (if override)
│
└─► Merge Configurations
    ├─ Enabled = Global.enabled AND Shift.enabled
    ├─ Timing = Shift.timing (if override) ELSE Global.timing
    └─ Others = Always from Global
```

### 2. Raw Overtime Calculation

```
INPUT:
  - shift_start: 09:00
  - shift_end: 17:00
  - clock_in: 08:30
  - clock_out: 17:45
  - timing: "both"

PROCESS:

┌─────────────────────────────────────────┐
│        BEFORE-SHIFT CALCULATION         │
├─────────────────────────────────────────┤
│ IF timing IN ['before', 'both']:        │
│   IF clock_in < shift_start:            │
│     before_minutes =                    │
│       shift_start - clock_in            │
│   ELSE:                                 │
│     before_minutes = 0                  │
│                                         │
│ EXAMPLE:                                │
│   09:00 - 08:30 = 30 minutes            │
└─────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│         AFTER-SHIFT CALCULATION         │
├─────────────────────────────────────────┤
│ IF timing IN ['after', 'both']:         │
│   IF clock_out > shift_end:             │
│     after_minutes =                     │
│       clock_out - shift_end             │
│   ELSE:                                 │
│     after_minutes = 0                   │
│                                         │
│ EXAMPLE:                                │
│   17:45 - 17:00 = 45 minutes            │
└─────────────────────────────────────────┘

OUTPUT:
  - before_minutes: 30
  - after_minutes: 45
```

### 3. Threshold Application

```
INPUT:
  - before_minutes: 30
  - after_minutes: 45
  - threshold: 30
  - mode: "combined"

┌───────────────────────────────────────────────────┐
│              SEPARATE MODE                        │
├───────────────────────────────────────────────────┤
│                                                   │
│  ┌─────────────────────┐  ┌────────────────────┐ │
│  │ Before-Shift Check  │  │ After-Shift Check  │ │
│  └─────────┬───────────┘  └────────┬───────────┘ │
│            │                       │             │
│            ▼                       ▼             │
│    ┌───────────────┐      ┌───────────────┐     │
│    │ 30 >= 30?     │      │ 45 >= 30?     │     │
│    │ YES ✓         │      │ YES ✓         │     │
│    └───────┬───────┘      └───────┬───────┘     │
│            │                       │             │
│            ▼                       ▼             │
│       Keep 30 mins            Keep 45 mins      │
│                                                   │
│  Result: 30 + 45 = 75 minutes (before rounding) │
└───────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────┐
│              COMBINED MODE                        │
├───────────────────────────────────────────────────┤
│                                                   │
│            ┌─────────────────────┐                │
│            │ Total = 30 + 45     │                │
│            │ Total = 75 minutes  │                │
│            └─────────┬───────────┘                │
│                      │                            │
│                      ▼                            │
│            ┌─────────────────────┐                │
│            │ 75 >= 30?           │                │
│            │ YES ✓               │                │
│            └─────────┬───────────┘                │
│                      │                            │
│                      ▼                            │
│           Keep 75 minutes total                   │
│      (will be rounded, then distributed)          │
│                                                   │
└───────────────────────────────────────────────────┘
```

### 4. Rounding Application

```
INPUT:
  - raw_minutes: 75
  - interval: 30
  - method: "nearest"

┌─────────────────────────────────────────────────┐
│              ROUNDING PROCESS                   │
├─────────────────────────────────────────────────┤
│                                                 │
│  Step 1: Calculate Quotient & Remainder        │
│  ┌──────────────────────────────────────┐      │
│  │ quotient = 75 / 30 = 2               │      │
│  │ remainder = 75 % 30 = 15             │      │
│  └──────────────────────────────────────┘      │
│                                                 │
│  Step 2: Apply Method                          │
│  ┌──────────────────────────────────────┐      │
│  │ Method: "nearest"                    │      │
│  │ Midpoint = 30 / 2 = 15               │      │
│  │ remainder (15) >= midpoint (15)?     │      │
│  │ YES → Round UP                       │      │
│  │ Result = (2 + 1) * 30 = 90          │      │
│  └──────────────────────────────────────┘      │
│                                                 │
│  Alternative Methods:                          │
│  ┌──────────────────────────────────────┐      │
│  │ "midpoint": 15 > 15? NO → 60        │      │
│  │ "start": Always down → 60            │      │
│  └──────────────────────────────────────┘      │
│                                                 │
└─────────────────────────────────────────────────┘

RESULT: 90 minutes (rounded)
```

### 5. Distribution (Combined Mode)

```
INPUT:
  - total_rounded: 90
  - before_raw: 30
  - after_raw: 45
  - total_raw: 75

┌─────────────────────────────────────────────────┐
│        PROPORTIONAL DISTRIBUTION                │
├─────────────────────────────────────────────────┤
│                                                 │
│  Calculate Proportions:                        │
│  ┌──────────────────────────────────────┐      │
│  │ before_proportion = 30 / 75 = 0.4    │      │
│  │ after_proportion = 45 / 75 = 0.6     │      │
│  └──────────────────────────────────────┘      │
│                                                 │
│  Apply to Rounded Total:                       │
│  ┌──────────────────────────────────────┐      │
│  │ before_final = 0.4 * 90 = 36         │      │
│  │ after_final = 90 - 36 = 54           │      │
│  └──────────────────────────────────────┘      │
│                                                 │
│  Verification:                                 │
│  ┌──────────────────────────────────────┐      │
│  │ 36 + 54 = 90 ✓                       │      │
│  └──────────────────────────────────────┘      │
│                                                 │
└─────────────────────────────────────────────────┘

FINAL OUTPUT:
  - before_shift_minutes: 36
  - after_shift_minutes: 54
  - total_overtime_minutes: 90
  - is_overtime_applicable: true
```

## Decision Tree

```
Employee Clocks In/Out
        │
        ▼
┌────────────────────┐
│ Is Global OT ON?   │
└────┬───────────────┘
     │
   NO│        YES
     ▼         │
   [STOP]     ▼
        ┌────────────────────┐
        │ Is Shift OT ON?    │
        └────┬───────────────┘
             │
           NO│        YES
             ▼         │
           [STOP]     ▼
                ┌────────────────────┐
                │ Get Timing Config  │
                └────┬───────────────┘
                     │
        ┌────────────┼────────────┐
        │            │            │
    BEFORE        AFTER        BOTH
        │            │            │
        └────────────┼────────────┘
                     │
                     ▼
            ┌─────────────────┐
            │ Calculate Raw OT│
            └────┬────────────┘
                 │
        ┌────────┼────────┐
        │                 │
    BEFORE             AFTER
    30 mins            45 mins
        │                 │
        └────────┼────────┘
                 │
                 ▼
        ┌─────────────────┐
        │ Apply Threshold │
        │ (30 minutes)    │
        └────┬────────────┘
             │
             ▼
    ┌─────────────────┐
    │ Meets Threshold?│
    └────┬────────────┘
         │
     NO  │    YES
         ▼     │
      [STOP]   ▼
          ┌────────────┐
          │   Rounding │
          │  (30 mins) │
          └────┬───────┘
               │
          ┌────┼────┐
          │         │
      SEPARATE  COMBINED
          │         │
          └────┬────┘
               │
               ▼
         ┌──────────┐
         │ PAYABLE  │
         │ OVERTIME │
         └──────────┘
```

## Time-Based Example Flow

```
SHIFT DEFINITION:
╔═══════════════════════════════════════╗
║  Morning Shift                        ║
║  Start: 09:00                         ║
║  End:   17:00                         ║
║  Break: 1 hour                        ║
╚═══════════════════════════════════════╝

EMPLOYEE ATTENDANCE:
╔═══════════════════════════════════════╗
║  Clock-in:  08:30 (30 mins early)    ║
║  Clock-out: 18:15 (75 mins late)     ║
╚═══════════════════════════════════════╝

TIMELINE:
08:00    08:30        09:00              17:00         18:15    19:00
  |        |            |                  |             |        |
  ├────────┼────────────┼──────────────────┼─────────────┼────────┤
  │◄──────►│◄──────────►│                  │◄───────────►│        │
  │30 mins │ 30 mins    │   Regular Work   │  75 mins    │        │
  │too     │ BEFORE-OT  │   (8 hours)      │  AFTER-OT   │        │
  │early   │            │                  │             │        │
  │(ignore)│            │                  │             │        │

CONFIGURATION:
┌─────────────────────────────────────┐
│ Timing: Both                        │
│ Threshold: 30 minutes               │
│ Rounding: 30 minutes                │
│ Method: Nearest                     │
│ Mode: Combined                      │
└─────────────────────────────────────┘

CALCULATION:
┌─────────────────────────────────────┐
│ Raw OT:                             │
│   Before: 30 minutes                │
│   After:  75 minutes                │
│   Total:  105 minutes               │
│                                     │
│ Threshold Check:                    │
│   105 >= 30? YES ✓                  │
│                                     │
│ Rounding (Combined):                │
│   quotient = 105 / 30 = 3           │
│   remainder = 105 % 30 = 15         │
│   15 >= 15 (midpoint)? YES          │
│   Rounded = (3 + 1) * 30 = 120      │
│                                     │
│ Distribution:                       │
│   Before = (30/105) * 120 ≈ 34      │
│   After = 120 - 34 = 86             │
└─────────────────────────────────────┘

PAYABLE OVERTIME:
╔═════════════════════════════════════╗
║ Before-shift: 34 minutes            ║
║ After-shift:  86 minutes            ║
║ TOTAL:        120 minutes (2 hours) ║
╚═════════════════════════════════════╝
```

## Comparison: Separate vs. Combined Modes

```
SCENARIO: 30 mins early, 25 mins late
THRESHOLD: 30 minutes
ROUNDING: 15 minutes, Nearest

┌─────────────────────────────────────────────────┐
│              SEPARATE MODE                      │
├─────────────────────────────────────────────────┤
│                                                 │
│  Before-shift: 30 minutes                      │
│    ├─ Threshold: 30 >= 30? YES ✓               │
│    ├─ Rounded: 30 → 30 minutes                 │
│    └─ Payable: 30 minutes                      │
│                                                 │
│  After-shift: 25 minutes                       │
│    ├─ Threshold: 25 >= 30? NO ✗                │
│    └─ Payable: 0 minutes                       │
│                                                 │
│  TOTAL PAYABLE: 30 minutes                     │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│              COMBINED MODE                      │
├─────────────────────────────────────────────────┤
│                                                 │
│  Total Raw: 30 + 25 = 55 minutes               │
│    ├─ Threshold: 55 >= 30? YES ✓               │
│    ├─ Rounded: 55 → 60 minutes                 │
│    └─ Distribution:                            │
│       ├─ Before: (30/55) * 60 ≈ 33 minutes     │
│       └─ After: 60 - 33 = 27 minutes           │
│                                                 │
│  TOTAL PAYABLE: 60 minutes                     │
└─────────────────────────────────────────────────┘

DIFFERENCE: Combined mode gives 30 more minutes!
```

## Status Indicators

```
System Status Display:

┌──────────────────────────────────┐
│ ● OVERTIME ENABLED               │  Green: Active
│   Calculation Mode: Both         │
│   Threshold: 30 minutes          │
│   Rounding: 15 min, Nearest      │
└──────────────────────────────────┘

┌──────────────────────────────────┐
│ ○ OVERTIME DISABLED              │  Gray: Inactive
│   Enable in Settings to activate │
└──────────────────────────────────┘

Shift Status:
┌──────────────────────────────────┐
│ Morning Shift                    │
│ ● OT Enabled (Using Global)      │  Green: Active
│ ○ Custom Timing: None            │  Gray: Default
└──────────────────────────────────┘

┌──────────────────────────────────┐
│ Night Shift                      │
│ ● OT Enabled (Custom Config)     │  Green: Active
│ ● Custom Timing: After Only      │  Blue: Custom
└──────────────────────────────────┘
```

## Quick Reference Icons

```
⏰ - Overtime Configuration
✓ - Enabled / Active
✗ - Disabled / Inactive
● - Status ON
○ - Status OFF
▶ - Expand Details
◀ - Collapse Details
⚙️ - Settings
📊 - Reports/Analytics
🔒 - Requires Permission
⚠️ - Warning/Validation
ℹ️ - Information
```

---

**Purpose**: Visual guide for understanding overtime calculation flow
**Audience**: Administrators, Developers, Support Staff
**Version**: 1.0
