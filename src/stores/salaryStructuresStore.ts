import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '../lib/supabase';
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

export interface SalaryStructureComponent {
  id?: string;
  key: string;
  name: string;
  component_type: 'earning' | 'deduction';
  isCustom?: boolean;
  isStatutory?: boolean;
  // NEW: Two-set system for calculation and editability
  amount_type: 'percentage' | 'value'; // CHANGED: Removed 'expression' option
  calculation_type?: 'simple' | 'expression'; // NEW: Added calculation_type field
  editability: 'fixed' | 'editable' | 'enter_later';
  // NEW: Type selection for individual vs common components
  type_selection?: 'common' | 'individual';
  // NEW: Value set determines when component value is entered
  value_set?: 'master_entry' | 'at_structure' | 'at_executing';
  // Keep old field for backward compatibility during transition
  //calculation_method?: 'fixed' | 'direct' | 'percentage';
  amount?: number;
  percentage_value?: number;
  reference_components?: string[];
  is_taxable: boolean;
  description?: string;
  display_order?: number;
  // NEW: Attendance linking for Value (Fixed Amount) components
  is_attendance_linked?: boolean;
  // always_treat_as_full_day?: boolean;
  // NEW: Is Locked flag for structure components
  is_locked?: boolean;
  // NEW: Is Applied in Calculation flag for statutory deductions
  is_applied_in_calculation?: boolean;
  statutory_component_id: string | null;
  // NEW: Expression fields for expression-type components
  expression?: string;
  expression_ast?: any;
  // NEW: Rounding configuration
  rounding_type?: 'none' | 'round' | 'floor' | 'ceil' | 'decimal2';
}

export interface SalaryStructure {
  id?: string;
  name: string;
  description?: string;
  is_active: boolean;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
  components: SalaryStructureComponent[];
}

export interface SalaryStructureHeader {
  id?: string;
  name: string;
  description?: string;
  is_active: boolean;
}

export interface EmployeeSalaryStructure {
  id?: string;
  employee_id: string;
  structure_id: string;
  effective_from: string;
  effective_to?: string;
  created_by?: string;
  created_at?: string;
  structure_name?: string;
  components?: SalaryStructureComponent[];
}

export interface ComponentType {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  component_type?: 'earning' | 'deduction';
  component_category?: 'general' | 'calculation';
  type_selection?: 'common' | 'individual';
  amount_type?: 'value' | 'percentage'; // CHANGED: Removed 'expression' option
  calculation_type?: 'simple' | 'expression'; // NEW: Added calculation_type field
  statutory_component_id?: string | null;
  rounding_type?: 'none' | 'round' | 'floor' | 'ceil' | 'decimal2';
  created_at?: string;
  updated_at?: string;
}

interface SalaryStructuresStore extends StoreState<SalaryStructureHeader> {
  structureDetails: SalaryStructure | null;
  detailsLoading: boolean;
  detailsError: string | null;
  salaryComponentTypes: ComponentType[];
  deductionComponentTypes: ComponentType[];
  componentTypesLoading: boolean;
  componentTypesError: string | null;

  fetchSalaryStructures: () => Promise<void>;
  fetchSalaryStructureDetails: (id: string) => Promise<SalaryStructure>;
  createSalaryStructure: (structure: Omit<SalaryStructure, 'id' | 'created_at' | 'updated_at'>) => Promise<SalaryStructure>;
  updateSalaryStructure: (id: string, updates: Partial<SalaryStructure>) => Promise<SalaryStructure>;
  deleteSalaryStructure: (id: string) => Promise<void>;
  assignSalaryStructure: (assignment: Omit<EmployeeSalaryStructure, 'id' | 'created_at'>) => Promise<EmployeeSalaryStructure>;
  // getEmployeeSalaryStructureHistory: (employeeId: string) => Promise<EmployeeSalaryStructure[]>;
  fetchSalaryComponentTypes: () => Promise<void>;
  fetchDeductionComponentTypes: () => Promise<void>;
  reset: () => void;
}

