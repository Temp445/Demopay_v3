# UI Mockup - Statutory Deduction Checkbox

## Visual Representation

### Before Implementation
```
┌────────────────────────────────────────────────────┐
│ 🔒 Statutory Deduction (Locked)                    │
│                                                     │
│ Name: [PF - Employee          ] (disabled)         │
│                                                     │
│ Calculation Type:                                  │
│ ○ Value (Fixed Amount)  ○ Percentage               │
│                                                     │
│ Amount: [₹ 1800.00] (disabled)                     │
└────────────────────────────────────────────────────┘
```

### After Implementation (Checked - Applied)
```
┌────────────────────────────────────────────────────┐
│ 🔒 Statutory Deduction (Locked)                    │
│                                                     │
│ ☑ Apply in payroll calculation                     │
│                                                     │
│ Name: [PF - Employee          ] (disabled)         │
│                                                     │
│ Calculation Type:                                  │
│ ○ Value (Fixed Amount)  ○ Percentage               │
│                                                     │
│ Amount: [₹ 1800.00] (disabled)                     │
└────────────────────────────────────────────────────┘
```

### After Implementation (Unchecked - NOT Applied)
```
┌────────────────────────────────────────────────────┐
│ 🔒 Statutory Deduction (Locked)                    │
│                                                     │
│ ☐ Apply in payroll calculation                     │
│                                                     │
│ ┌────────────────────────────────────────────────┐ │
│ │ ⓘ This component will appear in payroll        │ │
│ │   reports but will NOT be applied in salary    │ │
│ │   calculations                                 │ │
│ └────────────────────────────────────────────────┘ │
│                                                     │
│ Name: [PF - Employee          ] (disabled)         │
│                                                     │
│ Calculation Type:                                  │
│ ○ Value (Fixed Amount)  ○ Percentage               │
│                                                     │
│ Amount: [₹ 1800.00] (disabled)                     │
└────────────────────────────────────────────────────┘
```

## Color Scheme

### Component Card
- **Background**: `bg-indigo-50` (light indigo)
- **Border**: `border-indigo-200` (indigo border)

### Lock Header
- **Text Color**: `text-indigo-700` (indigo)
- **Font**: Small, medium weight
- **Icon**: Lock icon, height 4, width 4

### Checkbox
- **Active Color**: `text-indigo-600`
- **Focus Ring**: `focus:ring-indigo-500`
- **Border**: `border-gray-300`
- **Size**: 4x4 (h-4 w-4)
- **Style**: Rounded

### Checkbox Label
- **Text Color**: `text-gray-700`
- **Font Size**: Small (text-sm)

### Warning Box (When Unchecked)
- **Background**: `bg-amber-50` (light amber/yellow)
- **Border**: `border-amber-200` (amber border)
- **Text Color**: `text-amber-700` (dark amber)
- **Font Size**: Extra small (text-xs)
- **Padding**: px-3 py-2
- **Icon**: ⓘ (info icon)

## Layout Specifications

### Spacing
```
Lock Header
  ↓ (mb-2)
Checkbox Label
  ↓ (mt-2)
Warning Box (conditional)
  ↓ (mt-2, mb-3)
Component Form Fields
```

### Checkbox Structure
```html
<label class="flex items-center cursor-pointer mt-2">
  <input type="checkbox" class="h-4 w-4 text-indigo-600 ..." />
  <span class="ml-2 text-sm text-gray-700">
    Apply in payroll calculation
  </span>
</label>
```

### Warning Box Structure
```html
<div class="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 flex items-start">
  <span class="font-semibold mr-1">ⓘ</span>
  <span>
    This component will appear in payroll reports but will NOT be applied in salary calculations
  </span>
</div>
```

## Interactive States

### Checkbox States

| State | Visual | Description |
|-------|--------|-------------|
| Checked | ☑ | Component applied in calculations |
| Unchecked | ☐ | Component NOT applied, warning visible |
| Hover (checked) | ☑ (highlighted) | Cursor: pointer, slight highlight |
| Hover (unchecked) | ☐ (highlighted) | Cursor: pointer, slight highlight |
| Focus | ☑ (ring) | Focus ring appears around checkbox |

### Warning Message States

| Condition | Visibility |
|-----------|-----------|
| `is_applied_in_calculation === true` | Hidden |
| `is_applied_in_calculation === false` | Visible |
| `is_applied_in_calculation === undefined` | Hidden (treated as true) |

