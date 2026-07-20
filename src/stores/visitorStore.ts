import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type {
  Visitor,
  VisitorTimestamp,
  VisitorApproval,
  VisitorNotification,
  VisitorSettings,
  VisitorWithDetails,
  VisitorFormData,
  VisitorApprovalRequest,
  VisitorConfirmationRequest,
} from '../types/visitor';

interface VisitorStore {
  visitors: VisitorWithDetails[];
  timestamps: VisitorTimestamp[];
  approvals: VisitorApproval[];
  notifications: VisitorNotification[];
  settings: VisitorSettings | null;
  loading: boolean;
  error: string | null;

  fetchVisitors: (tenantId: string) => Promise<void>;
  fetchVisitorTimestamps: (tenantId: string, visitorId?: string) => Promise<void>;
  fetchVisitorApprovals: (tenantId: string) => Promise<void>;
  fetchVisitorNotifications: (tenantId: string, employeeId: string) => Promise<void>;
  fetchVisitorSettings: (tenantId: string) => Promise<void>;

  createVisitor: (tenantId: string, faceDescriptor: any, imageData?: Uint8Array) => Promise<Visitor | null>;
  createNewVisit: (tenantId: string, visitorId: string) => Promise<void>; // <-- NEW Function for Returning Visitors
  updateVisitorDetails: (visitorId: string, data: VisitorFormData) => Promise<void>;
  submitVisitorForApproval: (visitorId: string) => Promise<void>;

  createVisitorTimestamp: (tenantId: string, visitorId: string) => Promise<void>;
  updateVisitorClockOut: (timestampId: string, tenantId?: string, visitorId?: string) => Promise<void>;
  confirmVisitorExit: (request: VisitorConfirmationRequest, userId: string) => Promise<void>;

  approveOrRejectVisitor: (tenantId: string, employeeId: string, request: VisitorApprovalRequest, userId: string) => Promise<void>;

  markNotificationAsRead: (notificationId: string) => Promise<void>;
  markAllNotificationsAsRead: (employeeId: string) => Promise<void>;

  updateVisitorSettings: (tenantId: string, settings: Partial<VisitorSettings>) => Promise<void>;

  findSimilarVisitor: (tenantId: string, faceDescriptor: any, threshold?: number) => Promise<Visitor | null>;
  deleteVisitor: (visitorId: string) => Promise<void>;
}

