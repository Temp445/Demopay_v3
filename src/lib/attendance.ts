import { supabase } from './supabase';
import { getTenantId } from './tenantDb';

export interface AttendanceLog {
  id: string;
  employee_id: string;
  date: string;
  clock_in: string | null;
  clock_out: string | null;
  status: 'Present' | 'Absent' | 'Late' | 'Half Day';
  notes: string | null;
  verification_method?: 'manual' | 'face_recognition' | 'fallback';
  face_confidence?: number;
  tenant_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface AttendanceSettings {
  id: string;
  name: string;
  description: string | null;
  clock_in_start: string;
  clock_in_end: string;
  clock_out_start: string;
  clock_out_end: string;
  late_threshold_minutes: number;
  half_day_threshold_minutes: number;
  is_active: boolean;
  tenant_id?: string;
}

export interface ShiftAttendanceSettings {
  clock_in_start: string;
  clock_in_end: string;
  clock_out_start: string;
  clock_out_end: string;
  late_threshold_minutes: number;
  half_day_threshold_minutes: number;
}

export async function getAttendanceRecords(
  employee_id: string,
  start_date: string,
  end_date: string
): Promise<AttendanceLog[]> {
  if (!employee_id) return [];

  const tenantId = await getTenantId();
  const { data, error } = await supabase
    .from('attendance_logs')
    .select('*')
    .eq('employee_id', employee_id)
    .eq('tenant_id', tenantId)
    .gte('date', start_date)
    .lte('date', end_date)
    .order('date', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

export async function getAttendanceSettings(): Promise<AttendanceSettings> {
  const tenantId = await getTenantId();
  const { data, error } = await supabase
    .from('attendance_settings')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function updateAttendanceSettings(
  settings: Partial<AttendanceSettings>
): Promise<AttendanceSettings> {
  const tenantId = await getTenantId();
  const { data, error } = await supabase
    .from('attendance_settings')
    .update(settings)
    .eq('tenant_id', tenantId)
    .eq('id', settings.id)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function getShiftAttendanceSettings(
  shift_id: string,
  date: string
): Promise<ShiftAttendanceSettings> {
  const tenantId = await getTenantId();
  const { data, error } = await supabase.rpc('get_shift_attendance_settings', {
    p_shift_id: shift_id,
    p_date: date,
    p_tenant_id:tenantId
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data || data.length === 0) {
    throw new Error('Shift attendance settings not found');
  }

  return data[0];
}

export async function updateShiftAttendanceSettings(
  shift_id: string,
  settings: {
    clock_in_start_offset: string;
    clock_in_end_offset: string;
    clock_out_start_offset: string;
    clock_out_end_offset: string;
    late_threshold_minutes: number;
    half_day_threshold_minutes: number;
  }
): Promise<void> {
  const tenantId = await getTenantId();
  const { data, error } = await supabase.rpc(
    'update_shift_attendance_settings',
    {
      p_clock_in_end: settings.clock_in_end_offset,
      p_clock_in_start: settings.clock_in_start_offset,
      p_clock_out_end: settings.clock_out_end_offset,
      p_clock_out_start: settings.clock_out_start_offset,
      p_half_day_threshold_minutes: settings.half_day_threshold_minutes,
      p_late_threshold_minutes: settings.late_threshold_minutes,
      p_shift_id: shift_id,
      p_tenant_id:tenantId
    }
  );

  if (error) {
    throw new Error(error.message);
  }
}

export async function clockIn(
  employee_id: string,
  shift_id: string,
  customTime?: Date,
  notes?: string,
  user_id?: string,
  verificationMethod: 'manual' | 'face_recognition' | 'fallback' = 'manual',
  faceConfidence?: number
): Promise<AttendanceLog> {
  const now = customTime || new Date();
  const today = now.toISOString().split('T')[0];
  const clockInTime = now.toISOString();
  const tenantId = await getTenantId();

  // Check if there's already an attendance record for today
  const { data: existingRecord, error: fetchError } = await supabase
    .from('attendance_logs')
    .select('*')
    .eq('employee_id', employee_id)
    .eq('date', today)
    .eq('tenant_id', tenantId)
    .single();

  if (fetchError && fetchError.code !== 'PGRST116') {
    throw new Error(fetchError.message);
  }

  if (existingRecord) {
    throw new Error('Already clocked in for today');
  }

  // Get shift-specific attendance settings
  const settings = await getShiftAttendanceSettings(shift_id, today);

  // Parse current time and settings
  const currentTime = now.getHours() * 60 + now.getMinutes();
  const [inStartHour, inStartMin] = settings.clock_in_start
    .split(':')
    .map(Number);
  const [inEndHour, inEndMin] = settings.clock_in_end.split(':').map(Number);
  const clockInStartMinutes = inStartHour * 60 + inStartMin;
  const clockInEndMinutes = inEndHour * 60 + inEndMin;

  // Check if clock in is within allowed window (skip for manual entries)
  if (
    !customTime &&
    (currentTime < clockInStartMinutes || currentTime > clockInEndMinutes)
  ) {
    throw new Error(
      `Clock in only allowed between ${settings.clock_in_start} and ${settings.clock_in_end}`
    );
  }

  // Determine status based on settings
  const minutesLate = currentTime - clockInStartMinutes;
  const status =
    minutesLate <= settings.late_threshold_minutes ? 'Present' : 'Late';

  // Get user's tenant_id
  const { data: tenantData } = await supabase.rpc('get_user_tenant_id');
  const tenant_id = tenantData;

  if (!tenant_id) {
    throw new Error('User is not associated with a tenant');
  }

  // Prepare notes with verification method
  const finalNotes = notes
    ? `${notes}; Verified via ${verificationMethod}`
    : `Verified via ${verificationMethod}`;

  // Create new attendance record
  const { data, error } = await supabase
    .from('attendance_logs')
    .insert([
      {
        employee_id,
        date: today,
        clock_in: clockInTime,
        status,
        notes: finalNotes,
        created_by: user_id,
        verification_method: verificationMethod,
        face_confidence: faceConfidence,
        tenant_id: tenant_id,
      },
    ])
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function clockOut(
  employee_id: string,
  shift_id: string,
  customTime?: Date,
  notes?: string,
  verificationMethod: 'manual' | 'face_recognition' | 'fallback' = 'manual',
  faceConfidence?: number
): Promise<AttendanceLog> {
  const now = customTime || new Date();
  const today = now.toISOString().split('T')[0];
  const clockOutTime = now.toISOString();
  const tenantId = await getTenantId();

  // Get today's attendance record
  const { data: existingRecord, error: fetchError } = await supabase
    .from('attendance_logs')
    .select('*')
    .eq('employee_id', employee_id)
    .eq('date', today)
    .eq('tenant_id', tenantId)
    .single();

  if (fetchError) {
    throw new Error('No clock-in record found for today');
  }

  if (existingRecord.clock_out) {
    throw new Error('Already clocked out for today');
  }

  // Get shift-specific attendance settings
  const settings = await getShiftAttendanceSettings(shift_id, today);

  // Parse current time and settings
  const currentTime = now.getHours() * 60 + now.getMinutes();
  const [outStartHour, outStartMin] = settings.clock_out_start
    .split(':')
    .map(Number);
  const [outEndHour, outEndMin] = settings.clock_out_end.split(':').map(Number);
  const clockOutStartMinutes = outStartHour * 60 + outStartMin;
  const clockOutEndMinutes = outEndHour * 60 + outEndMin;

  // Check if clock out is within allowed window (skip for manual entries)
  if (
    !customTime &&
    (currentTime < clockOutStartMinutes || currentTime > clockOutEndMinutes)
  ) {
    throw new Error(
      `Clock out only allowed between ${settings.clock_out_start} and ${settings.clock_out_end}`
    );
  }

  // Calculate total hours worked
  const clockInTime = new Date(existingRecord.clock_in);
  const hoursWorked =
    (now.getTime() - clockInTime.getTime()) / (1000 * 60 * 60);

  // Update status based on settings
  const status =
    hoursWorked >= settings.half_day_threshold_minutes / 60
      ? existingRecord.status
      : 'Half Day';

  // Prepare notes with verification method
  let finalNotes = existingRecord.notes || '';
  if (notes) {
    finalNotes += finalNotes ? `; ${notes}` : notes;
  }
  finalNotes += `; Clock out verified via ${verificationMethod}`;

  // Update attendance record
  const { data, error } = await supabase
    .from('attendance_logs')
    .update({
      clock_out: clockOutTime,
      status,
      notes: finalNotes,
      verification_method: verificationMethod,
      face_confidence: faceConfidence
    })
    .eq('id', existingRecord.id)
    .eq('tenant_id', tenantId)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function updateAttendanceStatus(
  id: string,
  status: AttendanceLog['status'],
  notes?: string
): Promise<AttendanceLog> {
  const tenantId = await getTenantId();
  const { data, error } = await supabase
    .from('attendance_logs')
    .update({ status, notes })
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}