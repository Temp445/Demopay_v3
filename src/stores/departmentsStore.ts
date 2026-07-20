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

export interface Department {
  id: string;
  name: string;
  tenant_id?: string;
  created_at?: string;
  updated_at?: string;
}

interface DepartmentsStore extends StoreState<Department> {
  fetchDepartments: () => Promise<void>;
  createDepartment: (name: string) => Promise<Department>;
  updateDepartment: (id: string, name: string) => Promise<Department>;
  deleteDepartment: (id: string) => Promise<void>;
  getDepartmentById: (id: string) => Department | undefined;
  reset: () => void;
}

export const useDepartmentsStore = create<DepartmentsStore>()(
  persist(
    (set, get) => ({
      ...initialStoreState<Department>(),

      fetchDepartments: async () => {
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
            .from('departments')
            .select('*')
            .eq('tenant_id', auth.tenantId)
            .order('name');

          if (error) throw error;

          set(state => setSuccess(state, data || []));
        } catch (error) {
          set(state => setError(state, error instanceof Error ? error.message : 'Failed to fetch departments'));
        }
      },

      createDepartment: async (name) => {
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
            .from('departments')
            .insert([{ name, tenant_id: auth.tenantId }])
            .select()
            .single();

          if (error) {
            if (error.code === '23505') {
              throw new Error('A department with this name already exists');
            }
            throw error;
          }

          set(state => addItem(state, data));
          return data;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to create department';
          set(state => setError(state, errorMessage));
          throw error;
        }
      },

      updateDepartment: async (id, name) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated) throw createAuthError();
        if (!auth.tenantId) throw createTenantError();

        set(state => setLoading(state));

        try {
          const { data, error } = await supabase
            .from('departments')
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
              throw new Error('A department with this name already exists');
            }
            throw error;
          }

          // update local store
          set(state => ({
            ...state,
            items: state.items.map(dept =>
              dept.id === id ? data : dept
            ),
            loading: false,
            error: null,
          }));

          return data;
        } catch (error) {
          const msg =
            error instanceof Error
              ? error.message
              : 'Failed to update department';
          set(state => setError(state, msg));
          throw error;
        }
      },

      // --- MODIFIED FUNCTION BELOW ---
      deleteDepartment: async (id) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated) {
          throw createAuthError();
        }

        if (!auth.tenantId) {
          throw createTenantError();
        }

        set(state => setLoading(state));

        try {
          // 1. Get the department name for checking and error messaging
          const deptToDelete = get().items.find(dept => dept.id === id);
          if (!deptToDelete) throw new Error('Department not found');

          // 2. Check if any employees are currently assigned to this department
          // We check for both ID and Name to ensure we catch it regardless of how it's stored in the DB
          const { data: assignedEmployees, error: checkError } = await supabase
            .from('employees')
            .select('id')
            .eq('tenant_id', auth.tenantId)
            .in('department', [id, deptToDelete.name])
            .limit(1);

          if (checkError) throw checkError;

          // 3. If employees are found, throw an error to prevent deletion
          if (assignedEmployees && assignedEmployees.length > 0) {
            throw new Error(`Cannot delete "${deptToDelete.name}" because it is currently assigned to one or more employees.`);
          }

          // 4. Proceed with deletion if no employees are assigned
          const { error } = await supabase
            .from('departments')
            .delete()
            .eq('id', id)
            .eq('tenant_id', auth.tenantId);

          if (error) throw error;

          set(state => removeItem(state, id));
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to delete department';
          set(state => setError(state, errorMessage));
          throw error; // This throws the error back to the Modal
        }
      },
      // --- END MODIFIED FUNCTION ---

      getDepartmentById: (id) => {
        return get().items.find(dept => dept.id === id);
      },

      reset: () => {
        set(initialStoreState<Department>());
      },
    }),
    {
      name: 'departments-storage',
      partialize: (state) => ({
        items: state.items,
        initialized: state.initialized,
      }),
    }
  )
);