import { supabase } from './supabase';
import { getTenantId } from './tenantDb';

export interface ComponentType {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export async function getSalaryComponentTypes() {
  const tenantId = await getTenantId();
  const { data, error } = await supabase
    .from('payroll_components')
    .select('*')
    .eq('is_active', true)
    .eq('component_type', 'earning')
    .eq('tenant_id', tenantId)
    .order('name');

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function getDeductionComponentTypes() {
  const tenantId = await getTenantId();
  const { data, error } = await supabase
    .from('payroll_components')
    .select('*')
    .eq('is_active', true)
    .eq('component_type', 'deduction')
    .eq('tenant_id', tenantId)
    .order('name');

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function createSalaryComponentType(name: string, description?: string) {

  const tenant_id = await getTenantId();
  const { data, error } = await supabase
    .from('salary_component_types')
    .insert([{ name, description,tenant_id }])
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error('A salary component type with this name already exists');
    }
    throw new Error(error.message);
  }

  return data;
}

export async function createDeductionComponentType(name: string, description?: string) {
  const tenant_id = await getTenantId();
  const { data, error } = await supabase
    .from('deduction_component_types')
    .insert([{ name, description,tenant_id  }])
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error('A deduction component type with this name already exists');
    }
    throw new Error(error.message);
  }

  return data;
}