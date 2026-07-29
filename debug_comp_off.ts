import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function run() {
  const empId = 'ec627d1b-9f92-4eeb-8998-b6f833978f8a';
  
  const { data: credits, error: err1 } = await supabase.from('attendance_comp_off_credits').select('*').eq('employee_id', empId);
  console.log('Credits:', credits, err1);

  const { data: balances, error: err2 } = await supabase.from('leave_balances').select('*, leave_types(name)').eq('employee_id', empId);
  console.log('Balances:', JSON.stringify(balances, null, 2), err2);
}

run();