export const useVisitorStore = create<VisitorStore>((set, get) => ({
  visitors: [],
  timestamps: [],
  approvals: [],
  notifications: [],
  settings: null,
  loading: false,
  error: null,

  fetchVisitors: async (tenantId: string) => {
    set({ loading: true, error: null });
    try {
      // 1. Fetch Profile joined with multiple Visits
      const { data: visitors, error } = await supabase
        .from('attendance_visitor')
        .select(`
          *,
          visits:attendance_visitor_visits (
            id,
            visitor_status,
            reason_for_visit,
            employee_to_visit,
            created_at,
            employees:employee_to_visit (
              name,
              email
            )
          )
        `)
        .eq('tenant_id', tenantId)
        .order('last_visit_at', { ascending: false });

      if (error) throw error;

      const { data: timestamps } = await supabase
        .from('attendance_visitor_timestamp')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('timestamp', { ascending: false });

      // 2. Flatten mapping so the UI functions exactly as before
      const visitorsWithDetails: any[] = (visitors || []).map(v => {
        // Find the absolute latest visit context for this person
        const sortedVisits = (v.visits || []).sort((a: any, b: any) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        const latestVisit = sortedVisits[0];

        return {
          ...v,
          current_visit_id: latestVisit?.id, // Store for updates!
          visitor_status: latestVisit?.visitor_status || 'pending',
          reason_for_visit: latestVisit?.reason_for_visit,
          employee_to_visit: latestVisit?.employee_to_visit,
          employee_name: latestVisit?.employees?.name,
          employee_email: latestVisit?.employees?.email,
          latest_timestamp: timestamps?.find(t => t.visitor_id === v.id),
        };
      });

      set({ visitors: visitorsWithDetails, loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  },

  fetchVisitorTimestamps: async (tenantId: string, visitorId?: string) => {
    set({ loading: true, error: null });
    try {
      let query = supabase
        .from('attendance_visitor_timestamp')
        .select('*')
        .eq('tenant_id', tenantId);

      if (visitorId) query = query.eq('visitor_id', visitorId);

      const { data, error } = await query.order('timestamp', { ascending: false });
      if (error) throw error;
      set({ timestamps: data || [], loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  },

  // ... (Other fetch methods remain exactly the same: Approvals, Notifications, Settings) ...
  fetchVisitorApprovals: async (tenantId: string) => {
    set({ loading: true, error: null });
    try {
      const { data, error } = await supabase.from('visitor_approvals').select('*').eq('tenant_id', tenantId).order('approved_at', { ascending: false });
      if (error) throw error;
      set({ approvals: data || [], loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  },

  fetchVisitorNotifications: async (tenantId: string, employeeId: string) => {
    set({ loading: true, error: null });
    try {
      const { data, error } = await supabase.from('visitor_notifications').select('*').eq('tenant_id', tenantId).eq('employee_id', employeeId).order('created_at', { ascending: false });
      if (error) throw error;
      set({ notifications: data || [], loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  },

  fetchVisitorSettings: async (tenantId: string) => {
    set({ loading: true, error: null });
    try {
      const { data, error } = await supabase.from('visitor_settings').select('*').eq('tenant_id', tenantId).single();
      if (error && error.code !== 'PGRST116') throw error;

      if (!data) {
        const { data: newSettings, error: createError } = await supabase
          .from('visitor_settings')
          .insert({
            tenant_id: tenantId,
            enable_employee_notifications: true,
            require_employee_approval: true,
            require_exit_confirmation: true,
            allow_automatic_entry: false,
            face_match_threshold: 0.60,
          })
          .select().single();
        if (createError) throw createError;
        set({ settings: newSettings, loading: false });
      } else {
        set({ settings: data, loading: false });
      }
    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  },

  createVisitor: async (tenantId: string, faceDescriptor: any, imageData?: Uint8Array) => {
    set({ loading: true, error: null });
    try {
      const visitorData: any = {
        tenant_id: tenantId,
        face_descriptor: faceDescriptor,
      };

      if (imageData) visitorData.visitor_image_data = imageData;

      // 1. Create Profile
      const { data: visitor, error: visitorError } = await supabase
        .from('attendance_visitor')
        .insert(visitorData)
        .select()
        .single();

      if (visitorError) throw visitorError;

      // 2. Immediately insert their FIRST visit row
      await supabase.from('attendance_visitor_visits').insert({
        visitor_id: visitor.id,
        tenant_id: tenantId,
        visitor_status: 'pending'
      });

      set({ loading: false });
      return visitor;
    } catch (error: any) {
      set({ error: error.message, loading: false });
      return null;
    }
  },

  createNewVisit: async (tenantId: string, visitorId: string) => {
    set({ loading: true, error: null });
    try {
      const visitor = get().visitors.find(v => v.id === visitorId);
      const currentCount = visitor?.visit_count || 0;

      // 1. Update overall profile metrics
      await supabase.from('attendance_visitor').update({
        visit_count: currentCount + 1,
        last_visit_at: new Date().toISOString()
      }).eq('id', visitorId);

      // 2. Spin up a new Visit Context row
      await supabase.from('attendance_visitor_visits').insert({
        visitor_id: visitorId,
        tenant_id: tenantId,
        visitor_status: 'pending'
      });

      await get().fetchVisitors(tenantId);
      set({ loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  updateVisitorDetails: async (visitorId: string, data: VisitorFormData) => {
    set({ loading: true, error: null });
    try {
      const visitor: any = get().visitors.find(v => v.id === visitorId);
      const visitId = visitor?.current_visit_id;

      // 1. Update the Permanent Profile
      const { error: profileError } = await supabase
        .from('attendance_visitor')
        .update({
          visitor_name: data.visitor_name,
          email: data.email || null,
          phone_number: data.phone_number || null,
        })
        .eq('id', visitorId);

      if (profileError) throw profileError;

      // 2. Update the Current Visit Context (keep status as-is; do NOT auto-approve here)
      if (visitId) {
        const { error: visitError } = await supabase
          .from('attendance_visitor_visits')
          .update({
            employee_to_visit: data.employee_to_visit || null,
            reason_for_visit: data.reason_for_visit || null,
          })
          .eq('id', visitId);

        if (visitError) throw visitError;
      }

      set({ loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  submitVisitorForApproval: async (visitorId: string) => {
    set({ loading: true, error: null });
    try {
      // Fetch fresh visit data directly from DB — never rely on potentially stale local state
      const { data: visitorRow, error: visitorFetchError } = await supabase
        .from('attendance_visitor')
        .select('visitor_name, tenant_id')
        .eq('id', visitorId)
        .single();
      if (visitorFetchError) throw visitorFetchError;

      // Get the latest visit for this visitor to find employee_to_visit
      const { data: visitRow, error: visitFetchError } = await supabase
        .from('attendance_visitor_visits')
        .select('id, employee_to_visit')
        .eq('visitor_id', visitorId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (visitFetchError) throw visitFetchError;

      // Update the visit status to verification_pending
      if (visitRow?.id) {
        const { error } = await supabase
          .from('attendance_visitor_visits')
          .update({ visitor_status: 'verification_pending' })
          .eq('id', visitRow.id);
        if (error) throw error;
      }

      // Send notification only if an employee is assigned
      const settings = get().settings;
      if (visitRow?.employee_to_visit && (settings?.enable_employee_notifications ?? true)) {
        await supabase.from('visitor_notifications').insert({
          tenant_id: visitorRow.tenant_id,
          visitor_id: visitorId,
          employee_id: visitRow.employee_to_visit,
          notification_type: 'pending_approval',
          message: `Visitor ${visitorRow.visitor_name || 'Unknown'} is waiting for your approval.`,
        });
      }

      set({ loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  // ... (createVisitorTimestamp and updateVisitorClockOut remain unchanged as they hit the separate timestamp table) ...
  createVisitorTimestamp: async (tenantId: string, visitorId: string) => {
    set({ loading: true, error: null });
    try {
      const lastTimestamp = get().timestamps.find(t => t.visitor_id === visitorId);
      const isClockingOut = lastTimestamp?.entry?.toUpperCase() === 'IN';

      if (isClockingOut) {
        const { error } = await supabase.from('attendance_visitor_timestamp').insert({ tenant_id: tenantId, visitor_id: visitorId, entry: 'OUT' });
        if (error) throw error;

        const settings = get().settings;
        if (settings?.require_exit_confirmation ?? true) {
          const visitor = get().visitors.find(v => v.id === visitorId);
          if (visitor?.employee_to_visit) {
            await supabase.from('visitor_notifications').insert({
              tenant_id: tenantId,
              visitor_id: visitorId,
              employee_id: visitor.employee_to_visit,
              notification_type: 'confirmation_required',
              message: `${visitor.visitor_name || 'A visitor'} has left. Please confirm their exit.`,
            });
          }
        }
      } else {
        const { error } = await supabase.from('attendance_visitor_timestamp').insert({ tenant_id: tenantId, visitor_id: visitorId, entry: 'IN' });
        if (error) throw error;
      }

      await get().fetchVisitorTimestamps(tenantId);
      set({ loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  updateVisitorClockOut: async (timestampId: string, tenantId?: string, visitorId?: string) => {
    set({ loading: true, error: null });
    try {
      let vId = visitorId; let tId = tenantId;
      if (!vId || !tId) {
        const { data: tsData } = await supabase.from('attendance_visitor_timestamp').select('visitor_id, tenant_id').eq('id', timestampId).single();
        if (tsData) { vId = tsData.visitor_id; tId = tsData.tenant_id; }
      }
      if (!vId || !tId) throw new Error("Could not determine visitor context for clock out.");

      const { error } = await supabase.from('attendance_visitor_timestamp').insert({ tenant_id: tId, visitor_id: vId, entry: 'OUT' });
      if (error) throw error;

      const settings = get().settings;
      if (settings?.require_exit_confirmation ?? true) {
        const visitor = get().visitors.find(v => v.id === vId);
        if (visitor?.employee_to_visit) {
          await supabase.from('visitor_notifications').insert({
            tenant_id: tId,
            visitor_id: vId,
            employee_id: visitor.employee_to_visit,
            notification_type: 'confirmation_required',
            message: `${visitor.visitor_name || 'A visitor'} has left. Please confirm their exit.`,
          });
        }
      }
      await get().fetchVisitorTimestamps(tId);
      set({ loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  confirmVisitorExit: async (request: VisitorConfirmationRequest, userId: string) => {
    set({ loading: true, error: null });
    try {
      // Always fetch the latest visit from DB — never rely on stale local state
      const { data: latestVisit } = await supabase
        .from('attendance_visitor_visits')
        .select('id, visitor_status')
        .eq('visitor_id', request.visitor_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const currentVisitId = latestVisit?.id;

      if (request.confirmed) {
        const outPayload: any = { visitor_id: request.visitor_id, entry: 'OUT' };
        if (request.tenant_id) outPayload.tenant_id = request.tenant_id;
        await supabase.from('attendance_visitor_timestamp').insert(outPayload);

        // Update specific visit to exited
        if (currentVisitId) {
          await supabase.from('attendance_visitor_visits').update({ visitor_status: 'exited' }).eq('id', currentVisitId);
        }
      } else {
        // Denied — visit reverts to approved
        if (currentVisitId) {
          await supabase.from('attendance_visitor_visits').update({ visitor_status: 'approved' }).eq('id', currentVisitId);
        }
      }

      await supabase.from('visitor_notifications').update({ is_read: true, read_at: new Date().toISOString() }).eq('visitor_id', request.visitor_id).eq('notification_type', 'confirmation_required');

      if (request.tenant_id) await get().fetchVisitorTimestamps(request.tenant_id);
      set({ loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  approveOrRejectVisitor: async (tenantId: string, employeeId: string, request: VisitorApprovalRequest, userId: string) => {
    set({ loading: true, error: null });
    try {
      const visitor: any = get().visitors.find(v => v.id === request.visitor_id);
      const newStatus = request.action === 'approved' ? 'approved' : 'rejected';

      if (visitor?.current_visit_id) {
        await supabase.from('attendance_visitor_visits').update({ visitor_status: newStatus }).eq('id', visitor.current_visit_id);
      }

      await supabase.from('visitor_approvals').insert({
        tenant_id: tenantId, visitor_id: request.visitor_id, employee_id: employeeId,
        action: request.action, reason: request.reason, approved_by: userId,
      });

      const settings = get().settings;
      if (settings?.enable_employee_notifications ?? true) {
        await supabase.from('visitor_notifications').insert({
          tenant_id: tenantId, visitor_id: request.visitor_id, employee_id: employeeId,
          notification_type: request.action === 'approved' ? 'approved' : 'rejected', message: `Visitor request has been ${request.action}`,
        });
      }
      set({ loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  // ... (Utility functions remain identical)
  markNotificationAsRead: async (notificationId: string) => {
    try { await supabase.from('visitor_notifications').update({ is_read: true, read_at: new Date().toISOString() }).eq('id', notificationId); } catch (e) { }
  },
  markAllNotificationsAsRead: async (employeeId: string) => {
    try { await supabase.from('visitor_notifications').update({ is_read: true, read_at: new Date().toISOString() }).eq('employee_id', employeeId).eq('is_read', false); } catch (e) { }
  },
  updateVisitorSettings: async (tenantId: string, settings: Partial<VisitorSettings>) => {
    set({ loading: true, error: null });
    try {
      await supabase.from('visitor_settings').upsert({ ...settings, tenant_id: tenantId }, { onConflict: 'tenant_id' });
      await get().fetchVisitorSettings(tenantId);
      set({ loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false }); throw error;
    }
  },
  findSimilarVisitor: async (tenantId: string, faceDescriptor: any, threshold?: number) => {
    try {
      const { data: visitors } = await supabase.from('attendance_visitor').select('*').eq('tenant_id', tenantId);
      const matchThreshold = threshold || get().settings?.face_match_threshold || 0.60;
      for (const visitor of visitors || []) {
        if (calculateFaceSimilarity(faceDescriptor, visitor.face_descriptor) >= matchThreshold) return visitor;
      }
      return null;
    } catch (e) { return null; }
  },
  deleteVisitor: async (visitorId: string) => {
    set({ loading: true, error: null });
    try {
      // Delete all related history first to avoid foreign key constraints and clear logs
      await supabase.from('attendance_visitor_timestamp').delete().eq('visitor_id', visitorId);
      await supabase.from('attendance_visitor_visits').delete().eq('visitor_id', visitorId);
      await supabase.from('visitor_approvals').delete().eq('visitor_id', visitorId);
      await supabase.from('visitor_notifications').delete().eq('visitor_id', visitorId);

      // Finally, delete the actual visitor profile
      await supabase.from('attendance_visitor').delete().eq('id', visitorId);

      set(state => ({
        visitors: state.visitors.filter(v => v.id !== visitorId),
        timestamps: state.timestamps.filter(t => t.visitor_id !== visitorId),
        loading: false
      }));
    } catch (error: any) {
      set({ error: error.message, loading: false }); throw error;
    }
  },
}));

function calculateFaceSimilarity(descriptor1: any, descriptor2: any): number {
  try {
    if (!descriptor1 || !descriptor2) return 0;
    const arr1 = Array.isArray(descriptor1) ? descriptor1 : Object.values(descriptor1);
    const arr2 = Array.isArray(descriptor2) ? descriptor2 : Object.values(descriptor2);
    if (arr1.length !== arr2.length) return 0;

    let dotProduct = 0, mag1 = 0, mag2 = 0;
    for (let i = 0; i < arr1.length; i++) {
      dotProduct += arr1[i] * arr2[i];
      mag1 += arr1[i] * arr1[i];
      mag2 += arr2[i] * arr2[i];
    }
    mag1 = Math.sqrt(mag1);
    mag2 = Math.sqrt(mag2);
    if (mag1 === 0 || mag2 === 0) return 0;
    return ((dotProduct / (mag1 * mag2)) + 1) / 2;
  } catch (error) { return 0; }
}