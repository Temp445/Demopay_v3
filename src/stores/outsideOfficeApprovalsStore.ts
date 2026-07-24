import { create } from 'zustand';
import { supabase } from '../lib/supabase';

export interface OutsideOfficeApproval {
  id: string;
  tenant_id: string;
  employee_id: string;
  timestamp_id: string;
  clock_in_time: string;
  clock_out_time?: string | null;
  inside_office_clock_in_time?: string | null;
  attendance_location?: string | null;
  reason?: string | null;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  reject_reason?: string | null;
  created_at: string;
  updated_at: string;
  distance_meters?: number | null;
  travel_allowance_amount?: number | null;
  travel_allowance_unit?: string | null;
  // Joined fields
  employee_name?: string;
  employee_code?: string;
  department_name?: string;
}

interface OutsideOfficeApprovalsStore {
  items: OutsideOfficeApproval[];
  loading: boolean;
  error: string | null;

  fetchAll: (tenantId: string) => Promise<void>;
  fetchByEmployee: (employeeId: string, date?: string) => Promise<OutsideOfficeApproval[]>;
  createApproval: (data: {
    tenantId: string;
    employeeId: string;
    timestampId: string;
    clockInTime: string;
    attendanceLocation?: string;
  }) => Promise<OutsideOfficeApproval | null>;
  submitReason: (id: string, reason: string) => Promise<void>;
  approve: (id: string, userId: string, distanceMeters?: number, allowanceAmount?: number, allowanceUnit?: string) => Promise<void>;
  reject: (id: string, userId: string, rejectReason?: string) => Promise<void>;
  updateClockOut: (employeeId: string, date: string, clockOutTime: string) => Promise<void>;
  updateInsideOfficeClockIn: (employeeId: string, date: string, time: string) => Promise<void>;
  cancelApproval: (id: string) => Promise<void>;
  clearError: () => void;
}

export const useOutsideOfficeApprovalsStore = create<OutsideOfficeApprovalsStore>((set, get) => ({
  items: [],
  loading: false,
  error: null,

  fetchAll: async (tenantId) => {
    set({ loading: true, error: null });
    try {
      const { data, error } = await supabase
        .from('outside_office_approvals')
        .select(`
          *,
          employees!employee_id (
            name,
            employee_code,
            departments ( name )
          )
        `)
        .eq('tenant_id', tenantId)
        .order('clock_in_time', { ascending: false });

      if (error) throw error;

      const mapped: OutsideOfficeApproval[] = (data || []).map((row: any) => ({
        ...row,
        employee_name: row.employees?.name,
        employee_code: row.employees?.employee_code,
        department_name: row.employees?.departments?.name,
      }));

      set({ items: mapped, loading: false });
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  fetchByEmployee: async (employeeId, date) => {
    try {
      let query = supabase
        .from('outside_office_approvals')
        .select('*')
        .eq('employee_id', employeeId)
        .order('clock_in_time', { ascending: false });

      if (date) {
        const start = `${date}T00:00:00.000Z`;
        const end = `${date}T23:59:59.999Z`;
        query = query.gte('clock_in_time', start).lte('clock_in_time', end);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as OutsideOfficeApproval[];
    } catch (err: any) {
      console.error('Failed to fetch outside office approvals:', err);
      return [];
    }
  },

  createApproval: async ({ tenantId, employeeId, timestampId, clockInTime, attendanceLocation }) => {
    try {
      const { data, error } = await supabase
        .from('outside_office_approvals')
        .insert({
          tenant_id: tenantId,
          employee_id: employeeId,
          timestamp_id: timestampId,
          clock_in_time: clockInTime,
          attendance_location: attendanceLocation || null,
          status: 'pending',
        })
        .select()
        .single();

      if (error) throw error;
      return data as OutsideOfficeApproval;
    } catch (err: any) {
      console.error('Failed to create outside office approval:', err);
      return null;
    }
  },

  submitReason: async (id, reason) => {
    const { error } = await supabase
      .from('outside_office_approvals')
      .update({ reason, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },

  approve: async (id, userId, distanceMeters, allowanceAmount, allowanceUnit) => {
    const { error } = await supabase
      .from('outside_office_approvals')
      .update({
        status: 'approved',
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...(distanceMeters !== undefined && { distance_meters: distanceMeters }),
        ...(allowanceAmount !== undefined && { travel_allowance_amount: allowanceAmount }),
        ...(allowanceUnit !== undefined && { travel_allowance_unit: allowanceUnit }),
      })
      .eq('id', id);
    if (error) throw error;
    set(state => ({
      items: state.items.map(item =>
        item.id === id ? { 
          ...item, 
          status: 'approved', 
          reviewed_at: new Date().toISOString(),
          distance_meters: distanceMeters,
          travel_allowance_amount: allowanceAmount,
          travel_allowance_unit: allowanceUnit 
        } : item
      ),
    }));
  },

  reject: async (id, userId, rejectReason) => {
    const { error } = await supabase
      .from('outside_office_approvals')
      .update({
        status: 'rejected',
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
        reject_reason: rejectReason || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) throw error;
    set(state => ({
      items: state.items.map(item =>
        item.id === id ? { ...item, status: 'rejected', reviewed_at: new Date().toISOString() } : item
      ),
    }));
  },

  updateClockOut: async (employeeId, date, clockOutTime) => {
    try {
      const start = `${date}T00:00:00.000Z`;
      const end = `${date}T23:59:59.999Z`;

      const { error } = await supabase
        .from('outside_office_approvals')
        .update({ clock_out_time: clockOutTime, updated_at: new Date().toISOString() })
        .eq('employee_id', employeeId)
        .gte('clock_in_time', start)
        .lte('clock_in_time', end)
        .in('status', ['pending', 'approved'])
        .is('clock_out_time', null);

      if (error) console.error('Failed to update clock_out_time on outside approval:', error);
    } catch (err) {
      console.error('updateClockOut error:', err);
    }
  },

  updateInsideOfficeClockIn: async (employeeId, date, time) => {
    try {
      const start = `${date}T00:00:00.000Z`;
      const end = `${date}T23:59:59.999Z`;

      const { error } = await supabase
        .from('outside_office_approvals')
        .update({ inside_office_clock_in_time: time, updated_at: new Date().toISOString() })
        .eq('employee_id', employeeId)
        .gte('clock_in_time', start)
        .lte('clock_in_time', end)
        .in('status', ['pending', 'approved'])
        .is('inside_office_clock_in_time', null);

      if (error) console.error('Failed to update inside_office_clock_in_time:', error);
    } catch (err) {
      console.error('updateInsideOfficeClockIn error:', err);
    }
  },

  clearError: () => set({ error: null }),

  cancelApproval: async (id) => {
    try {
      // Use .select() so Supabase returns the deleted rows.
      // If the result is empty the DELETE was silently blocked by RLS.
      const { data, error } = await supabase
        .from('outside_office_approvals')
        .delete()
        .eq('id', id)
        .select('id');

      if (error) throw error;

      // If no rows came back the delete was blocked — fall back to
      // stamping a sentinel reason so it no longer shows as "pending".
      if (!data || data.length === 0) {
        const { error: updateError } = await supabase
          .from('outside_office_approvals')
          .update({ reason: '(Cancelled)', updated_at: new Date().toISOString() })
          .eq('id', id);
        if (updateError) throw updateError;
      }
    } catch (err: any) {
      console.error('Failed to cancel outside office approval:', err);
      throw err;
    }
  },
}));
