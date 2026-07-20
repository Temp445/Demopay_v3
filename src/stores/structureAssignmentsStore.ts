import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import {
  validateAuth,
  createAuthError,
  createTenantError,
  initialStoreState,
  setLoading,
  setError,
  type StoreState,
} from './utils/storeUtils';
import { getTenantId } from '../lib/tenantDb';

export interface EmployeeAssignment {
  assignment_id: string;
  employee_id: string;
  employee_code: string;
  employee_name: string;
  department: string | null;
  position: string | null;
  individual_component_values: Record<string, number>;
  assigned_at: string;
}

export interface EmployeeWithAssignment {
  id: string;
  employee_code: string;
  full_name: string;
  department: string | null;
  position: string | null;
  current_structure_id: string | null;
  current_structure_name: string | null;
  individual_component_values?: Record<string, number> | null;
}

interface StructureAssignmentsState extends StoreState<EmployeeAssignment> {
  assignments: EmployeeAssignment[];
  allEmployees: EmployeeWithAssignment[];

  // Actions
  fetchAssignmentsByStructure: (structureId: string) => Promise<void>;
  fetchAllEmployeesWithAssignments: () => Promise<void>;
  assignEmployees: (employeeIds: string[], structureId: string) => Promise<void>;
  assignStructure: (payload: Array<{ employee_id: string; structure_id: string; individual_component_values: Record<string, number> }>) => Promise<{ successCount: number; errorCount: number }>;
  updateIndividualValues: (assignmentId: string, values: Record<string, number>) => Promise<void>;
  removeAssignment: (employeeId: string) => Promise<void>;
}

