import { supabase } from './supabase';

export interface GatePassValidation {
  hasGatePass: boolean;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled' | null;
  requestedStartTime: string | null;
  requestedEndTime: string | null;
  approvedStartTime: string | null;
  approvedEndTime: string | null;
  startDate: string | null;
  endDate: string | null;
  id: string | null;
  reason: string | null;
}

export interface PermissionValidation {
  hasPermission: boolean;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled' | null;
  requestedStartTime: string | null;
  requestedEndTime: string | null;
  startDate: string | null;
  endDate: string | null;
  id: string | null;
  reason: string | null;
}

export interface RequestValidationResult {
  gatePass: GatePassValidation;
  permission: PermissionValidation;
  hasPendingRequest: boolean;
  hasApprovedRequest: boolean;
  shouldAutoMarkPresent: boolean;
  requiresManualReview: boolean;
  statusOverride: string | null;
  reviewReason: string | null;
  requestType: 'gatepass' | 'permission' | 'both' | null;
}

export async function validateAttendanceRequests(
  tenantId: string,
  employeeId: string,
  date: string,
  clockIn: Date | null,
  clockOut: Date | null,
  shiftStartTime: string | null,
  shiftEndTime: string | null
): Promise<RequestValidationResult> {

  const result: RequestValidationResult = {
    gatePass: {
      hasGatePass: false,
      status: null,
      requestedStartTime: null,
      requestedEndTime: null,
      approvedStartTime: null,
      approvedEndTime: null,
      startDate: null,
      endDate: null,
      id: null,
      reason: null,
    },
    permission: {
      hasPermission: false,
      status: null,
      requestedStartTime: null,
      requestedEndTime: null,
      startDate: null,
      endDate: null,
      id: null,
      reason: null,
    },
    hasPendingRequest: false,
    hasApprovedRequest: false,
    shouldAutoMarkPresent: false,
    requiresManualReview: false,
    statusOverride: null,
    reviewReason: null,
    requestType: null,
  };

  try {
    // 1. Check for Gate Pass
    const { data: gatePasses } = await supabase
      .from('gate_pass_requests')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('employee_id', employeeId)
      .lte('start_date', date)
      .gte('end_date', date)
      .order('created_at', { ascending: false });

    if (gatePasses && gatePasses.length > 0) {
      const gatePass = gatePasses[0];
      result.gatePass = {
        hasGatePass: true,
        status: gatePass.status,
        requestedStartTime: gatePass.start_time,
        requestedEndTime: gatePass.end_time,
        approvedStartTime: gatePass.approved_start_time || gatePass.start_time,
        approvedEndTime: gatePass.approved_end_time || gatePass.end_time,
        startDate: gatePass.start_date,
        endDate: gatePass.end_date,
        id: gatePass.id,
        reason: gatePass.reason,
      };

      if (gatePass.status === 'pending') {
        result.hasPendingRequest = true;
      } else if (gatePass.status === 'approved') {
        result.hasApprovedRequest = true;
      }
    }

    // 2. Check for Permission
    const { data: permissions } = await supabase
      .from('employee_permissions')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('employee_id', employeeId)
      .lte('start_date', date)
      .gte('end_date', date)
      .order('created_at', { ascending: false });

    if (permissions && permissions.length > 0) {
      const permission = permissions[0];
      result.permission = {
        hasPermission: true,
        status: permission.status,
        requestedStartTime: permission.start_time,
        requestedEndTime: permission.end_time,
        startDate: permission.start_date,
        endDate: permission.end_date,
        id: permission.id,
        reason: permission.reason,
      };

      if (permission.status === 'pending') {
        result.hasPendingRequest = true;
      } else if (permission.status === 'approved') {
        result.hasApprovedRequest = true;
      }
    }

    if (result.gatePass.hasGatePass && result.permission.hasPermission) result.requestType = 'both';
    else if (result.gatePass.hasGatePass) result.requestType = 'gatepass';
    else if (result.permission.hasPermission) result.requestType = 'permission';

    if (result.hasPendingRequest) {
      result.statusOverride = 'Pending Approval';
      return result;
    }

    if (result.hasApprovedRequest && clockIn && shiftStartTime) {
      // 3. Combine allowed times safely
      const times: { start: string, end: string }[] = [];

      if (result.gatePass.hasGatePass && result.gatePass.status === 'approved') {
        const gpStart = result.gatePass.approvedStartTime || result.gatePass.requestedStartTime;
        const gpEnd = result.gatePass.approvedEndTime || result.gatePass.requestedEndTime;
        if (gpStart && gpEnd) times.push({ start: gpStart, end: gpEnd });
      }
      
      if (result.permission.hasPermission && result.permission.status === 'approved') {
        const permStart = result.permission.requestedStartTime;
        const permEnd = result.permission.requestedEndTime;
        if (permStart && permEnd) times.push({ start: permStart, end: permEnd });
      }

      if (times.length > 0) {
        // Find earliest start and latest end
        times.sort((a, b) => a.start.localeCompare(b.start));
        const combinedStartTime = times[0].start;
        const combinedEndTime = times.reduce((max, t) => (t.end > max ? t.end : max), times[0].end);

        // Validate using the combined timeframe
        const validation = validateTimeAlignment(
          clockIn,
          clockOut,
          shiftStartTime,
          shiftEndTime,
          { startTime: combinedStartTime, endTime: combinedEndTime }
        );

        if (validation.aligned) {
          result.shouldAutoMarkPresent = true;
          
          if (!validation.usedGrace) {
            // FIX 1: Normal Clock In/Out - Do not reduce balance
            result.statusOverride = 'Present';
          } else {
            // FIX 2: They utilized requested time. Check if Gate Pass ALONE covered it.
            let gatePassCovers = false;
            if (result.gatePass.hasGatePass && result.gatePass.status === 'approved') {
              const gpStart = result.gatePass.approvedStartTime || result.gatePass.requestedStartTime;
              const gpEnd = result.gatePass.approvedEndTime || result.gatePass.requestedEndTime;
              if (gpStart && gpEnd) {
                const gpValidation = validateTimeAlignment(clockIn, clockOut, shiftStartTime, shiftEndTime, { startTime: gpStart, endTime: gpEnd });
                if (gpValidation.aligned) gatePassCovers = true;
              }
            }

            if (gatePassCovers) {
              // They only used the Gate Pass, do not deduct Permission
              result.statusOverride = 'Present'; 
            } else if (result.permission.hasPermission && result.permission.status === 'approved') {
              // Permission was utilized, assign 'Permission' status so balance reduces
              result.statusOverride = 'Permission'; 
            } else {
              result.statusOverride = 'Present'; 
            }
          }
        } else {
          // FIX 3: Mismatch Gap - Enforce 'First Off' or 'Second Off' if the start/end is not covered
          result.requiresManualReview = false;
          result.reviewReason = validation.reason;
          result.statusOverride = validation.suggestedStatus || null; 
        }
      }
    }

  } catch (error) {
    console.error('Error validating attendance requests:', error);
  }

  return result;
}

