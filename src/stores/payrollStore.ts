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

export type {
  SalaryComponent,
  DeductionComponent,
  PayrollEntry,
  PayrollProcessEntry,
  PayrollSummary,
} from '../lib/payroll';

import type { PayrollEntry, PayrollSummary, SalaryComponent, DeductionComponent } from '../lib/payroll';

interface PayrollStore extends StoreState<PayrollEntry> {
  summary: PayrollSummary | null;
  summaryLoading: boolean;
  summaryError: string | null;

  fetchPayrollEntries: (periodStart?: string, periodEnd?: string) => Promise<void>;
  fetchPayrollSummary: (periodStart: string, periodEnd: string) => Promise<void>;
  createPayrollEntry: (entry: Omit<PayrollEntry, 'id' | 'created_at' | 'updated_at' | 'tenant_id'>) => Promise<PayrollEntry>;
  updatePayrollEntry: (id: string, updates: Partial<PayrollEntry>) => Promise<PayrollEntry>;
  deletePayrollEntry: (id: string) => Promise<void>;
  
  // New Reprocess Function
  reprocessPayroll: (id: string) => Promise<void>;

  createPayProcessEntry: (entry: Omit<PayrollEntry, 'id' | 'created_at' | 'updated_at'>) => Promise<PayrollEntry>;
  updatePayProcessEntry: (id: string, updates: Partial<PayrollEntry>) => Promise<PayrollEntry>;
  getPayrollEntryById: (id: string) => PayrollEntry | undefined;
  reset: () => void;
}

