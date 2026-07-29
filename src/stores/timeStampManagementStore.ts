import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import {
  validateAuth,
  createAuthError,
  createTenantError,
  initialStoreState,
  setLoading,
  setError,
  setSuccess,
  updateItem,
  type StoreState,
} from './utils/storeUtils';
import { validateAttendance, recordAttendanceHistory } from '../lib/attendanceValidation';
import { validateAttendanceRequests } from '../lib/attendanceRequestValidation';
import { getHolidays } from '../lib/holidays';

import type {
  ProcessedTimeRecord,
  ShiftFilterParams,
  EmployeeFilterParams,
  UpdateTimeStampRequest,
  CreateTimeStampRequest,
  TimeStampStatistics,
  AttendanceLog,
  AttendanceEditLog,
  Shift,
  Employee,
} from '../types/timeStampManagement';

// Interface for Shift Settings matching the DB schema
interface ShiftSettings {
  shift_id: string;
  late_threshold_minutes: number;
  half_day_threshold_minutes: number;
  is_overtime_enabled: boolean;
  overtime_type: 'before' | 'after' | 'both' | null;
  overtime_calc_start_minutes: number;
  max_overtime_limit_minutes: number;
}

interface TimeStampManagementStore extends StoreState<ProcessedTimeRecord> {
  shifts: Shift[];
  employees: Employee[];
  shiftSettings: Record<string, ShiftSettings>; // Cache for shift settings
  editLogs: Record<string, AttendanceEditLog[]>;
  statistics: TimeStampStatistics | null;
  dataSource: 'attendance_logs' | 'attendance_timestamp' | 'combined' | null;

  fetchShifts: () => Promise<void>;
  fetchEmployees: () => Promise<void>;
  fetchTimeRecordsByShift: (params: ShiftFilterParams) => Promise<void>;
  fetchTimeRecordsByEmployee: (params: EmployeeFilterParams) => Promise<void>;
  fetchEditLogs: (attendanceLogId: string) => Promise<void>;
  createTimeStamp: (request: CreateTimeStampRequest) => Promise<void>;
  updateTimeStamp: (request: UpdateTimeStampRequest) => Promise<void>;
  saveToAttendanceLogs: (records: ProcessedTimeRecord[]) => Promise<void>;
  calculateStatistics: () => void;

  reset: () => void;
}

const isEmployeeVisible = (employee: Employee | undefined, recordDate: string) => {
  if (!employee) return true;

  const exitStatuses = ["relieved", "terminated"];

  if (!exitStatuses.includes(employee.status?.toLowerCase())) {
    return true;
  }

  if (!employee.status_date) return true;

  return new Date(recordDate) <= new Date(employee.status_date);
};

const calculateTotalHours = (clockIn: string | null, clockOut: string | null): number | null => {
  if (!clockIn || !clockOut) return null;

  try {
    const inTime = new Date(clockIn);
    const outTime = new Date(clockOut);
    const diffMs = outTime.getTime() - inTime.getTime();
    
    if (diffMs < 0) return null; // Prevent negative hours for misgrouped or invalid punches

    const hours = diffMs / (1000 * 60 * 60);
    return Math.round(hours * 100) / 100;
  } catch (error) {
    return null;
  }
};

// Dynamic status determination based on DB thresholds (Legacy fallback)
const determineStatus = (
  clockIn: string | null,
  clockOut: string | null,
  shiftStartTime: string | null = null,
  lateThreshold: number = 15,
  halfDayThreshold: number = 240
): 'Present' | 'Absent' | 'Late' | 'Half Day' | 'Permission' | 'Early Exit' | 'First Half Absent' | 'Second Half Absent' | 'First Off' | 'Second Off' => {
  if (!clockIn && !clockOut) return 'Absent';

  if (clockIn && !clockOut) return 'Half Day';

  if (clockIn && clockOut) {
    const inTime = new Date(clockIn);
    const outTime = new Date(clockOut);

    const workedMinutes = (outTime.getTime() - inTime.getTime()) / (1000 * 60);

    if (workedMinutes < halfDayThreshold) {
      return 'Half Day';
    }

    if (shiftStartTime) {
      const shiftStartDT = new Date(inTime);
      const [startH, startM] = shiftStartTime.split(':').map(Number);
      shiftStartDT.setHours(startH, startM, 0, 0);

      const lateMinutes = (inTime.getTime() - shiftStartDT.getTime()) / (1000 * 60);

      if (lateMinutes > lateThreshold) {
        return 'Late';
      }
    }

    return 'Present';
  }

  return 'Present';
};

const getDiffForPunch = (punchStr: string | null, shift: Shift, type: 'in' | 'out'): number | null => {
  if (!punchStr || !shift.start_time || !shift.end_time) return null;
  const refTime = new Date(punchStr);
  const punchMinutes = refTime.getHours() * 60 + refTime.getMinutes();
  
  const [startH, startM] = shift.start_time.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const [endH, endM] = shift.end_time.split(':').map(Number);
  const endMinutes = endH * 60 + endM;

  const targetMinutes = type === 'in' ? startMinutes : endMinutes;

  const rawDiff = Math.abs(punchMinutes - targetMinutes);
  return Math.min(rawDiff, 1440 - rawDiff);
};

const determineStatusWithValidation = async (
  tenantId: string,
  employeeId: string,
  date: string,
  clockIn: string | null,
  clockOut: string | null,
  shift: Shift | null,
  attendanceLogId?: string
): Promise<string> => {
  try {
    if (!shift || !clockIn) {
      return determineStatus(clockIn, clockOut, shift?.start_time || null, 15, 240);
    }

    const dateObj = new Date(date);
    const clockInDate = clockIn ? new Date(clockIn) : null;
    const clockOutDate = clockOut ? new Date(clockOut) : null;

    // Check for Gate Pass or Permission requests
    const requestValidation = await validateAttendanceRequests(
      tenantId,
      employeeId,
      date,
      clockInDate,
      clockOutDate,
      shift.start_time,
      shift.end_time
    );

    // Handle pending requests
    if (requestValidation.hasPendingRequest) {
      return 'Pending Approval';
    }

    // Handle approved requests with automatic validation
    if (requestValidation.hasApprovedRequest) {
      if (requestValidation.shouldAutoMarkPresent) {
        return requestValidation.statusOverride || 'Present';
      }
    }

    // Fall back to standard attendance validation
    const validationResult = await validateAttendance(
      tenantId,
      employeeId,
      dateObj,
      clockInDate,
      clockOutDate,
      shift.start_time,
      shift.end_time,
      shift.break_start_time,
      shift.break_end_time
    );

    return validationResult.status;
  } catch (error) {
    console.error('Error in comprehensive validation, falling back to legacy:', error);
    return determineStatus(clockIn, clockOut, shift?.start_time || null, 15, 240);
  }
};

