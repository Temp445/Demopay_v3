import { supabase } from './supabase';

export interface AttendanceValidationConfig {
  id: string;
  tenant_id: string;
  entry_grace_time_minutes: number;
  exit_grace_time_minutes: number;
  late_entry_limit_minutes: number;
  total_allowed_late_entry_count: number;
  early_exit_limit_minutes: number;
  total_allowed_early_exit_count: number;
  min_permission_minutes: number;
  max_permission_minutes: number;
  total_permission_minutes_per_month: number;
  permission_round_up_to_minutes: number;
  enable_half_day_rules: boolean;
  is_active: boolean;
}

export interface EmployeePermissionBalance {
  balance_id: string;
  total_allowed: number;
  used: number;
  remaining: number;
  late_count: number;
  early_count: number;
}

export interface ValidationResult {
  status: 'Present' | 'Late' | 'Early Exit' | 'Permission' | 'Half Day' | 'First Half Absent' | 'Second Half Absent' | 'First Off' | 'Second Off' | 'Absent';
  action_type: string;
  entry_time_gap_minutes: number | null;
  exit_time_gap_minutes: number | null;
  minutes_used: number;
  late_increment: number;
  early_increment: number;
  balance_after: number;
  notes: string;
}

export async function getValidationConfig(tenantId: string): Promise<AttendanceValidationConfig | null> {
  const { data, error } = await supabase
    .from('attendance_validation_config')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .single();

  if (error) {
    console.error('Error fetching validation config:', error);
    return null;
  }

  return data;
}

export async function getEmployeeBalance(
  tenantId: string,
  employeeId: string,
  date: Date
): Promise<EmployeePermissionBalance | null> {
  const { data, error } = await supabase
    .rpc('get_employee_permission_balance', {
      p_tenant_id: tenantId,
      p_employee_id: employeeId,
      p_date: date.toISOString().split('T')[0]
    });

  if (error) {
    console.error('Error fetching employee balance:', error);
    return null;
  }

  return data && data.length > 0 ? data[0] : null;
}

function calculateTimeGap(
  actualTime: Date,
  scheduledTime: Date
): number {
  const diffMs = actualTime.getTime() - scheduledTime.getTime();
  return Math.floor(diffMs / (1000 * 60));
}

function roundUpToIncrement(minutes: number, increment: number): number {
  return Math.ceil(minutes / increment) * increment;
}

