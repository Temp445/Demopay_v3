import { supabase } from './supabase';
import { getTenantId } from './tenantDb';

export interface AttendanceEntry {
  date: string;
  status: 'Present' | 'Absent' | 'HalfDay' | 'Late' | 'WeekOff' | 'PaidHoliday' | 'Permission' | 'Early Exit';
  shift?: string;
  leave?: string;
  gatePass?: {
    type: 'OnDuty' | 'Permission';
    duration: string;
  };
  details?: {
    firstHalf: 'Present' | 'Absent' | 'CL' | 'SL' | 'LOP';
    secondHalf: 'Present' | 'Absent' | 'CL' | 'SL' | 'LOP';
    shift?: string;
  };
}

export interface AttendanceData {
  period: string;
  calendarDays: number;
  payDays: number;
  attendance: AttendanceEntry[];
  rules: {
    halfDayValue: number;
    paidLeaves: string[];
    unpaidLeaves: string[];
    weekOffPaid: boolean;
    paidHolidayPaid: boolean;
    payableDaysFormula: string;
  };
}

export interface TimeWageTypes {
  calendarDays: number;
  payDays: number;
  workingDays: number;

  presentDays: number;
  presentDaysCount: number;

  absentDays: number;
  absentDaysCount: number;

  paidLeaveDays: number;
  paidLeaveDaysCount: number;

  unpaidLeaveDays: number;
  unpaidLeaveDaysCount: number;

  leaveDays: number;
  leaveCount: number;

  weekOffDays: number;
  weekOffDaysCount: number;

  paidHolidays: number;
  paidHolidaysCount: number;

  shiftDays: number;
  shiftDaysCount: number;

  gatePassHours: number;
  gatePassCount: number;

  payableDays: number;
  payableDaysCount: number;

  shiftBreakdown: Record<string, number>;
  shiftCountBreakdown: Record<string, number>;

  leaveTypeBreakdown: Record<string, number>;

  gatePassTypeBreakdown: Record<string, number>;
}

function parseGatePassDuration(duration: string): number {
  const match = duration.match(/(\d+(?:\.\d+)?)\s*(hour|hours|min|mins|minute|minutes)/i);
  if (!match) return 0;

  const value = parseFloat(match[1]);
  const unit = match[2].toLowerCase();

  if (unit.startsWith('hour')) {
    return value;
  } else if (unit.startsWith('min')) {
    return value / 60;
  }

  return 0;
}

