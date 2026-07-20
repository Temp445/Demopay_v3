import { supabase } from '../supabase';
import type { VisitorSettings } from '../../types/visitor'; 

export interface EmployeeFaceData {
  id: string;
  employee_id: string;
  face_descriptor: string;
  image_url?: string | null; 
  created_at?: string;
  updated_at?: string;
  last_used_at?: string | null;
  tenant_id?: string | null;
}

export class DatabaseService {

  // ─────────────────────────────────────────────────
  // Employee Face Data Management
  // ─────────────────────────────────────────────────

  async saveEmployeeFaceData(
    employeeId: string,
    descriptor: number[] | number[][],
    imageUrl: string | null = null, 
    tenantId?: string 
  ): Promise<boolean> {
    try {
      const payload: any = {
        employee_id: employeeId,
        face_descriptor: JSON.stringify(descriptor),
        image_url: imageUrl, 
      };

      if (tenantId) payload.tenant_id = tenantId;

      const { error } = await supabase
        .from('employee_face_data')
        .upsert(payload, { onConflict: 'employee_id' });

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error saving employee face data:', error);
      return false;
    }
  }

  async getEmployeeFaceData(employeeId: string): Promise<EmployeeFaceData | null> {
    try {
      const { data, error } = await supabase
        .from('employee_face_data')
        .select('*')
        .eq('employee_id', employeeId)
        .maybeSingle();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching employee face data:', error);
      return null;
    }
  }

  async getAllFaceData(tenantId: string | null) {
    try {
      const { data, error } = await supabase
        .from('employee_face_data')
        .select(`
          id,
          employee_id,
          face_descriptor,
          image_url,
          employees ( name )
        `);

      if (error) throw error;

      return (data || []).map((item: any) => {
        const emp = Array.isArray(item.employees) ? item.employees[0] : item.employees;
        return {
          id: item.id,
          employee_id: item.employee_id,
          employee_name: emp?.name || 'Unknown Employee',
          descriptor: this.parseDescriptor(item.face_descriptor),
          image_url: item.image_url,
        };
      });
    } catch (error) {
      console.error('Error fetching all face data:', error);
      return [];
    }
  }

  async deleteEmployeeFaceData(employeeId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('employee_face_data')
        .delete()
        .eq('employee_id', employeeId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error deleting face data:', error);
      return false;
    }
  }

  // ─────────────────────────────────────────────────
  // Employee Attendance Tracking
  // ─────────────────────────────────────────────────

