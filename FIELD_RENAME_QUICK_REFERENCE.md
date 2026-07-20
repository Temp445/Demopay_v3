# Quick Reference: calculation_type → amount_type

## ⚡ TL;DR

**What Changed:** The field `calculation_type` has been renamed to `amount_type` throughout the entire application.

**Where:**
- Database table: `payroll_structure_components.amount_type`
- TypeScript interfaces: `SalaryStructureComponent.amount_type`
- Function parameters: `p_amount_type`

**Status:** ✅ Complete and deployed

---

## 🔍 Quick Lookup

### Database

```sql
-- OLD (❌ No longer valid)
SELECT calculation_type FROM payroll_structure_components;

-- NEW (✅ Use this)
SELECT amount_type FROM payroll_structure_components;
```

### TypeScript Interfaces

```typescript
// OLD (❌ No longer valid)
interface SalaryStructureComponent {
  calculation_type: 'percentage' | 'value' | 'expression';
}

// NEW (✅ Use this)
interface SalaryStructureComponent {
  amount_type: 'percentage' | 'value' | 'expression';
}
```

### Function Calls

```typescript
// OLD (❌ No longer valid)
await supabase.rpc('insert_pay_structure_component', {
  p_calculation_type: component.calculation_type,
  // ...
});

// NEW (✅ Use this)
await supabase.rpc('insert_pay_structure_component', {
  p_amount_type: component.amount_type,
  // ...
});
```

### React Components

```typescript
// OLD (❌ No longer valid)
{component.calculation_type === 'percentage' && (
  <div>Percentage-based</div>
)}

// NEW (✅ Use this)
{component.amount_type === 'percentage' && (
  <div>Percentage-based</div>
)}
```

---

## 📁 Files Changed

### Core Files (Must Know)
1. `src/stores/salaryStructuresStore.ts` - Interface & RPC calls
2. `src/components/dashboard/payroll/AddPayStructureModal.tsx` - UI component
3. `src/components/dashboard/payroll/PayrollProcessPage.tsx` - Processing logic

### Supporting Files
4. `src/types/overtime.ts` - OT type definitions
5. `src/components/dashboard/overtime/ComponentsModal.tsx` - OT UI
6. `src/lib/otManagement.ts` - OT management
7. `src/lib/advancePayrollIntegration.ts` - Advance integration

### Database
- Migration: `rename_calculation_type_to_amount_type.sql`
- Functions: `get_payroll_structure_details`, `insert_pay_structure_component`

---

## 🚨 Common Mistakes to Avoid

### ❌ DON'T DO THIS

```typescript
// Using old field name
const type = component.calculation_type; // ❌ ERROR: Property doesn't exist

// Using old parameter name
await supabase.rpc('insert_pay_structure_component', {
  p_calculation_type: 'value', // ❌ ERROR: Function doesn't accept this parameter
});

// Old database query
SELECT calculation_type FROM payroll_structure_components; // ❌ ERROR: Column doesn't exist
```

### ✅ DO THIS INSTEAD

```typescript
// Using new field name
const type = component.amount_type; // ✅ CORRECT

// Using new parameter name
await supabase.rpc('insert_pay_structure_component', {
  p_amount_type: 'value', // ✅ CORRECT
});

// New database query
SELECT amount_type FROM payroll_structure_components; // ✅ CORRECT
```

---

## 🔧 Developer Checklist

When working with payroll/salary components:

- [ ] Use `amount_type` instead of `calculation_type`
- [ ] Update TypeScript interfaces to use `amount_type`
- [ ] Use `p_amount_type` parameter in RPC calls
- [ ] Reference `component.amount_type` in UI code
- [ ] Query `amount_type` column in database queries
- [ ] Update comments/documentation to use new name

---

## 💡 What Does amount_type Mean?

**Values:**
- `'value'` - Fixed amount (e.g., $500)
- `'percentage'` - Percentage of other components (e.g., 10%)
- `'expression'` - Calculated via formula/expression

**Usage:**
- Determines how a component's amount is calculated
- Used in payroll processing to apply correct calculation logic
- Affects UI display (show $ input vs % input vs formula builder)

---

## 🐛 Troubleshooting

### Error: "Property 'calculation_type' does not exist"

**Cause:** Code is using old field name
**Fix:** Replace `calculation_type` with `amount_type`

### Error: "column calculation_type does not exist"

**Cause:** Database query using old column name
**Fix:** Replace `calculation_type` with `amount_type` in SQL

### Error: "function insert_pay_structure_component(p_calculation_type => ...)"

**Cause:** Function call using old parameter name
**Fix:** Replace `p_calculation_type` with `p_amount_type`

---

## 📞 Need Help?

**Documentation:** See `CALCULATION_TYPE_TO_AMOUNT_TYPE_MIGRATION.md`
**Migration File:** `supabase/migrations/rename_calculation_type_to_amount_type.sql`
**Build Status:** ✅ All changes verified and building successfully

---

**Last Updated:** 2026-02-18
**Status:** ✅ Production Ready
