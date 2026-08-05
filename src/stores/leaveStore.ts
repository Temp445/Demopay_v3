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
import {
  notifyAdminsLeaveRequest,
  notifyReportingHeadsLeaveRequest,
  notifyEmployeeLeaveDecision,
  notifyAdminsLeaveCancelled,
} from '../lib/notifications';

export interface LeaveType {
  id: string;
  name: string;
  description: string | null;
  default_days: number;
  requires_approval: boolean;
  is_active: boolean;
  is_paid: boolean;
  before_leave_holiday?: boolean;
  before_leave_week_off?: boolean;
  after_leave_holiday?: boolean;
  after_leave_week_off?: boolean;
  in_between_leave_holiday?: boolean;
  in_between_leave_week_off?: boolean;
  credit_policy_type?: 'earned' | 'fixed';
  earned_initial_credit?: number;
  earned_days_to_work?: number;
  earned_days_credited?: number;
  fixed_credit_frequency?: 'monthly' | 'yearly';
  carry_forward_type?: 'carry_forward' | 'elapsed';
  carry_forward_frequency?: 'monthly' | 'yearly';
  carry_forward_min_limit?: number;
  carry_forward_max_limit?: number;
  min_days_per_occurrence?: number;
  max_days_per_occurrence?: number;
  gap_between_occurrences?: number;
  max_occasions?: number;
  encashment_applicable?: boolean;
  encashment_min_limit?: number;
  encashment_max_limit?: number;
  encashment_frequency?: 'monthly' | 'yearly';
  tenant_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface LeaveBalance {
  id: string;
  employee_id: string;
  employee_name: string;
  leave_type_id: string;
  year: number;
  total_days: number;
  used_days: number;
  tenant_id?: string;
  created_at?: string;
  updated_at?: string;
  leave_types: {
    name: string;
  };
}

export interface LeaveRequest {
  id: string;
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
  document_url: string | null;
  approved_by: string | null;
  approved_at: string | null;
  is_half_day_start?: boolean;
  is_half_day_end?: boolean;
  half_day_period_start?: '1st half' | '2nd half' | null;
  half_day_period_end?: '1st half' | '2nd half' | null;
  total_days?: number;
  tenant_id?: string;
  created_at?: string;
  updated_at?: string;
  leave_type: {
    name: string;
  };
  approved_by_user?: {
    email: string;
  };
  employees?: {
    name: string;
    employee_code: string;
  };
  employee_name?: string;
  employee_code?: string;
  employee_reporting_to?: string[] | string | null;
  created_by?: string;
  created_by_name?: string;
  approved_by_name?: string;
}

interface LeaveStore {
  // Leave Types
  leaveTypes: StoreState<LeaveType>;
  fetchLeaveTypes: () => Promise<void>;
  createLeaveType: (leaveType: Omit<LeaveType, 'id' | 'created_at' | 'updated_at' | 'tenant_id'>) => Promise<LeaveType>;
  updateLeaveType: (id: string, updates: Partial<LeaveType>) => Promise<LeaveType>;
  deleteLeaveType: (id: string) => Promise<void>;

  // Leave Balances
  leaveBalances: StoreState<LeaveBalance>;
  fetchLeaveBalances: (employeeId: string, year: number) => Promise<void>;

  // Leave Requests
  leaveRequests: StoreState<LeaveRequest>;
  fetchLeaveRequests: (employeeId?: string, startDate?: string, endDate?: string) => Promise<void>;
  submitLeaveRequest: (request: {
    employee_id: string;
    leave_type_id: string;
    start_date: string;
    end_date: string;
    reason: string;
    document_url?: string;
    is_half_day_start?: boolean;
    is_half_day_end?: boolean;
    half_day_period_start?: '1st half' | '2nd half' | null;
    half_day_period_end?: '1st half' | '2nd half' | null;
  }) => Promise<LeaveRequest>;
  updateLeaveRequest: (requestId: string, request: {
    employee_id: string;
    leave_type_id: string;
    start_date: string;
    end_date: string;
    reason: string;
    document_url?: string;
    is_half_day_start?: boolean;
    is_half_day_end?: boolean;
    half_day_period_start?: '1st half' | '2nd half' | null;
    half_day_period_end?: '1st half' | '2nd half' | null;
  }) => Promise<LeaveRequest>;
  updateLeaveRequestStatus: (requestId: string, status: LeaveRequest['status'], approvedBy?: string) => Promise<LeaveRequest>;
  cancelLeaveRequest: (requestId: string) => Promise<void>;

