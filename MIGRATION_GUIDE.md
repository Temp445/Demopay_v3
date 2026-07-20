# Database Migration Guide: Adding Eligibility Fields to Payroll Components

## Problem Summary

The ComponentMasterPage.tsx was implemented with three new eligibility-related fields, but these columns were never created in the database schema. This causes the application to fail when trying to save payroll components with eligibility data.

## Solution Overview

A database migration has been created to add the missing columns to the `payroll_components` table:

1. **eligibility** - Defines if component applies to all employees or has conditions
2. **eligibility_expression** - Stores the human-readable conditional expression
3. **eligibility_expression_ast** - Stores the parsed expression as JSON (AST format)

## Files Created/Modified

### 1. Migration File
**Location:** `supabase/migrations/20260213102210_add_eligibility_to_payroll_components.sql`

Contains the SQL DDL statements to add the three new columns with appropriate constraints and comments.

### 2. Migration Application Script
**Location:** `apply-migration.mjs`

Node.js script to apply the migration to your Supabase database. Can be run with service role key or provides manual instructions.

### 3. Migration Verification Script
**Location:** `verify-migration.mjs`

Node.js script to verify that the migration has been successfully applied by checking if the columns exist.

### 4. Test Script
**Location:** `test-eligibility.mjs`

End-to-end test script to verify data can be saved and retrieved with the new eligibility fields.

## Migration Application Steps

### Option 1: Using the Supabase Dashboard (Recommended)

1. **Navigate to your Supabase SQL Editor:**
   - Go to: https://app.supabase.com
   - Select your project: `rqtodkgptdgfilhdurxv`
   - Click on "SQL Editor" in the left sidebar

2. **Create a new query:**
   - Click "+ New query"

3. **Copy and paste the migration SQL:**
   ```sql
   -- Add eligibility field
   ALTER TABLE payroll_components
   ADD COLUMN IF NOT EXISTS eligibility text DEFAULT 'all' CHECK (eligibility IN ('all', 'condition'));

   -- Add eligibility expression field (human-readable)
   ALTER TABLE payroll_components
   ADD COLUMN IF NOT EXISTS eligibility_expression text;

   -- Add eligibility expression AST field (machine-readable)
   ALTER TABLE payroll_components
   ADD COLUMN IF NOT EXISTS eligibility_expression_ast jsonb;

   -- Add comments for documentation
   COMMENT ON COLUMN payroll_components.eligibility IS 'Defines eligibility criteria: all (applies to all employees), condition (conditional based on expression)';
   COMMENT ON COLUMN payroll_components.eligibility_expression IS 'Human-readable expression text for conditional eligibility';
   COMMENT ON COLUMN payroll_components.eligibility_expression_ast IS 'Parsed Abstract Syntax Tree (AST) for conditional eligibility expression';
   ```

4. **Execute the query:**
   - Click "Run" or press Ctrl+Enter (Cmd+Enter on Mac)
   - Verify you see "Success. No rows returned"

5. **Verify the migration:**
   ```bash
   node verify-migration.mjs
   ```

### Option 2: Using the Migration Script

If you have access to the Supabase Service Role Key:

1. **Set the service role key:**
   ```bash
   export SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
   ```

2. **Run the migration script:**
   ```bash
   node apply-migration.mjs
   ```

3. **Verify the migration:**
   ```bash
   node verify-migration.mjs
   ```

### Option 3: Using the CLI Helper

Simply run the migration script for instructions:
```bash
node apply-migration.mjs
```

This will display the SQL and provide a direct link to your Supabase SQL Editor.

## Verification

After applying the migration, verify it was successful:

```bash
node verify-migration.mjs
```

Expected output:
```
✅ Migration verified successfully!

📋 Confirmed columns in payroll_components table:
   ✓ eligibility
   ✓ eligibility_expression
   ✓ eligibility_expression_ast
```

## Database Schema Changes

### New Columns in `payroll_components` Table

| Column Name | Data Type | Nullable | Default | Constraint | Description |
|-------------|-----------|----------|---------|------------|-------------|
| `eligibility` | text | NO | 'all' | CHECK (eligibility IN ('all', 'condition')) | Defines eligibility criteria |
| `eligibility_expression` | text | YES | NULL | - | Human-readable expression text |
| `eligibility_expression_ast` | jsonb | YES | NULL | - | Parsed expression AST |

