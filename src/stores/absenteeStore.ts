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
  type StoreState,
} from './utils/storeUtils';

export interface AbsenteeRecord {
  employee_id: string;
  employee_name: string;
  employee_code: string;
  department: string;
  absent_date: string;
  is_holiday: boolean;
  has_leave_request: boolean;
  status?: string; // Added to track First Off / Second Off
}

interface AbsenteeStore extends StoreState<AbsenteeRecord> {
  fetchAbsentees: (
    startDate: string,
    endDate: string,
    employeeId?: string
  ) => Promise<void>;
  reset: () => void;
}

// Helper: Fetch all attendance logs in date range with pagination
const fetchAllAttendanceLogs = async (
  tenantId: string,
  startDate: string,
  endDate: string
) => {
  const PAGE_SIZE = 1000;
  let allLogs: any[] = [];
  let from = 0;
  let to = PAGE_SIZE - 1;

  while (true) {
    const { data, error } = await supabase
      .from('attendance_logs')
      .select('employee_id, date, clock_in, clock_out, status') // Added status
      .eq('tenant_id', tenantId)
      .gte('date', startDate)
      .lte('date', endDate)
      .range(from, to);

    if (error) throw error;
    if (!data || data.length === 0) break;

    allLogs = allLogs.concat(data);

    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
    to += PAGE_SIZE;
  }

  return allLogs;
};

// Helper: Check recurring holidays (Pure logic)
const isRecurringHoliday = (date: Date, patterns: any[]): boolean => {
  const weekdayNames = [
    'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'
  ];
  const dayName = weekdayNames[date.getDay()];
  const day = date.getDate();

  const weekOccurrence =
    day <= 7 ? 'first'
      : day <= 14 ? 'second'
        : day <= 21 ? 'third'
          : day <= 28 ? 'fourth'
            : 'last';

  return patterns.some(
    (r) =>
      r.week_day.toLowerCase() === dayName &&
      (r.week_occurrence === 'all' || r.week_occurrence === weekOccurrence)
  );
};

// Helper: Safe Date String (YYYY-MM-DD) without Timezone shifts
const toLocalISOString = (date: Date): string => {
  const offset = date.getTimezoneOffset();
  const adjustedDate = new Date(date.getTime() - (offset * 60 * 1000));
  return adjustedDate.toISOString().split('T')[0];
};

export const useAbsenteeStore = create<AbsenteeStore>((set, get) => ({
  ...initialStoreState<AbsenteeRecord>(),

  fetchAbsentees: async (startDate, endDate, employeeId?: string) => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) {
      set((state) => setError(state, "Authentication or Tenant ID missing"));
      return;
    }

    set((state) => setLoading(state));

    try {
      const [
        employeesRes,
        logsRes,
        holidaysRes,
        recurringRes,
        leavesRes
      ] = await Promise.all([
        supabase
          .from('employees')
          .select('id, name, employee_code, department:departments(name), status, status_date')
          .eq('tenant_id', auth.tenantId),
        // .eq('status', 'Active'),
        fetchAllAttendanceLogs(auth.tenantId, startDate, endDate),
        supabase
          .from('holidays')
          .select('date')
          .eq('tenant_id', auth.tenantId)
          .gte('date', startDate)
          .lte('date', endDate),
        supabase
          .from('holiday_recurring_patterns')
          .select('week_day, week_occurrence')
          .eq('tenant_id', auth.tenantId),
        supabase
          .from('leave_requests')
          .select('employee_id, start_date, end_date, status')
          .eq('tenant_id', auth.tenantId)
          .in('status', ['Approved', 'Pending', 'approved', 'pending'])
          .or(`start_date.lte.${endDate},end_date.gte.${startDate}`)
      ]);

      if (employeesRes.error) throw employeesRes.error;

      const employees = employeesRes.data || [];
      const logs = logsRes || [];
      const holidays = holidaysRes.data || [];
      const recurring = recurringRes.data || [];
      const leaves = leavesRes.data || [];

      if (employees.length === 0) {
        set((state) => setSuccess(state, []));
        return;
      }

      const presentMap = new Set<string>();
      const halfDayMap = new Map<string, string>(); // Map to store half-off statuses

      logs.forEach(log => {
        const key = `${log.employee_id}-${log.date}`;
        if (log.status === 'First Off' || log.status === 'Second Off' || log.status === 'Absent') {
          halfDayMap.set(key, log.status);
        } else if (log.clock_in && log.clock_out) {
          presentMap.add(key);
        }
      });

      const holidayDates = new Set(holidays.map(h => h.date));
      const report: AbsenteeRecord[] = [];

      const dateArray: Date[] = [];
      let dt = new Date(startDate);
      const end = new Date(endDate);

      while (dt <= end) {
        dateArray.push(new Date(dt));
        dt.setDate(dt.getDate() + 1);
      }

      const filteredEmployees = employeeId
        ? employees.filter(emp => emp.id === employeeId)
        : employees;

      filteredEmployees.forEach(emp => {
        dateArray.forEach(d => {
          const dateStr = toLocalISOString(d);

          if (holidayDates.has(dateStr)) return;
          if (isRecurringHoliday(d, recurring)) return;

          // ✅ FIX: Skip dates after employee relieved
          if (emp.status_date && dateStr > emp.status_date && emp.status && ['relieved', 'terminated'].includes(emp.status.toLowerCase())) {
            return;
          }

          const isOnLeave = leaves.some(l =>
            l.employee_id === emp.id &&
            dateStr >= l.start_date &&
            dateStr <= l.end_date
          );
          if (isOnLeave) return;

          const key = `${emp.id}-${dateStr}`;
          const isPresent = presentMap.has(key);
          const halfDayStatus = halfDayMap.get(key);

          // If they are strictly absent OR they have a First/Second Off status logged
          if (!isPresent || halfDayStatus) {
            report.push({
              employee_id: emp.id,
              employee_name: emp.name,
              employee_code: emp.employee_code || 'N/A',
              department: emp.department?.name || '-',
              absent_date: dateStr,
              is_holiday: false,
              has_leave_request: false,
              status: halfDayStatus || 'Absent', // Assign the exact status
            });
          }
        });
      });

      set((state) => setSuccess(state, report));

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch absentees';
      set((state) => setError(state, errorMessage));
    }
  },

  reset: () => {
    set(initialStoreState<AbsenteeRecord>());
  },
}));