export async function validateAttendance(
  tenantId: string,
  employeeId: string,
  date: Date,
  clockIn: Date | null,
  clockOut: Date | null,
  shiftStartTime: string,
  shiftEndTime: string,
  breakStartTime: string,
  breakEndTime: string
): Promise<ValidationResult> {
  const config = await getValidationConfig(tenantId);

  if (!config) {
    return {
      status: 'Absent',
      action_type: 'absent',
      entry_time_gap_minutes: null,
      exit_time_gap_minutes: null,
      minutes_used: 0,
      late_increment: 0,
      early_increment: 0,
      balance_after: 0,
      notes: 'No validation configuration found'
    };
  }

  const balance = await getEmployeeBalance(tenantId, employeeId, date);

  if (!balance) {
    return {
      status: 'Absent',
      action_type: 'absent',
      entry_time_gap_minutes: null,
      exit_time_gap_minutes: null,
      minutes_used: 0,
      late_increment: 0,
      early_increment: 0,
      balance_after: 0,
      notes: 'No permission balance found'
    };
  }

  if (!clockIn && !clockOut) {
    return {
      status: 'Absent',
      action_type: 'absent',
      entry_time_gap_minutes: null,
      exit_time_gap_minutes: null,
      minutes_used: 0,
      late_increment: 0,
      early_increment: 0,
      balance_after: balance.remaining,
      notes: 'No clock in or clock out recorded'
    };
  }

  const [startH, startM] = shiftStartTime.split(':').map(Number);
  const [endH, endM] = shiftEndTime.split(':').map(Number);
  const [breakStartH, breakStartM] = breakStartTime.split(':').map(Number);
  const [breakEndH, breakEndM] = breakEndTime.split(':').map(Number);

  const shiftStart = new Date(date);
  shiftStart.setHours(startH, startM, 0, 0);

  const shiftEnd = new Date(date);
  shiftEnd.setHours(endH, endM, 0, 0);
  if (shiftEnd < shiftStart) {
    shiftEnd.setDate(shiftEnd.getDate() + 1);
  }

  const breakStart = new Date(date);
  breakStart.setHours(breakStartH, breakStartM, 0, 0);

  const breakEnd = new Date(date);
  breakEnd.setHours(breakEndH, breakEndM, 0, 0);

  let entryTimeGap: number | null = null;
  let exitTimeGap: number | null = null;

  if (clockIn) {
    entryTimeGap = calculateTimeGap(clockIn, shiftStart);
  }

  if (clockOut) {
    exitTimeGap = calculateTimeGap(shiftEnd, clockOut);
  }

  // STEP 1: Grace Period Check
  const entryWithinGrace = entryTimeGap !== null && entryTimeGap <= config.entry_grace_time_minutes;
  const exitWithinGrace = exitTimeGap !== null && exitTimeGap <= config.exit_grace_time_minutes;

  if (entryWithinGrace && exitWithinGrace) {
    return {
      status: 'Present',
      action_type: 'grace_period',
      entry_time_gap_minutes: entryTimeGap,
      exit_time_gap_minutes: exitTimeGap,
      minutes_used: 0,
      late_increment: 0,
      early_increment: 0,
      balance_after: balance.remaining,
      notes: 'Within grace period'
    };
  }

  // STEP 2: Half Day Rules (if enabled)
  if (config.enable_half_day_rules && clockIn && clockOut) {
    if (clockOut < breakStart) {
      return {
        status: 'Second Off',
        action_type: 'half_day_second',
        entry_time_gap_minutes: entryTimeGap,
        exit_time_gap_minutes: exitTimeGap,
        minutes_used: 0,
        late_increment: 0,
        early_increment: 0,
        balance_after: balance.remaining,
        notes: 'Exited before break time'
      };
    }

    if (clockIn > breakEnd) {
      return {
        status: 'First Off',
        action_type: 'half_day_first',
        entry_time_gap_minutes: entryTimeGap,
        exit_time_gap_minutes: exitTimeGap,
        minutes_used: 0,
        late_increment: 0,
        early_increment: 0,
        balance_after: balance.remaining,
        notes: 'Entered after break time'
      };
    }
  }

  // STEP 3: Late Entry Check
  if (entryTimeGap !== null &&
      entryTimeGap > config.entry_grace_time_minutes &&
      entryTimeGap <= config.late_entry_limit_minutes &&
      balance.late_count < config.total_allowed_late_entry_count) {

    return {
      status: 'Late',
      action_type: 'late_entry',
      entry_time_gap_minutes: entryTimeGap,
      exit_time_gap_minutes: exitTimeGap,
      minutes_used: 0,
      late_increment: 1, 
      early_increment: 0,
      balance_after: balance.remaining,
      notes: `Late entry count: ${balance.late_count + 1}/${config.total_allowed_late_entry_count}`
    };
  }

  // STEP 4: Early Exit Check
  if (exitTimeGap !== null &&
      exitTimeGap > config.exit_grace_time_minutes &&
      exitTimeGap <= config.early_exit_limit_minutes &&
      balance.early_count < config.total_allowed_early_exit_count) {

    return {
      status: 'Early Exit',
      action_type: 'early_exit',
      entry_time_gap_minutes: entryTimeGap,
      exit_time_gap_minutes: exitTimeGap,
      minutes_used: 0,
      late_increment: 0,
      early_increment: 1, 
      balance_after: balance.remaining,
      notes: `Early exit count: ${balance.early_count + 1}/${config.total_allowed_early_exit_count}`
    };
  }

  // STEP 5: Permission Check
  const exceedsLateLimit = entryTimeGap !== null && entryTimeGap > config.late_entry_limit_minutes;
  const exceedsEarlyLimit = exitTimeGap !== null && exitTimeGap > config.early_exit_limit_minutes;
  const lateCountExceeded = balance.late_count >= config.total_allowed_late_entry_count;
  const earlyCountExceeded = balance.early_count >= config.total_allowed_early_exit_count;

  if (exceedsLateLimit || exceedsEarlyLimit || lateCountExceeded || earlyCountExceeded) {
    const entryGap = entryTimeGap || 0;
    const exitGap = exitTimeGap || 0;
    const gapToUse = Math.max(entryGap, exitGap);
    const roundedMinutes = roundUpToIncrement(gapToUse, config.permission_round_up_to_minutes);

    const isEarlyExitIssue = exitGap > 0 && exitGap >= entryGap;
    const offStatus = isEarlyExitIssue ? 'Second Off' : 'First Off';
    const offAction = isEarlyExitIssue ? 'second_off' : 'first_off';

    if (roundedMinutes < config.min_permission_minutes) {
      return {
        status: offStatus,
        action_type: offAction,
        entry_time_gap_minutes: entryTimeGap,
        exit_time_gap_minutes: exitTimeGap,
        minutes_used: 0,
        late_increment: 0,
        early_increment: 0,
        balance_after: balance.remaining,
        notes: `Gap ${gapToUse} minutes is below minimum permission requirement of ${config.min_permission_minutes} minutes`
      };
    }

    if (roundedMinutes > config.max_permission_minutes) {
      return {
        status: offStatus,
        action_type: offAction,
        entry_time_gap_minutes: entryTimeGap,
        exit_time_gap_minutes: exitTimeGap,
        minutes_used: 0,
        late_increment: 0,
        early_increment: 0,
        balance_after: balance.remaining,
        notes: `Gap ${gapToUse} minutes exceeds maximum permission of ${config.max_permission_minutes} minutes`
      };
    }

    if (roundedMinutes <= balance.remaining) {
      return {
        status: 'Permission',
        action_type: 'permission',
        entry_time_gap_minutes: entryTimeGap,
        exit_time_gap_minutes: exitTimeGap,
        minutes_used: roundedMinutes,
        late_increment: 0,
        early_increment: 0,
        balance_after: balance.remaining - roundedMinutes,
        notes: `Permission used: ${roundedMinutes} minutes. Remaining: ${balance.remaining - roundedMinutes} minutes`
      };
    } else {
      return {
        status: offStatus,
        action_type: offAction,
        entry_time_gap_minutes: entryTimeGap,
        exit_time_gap_minutes: exitTimeGap,
        minutes_used: 0,
        late_increment: 0,
        early_increment: 0,
        balance_after: balance.remaining,
        notes: `Insufficient permission balance. Required: ${roundedMinutes} minutes, Available: ${balance.remaining} minutes`
      };
    }
  }

  return {
    status: 'Present',
    action_type: 'grace_period',
    entry_time_gap_minutes: entryTimeGap,
    exit_time_gap_minutes: exitTimeGap,
    minutes_used: 0,
    late_increment: 0,
    early_increment: 0,
    balance_after: balance.remaining,
    notes: 'Default to present'
  };
}

