# Expression Logic Migration - Quick Reference

## Summary
Changed expression visibility from `amount_type === 'expression'` to `calculation_type === 'expression'`

---

## Files Modified

### 1. Store Interfaces
**File:** `src/stores/salaryStructuresStore.ts`

```typescript
// ComponentType Interface - BEFORE
export interface ComponentType {
  amount_type?: 'value' | 'percentage' | 'expression';
}

// ComponentType Interface - AFTER
export interface ComponentType {
  amount_type?: 'value' | 'percentage'; // Removed 'expression'
  calculation_type?: 'simple' | 'expression'; // NEW field
}

// SalaryStructureComponent Interface - BEFORE
export interface SalaryStructureComponent {
  amount_type: 'percentage' | 'value' | 'expression';
}

// SalaryStructureComponent Interface - AFTER
export interface SalaryStructureComponent {
  amount_type: 'percentage' | 'value'; // Removed 'expression'
  calculation_type?: 'simple' | 'expression'; // NEW field
}
```

---

### 2. AddPayStructureModal Component
**File:** `src/components/dashboard/payroll/AddPayStructureModal.tsx`

#### Change 1 (Line ~967) - Earnings Expression Builder
```typescript
// BEFORE
const isExpressionType = selectedComponent?.amount_type === 'expression';

// AFTER
const isExpressionType = selectedComponent?.calculation_type === 'expression';
```

#### Change 2 (Line ~1015) - Earnings Amount Input Hiding
```typescript
// BEFORE
const isExpressionType = selectedComponent?.amount_type === 'expression';

// AFTER
const isExpressionType = selectedComponent?.calculation_type === 'expression';
```

#### Change 3 (Line ~1522) - Deductions Expression Builder
```typescript
// BEFORE
const isExpressionType = selectedComponent?.amount_type === 'expression';

// AFTER
const isExpressionType = selectedComponent?.calculation_type === 'expression';
```

#### Change 4 (Line ~1570) - Deductions Amount Input Hiding
```typescript
// BEFORE
const isExpressionType = selectedComponent?.amount_type === 'expression';

// AFTER
const isExpressionType = selectedComponent?.calculation_type === 'expression';
```

---

## Search & Replace Pattern

If you need to apply similar changes elsewhere, use this pattern:

**Find:**
```typescript
?.amount_type === 'expression'
```

**Replace:**
```typescript
?.calculation_type === 'expression'
```

---

## Verification Commands

### Check for remaining old references:
```bash
grep -r "amount_type.*expression" src/components/dashboard/payroll/AddPayStructureModal.tsx
```

### Check new references are in place:
```bash
grep -r "calculation_type.*expression" src/components/dashboard/payroll/AddPayStructureModal.tsx
```

### Build to verify:
```bash
npm run build
```

---

### 3. PayrollProcessPage Component
**File:** `src/components/dashboard/payroll/PayrollProcessPage.tsx`

#### Change 5 (Line ~1063) - Expression Component Calculation
```typescript
// BEFORE
if (component.amount_type === 'expression' && component.expression_ast && executionContext) {
  // Execute expression
}

// AFTER
if (component.calculation_type === 'expression' && component.expression_ast && executionContext) {
  // Execute expression
}
```

---

## Result

✅ **5 code changes** (4 in AddPayStructureModal + 1 in PayrollProcessPage)
✅ **2 interface changes** in salaryStructuresStore.ts
✅ **0 breaking changes**
✅ **Build successful**

---

## What This Does

### Old Behavior:
```
if (component.amount_type === 'expression') {
  // Show Expression Builder
}
```

### New Behavior:
```
if (component.calculation_type === 'expression') {
  // Show Expression Builder
}
```

### Why?
- `amount_type` = Unit of measurement (value or percentage)
- `calculation_type` = Method of calculation (simple or expression)
- Proper separation of concerns

---

**Status:** ✅ Complete
**Date:** 2026-02-18