export function evaluateTimeData(data: AttendanceData): TimeWageTypes {
  const result: TimeWageTypes = {
    calendarDays: data.calendarDays,
    payDays: data.payDays,
    workingDays: 0,

    presentDays: 0,
    presentDaysCount: 0,

    absentDays: 0,
    absentDaysCount: 0,

    paidLeaveDays: 0,
    paidLeaveDaysCount: 0,

    unpaidLeaveDays: 0,
    unpaidLeaveDaysCount: 0,

    leaveDays: 0,
    leaveCount: 0,

    weekOffDays: 0,
    weekOffDaysCount: 0,

    paidHolidays: 0,
    paidHolidaysCount: 0,

    shiftDays: 0,
    shiftDaysCount: 0,

    gatePassHours: 0,
    gatePassCount: 0,

    payableDays: 0,
    payableDaysCount: 0,

    shiftBreakdown: {},
    shiftCountBreakdown: {},
    leaveTypeBreakdown: {},
    gatePassTypeBreakdown: {},
  };

  for (const entry of data.attendance) {
    if (entry.status === 'WeekOff') {
      result.weekOffDays += 1;
      result.weekOffDaysCount += 1;
      if (data.rules.weekOffPaid) {
        result.payableDays += 1;
        result.payableDaysCount += 1;
      }
      continue;
    }

    if (entry.status === 'PaidHoliday') {
      result.paidHolidays += 1;
      result.paidHolidaysCount += 1;
      if (data.rules.paidHolidayPaid) {
        result.payableDays += 1;
        result.payableDaysCount += 1;
      }
      continue;
    }

    result.workingDays += 1;

    if (entry.status === 'Present' || entry.status === 'Late' || entry.status === 'Permission' || entry.status === 'Early Exit') {
      result.presentDays += 1;
      result.presentDaysCount += 1;
      result.payableDays += 1;
      result.payableDaysCount += 1;

      if (entry.shift) {
        result.shiftDays += 1;
        result.shiftDaysCount += 1;
        result.shiftBreakdown[entry.shift] = (result.shiftBreakdown[entry.shift] || 0) + 1;
        result.shiftCountBreakdown[entry.shift] = (result.shiftCountBreakdown[entry.shift] || 0) + 1;
      }

      if (entry.gatePass) {
        const hours = parseGatePassDuration(entry.gatePass.duration);
        result.gatePassHours += hours;
        result.gatePassCount += 1;
        result.gatePassTypeBreakdown[entry.gatePass.type] = (result.gatePassTypeBreakdown[entry.gatePass.type] || 0) + 1;
      }
    } else if (entry.status === 'Absent') {
      result.absentDays += 1;
      result.absentDaysCount += 1;

      if (entry.leave) {
        result.leaveDays += 1;
        result.leaveCount += 1;
        result.leaveTypeBreakdown[entry.leave] = (result.leaveTypeBreakdown[entry.leave] || 0) + 1;

        if (data.rules.paidLeaves.includes(entry.leave)) {
          result.paidLeaveDays += 1;
          result.paidLeaveDaysCount += 1;
          result.payableDays += 1;
          result.payableDaysCount += 1;
        } else if (data.rules.unpaidLeaves.includes(entry.leave)) {
          result.unpaidLeaveDays += 1;
          result.unpaidLeaveDaysCount += 1;
        }
      }
    } else if (entry.status === 'HalfDay' && entry.details) {
      result.presentDaysCount += 1;

      const halfDayValue = data.rules.halfDayValue;
      let presentHalves = 0;
      let absentHalves = 0;
      let paidLeaveHalves = 0;
      let unpaidLeaveHalves = 0;

      [entry.details.firstHalf, entry.details.secondHalf].forEach(half => {
        if (half === 'Present') {
          presentHalves++;
        } else if (half === 'Absent') {
          absentHalves++;
        } else if (data.rules.paidLeaves.includes(half)) {
          paidLeaveHalves++;
          result.leaveTypeBreakdown[half] = (result.leaveTypeBreakdown[half] || 0) + halfDayValue;
        } else if (data.rules.unpaidLeaves.includes(half)) {
          unpaidLeaveHalves++;
          result.leaveTypeBreakdown[half] = (result.leaveTypeBreakdown[half] || 0) + halfDayValue;
        }
      });

      const presentDaysFromHalf = presentHalves * halfDayValue;
      const absentDaysFromHalf = absentHalves * halfDayValue;
      const paidLeaveDaysFromHalf = paidLeaveHalves * halfDayValue;
      const unpaidLeaveDaysFromHalf = unpaidLeaveHalves * halfDayValue;

      result.presentDays += presentDaysFromHalf;
      result.absentDays += absentDaysFromHalf;
      result.paidLeaveDays += paidLeaveDaysFromHalf;
      result.unpaidLeaveDays += unpaidLeaveDaysFromHalf;
      result.leaveDays += (paidLeaveDaysFromHalf + unpaidLeaveDaysFromHalf);

      if (paidLeaveHalves > 0 || unpaidLeaveHalves > 0) {
        result.leaveCount += 1;
        result.paidLeaveDaysCount += (paidLeaveHalves > 0 ? 1 : 0);
        result.unpaidLeaveDaysCount += (unpaidLeaveHalves > 0 ? 1 : 0);
      }

      if (absentHalves > 0) {
        result.absentDaysCount += 1;
      }

      const payableDaysFromHalf = presentDaysFromHalf + paidLeaveDaysFromHalf;
      result.payableDays += payableDaysFromHalf;
      result.payableDaysCount += (payableDaysFromHalf > 0 ? 1 : 0);

      if (entry.details.shift && presentHalves > 0) {
        result.shiftDays += presentDaysFromHalf;
        result.shiftDaysCount += 1;
        result.shiftBreakdown[entry.details.shift] = (result.shiftBreakdown[entry.details.shift] || 0) + presentDaysFromHalf;
        result.shiftCountBreakdown[entry.details.shift] = (result.shiftCountBreakdown[entry.details.shift] || 0) + 1;
      }
    }
  }

  return result;
}

