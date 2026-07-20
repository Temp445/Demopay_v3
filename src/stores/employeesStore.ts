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
  updateItem,
  removeItem,
  type StoreState,
} from './utils/storeUtils';
import { restrictedEmployeeRoutes } from './userAccessControlStore';

// ... imports

export interface Employee {
  id: string;
  name: string;
  email: string;
  department_id: string;
  role_id: string;
  cadre_id?: string;
  department?: string;
  role?: string;
  cadre?: string;
  status: 'Active' | 'Terminated' | 'Suspended' | 'Relieved' | 'Rejoin' | 'Resigned';
  start_date: string;
  employee_code?: string;
  address?: string;
  date_of_birth?: string;
  father_name?: string;
  uan_number?: string;
  contact_number?: string;
  status_date?: string;
  status_reason?: string;
  tenant_id?: string;
  created_at?: string;
  updated_at?: string;
  is_reporting_head?: boolean;
  reporting_to?: string[] | string | null;
}

// ... rest of the store code remains exactly the same

interface EmployeesStore extends StoreState<Employee> {
  fetchEmployees: (filterByEmployeeId?: string | null) => Promise<void>;
  createEmployee: (employee: Omit<Employee, 'id' | 'created_at' | 'updated_at' | 'tenant_id'>) => Promise<Employee>;
  updateEmployee: (id: string, updates: Partial<Employee>) => Promise<Employee>;
  deleteEmployee: (id: string) => Promise<void>;
  getEmployeeById: (id: string) => Employee | undefined;
  reset: () => void;
}

