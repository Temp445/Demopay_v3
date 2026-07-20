import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read Supabase credentials from .env
const envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf-8');
const supabaseUrl = envContent.match(/VITE_SUPABASE_URL=(.*)/)[1].trim();
const supabaseKey = envContent.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1].trim();

const supabase = createClient(supabaseUrl, supabaseKey);

const migrationSQL = `
/*
  # Add Eligibility Fields to Payroll Components

  1. Changes
    - Add eligibility field to define eligibility criteria (all/condition)
    - Add eligibility_expression field to store conditional eligibility expression
    - Add eligibility_expression_ast field to store parsed expression AST

  2. Purpose
    - Enable conditional eligibility for payroll components
    - Support expression-based eligibility rules
    - Store both human-readable and machine-readable expression formats

  3. Field Details
    - eligibility: 'all' | 'condition' (default: 'all')
    - eligibility_expression: text (nullable, stores the expression string)
    - eligibility_expression_ast: jsonb (nullable, stores the parsed AST)

  4. Security
    - No RLS changes needed as payroll_components already has RLS enabled
*/

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
`;

async function runMigration() {
  try {
    console.log('Running migration...');

    // Execute the SQL using Supabase client
    const { data, error } = await supabase.rpc('exec_sql', { sql: migrationSQL });

    if (error) {
      console.error('Migration error:', error);
      // Try alternative approach using direct SQL execution
      const { error: directError } = await supabase.from('payroll_components').select('id').limit(1);
      if (directError) {
        console.error('Cannot connect to database:', directError);
      } else {
        console.log('Connection successful, but cannot execute DDL with anon key.');
        console.log('Migration SQL needs to be run with admin privileges.');
        console.log('\nPlease run this SQL in your Supabase SQL Editor:');
        console.log('\n' + migrationSQL);
      }
      return;
    }

    console.log('Migration completed successfully!');
    console.log('Data:', data);
  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

runMigration();
