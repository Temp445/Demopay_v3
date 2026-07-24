import { supabase } from './supabase';
import type {
  WorkLocation,
  WorkLocationTracking,
  WorkLocationViolation,
  WorkLocationNotification,
  CreateWorkLocationInput,
  UpdateWorkLocationInput,
  GPSCoordinates,
  JourneyEventType,
  JourneyTrackingLog,
} from '../types/workLocation';
import { gpsTrackingService } from './gpsTracking';

async function sendWorkEventNotification(
  workLocationId: string,
  notificationType: string,
  actionText: string
) {
  try {
    const { data: workLocation } = await supabase
      .from('work_locations')
      .select('tenant_id, employee_id, location_name, assigned_by')
      .eq('id', workLocationId)
      .maybeSingle();

    if (!workLocation) return;

    const { data: employee } = await supabase
      .from('employees')
      .select('name, user_id')
      .eq('id', workLocation.employee_id)
      .maybeSingle();

    const employeeName = employee?.name || 'An employee';
    const recipients: string[] = [];

    if (workLocation.assigned_by) {
      recipients.push(workLocation.assigned_by);
    }

    if (employee?.user_id && !recipients.includes(employee.user_id)) {
      recipients.push(employee.user_id);
    }

    for (const recipientId of recipients) {
      await supabase.from('work_location_notifications').insert({
        tenant_id: workLocation.tenant_id,
        work_location_id: workLocationId,
        recipient_user_id: recipientId,
        notification_type: notificationType,
        message: `${employeeName} ${actionText} at "${workLocation.location_name}".`,
      });
    }
  } catch (err) {
    console.error('Failed to send work event notification:', err);
  }
}

export async function getWorkLocations(tenantId: string): Promise<WorkLocation[]> {
  const { data, error } = await supabase
    .from('work_locations')
    .select(`
      *,
      employees!inner (
        name,
        email
      )
    `)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data || []).map((item: any) => ({
    ...item,
    employee_name: item.employees?.name,
    employee_email: item.employees?.email,
  }));
}

