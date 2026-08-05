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
import toast from 'react-hot-toast';
import {
  notifyAdminsGatePassRequest,
  notifyReportingHeadsGatePassRequest,
  notifyAdminsGatePassCancelled,
  notifyEmployeeGatePassDecision,
} from '../lib/notifications';

import type {
  GatePassRequest,
  GatePassApproval,
  GatePassChangeLog,
  CreateGatePassRequest,
  UpdateGatePassRequest,
  ApproveGatePassRequest,
  RejectGatePassRequest,
  CancelGatePassRequest,
  GatePassFilters,
  GatePassStatistics,
} from '../types/gatePasses';

interface GatePassesStore extends StoreState<GatePassRequest> {
  approvals: Record<string, GatePassApproval>;
  changeLogs: Record<string, GatePassChangeLog[]>;
  statistics: GatePassStatistics | null;

  fetchGatePasses: (filters?: GatePassFilters) => Promise<void>;
  fetchGatePassById: (id: string) => Promise<GatePassRequest | null>;
  createGatePass: (request: CreateGatePassRequest) => Promise<GatePassRequest>;
  
  // NEW: Instantly create and assign a gate pass from the employee app
  createAssignedGatePass: (request: CreateGatePassRequest) => Promise<GatePassRequest>;
  
  updateGatePass: (id: string, updates: UpdateGatePassRequest) => Promise<void>;
  cancelGatePass: (id: string, request: CancelGatePassRequest) => Promise<void>;

  approveGatePass: (id: string, request: ApproveGatePassRequest) => Promise<void>;
  rejectGatePass: (id: string, request: RejectGatePassRequest) => Promise<void>;

  deleteGatePass: (id: string) => Promise<void>;
  swapGatePassEmployee: (id: string, newEmployeeId: string, reason: string) => Promise<void>;
  updateGatePassLocation: (id: string, updates: Partial<GatePassRequest>, reason: string) => Promise<void>;

  fetchApproval: (gatePassId: string) => Promise<void>;
  fetchChangeLogs: (gatePassId: string) => Promise<void>;
  fetchStatistics: (filters?: GatePassFilters) => Promise<void>;

  reset: () => void;
}

