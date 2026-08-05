import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { validateAuth } from './utils/storeUtils';
import {
  EmployeePermission,
  EmployeePermissionLog,
  CreatePermissionRequest,
  UpdatePermissionRequest,
  PermissionStatus,
} from '../types/permissions';
import {
  notifyAdminsPermissionRequest,
  notifyReportingHeadsPermissionRequest,
  notifyAdminsPermissionCancelled,
  notifyEmployeePermissionDecision,
} from '../lib/notifications';

interface PermissionsStore {
  permissions: EmployeePermission[];
  logs: EmployeePermissionLog[];
  loading: boolean;
  error: string | null;
  lastOptions?: { employeeId?: string, requestedByUserId?: string } | string;

  fetchPermissions: (options?: { employeeId?: string, requestedByUserId?: string } | string) => Promise<void>;
  fetchPermissionById: (id: string) => Promise<EmployeePermission | null>;
  fetchPermissionLogs: (permissionId: string) => Promise<void>;
  createPermission: (request: CreatePermissionRequest) => Promise<boolean>;
  updatePermission: (id: string, updates: UpdatePermissionRequest) => Promise<boolean>;
  cancelPermission: (id: string) => Promise<boolean>;
  approvePermission: (id: string, updates?: UpdatePermissionRequest) => Promise<boolean>;
  rejectPermission: (id: string) => Promise<boolean>;
  fetchBalance: (employeeId: string, month: number, year: number) => Promise<any>;
  initializeMonthlyBalances: () => Promise<void>;
  reset: () => void;
}