export async function getEmployeeWorkLocations(
  tenantId: string,
  employeeId: string
): Promise<WorkLocation[]> {
  const { data, error } = await supabase
    .from('work_locations')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('employee_id', employeeId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getActiveWorkLocation(
  tenantId: string,
  employeeId: string
): Promise<WorkLocation | null> {
  const { data, error } = await supabase
    .from('work_locations')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('employee_id', employeeId)
    .in('status', ['assigned', 'in_progress', 'paused'])
    .order('created_at', { ascending: false})
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function createWorkLocation(
  tenantId: string,
  userId: string,
  input: CreateWorkLocationInput
): Promise<WorkLocation> {
  const { data, error } = await supabase
    .from('work_locations')
    .insert({
      tenant_id: tenantId,
      assigned_by: userId,
      ...input,
    })
    .select()
    .single();

  if (error) throw error;

  const { data: employee } = await supabase
    .from('employees')
    .select('user_id, name')
    .eq('id', input.employee_id)
    .maybeSingle();

  if (employee?.user_id) {
    await supabase.from('work_location_notifications').insert({
      tenant_id: tenantId,
      work_location_id: data.id,
      recipient_user_id: employee.user_id,
      notification_type: 'assignment',
      message: `You have been assigned a new work location: ${input.location_name}.`,
    });
  }

  return data;
}

export async function updateWorkLocation(
  workLocationId: string,
  updates: any
): Promise<WorkLocation> {
  const { data, error } = await supabase
    .from('work_locations')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', workLocationId)
    .select(`
      *,
      employees!inner (
        name,
        email
      )
    `)
    .single();

  if (error) throw error;
  
  // Format the returned data to match your interface
  return {
    ...data,
    employee_name: data.employees?.name,
    employee_email: data.employees?.email,
  };
}
// Add this to your lib/workLocations.ts (or update the existing one)
export const cancelWorkLocation = async (workLocationId: string, reason: string) => {
  const { data: existing } = await supabase
    .from('work_locations')
    .select('tenant_id, employee_id, location_name')
    .eq('id', workLocationId)
    .maybeSingle();

  const { data, error } = await supabase
    .from('work_locations')
    .update({
      status: 'cancelled',
      cancel_reason: reason,
      updated_at: new Date().toISOString()
    })
    .eq('id', workLocationId)
    .select()
    .single();

  if (error) throw error;

  if (existing) {
    const { data: employee } = await supabase
      .from('employees')
      .select('user_id')
      .eq('id', existing.employee_id)
      .maybeSingle();

    if (employee?.user_id) {
      await supabase.from('work_location_notifications').insert({
        tenant_id: existing.tenant_id,
        work_location_id: workLocationId,
        recipient_user_id: employee.user_id,
        notification_type: 'cancellation',
        message: `Your work location assignment "${existing.location_name}" has been cancelled. Reason: ${reason}`,
      });
    }
  }

  return data;
}

export async function completeWork(workLocationId: string, reason: string): Promise<WorkLocation> {
  const { data, error } = await supabase
    .from('work_locations')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      complete_reason: reason
    })
    .eq('id', workLocationId)
    .select()
    .single();

  if (error) throw error;

  await sendWorkEventNotification(workLocationId, 'work_completed', 'has completed work');

  return data;
}

export async function pauseWork(workLocationId: string, reason: string): Promise<WorkLocation> {
  const { data: location, error: locError } = await supabase
    .from('work_locations')
    .update({ status: 'paused' })
    .eq('id', workLocationId)
    .select()
    .single();

  if (locError) throw locError;

  const { error: pauseError } = await supabase
    .from('work_location_pauses')
    .insert({
      work_location_id: workLocationId,
      pause_reason: reason,
      paused_at: new Date().toISOString()
    });

  if (pauseError) throw pauseError;

  await sendWorkEventNotification(workLocationId, 'work_paused', `has paused work. Reason: ${reason}`);

  return location;
}

export async function resumeWork(workLocationId: string): Promise<WorkLocation> {
  const { data: location, error: locError } = await supabase
    .from('work_locations')
    .update({ status: 'in_progress' })
    .eq('id', workLocationId)
    .select()
    .single();

  if (locError) throw locError;

  const { error: pauseError } = await supabase
    .from('work_location_pauses')
    .update({ resumed_at: new Date().toISOString() })
    .eq('work_location_id', workLocationId)
    .is('resumed_at', null);

  if (pauseError) throw pauseError;

  await sendWorkEventNotification(workLocationId, 'work_resumed', 'has resumed work');

  return location;
}

export async function getWorkPauses(workLocationId: string) {
  const { data, error } = await supabase
    .from('work_location_pauses')
    .select('*')
    .eq('work_location_id', workLocationId)
    .order('paused_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function startWork(workLocationId: string): Promise<WorkLocation> {
  const updated = await updateWorkLocation(workLocationId, {
    status: 'in_progress',
    started_at: new Date().toISOString(),
  });

  await sendWorkEventNotification(workLocationId, 'work_started', 'has started work');

  return updated;
}

// export async function completeWork(workLocationId: string): Promise<WorkLocation> {
//   return updateWorkLocation(workLocationId, {
//     status: 'completed',
//     completed_at: new Date().toISOString(),
//   });
// }

export async function approveWork(
  workLocationId: string,
  userId: string,
  workAmount?: number,
  workAmountUnit?: string
): Promise<WorkLocation> {
  return updateWorkLocation(workLocationId, {
    status: 'approved',
    approved_at: new Date().toISOString(),
    approved_by: userId,
    work_amount: workAmount,
    work_amount_unit: workAmountUnit,
  });
}

// export async function cancelWorkLocation(workLocationId: string): Promise<WorkLocation> {
//   return updateWorkLocation(workLocationId, {
//     status: 'cancelled',
//   });
// }

export async function recordTracking(
  tenantId: string,
  workLocationId: string,
  employeeId: string,
  position: GPSCoordinates,
  workLocation: WorkLocation,
  batteryLevel?: number,
  radiusMonitoringEnabled: boolean = true
): Promise<WorkLocationTracking> {
  const distance = gpsTrackingService.calculateDistance(
    position.latitude,
    position.longitude,
    workLocation.latitude,
    workLocation.longitude
  );

  const { data, error } = await supabase
    .from('work_location_tracking')
    .insert({
      tenant_id: tenantId,
      work_location_id: workLocationId,
      employee_id: employeeId,
      latitude: position.latitude,
      longitude: position.longitude,
      accuracy: position.accuracy,
      speed_ms: position.speed_ms ?? null,
      distance_from_center: radiusMonitoringEnabled ? distance : null,
      is_within_radius: radiusMonitoringEnabled ? distance <= workLocation.allowed_radius_meters : true,
      battery_level: batteryLevel,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function logJourneyEvent(
  tenantId: string,
  employeeId: string,
  eventType: JourneyEventType,
  position: GPSCoordinates | null,
  workLocationId?: string,
  batteryLevel?: number
): Promise<JourneyTrackingLog> {
  const payload: any = {
    tenant_id: tenantId,
    employee_id: employeeId,
    event_type: eventType,
    latitude: position?.latitude || null,
    longitude: position?.longitude || null,
    accuracy: position?.accuracy || null,
    speed_ms: position?.speed_ms ?? null,
    battery_level: batteryLevel,
  };

  if (workLocationId) {
    payload.work_location_id = workLocationId;
  }

  const { data, error } = await supabase
    .from('journey_tracking_logs')
    .insert(payload)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getTodayJourneyLogs(
  tenantId: string,
  employeeId: string
): Promise<JourneyTrackingLog[]> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('journey_tracking_logs')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('employee_id', employeeId)
    .gte('timestamp', startOfDay.toISOString())
    .order('timestamp', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function getTrackingHistory(
  workLocationId: string,
  limit: number = 100
): Promise<WorkLocationTracking[]> {
  const { data, error } = await supabase
    .from('work_location_tracking')
    .select('*')
    .eq('work_location_id', workLocationId)
    .order('recorded_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

export async function getViolations(
  tenantId: string,
  workLocationId?: string
): Promise<WorkLocationViolation[]> {
  let query = supabase
    .from('work_location_violations')
    .select(`
      *,
      employees!inner (
        name
      ),
      work_locations!inner (
        location_name
      )
    `)
    .eq('tenant_id', tenantId);

  if (workLocationId) {
    query = query.eq('work_location_id', workLocationId);
  }

  const { data, error } = await query.order('violated_at', { ascending: false });

  if (error) throw error;

  return (data || []).map((item: any) => ({
    ...item,
    employee_name: item.employees?.name,
    location_name: item.work_locations?.location_name,
  }));
}

export async function getWorkLocationNotifications(
  tenantId: string,
  userId: string
): Promise<WorkLocationNotification[]> {
  const { data, error } = await supabase
    .from('work_location_notifications')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('recipient_user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;
  return data || [];
}

export async function markNotificationAsRead(notificationId: string): Promise<void> {
  const { error } = await supabase
    .from('work_location_notifications')
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
    })
    .eq('id', notificationId);

  if (error) throw error;
}

export async function deleteWorkLocation(workLocationId: string): Promise<void> {
  const { error } = await supabase
    .from('work_locations')
    .delete()
    .eq('id', workLocationId);

  if (error) throw error;
}

export const denyWorkLocation = async (workLocationId: string, reason: string) => {
  const { data, error } = await supabase
    .from('work_locations')
    .update({ 
      status: 'denied', 
      cancel_reason: reason, // Reusing cancel_reason to store why it was denied
      updated_at: new Date().toISOString() 
    })
    .eq('id', workLocationId)
    .select()
    .single();

  if (error) throw error;
  return data;
}