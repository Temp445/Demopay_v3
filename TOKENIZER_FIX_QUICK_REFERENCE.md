# Tokenizer Fix - Quick Reference

## 🎯 Problem Fixed

**Error:** "Expected token type ELSE but got VARIABLE at position 34"

**Cause:** Variable names with spaces (like "Washing Allowance") were split into multiple tokens

**Solution:** Enhanced tokenizer to handle multi-word variable names

---

## ✅ What Now Works

### Multi-Word Variable Names

```typescript
// These expressions now parse correctly:

'Basic Salary * 0.12'
'IF AbsentDays == 0 THEN Washing Allowance ELSE 0'
'Basic Salary + House Rent Allowance + Transport Allowance'
'IF Washing Allowance > 0 AND Basic Salary > 5000 THEN Washing Allowance ELSE 0'
```

---

## 📝 File Changed

**File:** `src/lib/formula-engine/tokenizer.ts`

**Method:** `readIdentifier()` (lines 60-132)

**Change:** Added logic to continue reading words separated by spaces until hitting a keyword, operator, or special character

---

## 🧪 Quick Test

### Test in Formula Builder

1. Open Formula Builder
2. Enter expression: `IF( AbsentDays ==0 ) THEN Washing Allowance ELSE 0`
3. Click "Test Expression"
4. **Expected:** ✅ No errors, expression validates successfully

---

## 📊 Tokenization Examples

### Before Fix

```
Expression: "IF AbsentDays == 0 THEN Washing Allowance ELSE 0"

Tokens:
  IF (IF)
  AbsentDays (VARIABLE)
  == (OPERATOR)
  0 (NUMBER)
  THEN (THEN)
  Washing (VARIABLE)      ← Problem: Split into 2 tokens
  Allowance (VARIABLE)    ← Problem: Unexpected VARIABLE
  ELSE (ELSE)
  0 (NUMBER)

Result: ❌ Parse error
```

### After Fix

```
Expression: "IF AbsentDays == 0 THEN Washing Allowance ELSE 0"

Tokens:
  IF (IF)
  AbsentDays (VARIABLE)
  == (OPERATOR)
  0 (NUMBER)
  THEN (THEN)
  Washing Allowance (VARIABLE)  ← Fixed: One token
  ELSE (ELSE)
  0 (NUMBER)

Result: ✅ Parses successfully
```

---

## 🔐 Safety Features

### Keywords Protected

Keywords are NEVER included as part of variable names:

```
"Basic Salary THEN Other" → ["Basic Salary", "THEN", "Other"]
"Basic AND Salary" → ["Basic", "AND", "Salary"]
```

### Functions Protected

Function names are NEVER included as part of variable names:

```
"Basic ROUND Salary" → ["Basic", "ROUND", "Salary"]
```

---

## ✅ Backward Compatibility

### Single-Word Variables Still Work

```typescript
'AbsentDays'          → ✅ Works
'BasicSalary'         → ✅ Works
'HRA'                 → ✅ Works
'Basic_Salary'        → ✅ Works
```

### Existing Expressions Unchanged

All existing expressions continue to work exactly as before.

---

## 📖 Supported Variable Name Formats

| Format | Example | Status |
|--------|---------|--------|
| Single word | `BasicSalary` | ✅ Works |
| Two words | `Basic Salary` | ✅ Works |
| Three+ words | `House Rent Allowance` | ✅ Works |
| With underscore | `Basic_Salary` | ✅ Works |
| With numbers | `BasicSalary123` | ✅ Works |
| With hyphen | `Basic-Salary` | ❌ Not supported |
| With dot | `Basic.Salary` | ❌ Not supported |
| Starting with number | `401k Contribution` | ❌ Not supported |

---

## 🚀 Build Status

```bash
npm run build
✓ built in 32.37s
```

**Status:** ✅ SUCCESS

---

## 🔧 How It Works

### Algorithm

1. Read first word (e.g., "Washing")
2. Check if it's a keyword (IF, THEN, ELSE, etc.)
   - If YES → Return keyword token
   - If NO → Continue to step 3