export async function storeTimeEvaluation(
  employeeId: string,
  period: string,
  timeWageTypes: TimeWageTypes
): Promise<void> {
  const tenantId = await getTenantId();

  const { error } = await supabase
    .from('employee_time_evaluations')
    .upsert({
      tenant_id: tenantId,
      employee_id: employeeId,
      period,
      calendar_days: timeWageTypes.calendarDays,
      pay_days: timeWageTypes.payDays,
      working_days: timeWageTypes.workingDays,
      present_days: timeWageTypes.presentDays,
      present_days_count: timeWageTypes.presentDaysCount,
      absent_days: timeWageTypes.absentDays,
      absent_days_count: timeWageTypes.absentDaysCount,
      paid_leave_days: timeWageTypes.paidLeaveDays,
      paid_leave_days_count: timeWageTypes.paidLeaveDaysCount,
      unpaid_leave_days: timeWageTypes.unpaidLeaveDays,
      unpaid_leave_days_count: timeWageTypes.unpaidLeaveDaysCount,
      leave_days: timeWageTypes.leaveDays,
      leave_count: timeWageTypes.leaveCount,
      week_off_days: timeWageTypes.weekOffDays,
      week_off_days_count: timeWageTypes.weekOffDaysCount,
      paid_holidays: timeWageTypes.paidHolidays,
      paid_holidays_count: timeWageTypes.paidHolidaysCount,
      shift_days: timeWageTypes.shiftDays,
      shift_days_count: timeWageTypes.shiftDaysCount,
      gate_pass_hours: timeWageTypes.gatePassHours,
      gate_pass_count: timeWageTypes.gatePassCount,
      payable_days: timeWageTypes.payableDays,
      payable_days_count: timeWageTypes.payableDaysCount,
      shift_breakdown: timeWageTypes.shiftBreakdown,
      shift_count_breakdown: timeWageTypes.shiftCountBreakdown,
      leave_type_breakdown: timeWageTypes.leaveTypeBreakdown,
      gate_pass_type_breakdown: timeWageTypes.gatePassTypeBreakdown,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'tenant_id,employee_id,period'
    });

  if (error) throw error;
}

export async function getTimeEvaluation(
  employeeId: string,
  period: string
): Promise<TimeWageTypes | null> {
  const tenantId = await getTenantId();

  const { data, error } = await supabase
    .from('employee_time_evaluations')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('employee_id', employeeId)
    .eq('period', period)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    calendarDays: data.calendar_days,
    payDays: data.pay_days,
    workingDays: data.working_days,
    presentDays: data.present_days,
    presentDaysCount: data.present_days_count,
    absentDays: data.absent_days,
    absentDaysCount: data.absent_days_count,
    paidLeaveDays: data.paid_leave_days,
    paidLeaveDaysCount: data.paid_leave_days_count,
    unpaidLeaveDays: data.unpaid_leave_days,
    unpaidLeaveDaysCount: data.unpaid_leave_days_count,
    leaveDays: data.leave_days,
    leaveCount: data.leave_count,
    weekOffDays: data.week_off_days,
    weekOffDaysCount: data.week_off_days_count,
    paidHolidays: data.paid_holidays,
    paidHolidaysCount: data.paid_holidays_count,
    shiftDays: data.shift_days,
    shiftDaysCount: data.shift_days_count,
    gatePassHours: data.gate_pass_hours,
    gatePassCount: data.gate_pass_count,
    payableDays: data.payable_days,
    payableDaysCount: data.payable_days_count,
    shiftBreakdown: data.shift_breakdown || {},
    shiftCountBreakdown: data.shift_count_breakdown || {},
    leaveTypeBreakdown: data.leave_type_breakdown || {},
    gatePassTypeBreakdown: data.gate_pass_type_breakdown || {},
  };
}