  // Leave Policy Processing
  applyLeaveCredit: (employeeId: string, leaveTypeId: string, year: number, month: number) => Promise<number>;
  applyCarryForward: (employeeId: string, leaveTypeId: string, fromYear: number, toYear: number) => Promise<number>;
  applyEncashment: (employeeId: string, leaveTypeId: string, year: number, month: number, preview: boolean) => Promise<number>;
  syncLeaveBalances: (employeeId: string, year: number) => Promise<void>;
  syncAllLeaveBalances: (year: number, departmentId?: string) => Promise<void>;

  reset: () => void;
}

export const useLeaveStore = create<LeaveStore>()(
  persist(
    (set, get) => ({
      // Leave Types State
      leaveTypes: initialStoreState<LeaveType>(),

      fetchLeaveTypes: async () => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated) {
          set(state => ({
            ...state,
            leaveTypes: setError(state.leaveTypes, createAuthError().message),
          }));
          return;
        }

        if (!auth.tenantId) {
          set(state => ({
            ...state,
            leaveTypes: setError(state.leaveTypes, createTenantError().message),
          }));
          return;
        }

        set(state => ({
          ...state,
          leaveTypes: setLoading(state.leaveTypes),
        }));

        try {
          const { data, error } = await supabase
            .from('leave_types')
            .select('*')
            .eq('tenant_id', auth.tenantId)
            // .neq('name', 'LOP') // Exclude LOP from regular leave types
            .order('name');

          if (error) throw error;

          set(state => ({
            ...state,
            leaveTypes: setSuccess(state.leaveTypes, data || []),
          }));
        } catch (error) {
          set(state => ({
            ...state,
            leaveTypes: setError(state.leaveTypes, error instanceof Error ? error.message : 'Failed to fetch leave types'),
          }));
        }
      },

      createLeaveType: async (leaveType) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated) throw createAuthError();
        if (!auth.tenantId) throw createTenantError();

        set(state => ({
          ...state,
          leaveTypes: setLoading(state.leaveTypes),
        }));

        try {
          const { data, error } = await supabase
            .from('leave_types')
            .insert([{ ...leaveType, tenant_id: auth.tenantId }])
            .select()
            .single();

          if (error) throw error;

          set(state => ({
            ...state,
            leaveTypes: addItem(state.leaveTypes, data),
          }));

          return data;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to create leave type';
          set(state => ({
            ...state,
            leaveTypes: setError(state.leaveTypes, errorMessage),
          }));
          throw error;
        }
      },