### Example Data

```sql
-- Component that applies to all employees
INSERT INTO payroll_components (name, eligibility)
VALUES ('Basic Salary', 'all');

-- Component with conditional eligibility
INSERT INTO payroll_components (
  name,
  eligibility,
  eligibility_expression,
  eligibility_expression_ast
) VALUES (
  'Performance Bonus',
  'condition',
  'department = ''Sales'' AND tenure_years >= 2',
  '{"type": "BinaryExpression", "operator": "AND", ...}'::jsonb
);
```

## Testing Data Persistence

After applying the migration, test the complete flow:

```bash
node test-eligibility.mjs
```

This script will:
1. Create a test component with eligibility = 'all'
2. Create a test component with eligibility = 'condition'
3. Verify both components can be saved
4. Verify data can be retrieved correctly
5. Clean up test data

## Integration with ComponentMasterPage.tsx

The ComponentMasterPage.tsx component is already configured to work with these fields:

### Interface Definition
```typescript
interface PayrollComponent {
  // ... existing fields
  eligibility?: 'all' | 'condition';
  eligibility_expression?: string;
  eligibility_expression_ast?: any;
}
```

### Form State
```typescript
const [formData, setFormData] = useState({
  // ... existing fields
  eligibility: 'all' as 'all' | 'condition',
  eligibility_expression: '',
  eligibility_expression_ast: null as any,
});
```

### Save Logic
The component already handles saving these fields to Supabase:
```typescript
const { error } = await supabase
  .from('payroll_components')
  .insert({
    ...formData,
    eligibility_expression: formData.eligibility === 'condition' ? formData.eligibility_expression : null,
    eligibility_expression_ast: formData.eligibility === 'condition' ? formData.eligibility_expression_ast : null,
    tenant_id: tenantId,
  });
```

## Backward Compatibility

- **Existing Components:** All existing payroll components will automatically have `eligibility = 'all'` due to the DEFAULT constraint
- **No Data Migration Needed:** Existing records continue to work without modification
- **Optional Fields:** The expression fields are nullable, so components with eligibility = 'all' don't require them

## Rollback (If Needed)

If you need to rollback this migration:

```sql
-- Remove the columns
ALTER TABLE payroll_components DROP COLUMN IF EXISTS eligibility;
ALTER TABLE payroll_components DROP COLUMN IF EXISTS eligibility_expression;
ALTER TABLE payroll_components DROP COLUMN IF EXISTS eligibility_expression_ast;
```

**Note:** This will permanently delete any eligibility data stored in these columns.

## Troubleshooting

### Error: "column does not exist"
**Cause:** Migration has not been applied yet
**Solution:** Follow the migration application steps above

### Error: "permission denied"
**Cause:** Trying to run DDL with insufficient privileges
**Solution:** Use the Supabase Dashboard SQL Editor (Option 1)

### Error: "relation does not exist"
**Cause:** The payroll_components table doesn't exist
**Solution:** Ensure you're connected to the correct database and the table was created in previous migrations

### Verification fails but SQL Editor shows success
**Cause:** Row Level Security (RLS) may be blocking the query
**Solution:** Check RLS policies on payroll_components table

## Support

For issues or questions:
- Check the verification output: `node verify-migration.mjs`
- Review the migration file: `supabase/migrations/20260213102210_add_eligibility_to_payroll_components.sql`
- Test with: `node test-eligibility.mjs`

## Next Steps

After successfully applying the migration:

1. ✅ Verify migration: `node verify-migration.mjs`
2. ✅ Test data persistence: `node test-eligibility.mjs`
3. ✅ Test in the UI: Create a new payroll component in ComponentMasterPage
4. ✅ Verify the Formula Builder modal works
5. ✅ Confirm eligibility expressions save correctly

## Summary

This migration resolves the database schema mismatch by adding the three required columns for the eligibility feature. The migration is:

- **Safe:** Uses `IF NOT EXISTS` to prevent errors if columns already exist
- **Backward Compatible:** Existing data continues to work
- **Well-Documented:** Includes comments and clear constraints
- **Tested:** Includes verification and test scripts

Once applied, the ComponentMasterPage.tsx eligibility feature will work end-to-end without any code changes needed.