## Accessibility

### ARIA Labels
- Checkbox has implicit label through `<label>` wrapper
- Warning message uses semantic HTML with proper contrast ratios

### Keyboard Navigation
- **Tab**: Focus on checkbox
- **Space**: Toggle checkbox
- **Enter**: Toggle checkbox (when focused)

### Screen Reader Behavior
1. Reads: "Apply in payroll calculation, checkbox, checked"
2. When unchecked: "Apply in payroll calculation, checkbox, not checked"
3. Warning message is read when checkbox is unchecked

## Responsive Behavior

### Mobile (< 640px)
- Checkbox label may wrap to two lines if needed
- Warning message text wraps naturally
- Full width layout maintained

### Tablet (640px - 1024px)
- Same as desktop
- No special adjustments needed

### Desktop (> 1024px)
- Optimal layout as shown in mockups above

## Example: Multiple Statutory Components

```
┌─────────────────────────────────────────────────────────┐
│ Add Statutory: [+ Provident Fund (PF)] [+ ESI] [+ Tax] │
└─────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────┐
│ 🔒 Statutory Deduction (Locked)                    │
│ ☑ Apply in payroll calculation                     │
│ Name: PF - Employee [₹ 1800.00]                    │
└────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────┐
│ 🔒 Statutory Deduction (Locked)                    │
│ ☐ Apply in payroll calculation                     │
│ ⚠ Component will appear in reports but NOT         │
│    applied in calculations                         │
│ Name: PF - Employer [₹ 1800.00]                    │
└────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────┐
│ 🔒 Statutory Deduction (Locked)                    │
│ ☑ Apply in payroll calculation                     │
│ Name: ESI - Employee [₹ 500.00]                    │
└────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────┐
│ 🔒 Statutory Deduction (Locked)                    │
│ ☑ Apply in payroll calculation                     │
│ Name: ESI - Employer [₹ 1500.00]                   │
└────────────────────────────────────────────────────┘
```

## User Flow

1. **Initial State**: User opens Add/Edit Salary Structure modal
2. **Add Statutory**: User clicks "Provident Fund (PF)" button
3. **Components Added**: Both PF Employee and PF Employer are added with checkboxes CHECKED
4. **User Decision**: User wants to exclude employer contribution
5. **Uncheck**: User unchecks "Apply in payroll calculation" for PF Employer
6. **Warning Appears**: Amber warning box shows below checkbox
7. **Save**: User saves the structure
8. **Persistence**: Checkbox states are saved to database
9. **Reopen**: User reopens the modal → checkbox states preserved

## Component Hierarchy

```
Modal
└── Form
    └── Deductions Section
        └── Deduction Component (map)
            └── Component Card (div)
                ├── Statutory Header (conditional)
                │   ├── Lock Icon + Label
                │   ├── Checkbox + Label ← NEW
                │   └── Warning Message (conditional) ← NEW
                └── Component Form Fields
                    ├── Name Input
                    ├── Calculation Type
                    ├── Amount/Percentage
                    └── Remove Button
```

## CSS Classes Reference

```css
/* Checkbox Container */
.flex.items-center.cursor-pointer.mt-2

/* Checkbox Input */
.h-4.w-4.text-indigo-600.focus:ring-indigo-500.border-gray-300.rounded

/* Checkbox Label */
.ml-2.text-sm.text-gray-700

/* Warning Box */
.mt-2.text-xs.text-amber-700.bg-amber-50.border.border-amber-200.rounded.px-3.py-2.flex.items-start

/* Warning Icon */
.font-semibold.mr-1

/* Statutory Card Background */
.bg-indigo-50.border-indigo-200
```

## Testing Visual Checklist

- [ ] Checkbox appears only for statutory deductions
- [ ] Checkbox is properly aligned with label
- [ ] Label text is readable and clear
- [ ] Warning box has proper spacing
- [ ] Warning box uses amber/yellow color scheme
- [ ] Info icon (ⓘ) displays correctly
- [ ] Checkbox is keyboard accessible
- [ ] Focus ring appears when checkbox is focused
- [ ] Checkbox state changes on click
- [ ] Warning appears/disappears based on checkbox state
- [ ] Layout works on mobile devices
- [ ] Colors contrast well with indigo background
- [ ] Consistent spacing with other elements