export const useStructureAssignmentsStore = create<StructureAssignmentsState>((set, get) => ({
  ...initialStoreState<EmployeeAssignment>(),
  assignments: [],
  allEmployees: [],

  fetchAssignmentsByStructure: async (structureId: string) => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated) {
      set(state => setError(state, createAuthError()));
      return;
    }

    try {
      const tenantId = await getTenantId();
      if (!tenantId) {
        set(state => setError(state, createTenantError()));
        return;
      }

      set(state => setLoading(state));

      const { data, error } = await supabase.rpc('get_employees_by_structure', {
        p_tenant_id: tenantId,
        p_salary_structure_id: structureId,
      });

      if (error) throw error;

      set({
        assignments: data || [],
        loading: false,
        error: null,
      });
    } catch (error: any) {
      set(state => setError(state, error));
    }
  },

  fetchAllEmployeesWithAssignments: async () => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated) {
      set(state => setError(state, createAuthError()));
      return;
    }

    try {
      const tenantId = await getTenantId();
      if (!tenantId) {
        set(state => setError(state, createTenantError()));
        return;
      }

      set(state => setLoading(state));

      // Fetch all employees with their current assignments
      const { data: employees, error: employeesError } = await supabase
        .from('employees')
        .select(`
          id,
          employee_code,
          name,
          department:departments(name),
          role:roles(name)
        `)
        .eq('tenant_id', tenantId)
        .eq('status', 'Active')
        .order('employee_code');

      if (employeesError) throw employeesError;

      // Fetch all current assignments
      const { data: assignments, error: assignmentsError } = await supabase
        .from('employee_salary_structure_assignments')
        .select(`
          employee_id,
          individual_component_values,
          payroll_structures:payroll_structures(id, name)
        `)
        .eq('tenant_id', tenantId);

      if (assignmentsError) throw assignmentsError;

      // Create a map of assignments
      const assignmentMap = new Map(
        assignments?.map((a: any) => [
          a.employee_id,
          {
            structure_id: a.payroll_structures.id,
            structure_name: a.payroll_structures.name,
            individual_component_values: a.individual_component_values,
          },
        ]) || []
      );

      // Merge employee data with assignment data
      const enrichedEmployees: EmployeeWithAssignment[] = (employees || []).map((emp: any) => {
        const assignment = assignmentMap.get(emp.id);
        return {
          id: emp.id,
          employee_code: emp.employee_code,
          full_name: emp.name,
          department: emp.department?.name || null,
          position: emp.role?.name || null,
          current_structure_id: assignment?.structure_id || null,
          current_structure_name: assignment?.structure_name || null,
          individual_component_values: assignment?.individual_component_values || null,
        };
      });

      set({
        allEmployees: enrichedEmployees,
        loading: false,
        error: null,
      });
    } catch (error: any) {
      set(state => setError(state, error));
    }
  },

  assignEmployees: async (employeeIds: string[], structureId: string) => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated) {
      set(state => setError(state, createAuthError()));
      return;
    }

    try {
      const tenantId = await getTenantId();
      if (!tenantId) {
        set(state => setError(state, createTenantError()));
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      set(state => setLoading(state));

      const { data, error } = await supabase.rpc('bulk_assign_employees_to_structure', {
        p_tenant_id: tenantId,
        p_employee_ids: employeeIds,
        p_salary_structure_id: structureId,
        p_assigned_by: user.id,
      });

      if (error) throw error;

      if (data.errors > 0) {
        console.warn('Some assignments failed:', data.error_details);
      }

      set({ loading: false, error: null });

      // Refresh assignments
      await get().fetchAssignmentsByStructure(structureId);
      await get().fetchAllEmployeesWithAssignments();
    } catch (error: any) {
      set(state => setError(state, error));
      throw error;
    }
  },

  assignStructure: async (payload: Array<{ employee_id: string; structure_id: string; individual_component_values: Record<string, number> }>) => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated) {
      set(state => setError(state, createAuthError()));
      throw createAuthError();
    }


    try {
      const tenantId = await getTenantId();
      if (!tenantId) {
        set(state => setError(state, createTenantError()));
        throw new Error('No tenant ID found');
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      set(state => setLoading(state));

      let successCount = 0;
      let errorCount = 0;
      const errors: Array<{ employee_id: string; error: string }> = [];

      for (const assignment of payload) {
        try {
          const { data, error } = await supabase.rpc('assign_employee_to_structure', {
            p_tenant_id: tenantId,
            p_employee_id: assignment.employee_id,
            p_salary_structure_id: assignment.structure_id,
            p_assigned_by: user.id,
            p_individual_values: assignment.individual_component_values,
          });

          if (error) {
            console.error('RPC Error:', error);
            throw error;
          }

          // Check if the function returned success
          if (data && data.success) {
            successCount++;
          } else {
            throw new Error('Assignment failed without error message');
          }
        } catch (err: any) {
          console.error('Error assigning employee:', err);
          errorCount++;
          errors.push({
            employee_id: assignment.employee_id,
            error: err.message || 'Unknown error',
          });
        }
      }

      // Refresh assignments only if we have successes
      if (successCount > 0 && payload.length > 0) {
        await get().fetchAssignmentsByStructure(payload[0].structure_id);
        await get().fetchAllEmployeesWithAssignments();
      }

      set({ loading: false, error: null });

      // Return the result for the frontend to handle
      return { successCount, errorCount };
    } catch (error: any) {
      set(state => setError(state, error));
      throw error;
    }
  },

  updateIndividualValues: async (assignmentId: string, values: Record<string, number>) => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated) {
      set(state => setError(state, createAuthError()));
      return;
    }

    try {
      const tenantId = await getTenantId();
      if (!tenantId) {
        set(state => setError(state, createTenantError()));
        return;
      }

      set(state => setLoading(state));

      const { error } = await supabase
        .from('employee_salary_structure_assignments')
        .update({
          individual_component_values: values,
          updated_at: new Date().toISOString(),
        })
        .eq('id', assignmentId)
        .eq('tenant_id', tenantId);

      if (error) throw error;

      // Update local state
      set((state) => ({
        assignments: state.assignments.map((assignment) =>
          assignment.assignment_id === assignmentId
            ? { ...assignment, individual_component_values: values }
            : assignment
        ),
        loading: false,
        error: null,
      }));

    } catch (error: any) {
      set(state => setError(state, error));
      throw error;
    }
  },

  removeAssignment: async (employeeId: string) => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated) {
      set(state => setError(state, createAuthError()));
      return;
    }

    try {
      const tenantId = await getTenantId();
      if (!tenantId) {
        set(state => setError(state, createTenantError()));
        return;
      }

      set(state => setLoading(state));

      const { data, error } = await supabase.rpc('remove_employee_assignment', {
        p_tenant_id: tenantId,
        p_employee_id: employeeId,
      });

      if (error) throw error;

      if (!data.deleted) {
        throw new Error('No assignment found to remove');
      }

      // Update local state
      set((state) => ({
        assignments: state.assignments.filter((a) => a.employee_id !== employeeId),
        loading: false,
        error: null,
      }));

      await get().fetchAllEmployeesWithAssignments();
    } catch (error: any) {
      set(state => setError(state, error));
      throw error;
    }
  },
}));