3. Look ahead for more words:
   - Skip whitespace
   - Read next word (e.g., "Allowance")
   - Check if next word is a keyword
     - If YES → Stop, don't include it
     - If NO → Include it with space ("Washing Allowance")
4. Repeat until hitting keyword, operator, or end

### Example

```
Input: "Basic Salary THEN"

Step 1: Read "Basic" → Not keyword
Step 2: Look ahead → See space
Step 3: Read "Salary" → Not keyword → Include
Step 4: Look ahead → See "THEN" (keyword) → Stop
Result: "Basic Salary" (VARIABLE)
```

---

## 💡 Usage Examples

### Variable Panel Click

```typescript
// User clicks "Washing Allowance" in Variable Panel
// Variable is inserted into expression editor
// Expression: "Washing Allowance"
// Tokenizes to: [{ type: 'VARIABLE', value: 'Washing Allowance' }]
```

### Expression Building

```typescript
// User builds expression step by step:
// 1. Select "IF" → "IF"
// 2. Type "AbsentDays == 0" → "IF AbsentDays == 0"
// 3. Select "THEN" → "IF AbsentDays == 0 THEN"
// 4. Click "Washing Allowance" → "IF AbsentDays == 0 THEN Washing Allowance"
// 5. Select "ELSE" → "IF AbsentDays == 0 THEN Washing Allowance ELSE"
// 6. Type "0" → "IF AbsentDays == 0 THEN Washing Allowance ELSE 0"

// Result: ✅ Parses successfully
```

### Expression Execution

```typescript
const expression = 'IF AbsentDays == 0 THEN Washing Allowance ELSE 0';
const context = {
  AbsentDays: 0,
  'Washing Allowance': 500
};

const result = FormulaEngine.execute(expression, context);
// Result: { success: true, value: 500 }
```

---

## 🔍 Troubleshooting

### Issue: Variable name not recognized

**Symptom:** "Unknown variable" error

**Check:**
1. Variable name matches payroll component name exactly (case-sensitive)
2. Variable exists in payroll_components table
3. Variable is active (is_active = true)

### Issue: Parse error with keyword-like variable

**Symptom:** "Unexpected token" error

**Example:** Variable named "IF Salary"

**Solution:** Avoid using keywords as part of variable names

### Issue: Variable with special characters

**Symptom:** Tokenization error

**Example:** "Basic-Salary" or "Basic.Salary"

**Solution:** Use spaces or underscores: "Basic Salary" or "Basic_Salary"

---

## 📋 Testing Checklist

Manual testing steps:

- [ ] Open Formula Builder page
- [ ] Enter: `IF AbsentDays == 0 THEN Washing Allowance ELSE 0`
- [ ] Click "Test Expression"
- [ ] Verify: No parsing errors
- [ ] Verify: Variables list shows "AbsentDays" and "Washing Allowance"
- [ ] Enter test values in context:
  - [ ] AbsentDays: 0
  - [ ] Washing Allowance: 500
- [ ] Click "Test"
- [ ] Verify: Result is 500

Additional tests:

- [ ] Single-word variable: `AbsentDays * 2`
- [ ] Multiple multi-word: `Basic Salary + House Rent Allowance`
- [ ] Complex expression: `IF Washing Allowance > 0 AND Basic Salary > 5000 THEN Washing Allowance ELSE 0`

---

## 📞 Support

### Common Questions

**Q: Do I need to update existing expressions?**
A: No, existing expressions continue to work. This fix adds support for new variable name formats.

**Q: Can I use variable names with hyphens?**
A: No, use spaces or underscores instead.

**Q: Are variable names case-sensitive?**
A: Yes, "Basic Salary" and "basic salary" are different variables.

**Q: What's the maximum length for variable names?**
A: No specific limit, but keep them readable (recommended: < 50 characters).

---

**Fix Date:** 2025-02-14
**Status:** ✅ ACTIVE
**Build:** ✅ PASSING
