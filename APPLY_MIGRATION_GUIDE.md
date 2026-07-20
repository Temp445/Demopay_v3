# How to Apply the Company Settings Migration

## Quick Start

The company settings feature requires a database table to be created. Follow these steps to apply the migration.

## Option 1: Supabase Dashboard (Recommended)

1. Open your Supabase project dashboard at https://app.supabase.com
2. Navigate to the **SQL Editor** in the left sidebar
3. Click **New Query**
4. Open the file `.bolt/company_settings_migration.sql` in this project
5. Copy the entire SQL content
6. Paste it into the SQL Editor
7. Click **Run** (or press Cmd/Ctrl + Enter)
8. Verify success: You should see "Success. No rows returned"

## Option 2: Supabase CLI

If you have the Supabase CLI installed:

```bash
# Navigate to your project directory
cd /path/to/your/project

# Create a new migration file
supabase migration new create_company_settings

# The CLI will create a file like:
# supabase/migrations/YYYYMMDDHHMMSS_create_company_settings.sql

# Open that file and paste the content from .bolt/company_settings_migration.sql

# Apply the migration
supabase db push
```

## Option 3: Manual Application

If you prefer to apply the migration manually:

1. Connect to your Supabase database using your preferred PostgreSQL client
2. Open `.bolt/company_settings_migration.sql`
3. Execute the SQL statements

## Verification

After applying the migration, verify it was successful:

1. In Supabase Dashboard, go to **Table Editor**
2. You should see a new table called `company_settings`
3. Check the table structure matches the migration
4. Verify RLS policies are enabled (look for the shield icon)

Alternatively, run this SQL in the SQL Editor:

```sql
-- Check if table exists
SELECT EXISTS (
  SELECT FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_name = 'company_settings'
);

-- Should return: true

-- Check RLS is enabled
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname = 'company_settings';

-- relrowsecurity should be: true
```

## Troubleshooting

### Error: "relation 'tenants' does not exist"
- The migration depends on the `tenants` table existing
- Make sure you've applied the multi-tenant migrations first
- Check that migration `20251027123113_create_tenants.sql` has been applied

### Error: "function handle_updated_at() does not exist"
- The migration uses a trigger function that should exist from earlier migrations
- Check that your database has the base schema set up

### Error: "permission denied"
- Ensure you're connected as a user with sufficient privileges
- The Supabase dashboard SQL Editor uses the service role and should work

## What This Migration Creates

- **Table:** `company_settings` with columns for all company configuration
- **Index:** `idx_company_settings_tenant_id` for fast tenant lookups
- **RLS Policies:**
  - SELECT policy for all tenant members
  - INSERT policy for tenant admins only
  - UPDATE policy for tenant admins only
- **Trigger:** Automatic `updated_at` timestamp on updates
- **Constraints:**
  - UNIQUE constraint on tenant_id (one settings record per tenant)
  - CHECK constraints on enum fields
  - Foreign key to tenants table

## Next Steps

After applying the migration:

1. Restart your development server (if running)
2. Navigate to Settings → Company Settings in your app
3. Fill in your company information
4. Save and verify the data persists

## Need Help?

If you encounter issues:
1. Check the Supabase logs in the Dashboard
2. Verify you're using the correct Supabase project
3. Ensure your connection string is correct in `.env`
4. Check that RLS policies are configured correctly
