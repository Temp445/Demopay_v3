# Formula Builder Variable Panel - Quick Reference

## 🎯 What Changed?

**Variable Panel data source changed from `expression_variables` table to `payroll_components` table.**

---

## 📋 Quick Summary

| Aspect | Before | After |
|--------|--------|-------|
| **Data Source** | `expression_variables` table | `payroll_components` table |
| **Grouping Field** | `category` | `component_category` |
| **Variable Names** | `variable_name` | `name` (component name) |
| **Categories** | Custom defined | Based on component_category |

---

## 🔄 Category Mapping

### From payroll_components → Variable Panel

```typescript
component_category: 'general'      → category: 'salary_component'
                                      Display: "Salary Components"
                                      Icon: 💾

component_category: 'calculation'  → category: 'calculation_parameter'
                                      Display: "Calculation Parameters"
                                      Icon: 🧮
```

---

## 📝 Files Modified

### 1. expressionStore.ts (Main Change)

**Location:** `src/stores/expressionStore.ts`

**Function:** `fetchVariables()`

**Change:**
```typescript
// OLD
.from('expression_variables')
.order('category', { ascending: true });

// NEW
.from('payroll_components')
.order('component_category', { ascending: true });
```

**Mapping:**
```typescript
// OLD mapping
variableName: item.variable_name,
category: item.category,
dataType: item.data_type,

// NEW mapping
variableName: item.name,
category: item.component_category === 'calculation' ? 'calculation_parameter' : 'salary_component',
dataType: 'number',
```

### 2. VariablePanel.tsx (Documentation Only)

**Location:** `src/components/dashboard/formula-builder/VariablePanel.tsx`

**Change:** Added documentation comments (no functional changes)

---

## 🧪 Quick Test

### Check Variables Display

```typescript
// 1. Open Formula Builder
// Navigate to: Dashboard → Formula Builder

// 2. Check Variable Panel
// Should see sections:
// - Salary Components (general payroll components)
// - Calculation Parameters (calculation payroll components)

// 3. Test Variable Insertion
// Click on a variable → Should insert into expression editor

// 4. Test Expression
const expression = 'BasicSalary * 0.12';
const context = { BasicSalary: 15000 };
// Result should be: 1800
```

---

## 💾 Database Query

### Fetch Variables (Manual Test)

```sql
-- Check what variables will be loaded
SELECT
  id,
  name AS variableName,
  component_category,
  CASE
    WHEN component_category = 'calculation' THEN 'calculation_parameter'
    WHEN component_category = 'general' THEN 'salary_component'
    ELSE 'salary_component'
  END AS mapped_category,
  description,
  is_active
FROM payroll_components
WHERE tenant_id = 'your-tenant-id'
  AND is_active = true
ORDER BY component_category ASC;
```

---

## 🔧 Troubleshooting

### Issue: No variables showing

**Check:**
```sql
-- Ensure payroll components exist
SELECT COUNT(*) FROM payroll_components
WHERE is_active = true;

-- Should return > 0
```

### Issue: Variables not grouped correctly

**Check:**
```sql
-- Verify component_category values
SELECT DISTINCT component_category
FROM payroll_components;

-- Should return: 'general' and/or 'calculation'
```

### Issue: Variables show wrong names

**Check:**
```sql
-- Verify component names
SELECT name, component_category
FROM payroll_components
WHERE is_active = true
LIMIT 5;

-- Names should be what you want to appear in formula builder
```

---

## 📊 Example Data

### Sample Payroll Components

```sql
-- General components (appear in "Salary Components")
INSERT INTO payroll_components (name, component_category, component_type, is_active, tenant_id)
VALUES
  ('Basic Salary', 'general', 'earning', true, 'tenant-123'),
  ('HRA', 'general', 'earning', true, 'tenant-123'),
  ('Transport Allowance', 'general', 'earning', true, 'tenant-123');

-- Calculation components (appear in "Calculation Parameters")
INSERT INTO payroll_components (name, component_category, component_type, is_active, tenant_id)
VALUES
  ('Overtime Rate', 'calculation', 'earning', true, 'tenant-123'),
  ('Leave Deduction', 'calculation', 'deduction', true, 'tenant-123'),
  ('Bonus Factor', 'calculation', 'earning', true, 'tenant-123');
```

### Result in Variable Panel

```
💾 Salary Components
   • Basic Salary
   • HRA
   • Transport Allowance

🧮 Calculation Parameters
   • Overtime Rate
   • Leave Deduction
   • Bonus Factor
```

---

## 🚀 Using Variables in Expressions

### Simple Example
```typescript
// Expression
'BasicSalary * 0.12'

// Context
{ BasicSalary: 15000 }

// Result
1800
```

### Conditional Example
```typescript
// Expression
'IF BasicSalary > 10000 THEN BasicSalary * 0.15 ELSE BasicSalary * 0.10'

// Context
{ BasicSalary: 12000 }

// Result
1800 (12000 * 0.15)
```

### Multiple Variables
```typescript
// Expression
'BasicSalary + HRA + TransportAllowance'

// Context
{
  BasicSalary: 15000,
  HRA: 6000,
  TransportAllowance: 2000
}

// Result
23000
```

---

## ✅ Verification Checklist

After deployment:

- [ ] Formula Builder page loads
- [ ] Variable panel displays
- [ ] Variables grouped correctly
  - [ ] "Salary Components" section present
  - [ ] "Calculation Parameters" section present
- [ ] Variables show component names
- [ ] Click variable → inserts into editor
- [ ] Expressions validate correctly
- [ ] Expressions execute correctly
- [ ] Multi-tenant isolation works
- [ ] Only active components show

---

## 🔄 Rollback (If Needed)

```bash
# Revert changes
git checkout HEAD~1 src/stores/expressionStore.ts
git checkout HEAD~1 src/components/dashboard/formula-builder/VariablePanel.tsx

# Rebuild
npm run build

# Redeploy
```

---

## 📞 Support

**Issue:** Variables not showing?
**Solution:** Check payroll_components table has active components for your tenant

**Issue:** Variables showing wrong names?
**Solution:** Update component names in payroll_components table

**Issue:** Variables in wrong category?
**Solution:** Update component_category field ('general' or 'calculation')

**Issue:** Expression validation failing?
**Solution:** Ensure variable names match exactly (case-sensitive)

---

## 🎓 Developer Notes

### Adding New Component Category

If you need to add a new component_category in the future:

1. Update `expressionStore.ts` mapping:
```typescript
if (item.component_category === 'your_new_category') {
  variableCategory = 'appropriate_expression_category';
}
```

2. Update `VariablePanel.tsx` category groups:
```typescript
const groups: Record<string, ExpressionVariable[]> = {
  // ... existing categories
  your_new_category: [],
};
```

3. Add label and icon:
```typescript
categoryLabels.your_new_category = 'Display Label';
categoryIcons.your_new_category = YourIcon;
```

---

**Last Updated:** 2025-02-14
**Status:** ✅ Active
**Build:** ✅ Passing