interface TimeAlignmentResult {
  aligned: boolean;
  reason: string | null;
  usedGrace: boolean;
  suggestedStatus: string | null;
}

function validateTimeAlignment(
  clockIn: Date,
  clockOut: Date | null,
  shiftStartTime: string | null,
  shiftEndTime: string | null,
  request: { startTime: string | null; endTime: string | null }
): TimeAlignmentResult {
  if (!request.startTime || !request.endTime || !shiftStartTime) {
    return { aligned: false, reason: 'Missing time information for validation', usedGrace: false, suggestedStatus: null };
  }

  const formatTime = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = Math.floor(mins % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  };

  const grace = 10; // 10 minutes delay allowance

  const clockInTime = clockIn.getHours() * 60 + clockIn.getMinutes();
  const clockOutTime = clockOut ? clockOut.getHours() * 60 + clockOut.getMinutes() : null;

  const [reqStartHour, reqStartMin] = request.startTime.split(':').map(Number);
  const reqStartMinutes = reqStartHour * 60 + reqStartMin;

  const [reqEndHour, reqEndMin] = request.endTime.split(':').map(Number);
  const reqEndMinutes = reqEndHour * 60 + reqEndMin;

  const [shiftStartHour, shiftStartMin] = shiftStartTime.split(':').map(Number);
  const shiftStartMinutes = shiftStartHour * 60 + shiftStartMin;

  let shiftEndMinutes = null;
  if (shiftEndTime) {
    const [shiftEndHour, shiftEndMin] = shiftEndTime.split(':').map(Number);
    shiftEndMinutes = shiftEndHour * 60 + shiftEndMin;
    
    // Safety check for overnight shifts
    if (shiftEndMinutes < shiftStartMinutes) {
      shiftEndMinutes += 24 * 60;
    }
  }

  // Safety check for overnight clock outs
  let adjustedClockOutTime = clockOutTime;
  if (clockOutTime !== null && clockOutTime < clockInTime) {
    adjustedClockOutTime += 24 * 60;
  }

  // Check if they ACTUALLY arrived late or left early relative to standard shift
  const standardLateMinutes = clockInTime - shiftStartMinutes;
  const standardEarlyExitMinutes = (adjustedClockOutTime !== null && shiftEndMinutes !== null)
    ? shiftEndMinutes - adjustedClockOutTime
    : 0;

  // Evaluate if they consumed the grace requirement
  const usedMorningGrace = standardLateMinutes > grace;
  const usedEveningGrace = standardEarlyExitMinutes > grace;

  let aligned = true;
  let reason = null;
  let suggestedStatus = null;

  if (usedMorningGrace) {
    // If they arrived late, their approved request MUST cover the morning gap.
    // The request should start near shiftStart, and clockIn must be near reqEnd.
    if (reqStartMinutes <= shiftStartMinutes + grace && clockInTime <= reqEndMinutes + grace) {
        // Time is safely covered
    } else {
        aligned = false;
        reason = `Unaccounted morning absence. Shift starts at ${formatTime(shiftStartMinutes)}, but request covers ${formatTime(reqStartMinutes)} to ${formatTime(reqEndMinutes)} and clock-in is ${formatTime(clockInTime)}.`;
        suggestedStatus = 'First Off';
    }
  }

  if (usedEveningGrace && adjustedClockOutTime !== null && shiftEndMinutes !== null) {
    // If they left early, their approved request MUST cover the evening gap.
    // The request should end near shiftEnd, and clockOut must be near reqStart.
    if (reqEndMinutes >= shiftEndMinutes - grace && adjustedClockOutTime >= reqStartMinutes - grace) {
        // Time is safely covered
    } else {
        aligned = false;
        const eveningReason = `Unaccounted evening absence. Shift ends at ${formatTime(shiftEndMinutes)}, but request covers ${formatTime(reqStartMinutes)} to ${formatTime(reqEndMinutes)} and clock-out is ${formatTime(adjustedClockOutTime)}.`;
        reason = reason ? `${reason} AND ${eveningReason}` : eveningReason;
        suggestedStatus = suggestedStatus ? 'Absent' : 'Second Off';
    }
  }

  return { 
    aligned, 
    reason, 
    usedGrace: usedMorningGrace || usedEveningGrace,
    suggestedStatus
  };
}

// Returns an array of ALL active requests for display so "Both" scenarios render correctly in UI
export function getRequestDisplayInfo(result: RequestValidationResult) {
  const infos = [];

  if (result.gatePass && result.gatePass.hasGatePass) {
    infos.push({
      type: 'Gate Pass',
      status: result.gatePass.status,
      startDate: result.gatePass.startDate,
      startTime: result.gatePass.requestedStartTime,
      endDate: result.gatePass.endDate,
      endTime: result.gatePass.requestedEndTime,
      approvedStartTime: result.gatePass.approvedStartTime,
      approvedEndTime: result.gatePass.approvedEndTime,
      reason: result.gatePass.reason,
      id: result.gatePass.id,
    });
  }

  if (result.permission && result.permission.hasPermission) {
    infos.push({
      type: 'Permission',
      status: result.permission.status,
      startDate: result.permission.startDate,
      startTime: result.permission.requestedStartTime,
      endDate: result.permission.endDate,
      endTime: result.permission.requestedEndTime,
      approvedStartTime: result.permission.requestedStartTime,
      approvedEndTime: result.permission.requestedEndTime,
      reason: result.permission.reason,
      id: result.permission.id,
    });
  }

  return infos.length > 0 ? infos : null;
}