export const useEmployeesStore = create<EmployeesStore>()(
  persist(
    (set, get) => ({
      ...initialStoreState<Employee>(),

      fetchEmployees: async (filterByEmployeeId?: string | null) => {
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
          let query = supabase
            .from('employees')
            .select(`
              *,
              departments:department_id(name),
              roles:role_id(name),
              cadres:cadre_id(name)
            `)
            .eq('tenant_id', auth.tenantId);

          if (filterByEmployeeId) {
            query = query.eq('id', filterByEmployeeId);
          }

          const { data, error } = await query.order('employee_code', { ascending: true });

          if (error) throw error;

          const employees = data?.map(emp => ({
            ...emp,
            department: emp.departments?.name || '',
            role: emp.roles?.name || '',
            cadre: emp.cadres?.name || ''
          })) || [];

          set(state => setSuccess(state, employees));
        } catch (error) {
          set(state => setError(state, error instanceof Error ? error.message : 'Failed to fetch employees'));
        }
      },

      createEmployee: async (employee) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated) {
          throw createAuthError();
        }

        if (!auth.tenantId) {
          throw createTenantError();
        }

        set(state => setLoading(state));

        try {
          // Check for duplicate email within tenant
          const { data: existingEmployeeWithEmail } = await supabase
            .from('employees')
            .select('id')
            .eq('email', employee.email)
            .eq('tenant_id', auth.tenantId)
            .maybeSingle();

          if (existingEmployeeWithEmail) {
            throw new Error('An employee with this email already exists in your organization');
          }

          // Check for duplicate employee code within tenant if provided
          if (employee.employee_code) {
            const { data: existingEmployee } = await supabase
              .from('employees')
              .select('id')
              .eq('employee_code', employee.employee_code)
              .eq('tenant_id', auth.tenantId)
              .maybeSingle();

            if (existingEmployee) {
              throw new Error('An employee with this employee code already exists in your organization');
            }
          }

          // Lookup department_id from department name
          const { data: department } = await supabase
            .from('departments')
            .select('id')
            .eq('name', employee.department)
            .eq('tenant_id', auth.tenantId)
            .maybeSingle();

          if (!department) {
            throw new Error(`Department "${employee.department}" not found`);
          }

          // Lookup role_id from role name
          const { data: role } = await supabase
            .from('roles')
            .select('id')
            .eq('name', employee.role)
            .eq('tenant_id', auth.tenantId)
            .maybeSingle();

          if (!role) {
            throw new Error(`Role "${employee.role}" not found`);
          }

          // Lookup cadre_id from cadre name (optional)
          let cadreId: string | null = null;
          if (employee.cadre) {
            const { data: cadre } = await supabase
              .from('cadres')
              .select('id')
              .eq('name', employee.cadre)
              .eq('tenant_id', auth.tenantId)
              .maybeSingle();
            if (cadre) cadreId = cadre.id;
          }

          // Create employee with foreign keys
          const { department: _dept, role: _role, cadre: _cadre, ...employeeWithoutNames } = employee;

          const { data, error } = await supabase
            .from('employees')
            .insert([
              {
                ...employeeWithoutNames,
                department_id: department.id,
                role_id: role.id,
                ...(cadreId ? { cadre_id: cadreId } : {}),
                tenant_id: auth.tenantId,
                created_by: auth.userId,
              },
            ])
            .select(`
              *,
              departments:department_id(name),
              roles:role_id(name),
              cadres:cadre_id(name)
            `)
            .single();

          if (error) throw error;

          const employeeWithNames = {
            ...data,
            department: data.departments?.name || '',
            role: data.roles?.name || '',
            cadre: data.cadres?.name || ''
          };

          // Sync with user profiles table for new employee
          if (employee.is_reporting_head === true) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('id, user_role')
              .ilike('email', employee.email)
              .maybeSingle();

            if (profile) {
              const currentProfileRole = profile.user_role || '';
              const isHROrAdmin = currentProfileRole.toLowerCase().includes('hr') || currentProfileRole.toLowerCase().includes('admin');
              if (!isHROrAdmin) {
                await supabase
                  .from('profiles')
                  .update({ user_role: 'Reporting Head' })
                  .eq('id', profile.id);
              }
            }
          }

          set(state => addItem(state, employeeWithNames));
          return employeeWithNames;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to create employee';
          set(state => setError(state, errorMessage));
          throw error;
        }
      },

      updateEmployee: async (id, updates) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated) throw createAuthError();
        if (!auth.tenantId) throw createTenantError();

        set(state => setLoading(state));

        try {
          // Fetch current values
          const { data: currentEmployee, error: fetchError } = await supabase
            .from('employees')
            .select('status, start_date')
            .eq('id', id)
            .eq('tenant_id', auth.tenantId)
            .single();

          if (fetchError) throw fetchError;

          const nextStatus = updates.status ?? currentEmployee.status;
          const nextStartDate = updates.start_date ?? currentEmployee.start_date;

          const isChanged =
            nextStatus !== currentEmployee.status ||
            nextStartDate !== currentEmployee.start_date;

          // Store history if ANY change happened
          if (isChanged) {
            await supabase.from('employee_status_history').insert({
              employee_id: id,
              old_status: currentEmployee.status,
              new_status: nextStatus,
              old_start_date: currentEmployee.start_date,
              new_start_date: nextStartDate,
              tenant_id: auth.tenantId,
              updated_by: auth.userId,
            });
          }

          // Duplicate checks
          if (updates.email) {
            const { data } = await supabase
              .from('employees')
              .select('id')
              .eq('email', updates.email)
              .eq('tenant_id', auth.tenantId)
              .neq('id', id)
              .maybeSingle();

            if (data) throw new Error('An employee with this email already exists');
          }

          if (updates.employee_code) {
            const { data } = await supabase
              .from('employees')
              .select('id')
              .eq('employee_code', updates.employee_code)
              .eq('tenant_id', auth.tenantId)
              .neq('id', id)
              .maybeSingle();

            if (data) throw new Error('An employee with this employee code already exists');
          }

          // Lookup department_id if department name is provided
          let updateData: any = { ...updates };
          if (updates.department) {
            const { data: department } = await supabase
              .from('departments')
              .select('id')
              .eq('name', updates.department)
              .eq('tenant_id', auth.tenantId)
              .maybeSingle();

            if (!department) {
              throw new Error(`Department "${updates.department}" not found`);
            }
            updateData.department_id = department.id;
            delete updateData.department;
          }

          // Lookup role_id if role name is provided
          if (updates.role) {
            const { data: role } = await supabase
              .from('roles')
              .select('id')
              .eq('name', updates.role)
              .eq('tenant_id', auth.tenantId)
              .maybeSingle();

            if (!role) {
              throw new Error(`Role "${updates.role}" not found`);
            }
            updateData.role_id = role.id;
            delete updateData.role;
          }

          // Lookup cadre_id if cadre name is provided (optional)
          if (updates.cadre !== undefined) {
            if (updates.cadre) {
              const { data: cadre } = await supabase
                .from('cadres')
                .select('id')
                .eq('name', updates.cadre)
                .eq('tenant_id', auth.tenantId)
                .maybeSingle();
              updateData.cadre_id = cadre ? cadre.id : null;
            } else {
              updateData.cadre_id = null;
            }
            delete updateData.cadre;
          }

          // Update employee
          const { data, error } = await supabase
            .from('employees')
            .update(updateData)
            .eq('id', id)
            .eq('tenant_id', auth.tenantId)
            .select(`
        *,
        departments:department_id(name),
        roles:role_id(name),
        cadres:cadre_id(name)
      `)
            .single();

          if (error) throw error;

          const employeeWithNames = {
            ...data,
            department: data.departments?.name || '',
            role: data.roles?.name || '',
            cadre: data.cadres?.name || ''
          };

          set(state => updateItem(state, id, employeeWithNames));

          // Sync with user profiles table
          if (updates.is_reporting_head !== undefined) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('id, user_role')
              .ilike('email', data.email)
              .maybeSingle();

            if (profile) {
              const currentProfileRole = profile.user_role || '';
              const isHROrAdmin = currentProfileRole.toLowerCase().includes('hr') || currentProfileRole.toLowerCase().includes('admin');
              
              if (!isHROrAdmin) {
                if (updates.is_reporting_head === true) {
                  await supabase
                    .from('profiles')
                    .update({ user_role: 'Reporting Head' })
                    .eq('id', profile.id);

                  // Auto-enable all screens by clearing previous custom Employee screen restrictions
                  await supabase
                    .from('user_screen_permissions')
                    .delete()
                    .eq('user_id', profile.id);

                } else if (updates.is_reporting_head === false && currentProfileRole === 'Reporting Head') {
                  await supabase
                    .from('profiles')
                    .update({ user_role: 'Employee' })
                    .eq('id', profile.id);

                  // Reset screen permissions so they fall back to default Employee restrictions
                  await supabase
                    .from('user_screen_permissions')
                    .delete()
                    .eq('user_id', profile.id);

                  // Explicitly disable restricted routes in the database
                  const { data: restrictedScreens } = await supabase
                    .from('application_screens')
                    .select('id')
                    .eq('tenant_id', auth.tenantId)
                    .in('screen_route', restrictedEmployeeRoutes);

                  if (restrictedScreens && restrictedScreens.length > 0) {
                    const permInserts = restrictedScreens.map(scr => ({
                      tenant_id: auth.tenantId,
                      user_id: profile.id,
                      screen_id: scr.id,
                      is_enabled: false,
                      created_by: auth.userId || null
                    }));

                    await supabase
                      .from('user_screen_permissions')
                      .insert(permInserts);
                  }
                }
              }
            }
          }

          // Auto-push updated name to all HikVision devices (fire-and-forget)
          if (updates.name) {
            supabase.functions.invoke('auto-sync-employee-name', {
              body: { tenantId: auth.tenantId, employeeId: id, newName: data.name }
            }).catch(err => console.error('[hik-auto-sync] name sync error:', err));
          }

          return employeeWithNames;
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Failed to update employee';
          set(state => setError(state, msg));
          throw error;
        }
      },


      deleteEmployee: async (id) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated) {
          throw createAuthError();
        }

        if (!auth.tenantId) {
          throw createTenantError();
        }

        set(state => setLoading(state));

        try {
          const { error } = await supabase
            .from('employees')
            .delete()
            .eq('id', id)
            .eq('tenant_id', auth.tenantId);

          if (error) throw error;

          set(state => removeItem(state, id));
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to delete employee';
          set(state => setError(state, errorMessage));
          throw error;
        }
      },

      getEmployeeById: (id) => {
        return get().items.find(emp => emp.id === id);
      },

      reset: () => {
        set(initialStoreState<Employee>());
      },
    }),
    {
      name: 'employees-storage',
      partialize: (state) => ({
        items: state.items,
        initialized: state.initialized,
      }),
    }
  )
);
