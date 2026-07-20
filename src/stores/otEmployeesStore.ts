import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { validateAuth } from './utils/storeUtils';
import type { EmployeeOTStatus } from '../types/overtime';
import {
  getEmployeeOTEligibility,
  upsertEmployeeOTEligibility,
  bulkUpdateOTEligibility,
  getTenantId,
} from '../lib/otManagement';

interface OTEmployeesStore {
  employees: EmployeeOTStatus[];
  loading: boolean;
  error: string | null;

  fetchEmployees: (options?: { silent?: boolean }) => Promise<void>;
  updateEligibility: (employeeId: string, isEligible: boolean, notes?: string, effectiveFrom?: string) => Promise<void>;
  bulkUpdate: (employeeIds: string[], isEligible: boolean) => Promise<void>;
  reset: () => void;
}

export const useOTEmployeesStore = create<OTEmployeesStore>((set, get) => ({
  employees: [],
  loading: false,
  error: null,

  fetchEmployees: async (options = {}) => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) {
      set({ error: 'Authentication required' });
      return;
    }

    if (!options.silent) {
      set({ loading: true, error: null });
    }

    try {
      // Get all employees with their OT eligibility
      const { data: employeesData, error: empError } = await supabase
        .from('employees')
        .select(`
          id,
          name,
          employee_code,
          departments:department_id(name)
        `)
        .eq('tenant_id', auth.tenantId)
        // .eq('is_active', true)
        .order('employee_code', { ascending: true });

      if (empError) throw empError;

      // Get OT eligibility data
      const eligibilityData = await getEmployeeOTEligibility(auth.tenantId);
      const eligibilityMap = new Map(
        eligibilityData.map(e => [e.employee_id, e])
      );

      const employees: EmployeeOTStatus[] = (employeesData || []).map((emp: any) => {
        const eligibility = eligibilityMap.get(emp.id);
        return {
          id: eligibility?.id || '',
          employeeId: emp.id,
          employeeName: emp.name,
          employeeCode: emp.employee_code || '',
          department: emp.departments?.name || 'N/A',
          isOTEligible: eligibility?.is_ot_eligible ?? true,
          effectiveFrom: eligibility?.effective_from || new Date().toISOString().split('T')[0],
          notes: eligibility?.notes,
        };
      });

      set({ employees, loading: false });
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
    }
  },

  updateEligibility: async (employeeId, isEligible, notes, effectiveFrom) => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) {
      throw new Error('Authentication required');
    }

    try {
      await upsertEmployeeOTEligibility(
        auth.tenantId,
        employeeId,
        isEligible,
        effectiveFrom,
        notes
      );

      // Refresh list
      await get().fetchEmployees({ silent: true });
    } catch (error) {
      throw error;
    }
  },

  bulkUpdate: async (employeeIds, isEligible) => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) {
      throw new Error('Authentication required');
    }

    try {
      await bulkUpdateOTEligibility(auth.tenantId, employeeIds, isEligible);

      // Refresh list
      await get().fetchEmployees({ silent: true });
    } catch (error) {
      throw error;
    }
  },

  reset: () => set({ employees: [], loading: false, error: null }),
}));
