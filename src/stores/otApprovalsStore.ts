import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { validateAuth } from './utils/storeUtils';
import type { OTApprovalRecord, UpdateOTApprovalInput } from '../types/overtime';
import type { OTSyncStats, OTSyncProgress } from '../lib/otManagement';
import {
  getOTApprovals,
  updateOTApproval,
  bulkApproveOT,
  syncOTFromAttendanceLogs,
  deleteOTApproval,
} from '../lib/otManagement';

interface OTApprovalsStore {
  approvals: OTApprovalRecord[];
  loading: boolean;
  error: string | null;
  filters: {
    startDate?: string;
    endDate?: string;
    status?: string;
    employeeId?: string;
  };

  fetchApprovals: (startDate?: string, endDate?: string, status?: string) => Promise<void>;
  updateApproval: (approvalId: string, updates: UpdateOTApprovalInput) => Promise<void>;
  approveOT: (approvalId: string) => Promise<void>;
  approveMultiple: (approvalIds: string[]) => Promise<void>;
  rejectOT: (approvalId: string, reason: string) => Promise<void>;
  revokeOT: (approvalId: string, reason: string) => Promise<void>;
  editOTHours: (approvalId: string, correctedHours: number, reason: string) => Promise<void>;
  deleteOT: (approvalId: string) => Promise<void>;
  syncOT: (startDate: string, endDate: string, onProgress?: (p: OTSyncProgress) => void, shiftIds?: string[], employeeIds?: string[]) => Promise<OTSyncStats>;

  setFilters: (filters: OTApprovalsStore['filters']) => void;
  reset: () => void;
}

export const useOTApprovalsStore = create<OTApprovalsStore>((set, get) => ({
  approvals: [],
  loading: false,
  error: null,
  filters: {},

  fetchApprovals: async (startDate, endDate, status) => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) {
      set({ error: 'Authentication required' });
      return;
    }

    // Save filters to state so they persist across refreshes (like after a delete)
    set({ 
      filters: { startDate, endDate, status },
      loading: true, 
      error: null 
    });

    try {
      const approvals = await getOTApprovals(auth.tenantId, startDate, endDate, status);
      
      // DEBUG: Log the raw data fetched from Supabase
      console.log('[Zustand Store] Raw OT Approvals from DB:', approvals);

      if (!approvals || approvals.length === 0) {
        set({ approvals: [], loading: false });
        return;
      }

      // Enrich with employee data
      const employeeIds = [...new Set(approvals.map(a => a.employee_id))];
      const { data: employeesData, error: empError } = await supabase
        .from('employees')
        .select('id, name, employee_code, department:departments(name)')
        .in('id', employeeIds);

      if (empError) console.error('[Zustand Store] Error fetching employees:', empError);

      const employeeMap = new Map((employeesData || []).map(e => [e.id, e]));

      // Get approver names
      const approverIds = approvals
        .filter(a => a.approved_by)
        .map(a => a.approved_by!);
        
      const { data: profilesData, error: profError } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', approverIds);

      if (profError) console.error('[Zustand Store] Error fetching profiles:', profError);

      const approverMap = new Map((profilesData || []).map(p => [p.id, p.full_name]));

      // Fetch clock_in / clock_out from attendance_logs via attendance_log_id
      const attendanceLogIds = approvals
        .filter(a => a.attendance_log_id)
        .map(a => a.attendance_log_id!);

      let attendanceLogMap = new Map<string, { clock_in: string; clock_out: string }>();
      if (attendanceLogIds.length > 0) {
        const { data: logsData, error: logsError } = await supabase
          .from('attendance_logs')
          .select('id, clock_in, clock_out')
          .in('id', attendanceLogIds);
        if (logsError) console.error('[Zustand Store] Error fetching attendance logs:', logsError);
        attendanceLogMap = new Map((logsData || []).map(l => [l.id, { clock_in: l.clock_in, clock_out: l.clock_out }]));
      }

      const enrichedApprovals: OTApprovalRecord[] = approvals.map(approval => {
        const employee = employeeMap.get(approval.employee_id);
        const logTimes = approval.attendance_log_id ? attendanceLogMap.get(approval.attendance_log_id) : undefined;
        return {
          id: approval.id,
          employeeId: approval.employee_id,
          employeeName: employee?.name || 'Unknown',
          employeeCode: employee?.employee_code || '',
          department: employee?.department?.name,
          attendanceDate: approval.attendance_date,
          clockIn: logTimes?.clock_in,
          clockOut: logTimes?.clock_out,
          originalOTHours: approval.original_ot_hours,
          correctedOTHours: approval.corrected_ot_hours,
          modificationReason: approval.modification_reason,
          approvalStatus: approval.approval_status,
          approvedBy: approval.approved_by,
          approvedByName: approval.approved_by ? approverMap.get(approval.approved_by) : undefined,
          approvedAt: approval.approved_at,
          attendanceLogId: approval.attendance_log_id,
          appliedPolicyId: approval.applied_policy_id,
          appliedPolicyName: approval.applied_policy_name,
          isProcessed: approval.is_processed || false,
        };
      });

      set({ approvals: enrichedApprovals, loading: false });
    } catch (error) {
      console.error('[Zustand Store] Fetch Approvals Error:', error);
      set({ error: (error as Error).message, loading: false });
    }
  },

  updateApproval: async (approvalId, updates) => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) {
      throw new Error('Authentication required');
    }

    try {
      await updateOTApproval(approvalId, auth.tenantId, updates);
      // Refresh
      const { startDate, endDate, status } = get().filters;
      await get().fetchApprovals(startDate, endDate, status);
    } catch (error) {
      throw error;
    }
  },

  approveOT: async (approvalId) => {
    await get().updateApproval(approvalId, { approval_status: 'approved' });
  },

  approveMultiple: async (approvalIds) => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) {
      throw new Error('Authentication required');
    }

    try {
      await bulkApproveOT(auth.tenantId, approvalIds);
      // Refresh
      const { startDate, endDate, status } = get().filters;
      await get().fetchApprovals(startDate, endDate, status);
    } catch (error) {
      throw error;
    }
  },

  rejectOT: async (approvalId, reason) => {
    await get().updateApproval(approvalId, {
      approval_status: 'rejected',
      modification_reason: reason,
    });
  },
  
  revokeOT: async (approvalId, reason) => {
    await get().updateApproval(approvalId, {
      approval_status: 'pending',
      modification_reason: `Revoked: ${reason}`,
      approved_by: null,
      approved_at: null,
    });
  },

  editOTHours: async (approvalId, correctedHours, reason) => {
    await get().updateApproval(approvalId, {
      corrected_ot_hours: correctedHours,
      modification_reason: reason,
    });
  },
  
  deleteOT: async (approvalId) => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) {
      throw new Error('Authentication required');
    }

    try {
      await deleteOTApproval(approvalId, auth.tenantId);
      // Refresh
      const { startDate, endDate, status } = get().filters;
      await get().fetchApprovals(startDate, endDate, status);
    } catch (error) {
      throw error;
    }
  },

  syncOT: async (startDate, endDate, onProgress, shiftIds, employeeIds) => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) {
      throw new Error('Authentication required');
    }
    const stats = await syncOTFromAttendanceLogs(auth.tenantId, startDate, endDate, onProgress, shiftIds, employeeIds);
    // Refresh the list after sync so new records appear immediately
    await get().fetchApprovals(startDate, endDate, get().filters.status);
    return stats;
  },

  setFilters: (filters) => set({ filters }),

  reset: () => set({
    approvals: [],
    loading: false,
    error: null,
    filters: {},
  }),
}));