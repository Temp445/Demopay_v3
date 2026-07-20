import { supabase } from './supabase';

let currentTenantId: string | null = null;

export function setCurrentTenantId(tenantId: string | null) {
  currentTenantId = tenantId;
}

export function getCurrentTenantId(): string | null {
  return currentTenantId;
}

export async function getTenantId(): Promise<string> {
  if (currentTenantId) {
    return currentTenantId;
  }

  const { data, error } = await supabase.rpc('get_user_tenant_id');
  if (error || !data) {
    throw new Error('User is not associated with a tenant');
  }

  currentTenantId = data;
  return data;
}

export function tenantQuery(tableName: string) {
  return {
    async select(columns = '*') {
      const tenantId = await getTenantId();
      return supabase
        .from(tableName)
        .select(columns)
        .eq('tenant_id', tenantId);
    },

    async insert(data: any | any[]) {
      const tenantId = await getTenantId();
      const dataWithTenant = Array.isArray(data)
        ? data.map(item => ({ ...item, tenant_id: tenantId }))
        : { ...data, tenant_id: tenantId };

      return supabase
        .from(tableName)
        .insert(dataWithTenant);
    },

    async update(data: any) {
      const tenantId = await getTenantId();
      return {
        eq: (column: string, value: any) => {
          return supabase
            .from(tableName)
            .update(data)
            .eq('tenant_id', tenantId)
            .eq(column, value);
        },
        match: (query: Record<string, any>) => {
          return supabase
            .from(tableName)
            .update(data)
            .eq('tenant_id', tenantId)
            .match(query);
        }
      };
    },

    async delete() {
      const tenantId = await getTenantId();
      return {
        eq: (column: string, value: any) => {
          return supabase
            .from(tableName)
            .delete()
            .eq('tenant_id', tenantId)
            .eq(column, value);
        },
        match: (query: Record<string, any>) => {
          return supabase
            .from(tableName)
            .delete()
            .eq('tenant_id', tenantId)
            .match(query);
        }
      };
    }
  };
}

export async function tenantAwareQuery<T = any>(
  operation: (tenantId: string) => Promise<T>
): Promise<T> {
  const tenantId = await getTenantId();
  return operation(tenantId);
}