  async getLastAttendance(employeeId: string) {
    try {
      const { data, error } = await supabase
        .from('attendance_timestamp')
        .select('*')
        .eq('employee_id', employeeId)
        .order('timestamp', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching last attendance:', error);
      return null;
    }
  }

async markAttendance(employeeId: string, entry: 'IN' | 'OUT', tenantId?: string, attendanceMode: string = 'Facial Recognition'): Promise<boolean> {
    try {
      // 1. Find the assigned shift for the employee for today
      // Formatting today's date to YYYY-MM-DD to match the schedule_date column
      const todayStr = new Date().toISOString().split('T')[0];
      
      const { data: shiftData, error: shiftError } = await supabase
        .from('shift_assignments')
        .select('shift_id')
        .eq('employee_id', employeeId)
        .eq('schedule_date', todayStr)
        .maybeSingle();

      if (shiftError) {
        console.warn('[DatabaseService] Could not fetch shift for attendance:', shiftError);
      }

      const insertPayload: any = {
        employee_id: employeeId,
        entry: entry,
        attendance_mode: attendanceMode,
      };

      // 3. Attach the shift_id if one was found for today
      if (shiftData?.shift_id) {
        insertPayload.shift_id = shiftData.shift_id;
      }

      // 4. Insert the attendance record
      const { error } = await supabase
        .from('attendance_timestamp')
        .insert(insertPayload);

      if (error) throw error;

      // ── AUTO-EXIT VISITORS (Unchanged Functionality) ──
      if (entry === 'OUT' && tenantId) {
        const { data: activeVisits } = await supabase
          .from('attendance_visitor_visits')
          .select(`
            id, 
            visitor_id,
            attendance_visitor ( visitor_name )
          `)
          .eq('employee_to_visit', employeeId)
          .eq('visitor_status', 'approved');

        if (activeVisits && activeVisits.length > 0) {
          console.log(`[DatabaseService] Employee clocked OUT. Auto-sending exit requests for ${activeVisits.length} visitors.`);
          
          for (const visit of activeVisits) {
            await supabase
              .from('attendance_visitor_visits')
              .update({ visitor_status: 'exited' })
              .eq('id', visit.id);
          }
        }
      }

      return true;
    } catch (error) {
      console.error('Error marking attendance:', error);
      return false;
    }
  }

  // ─────────────────────────────────────────────────
  // Visitor Operations
  // ─────────────────────────────────────────────────

  async getAllVisitorsFaceData(tenantId?: string | null) {
    try {
      let query = supabase
        .from('attendance_visitor')
        .select(`
          id, 
          face_descriptor, 
          visitor_name, 
          tenant_id,
          visits:attendance_visitor_visits ( visitor_status )
        `);

      if (tenantId) {
        query = query.eq('tenant_id', tenantId);
      }

      const { data, error } = await query;

      if (error) throw error;

      return (data || []).map((item: any) => {
        const latestStatus = item.visits && item.visits.length > 0 
          ? item.visits[item.visits.length - 1].visitor_status 
          : 'pending';

        return {
          id: item.id,
          user_id: item.id,
          user_name: item.visitor_name || 'Visitor',
          embedding: this.parseDescriptor(item.face_descriptor),
          type: 'visitor',
          visitor_status: latestStatus
        };
      });
    } catch (error) {
      console.error('Error fetching visitors:', error);
      return [];
    }
  }

  async createNewVisitor(
    descriptor: number[],
    base64Image: string | null, 
    tenantId?: string | null
  ) {
    try {
      const payload: any = {
        face_descriptor: JSON.stringify(descriptor), 
        visitor_image_data: base64Image || '', 
        visitor_image: base64Image,            
        visit_count: 1 
      };
      
      if (tenantId) payload.tenant_id = tenantId;

      const { data: newVisitor, error } = await supabase
        .from('attendance_visitor')
        .insert(payload)
        .select()
        .single();

      if (error) throw error;

      // B. Create their FIRST visit context row
      const { error: visitError } = await supabase.from('attendance_visitor_visits').insert({
        visitor_id: newVisitor.id,
        tenant_id: tenantId,
        visitor_status: 'pending' 
      });

      if (visitError) throw visitError;
      
      return newVisitor;
    } catch (error) {
      console.error('[DatabaseService] Error creating new visitor:', error);
      throw error;
    }
  }

  async recordVisitorPunch(visitorId: string, tenantId?: string | null): Promise<'IN' | 'OUT' | 'PENDING' | null> {
    try {
      const { data: existing, error: fetchError } = await supabase
        .from('attendance_visitor_timestamp')
        .select('entry, timestamp')
        .eq('visitor_id', visitorId)
        .order('timestamp', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fetchError && fetchError.code !== 'PGRST116') throw fetchError;

      let nextEntry: 'IN' | 'OUT' = 'IN';

      if (existing && existing.timestamp) {
        const recordDate = new Date(existing.timestamp);
        const today = new Date();
        
        if (
          recordDate.getDate() === today.getDate() &&
          recordDate.getMonth() === today.getMonth() &&
          recordDate.getFullYear() === today.getFullYear()
        ) {
          nextEntry = existing.entry === 'IN' ? 'OUT' : 'IN';
        }
      }

      // ── EXIT GATE (Check against attendance_visitor_visits) ──────────────────
      if (nextEntry === 'OUT' && tenantId) {
        const [visitorSettings, visitData] = await Promise.all([
          this.getVisitorSettings(tenantId),
          supabase
            .from('attendance_visitor_visits')
            .select('id, employee_to_visit, visitor_status, attendance_visitor(visitor_name)')
            .eq('visitor_id', visitorId)
            .order('created_at', { ascending: false })
            .limit(1)
            .single()
            .then(({ data }) => data),
        ]);

        const requireConfirmation = visitorSettings?.require_exit_confirmation ?? true;

        if (requireConfirmation && visitData?.employee_to_visit) {
          if (visitData.visitor_status === 'exit_pending') return 'PENDING'; // Still waiting

          if (visitData.visitor_status === 'approved') {
            await supabase.from('attendance_visitor_visits').update({ visitor_status: 'exit_pending' }).eq('id', visitData.id);

            const { error: notifError } = await supabase.from('visitor_notifications').insert({
                tenant_id: tenantId,
                visitor_id: visitorId,
                employee_id: visitData.employee_to_visit,
                notification_type: 'confirmation_required',
                message: `${(visitData.attendance_visitor as any)?.visitor_name || 'A visitor'} is trying to leave. Please confirm their exit.`,
              });

            if (notifError) console.error('Exit notification error:', notifError);
            return 'PENDING'; // Trigger Exit Approval flow on frontend
          }
        }
      }

      // ── Record the physical punch ──
      const payload: any = { visitor_id: visitorId, entry: nextEntry };
      if (tenantId) payload.tenant_id = tenantId;
      await supabase.from('attendance_visitor_timestamp').insert(payload);


      // ── RETURNING VISITOR LOGIC (Next Day / New Visit) ──
      if (nextEntry === 'IN' && tenantId) {
        // Fetch the most recent visit row to see if it's a new day or already concluded
        const { data: latestVisit } = await supabase
          .from('attendance_visitor_visits')
          .select('id, visitor_status, created_at')
          .eq('visitor_id', visitorId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const isNewDay = latestVisit ? new Date(latestVisit.created_at).toDateString() !== new Date().toDateString() : true;
        
        // If the visitor is clocking IN, and their last visit is closed, or it's a new day, auto-generate a new pending visit.
        const needsNewVisit = !latestVisit || latestVisit.visitor_status === 'exited' || latestVisit.visitor_status === 'rejected' || isNewDay;

        if (needsNewVisit) {
          // 1. Create a fresh visit row awaiting receptionist details
          await supabase.from('attendance_visitor_visits').insert({
            visitor_id: visitorId, 
            tenant_id: tenantId, 
            visitor_status: 'pending'
          });

          // 2. Increment the visit count and update last_visit_at in the profile
          const { data: profile } = await supabase.from('attendance_visitor').select('visit_count').eq('id', visitorId).single();
          await supabase.from('attendance_visitor').update({ 
              visit_count: (profile?.visit_count || 0) + 1, 
              last_visit_at: new Date().toISOString() 
          }).eq('id', visitorId);
        }
      }

      // Return standard 'IN' or 'OUT' so the UI doesn't break
      return nextEntry;
    } catch (error) {
      console.error('Error recording visitor punch:', error);
      return null;
    }
  }

  // ─────────────────────────────────────────────────
  // Global Settings
  // ─────────────────────────────────────────────────

  async getCompanySettings(tenantId?: string | null) {
    try {
      let query = supabase.from('company_settings').select('biometric_cooldown_minutes');
      if (tenantId) query = query.eq('tenant_id', tenantId);
      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      return data;
    } catch (error) { return null; }
  }

  async getVisitorSettings(tenantId: string): Promise<VisitorSettings | null> {
    try {
      const { data, error } = await supabase.from('visitor_settings').select('*').eq('tenant_id', tenantId).maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;
      return data || null;
    } catch (error) { return null; }
  }

  // ─────────────────────────────────────────────────
  // Utilities
  // ─────────────────────────────────────────────────

  private parseDescriptor(descriptorData: any): any[] {
    let parsed = descriptorData;
    if (typeof parsed === 'string') { try { parsed = JSON.parse(parsed); } catch { return []; } }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) parsed = Object.values(parsed);
    if (Array.isArray(parsed)) { if (Array.isArray(parsed[0])) return parsed[0]; return parsed; }
    return [];
  }
}

export const databaseService = new DatabaseService();