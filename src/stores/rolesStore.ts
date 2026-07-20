import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '../lib/supabase';
import { getTenantId } from '../lib/tenantDb';
import {
  validateAuth,
  createAuthError,
  createTenantError,
  initialStoreState,
  setLoading,
  setError,
  setSuccess,
  addItem,
  removeItem,
  type StoreState,
} from './utils/storeUtils';

export interface Role {
  id: string;
  name: string;
  tenant_id?: string;
  created_at?: string;
  updated_at?: string;
}

interface RolesStore extends StoreState<Role> {
  fetchRoles: () => Promise<void>;
  createRole: (name: string) => Promise<Role>;
  updateRole: (id: string, name: string) => Promise<Role>;
  deleteRole: (id: string) => Promise<void>;
  getRoleById: (id: string) => Role | undefined;
  reset: () => void;
}

export const useRolesStore = create<RolesStore>()(
  persist(
    (set, get) => ({
      ...initialStoreState<Role>(),

      fetchRoles: async () => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated) {
          set(state => setError(state, createAuthError().message));
          return;
        }

        if (!auth.tenantId) {
          set(state => setError(state, createTenantError().message));
          return;
        }

        set(state => setLoading(state));

        try {
          const { data, error } = await supabase
            .from('roles')
            .select('*')
            .eq('tenant_id', auth.tenantId)
            .order('name');

          if (error) throw error;

          set(state => setSuccess(state, data || []));
        } catch (error) {
          set(state => setError(state, error instanceof Error ? error.message : 'Failed to fetch roles'));
        }
      },

      createRole: async (name) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated) {
          throw createAuthError();
        }

        if (!auth.tenantId) {
          throw createTenantError();
        }

        set(state => setLoading(state));

        try {
          const { data, error } = await supabase
            .from('roles')
            .insert([{ name, tenant_id: auth.tenantId }])
            .select()
            .single();

          if (error) {
            if (error.code === '23505') {
              throw new Error('A role with this name already exists');
            }
            throw error;
          }

          set(state => addItem(state, data));
          return data;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to create role';
          set(state => setError(state, errorMessage));
          throw error;
        }
      },

      updateRole: async (id, name) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated) throw createAuthError();
        if (!auth.tenantId) throw createTenantError();

        set(state => setLoading(state));

        try {
          const { data, error } = await supabase
            .from('roles')
            .update({
              name,
              updated_at: new Date().toISOString(),
            })
            .eq('id', id)
            .eq('tenant_id', auth.tenantId)
            .select()
            .single();

          if (error) {
            if (error.code === '23505') {
              throw new Error('A role with this name already exists');
            }
            throw error;
          }

          // update local store
          set(state => ({
            ...state,
            items: state.items.map(role =>
              role.id === id ? data : role
            ),
            loading: false,
            error: null,
          }));

          return data;
        } catch (error) {
          const msg =
            error instanceof Error
              ? error.message
              : 'Failed to update role';
          set(state => setError(state, msg));
          throw error;
        }
      },

      // --- MODIFIED FUNCTION BELOW ---
      deleteRole: async (id) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated) {
          throw createAuthError();
        }

        if (!auth.tenantId) {
          throw createTenantError();
        }

        set(state => setLoading(state));

        try {
          // 1. Get the role name so we can display it in the error message
          const roleToDelete = get().items.find(role => role.id === id);
          if (!roleToDelete) throw new Error('Role not found');

          // 2. Check if any employees are currently assigned to this role
          // Checking against both ID and Name to cover different database relationships
          const { data: assignedEmployees, error: checkError } = await supabase
            .from('employees')
            .select('id')
            .eq('tenant_id', auth.tenantId)
            .in('role', [id, roleToDelete.name])
            .limit(1);

          if (checkError) throw checkError;

          // 3. If employees are found, throw an error to prevent deletion
          if (assignedEmployees && assignedEmployees.length > 0) {
            throw new Error(`Cannot delete "${roleToDelete.name}" because it is currently assigned to one or more employees.`);
          }

          // 4. Proceed with deletion if no employees are assigned
          const { error } = await supabase
            .from('roles')
            .delete()
            .eq('id', id)
            .eq('tenant_id', auth.tenantId);

          if (error) throw error;

          set(state => removeItem(state, id));
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to delete role';
          set(state => setError(state, errorMessage));
          throw error; // Pass error back to the UI
        }
      },

      getRoleById: (id) => {
        return get().items.find(role => role.id === id);
      },

      reset: () => {
        set(initialStoreState<Role>());
      },
    }),
    {
      name: 'roles-storage',
      partialize: (state) => ({
        items: state.items,
        initialized: state.initialized,
      }),
    }
  )
);