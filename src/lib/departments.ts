import { supabase } from './supabase';
import { getTenantId } from './tenantDb';

export interface Department {
  id: string;
  name: string;
  tenant_id?: string;
  created_at?: string;
  updated_at?: string;
}

export async function getDepartments() {
  const tenantId = await getTenantId();
  const { data, error } = await supabase
    .from('departments')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('name');

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function createDepartment(name: string) {
  // Get user's tenant_id
  const tenant_id = await getTenantId();

  const { data, error } = await supabase
    .from('departments')
    .insert([{ name, tenant_id }])
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error('A department with this name already exists');
    }
    throw new Error(error.message);
  }

  return data;
}