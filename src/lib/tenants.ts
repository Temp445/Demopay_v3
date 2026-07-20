import { supabase } from './supabase';

export interface Tenant {
  id: string;
  name: string;
  subdomain: string;
  status: 'Active' | 'Suspended' | 'Inactive';
  settings: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

export interface TenantUser {
  id: string;
  tenant_id: string;
  user_id: string;
  role: 'tenant_admin' | 'manager' | 'user';
  is_primary: boolean;
  created_at?: string;
  updated_at?: string;
  tenant?: Tenant;
}

export async function getCurrentUserTenants(): Promise<TenantUser[]> {
  const { data, error } = await supabase
    .from('tenant_users')
    .select(`
      *,
      tenant:tenants (*)
    `)
    .eq('user_id', (await supabase.auth.getUser()).data.user?.id || '');

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function getPrimaryTenant(): Promise<Tenant | null> {
  const { data, error } = await supabase
    .from('tenant_users')
    .select(`
      tenant:tenants (*)
    `)
    .eq('user_id', (await supabase.auth.getUser()).data.user?.id || '')
    .eq('is_primary', true)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(error.message);
  }

  return data.tenant as Tenant;
}

export async function getTenantById(tenantId: string): Promise<Tenant> {
  const { data, error } = await supabase
    .from('tenants')
    .select('*')
    .eq('id', tenantId)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function updateTenant(
  tenantId: string,
  updates: Partial<Omit<Tenant, 'id' | 'created_at' | 'updated_at'>>
): Promise<Tenant> {
  const { data, error } = await supabase
    .from('tenants')
    .update(updates)
    .eq('id', tenantId)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function createTenant(
  tenant: Omit<Tenant, 'id' | 'created_at' | 'updated_at'>
): Promise<Tenant> {
  const { data, error } = await supabase
    .from('tenants')
    .insert([tenant])
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function addUserToTenant(
  tenantId: string,
  userId: string,
  role: TenantUser['role'] = 'user'
): Promise<TenantUser> {
  const { data, error } = await supabase
    .from('tenant_users')
    .insert([
      {
        tenant_id: tenantId,
        user_id: userId,
        role: role,
        is_primary: false,
      },
    ])
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function updateTenantUserRole(
  tenantUserId: string,
  role: TenantUser['role']
): Promise<TenantUser> {
  const { data, error } = await supabase
    .from('tenant_users')
    .update({ role })
    .eq('id', tenantUserId)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function removeUserFromTenant(tenantUserId: string): Promise<void> {
  const { error } = await supabase
    .from('tenant_users')
    .delete()
    .eq('id', tenantUserId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function setPrimaryTenant(
  userId: string,
  tenantId: string
): Promise<void> {
  const { error: resetError } = await supabase
    .from('tenant_users')
    .update({ is_primary: false })
    .eq('user_id', userId);

  if (resetError) {
    throw new Error(resetError.message);
  }

  const { error: setPrimaryError } = await supabase
    .from('tenant_users')
    .update({ is_primary: true })
    .eq('user_id', userId)
    .eq('tenant_id', tenantId);

  if (setPrimaryError) {
    throw new Error(setPrimaryError.message);
  }
}

export async function getTenantUsers(tenantId: string): Promise<TenantUser[]> {
  const { data, error } = await supabase
    .from('tenant_users')
    .select('*')
    .eq('tenant_id', tenantId);

  if (error) {
    throw new Error(error.message);
  }

  return data;
}
