#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read environment variables
const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf-8');

const supabaseUrl = envContent.match(/VITE_SUPABASE_URL=(.*)/)?.[1]?.trim();
const supabaseAnonKey = envContent.match(/VITE_SUPABASE_ANON_KEY=(.*)/)?.[1]?.trim();

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase credentials in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

console.log('🔍 Verifying migration: add_eligibility_to_payroll_components');
console.log('');

async function verifyMigration() {
  try {
    // Try to query the table with the new columns
    const { data, error } = await supabase
      .from('payroll_components')
      .select('id, eligibility, eligibility_expression, eligibility_expression_ast')
      .limit(1);

    if (error) {
      if (error.message.includes('column') && error.message.includes('does not exist')) {
        console.log('❌ Migration NOT applied yet');
        console.log('');
        console.log('Missing columns detected in the error:');
        console.log(error.message);
        console.log('');
        console.log('Please run: node apply-migration.mjs');
        console.log('or apply the migration manually via Supabase Dashboard');
        return false;
      } else {
        console.error('❌ Error querying table:', error);
        return false;
      }
    }

    console.log('✅ Migration verified successfully!');
    console.log('');
    console.log('📋 Confirmed columns in payroll_components table:');
    console.log('   ✓ eligibility');
    console.log('   ✓ eligibility_expression');
    console.log('   ✓ eligibility_expression_ast');
    console.log('');

    if (data && data.length > 0) {
      console.log('📊 Sample data from table:');
      console.log('   Total records found:', data.length);
      console.log('   Sample record:', JSON.stringify(data[0], null, 2));
    } else {
      console.log('📊 Table exists but no records found yet');
    }

    return true;

  } catch (error) {
    console.error('❌ Unexpected error:', error);
    return false;
  }
}

// Run verification
verifyMigration().then(success => {
  process.exit(success ? 0 : 1);
});
