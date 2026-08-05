import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { validateAuth, createAuthError, createTenantError } from './utils/storeUtils';
import type {
  EmployeeAdvance,
  AdvanceInstallment,
  AdvanceDeductionHold,
  AdvanceShortClosure,
  AdvanceSettings,
  AdvanceRequest,
  AdvanceApproval,
  DeductionHoldRequest,
  ShortClosureRequest,
  AdvanceFilters,
  AdvanceCalculation,
  InstallmentModificationRequest,
  InstallmentModificationResult,
  InstallmentChangeLog,
} from '../types/advances';
import {
  notifyAdminsAdvanceRequest,
  notifyReportingHeadsAdvanceRequest,
  notifyAdminsAdvanceCancelled,
  notifyEmployeeAdvanceDecision,
} from '../lib/notifications';


interface AdvancesStore {
  advances: EmployeeAdvance[];
  installments: AdvanceInstallment[];
  holds: AdvanceDeductionHold[];
  closures: AdvanceShortClosure[];
  settings: AdvanceSettings | null;
  installmentChangeLogs: InstallmentChangeLog[];
  loading: boolean;
  modalLoading: boolean;
  error: string | null;

  fetchAdvances: (filters?: AdvanceFilters) => Promise<void>;
  fetchAdvanceById: (id: string) => Promise<EmployeeAdvance | null>;
  createAdvanceRequest: (request: AdvanceRequest) => Promise<EmployeeAdvance>;
  updateAdvanceRequest: (id: string, updates: Partial<AdvanceRequest>) => Promise<void>;
  cancelAdvanceRequest: (id: string) => Promise<void>;

  approveAdvance: (id: string, approval: AdvanceApproval) => Promise<void>;
  rejectAdvance: (id: string, reason: string) => Promise<void>;

  fetchInstallments: (advanceId: string) => Promise<void>;
  fetchInstallmentsByMonth: (month: string) => Promise<AdvanceInstallment[]>;

  createDeductionHold: (hold: DeductionHoldRequest) => Promise<void>;
  deleteDeductionHold: (holdId: string) => Promise<void>; // Renamed from remove to delete
  fetchHolds: (advanceId: string) => Promise<void>;

  initiateShortClosure: (closure: ShortClosureRequest) => Promise<void>;

  modifyInstallments: (request: InstallmentModificationRequest) => Promise<InstallmentModificationResult>;
  fetchInstallmentChangeLogs: (advanceId: string) => Promise<void>;

  fetchSettings: () => Promise<void>;
  updateSettings: (settings: Partial<AdvanceSettings>) => Promise<void>;

  calculateAdvanceDetails: (amount: number, interestRate: number, installments: number) => AdvanceCalculation;

  reset: () => void;
}

