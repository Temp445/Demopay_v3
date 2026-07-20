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

// Try to get service role key from environment or .env
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ||
                       envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1]?.trim();

if (!supabaseUrl) {
  console.error('❌ VITE_SUPABASE_URL not found in .env file');
  process.exit(1);
}

// Read the migration file
const migrationPath = path.join(__dirname, 'supabase/migrations/20260213102210_add_eligibility_to_payroll_components.sql');
const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

console.log('🔄 Applying migration: add_eligibility_to_payroll_components');
console.log('📁 Migration file:', migrationPath);
console.log('');

// If service role key is available, try to apply migration
if (serviceRoleKey) {
  console.log('🔑 Using service role key to apply migration...');

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  try {
    // Split the SQL into individual statements and execute them
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('/*') && !s.startsWith('--'));

    for (const statement of statements) {
      if (statement) {
        const { error } = await supabase.rpc('exec', { sql: statement + ';' });
        if (error) {
          console.error('❌ Error executing statement:', error);
        }
      }
    }

    console.log('✅ Migration applied successfully!');
    console.log('');
    console.log('📋 The following columns were added to payroll_components:');
    console.log('   - eligibility (text, default: "all")');
    console.log('   - eligibility_expression (text)');
    console.log('   - eligibility_expression_ast (jsonb)');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    console.log('');
    printManualInstructions();
  }
} else {
  console.log('⚠️  Service role key not found.');
  console.log('');
  printManualInstructions();
}

function printManualInstructions() {
  console.log('📝 Manual Application Required:');
  console.log('');
  console.log('Please apply this migration manually by:');
  console.log('');
  console.log('1. Go to your Supabase Dashboard SQL Editor:');
  console.log(`   ${supabaseUrl.replace('https://', 'https://app.').replace('.supabase.co', '.supabase.co/project/')}/sql`);
  console.log('');
  console.log('2. Copy and paste the following SQL:');
  console.log('');
  console.log('─'.repeat(80));
  console.log(migrationSQL);
  console.log('─'.repeat(80));
  console.log('');
  console.log('3. Click "Run" to execute the migration');
  console.log('');
  console.log('Or run this command with SUPABASE_SERVICE_ROLE_KEY environment variable:');
  console.log('   SUPABASE_SERVICE_ROLE_KEY=your_key node apply-migration.mjs');
}