export const useGatePassesStore = create<GatePassesStore>()(
  persist(
    (set, get) => ({
      ...initialStoreState<GatePassRequest>(),
      approvals: {},
      changeLogs: {},
      statistics: null,

      fetchGatePasses: async (filters) => {
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
            .from('gate_pass_requests')
            .select(`
              *,
              employee:employees!gate_pass_requests_employee_id_fkey (
                name,
                email,
                employee_code,
                department_id(name)
              )
            `)
            .eq('tenant_id', auth.tenantId)
            .order('created_at', { ascending: false });

          if (filters?.status && filters.status !== 'all') {
            query = query.eq('status', filters.status);
          }

          if (filters?.employee_id) {
            query = query.eq('employee_id', filters.employee_id);
          }

          if (filters?.start_date) {
            query = query.gte('start_date', filters.start_date);
          }

          if (filters?.end_date) {
            query = query.lte('end_date', filters.end_date);
          }

          const { data, error } = await query;

          if (error) throw error;

          const formattedData = (data || []).map(item => ({
            ...item,
            employee: Array.isArray(item.employee) ? item.employee[0] : item.employee
          }));

          set(state => setSuccess(state, formattedData));
        } catch (error) {
          set(state => setError(state, error instanceof Error ? error.message : 'Failed to fetch gate passes'));
        }
      },

      fetchGatePassById: async (id) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated || !auth.tenantId) {
          return null;
        }

        try {
          const { data, error } = await supabase
            .from('gate_pass_requests')
            .select(`
              *,
              employee:employees!gate_pass_requests_employee_id_fkey (
                name,
                email,
                employee_code,
                department_id(name)
              )
            `)
            .eq('id', id)
            .eq('tenant_id', auth.tenantId)
            .maybeSingle();

          if (error) throw error;
          if (!data) return null;

          const formattedData = {
            ...data,
            employee: Array.isArray(data.employee) ? data.employee[0] : data.employee
          };

          return formattedData;
        } catch (error) {
          console.error('Failed to fetch gate pass:', error);
          return null;
        }
      },

      createGatePass: async (request) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated) throw createAuthError();
        if (!auth.tenantId) throw createTenantError();

        set(state => setLoading(state));

        try {
          const { data, error } = await supabase
            .from('gate_pass_requests')
            .insert([
              {
                ...request,
                tenant_id: auth.tenantId,
                requested_by: auth.userId,
                status: 'pending'
              }
            ])
            .select(`
              *,
              employee:employees!gate_pass_requests_employee_id_fkey (
                name,
                email,
                employee_code,
                reporting_to,
                department_id(name)
              )
            `);

          if (error) throw error;
          if (!data || data.length === 0) throw new Error('Creation failed to return data.');

          const newRecord = data[0];
          const formattedData = {
            ...newRecord,
            employee: Array.isArray(newRecord.employee) ? newRecord.employee[0] : newRecord.employee
          };

          set(state => addItem(state, formattedData));
          
          // ── Notify Reporting Heads ──────────────────────────────────────────
          try {
            const employeeName = formattedData.employee?.name || 'An employee';
            let managerUserIds: string[] = [];
            const reportingTo = formattedData.employee?.reporting_to;
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
              await notifyReportingHeadsGatePassRequest(
                auth.tenantId,
                employeeName,
                request.start_date,
                request.start_time,
                formattedData.id,
                managerUserIds
              );
            } else {
              await notifyAdminsGatePassRequest(
                auth.tenantId,
                employeeName,
                request.start_date,
                request.start_time,
                formattedData.id
              );
            }
          } catch (err) {
            console.error('Gate pass request notification failed:', err);
          }

          return formattedData;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to create gate pass';
          set(state => setError(state, errorMessage));
          throw error;
        }
      },

      // --- NEW: INSTANTLY ASSIGNED GATE PASS FROM EMPLOYEE APP ---
      createAssignedGatePass: async (request) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated) throw createAuthError();
        if (!auth.tenantId) throw createTenantError();

        set(state => setLoading(state));

        try {
          // 1. Create the Gate Pass with 'assigned' status immediately
          const { data, error } = await supabase
            .from('gate_pass_requests')
            .insert([
              {
                ...request,
                tenant_id: auth.tenantId,
                requested_by: auth.userId,
                status: 'assigned',
                approved_start_date: request.start_date,
                approved_start_time: request.start_time,
                approved_end_date: request.end_date,
                approved_end_time: request.end_time
              }
            ])
            .select(`
              *,
              employee:employees!gate_pass_requests_employee_id_fkey (
                name,
                email,
                employee_code,
                department_id(name)
              )
            `);

          if (error) throw error;
          if (!data || data.length === 0) throw new Error('Creation failed to return data.');

          const newRecord = data[0];

          // 2. Auto-generate the work_locations record so tracking works instantly
          const { error: wlError } = await supabase
            .from('work_locations')
            .insert([
              {
                tenant_id: auth.tenantId,
                employee_id: request.employee_id,
                assigned_by: auth.userId,
                location_name: request.company_name || 'Official Gate Pass Visit',
                location_description: request.reason || 'Official Visit',
                latitude: request.latitude || 0,
                longitude: request.longitude || 0,
                allowed_radius_meters: request.allowed_radius_meters ?? 100,
                assignment_date: request.start_date,
                work_description: request.reason || 'Official Visit',
                status: 'assigned',
                address: request.address,
                city: request.city,
                state: request.state,
                country: request.country,
                postal_code: request.postal_code,
                formatted_address: request.formatted_address,
                gate_pass_id: newRecord.id
              }
            ]);

          if (wlError) {
            console.error('Failed to create work location from gate pass:', wlError);
            toast.error('Location created, but tracking might not be active. Contact admin.');
          }

          const formattedData = {
            ...newRecord,
            employee: Array.isArray(newRecord.employee) ? newRecord.employee[0] : newRecord.employee
          };

          set(state => addItem(state, formattedData));
          return formattedData;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to create assigned location';
          set(state => setError(state, errorMessage));
          throw error;
        }
      },

      updateGatePass: async (id, updates) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated) throw createAuthError();
        if (!auth.tenantId) throw createTenantError();

        set(state => setLoading(state));

        try {
          const { data, error } = await supabase
            .from('gate_pass_requests')
            .update(updates)
            .eq('id', id)
            .eq('tenant_id', auth.tenantId)
            .eq('status', 'pending')
            .select(`
              *,
              employee:employees!gate_pass_requests_employee_id_fkey (
                name,
                email,
                employee_code,
                department_id(name)
              )
            `);

          if (error) throw error;
          if (!data || data.length === 0) throw new Error('Update failed. The gate pass may not be in a pending state.');

          const updatedRecord = data[0];
          const formattedData = {
            ...updatedRecord,
            employee: Array.isArray(updatedRecord.employee) ? updatedRecord.employee[0] : updatedRecord.employee
          };

          set(state => updateItem(state, id, formattedData));
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to update gate pass';
          set(state => setError(state, errorMessage));
          throw error;
        }
      },

      cancelGatePass: async (id, request) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated) throw createAuthError();
        if (!auth.tenantId) throw createTenantError();

        set(state => setLoading(state));

        try {
          const { data, error } = await supabase
            .from('gate_pass_requests')
            .update({
              status: 'cancelled',
              cancelled_at: new Date().toISOString(),
              cancelled_by: auth.userId,
              cancellation_reason: request.cancellation_reason
            })
            .eq('id', id)
            .eq('tenant_id', auth.tenantId)
            .select(`
              *,
              employee:employees!gate_pass_requests_employee_id_fkey (
                name,
                email,
                employee_code,
                department_id(name)
              )
            `);

          if (error) throw error;
          if (!data || data.length === 0) throw new Error('Failed to cancel. Record not found.');

          await supabase
            .from('work_locations')
            .update({
              status: 'cancelled',
              cancel_reason: request.cancellation_reason
            })
            .eq('gate_pass_id', id)
            .eq('tenant_id', auth.tenantId);

          const updatedRecord = data[0];
          const formattedData = {
            ...updatedRecord,
            employee: Array.isArray(updatedRecord.employee) ? updatedRecord.employee[0] : updatedRecord.employee
          };

          set(state => updateItem(state, id, formattedData));

          // ── Notify Employee ────────────────────────────────────────
          try {
            await notifyEmployeeGatePassDecision(
              updatedRecord.employee_id,
              auth.tenantId,
              'Cancelled',
              updatedRecord.start_date,
              updatedRecord.start_time,
              id,
              formattedData.employee?.name
            );
          } catch (err) {
            console.error('Gate pass cancellation notification failed:', err);
          }

          // ── Notify Admins ──────────────────────────────────────────
          try {
            await notifyAdminsGatePassCancelled(
              auth.tenantId,
              formattedData.employee?.name || 'An employee',
              updatedRecord.start_date,
              id
            );
          } catch (err) {
            console.error('Gate pass admin cancellation notification failed:', err);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to cancel gate pass';
          set(state => setError(state, errorMessage));
          throw error;
        }
      },

      approveGatePass: async (id, request) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated) throw createAuthError();
        if (!auth.tenantId) throw createTenantError();

        set(state => setLoading(state));

        try {
          const gatePass = get().items.find(item => item.id === id);
          if (!gatePass) throw new Error('Gate pass not found');

          const hasModifications =
            request.approved_start_date !== gatePass.start_date ||
            request.approved_start_time !== gatePass.start_time ||
            request.approved_end_date !== gatePass.end_date ||
            request.approved_end_time !== gatePass.end_time;

          const targetStatus = gatePass.gate_pass_type === 'paid' ? 'assigned' : 'approved';

          const { data, error: updateError } = await supabase
            .from('gate_pass_requests')
            .update({
              status: targetStatus,
              approved_start_date: request.approved_start_date,
              approved_start_time: request.approved_start_time,
              approved_end_date: request.approved_end_date,
              approved_end_time: request.approved_end_time
            })
            .eq('id', id)
            .eq('tenant_id', auth.tenantId)
            .eq('status', 'pending')
            .select(`
              *,
              employee:employees!gate_pass_requests_employee_id_fkey (
                name,
                email,
                employee_code,
                department_id(name)
              )
            `);

          if (updateError) throw updateError;
          if (!data || data.length === 0) throw new Error('Failed to approve. Pass may no longer be pending.');

          const updatedGatePass = data[0];

          const { error: approvalError } = await supabase
            .from('gate_pass_approvals')
            .insert([
              {
                gate_pass_id: id,
                tenant_id: auth.tenantId,
                action: 'approved',
                approver_id: auth.userId,
                approver_name: auth.userEmail || 'Unknown',
                comments: request.comments,
                original_start_date: gatePass.start_date,
                original_start_time: gatePass.start_time,
                original_end_date: gatePass.end_date,
                original_end_time: gatePass.end_time,
                modified_start_date: request.approved_start_date,
                modified_start_time: request.approved_start_time,
                modified_end_date: request.approved_end_date,
                modified_end_time: request.approved_end_time,
                has_modifications: hasModifications
              }
            ]);

          if (approvalError) throw approvalError;

          if (gatePass.gate_pass_type === 'paid') {
            const assignmentDate = request.approved_start_date || gatePass.start_date;
            
            const { error: wlError } = await supabase
              .from('work_locations')
              .insert([
                {
                  tenant_id: auth.tenantId,
                  employee_id: gatePass.employee_id,
                  assigned_by: auth.userId,
                  location_name: gatePass.company_name || 'Official Gate Pass Visit',
                  location_description: `Auto-generated from Approved Paid Gate Pass. Original Reason: ${gatePass.reason}`,
                  latitude: gatePass.latitude || 0,
                  longitude: gatePass.longitude || 0,
                  allowed_radius_meters: gatePass.allowed_radius_meters ?? 100,
                  assignment_date: assignmentDate,
                  work_description: gatePass.reason || 'Official Visit',
                  status: 'assigned',
                  address: gatePass.address,
                  city: gatePass.city,
                  state: gatePass.state,
                  country: gatePass.country,
                  postal_code: gatePass.postal_code,
                  formatted_address: gatePass.formatted_address,
                  gate_pass_id: gatePass.id
                }
              ]);

            if (wlError) {
              console.error('Failed to create work location from gate pass:', wlError);
              toast.error('Gate pass assigned, but failed to auto-create work location tracking. Please check coordinates.');
            }
          }

          const formattedData = {
            ...updatedGatePass,
            employee: Array.isArray(updatedGatePass.employee) ? updatedGatePass.employee[0] : updatedGatePass.employee
          };

          set(state => updateItem(state, id, formattedData));

          // ── Notify Employee ────────────────────────────────────────
          try {
            await notifyEmployeeGatePassDecision(
              updatedGatePass.employee_id,
              auth.tenantId,
              'Approved',
              updatedGatePass.start_date,
              updatedGatePass.start_time,
              id,
              formattedData.employee?.name
            );
          } catch (err) {
            console.error('Gate pass approval notification failed:', err);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to process gate pass';
          set(state => setError(state, errorMessage));
          throw error;
        }
      },

      rejectGatePass: async (id, request) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated) throw createAuthError();
        if (!auth.tenantId) throw createTenantError();

        set(state => setLoading(state));

        try {
          const { data, error: updateError } = await supabase
            .from('gate_pass_requests')
            .update({
              status: 'rejected'
            })
            .eq('id', id)
            .eq('tenant_id', auth.tenantId)
            .eq('status', 'pending')
            .select(`
              *,
              employee:employees!gate_pass_requests_employee_id_fkey (
                name,
                email,
                employee_code,
                department_id(name)
              )
            `);

          if (updateError) throw updateError;
          if (!data || data.length === 0) throw new Error('Failed to reject. Pass may no longer be pending.');

          const updatedGatePass = data[0];

          const { error: approvalError } = await supabase
            .from('gate_pass_approvals')
            .insert([
              {
                gate_pass_id: id,
                tenant_id: auth.tenantId,
                action: 'rejected',
                approver_id: auth.userId,
                approver_name: auth.userEmail || 'Unknown',
                rejection_reason: request.rejection_reason
              }
            ]);

          if (approvalError) throw approvalError;

          const formattedData = {
            ...updatedGatePass,
            employee: Array.isArray(updatedGatePass.employee) ? updatedGatePass.employee[0] : updatedGatePass.employee
          };

          set(state => updateItem(state, id, formattedData));

          // ── Notify Employee ────────────────────────────────────────
          try {
            await notifyEmployeeGatePassDecision(
              updatedGatePass.employee_id,
              auth.tenantId,
              'Rejected',
              updatedGatePass.start_date,
              updatedGatePass.start_time,
              id,
              formattedData.employee?.name
            );
          } catch (err) {
            console.error('Gate pass rejection notification failed:', err);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to reject gate pass';
          set(state => setError(state, errorMessage));
          throw error;
        }
      },

      deleteGatePass: async (id) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated || !auth.tenantId) throw createAuthError();
        
        set(state => setLoading(state));
        try {
          await supabase.from('work_locations').delete().eq('gate_pass_id', id);
          const { error } = await supabase.from('gate_pass_requests').delete().eq('id', id);
          if (error) throw error;
          
          set(state => removeItem(state, id));
        } catch (error) {
          set(state => setError(state, error instanceof Error ? error.message : 'Failed to delete gate pass'));
          throw error;
        }
      },

      swapGatePassEmployee: async (id, newEmployeeId, reason) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated || !auth.tenantId) throw createAuthError();

        set(state => setLoading(state));
        try {
          const { data, error } = await supabase
            .from('gate_pass_requests')
            .update({ employee_id: newEmployeeId })
            .eq('id', id)
            .eq('tenant_id', auth.tenantId)
            .select(`*, employee:employees!gate_pass_requests_employee_id_fkey(name, email, employee_code, department_id(name))`);

          if (error) throw error;
          if (!data || data.length === 0) throw new Error('Gate pass not found. It may have been deleted or you lack permissions.');

          const updatedRecord = data[0];

          const { error: wlError } = await supabase.from('work_locations')
            .update({ employee_id: newEmployeeId, update_reason: reason })
            .eq('gate_pass_id', id)
            .eq('tenant_id', auth.tenantId);
            
          if (wlError) throw wlError;

          const formattedData = { 
            ...updatedRecord, 
            employee: Array.isArray(updatedRecord.employee) ? updatedRecord.employee[0] : updatedRecord.employee 
          };
          set(state => updateItem(state, id, formattedData));
        } catch (error) {
          set(state => setError(state, error instanceof Error ? error.message : 'Failed to swap employee'));
          throw error;
        }
      },

      updateGatePassLocation: async (id, updates, reason) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated || !auth.tenantId) throw createAuthError();

        set(state => setLoading(state));
        try {
          const { data, error } = await supabase
            .from('gate_pass_requests')
            .update(updates)
            .eq('id', id)
            .eq('tenant_id', auth.tenantId)
            .select(`*, employee:employees!gate_pass_requests_employee_id_fkey(name, email, employee_code, department_id(name))`);

          if (error) throw error;
          if (!data || data.length === 0) throw new Error('Location update failed. Pass not found.');

          const updatedRecord = data[0];

          const { error: wlError } = await supabase.from('work_locations')
            .update({
              location_name: updates.company_name,
              latitude: updates.latitude,
              longitude: updates.longitude,
              allowed_radius_meters: updates.allowed_radius_meters,
              address: updates.address,
              city: updates.city,
              state: updates.state,
              country: updates.country,
              postal_code: updates.postal_code,
              formatted_address: updates.formatted_address,
              update_reason: reason
            })
            .eq('gate_pass_id', id)
            .eq('tenant_id', auth.tenantId);
            
          if (wlError) throw wlError;

          const formattedData = { 
            ...updatedRecord, 
            employee: Array.isArray(updatedRecord.employee) ? updatedRecord.employee[0] : updatedRecord.employee 
          };
          set(state => updateItem(state, id, formattedData));
        } catch (error) {
          set(state => setError(state, error instanceof Error ? error.message : 'Failed to update location'));
          throw error;
        }
      },

      fetchApproval: async (gatePassId) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated || !auth.tenantId) return;

        try {
          const { data, error } = await supabase
            .from('gate_pass_approvals')
            .select('*')
            .eq('gate_pass_id', gatePassId)
            .eq('tenant_id', auth.tenantId)
            .maybeSingle();

          if (error) throw error;

          if (data) {
            set(state => ({
              ...state,
              approvals: { ...state.approvals, [gatePassId]: data }
            }));
          }
        } catch (error) {
          console.error('Failed to fetch approval:', error);
        }
      },

      fetchChangeLogs: async (gatePassId) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated || !auth.tenantId) return;

        try {
          const { data, error } = await supabase
            .from('gate_pass_change_logs')
            .select('*')
            .eq('gate_pass_id', gatePassId)
            .eq('tenant_id', auth.tenantId)
            .order('changed_at', { ascending: false });

          if (error) throw error;

          set(state => ({
            ...state,
            changeLogs: { ...state.changeLogs, [gatePassId]: data || [] }
          }));
        } catch (error) {
          console.error('Failed to fetch change logs:', error);
        }
      },

      fetchStatistics: async (filters) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated || !auth.tenantId) return;

        try {
          let query = supabase
            .from('gate_pass_requests')
            .select('status', { count: 'exact', head: false })
            .eq('tenant_id', auth.tenantId);

          if (filters?.employee_id) {
            query = query.eq('employee_id', filters.employee_id);
          }

          if (filters?.start_date) {
            query = query.gte('start_date', filters.start_date);
          }

          if (filters?.end_date) {
            query = query.lte('end_date', filters.end_date);
          }

          const { data, error } = await query;

          if (error) throw error;

          const stats: any = {
            total: data?.length || 0,
            pending: data?.filter(item => item.status === 'pending').length || 0,
            approved: data?.filter(item => item.status === 'approved').length || 0,
            assigned: data?.filter(item => item.status === 'assigned').length || 0,
            in_progress: data?.filter(item => item.status === 'in_progress').length || 0,
            paused: data?.filter(item => item.status === 'paused').length || 0,
            completed: data?.filter(item => item.status === 'completed').length || 0,
            rejected: data?.filter(item => item.status === 'rejected').length || 0,
            cancelled: data?.filter(item => item.status === 'cancelled').length || 0
          };

          set({ statistics: stats });
        } catch (error) {
          console.error('Failed to fetch statistics:', error);
        }
      },

      reset: () => {
        set({
          ...initialStoreState<GatePassRequest>(),
          approvals: {},
          changeLogs: {},
          statistics: null
        });
      }
    }),
    {
      name: 'gate-passes-storage',
      partialize: (state) => ({
        items: state.items,
        initialized: state.initialized
      })
    }
  )
);