export const useAdvancesStore = create<AdvancesStore>((set, get) => ({
  advances: [],
  installments: [],
  holds: [],
  closures: [],
  settings: null,
  installmentChangeLogs: [],
  loading: false,
  modalLoading: false,
  error: null,

  fetchAdvances: async (filters?: AdvanceFilters) => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) {
      set({ error: 'Authentication required' });
      return;
    }

    set({ loading: true, error: null });

    try {
      let query = supabase
        .from('employee_advances')
        .select(`
          *,
          employee:employees(name, email, employee_code, reporting_to)
        `)
        .eq('tenant_id', auth.tenantId)
        .order('created_at', { ascending: false });

      if (filters?.employee_id) {
        query = query.eq('employee_id', filters.employee_id);
      }

      if (filters?.status) {
        if (Array.isArray(filters.status)) {
          query = query.in('status', filters.status);
        } else {
          query = query.eq('status', filters.status);
        }
      }

      if (filters?.from_date) {
        query = query.gte('request_date', filters.from_date);
      }

      if (filters?.to_date) {
        query = query.lte('request_date', filters.to_date);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Map profiles for requested_by and approved_by user IDs
      const userIds = [...new Set([
        ...(data || []).map(d => d.requested_by),
        ...(data || []).filter(d => d.approved_by).map(d => d.approved_by!)
      ])];

      const profileMap = new Map<string, string>();
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', userIds);
        
        if (profiles) {
          profiles.forEach(p => {
            profileMap.set(p.id, p.full_name || p.email || '');
          });
        }
      }

      const formattedAdvances = (data || []).map((item: any) => ({
        ...item,
        requestedByName: profileMap.get(item.requested_by) || '',
        approvedByName: item.approved_by ? profileMap.get(item.approved_by) || '' : '',
      }));

      set({ advances: formattedAdvances, loading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch advances',
        loading: false,
      });
    }
  },

  fetchAdvanceById: async (id: string) => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) {
      throw createAuthError();
    }

    try {
      const { data, error } = await supabase
        .from('employee_advances')
        .select(`
          *,
          employee:employees(name, email, employee_code)
        `)
        .eq('id', id)
        .eq('tenant_id', auth.tenantId)
        .single();

      if (error) throw error;

      return data;
    } catch (error) {
      throw error;
    }
  },

  createAdvanceRequest: async (request: AdvanceRequest) => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) {
      throw createAuthError();
    }

    set({ loading: true, error: null });

    try {
      const settings = get().settings;

      if (settings?.require_justification && !request.justification.trim()) {
        throw new Error('Justification is required');
      }

      if (settings?.max_advance_amount && request.requested_amount > settings.max_advance_amount) {
        throw new Error(`Maximum advance amount is ${settings.max_advance_amount}`);
      }

      if (request.requested_installments < (settings?.min_installments || 1)) {
        throw new Error(`Minimum ${settings?.min_installments} installments required`);
      }

      if (request.requested_installments > (settings?.max_installments || 24)) {
        throw new Error(`Maximum ${settings?.max_installments} installments allowed`);
      }

      if (!settings?.allow_multiple_advances) {
        const { data: existing } = await supabase
          .from('employee_advances')
          .select('id')
          .eq('tenant_id', auth.tenantId)
          .eq('employee_id', request.employee_id)
          .in('status', ['pending', 'approved', 'active'])
          .maybeSingle();

        if (existing) {
          throw new Error('Employee already has an active or pending advance');
        }
      }

      const { data, error } = await supabase
        .from('employee_advances')
        .insert({
          ...request,
          tenant_id: auth.tenantId,
          requested_by: auth.userId,
          status: 'pending',
        })
        .select(`
          *,
          employee:employees(name, email, employee_code, reporting_to)
        `)
        .single();

      if (error) throw error;

      set(state => ({
        advances: [data, ...state.advances],
        loading: false,
      }));

      // ── Notify Reporting Heads ──────────────────────────────────────────
      try {
        const employeeName = data.employee?.name || 'An employee';
        let managerUserIds: string[] = [];
        const reportingTo = data.employee?.reporting_to;
        if (reportingTo) {
          const ids = Array.isArray(reportingTo) ? reportingTo : [reportingTo];
          if (ids.length > 0) {
            const { data: managersById } = await supabase
              .from('employees')
              .select('auth_profile_id')
              .in('id', ids);
              
            const { data: managersByProfileId } = await supabase
              .from('employees')
              .select('auth_profile_id')
              .in('auth_profile_id', ids);
              
            const allManagers = [...(managersById || []), ...(managersByProfileId || [])];
            managerUserIds = Array.from(new Set(allManagers.map(m => m.auth_profile_id))).filter(Boolean) as string[];
          }
        }

        if (managerUserIds.length > 0) {
          await notifyReportingHeadsAdvanceRequest(
            auth.tenantId,
            employeeName,
            request.requested_amount,
            data.id,
            managerUserIds
          );
        } else {
          await notifyAdminsAdvanceRequest(
            auth.tenantId,
            employeeName,
            request.requested_amount,
            data.id
          );
        }
      } catch (err) {
        console.error('Advance request notification failed:', err);
      }

      return data;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to create advance request',
        loading: false,
      });
      throw error;
    }
  },

  updateAdvanceRequest: async (id: string, updates: Partial<AdvanceRequest>) => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) {
      throw createAuthError();
    }

    set({ loading: true, error: null });

    try {
      const { data, error } = await supabase
        .from('employee_advances')
        .update(updates)
        .eq('id', id)
        .eq('tenant_id', auth.tenantId)
        .eq('status', 'pending')
        .select(`
          *,
          employee:employees(name, email, employee_code)
        `)
        .single();

      if (error) throw error;

      set(state => ({
        advances: state.advances.map(adv => adv.id === id ? data : adv),
        loading: false,
      }));
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to update advance request',
        loading: false,
      });
      throw error;
    }
  },

  cancelAdvanceRequest: async (id: string) => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) {
      throw createAuthError();
    }

    set({ loading: true, error: null });

    try {
      const { data, error } = await supabase
        .from('employee_advances')
        .update({ 
          status: 'cancelled',
          approved_by: auth.userId,
          approved_date: new Date().toISOString()
        })
        .eq('id', id)
        .eq('tenant_id', auth.tenantId)
        .eq('status', 'pending')
        .select()
        .single();

      if (error) throw error;

      set(state => ({
        advances: state.advances.map(adv => adv.id === id ? { ...adv, status: 'cancelled' } : adv),
        loading: false,
      }));

      // ── Notify Admins ──────────────────────────────────────────
      try {
        const { data: emp } = await supabase.from('employees').select('name').eq('id', data.employee_id).single();
        await notifyAdminsAdvanceCancelled(
          auth.tenantId,
          emp?.name || 'An employee',
          data.requested_amount,
          id
        );
      } catch (err) {
        console.error('Advance cancellation notification failed:', err);
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to cancel advance request',
        loading: false,
      });
      throw error;
    }
  },

  approveAdvance: async (id: string, approval: AdvanceApproval) => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) {
      throw createAuthError();
    }

    set({ loading: true, error: null });

    try {
      const totalAmount = approval.approved_amount * (1 + approval.approved_interest_rate / 100);
      const monthlyInstallment = totalAmount / approval.approved_installments;
      const principalPerMonth = approval.approved_amount / approval.approved_installments;
      const interestPerMonth = monthlyInstallment - principalPerMonth;

      const { data: advanceData, error: advanceError } = await supabase
        .from('employee_advances')
        .update({
          ...approval,
          approved_by: auth.userId,
          approved_date: new Date().toISOString().split('T')[0],
          total_amount: totalAmount,
          remaining_balance: totalAmount,
          status: 'approved',
        })
        .eq('id', id)
        .eq('tenant_id', auth.tenantId)
        .eq('status', 'pending')
        .select()
        .single();

      if (advanceError) throw advanceError;

      const installments: any[] = [];
      const startDate = new Date(approval.approved_start_month + '-01');

      for (let i = 0; i < approval.approved_installments; i++) {
        const dueDate = new Date(startDate);
        dueDate.setMonth(startDate.getMonth() + i);
        const dueMonth = dueDate.toISOString().substring(0, 7);

        installments.push({
          advance_id: id,
          tenant_id: auth.tenantId,
          installment_number: i + 1,
          due_month: dueMonth,
          amount: monthlyInstallment,
          principal_amount: principalPerMonth,
          interest_amount: interestPerMonth,
          status: 'scheduled',
        });
      }

      const { error: installmentsError } = await supabase
        .from('advance_installments')
        .insert(installments);

      if (installmentsError) throw installmentsError;

      set(state => ({
        advances: state.advances.map(adv => adv.id === id ? advanceData : adv),
        loading: false,
      }));

      // ── Notify Employee ────────────────────────────────────────
      try {
        const { data: emp } = await supabase.from('employees').select('name').eq('id', advanceData.employee_id).single();
        await notifyEmployeeAdvanceDecision(
          advanceData.employee_id,
          auth.tenantId,
          'Approved',
          approval.approved_amount,
          id,
          emp?.name
        );
      } catch (err) {
        console.error('Advance approval notification failed:', err);
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to approve advance',
        loading: false,
      });
      throw error;
    }
  },

  rejectAdvance: async (id: string, reason: string) => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) {
      throw createAuthError();
    }

    set({ loading: true, error: null });

    try {
      const { data, error } = await supabase
        .from('employee_advances')
        .update({
          status: 'rejected',
          approval_comments: reason,
          approved_by: auth.userId,
          approved_date: new Date().toISOString().split('T')[0],
        })
        .eq('id', id)
        .eq('tenant_id', auth.tenantId)
        .eq('status', 'pending')
        .select()
        .single();

      if (error) throw error;

      set(state => ({
        advances: state.advances.map(adv => adv.id === id ? data : adv),
        loading: false,
      }));

      // ── Notify Employee ────────────────────────────────────────
      try {
        const { data: emp } = await supabase.from('employees').select('name').eq('id', data.employee_id).single();
        await notifyEmployeeAdvanceDecision(
          data.employee_id,
          auth.tenantId,
          'Rejected',
          data.requested_amount,
          id,
          emp?.name
        );
      } catch (err) {
        console.error('Advance rejection notification failed:', err);
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to reject advance',
        loading: false,
      });
      throw error;
    }
  },

  fetchInstallments: async (advanceId: string) => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) {
      set({ error: 'Authentication required' });
      return;
    }

    set({ loading: true, error: null });

    try {
      const { data, error } = await supabase
        .from('advance_installments')
        .select('*')
        .eq('advance_id', advanceId)
        .eq('tenant_id', auth.tenantId)
        .order('installment_number', { ascending: true });

      if (error) throw error;

      set({ installments: data || [], loading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch installments',
        loading: false,
      });
    }
  },

  fetchInstallmentsByMonth: async (month: string) => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) {
      throw createAuthError();
    }

    try {
      const { data, error } = await supabase
        .from('advance_installments')
        .select(`
          *,
          advance:employee_advances(employee_id, approved_installments)
        `)
        .eq('tenant_id', auth.tenantId)
        .eq('due_month', month)
        .eq('status', 'scheduled');

      if (error) throw error;

      return data || [];
    } catch (error) {
      throw error;
    }
  },

  createDeductionHold: async (hold: DeductionHoldRequest) => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) {
      throw createAuthError();
    }

    set({ loading: true, error: null });

    try {
      const { data, error } = await supabase
        .from('advance_deduction_holds')
        .insert({
          ...hold,
          tenant_id: auth.tenantId,
          created_by: auth.userId,
        })
        .select()
        .single();

      if (error) throw error;

      const { error: updateError } = await supabase
        .from('advance_installments')
        .update({ status: 'held' })
        .eq('advance_id', hold.advance_id)
        .eq('due_month', hold.hold_month)
        .eq('status', 'scheduled');

      if (updateError) throw updateError;

      // Update both holds list AND installments list locally
      const updatedInstallments = get().installments.map(inst => {
        if(inst.advance_id === hold.advance_id && inst.due_month === hold.hold_month) {
            return { ...inst, status: 'held' } as AdvanceInstallment;
        }
        return inst;
      });

      set(state => ({
        holds: [...state.holds, data],
        installments: updatedInstallments,
        loading: false,
      }));
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to create deduction hold',
        loading: false,
      });
      throw error;
    }
  },

  // -------------------------------------------------------------
  // UPDATED: deleteDeductionHold (was removeDeductionHold)
  // -------------------------------------------------------------
  deleteDeductionHold: async (holdId: string) => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) {
      throw createAuthError();
    }

    set({ loading: true, error: null });

    try {
      // 1. Find the hold to identify which month/advance to unlock
      const hold = get().holds.find(h => h.id === holdId);
      if (!hold) throw new Error('Hold not found');

      // 2. Remove the hold record from the DB
      const { error: deleteError } = await supabase
        .from('advance_deduction_holds')
        .delete()
        .eq('id', holdId)
        .eq('tenant_id', auth.tenantId);

      if (deleteError) throw deleteError;

      // 3. Update the installment status back to 'scheduled' in DB
      const { error: updateError } = await supabase
        .from('advance_installments')
        .update({ status: 'scheduled' })
        .eq('advance_id', hold.advance_id)
        .eq('due_month', hold.hold_month)
        .eq('status', 'held'); 

      if (updateError) throw updateError;

      // 4. Update Local State (Holds AND Installments)
      const updatedInstallments = get().installments.map(inst => {
        if (inst.advance_id === hold.advance_id && inst.due_month === hold.hold_month) {
            // Force cast if necessary, or just return object
            return { ...inst, status: 'scheduled' } as AdvanceInstallment;
        }
        return inst;
      });

      set(state => ({
        holds: state.holds.filter(h => h.id !== holdId),
        installments: updatedInstallments,
        loading: false,
      }));
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to remove deduction hold',
        loading: false,
      });
      throw error;
    }
  },

  fetchHolds: async (advanceId: string) => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) {
      set({ error: 'Authentication required' });
      return;
    }

    set({ loading: true, error: null });

    try {
      const { data, error } = await supabase
        .from('advance_deduction_holds')
        .select('*')
        .eq('advance_id', advanceId)
        .eq('tenant_id', auth.tenantId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      set({ holds: data || [], loading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch holds',
        loading: false,
      });
    }
  },

  initiateShortClosure: async (closure: ShortClosureRequest) => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) {
      throw createAuthError();
    }

    set({ loading: true, error: null });

    try {
      const advance = get().advances.find(a => a.id === closure.advance_id);
      if (!advance) throw new Error('Advance not found');

      const { data: closureData, error: closureError } = await supabase
        .from('advance_short_closures')
        .insert({
          ...closure,
          tenant_id: auth.tenantId,
          closure_amount: advance.remaining_balance,
          closure_date: closure.closure_date || new Date().toISOString().split('T')[0],
          approved_by: auth.userId,
        })
        .select()
        .single();

      if (closureError) throw closureError;

      const { error: advanceError } = await supabase
        .from('employee_advances')
        .update({
          status: 'closed',
          remaining_balance: 0,
        })
        .eq('id', closure.advance_id)
        .eq('tenant_id', auth.tenantId);

      if (advanceError) throw advanceError;

      const { error: installmentsError } = await supabase
        .from('advance_installments')
        .update({ status: 'waived' })
        .eq('advance_id', closure.advance_id)
        .eq('status', 'scheduled');

      if (installmentsError) throw installmentsError;

      set(state => ({
        advances: state.advances.map(adv =>
          adv.id === closure.advance_id
            ? { ...adv, status: 'closed', remaining_balance: 0 }
            : adv
        ),
        closures: [...state.closures, closureData],
        loading: false,
      }));
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to initiate short closure',
        loading: false,
      });
      throw error;
    }
  },

  fetchSettings: async () => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) {
      set({ error: 'Authentication required' });
      return;
    }

    set({ modalLoading: true, error: null });

    try {
      const { data, error } = await supabase
        .from('advance_settings')
        .select('*')
        .eq('tenant_id', auth.tenantId)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        const { data: newSettings, error: insertError } = await supabase
          .from('advance_settings')
          .insert({
            tenant_id: auth.tenantId,
            default_interest_rate: 0,
            max_installments: 24,
            min_installments: 1,
            allow_multiple_advances: false,
            require_justification: true,
          })
          .select()
          .single();

        if (insertError) throw insertError;
        set({ settings: newSettings, loading: false });
      } else {
        set({ settings: data, loading: false });
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch settings',
        loading: false,
      });
    }
  },

  updateSettings: async (settings: Partial<AdvanceSettings>) => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) {
      throw createAuthError();
    }

    set({ loading: true, error: null });

    try {
      const { data, error } = await supabase
        .from('advance_settings')
        .update(settings)
        .eq('tenant_id', auth.tenantId)
        .select()
        .single();

      if (error) throw error;

      set({ settings: data, loading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to update settings',
        loading: false,
      });
      throw error;
    }
  },

  modifyInstallments: async (request: InstallmentModificationRequest) => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) {
      throw createAuthError();
    }

    set({ loading: true, error: null });

    try {
      const { data, error } = await supabase.rpc('modify_advance_installments', {
        p_tenant_id: auth.tenantId,
        p_advance_id: request.advance_id,
        p_installment_changes: request.installment_changes,
        p_deleted_installment_ids: request.deleted_installment_ids || [],
        p_redistribution_method: request.redistribution_method,
        p_extension_months: request.extension_months || 0,
        p_reason: request.reason,
        p_changed_by: auth.userId,
      });

      if (error) throw error;

      await get().fetchInstallments(request.advance_id);
      await get().fetchAdvances();

      set({ loading: false });

      return data as InstallmentModificationResult;
    } catch (error) {
      console.error('RPC Error:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to modify installments',
        loading: false,
      });
      throw error;
    }
  },

  fetchInstallmentChangeLogs: async (advanceId: string) => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) {
      set({ error: 'Authentication required' });
      return;
    }

    set({ loading: true, error: null });

    try {
      const { data, error } = await supabase
        .from('advance_installment_changes')
        .select('*')
        .eq('advance_id', advanceId)
        .eq('tenant_id', auth.tenantId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      set({ installmentChangeLogs: data || [], loading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch installment change logs',
        loading: false,
      });
    }
  },

  calculateAdvanceDetails: (amount: number, interestRate: number, installments: number): AdvanceCalculation => {
    const totalAmount = amount * (1 + interestRate / 100);
    const monthlyInstallment = totalAmount / installments;
    const principalPerMonth = amount / installments;
    const interestPerMonth = monthlyInstallment - principalPerMonth;

    return {
      requested_amount: amount,
      interest_rate: interestRate,
      installments,
      total_amount: totalAmount,
      monthly_installment: monthlyInstallment,
      principal_per_month: principalPerMonth,
      interest_per_month: interestPerMonth,
    };
  },

  reset: () => {
    set({
      advances: [],
      installments: [],
      holds: [],
      closures: [],
      settings: null,
      installmentChangeLogs: [],
      loading: false,
      error: null,
    });
  },
}));