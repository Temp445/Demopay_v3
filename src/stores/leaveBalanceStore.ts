import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { getTenantId } from '../lib/tenantDb';

export interface LeaveBalance {
  id: string;
  employee_id: string;
  leave_type_id: string;
  year: number;
  total_days: number;
  used_days: number;
  leave_type: {
    name: string;
    is_paid: boolean;
  };
}

interface LeaveBalanceState {
  items: LeaveBalance[];
  loading: boolean;
  error: string | null;
  fetchLeaveBalances: (employeeId: string, year: number) => Promise<void>;
}

export const useLeaveBalanceStore = create<LeaveBalanceState>((set) => ({
  items: [],
  loading: false,
  error: null,

  fetchLeaveBalances: async (employeeId, year) => {
    try {
      set({ loading: true, error: null });

      const tenantId = await getTenantId();

      const { data, error } = await supabase
        .from('leave_balances')
        .select(`
          id,
          employee_id,
          leave_type_id,
          year,
          total_days,
          used_days,
          leave_type:leave_types (
            name,
            is_paid
          )
        `)
        .eq('employee_id', employeeId)
        .eq('year', year)
        .eq('tenant_id', tenantId);

      if (error) throw error;

      set({ items: data || [], loading: false });
    } catch (err: any) {
      set({
        loading: false,
        error: err.message || 'Failed to load leave balances',
      });
    }
  },
}));
