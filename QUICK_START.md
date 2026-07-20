# Quick Start: Applying the Eligibility Migration

## The Problem
ComponentMasterPage.tsx references three database columns that don't exist yet:
- `eligibility`
- `eligibility_expression`
- `eligibility_expression_ast`

This causes errors when trying to save payroll components.

## The Solution (3 Steps)

### Step 1: Apply the Migration (Choose One Method)

#### Method A: Supabase Dashboard (Easiest - Recommended)
1. Open the Supabase SQL Editor
2. Copy the SQL from `supabase/migrations/20260213102210_add_eligibility_to_payroll_components.sql`
3. Paste and run it
4. ✅ Done!

#### Method B: Using the Helper Script
```bash
node apply-migration.mjs
```
This will either apply the migration (if you have service role key) or show you exactly what to do.

### Step 2: Verify the Migration
```bash
node verify-migration.mjs
```

Expected output:
```
✅ Migration verified successfully!
```

### Step 3: Test End-to-End
```bash
node test-eligibility.mjs
```

Expected output:
```
🎉 All tests passed!
```

## What Was Created

### Files
1. **Migration File:** `supabase/migrations/20260213102210_add_eligibility_to_payroll_components.sql`
   - Contains the SQL to add the three columns

2. **Helper Scripts:**
   - `apply-migration.mjs` - Applies or guides you through applying the migration
   - `verify-migration.mjs` - Checks if migration was successful
   - `test-eligibility.mjs` - Tests the complete functionality

3. **Documentation:**
   - `MIGRATION_GUIDE.md` - Complete detailed guide
   - `QUICK_START.md` - This file (quick reference)

### Database Changes
Three new columns added to `payroll_components` table:

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `eligibility` | text | 'all' | 'all' or 'condition' |
| `eligibility_expression` | text | NULL | The expression string |
| `eligibility_expression_ast` | jsonb | NULL | Parsed expression (JSON) |

## What Already Works

The ComponentMasterPage.tsx is already fully implemented and ready to use:
- ✅ Eligibility dropdown (All/Condition)
- ✅ Expression builder integration
- ✅ Formula Builder modal
- ✅ Data save/load logic
- ✅ Form validation

**It just needs the database columns to be created!**

## Troubleshooting

### "Column does not exist" error
➜ The migration hasn't been applied yet. Run Step 1.

### "Permission denied"
➜ Use the Supabase Dashboard SQL Editor (Method A in Step 1)

### Tests fail but SQL ran successfully
➜ Check if there are RLS policies blocking your queries

## After Migration is Applied

1. Open the app in your browser
2. Navigate to Component Master page
3. Click "Add Component"
4. Select "Condition" from Eligibility dropdown
5. Click "Build Expression"
6. Create an expression
7. Save the component
8. ✅ Everything should work!

## Support

- Detailed guide: See `MIGRATION_GUIDE.md`
- Verify schema: `node verify-migration.mjs`
- Test functionality: `node test-eligibility.mjs`

## Summary

**Before:** ComponentMasterPage tried to save to columns that didn't exist ❌

**After:** Three columns added, feature works end-to-end ✅

**Action Required:** Apply the migration (Step 1 above)
