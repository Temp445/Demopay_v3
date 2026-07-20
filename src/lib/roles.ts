import { supabase } from './supabase';
import { getTenantId } from './tenantDb';

export interface Role {
  id: string;
  name: string;
  created_at?: string;
  updated_at?: string;
}

export async function getRoles() {
  const tenantId = await getTenantId();
  const { data, error } = await supabase
    .from('roles')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('name');

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function createRole(name: string) {
  const tenantId = await getTenantId();
  const { data, error } = await supabase
    .from('roles')
    .insert([{ name, tenant_id: tenantId }])
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error('A role with this name already exists');
    }
    throw new Error(error.message);
  }

  return data;
}