/**
 * Missed Punch Detector Service
 *
 * Pure detection logic — no side effects, no email sending.
 * Given a tenantId and date, returns employees with missing IN or OUT punches.
 */

import { supabase } from '../lib/supabase';

export type MissingPunchType = 'MISSING_IN' | 'MISSING_OUT';

export interface MissingPunchRecord {
  employee_id: string;
  employee_name: string;
  employee_email: string;
  employee_code: string | null;
  department: string | null;
  reporting_to: string[] | string | null;
  shift_name: string;
  shift_start_time: string;
  shift_end_time: string;
  missingType: MissingPunchType;
  date: string;
  clock_in_time?: string | null; // present when missingType === 'MISSING_OUT'
}

/**
 * Detects missing punches for all employees who have shift assignments on the given date.
 *
 * @param tenantId      - The tenant's UUID
 * @param date          - Date string in 'YYYY-MM-DD' format
 * @param graceBufferMinutes - Minutes after shift end before flagging a missing-out
 * @returns Array of MissingPunchRecord for employees with missing IN or OUT
 */
export async function detectMissingPunches(
  tenantId: string,
  date: string,
  graceBufferStartMinutes: number = 30,
  graceBufferEndMinutes: number = 30
): Promise<MissingPunchRecord[]> {
  // 1. Fetch all shift assignments for this tenant on this date
  const { data: assignments, error: assignErr } = await supabase
    .from('shift_assignments')
    .select(`
      employee_id,
      shift_id,
      shifts (
        id,
        name,
        start_time,
        end_time
      ),
      employees (
        id,
        name,
        email,
        employee_code,
        departments:department_id(name),
        reporting_to,
        status
      )
    `)
    .eq('tenant_id', tenantId)
    .eq('schedule_date', date);

  if (assignErr) {
    console.error('[MissedPunchDetector] Failed to fetch shift assignments:', assignErr);
    throw assignErr;
  }

  if (!assignments || assignments.length === 0) {
    return [];
  }

  // 2. Fetch all attendance timestamps for this tenant on this date (with a safe buffer window)
  const dayStart = new Date(`${date}T00:00:00.000Z`);
  dayStart.setTime(dayStart.getTime() - 24 * 60 * 60 * 1000); // go back 1 day to catch night shifts

  const dayEnd = new Date(`${date}T23:59:59.999Z`);
  dayEnd.setTime(dayEnd.getTime() + 24 * 60 * 60 * 1000); // extend 1 day forward for night shifts

  // Collect unique employee IDs from assignments
  const employeeIds = [...new Set((assignments as any[]).map((a: any) => a.employee_id))];

  const { data: timestamps, error: tsErr } = await supabase
    .from('attendance_timestamp')
    .select('employee_id, entry, timestamp')
    .in('employee_id', employeeIds)
    .gte('timestamp', dayStart.toISOString())
    .lte('timestamp', dayEnd.toISOString())
    .order('timestamp', { ascending: true });

  if (tsErr) {
    console.error('[MissedPunchDetector] Failed to fetch timestamps:', tsErr);
    throw tsErr;
  }

  // Group timestamps by employee_id
  const punchMap = new Map<string, { ins: Date[]; outs: Date[] }>();
  for (const ts of timestamps || []) {
    if (!punchMap.has(ts.employee_id)) {
      punchMap.set(ts.employee_id, { ins: [], outs: [] });
    }
    const bucket = punchMap.get(ts.employee_id)!;
    if (ts.entry === 'IN') {
      bucket.ins.push(new Date(ts.timestamp));
    } else {
      bucket.outs.push(new Date(ts.timestamp));
    }
  }

  const now = new Date();
  const results: MissingPunchRecord[] = [];

  for (const assignment of assignments as any[]) {
    const shift = assignment.shifts;
    const employee = assignment.employees;

    // Skip if no shift or employee data
    if (!shift || !employee) continue;

    // Only check active employees
    const activeStatuses = ['active', 'rejoin'];
    if (!activeStatuses.includes((employee.status || '').toLowerCase())) continue;

    const [year, month, day] = date.split('-').map(Number);

    // Parse shift start and end time
    const [startH, startM] = (shift.start_time || '00:00:00').split(':').map(Number);
    const [endH, endM] = (shift.end_time || '00:00:00').split(':').map(Number);

    const shiftStartOnDate = new Date(year, month - 1, day, startH, startM, 0);
    const shiftEndOnDate = new Date(year, month - 1, day, endH, endM, 0);

    // For night shifts (end_time < start_time), shift end is next day
    if (endH * 60 + endM < startH * 60 + startM) {
      shiftEndOnDate.setDate(shiftEndOnDate.getDate() + 1);
    }

    const graceStartEnd = new Date(shiftStartOnDate.getTime() + graceBufferStartMinutes * 60 * 1000);
    const graceEndEnd = new Date(shiftEndOnDate.getTime() + graceBufferEndMinutes * 60 * 1000);

    const punches = punchMap.get(assignment.employee_id) || { ins: [], outs: [] };
    const windowStart = new Date(shiftStartOnDate.getTime() - 2 * 60 * 60 * 1000); // 2h before shift

    // Filter punches
    // An IN punch can happen anytime after windowStart up to graceEndEnd (to catch late arrivals)
    const relevantIns = punches.ins.filter(t => t >= windowStart && t <= graceEndEnd);
    // Allow OUT punches up to the end grace period (or slightly after if they worked late, but effectively we just check if any out exists)
    // We can just use graceEndEnd as the upper bound for our filter.
    const relevantOuts = punches.outs.filter(t => t >= windowStart && t <= new Date(graceEndEnd.getTime() + 12 * 60 * 60 * 1000)); // any out punch after start up to 12h after shift

    const hasIn = relevantIns.length > 0;
    const hasOut = relevantOuts.length > 0;

    const baseRecord = {
      employee_id: employee.id,
      employee_name: employee.name,
      employee_email: employee.email,
      employee_code: employee.employee_code || null,
      department: employee.departments?.name || null,
      reporting_to: employee.reporting_to || null,
      shift_name: shift.name,
      shift_start_time: shift.start_time,
      shift_end_time: shift.end_time,
      date,
    };

    if (!hasIn && now > graceStartEnd) {
      results.push({
        ...baseRecord,
        missingType: 'MISSING_IN',
      });
    } else if (hasIn && !hasOut && now > graceEndEnd) {
      results.push({
        ...baseRecord,
        missingType: 'MISSING_OUT',
        clock_in_time: relevantIns[0].toISOString(),
      });
    }
    // If both IN and OUT exist → no problem
  }

  return results;
}
