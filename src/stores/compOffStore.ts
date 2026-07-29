import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { getTenantId } from '../lib/tenantDb';
import { notifyAdminsLeaveRequest } from '../lib/notifications';

export interface CompOffRequest {
  id: string;
  employee_id: string;
  leave_type_id: string;
  worked_date: string;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  approved_by: string | null;
  approved_at: string | null;
  reject_reason: string | null;
  tenant_id: string;
  created_at: string;
  updated_at: string;
  leave_type?: {
    name: string;
  };
  employee?: {
    name: string;
    employee_code: string;
    department: {
      name: string;
    } | null;
  };
}

interface CompOffState {
  requests: CompOffRequest[];
  loading: boolean;
  error: string | null;
  success: boolean;
  
  fetchRequests: (employeeId?: string) => Promise<void>;
  submitRequest: (data: Partial<CompOffRequest>) => Promise<void>;
  approveRequest: (id: string, adminId: string) => Promise<void>;
  rejectRequest: (id: string, adminId: string, reason: string) => Promise<void>;
  resetStatus: () => void;
}

export const useCompOffStore = create<CompOffState>((set, get) => ({
  requests: [],
  loading: false,
  error: null,
  success: false,

  fetchRequests: async (employeeId?: string) => {
    try {
      set({ loading: true, error: null });
      const tenantId = await getTenantId();
      
      let query = supabase
        .from('comp_off_requests')
        .select(`
          *,
          leave_type:leave_types(name),
          employee:employees(
            name,
            employee_code,
            department:departments(name)
          )
        `)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (employeeId) {
        query = query.eq('employee_id', employeeId);
      }

      const { data, error } = await query;

      if (error) throw error;
      set({ requests: data as CompOffRequest[], loading: false });
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  submitRequest: async (data: Partial<CompOffRequest>) => {
    try {
      set({ loading: true, error: null, success: false });
      const tenantId = await getTenantId();

      const { data: newRequest, error } = await supabase
        .from('comp_off_requests')
        .insert([{ 
          ...data, 
          tenant_id: tenantId, 
          status: 'Approved',
          approved_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (error) throw error;

      set(state => ({
        requests: [newRequest, ...state.requests],
        loading: false,
        success: true
      }));

      // Since it's auto-approved, maybe we don't notify admins for approval, but we can still notify them it was credited
      await notifyAdminsLeaveRequest(newRequest.id, data.employee_id!);
    } catch (err: any) {
      set({ error: err.message, loading: false });
      throw err;
    }
  },

  approveRequest: async (id: string, adminId: string) => {
    try {
      set({ loading: true, error: null, success: false });

      const { error } = await supabase
        .from('comp_off_requests')
        .update({
          status: 'Approved',
          approved_by: adminId,
          approved_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;

      set(state => ({
        requests: state.requests.map(req => 
          req.id === id 
            ? { ...req, status: 'Approved', approved_by: adminId, approved_at: new Date().toISOString() } 
            : req
        ),
        loading: false,
        success: true
      }));
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  rejectRequest: async (id: string, adminId: string, reason: string) => {
    try {
      set({ loading: true, error: null, success: false });

      const { error } = await supabase
        .from('comp_off_requests')
        .update({
          status: 'Rejected',
          approved_by: adminId,
          approved_at: new Date().toISOString(),
          reject_reason: reason
        })
        .eq('id', id);

      if (error) throw error;

      set(state => ({
        requests: state.requests.map(req => 
          req.id === id 
            ? { ...req, status: 'Rejected', approved_by: adminId, approved_at: new Date().toISOString(), reject_reason: reason } 
            : req
        ),
        loading: false,
        success: true
      }));
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  resetStatus: () => set({ error: null, success: false })
}));