      updateLeaveType: async (id, updates) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated) throw createAuthError();
        if (!auth.tenantId) throw createTenantError();

        set(state => ({
          ...state,
          leaveTypes: setLoading(state.leaveTypes),
        }));

        try {
          const { data, error } = await supabase
            .from('leave_types')
            .update(updates)
            .eq('id', id)
            .eq('tenant_id', auth.tenantId)
            .select()
            .single();

          if (error) throw error;

          set(state => ({
            ...state,
            leaveTypes: updateItem(state.leaveTypes, id, data),
          }));

          return data;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to update leave type';
          set(state => ({
            ...state,
            leaveTypes: setError(state.leaveTypes, errorMessage),
          }));
          throw error;
        }
      },

      deleteLeaveType: async (id) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated) throw createAuthError();
        if (!auth.tenantId) throw createTenantError();

        set(state => ({
          ...state,
          leaveTypes: setLoading(state.leaveTypes),
        }));

        try {
          const { error } = await supabase
            .from('leave_types')
            .delete()
            .eq('id', id)
            .eq('tenant_id', auth.tenantId);

          if (error) throw error;

          set(state => ({
            ...state,
            leaveTypes: removeItem(state.leaveTypes, id),
          }));
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to delete leave type';
          set(state => ({
            ...state,
            leaveTypes: setError(state.leaveTypes, errorMessage),
          }));
          throw error;
        }
      },

      // Leave Balances State
      leaveBalances: initialStoreState<LeaveBalance>(),

      fetchLeaveBalances: async (employeeId, year) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated) {
          set(state => ({
            ...state,
            leaveBalances: setError(state.leaveBalances, createAuthError().message),
          }));
          return;
        }

        if (!auth.tenantId) {
          set(state => ({
            ...state,
            leaveBalances: setError(state.leaveBalances, createTenantError().message),
          }));
          return;
        }

        set(state => ({
          ...state,
          leaveBalances: setLoading(state.leaveBalances),
        }));

        try {
          const { data, error } = await supabase.rpc('get_leave_balances', {
            p_employee_id: employeeId || '',
            p_year: year,
            p_tenant_id: auth.tenantId,
          });

          if (error) throw error;

          set(state => ({
            ...state,
            leaveBalances: setSuccess(state.leaveBalances, data || []),
          }));
        } catch (error) {
          set(state => ({
            ...state,
            leaveBalances: setError(state.leaveBalances, error instanceof Error ? error.message : 'Failed to fetch leave balances'),
          }));
        }
      },

      // Leave Requests State
      leaveRequests: initialStoreState<LeaveRequest>(),

      fetchLeaveRequests: async (employeeId, startDate, endDate) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated) {
          set(state => ({
            ...state,
            leaveRequests: setError(state.leaveRequests, createAuthError().message),
          }));
          return;
        }

        if (!auth.tenantId) {
          set(state => ({
            ...state,
            leaveRequests: setError(state.leaveRequests, createTenantError().message),
          }));
          return;
        }

        set(state => ({
          ...state,
          leaveRequests: setLoading(state.leaveRequests),
        }));

        try {
          let query = supabase
            .from('leave_requests')
            .select(`
              *,
              leave_type:leave_types(name),
              employees(name, employee_code, reporting_to)
            `)
            .eq('tenant_id', auth.tenantId)
            .order('created_at', { ascending: false });

          if (employeeId) {
            query = query.eq('employee_id', employeeId);
          }
          if (startDate) {
            query = query.gte('start_date', startDate);
          }
          if (endDate) {
            query = query.lte('end_date', endDate);
          }

          const { data, error } = await query;

          if (error) throw error;

          // Fetch created_by and approved_by users
          const userIdsToFetch = [...new Set(
            (data || []).flatMap(d => [d.created_by, d.approved_by]).filter(Boolean)
          )];
          
          let userProfiles: Record<string, string> = {};
          
          if (userIdsToFetch.length > 0) {
            const { data: profiles } = await supabase
              .from('user_profiles')
              .select('id, name, email')
              .in('id', userIdsToFetch);
              
            if (profiles) {
              profiles.forEach(p => {
                userProfiles[p.id] = p.name || p.email;
              });
            }
          }

          const mappedData = (data || []).map((item: any) => ({
            ...item,
            employee_name: item.employees?.name || 'Unknown Employee',
            employee_code: item.employees?.employee_code || 'N/A',
            employee_reporting_to: item.employees?.reporting_to,
            created_by_name: userProfiles[item.created_by] || 'System/Self',
            approved_by_name: userProfiles[item.approved_by] || undefined
          }));

          set(state => ({
            ...state,
            leaveRequests: setSuccess(state.leaveRequests, mappedData),
          }));
        } catch (error) {
          set(state => ({
            ...state,
            leaveRequests: setError(state.leaveRequests, error instanceof Error ? error.message : 'Failed to fetch leave requests'),
          }));
        }
      },

      submitLeaveRequest: async (request) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated) throw createAuthError();
        if (!auth.tenantId) throw createTenantError();

        set(state => ({
          ...state,
          leaveRequests: setLoading(state.leaveRequests),
        }));

        try {
          // Calculate days
          const start = new Date(request.start_date);
          const end = new Date(request.end_date);
          let days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

          if (request.is_half_day_start) days -= 0.5;
          if (request.is_half_day_end && request.start_date !== request.end_date) days -= 0.5;
          if (request.start_date === request.end_date && request.is_half_day_start) days = 0.5;

          // Ensure leave balance exists
          await supabase.rpc('ensure_leave_balance', {
            p_employee_id: request.employee_id,
            p_leave_type_id: request.leave_type_id,
            p_year: start.getFullYear(),
            p_tenant_id: auth.tenantId,
          });

          // Get leave balance
          const { data: balances } = await supabase
            .from('leave_balances')
            .select('*')
            .eq('employee_id', request.employee_id)
            .eq('leave_type_id', request.leave_type_id)
            .eq('tenant_id', auth.tenantId)
            .eq('year', start.getFullYear());

          if (!balances || balances.length === 0) {
            throw new Error('Leave balance not found');
          }

          const balance = balances[0];
          const availableDays = balance.total_days - balance.used_days;

          if (days > availableDays) {
            throw new Error(`Insufficient leave balance. Available: ${availableDays} days, Requested: ${days} days`);
          }

          const { data, error } = await supabase
            .from('leave_requests')
            .insert([
              {
                ...request,
                status: 'Pending',
                total_days: days,
                tenant_id: auth.tenantId,
                created_by: auth.userId,
              },
            ])
            .select(`
              *,
              leave_type:leave_types(name)
            `)
            .single();

          if (error) throw error;

          set(state => ({
            ...state,
            leaveRequests: addItem(state.leaveRequests, data),
          }));

          // ── Notify Reporting Heads about the new leave request ──
          try {
            const leaveTypeName = data.leave_type?.name ?? 'Leave';
            // Fetch employee name and reporting_to
            const { data: empRow } = await supabase
              .from('employees')
              .select('name, reporting_to')
              .eq('id', request.employee_id)
              .maybeSingle();
            const employeeName = empRow?.name ?? 'An employee';

            let managerUserIds: string[] = [];
            const reportingTo = empRow?.reporting_to;
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
              await notifyReportingHeadsLeaveRequest(
                auth.tenantId,
                employeeName,
                leaveTypeName,
                request.start_date,
                request.end_date,
                data.id,
                managerUserIds
              );
            } else {
              // Fallback to Admins/HR if no reporting heads are assigned
              await notifyAdminsLeaveRequest(
                auth.tenantId,
                employeeName,
                leaveTypeName,
                request.start_date,
                request.end_date,
                data.id
              );
            }
          } catch (notifErr) {
            console.error('Leave submit notification failed (non-critical):', notifErr);
          }

          return data;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to submit leave request';
          set(state => ({
            ...state,
            leaveRequests: setError(state.leaveRequests, errorMessage),
          }));
          throw error;
        }
      },

      updateLeaveRequest: async (requestId, request) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated) throw createAuthError();
        if (!auth.tenantId) throw createTenantError();

        set(state => ({
          ...state,
          leaveRequests: setLoading(state.leaveRequests),
        }));

        try {
          // Calculate days
          const start = new Date(request.start_date);
          const end = new Date(request.end_date);
          let days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

          if (request.is_half_day_start) days -= 0.5;
          if (request.is_half_day_end && request.start_date !== request.end_date) days -= 0.5;
          if (request.start_date === request.end_date && request.is_half_day_start) days = 0.5;

          // Ensure leave balance exists
          await supabase.rpc('ensure_leave_balance', {
            p_employee_id: request.employee_id,
            p_leave_type_id: request.leave_type_id,
            p_year: start.getFullYear(),
            p_tenant_id: auth.tenantId,
          });

          // Get leave balance
          const { data: balances } = await supabase
            .from('leave_balances')
            .select('*')
            .eq('employee_id', request.employee_id)
            .eq('leave_type_id', request.leave_type_id)
            .eq('tenant_id', auth.tenantId)
            .eq('year', start.getFullYear());

          if (!balances || balances.length === 0) {
            throw new Error('Leave balance not found');
          }

          const balance = balances[0];
          const availableDays = balance.total_days - balance.used_days;

          if (days > availableDays) {
            throw new Error(`Insufficient leave balance. Available: ${availableDays} days, Requested: ${days} days`);
          }

          const { data, error } = await supabase
            .from('leave_requests')
            .update({
              leave_type_id: request.leave_type_id,
              start_date: request.start_date,
              end_date: request.end_date,
              reason: request.reason,
              document_url: request.document_url,
              is_half_day_start: request.is_half_day_start,
              is_half_day_end: request.is_half_day_end,
              half_day_period_start: request.half_day_period_start,
              half_day_period_end: request.half_day_period_end,
              total_days: days,
              updated_at: new Date().toISOString()
            })
            .eq('id', requestId)
            .eq('tenant_id', auth.tenantId)
            .select(`
              *,
              leave_type:leave_types(name)
            `)
            .single();

          if (error) throw error;

          // Note: Full employee details & created_by details aren't rejoined here,
          // but since we only update the request, it's safer to just trigger a full refetch
          // or we map it manually. Let's map it from the existing request in store.
          
          set(state => {
            const existingRequest = state.leaveRequests.items?.find(r => r.id === requestId);
            const mappedData = {
              ...data,
              employee_name: existingRequest?.employee_name || 'Unknown Employee',
              employee_code: existingRequest?.employee_code || 'N/A',
              created_by_name: existingRequest?.created_by_name || 'System/Self',
              approved_by_name: existingRequest?.approved_by_name
            };

            return {
              ...state,
              leaveRequests: updateItem(state.leaveRequests, requestId, mappedData),
            };
          });

          return data;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to update leave request';
          set(state => ({
            ...state,
            leaveRequests: setError(state.leaveRequests, errorMessage),
          }));
          throw error;
        }
      },

      updateLeaveRequestStatus: async (requestId, status, approvedBy) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated) throw createAuthError();
        if (!auth.tenantId) throw createTenantError();

        set(state => ({
          ...state,
          leaveRequests: setLoading(state.leaveRequests),
        }));

        try {
          const updates: Record<string, any> = { status };

          const activeApprovedBy = approvedBy || auth.userId;

          if (activeApprovedBy) {
            updates.approved_by = status === 'Pending' ? null : activeApprovedBy;
            updates.approved_at = status === 'Pending' ? null : new Date().toISOString();
          }

          const { data, error } = await supabase
            .from('leave_requests')
            .update(updates)
            .eq('id', requestId)
            .eq('tenant_id', auth.tenantId)
            .select(`
              *,
              leave_type:leave_types(name),
              employees(name)
            `)
            .single();

          if (error) throw error;

          // Look up the reviewer's name so "Reviewed By" shows immediately
          let approvedByName: string | undefined;
          if (data.approved_by) {
            const { data: profile } = await supabase
              .from('user_profiles')
              .select('name, email')
              .eq('id', data.approved_by)
              .maybeSingle();
            approvedByName = profile?.name || profile?.email || undefined;
          }

          // Preserve employee metadata already in the store for this request
          set(state => {
            const existing = state.leaveRequests.items?.find(r => r.id === requestId);
            const mappedData = {
              ...data,
              employee_name: existing?.employee_name || data.employees?.name || 'Unknown Employee',
              employee_code: existing?.employee_code || 'N/A',
              created_by_name: existing?.created_by_name || 'System/Self',
              approved_by_name: status === 'Pending' ? undefined : (approvedByName || existing?.approved_by_name),
            };
            return {
              ...state,
              leaveRequests: updateItem(state.leaveRequests, requestId, mappedData),
            };
          });

          // ── Notify the employee when their leave is decided ──────────────
          if (status === 'Approved' || status === 'Rejected' || status === 'Cancelled') {
            try {
              const leaveTypeName = data.leave_type?.name ?? 'Leave';
              await notifyEmployeeLeaveDecision(
                data.employee_id,
                auth.tenantId,
                status,
                leaveTypeName,
                data.start_date,
                data.end_date,
                requestId,
                data.employees?.name
              );
            } catch (notifErr) {
              console.error('Leave decision notification failed (non-critical):', notifErr);
            }
          }

          return data;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to update leave request';
          set(state => ({
            ...state,
            leaveRequests: setError(state.leaveRequests, errorMessage),
          }));
          throw error;
        }
      },

      cancelLeaveRequest: async (requestId) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated) throw createAuthError();
        if (!auth.tenantId) throw createTenantError();

        set(state => ({
          ...state,
          leaveRequests: setLoading(state.leaveRequests),
        }));

        try {
          const { data, error } = await supabase
            .from('leave_requests')
            .update({ status: 'Cancelled' })
            .eq('id', requestId)
            .eq('tenant_id', auth.tenantId)
            .select()
            .single();

          if (error) throw error;

          set(state => ({
            ...state,
            leaveRequests: updateItem(state.leaveRequests, requestId, data),
          }));

          // ── Notify Admins ──────────────────────────────────────────
          try {
             // Fetch leave details if not in data
             const { data: requestRow } = await supabase
               .from('leave_requests')
               .select('*, leave_types(name), employees(name)')
               .eq('id', requestId)
               .single();

             if (requestRow) {
               const leaveTypeName = requestRow.leave_types?.name ?? 'Leave';
               const employeeName = requestRow.employees?.name ?? 'An employee';
               
               await notifyAdminsLeaveCancelled(
                 auth.tenantId,
                 employeeName,
                 leaveTypeName,
                 requestRow.start_date,
                 requestRow.end_date,
                 requestId
               );
             }
          } catch (notifErr) {
            console.error('Leave cancel notification failed:', notifErr);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to cancel leave request';
          set(state => ({
            ...state,
            leaveRequests: setError(state.leaveRequests, errorMessage),
          }));
          throw error;
        }
      },

      reset: () => {
        set({
          leaveTypes: initialStoreState<LeaveType>(),
          leaveBalances: initialStoreState<LeaveBalance>(),
          leaveRequests: initialStoreState<LeaveRequest>(),
        });
      },

      // ── Leave Policy Processing ─────────────────────────────────────────

      applyLeaveCredit: async (employeeId, leaveTypeId, year, month) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated) throw createAuthError();
        if (!auth.tenantId) throw createTenantError();
        const { data, error } = await supabase.rpc('auto_apply_leave_credit', {
          p_employee_id: employeeId,
          p_leave_type_id: leaveTypeId,
          p_year: year,
          p_month: month,
          p_tenant_id: auth.tenantId,
        });
        if (error) throw error;
        return (data as number) ?? 0;
      },

      applyCarryForward: async (employeeId, leaveTypeId, fromYear, toYear) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated) throw createAuthError();
        if (!auth.tenantId) throw createTenantError();
        const { data, error } = await supabase.rpc('auto_apply_carry_forward', {
          p_employee_id: employeeId,
          p_leave_type_id: leaveTypeId,
          p_from_year: fromYear,
          p_to_year: toYear,
          p_tenant_id: auth.tenantId,
        });
        if (error) throw error;
        return (data as number) ?? 0;
      },

      applyEncashment: async (employeeId, leaveTypeId, year, month, preview) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated) throw createAuthError();
        if (!auth.tenantId) throw createTenantError();
        const { data, error } = await supabase.rpc('apply_leave_encashment', {
          p_employee_id: employeeId,
          p_leave_type_id: leaveTypeId,
          p_year: year,
          p_month: month,
          p_tenant_id: auth.tenantId,
          p_preview: preview,
        });
        if (error) throw error;
        return (data as number) ?? 0;
      },

      syncLeaveBalances: async (employeeId, year) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated) throw createAuthError();
        if (!auth.tenantId) throw createTenantError();
        const { error } = await supabase.rpc('sync_leave_balances', {
          p_employee_id: employeeId,
          p_year: year,
          p_tenant_id: auth.tenantId,
        });
        if (error) throw error;
      },

      syncAllLeaveBalances: async (year, departmentId) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated) throw createAuthError();
        if (!auth.tenantId) throw createTenantError();
        const { error } = await supabase.rpc('sync_all_leave_balances', {
          p_year: year,
          p_tenant_id: auth.tenantId,
          p_department_id: departmentId || null,
        });
        if (error) throw error;
      },
    }),
    {
      name: 'leave-storage',
      partialize: (state) => ({
        leaveTypes: {
          items: state.leaveTypes.items,
          initialized: state.leaveTypes.initialized,
        },
        leaveRequests: {
          items: state.leaveRequests.items,
          initialized: state.leaveRequests.initialized,
        },
      }),
    }
  )
);