export const useSalaryStructuresStore = create<SalaryStructuresStore>()(
  persist(
    (set, get) => ({
      ...initialStoreState<SalaryStructureHeader>(),
      structureDetails: null,
      detailsLoading: false,
      detailsError: null,
      salaryComponentTypes: [],
      deductionComponentTypes: [],
      componentTypesLoading: false,
      componentTypesError: null,

      fetchSalaryStructures: async () => {
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
            .from('payroll_structures')
            .select('id, name, description, is_active')
            .eq('tenant_id', auth.tenantId)
            .order('created_at', { ascending: false });

          if (error) throw error;

          set(state => setSuccess(state, data || []));
        } catch (error) {
          set(state => setError(state, error instanceof Error ? error.message : 'Failed to fetch salary structures'));
        }
      },

      fetchSalaryStructureDetails: async (id) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated) throw createAuthError();
        if (!auth.tenantId) throw createTenantError();

        set({ detailsLoading: true, detailsError: null });

        try {
          const { data, error } = await supabase.rpc('get_payroll_structure_details', {
            p_structure_id: id,
            p_tenant_id: auth.tenantId,
          });

          if (error) throw error;

          set({ structureDetails: data, detailsLoading: false });
          return data;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to fetch structure details';
          set({ detailsError: errorMessage, detailsLoading: false });
          throw error;
        }
      },

      createSalaryStructure: async (structure) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated) throw createAuthError();
        if (!auth.tenantId) throw createTenantError();

        set(state => setLoading(state));

        try {
          const { data: structureData, error: structureError } = await supabase
            .from('payroll_structures')
            .insert([
              {
                name: structure.name,
                description: structure.description,
                is_active: structure.is_active,
                created_by: auth.userId,
                tenant_id: auth.tenantId,
              },
            ])
            .select()
            .single();

          if (structureError) throw structureError;

          if (structure.components.length > 0) {
            for (const component of structure.components) {
              const { error } = await supabase.rpc('insert_pay_structure_component', {
                p_amount: component.amount || 0,
                p_amount_type: component.amount_type,
                p_editability: component.editability,
                p_component_id: component.id == '' ? null : component.id,
                p_component_name: component.name,
                p_component_type: component.component_type,
                p_iscustom: component.isCustom,
                p_percentage: component.percentage_value || 0,
                p_reference_components: component.reference_components ?? [],
                p_structure_id: structureData.id,
                p_tenant_id: auth.tenantId,
                p_is_attendance_linked: component.is_attendance_linked !== false,
                // p_always_treat_as_full_day: component.always_treat_as_full_day === true,
                p_is_locked: component.is_locked === true,
                p_is_applied_in_calculation: component.is_applied_in_calculation !== false,
                p_expression: component.expression || null,
                p_expression_ast: component.expression_ast || null,
                p_display_order: component.display_order || 0,
              });

              if (error) throw error;
            }
          }

          const { data, error } = await supabase.rpc('get_salary_structure_details', {
            p_structure_id: structureData.id,
            p_tenant_id: auth.tenantId,
          });

          if (error) throw error;

          set(state => addItem(state, { id: structureData.id, name: structureData.name, description: structureData.description, is_active: structureData.is_active }));
          return data;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to create salary structure';
          set(state => setError(state, errorMessage));
          throw error;
        }
      },

      updateSalaryStructure: async (id, updates) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated) throw createAuthError();
        if (!auth.tenantId) throw createTenantError();

        set(state => setLoading(state));

        try {
          const { components, ...structureUpdates } = updates;

          if (Object.keys(structureUpdates).length > 0) {
            const { error: structureError } = await supabase
              .from('payroll_structures')
              .update({
                name: structureUpdates.name,
                description: structureUpdates.description,
                is_active: structureUpdates.is_active,
                updated_at: new Date().toISOString(),
              })
              .eq('id', id)
              .eq('tenant_id', auth.tenantId);

            if (structureError) throw structureError;
          }

          if (components) {
            const { error: deleteError } = await supabase
              .from('payroll_structure_components')
              .delete()
              .eq('structure_id', id);

            if (deleteError) throw deleteError;

            if (components.length > 0) {
              for (const component of components) {
                const { error } = await supabase.rpc('insert_pay_structure_component', {
                  p_amount: component.amount || 0,
                  p_amount_type: component.amount_type,
                  p_editability: component.editability,
                  p_component_id: component.id || null,
                  p_component_name: component.name,
                  p_component_type: component.component_type,
                  p_iscustom: component.isCustom,
                  p_percentage: component.percentage_value || 0,
                  p_reference_components: component.reference_components ?? [],
                  p_structure_id: id,
                  p_tenant_id: auth.tenantId,
                  p_is_attendance_linked: component.is_attendance_linked !== false,
                  // p_always_treat_as_full_day: component.always_treat_as_full_day === true,
                  p_is_locked: component.is_locked === true,
                  p_is_applied_in_calculation: component.is_applied_in_calculation !== false,
                  p_expression: component.expression || null,
                  p_expression_ast: component.expression_ast || null,
                  p_display_order: component.display_order || 0,
                });

                if (error) throw error;
              }
            }
          }

          const { data, error } = await supabase.rpc('get_payroll_structure_details', {
            p_structure_id: id,
            p_tenant_id: auth.tenantId,
          });

          if (error) throw error;

          set(state => updateItem(state, id, { id, name: data.name, description: data.description, is_active: data.is_active }));
          return data;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to update salary structure';
          set(state => setError(state, errorMessage));
          throw error;
        }
      },

      deleteSalaryStructure: async (id) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated) throw createAuthError();
        if (!auth.tenantId) throw createTenantError();

        set(state => setLoading(state));

        try {
          const { error } = await supabase
            .from('payroll_structures')
            .delete()
            .eq('id', id)
            .eq('tenant_id', auth.tenantId);

          if (error) throw error;

          set(state => removeItem(state, id));
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to delete salary structure';
          set(state => setError(state, errorMessage));
          throw error;
        }
      },

      assignSalaryStructure: async (assignment) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated) throw createAuthError();
        if (!auth.tenantId) throw createTenantError();

        try {
          const { error: updateError } = await supabase
            .from('employee_salary_structures')
            .update({ effective_to: assignment.effective_from })
            .eq('employee_id', assignment.employee_id)
            .eq('tenant_id', auth.tenantId)
            .is('effective_to', null);

          if (updateError) throw updateError;

          const { data, error } = await supabase
            .from('employee_salary_structures')
            .insert([
              {
                ...assignment,
                created_by: auth.userId,
                tenant_id: auth.tenantId,
              },
            ])
            .select()
            .single();

          if (error) throw error;

          return data;
        } catch (error) {
          throw error instanceof Error ? error : new Error('Failed to assign salary structure');
        }
      },

      // getEmployeeSalaryStructureHistory: async (employeeId) => {
      //   const auth = await validateAuth();
      //   if (!auth.isAuthenticated) throw createAuthError();
      //   if (!auth.tenantId) throw createTenantError();

      //   try {
      //     const { data, error } = await supabase.rpc('get_employee_salary_structure_history', {
      //       p_employee_id: employeeId,
      //       p_tenant_id: auth.tenantId,
      //     });

      //     if (error) throw error;

      //     return data;
      //   } catch (error) {
      //     throw error instanceof Error ? error : new Error('Failed to fetch employee salary structure history');
      //   }
      // },

      fetchSalaryComponentTypes: async () => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated || !auth.tenantId) return;

        set({ componentTypesLoading: true, componentTypesError: null });

        try {
          const { data, error } = await supabase
            .from('payroll_components')
            .select('*')
            .eq('is_active', true)
            .eq('component_type', 'earning')
            .eq('component_category', 'general')
            .eq('tenant_id', auth.tenantId)
            .order('name');

          if (error) throw error;

          set({ salaryComponentTypes: data || [], componentTypesLoading: false });
        } catch (error) {
          set({
            componentTypesError: error instanceof Error ? error.message : 'Failed to fetch salary component types',
            componentTypesLoading: false,
          });
        }
      },

      fetchDeductionComponentTypes: async () => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated || !auth.tenantId) return;

        set({ componentTypesLoading: true, componentTypesError: null });

        try {
          const { data, error } = await supabase
            .from('payroll_components')
            .select('*')
            .eq('is_active', true)
            .eq('component_type', 'deduction')
            .eq('component_category', 'general')
            .eq('tenant_id', auth.tenantId)
            .order('name');

          if (error) throw error;

          set({ deductionComponentTypes: data || [], componentTypesLoading: false });
        } catch (error) {
          set({
            componentTypesError: error instanceof Error ? error.message : 'Failed to fetch deduction component types',
            componentTypesLoading: false,
          });
        }
      },

      reset: () => {
        set({
          ...initialStoreState<SalaryStructureHeader>(),
          structureDetails: null,
          detailsLoading: false,
          detailsError: null,
          salaryComponentTypes: [],
          deductionComponentTypes: [],
          componentTypesLoading: false,
          componentTypesError: null,
        });
      },
    }),
    {
      name: 'salary-structures-storage',
      partialize: (state) => ({
        items: state.items,
        initialized: state.initialized,
      }),
    }
  )
);