export const usePermissionsStore = create<PermissionsStore>((set, get) => ({
  permissions: [],
  logs: [],
  loading: false,
  error: null,
  lastOptions: undefined,

  fetchPermissions: async (options?: { employeeId?: string, requestedByUserId?: string } | string) => {
    set({ loading: true, error: null, lastOptions: options });

    let employeeId: string | undefined;
    let requestedByUserId: string | undefined;
    if (typeof options === 'string') {
      employeeId = options;
    } else if (options) {
      employeeId = options.employeeId;
      requestedByUserId = options.requestedByUserId;
    }

    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) {
      set({ error: 'Authentication required', loading: false });
      return;
    }

    try {
      let query = supabase
        .from('employee_permissions')
        .select(`
          *,
          employees(
            name,
            employee_code
          ),
          requested_by_user:profiles!employee_permissions_requested_by_fkey (
            id,
            email,
            full_name
          ),
          approved_by_user:profiles!employee_permissions_approved_by_fkey (
            id,
            email,
            full_name
          )
        `)
        .eq('tenant_id', auth.tenantId)
        .order('created_at', { ascending: false });

      if (employeeId && requestedByUserId) {
        query = query.or(`employee_id.eq.${employeeId},requested_by.eq.${requestedByUserId}`);
      } else if (employeeId) {
        query = query.eq('employee_id', employeeId);
      } else if (requestedByUserId) {
        query = query.eq('requested_by', requestedByUserId);
      }

      const { data, error } = await query;

      if (error) throw error;

      const formattedPermissions: EmployeePermission[] = (data || []).map((item: any) => ({
        id: item.id,
        tenantId: item.tenant_id,
        employeeId: item.employee_id,
        startDate: item.start_date,
        startTime: item.start_time,
        endDate: item.end_date,
        endTime: item.end_time,
        reason: item.reason,
        status: item.status,
        requestedBy: item.requested_by,
        approvedBy: item.approved_by,
        approvalDate: item.approval_date,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
        employeeName: item.employees?.name,
        employeeCode: item.employees?.employee_code,
        requestedByName: item.requested_by_user?.full_name || item.requested_by_user?.email,
        approvedByName: item.approved_by_user?.full_name || item.approved_by_user?.email,
      }));

      set({ permissions: formattedPermissions, loading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch permissions',
        loading: false,
      });
    }
  },

  fetchPermissionById: async (id: string) => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) {
      return null;
    }

    try {
      const { data, error } = await supabase
        .from('employee_permissions')
        .select(`
          *,
          employees(
            name,
            employee_code
          )
        `)
        .eq('id', id)
        .eq('tenant_id', auth.tenantId)
        .single();

      if (error) throw error;

      return {
        id: data.id,
        tenantId: data.tenant_id,
        employeeId: data.employee_id,
        startDate: data.start_date,
        startTime: data.start_time,
        endDate: data.end_date,
        endTime: data.end_time,
        reason: data.reason,
        status: data.status,
        requestedBy: data.requested_by,
        approvedBy: data.approved_by,
        approvalDate: data.approval_date,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        employeeName: data.employees?.name,
        employeeCode: data.employees?.employee_code,
      };
    } catch (error) {
      console.error('Error fetching permission:', error);
      return null;
    }
  },

  fetchPermissionLogs: async (permissionId: string) => {
    set({ error: null });

    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) {
      set({ error: 'Authentication required' });
      return;
    }

    try {
      const { data, error } = await supabase
        .from('employee_permission_logs')
        .select(`
          *,
          modified_by_user:profiles!employee_permission_logs_modified_by_fkey (
            id,
            email,
            full_name
          )
        `)
        .eq('permission_id', permissionId)
        .order('modified_at', { ascending: false });

      if (error) throw error;

      const formattedLogs: EmployeePermissionLog[] = (data || []).map((item: any) => ({
        id: item.id,
        permissionId: item.permission_id,
        modifiedBy: item.modified_by,
        fieldName: item.field_name,
        oldValue: item.old_value,
        newValue: item.new_value,
        modifiedAt: item.modified_at,
        modifiedByName: item.modified_by_user?.full_name || item.modified_by_user?.email,
      }));

      set({ logs: formattedLogs });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch permission logs',
      });
    }
  },

  createPermission: async (request: CreatePermissionRequest) => {
    set({ loading: true, error: null });

    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId || !auth.userId) {
      set({ error: 'Authentication required', loading: false });
      return false;
    }

    try {
      const { error } = await supabase.from('employee_permissions').insert({
        tenant_id: auth.tenantId,
        employee_id: request.employeeId,
        start_date: request.startDate,
        start_time: request.startTime,
        end_date: request.endDate,
        end_time: request.endTime,
        reason: request.reason,
        requested_by: auth.userId,
        status: 'pending',
      });

      if (error) throw error;

      // ── Notify Reporting Heads ──────────────────────────────────────────
      try {
        const { data: emp } = await supabase.from('employees').select('name, reporting_to').eq('id', request.employeeId).single();
        const employeeName = emp?.name || 'An employee';

        let managerUserIds: string[] = [];
        const reportingTo = emp?.reporting_to;
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
          await notifyReportingHeadsPermissionRequest(
            auth.tenantId,
            employeeName,
            request.startDate,
            request.startTime,
            request.endTime,
            'NEW_ID', // We need the inserted ID. The insert doesn't return it in the current call.
            managerUserIds
          );
        } else {
          await notifyAdminsPermissionRequest(
            auth.tenantId,
            employeeName,
            request.startDate,
            request.startTime,
            request.endTime,
            'NEW_ID' // We need the inserted ID. The insert doesn't return it in the current call.
          );
        }
      } catch (err) {
        console.error('Permission request notification failed:', err);
      }

      set({ loading: false });
      await get().fetchPermissions(get().lastOptions);
      return true;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to create permission',
        loading: false,
      });
      return false;
    }
  },

  updatePermission: async (id: string, updates: UpdatePermissionRequest) => {
    set({ loading: true, error: null });

    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) {
      set({ error: 'Authentication required', loading: false });
      return false;
    }

    try {
      const updateData: any = {};

      if (updates.startDate !== undefined) updateData.start_date = updates.startDate;
      if (updates.startTime !== undefined) updateData.start_time = updates.startTime;
      if (updates.endDate !== undefined) updateData.end_date = updates.endDate;
      if (updates.endTime !== undefined) updateData.end_time = updates.endTime;
      if (updates.reason !== undefined) updateData.reason = updates.reason;
      if (updates.status !== undefined) updateData.status = updates.status;
      if (updates.approvedBy !== undefined) updateData.approved_by = updates.approvedBy;
      if (updates.approvalDate !== undefined) updateData.approval_date = updates.approvalDate;

      const { error } = await supabase
        .from('employee_permissions')
        .update(updateData)
        .eq('id', id)
        .eq('tenant_id', auth.tenantId);

      if (error) throw error;

      set({ loading: false });
      await get().fetchPermissions(get().lastOptions);

      // ── Notify Employee ────────────────────────────────────────
      if (updates.status === 'approved' || updates.status === 'rejected' || updates.status === 'cancelled') {
        try {
          const { data: perm } = await supabase.from('employee_permissions').select('employee_id, start_date').eq('id', id).single();
          if (perm) {
            const { data: emp } = await supabase.from('employees').select('name').eq('id', perm.employee_id).single();
            const status = updates.status.charAt(0).toUpperCase() + updates.status.slice(1) as any;
            await notifyEmployeePermissionDecision(
              perm.employee_id,
              auth.tenantId,
              status,
              perm.start_date,
              id,
              emp?.name
            );
          }

          // ── Notify Admins if cancelled by employee ────────────────
          if (updates.status === 'cancelled') {
            const { data: perm } = await supabase.from('employee_permissions').select('employee_id, start_date').eq('id', id).single();
            if (perm) {
              const { data: emp } = await supabase.from('employees').select('name').eq('id', perm.employee_id).single();
              await notifyAdminsPermissionCancelled(
                auth.tenantId,
                emp?.name || 'An employee',
                perm.start_date,
                id
              );
            }
          }
        } catch (err) {
          console.error('Permission status change notification failed:', err);
        }
      }

      return true;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to update permission',
        loading: false,
      });
      return false;
    }
  },

  cancelPermission: async (id: string) => {
    return await get().updatePermission(id, { status: 'cancelled' });
  },

  approvePermission: async (id: string, updates?: UpdatePermissionRequest) => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.userId) {
      return false;
    }

    const updateData: UpdatePermissionRequest = {
      ...updates,
      status: 'approved',
      approvedBy: auth.userId,
      approvalDate: new Date().toISOString(),
    };

    return await get().updatePermission(id, updateData);
  },

  fetchBalance: async (employeeId: string, month: number, year: number) => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) {
      return null;
    }

    try {
      // Create a date string for the first day of the month (YYYY-MM-DD)
      const dateStr = `${year}-${month.toString().padStart(2, '0')}-01`;
      
      const { data, error } = await supabase.rpc('get_employee_permission_balance', {
        p_tenant_id: auth.tenantId,
        p_employee_id: employeeId,
        p_date: dateStr
      });

      if (error) {
        console.error('Error fetching permission balance:', error);
        return null;
      }

      // get_employee_permission_balance returns a table (array of rows)
      if (data && data.length > 0) {
        return data[0].remaining;
      }

      return null;
    } catch (error) {
      console.error('Failed to fetch balance:', error);
      return null;
    }
  },

  rejectPermission: async (id: string) => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.userId) {
      return false;
    }

    return await get().updatePermission(id, {
      status: 'rejected',
      approvedBy: auth.userId,
      approvalDate: new Date().toISOString(),
    });
  },

  initializeMonthlyBalances: async () => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) return;

    try {
      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();

      await supabase.rpc('initialize_tenant_permission_balances', {
        p_tenant_id: auth.tenantId,
        p_month: month,
        p_year: year
      });
    } catch (error) {
      console.error('Failed to initialize balances:', error);
    }
  },

  reset: () => {
    set({
      permissions: [],
      logs: [],
      loading: false,
      error: null,
      lastOptions: undefined,
    });
  },
}));