export const usePayrollStore = create<PayrollStore>()(
  persist(
    (set, get) => ({
      ...initialStoreState<PayrollEntry>(),
      summary: null,
      summaryLoading: false,
      summaryError: null,

      fetchPayrollEntries: async (periodStart, periodEnd) => {
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
            .from('payroll')
            .select(
              `
              *,
              employee:employees (
                name,
                email,
                employee_code,
                department:departments(name),
                role:roles(name),
                cadre:cadres(name)
              )
            `
            )
            .eq('tenant_id', auth.tenantId)
            .order('created_at', { ascending: false });

          if (periodStart && periodEnd) {
            query = query.gte('period_start', periodStart).lte('period_end', periodEnd);
          }

          const { data, error } = await query;

          if (error) throw error;

          set(state => setSuccess(state, data || []));
        } catch (error) {
          set(state => setError(state, error instanceof Error ? error.message : 'Failed to fetch payroll entries'));
        }
      },

      fetchPayrollSummary: async (periodStart, periodEnd) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated) {
          set({ summaryError: createAuthError().message });
          return;
        }

        if (!auth.tenantId) {
          set({ summaryError: createTenantError().message });
          return;
        }

        set({ summaryLoading: true, summaryError: null });

        try {
          const { data, error } = await supabase.rpc('get_payroll_summary', {
            p_start: periodStart,
            p_end: periodEnd,
            p_tenant_id: auth.tenantId,
          });

          if (error) throw error;

          set({ summary: data, summaryLoading: false });
        } catch (error) {
          set({
            summaryError: error instanceof Error ? error.message : 'Failed to fetch payroll summary',
            summaryLoading: false,
          });
        }
      },

      createPayrollEntry: async (entry) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated) throw createAuthError();
        if (!auth.tenantId) throw createTenantError();

        set(state => setLoading(state));

        try {
          const salaryComponents =
            entry.salary_components?.length > 0
              ? entry.salary_components
              : [{ name: 'Base Salary', amount: entry.base_salary }];

          const deductionComponents =
            entry.deduction_components?.length > 0
              ? entry.deduction_components
              : entry.deductions > 0
              ? [{ name: 'Standard Deduction', amount: entry.deductions }]
              : [];

          const attendanceData = entry.attendance_summary ? { attendance_summary: entry.attendance_summary } : {};
          const calculationComponents = (entry as any).calculation_components ? { calculation_components: (entry as any).calculation_components } : {};

          const { data, error } = await supabase
            .from('payroll')
            .insert([
              {
                ...entry,
                salary_components: salaryComponents,
                deduction_components: deductionComponents,
                base_salary: salaryComponents.reduce((sum, comp) => sum + comp.amount, 0),
                deductions: deductionComponents.reduce((sum, comp) => sum + comp.amount, 0),
                ...attendanceData,
                ...calculationComponents,
                tenant_id: auth.tenantId,
              },
            ])
            .select()
            .single();

          if (error) throw error;

          set(state => addItem(state, data));
          return data;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to create payroll entry';
          set(state => setError(state, errorMessage));
          throw error;
        }
      },

      updatePayrollEntry: async (id, updates) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated) throw createAuthError();
        if (!auth.tenantId) throw createTenantError();

        try {
          const finalUpdates: Partial<PayrollEntry> = { ...updates };

          if (updates.status === 'Paid') {
            finalUpdates.payment_date = new Date().toISOString();
          }

          if ('salary_components' in updates || 'base_salary' in updates) {
            if (!updates.salary_components || updates.salary_components.length === 0) {
              finalUpdates.salary_components = [];
              finalUpdates.base_salary = 0;
            } else {
              finalUpdates.salary_components = updates.salary_components;
              finalUpdates.base_salary = updates.salary_components.reduce((sum, comp) => sum + comp.amount, 0);
            }
          }

          if ('deduction_components' in updates || 'deductions' in updates) {
            if (!updates.deduction_components || updates.deduction_components.length === 0) {
              finalUpdates.deduction_components = [];
              finalUpdates.deductions = 0;
            } else {
              finalUpdates.deduction_components = updates.deduction_components;
              finalUpdates.deductions = updates.deduction_components.reduce((sum, comp) => sum + comp.amount, 0);
            }
          }

          const { data, error } = await supabase
            .from('payroll')
            .update(finalUpdates)
            .eq('id', id)
            .eq('tenant_id', auth.tenantId)
            .select()
            .single();

          if (error) throw error;

          set(state => updateItem(state, id, data));
          return data;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to update payroll entry';
          set(state => setError(state, errorMessage));
          throw error;
        }
      },

      deletePayrollEntry: async (id) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated) throw createAuthError();
        if (!auth.tenantId) throw createTenantError();

        set(state => setLoading(state));

        try {
          const { error } = await supabase.from('payroll').delete().eq('id', id).eq('tenant_id', auth.tenantId);

          if (error) throw error;

          set(state => removeItem(state, id));
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to delete payroll entry';
          set(state => setError(state, errorMessage));
          throw error;
        }
      },

      // --- New Implementation for Reprocess ---
      reprocessPayroll: async (id) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated) throw createAuthError();
        if (!auth.tenantId) throw createTenantError();

        set(state => setLoading(state));

        try {
            // Call the database function to handle transaction safely
            const { error } = await supabase.rpc('reprocess_payroll_transaction', {
                p_payroll_id: id
            });

            if (error) throw error;

            // Optimistically update the local store to 'Draft'
            // We set payment_date to null as per the SQL logic
            set(state => ({
                items: state.items.map(item => 
                    item.id === id 
                    ? { ...item, status: 'Draft', payment_date: null } as PayrollEntry 
                    : item
                ),
                isLoading: false,
                error: null
            }));

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to reprocess payroll';
            set(state => setError(state, errorMessage));
            throw error;
        }
      },
      // ----------------------------------------

      createPayProcessEntry: async (entry) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated) throw createAuthError();
        if (!auth.tenantId) throw createTenantError();

        set(state => setLoading(state));

        try {
          const salary_components =
            entry.salary_components?.length > 0
              ? entry.salary_components
              : [{ name: 'Base Salary', amount: entry.base_salary }];

          const deduction_components =
            entry.deduction_components?.length > 0
              ? entry.deduction_components
              : entry.deductions > 0
              ? [{ name: 'Standard Deduction', amount: entry.deductions }]
              : [];

          const attendanceData = entry.attendance_summary
            ? { attendance_summary: entry.attendance_summary }
            : {};

          const calculationComponents = (entry as any).calculation_components ? { calculation_components: (entry as any).calculation_components } : {};

          const entryData = {
            ...entry,
            salary_components,
            deduction_components,
            base_salary: salary_components.reduce((sum, comp) => sum + comp.amount, 0),
            // deductions: deduction_components.reduce((sum, comp) => sum + comp.amount, 0),
            deductions: deduction_components.reduce((sum, comp) => {
              const include =
                comp.is_applied_in_calculation === undefined ||
                comp.is_applied_in_calculation === null ||
                comp.is_applied_in_calculation === true;

              return include ? sum + comp.amount : sum;
            }, 0),

            ...attendanceData,
            ...calculationComponents,
            tenant_id: auth.tenantId,
          };

          // removes field before insert
          delete entryData.attendance_summary;

          // DUPLICATE HANDLING: Check if a record exists for the same employee and period
          const { data: existingRecord, error: checkError } = await supabase
            .from('payroll')
            .select('id')
            .eq('employee_id', entry.employee_id)
            .eq('period_start', entry.period_start)
            .eq('period_end', entry.period_end)
            .eq('tenant_id', auth.tenantId)
            .maybeSingle();

          if (checkError) {
            console.error('Error checking for duplicates:', checkError);
            throw checkError;
          }

          let data: PayrollEntry;

          if (existingRecord) {
            // Duplicate found: Update the existing record
            console.log(`Duplicate payroll record found for employee ${entry.employee_id}, updating existing record ${existingRecord.id}`);

            const { data: updatedData, error: updateError } = await supabase
              .from('payroll')
              .update(entryData)
              .eq('id', existingRecord.id)
              .eq('tenant_id', auth.tenantId)
              .select()
              .single();

            if (updateError) throw updateError;
            data = updatedData;

            // Update the store item if it exists
            set(state => {
              const existingItemIndex = state.items.findIndex(item => item.id === existingRecord.id);
              if (existingItemIndex !== -1) {
                return updateItem(state, existingRecord.id, data);
              } else {
                return addItem(state, data);
              }
            });
          } else {
            // No duplicate: Proceed with normal insert
            const { data: insertedData, error: insertError } = await supabase
              .from('payroll')
              .insert([entryData])
              .select()
              .single();

            if (insertError) throw insertError;
            data = insertedData;

            set(state => addItem(state, data));
          }

          return data;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to create payroll process entry';
          set(state => setError(state, errorMessage));
          throw error;
        }
      },

      updatePayProcessEntry: async (id, updates) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated) throw createAuthError();
        if (!auth.tenantId) throw createTenantError();

        set(state => setLoading(state));

        try {
          const finalUpdates: Partial<PayrollEntry> = { ...updates };

          if (updates.status === 'Paid') {
            finalUpdates.payment_date = new Date().toISOString();
          }

          if ('salary_components' in updates || 'base_salary' in updates) {
            if (!updates.salary_components || updates.salary_components.length === 0) {
              finalUpdates.salary_components = [];
              finalUpdates.base_salary = 0;
            } else {
              finalUpdates.salary_components = updates.salary_components;
              finalUpdates.base_salary = updates.salary_components.reduce((sum, comp) => sum + comp.amount, 0);
            }
          }

          if ('deduction_components' in updates || 'deductions' in updates) {
            if (!updates.deduction_components || updates.deduction_components.length === 0) {
              finalUpdates.deduction_components = [];
              finalUpdates.deductions = 0;
            } else {
              finalUpdates.deduction_components = updates.deduction_components;
              finalUpdates.deductions = updates.deduction_components.reduce((sum, comp) => sum + comp.amount, 0);
            }
          }

          const { data, error } = await supabase
            .from('payroll')
            .update(finalUpdates)
            .eq('id', id)
            .eq('tenant_id', auth.tenantId)
            .select()
            .single();

          if (error) throw error;

          set(state => updateItem(state, id, data));
          return data;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to update payroll process entry';
          set(state => setError(state, errorMessage));
          throw error;
        }
      },

      getPayrollEntryById: (id) => {
        return get().items.find(entry => entry.id === id);
      },

      reset: () => {
        set({
          ...initialStoreState<PayrollEntry>(),
          summary: null,
          summaryLoading: false,
          summaryError: null,
        });
      },
    }),
    {
      name: 'payroll-storage',
      partialize: (state) => ({
        items: state.items,
        initialized: state.initialized,
        summary: state.summary,
      }),
    }
  ) 
);