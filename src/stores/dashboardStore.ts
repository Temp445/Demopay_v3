import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { validateAuth } from './utils/storeUtils';

interface DashboardStatistics {
  totalEmployees: number;
  activeEmployees: number;
  onLeave: number;
  pendingLeaveRequests: number;
  todayAttendanceRate: number;
  currentMonthAttendanceRate: number;
  upcomingHolidays: number;
  pendingPayroll: number;
}

interface DashboardStore {
  statistics: DashboardStatistics | null;
  loading: boolean;
  fetchStatistics: (targetDate?: Date) => Promise<void>;
}

export const useDashboardStore = create<DashboardStore>((set) => ({
  statistics: null,
  loading: false,
  fetchStatistics: async (targetDate) => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) {
      return;
    }

    set({ loading: true });

    try {
      const now = new Date();
      const referenceDate = targetDate || now;

      // Determine if the selected date falls in the current month and year
      const isCurrentMonth =
        referenceDate.getMonth() === now.getMonth() &&
        referenceDate.getFullYear() === now.getFullYear();

      const todayStr = now.toISOString().split('T')[0];
      const firstDayOfMonth = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1).toISOString().split('T')[0];
      const lastDayOfMonth = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0).toISOString().split('T')[0];

      // Fetch all employees
      const { data: employees, error: employeesError } = await supabase
        .from('employees')
        .select('id, status')
        .eq('tenant_id', auth.tenantId);

      if (employeesError) throw employeesError;

      const totalEmployees = employees?.length || 0;
      const activeEmployees = employees?.filter(e => e.status === 'Active').length || 0;

      let leaveQuery = supabase
        .from('leave_requests')
        .select('employee_id')
        .eq('tenant_id', auth.tenantId)
        .eq('status', 'Approved');

      if (isCurrentMonth) {
        leaveQuery = leaveQuery
          .lte('start_date', todayStr)
          .gte('end_date', todayStr);
      } else {
        leaveQuery = leaveQuery
          .lte('start_date', lastDayOfMonth)
          .gte('end_date', firstDayOfMonth);
      }

      const { data: activeLeaves, error: activeLeavesError } = await leaveQuery;
      if (activeLeavesError) throw activeLeavesError;

      // Count unique employees on leave based on the conditions above
      const onLeave = new Set(activeLeaves?.map(l => l.employee_id)).size;
      // ---------------------------------------------------------

      // Fetch pending leave requests
      const { data: leaveRequests, error: leaveError } = await supabase
        .from('leave_requests')
        .select('id')
        .eq('tenant_id', auth.tenantId)
        .eq('status', 'Pending');

      if (leaveError) throw leaveError;
      const pendingLeaveRequests = leaveRequests?.length || 0;

      // Fetch today's attendance
      const { data: todayAttendance, error: todayAttendanceError } = await supabase
        .from('attendance_logs')
        .select('employee_id')
        .eq('tenant_id', auth.tenantId)
        .eq('date', todayStr);

      if (todayAttendanceError) throw todayAttendanceError;

      const uniquePresentToday = new Set(todayAttendance?.map(log => log.employee_id)).size;

      const todayAttendanceRate = activeEmployees > 0
        ? Math.round((uniquePresentToday / activeEmployees) * 100)
        : 0;

      // Fetch attendance for the SELECTED month
      const { data: monthAttendance, error: monthAttendanceError } = await supabase
        .from('attendance_logs')
        .select('employee_id, clock_in')
        .eq('tenant_id', auth.tenantId)
        .gte('clock_in', firstDayOfMonth)
        .lte('clock_in', lastDayOfMonth);

      if (monthAttendanceError) throw monthAttendanceError;

      const workingDaysInMonth = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0).getDate();
      const expectedAttendance = activeEmployees * workingDaysInMonth;
      const actualAttendance = monthAttendance?.length || 0;
      const currentMonthAttendanceRate = expectedAttendance > 0
        ? Math.round((actualAttendance / expectedAttendance) * 100)
        : 0;

      set({
        statistics: {
          totalEmployees,
          activeEmployees,
          onLeave,
          pendingLeaveRequests,
          todayAttendanceRate,
          currentMonthAttendanceRate,
          upcomingHolidays: 0,
          pendingPayroll: 0,
        },
        loading: false,
      });
    } catch (error) {
      console.error('Error fetching dashboard statistics:', error);
      set({ loading: false });
    }
  },
}));