export async function recordAttendanceHistory(
  tenantId: string,
  employeeId: string,
  attendanceLogId: string,
  date: Date,
  validationResult: ValidationResult
): Promise<void> {
  const dateStr = date.toISOString().split('T')[0];

  // 1. Revert previous history if updating an existing record
  const { data: oldHistory } = await supabase
    .from('employee_attendance_history')
    .select('*')
    .eq('attendance_log_id', attendanceLogId)
    .maybeSingle();

  if (oldHistory) {
    let revLate = 0;
    let revEarly = 0;
    let revMins = 0;

    if (oldHistory.action_type === 'late_entry') revLate = -1;
    if (oldHistory.action_type === 'early_exit') revEarly = -1;
    if (oldHistory.action_type === 'permission') revMins = -(oldHistory.minutes_used || 0);

    if (revLate !== 0 || revEarly !== 0 || revMins !== 0) {
      await supabase.rpc('update_employee_permission_balance', {
        p_tenant_id: tenantId,
        p_employee_id: employeeId,
        p_date: dateStr,
        p_minutes_used: revMins,
        p_late_entry_increment: revLate,
        p_early_exit_increment: revEarly
      });
    }

    await supabase.from('employee_attendance_history').delete().eq('id', oldHistory.id);
  }

  // 2. Apply new permission balance deductions exactly ONCE
  if (validationResult.minutes_used > 0 || validationResult.late_increment > 0 || validationResult.early_increment > 0) {
    await supabase.rpc('update_employee_permission_balance', {
      p_tenant_id: tenantId,
      p_employee_id: employeeId,
      p_date: dateStr,
      p_minutes_used: validationResult.minutes_used,
      p_late_entry_increment: validationResult.late_increment,
      p_early_exit_increment: validationResult.early_increment
    });
  }

  // 3. Insert fresh history log
  await supabase
    .from('employee_attendance_history')
    .insert({
      tenant_id: tenantId,
      employee_id: employeeId,
      attendance_log_id: attendanceLogId,
      date: dateStr,
      action_type: validationResult.action_type,
      entry_time_gap_minutes: validationResult.entry_time_gap_minutes,
      exit_time_gap_minutes: validationResult.exit_time_gap_minutes,
      minutes_used: validationResult.minutes_used,
      balance_after: validationResult.balance_after,
      notes: validationResult.notes
    });
}