export const useTimeStampManagementStore = create<TimeStampManagementStore>((set, get) => ({
  ...initialStoreState<ProcessedTimeRecord>(),
  shifts: [],
  employees: [],
  shiftSettings: {}, // Initialized
  editLogs: {},
  statistics: null,
  dataSource: null,

  fetchShifts: async () => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) return;

    try {
      const { data: shiftsData, error: shiftsError } = await supabase
        .from('shifts')
        .select('*')
        .eq('tenant_id', auth.tenantId)
        .eq('is_active', true)
        .order('name');

      if (shiftsError) throw shiftsError;

      // Fetch attendance settings for these shifts
      const shiftIds = (shiftsData || []).map(s => s.id);
      const { data: settingsData } = await supabase
        .from('shift_attendance_settings')
        .select('*')
        .eq('tenant_id', auth.tenantId)
        .in('shift_id', shiftIds);

      const settingsMap: Record<string, ShiftSettings> = {};
      (settingsData || []).forEach(setting => {
        settingsMap[setting.shift_id] = setting;
      });

      set({ shifts: shiftsData || [], shiftSettings: settingsMap });
    } catch (error) {
      console.error('Failed to fetch shifts and settings:', error);
    }
  },

  fetchEmployees: async () => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) return;

    try {
      const { data, error } = await supabase.rpc('get_employees_in_timestampmgmt', { p_tenant_id: auth.tenantId });
      if (error) throw error;

      set({ employees: data || [] });
    } catch (error) {
      console.error('Failed to fetch employees:', error);
    }
  },

  fetchTimeRecordsByShift: async (params) => {
    const auth = await validateAuth();

    if (!auth.isAuthenticated) {
      set(state => setError(state, createAuthError().message));
      return;
    }

    if (!auth.tenantId) {
      set(state => setError(state, createTenantError().message));
      return;
    }

    set(state => setLoading(state));

    try {
      const selectedShift = get().shifts.find(s => s.id === params.shift_id);
      const shiftNameMap = new Map(get().shifts.map(s => [s.id, s.name]));
      const currentShiftName = selectedShift?.name || 'Unknown Shift';

      // Get settings for this specific shift
      const shiftSetting = get().shiftSettings[params.shift_id];
      const lateThreshold = shiftSetting?.late_threshold_minutes ?? 15;
      const halfDayThreshold = shiftSetting?.half_day_threshold_minutes ?? 240;

      let shiftStart = new Date(`${params.shift_date}T00:00:00`);
      let shiftEnd = new Date(`${params.shift_date}T23:59:59`);

      if (selectedShift) {
        shiftStart = new Date(`${params.shift_date}T${selectedShift.start_time}`);
        shiftEnd = new Date(`${params.shift_date}T${selectedShift.end_time}`);

        if (shiftEnd < shiftStart) {
          shiftEnd.setDate(shiftEnd.getDate() + 1);
        }
      }

      const queryStart = new Date(shiftStart.getTime() - 2 * 60 * 60 * 1000);
      const queryEnd = new Date(shiftEnd.getTime() + 4 * 60 * 60 * 1000);

      const { data: attendanceLogs, error: logsError } = await supabase
        .from('attendance_logs')
        .select(`
          *,
          employees (
            name,
            email,
            employee_code,
            department:departments (name)
          )
        `)
        .eq('tenant_id', auth.tenantId)
        .eq('date', params.shift_date)
        .order('employee_id', { ascending: true });

      if (logsError) throw logsError;

      const { data: schedules } = await supabase
        .from('shift_assignments')
        .select('employee_id, shift_id')
        .eq('tenant_id', auth.tenantId)
        .eq('schedule_date', params.shift_date);

      const scheduleMap = new Map<string, Set<string>>();
      (schedules || []).forEach(s => {
        if (!scheduleMap.has(s.employee_id)) {
          scheduleMap.set(s.employee_id, new Set());
        }
        scheduleMap.get(s.employee_id)!.add(s.shift_id);
      });

      const determineShiftStatus = (employeeId: string, currentShiftId: string) => {
        const assignedShifts = scheduleMap.get(employeeId);
        if (!assignedShifts || assignedShifts.size === 0) return 'unscheduled';
        if (!assignedShifts.has(currentShiftId)) return 'wrong_shift';
        return 'regular';
      };

      const getAssignedShiftNames = (employeeId: string) => {
        const shiftIds = Array.from(scheduleMap.get(employeeId) || []);
        return shiftIds.map(id => shiftNameMap.get(id) || 'Unknown Shift');
      };

      const logRecords: ProcessedTimeRecord[] = [];
      const coveredEmployees = new Set<string>();

      const getBestFitShift = (clockIn: string | null, clockOut: string | null) => {
        if (!clockIn && !clockOut) return null;
        
        let closestShift: Shift | undefined;
        let minDifference = Infinity;

         for (const shift of get().shifts) {
            if (!shift.start_time || !shift.end_time) continue;

            const diffIn = getDiffForPunch(clockIn, shift, 'in');
            const diffOut = getDiffForPunch(clockOut, shift, 'out');

            let avgDiff = Infinity;
            if (diffIn !== null && diffOut !== null) {
               // Clock-in is a stronger indicator of the shift, give it 80% weight
               avgDiff = (diffIn * 0.8) + (diffOut * 0.2);
            } else if (diffIn !== null) {
               avgDiff = diffIn;
            } else if (diffOut !== null) {
               avgDiff = diffOut;
            }
            
            if (avgDiff < minDifference) {
               minDifference = avgDiff;
               closestShift = shift;
            }
         }
         return minDifference <= 300 ? closestShift?.id : null;
         return minDifference <= 300 ? closestShift?.id : null;
      };

      // --- NEW: Fetch all timestamps for this day upfront to analyze location scenarios ---
      const dayStartLocal = new Date(`${params.shift_date}T00:00:00`);
      const fetchStart = new Date(dayStartLocal.getTime() - 24 * 60 * 60 * 1000);
      const dayEndExtended = new Date(dayStartLocal.getTime() + 36 * 60 * 60 * 1000); 

      const { data: timestamps, error: tsError } = await supabase
        .from('attendance_timestamp')
        .select(`*, employees(name, email, employee_code, department:departments (name))`)
        .eq('tenant_id', auth.tenantId)
        .gte('timestamp', fetchStart.toISOString())
        .lte('timestamp', dayEndExtended.toISOString())
        .order('timestamp', { ascending: true });

      if (tsError) throw tsError;

      const locationScenarioMap: Record<string, { clockInOutside: boolean, clockOutOutside: boolean, scenario: LocationScenarioFilter }> = {};
      const groupedByEmployeeAndDate: Record<string, Record<string, any[]>> = {};

      (timestamps || []).forEach(ts => {
        const dateObj = new Date(ts.timestamp);
        const kolkataTime = new Date(dateObj.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
        const yyyy = kolkataTime.getFullYear();
        const mm = String(kolkataTime.getMonth() + 1).padStart(2, '0');
        const dd = String(kolkataTime.getDate()).padStart(2, '0');
        const actualDate = `${yyyy}-${mm}-${dd}`;
        
        if (!groupedByEmployeeAndDate[ts.employee_id]) {
            groupedByEmployeeAndDate[ts.employee_id] = {};
        }
        if (!groupedByEmployeeAndDate[ts.employee_id][actualDate]) {
            groupedByEmployeeAndDate[ts.employee_id][actualDate] = [];
        }
        groupedByEmployeeAndDate[ts.employee_id][actualDate].push(ts);
      });

      Object.keys(groupedByEmployeeAndDate).forEach(empId => {
          const punches = groupedByEmployeeAndDate[empId][params.shift_date] || [];
          const inPunches = punches.filter(p => p.entry === 'IN').sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
          const outPunches = punches.filter(p => p.entry === 'OUT').sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

          const clockInOutside = inPunches.length > 0 && inPunches[0].office_location_status === 'Outside Office';
          const clockOutOutside = outPunches.length > 0 && outPunches[outPunches.length - 1].office_location_status === 'Outside Office';
          
          let scenario: LocationScenarioFilter = 'all';
          if (inPunches.length > 1 && clockInOutside) {
              const subsequentInOffice = inPunches.slice(1).some(p => p.office_location_status !== 'Outside Office');
              if (subsequentInOffice) {
                  scenario = 'in_outside_in_office';
              } else if (clockOutOutside) {
                  scenario = 'in_out_outside';
              } else {
                  scenario = 'outside_only';
              }
          } else if (clockInOutside && clockOutOutside) {
              scenario = 'in_out_outside';
          } else if (!clockInOutside && clockOutOutside) {
              scenario = 'in_office_out_outside';
          } else if (clockInOutside && !clockOutOutside) {
              scenario = 'outside_only';
          }

          locationScenarioMap[empId] = { clockInOutside, clockOutOutside, scenario };
      });
      // --- END NEW ---

      const filteredLogs = (attendanceLogs || []).filter(log => {
        const isScheduledForThisShift = scheduleMap.get(log.employee_id)?.has(params.shift_id);
        const bestFitId = getBestFitShift(log.clock_in, log.clock_out);

        if (bestFitId) {
            // If they have punches, they strictly belong to their best-fit shift view ONLY.
            return bestFitId === params.shift_id;
        } else {
            // If they have NO punches, they only appear in their scheduled shift view.
            return isScheduledForThisShift;
        }
      });

      if (filteredLogs.length) {
        const logIds = filteredLogs.map(l => l.id);

        const { data: editLogs } = await supabase
          .from('attendance_edit_logs')
          .select('attendance_log_id')
          .eq('tenant_id', auth.tenantId)
          .in('attendance_log_id', logIds);

        const editCountMap: Record<string, number> = {};
        (editLogs || []).forEach(e => {
          editCountMap[e.attendance_log_id] = (editCountMap[e.attendance_log_id] || 0) + 1;
        });

        filteredLogs.forEach(log => {
          coveredEmployees.add(log.employee_id);
          const shiftStatus = determineShiftStatus(log.employee_id, params.shift_id);

          const status = log.status || determineStatus(
            log.clock_in, log.clock_out, selectedShift?.start_time, lateThreshold, halfDayThreshold
          );

          logRecords.push({
            id: log.id,
            employee_id: log.employee_id,
            employee_name: log.employees?.name || 'Unknown',
            employee_code: log.employees?.employee_code || 'N/A',
            department: log.employees?.department?.name || 'N/A',
            date: log.date,
            clock_in: log.clock_in,
            clock_out: log.clock_out,
            total_hours: calculateTotalHours(log.clock_in, log.clock_out),
            status: status,
            has_edits: (editCountMap[log.id] || 0) > 0,
            edit_count: editCountMap[log.id] || 0,
            verification_method: log.verification_method,
            shift_status: shiftStatus,
            actual_shift: currentShiftName,
            assigned_shifts: getAssignedShiftNames(log.employee_id),
            matched_shift_id: log.shift_id || params.shift_id,
            clock_in_is_outside: locationScenarioMap[log.employee_id]?.clockInOutside || false,
            clock_out_is_outside: locationScenarioMap[log.employee_id]?.clockOutOutside || false,
            location_scenario: locationScenarioMap[log.employee_id]?.scenario || 'all'
          });
        });
      }

      const fallbackRecords: ProcessedTimeRecord[] = [];

      const groupedByEmployee: Record<string, any> = {};
      const employeeLastPunch: Record<string, { entry: string, timestamp: string, date: string }> = {};

      (timestamps || []).forEach(ts => {
        if (coveredEmployees.has(ts.employee_id)) return;

        if (!groupedByEmployee[ts.employee_id]) {
          groupedByEmployee[ts.employee_id] = {
            employee_id: ts.employee_id,
            employee: ts.employees,
            date: params.shift_date,
            timestamps_in: [],
            timestamps_out: [],
            hasPunchOnShiftDate: false
          };
        }

        const dateObj = new Date(ts.timestamp);
        const kolkataTime = new Date(dateObj.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
        const yyyy = kolkataTime.getFullYear();
        const mm = String(kolkataTime.getMonth() + 1).padStart(2, '0');
        const dd = String(kolkataTime.getDate()).padStart(2, '0');
        const actualDate = `${yyyy}-${mm}-${dd}`;
        
        let targetDate = actualDate;
        
        // Night Shift Grouping Logic:
        // If this is an OUT punch, and the last punch was an IN on a previous day,
        // AND it's less than 16 hours later, assign this OUT punch to that IN punch's date.
        const lastPunch = employeeLastPunch[ts.employee_id];
        if (ts.entry === 'OUT' && lastPunch?.entry === 'IN' && lastPunch.date !== actualDate) {
            const diffHours = (dateObj.getTime() - new Date(lastPunch.timestamp).getTime()) / (1000 * 60 * 60);
            if (diffHours <= 16) {
                targetDate = lastPunch.date;
            }
        }

        const tsTime = dateObj.getTime();
        
        // If the punch actually belongs to the current shift date being viewed
        if (targetDate === params.shift_date) {
            groupedByEmployee[ts.employee_id].hasPunchOnShiftDate = true;
            if (ts.entry === 'IN') groupedByEmployee[ts.employee_id].timestamps_in.push(tsTime);
            if (ts.entry === 'OUT') groupedByEmployee[ts.employee_id].timestamps_out.push(tsTime);
        }

        // Store the state for the next iteration (using the physical actualDate, not targetDate)
        employeeLastPunch[ts.employee_id] = { entry: ts.entry, timestamp: ts.timestamp, date: actualDate };
      });

      Object.values(groupedByEmployee).forEach((record: any) => {
        const clock_in = record.timestamps_in.length > 0
          ? new Date(Math.min(...record.timestamps_in)).toISOString()
          : null;
        const clock_out = record.timestamps_out.length > 0
          ? new Date(Math.max(...record.timestamps_out)).toISOString()
          : null;

        if (!clock_in && !clock_out) return;

        // Check if employee has a night shift assignment on params.shift_date
        let hasAssignedNightShift = false;
        const assignedShiftIds = scheduleMap.get(record.employee_id);
        if (assignedShiftIds) {
          for (const shiftId of assignedShiftIds) {
            const shift = get().shifts.find(s => s.id === shiftId);
            if (shift && shift.start_time && shift.end_time) {
              const startH = parseInt(shift.start_time.split(':')[0]);
              const endH = parseInt(shift.end_time.split(':')[0]);
              if (startH > endH) {
                hasAssignedNightShift = true;
                break;
              }
            }
          }
        }

        // If the employee has NO punches on the shift date itself AND they are not assigned to a night shift,
        // we discard the next-day punches for this shift date.
        if (!record.hasPunchOnShiftDate && !hasAssignedNightShift) {
          return;
        }

        const isScheduledForThisShift = scheduleMap.get(record.employee_id)?.has(params.shift_id);
        const bestFitShiftId = getBestFitShift(clock_in, clock_out);

        if (bestFitShiftId) {
            // If they have punches, they strictly belong to their best-fit shift view ONLY.
            if (bestFitShiftId !== params.shift_id) return;
        } else {
            // If they have NO punches, they only appear in their scheduled shift view.
            if (!isScheduledForThisShift) return;
        }

        const shiftStatus = determineShiftStatus(record.employee_id, params.shift_id);

        fallbackRecords.push({
          id: `ts_${record.employee_id}_${record.date}`,
          employee_id: record.employee_id,
          employee_name: record.employee?.name || 'Unknown',
          employee_code: record.employee?.employee_code || 'N/A',
          department: record.employee?.department?.name || 'N/A',
          date: record.date,
          clock_in,
          clock_out,
          total_hours: calculateTotalHours(clock_in, clock_out),
          status: determineStatus(clock_in, clock_out, selectedShift?.start_time, lateThreshold, halfDayThreshold),
          has_edits: false,
          edit_count: 0,
          verification_method: 'timestamp',
          shift_status: shiftStatus,
          actual_shift: currentShiftName,
          assigned_shifts: getAssignedShiftNames(record.employee_id),
          matched_shift_id: params.shift_id // Default to current view's shift
        });
      });

      // const finalRecords = [...logRecords, ...fallbackRecords].sort((a, b) => a.employee_name.localeCompare(b.employee_name));

      const employeesMap = new Map(get().employees.map(emp => [emp.id, emp]));

      const finalRecords = [...logRecords, ...fallbackRecords]
        .filter(record => {
          const emp = employeesMap.get(record.employee_id);
          return isEmployeeVisible(emp, record.date);
        })
        .sort((a, b) => a.employee_name.localeCompare(b.employee_name));



      set(state => ({
        ...setSuccess(state, finalRecords),
        dataSource: logRecords.length && fallbackRecords.length
          ? 'combined'
          : logRecords.length
            ? 'attendance_logs'
            : 'attendance_timestamp'
      }));

      get().calculateStatistics();

    } catch (error: any) {
      console.error('Fetch error:', error);
      const errorMessage = error?.message || error?.details || (error instanceof Error ? error.message : 'Failed to fetch time records');
      set(state => setError(state, errorMessage));
    }
  },

  fetchTimeRecordsByEmployee: async (params) => {
    const auth = await validateAuth();

    if (!auth.isAuthenticated) {
      set(state => setError(state, createAuthError().message));
      return;
    }

    if (!auth.tenantId) {
      set(state => setError(state, createTenantError().message));
      return;
    }

    set(state => setLoading(state));

    try {
      const { data: schedules } = await supabase
        .from('shift_assignments')
        .select('schedule_date, shift_id')
        .eq('tenant_id', auth.tenantId)
        .eq('employee_id', params.employee_id)
        .gte('schedule_date', params.start_date)
        .lte('schedule_date', params.end_date);

      const shiftNameMap = new Map(get().shifts.map(s => [s.id, s.name]));

      const scheduleByDate = new Map<string, Set<string>>();
      (schedules || []).forEach(s => {
        if (!scheduleByDate.has(s.schedule_date)) {
          scheduleByDate.set(s.schedule_date, new Set());
        }
        scheduleByDate.get(s.schedule_date)!.add(s.shift_id);
      });

      // Helper to get specific shift settings for a date
      const getSettingsForDate = (date: string, assignedShiftId?: string) => {
        let shiftId = assignedShiftId;
        
        // If no specific shift provided, grab the first one assigned
        if (!shiftId) {
            const assignedShifts = scheduleByDate.get(date);
            if (assignedShifts && assignedShifts.size > 0) {
                shiftId = Array.from(assignedShifts)[0];
            }
        }

        if (!shiftId) return { start: null, late: 15, halfDay: 240 };

        const shift = get().shifts.find(s => s.id === shiftId);
        const settings = get().shiftSettings[shiftId];

        return {
          start: shift?.start_time || null,
          late: settings?.late_threshold_minutes ?? 15,
          halfDay: settings?.half_day_threshold_minutes ?? 240
        };
      };

      const getAssignedShiftNames = (date: string) => {
        const shiftIds = Array.from(scheduleByDate.get(date) || []);
        return shiftIds.map(id => shiftNameMap.get(id) || 'Unknown Shift');
      };

      const determineEmployeeShiftStatus = (date: string, clockIn: string | null, clockOut: string | null): { status: 'regular' | 'wrong_shift' | 'unscheduled', shiftId?: string } => {
        const assignedShifts = scheduleByDate.get(date);
        
        let bestFitShiftId: string | undefined;
        if (clockIn || clockOut) {
          let minDifference = Infinity;
          for (const shift of get().shifts) {
            if (!shift.start_time || !shift.end_time) continue;
            
            const diffIn = getDiffForPunch(clockIn, shift, 'in');
            const diffOut = getDiffForPunch(clockOut, shift, 'out');

            let avgDiff = Infinity;
            if (diffIn !== null && diffOut !== null) {
               // Clock-in is a stronger indicator of the shift, give it 80% weight
               avgDiff = (diffIn * 0.8) + (diffOut * 0.2);
            } else if (diffIn !== null) {
               avgDiff = diffIn;
            } else if (diffOut !== null) {
               avgDiff = diffOut;
            }

            if (avgDiff < minDifference) {
               minDifference = avgDiff;
               bestFitShiftId = shift.id;
            }
          }
          if (minDifference > 300) bestFitShiftId = undefined;
        }

        if (!assignedShifts || assignedShifts.size === 0) return { status: 'unscheduled', shiftId: bestFitShiftId };

        if (clockIn) {
          const punchTime = new Date(clockIn);
          const punchHour = punchTime.getHours() + punchTime.getMinutes() / 60;

          // Find specific matching shift
          const matchedShiftId = Array.from(assignedShifts).find(shiftId => {
            const shift = get().shifts.find(s => s.id === shiftId);
            if (!shift) return false;

            const [startH, startM] = shift.start_time.split(':').map(Number);
            const [endH, endM] = shift.end_time.split(':').map(Number);
            const shiftStart = startH + startM / 60;
            const shiftEnd = endH + endM / 60;

            let minTime = shiftStart - 2;
            let maxTime = shiftEnd + 4;

            if (maxTime < minTime) maxTime += 24;
            let checkHour = punchHour;
            if (checkHour < minTime && maxTime > 24) checkHour += 24;

            return checkHour >= minTime && checkHour <= maxTime;
          });

          if (matchedShiftId) return { status: 'regular', shiftId: matchedShiftId };
          return { status: 'wrong_shift', shiftId: bestFitShiftId };
        }

        // If no punch, default to first assigned shift so we have an ID to save for Absent/Leave records
        return { status: 'regular', shiftId: Array.from(assignedShifts)[0] };
      };

      // --- NEW: Fetch all timestamps for this employee upfront to analyze location scenarios ---
      const startTSStr = new Date(`${params.start_date}T00:00:00`);
      const fetchStartTSStr = new Date(startTSStr.getTime() - 24 * 60 * 60 * 1000);
      const endTSStr = new Date(`${params.end_date}T23:59:59`);
      const endExtendedStr = new Date(endTSStr.getTime() + 12 * 60 * 60 * 1000);

      const { data: employeeTimestamps, error: empTsError } = await supabase
        .from('attendance_timestamp')
        .select(`*, employees (name, employee_code, department:departments (name))`)
        .eq('tenant_id', auth.tenantId)
        .eq('employee_id', params.employee_id)
        .gte('timestamp', fetchStartTSStr.toISOString())
        .lte('timestamp', endExtendedStr.toISOString())
        .order('timestamp', { ascending: true });

      if (empTsError) throw empTsError;

      const locationScenarioMap: Record<string, { clockInOutside: boolean, clockOutOutside: boolean, scenario: LocationScenarioFilter }> = {};
      const groupedByDate: Record<string, any[]> = {};

      (employeeTimestamps || []).forEach(ts => {
        const dateObj = new Date(ts.timestamp);
        const kolkataTime = new Date(dateObj.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
        const yyyy = kolkataTime.getFullYear();
        const mm = String(kolkataTime.getMonth() + 1).padStart(2, '0');
        const dd = String(kolkataTime.getDate()).padStart(2, '0');
        const actualDate = `${yyyy}-${mm}-${dd}`;
        
        if (!groupedByDate[actualDate]) {
            groupedByDate[actualDate] = [];
        }
        groupedByDate[actualDate].push(ts);
      });

      Object.keys(groupedByDate).forEach(date => {
          const punches = groupedByDate[date] || [];
          const inPunches = punches.filter(p => p.entry === 'IN').sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
          const outPunches = punches.filter(p => p.entry === 'OUT').sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

          const clockInOutside = inPunches.length > 0 && inPunches[0].office_location_status === 'Outside Office';
          const clockOutOutside = outPunches.length > 0 && outPunches[outPunches.length - 1].office_location_status === 'Outside Office';
          
          let scenario: LocationScenarioFilter = 'all';
          if (inPunches.length > 1 && clockInOutside) {
              const subsequentInOffice = inPunches.slice(1).some(p => p.office_location_status !== 'Outside Office');
              if (subsequentInOffice) {
                  scenario = 'in_outside_in_office';
              } else if (clockOutOutside) {
                  scenario = 'in_out_outside';
              } else {
                  scenario = 'outside_only';
              }
          } else if (clockInOutside && clockOutOutside) {
              scenario = 'in_out_outside';
          } else if (!clockInOutside && clockOutOutside) {
              scenario = 'in_office_out_outside';
          } else if (clockInOutside && !clockOutOutside) {
              scenario = 'outside_only';
          }

          locationScenarioMap[date] = { clockInOutside, clockOutOutside, scenario };
      });
      // --- END NEW ---

      const { data: attendanceLogs, error: logsError } = await supabase
        .from('attendance_logs')
        .select(`*, employees (name, email, employee_code, department:departments (name))`)
        .eq('tenant_id', auth.tenantId)
        .eq('employee_id', params.employee_id)
        .gte('date', params.start_date)
        .lte('date', params.end_date);
      if (logsError) throw logsError;

      const logRecords: ProcessedTimeRecord[] = [];
      const coveredDates = new Set<string>();

      if (attendanceLogs?.length) {
        const logIds = attendanceLogs.map(l => l.id);
        const editCountMap: Record<string, number> = {};

        const { data: editLogs } = await supabase
          .from('attendance_edit_logs')
          .select('attendance_log_id')
          .eq('tenant_id', auth.tenantId)
          .in('attendance_log_id', logIds);

        (editLogs || []).forEach(e => {
          editCountMap[e.attendance_log_id] = (editCountMap[e.attendance_log_id] || 0) + 1;
        });

        attendanceLogs.forEach(log => {
          coveredDates.add(log.date);

          // Use the stored shift_id if available, otherwise calculate
          const determination = determineEmployeeShiftStatus(log.date, log.clock_in, log.clock_out);
          const effectiveShiftId = log.shift_id || determination.shiftId;
          const daySettings = getSettingsForDate(log.date, effectiveShiftId);

          logRecords.push({
            id: log.id,
            employee_id: log.employee_id,
            employee_name: log.employees?.name || 'Unknown',
            employee_code: log.employees?.employee_code || 'N/A',
            department: log.employees?.department?.name || 'N/A',
            date: log.date,
            clock_in: log.clock_in,
            clock_out: log.clock_out,
            total_hours: calculateTotalHours(log.clock_in, log.clock_out),
            status: log.status || determineStatus(log.clock_in, log.clock_out, daySettings.start, daySettings.late, daySettings.halfDay),
            has_edits: (editCountMap[log.id] || 0) > 0,
            edit_count: editCountMap[log.id] || 0,
            verification_method: log.verification_method,
            shift_status: determination.status,
            assigned_shifts: getAssignedShiftNames(log.date),
            matched_shift_id: effectiveShiftId,
            clock_in_is_outside: locationScenarioMap[log.date]?.clockInOutside || false,
            clock_out_is_outside: locationScenarioMap[log.date]?.clockOutOutside || false,
            location_scenario: locationScenarioMap[log.date]?.scenario || 'all'
          });
        });
      }

      const allDates: string[] = [];
      const start = new Date(params.start_date);
      const end = new Date(params.end_date);

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        allDates.push(d.toISOString().split('T')[0]);
      }

      const missingDates = allDates.filter(d => !coveredDates.has(d));
      const fallbackRecords: ProcessedTimeRecord[] = [];

      if (missingDates.length) {
        const startTS = new Date(`${missingDates[0]}T00:00:00`);
        const fetchStartTS = new Date(startTS.getTime() - 24 * 60 * 60 * 1000);
        const endTS = new Date(`${missingDates.at(-1)}T23:59:59`);
        // Add 12 hours buffer to catch next morning punches if they exist
        const endExtended = new Date(endTS.getTime() + 12 * 60 * 60 * 1000);

        const { data: timestamps, error: tsError } = await supabase
          .from('attendance_timestamp')
          .select(`*, employees (name, employee_code, department:departments (name))`)
          .eq('tenant_id', auth.tenantId)
          .eq('employee_id', params.employee_id)
          .gte('timestamp', fetchStartTS.toISOString())
          .lte('timestamp', endExtended.toISOString())
          .order('timestamp', { ascending: true });

        if (tsError) throw tsError;

        const byDate: Record<string, any> = {};
        
        let lastPunch: any = null;
        let lastPunchDate: string | null = null;

        (timestamps || []).forEach(ts => {
          const localObj = new Date(ts.timestamp);
          const yyyy = localObj.getFullYear();
          const mm = String(localObj.getMonth() + 1).padStart(2, '0');
          const dd = String(localObj.getDate()).padStart(2, '0');
          const actualDate = `${yyyy}-${mm}-${dd}`;
          
          let targetDate = actualDate;

          // Night Shift Grouping Logic:
          // If this is an OUT punch, and the last punch was an IN on a previous day,
          // AND it's less than 16 hours later, assign this OUT punch to that IN punch's date.
          if (ts.entry === 'OUT' && lastPunch?.entry === 'IN' && lastPunchDate && lastPunchDate !== actualDate) {
              const diffHours = (new Date(ts.timestamp).getTime() - new Date(lastPunch.timestamp).getTime()) / (1000 * 60 * 60);
              if (diffHours <= 16) {
                  targetDate = lastPunchDate;
              }
          }

          if (missingDates.includes(targetDate)) {
            if (!byDate[targetDate]) {
              byDate[targetDate] = { employee: ts.employees, ins: [], outs: [] };
            }
            if (ts.entry === 'IN') byDate[targetDate].ins.push(new Date(ts.timestamp).getTime());
            if (ts.entry === 'OUT') byDate[targetDate].outs.push(new Date(ts.timestamp).getTime());
            
            // Ensure employee data is captured
            if (!byDate[targetDate].employee) byDate[targetDate].employee = ts.employees;
          }

          lastPunch = ts;
          lastPunchDate = actualDate; // Store the physical calendar date of this punch
        });

        Object.entries(byDate).forEach(([date, r]: any) => {
          const clock_in = r.ins.length ? new Date(Math.min(...r.ins)).toISOString() : null;
          const clock_out = r.outs.length ? new Date(Math.max(...r.outs)).toISOString() : null;

          const determination = determineEmployeeShiftStatus(date, clock_in, clock_out);
          const daySettings = getSettingsForDate(date, determination.shiftId);

          fallbackRecords.push({
            id: `fallback-${date}`,
            employee_id: params.employee_id,
            employee_name: r.employee?.name || 'Unknown',
            employee_code: r.employee?.employee_code || 'N/A',
            department: r.employee?.department?.name || 'N/A',
            date,
            clock_in,
            clock_out,
            total_hours: calculateTotalHours(clock_in, clock_out),
            status: determineStatus(clock_in, clock_out, daySettings.start, daySettings.late, daySettings.halfDay),
            has_edits: false,
            edit_count: 0,
            verification_method: 'timestamp',
            shift_status: determination.status,
            assigned_shifts: getAssignedShiftNames(date),
            matched_shift_id: determination.shiftId,
            clock_in_is_outside: locationScenarioMap[date]?.clockInOutside || false,
            clock_out_is_outside: locationScenarioMap[date]?.clockOutOutside || false,
            location_scenario: locationScenarioMap[date]?.scenario || 'all'
          });
        });
      }

      //const finalRecords = [...logRecords, ...fallbackRecords].sort((a, b) => b.date.localeCompare(a.date));

      const employee = get().employees.find(e => e.id === params.employee_id);

      const finalRecords = [...logRecords, ...fallbackRecords]
        .filter(record => isEmployeeVisible(employee, record.date))
        .sort((a, b) => b.date.localeCompare(a.date));

      set(state => ({
        ...setSuccess(state, finalRecords),
        dataSource: logRecords.length && fallbackRecords.length
          ? 'combined'
          : logRecords.length ? 'attendance_logs' : 'attendance_timestamp'
      }));

      get().calculateStatistics();

    } catch (error: any) {
      console.error('Fetch error:', error);
      const errorMessage = error?.message || error?.details || (error instanceof Error ? error.message : 'Failed to fetch attendance records');
      set(state => setError(state, errorMessage));
    }
  },

  fetchEditLogs: async (attendanceLogId) => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) return;

    try {
      const { data, error } = await supabase
        .from('attendance_edit_logs')
        .select('*')
        .eq('attendance_log_id', attendanceLogId)
        .eq('tenant_id', auth.tenantId)
        .order('edited_at', { ascending: false });

      if (error) throw error;

      set(state => ({
        ...state,
        editLogs: { ...state.editLogs, [attendanceLogId]: data || [] }
      }));
    } catch (error) {
      console.error('Failed to fetch edit logs:', error);
    }
  },

  createTimeStamp: async (request) => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated) throw createAuthError();
    if (!auth.tenantId) throw createTenantError();

    set(state => setLoading(state));

    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw createAuthError();

      let targetShiftId = request.shift_id;

      if (!targetShiftId) {
        const { data: assignment } = await supabase
          .from('shift_assignments')
          .select('shift_id')
          .eq('employee_id', request.employee_id)
          .eq('schedule_date', request.date)
          .eq('tenant_id', auth.tenantId)
          .single();

        if (assignment) targetShiftId = assignment.shift_id;
      }

      let shift = null;
      if (targetShiftId) {
        shift = get().shifts.find(s => s.id === targetShiftId) || null;
      }

      const status = await determineStatusWithValidation(
        auth.tenantId,
        request.employee_id,
        request.date,
        request.clock_in ?? null,
        request.clock_out ?? null,
        shift
      );

      const editorName = userData.user.user_metadata?.full_name || userData.user.user_metadata?.name || userData.user.email;

      const insertData: any = {
        tenant_id: auth.tenantId,
        employee_id: request.employee_id,
        date: request.date,
        clock_in: request.clock_in || null,
        clock_out: request.clock_out || null,
        status: status,
        notes: request.reason_for_change || request.notes || null,
        created_by: userData.user.id,
        shift_id: targetShiftId || null
      };

      const { data: insertedLog, error: logError } = await supabase
        .from('attendance_logs')
        .insert(insertData)
        .select('*')
        .single();

      if (logError) throw logError;

      if (shift && request.clock_in) {
        try {
          const dateObj = new Date(request.date);
          const clockInDate = request.clock_in ? new Date(request.clock_in) : null;
          const clockOutDate = request.clock_out ? new Date(request.clock_out) : null;

          const validationResult = await validateAttendance(
            auth.tenantId,
            request.employee_id,
            dateObj,
            clockInDate,
            clockOutDate,
            shift.start_time,
            shift.end_time,
            shift.break_start_time,
            shift.break_end_time
          );

          await recordAttendanceHistory(
            auth.tenantId,
            request.employee_id,
            insertedLog.id,
            dateObj,
            validationResult
          );
        } catch (historyError) {
          console.error('Error recording attendance history:', historyError);
        }
      }

      if (request.reason_for_change) {
        const { error: editLogError } = await supabase
          .from('attendance_edit_logs')
          .insert({
            tenant_id: auth.tenantId,
            attendance_log_id: insertedLog.id,
            employee_id: request.employee_id,
            original_clock_in: request.original_clock_in || null,
            original_clock_out: request.original_clock_out || null,
            modified_clock_in: request.clock_in || null,
            modified_clock_out: request.clock_out || null,
            reason_for_change: request.reason_for_change,
            edited_by: userData.user.id,
            edited_by_name: editorName,
          });

        if (editLogError) throw editLogError;
      }

      const employee = get().employees.find((emp: { id: any; }) => emp.id === insertedLog.employee_id) || null;
      const shiftName = targetShiftId ? get().shifts.find(s => s.id === targetShiftId)?.name : 'Unknown Shift';

      const newRecord: ProcessedTimeRecord = {
        id: insertedLog.id,
        employee_id: insertedLog.employee_id,
        employee_name: employee?.name || 'Unknown',
        employee_code: employee?.employee_code || 'N/A',
        department: employee?.department || 'N/A',
        date: insertedLog.date,
        clock_in: insertedLog.clock_in,
        clock_out: insertedLog.clock_out,
        total_hours: calculateTotalHours(insertedLog.clock_in, insertedLog.clock_out),
        status: insertedLog.status,
        has_edits: !!request.reason_for_change, 
        edit_count: request.reason_for_change ? 1 : 0,
        verification_method: insertedLog.verification_method,
        shift_status: 'regular',
        assigned_shifts: [shiftName || 'Unknown'],
        matched_shift_id: targetShiftId
      };

      set(state => ({
        ...state,
        items: [newRecord, ...state.items],
        loading: false,
        error: null
      }));

      get().calculateStatistics();

      if (request.reason_for_change) {
        await get().fetchEditLogs(insertedLog.id);
      }

    } catch (error: any) {
      console.error('Create TimeStamp Error details:', error);
      const errorMessage = error?.message || error?.details || (error instanceof Error ? error.message : 'Failed to create time stamp');
      set(state => setError(state, errorMessage));
      throw error;
    }
  },

  updateTimeStamp: async (request) => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated) throw createAuthError();
    if (!auth.tenantId) throw createTenantError();

    set(state => setLoading(state));

    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw createAuthError();

      const { data: originalLog, error: fetchError } = await supabase
        .from('attendance_logs')
        .select('clock_in, clock_out, employee_id, date, shift_id')
        .eq('id', request.attendance_log_id)
        .eq('tenant_id', auth.tenantId)
        .single();

      if (fetchError || !originalLog) throw new Error('Original attendance log not found for update.');

      let targetShiftId = request.shift_id || originalLog.shift_id;

      if (!targetShiftId) {
        const { data: assignment } = await supabase
          .from('shift_assignments')
          .select('shift_id')
          .eq('employee_id', originalLog.employee_id)
          .eq('schedule_date', originalLog.date)
          .single();
        if (assignment) targetShiftId = assignment.shift_id;
      }

      let shift = null;
      if (targetShiftId) {
        shift = get().shifts.find(s => s.id === targetShiftId) || null;
      }

      const newClockIn = request.clock_in !== undefined ? request.clock_in : originalLog.clock_in;
      const newClockOut = request.clock_out !== undefined ? request.clock_out : originalLog.clock_out;

      const newStatus = await determineStatusWithValidation(
        auth.tenantId,
        originalLog.employee_id,
        originalLog.date,
        newClockIn,
        newClockOut,
        shift
      );

      const editorName = userData.user.user_metadata?.full_name || userData.user.user_metadata?.name || userData.user.email;

      const { error: editLogError } = await supabase
        .from('attendance_edit_logs')
        .insert({
          tenant_id: auth.tenantId,
          attendance_log_id: request.attendance_log_id,
          employee_id: originalLog.employee_id,
          original_clock_in: originalLog.clock_in,
          original_clock_out: originalLog.clock_out,
          modified_clock_in: newClockIn,
          modified_clock_out: newClockOut,
          reason_for_change: request.reason_for_change,
          edited_by: userData.user.id,
          edited_by_name: editorName,
        });

      if (editLogError) throw editLogError;

      const updateData: Partial<AttendanceLog> = {
        notes: request.reason_for_change,
        status: newStatus,
        clock_in: newClockIn,
        clock_out: newClockOut,
        shift_id: targetShiftId || null 
      };

      const { data, error } = await supabase
        .from('attendance_logs')
        .update(updateData)
        .eq('id', request.attendance_log_id)
        .eq('tenant_id', auth.tenantId)
        .select(`
          *,
          employees (
            name,
            email,
            employee_code,
            department:departments (name)
          )
        `)
        .single();

      if (error) throw error;

      if (shift && newClockIn) {
        try {
          const dateObj = new Date(originalLog.date);
          const clockInDate = newClockIn ? new Date(newClockIn) : null;
          const clockOutDate = newClockOut ? new Date(newClockOut) : null;

          const validationResult = await validateAttendance(
            auth.tenantId,
            originalLog.employee_id,
            dateObj,
            clockInDate,
            clockOutDate,
            shift.start_time,
            shift.end_time,
            shift.break_start_time,
            shift.break_end_time
          );

          await recordAttendanceHistory(
            auth.tenantId,
            originalLog.employee_id,
            request.attendance_log_id,
            dateObj,
            validationResult
          );
        } catch (historyError) {
          console.error('Error recording attendance history:', historyError);
        }
      }

      const { data: editCountData } = await supabase
        .from('attendance_edit_logs')
        .select('id', { count: 'exact' })
        .eq('attendance_log_id', request.attendance_log_id);

      const editCount = editCountData?.length || 0;
      const employee = data.employees;
      const shiftName = targetShiftId ? get().shifts.find(s => s.id === targetShiftId)?.name : 'Unknown Shift';

      const updatedRecord: ProcessedTimeRecord = {
        id: data.id,
        employee_id: data.employee_id,
        employee_name: employee?.name || 'Unknown',
        employee_code: employee?.employee_code || 'N/A',
        department: employee?.department?.name || 'N/A',
        date: data.date,
        clock_in: data.clock_in,
        clock_out: data.clock_out,
        total_hours: calculateTotalHours(data.clock_in, data.clock_out),
        status: data.status, 
        has_edits: editCount > 0,
        edit_count: editCount,
        verification_method: data.verification_method,
        shift_status: data.shift_status || 'regular',
        assigned_shifts: [shiftName || 'Unknown'],
        matched_shift_id: targetShiftId 
      };

      set(state => updateItem(state, request.attendance_log_id, updatedRecord));
      get().calculateStatistics();
      await get().fetchEditLogs(request.attendance_log_id);

    } catch (error: any) {
      console.error('Update TimeStamp Error details:', error);
      const errorMessage = error?.message || error?.details || (error instanceof Error ? error.message : 'Failed to update time stamp');
      set(state => setError(state, errorMessage));
      throw error;
    }
  },

  saveToAttendanceLogs: async (records) => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated) throw createAuthError();
    if (!auth.tenantId) throw createTenantError();

    set(state => setLoading(state));

    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw createAuthError();

      // Fetch active Comp Off leave type
      const { data: leaveTypes } = await supabase
        .from('leave_types')
        .select('id, name')
        .eq('tenant_id', auth.tenantId)
        .eq('is_active', true);

      const compOffLeaveType = leaveTypes?.find(lt => 
        lt.name.toLowerCase().includes('comp off') || 
        lt.name.toLowerCase().includes('compensatory')
      );
      const compOffLeaveTypeId = compOffLeaveType?.id;

      // Fetch holidays if there is a comp off leave type
      const holidayDates = new Set<string>();
      if (compOffLeaveTypeId && records.length > 0) {
        const dates = records.map(r => r.date.split('T')[0]);
        const minDate = dates.reduce((a, b) => a < b ? a : b);
        const maxDate = dates.reduce((a, b) => a > b ? a : b);
        
        try {
          const holidays = await getHolidays(minDate, maxDate);
          holidays.forEach((h: any) => holidayDates.add(h.date));
        } catch (err) {
          console.error("Failed to fetch holidays for comp off processing", err);
        }
      }

      const validatedPayload = [];
      const validationResultsMap = new Map(); 

      for (const record of records) {
        let shift = null;

        if (record.matched_shift_id) {
          shift = get().shifts.find(s => s.id === record.matched_shift_id) || null;
        }

        const finalStatus = await determineStatusWithValidation(
          auth.tenantId,
          record.employee_id,
          record.date.split('T')[0], 
          record.clock_in ?? null,
          record.clock_out ?? null,
          shift
        );

        if (shift && record.clock_in) {
          const logDate = new Date(record.date);
          const clockIn = new Date(record.clock_in);
          const clockOut = record.clock_out ? new Date(record.clock_out) : null;

          const vResult = await validateAttendance(
            auth.tenantId,
            record.employee_id,
            logDate,
            clockIn,
            clockOut,
            shift.start_time,
            shift.end_time,
            shift.break_start_time,
            shift.break_end_time
          );

          validationResultsMap.set(`${record.employee_id}_${record.date.split('T')[0]}`, vResult);
        }

        validatedPayload.push({
          tenant_id: auth.tenantId,
          employee_id: record.employee_id,
          date: record.date.split('T')[0],
          clock_in: record.clock_in,
          clock_out: record.clock_out,
          status: finalStatus, 
          created_by: user.user.id,
          verification_method: record.verification_method ?? 'manual',
          shift_id: record.matched_shift_id || null
        });
      }

      const { data: savedLogs, error } = await supabase
        .from('attendance_logs')
        .upsert(validatedPayload, {
          onConflict: 'employee_id,date',
        })
        .select('*');

      if (error) throw error;

      if (savedLogs && savedLogs.length > 0) {
        for (const log of savedLogs) {
          const key = `${log.employee_id}_${log.date}`;
          const vResult = validationResultsMap.get(key);
          
          if (vResult) {
            await recordAttendanceHistory(
              auth.tenantId, 
              log.employee_id, 
              log.id, 
              new Date(log.date), 
              vResult
            );
          }

          // Auto-credit Comp Off
          if (compOffLeaveTypeId && log.clock_in) {
            const [year, month, day] = log.date.split('-').map(Number);
            const dateObj = new Date(year, month - 1, day);
            const isSunday = dateObj.getDay() === 0;
            const isHoliday = holidayDates.has(log.date);

            if (isSunday || isHoliday) {
              // Determine credit amount based on final status
              let creditAmount = 1.0;
              const halfDayStatuses = ['Half Day', 'First Off', 'Second Off'];
              if (halfDayStatuses.includes(log.status)) {
                creditAmount = 0.5;
              } else if (log.status === 'Absent') {
                creditAmount = 0.0;
              }

              console.log(`[Auto-Credit Comp Off] Attempting to credit ${creditAmount} for employee ${log.employee_id} on ${log.date}. Leave type: ${compOffLeaveTypeId}`);
              const { error: creditErr } = await supabase.rpc('auto_credit_comp_off', {
                p_tenant_id: auth.tenantId,
                p_employee_id: log.employee_id,
                p_date: log.date,
                p_leave_type_id: compOffLeaveTypeId,
                p_credit_amount: creditAmount
              });
              
              if (creditErr) {
                console.error('[Auto-Credit Comp Off] RPC Failed:', creditErr);
              } else {
                console.log(`[Auto-Credit Comp Off] Successfully processed credit for ${log.date}`);
              }
            }
          }
        }
      }

      const currentItems = get().items;
      const updatedItems = currentItems.map(item => {
        const savedMatch = savedLogs?.find(l => l.employee_id === item.employee_id && l.date === item.date);
        if (savedMatch) {
          return { ...item, status: savedMatch.status, id: savedMatch.id };
        }
        return item;
      });

      set(state => setSuccess(state, updatedItems));
      get().calculateStatistics();

    } catch (error: any) {
      console.error('Supabase Save Error details:', error);
      const msg = error?.message || error?.details || (error instanceof Error ? error.message : 'Failed to save to attendance logs');
      set(state => setError(state, msg));
      throw error;
    }
  },

  calculateStatistics: () => {
    const items = get().items;

    const stats: TimeStampStatistics = {
      total_records: items.length,
      present: items.filter(item => item.status === 'Present').length,
      absent: items.filter(item => item.status === 'Absent').length,
      late: items.filter(item => item.status === 'Late').length,
      early_leave: items.filter(item => item.status === 'Half Day').length,
      edited_records: items.filter(item => item.has_edits).length
    };

    set({ statistics: stats });
  },

  reset: () => {
    set({
      ...initialStoreState<ProcessedTimeRecord>(),
      shifts: [],
      employees: [],
      shiftSettings: {},
      editLogs: {},
      statistics: null
    });
  }
}));