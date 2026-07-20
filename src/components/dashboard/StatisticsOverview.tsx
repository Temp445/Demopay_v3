import React, { useEffect, useState } from 'react';
import {
  DollarSign,
  Users,
  Clock,
  TrendingUp,
  Calendar as CalendarIcon,
  ClipboardList,
  CheckCircle,
  AlertCircle,
  Timer,
  Briefcase,
  ChevronRight,
  IndianRupee,
  CalendarDays,
  LogIn,
  LogOut,
  Activity
} from 'lucide-react';
import { useDashboardStore } from '../../stores/dashboardStore';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { useRoleAccess } from '../../hooks/useRoleAccess';

// --- Types ---
interface EmployeeDashboardData {
  shiftDetails: {
    shiftName: string;
    startTime: string;
    endTime: string;
    shiftType: string;
    scheduleDate: string;
  } | null;
  monthlyShifts: Array<{
    date: string;
    shiftName: string;
    startTime: string;
    endTime: string;
    shiftType: string;
  }>;
  leaveBalances: Array<{
    leaveType: string;
    totalDays: number;
    usedDays: number;
    remainingDays: number;
  }>;
  advanceDetails: {
    remainingBalance: any;
    approvedAmount: number;
    approvedInstallments: number;
  } | null;
  permissionBalance: {
    minutes: any;
    early: any;
    late: any;
    lateBalance: number;
    earlyExitBalance: number;
    permissionBalanceMinutes: number;
  } | null;
  attendancePercentage: number;
  todayLogs: Array<{
    entry: string;
    timestamp: string;
    timing_status: string;
    shift_status: string | null;
  }>;
}

// --- Reusable UI Components ---
const CircularProgress = ({ percentage, colorClass }: { percentage: number, colorClass: string }) => {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const safePercentage = Math.min(Math.max(percentage || 0, 0), 100);
  const strokeDashoffset = circumference - (safePercentage / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg className="w-24 h-24 transform -rotate-90">
        <circle
          className="text-gray-100"
          strokeWidth="8"
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx="48"
          cy="48"
        />
        <circle
          className={colorClass}
          strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx="48"
          cy="48"
          style={{ transition: 'stroke-dashoffset 1s ease-in-out' }}
        />
      </svg>
      <span className="absolute text-xl font-bold text-gray-800">{safePercentage}%</span>
    </div>
  );
};

// --- Calendar Component ---
const ShiftCalendar = ({ shifts }: { shifts: EmployeeDashboardData['monthlyShifts'] }) => {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();
  const currentMonthName = new Date().toLocaleString('default', { month: 'long' });


  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-2 md:p-6 hover:shadow-md transition-shadow">
      <div className="flex items-center space-x-3 mb-6">
        <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl">
          <CalendarDays className="w-5 h-5" />
        </div>
        <h4 className="text-lg uppercase text-gray-900"> {currentMonthName} Month Shift Schedule</h4>
      </div>

      <div className="grid grid-cols-7 gap-1 md:gap-2">
        {weekDays.map(day => (
          <div key={day} className="text-center text-xs font-semibold text-gray-500 py-2">
            {day}
          </div>
        ))}

        {Array.from({ length: firstDayOfMonth }).map((_, i) => (
          <div key={`empty-${i}`} className="p-2"></div>
        ))}

        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const shift = shifts?.find(s => s.date === dateStr);
          const isToday = today.getDate() === day;

          return (
            <div
              key={day}
              className={`min-h-[80px] md:p-2 border rounded-xl flex flex-col transition-colors ${isToday
                  ? 'border-indigo-500 bg-indigo-50/30'
                  : 'border-gray-100 bg-gray-50/50 hover:bg-gray-50'
                }`}
            >
              <span className={`text-xs font-semibold mb-1 ${isToday ? 'text-indigo-600' : 'text-gray-700'}`}>
                {day}
              </span>

              {shift && (
                <div className="mt-auto md:p-1.5 p-0.5  bg-white border border-gray-100 shadow-sm rounded-lg flex flex-col gap-0.5">
                  <span className="text-[10px] font-bold text-gray-800 truncate" title={shift.shiftName}>
                    {shift.shiftName}
                  </span>
                  <span className="text-[9px] font-medium text-gray-500">
                    {shift.startTime.slice(0, 5)} - {shift.endTime.slice(0, 5)}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default function StatisticsOverview() {
  const { statistics, loading: statsLoading, fetchStatistics } = useDashboardStore();
  const { tenantId } = useAuth();
  const { isEmployee, role, employeeId, loading: roleLoading } = useRoleAccess();
  const showEmployeeView = isEmployee || role === 'Reporting Head';

  const [employeeData, setEmployeeData] = useState<EmployeeDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));

  const currentMonthName = new Date().toLocaleString('default', { month: 'long' });

  const currentYearMonth = new Date().toISOString().slice(0, 7); // Gets "YYYY-MM"
  const isCurrentMonth = selectedMonth === currentYearMonth;

  useEffect(() => {
    if (roleLoading) return;

    if (showEmployeeView && employeeId && tenantId) {
      fetchEmployeeDashboardData(employeeId, tenantId);
    } else if (!showEmployeeView) {
      // Convert "YYYY-MM" string to a Date object
      const [year, month] = selectedMonth.split('-').map(Number);
      fetchStatistics(new Date(year, month - 1));
      setLoading(false);
    } else {
      setLoading(false);
    }
  }, [showEmployeeView, employeeId, tenantId, roleLoading, fetchStatistics, selectedMonth]);

  useEffect(() => {
    if (roleLoading) return;

    if (showEmployeeView && employeeId && tenantId) {
      fetchEmployeeDashboardData(employeeId, tenantId);
    } else if (!showEmployeeView) {
      fetchStatistics();
      setLoading(false);
    } else {
      setLoading(false);
    }
  }, [showEmployeeView, employeeId, tenantId, roleLoading, fetchStatistics]);

  const fetchEmployeeDashboardData = async (currentEmployeeId: string, currentTenantId: string) => {
    setLoading(true);
    try {
      const [
        shiftData,
        monthlyShiftsData,
        leaveData,
        advanceData,
        balanceData,
        attendanceData,
        todayLogsData
      ] = await Promise.all([
        fetchShiftDetails(currentEmployeeId, currentTenantId),
        fetchMonthlyShifts(currentEmployeeId, currentTenantId),
        fetchLeaveBalances(currentEmployeeId, currentTenantId),
        fetchAdvanceDetails(currentEmployeeId, currentTenantId),
        fetchPermissionBalance(currentEmployeeId, currentTenantId),
        fetchAttendancePercentage(currentEmployeeId, currentTenantId),
        fetchTodayAttendanceLogs(currentEmployeeId, currentTenantId)
      ]);

      setEmployeeData({
        shiftDetails: shiftData,
        monthlyShifts: monthlyShiftsData,
        leaveBalances: leaveData,
        advanceDetails: advanceData,
        permissionBalance: balanceData,
        attendancePercentage: attendanceData,
        todayLogs: todayLogsData
      });
    } catch (err) {
      console.error('Error fetching employee dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTodayAttendanceLogs = async (empId: string, tenId: string) => {
    try {
      const today = new Date();
      // Ensure we use local date string for querying the 'date' column
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      const localDateStr = `${year}-${month}-${day}`;

      const startOfDay = new Date(today.setHours(0, 0, 0, 0)).toISOString();
      const endOfDay = new Date(today.setHours(23, 59, 59, 999)).toISOString();

      // 1. Fetch from consolidated attendance_logs (Priority)
      const { data: logData } = await supabase
        .from('attendance_logs')
        .select('clock_in, clock_out, status')
        .eq('employee_id', empId)
        .eq('tenant_id', tenId)
        .eq('date', localDateStr)
        .maybeSingle();

      // 2. Fetch raw timestamps
      const { data: rawPunches } = await supabase
        .from('attendance_timestamp')
        .select('entry, timestamp, timing_status')
        .eq('employee_id', empId)
        .eq('tenant_id', tenId)
        .gte('timestamp', startOfDay)
        .lte('timestamp', endOfDay)
        .order('timestamp', { ascending: true });

      let finalClockIn = null;
      let finalClockOut = null;
      let inStatus = 'OK';
      let outStatus = 'OK';

      // Evaluate Earliest Clock In
      if (logData?.clock_in) {
        finalClockIn = logData.clock_in;
      } else if (rawPunches && rawPunches.length > 0) {
        const firstIn = rawPunches.find(p => p.entry === 'IN');
        if (firstIn) {
          finalClockIn = firstIn.timestamp;
          inStatus = firstIn.timing_status;
        }
      }

      // Evaluate Latest Clock Out
      if (logData?.clock_out) {
        finalClockOut = logData.clock_out;
      } else if (rawPunches && rawPunches.length > 0) {
        const outs = rawPunches.filter(p => p.entry === 'OUT');
        if (outs.length > 0) {
          const lastOut = outs[outs.length - 1]; // Already sorted ascending
          finalClockOut = lastOut.timestamp;
          outStatus = lastOut.timing_status;
        }
      }

      // Construct final array for UI display
      const combinedLogs = [];
      if (finalClockIn) {
        combinedLogs.push({
          entry: 'IN',
          timestamp: finalClockIn,
          timing_status: inStatus,
          shift_status: logData?.status || null
        });
      }
      if (finalClockOut) {
        combinedLogs.push({
          entry: 'OUT',
          timestamp: finalClockOut,
          timing_status: outStatus,
          shift_status: logData?.status || null
        });
      }

      return combinedLogs;
    } catch (err) {
      console.error('Error fetching today attendance logs:', err);
      return [];
    }
  };

  const fetchMonthlyShifts = async (empId: string, tenId: string) => {
    try {
      const today = new Date();
      const year = today.getFullYear();
      const month = today.getMonth();

      const startOfMonth = new Date(year, month, 1).toISOString().split('T')[0];
      const endOfMonth = new Date(year, month + 1, 0).toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('shift_assignments')
        .select(`
          schedule_date,
          shifts!inner (
            name,
            start_time,
            end_time,
            shift_type
          )
        `)
        .eq('employee_id', empId)
        .eq('tenant_id', tenId)
        .gte('schedule_date', startOfMonth)
        .lte('schedule_date', endOfMonth);

      if (error || !data) return [];

      return data.map((item: any) => ({
        date: item.schedule_date,
        shiftName: item.shifts.name,
        startTime: item.shifts.start_time,
        endTime: item.shifts.end_time,
        shiftType: item.shifts.shift_type
      }));
    } catch (err) {
      console.error('Error fetching monthly shifts:', err);
      return [];
    }
  };

  const fetchShiftDetails = async (empId: string, tenId: string) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('shift_assignments')
        .select(`
          schedule_date,
          shifts!inner (
            name,
            start_time,
            end_time,
            shift_type
          )
        `)
        .eq('employee_id', empId)
        .eq('tenant_id', tenId)
        .eq('schedule_date', today)
        .maybeSingle();

      if (error || !data) return null;

      return {
        shiftName: data.shifts.name,
        startTime: data.shifts.start_time,
        endTime: data.shifts.end_time,
        shiftType: data.shifts.shift_type,
        scheduleDate: data.schedule_date
      };
    } catch (err) {
      console.error('Error fetching shift details:', err);
      return null;
    }
  };

  const fetchLeaveBalances = async (empId: string, tenId: string) => {
    try {
      const currentYear = new Date().getFullYear();
      const { data, error } = await supabase
        .from('leave_balances')
        .select(`
          total_days,
          used_days,
          leave_types!inner (
            name
          )
        `)
        .eq('employee_id', empId)
        .eq('tenant_id', tenId)
        .eq('year', currentYear);

      if (error || !data) return [];

      return data
        .filter((item: any) => {
          const name = item.leave_types?.name?.toUpperCase();
          return name !== 'LOP' && name !== 'LOSS OF PAY';
        })
        .map((item: any) => ({
          leaveType: item.leave_types?.name || 'Unknown',
          totalDays: item.total_days || 0,
          usedDays: item.used_days || 0,
          remainingDays: (item.total_days || 0) - (item.used_days || 0)
        }));
    } catch (err) {
      console.error('Error fetching leave balances:', err);
      return [];
    }
  };

  const fetchAdvanceDetails = async (empId: string, tenId: string) => {
    try {
      const { data, error } = await supabase
        .from('employee_advances')
        .select('approved_amount, remaining_balance')
        .eq('employee_id', empId)
        .eq('tenant_id', tenId)
        .in('status', ['approved', 'active'])
        .maybeSingle();

      if (error || !data) return null;

      return {
        approvedAmount: data.approved_amount || 0,
        remainingBalance: data.remaining_balance || 0
      };
    } catch (err) {
      console.error('Error fetching advance details:', err);
      return null;
    }
  };

  const fetchPermissionBalance = async (empId: string, tenId: string) => {
    try {
      const today = new Date();
      const currentMonth = today.getMonth() + 1;
      const currentYear = today.getFullYear();

      const { data, error } = await supabase
        .from('employee_permission_balance')
        .select('*')
        .eq('employee_id', empId)
        .eq('tenant_id', tenId)
        .eq('month', currentMonth)
        .eq('year', currentYear)
        .maybeSingle();

      if (error || !data) return null;

      const lateRemaining = (data.total_allowed_late_entry_count || 0) - (data.late_entry_count || 0);
      const earlyRemaining = (data.total_allowed_early_exit_count || 0) - (data.early_exit_count || 0);

      return {
        late: { remaining: lateRemaining, total: data.total_allowed_late_entry_count || 0 },
        early: { remaining: earlyRemaining, total: data.total_allowed_early_exit_count || 0 },
        minutes: {
          remaining: data.remaining_minutes || 0,
          total: data.total_allowed_minutes || 0
        }
      };
    } catch (err) {
      console.error('Error fetching permission balance:', err);
      return null;
    }
  };

  const fetchAttendancePercentage = async (empId: string, tenId: string) => {
    try {
      const today = new Date();
      const year = today.getFullYear();
      const month = today.getMonth();

      const startOfMonth = new Date(year, month, 1);
      const endOfMonth = new Date(year, month + 1, 0);

      const startStr = startOfMonth.toISOString().split('T')[0];
      const endStr = endOfMonth.toISOString().split('T')[0];

      const [attendanceRes, holidaysRes, patternsRes] = await Promise.all([
        supabase.from('attendance_logs').select('status, date').eq('employee_id', empId).eq('tenant_id', tenId).gte('date', startStr).lte('date', endStr),
        supabase.from('holidays').select('date').eq('tenant_id', tenId).eq('is_active', true).gte('date', startStr).lte('date', endStr),
        supabase.from('holiday_recurring_patterns').select('week_day, week_occurrence').eq('tenant_id', tenId).eq('is_active', true)
      ]);

      if (attendanceRes.error) throw attendanceRes.error;

      const holidayDates = new Set(holidaysRes.data?.map(h => h.date));
      const patterns = patternsRes.data || [];

      const getWeekOccurrence = (date: Date): string => {
        const day = date.getDate();
        const occurrences = ['first', 'second', 'third', 'fourth'];
        const index = Math.floor((day - 1) / 7);

        const tempDate = new Date(date);
        tempDate.setDate(tempDate.getDate() + 7);
        if (tempDate.getMonth() !== date.getMonth()) return 'last';

        return occurrences[index] || 'last';
      };

      let totalWorkingDays = 0;
      let tempDate = new Date(startOfMonth);

      while (tempDate <= endOfMonth) {
        const dateStr = tempDate.toISOString().split('T')[0];
        const dayName = tempDate.toLocaleString('en-US', { weekday: 'long' }).toLowerCase();
        const occurrence = getWeekOccurrence(tempDate);

        const isFixedHoliday = holidayDates.has(dateStr);
        const isRecurringOff = patterns.some(p =>
          p.week_day === dayName && (p.week_occurrence === occurrence || p.week_occurrence === 'every')
        );

        if (!isFixedHoliday && !isRecurringOff) {
          totalWorkingDays++;
        }

        tempDate.setDate(tempDate.getDate() + 1);
      }

      let presentCount = 0;
      attendanceRes.data?.forEach((log: any) => {
        if (['Present', 'Late', 'Permission'].includes(log.status)) {
          presentCount += 1;
        } else if (log.status === 'Half Day') {
          presentCount += 0.5;
        }
      });

      if (totalWorkingDays === 0) return 0;
      const percentage = Math.round((presentCount / totalWorkingDays) * 100);

      return percentage > 100 ? 100 : percentage;

    } catch (err) {
      console.error('Attendance Calculation Error:', err);
      return 0;
    }
  };

  // --- Loading State ---
  if (loading || statsLoading || roleLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-gray-200 rounded-lg w-48 mb-6"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <div className="flex items-center space-x-4 mb-6">
                <div className="w-12 h-12 bg-gray-100 rounded-xl"></div>
                <div className="h-5 bg-gray-100 rounded w-1/3"></div>
              </div>
              <div className="space-y-4">
                <div className="h-10 bg-gray-50 rounded-lg w-full"></div>
                <div className="h-10 bg-gray-50 rounded-lg w-3/4"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // --- STRICT EMPLOYEE VIEW ---
  if (showEmployeeView) {
    if (!employeeData) {
      return (
        <div className="flex flex-col items-center justify-center py-16 bg-white rounded-2xl shadow-sm border border-gray-100">
          <AlertCircle className="h-10 w-10 text-gray-300 mb-3" />
          <h3 className="text-lg font-medium text-gray-900">Unable to load dashboard</h3>
          <p className="text-sm text-gray-500 mt-1">Please try refreshing the page.</p>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <h3 className="text-2xl font-bold text-gray-900 tracking-tight">Overview</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

          {/* Monthly Attendance Ring */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col items-center justify-center hover:shadow-md transition-shadow">
            <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-6 w-full text-left">
              {currentMonthName} Attendance
            </h4>
            <CircularProgress
              percentage={employeeData.attendancePercentage || 0}
              colorClass={
                (employeeData.attendancePercentage || 0) >= 90 ? 'text-emerald-500' :
                  (employeeData.attendancePercentage || 0) >= 75 ? 'text-amber-400' : 'text-rose-500'
              }
            />
          </div>

          {/* Today's Shift */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:col-span-1 lg:col-span-1 hover:shadow-md transition-shadow relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
              <Briefcase className="w-32 h-32" />
            </div>

            <div className="flex items-center justify-between mb-6 relative z-10">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                  <Clock className="w-5 h-5" />
                </div>
                <h4 className="text-lg uppercase text-gray-900">Today's Shift</h4>
              </div>
              {employeeData.shiftDetails && (
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 uppercase tracking-wide">
                  {employeeData.shiftDetails.shiftType}
                </span>
              )}
            </div>

            {employeeData.shiftDetails ? (
              <div className="grid grid-cols-2 sm:grid-cols-2 gap-4 relative z-10 bg-gray-50/50 p-4 rounded-xl">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Shift Name</p>
                  <p className="font-semibold text-gray-900">{employeeData.shiftDetails.shiftName}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Date</p>
                  <p className="font-semibold text-gray-900">{employeeData.shiftDetails.scheduleDate}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Check In</p>
                  <p className="font-bold text-indigo-600">{employeeData.shiftDetails.startTime}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Check Out</p>
                  <p className="font-bold text-indigo-600">{employeeData.shiftDetails.endTime}</p>
                </div>
              </div>
            ) : (
              <div className="h-24 flex items-center justify-center bg-gray-50 rounded-xl border border-dashed border-gray-200">
                <p className="text-gray-500 font-medium text-sm">No shift scheduled for today</p>
              </div>
            )}
          </div>

          {/* Today's Clock In/Out Logs */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
            <div className="flex items-center space-x-3 mb-6">
              <div className="p-2.5 bg-sky-50 text-sky-600 rounded-xl">
                <Activity className="w-5 h-5" />
              </div>
              <h4 className="text-lg uppercase text-gray-900">Today's Logs</h4>
            </div>

            {employeeData.todayLogs && employeeData.todayLogs.length > 0 ? (
              <div className="space-y-3 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                {employeeData.todayLogs.map((log, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100 hover:bg-white hover:shadow-sm transition-all">
                    <div className="flex items-center space-x-3">
                      <div className={`p-1.5 rounded-lg ${log.entry === 'IN' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                        {log.entry === 'IN' ? <LogIn className="w-4 h-4" /> : <LogOut className="w-4 h-4" />}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-gray-900">
                          {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className="text-[10px] font-medium text-gray-500 uppercase">
                          {log.entry}
                        </span>
                      </div>
                    </div>
                    {log.timing_status !== 'OK' && (
                      <span className="text-[10px] px-2 py-1 rounded bg-amber-50 text-amber-700 font-medium">
                        {log.timing_status.replace(/_/g, ' ')}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-32 flex flex-col items-center justify-center bg-gray-50 rounded-xl border border-dashed border-gray-200">
                <Clock className="w-6 h-6 text-gray-400 mb-2" />
                <p className="text-gray-500 font-medium text-sm">No punches recorded today</p>
              </div>
            )}
          </div>

          {/* Leave Balances */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
            <div className="flex items-center space-x-3 mb-6">
              <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
                <CalendarIcon className="w-5 h-5" />
              </div>
              <h4 className="text-lg uppercase text-gray-900">Leave Balance</h4>
            </div>

            <div className="space-y-5">
              {employeeData.leaveBalances?.length > 0 ? employeeData.leaveBalances.map((leave, i) => (
                <div key={i} className="group cursor-pointer">
                  <div className="flex justify-between items-end mb-2">
                    <span className="text-sm font-semibold text-gray-700">{leave.leaveType}</span>
                    <span className="text-xs text-gray-500">
                      <span className="text-gray-900 font-bold">{leave.remainingDays}</span> / {leave.totalDays}
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-emerald-500 h-full rounded-full transition-all duration-500 ease-out group-hover:bg-emerald-400"
                      style={{ width: `${leave.totalDays > 0 ? (leave.usedDays / leave.totalDays) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              )) : (
                <p className="text-sm text-gray-500">No leave quotas found.</p>
              )}
            </div>
          </div>

          {/* Permissions & Allowances */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
            <div className="flex items-center space-x-3 mb-6">
              <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl">
                <Timer className="w-5 h-5" />
              </div>
              <h4 className="text-lg uppercase text-gray-900">{currentMonthName} Permission Balance</h4>
            </div>

            <div className="flex flex-col space-y-3">
              {employeeData.permissionBalance ? (
                [
                  {
                    label: 'Late Balance',
                    rem: employeeData.permissionBalance.late.remaining,
                    tot: employeeData.permissionBalance.late.total
                  },
                  {
                    label: 'Early Exit Balance',
                    rem: employeeData.permissionBalance.early.remaining,
                    tot: employeeData.permissionBalance.early.total
                  },
                  {
                    label: 'Permission (min)',
                    rem: employeeData.permissionBalance.minutes.remaining,
                    tot: employeeData.permissionBalance.minutes.total
                  }
                ].map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-3.5 rounded-xl bg-gray-50 group hover:bg-white hover:shadow-sm hover:ring-1 hover:ring-gray-100 transition-all">
                    <span className="text-sm font-medium text-gray-600">{item.label}</span>
                    <span className={`text-sm  ${item.rem > 0 ? 'text-gray-900' : 'text-rose-500'}`}>
                      {item.rem}  <span className="text-gray-500">/ {item.tot}</span>
                    </span>
                  </div>
                ))
              ) : (
                <div className="flex items-center justify-center p-4 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                  <p className="text-sm text-gray-500">No allowances set for {currentMonthName}</p>
                </div>
              )}
            </div>
          </div>

          {/* Advances */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow md:col-span-2 lg:col-span-1">
            <div className="flex items-center space-x-3 mb-6">
              <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                <IndianRupee className="w-5 h-5" />
              </div>
              <h4 className="text-lg  uppercase text-gray-900">Salary Advances</h4>
            </div>

            {employeeData.advanceDetails ? (
              <div className="space-y-4">
                <div className="p-4 bg-gradient-to-br from-green-50 to-green-50 rounded-xl border border-blue-100">
                  <p className="text-xs text-greeen-600 font-semibold uppercase tracking-wider mb-1">Total Approved</p>
                  <p className="text-3xl  text-green-900">
                    ₹{employeeData.advanceDetails.approvedAmount.toLocaleString()}
                  </p>
                </div>
                <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-100">
                  <p className="text-xs text-blue-600 font-semibold uppercase tracking-wider mb-1">Remaining Balance</p>
                  <p className="text-3xl  text-blue-900">
                    ₹{employeeData.advanceDetails.remainingBalance.toLocaleString()}
                  </p>
                </div>
              </div>
            ) : (
              <div className="h-32 flex flex-col items-center justify-center bg-gray-50 rounded-xl border border-dashed border-gray-200">
                <DollarSign className="w-6 h-6 text-gray-400 mb-2" />
                <p className="text-gray-500 font-medium text-sm">No active advances</p>
              </div>
            )}
          </div>

          {/* Monthly Calendar View */}
          <div className="md:col-span-2 lg:col-span-3">
            <ShiftCalendar shifts={employeeData.monthlyShifts} />
          </div>

        </div>
      </div>
    );
  }
  const selectedMonthDisplay = new Date(selectedMonth + '-01').toLocaleString('default', { month: 'long' });

  const stats = [
    {
      name: 'Total Employees',
      value: statistics?.totalEmployees.toString(),
      icon: Users,
    },
    {
      name: 'Active Employees',
      value: statistics?.activeEmployees.toString(),
      icon: Users,
    },
    {
      name: isCurrentMonth ? 'Leave Approved Today' : `Total Leaves Approved in ${selectedMonthDisplay}`,
      value: statistics?.onLeave.toString() || '0',
      icon: CalendarIcon,
    },
    {
      name: 'Pending Leave Requests',
      value: statistics?.pendingLeaveRequests.toString(),
      icon: Clock,
    },
    {
      name: 'Today Attendance',
      value: `${statistics?.todayAttendanceRate}%`,
      icon: ClipboardList,
    },
    {
      name: 'Monthly Attendance',
      value: `${statistics?.currentMonthAttendanceRate}%`,
      icon: TrendingUp,
    },
  ];

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h3 className="text-lg leading-6 font-medium text-gray-900">Dashboard Statistics</h3>

        {/* ADDED FILTER UI */}
        <div className="flex items-center space-x-2 bg-white px-3 py-2 rounded-lg border border-gray-200 shadow-sm">
          {/* <span className="text-sm font-medium text-gray-500">Filter Month:</span> */}
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="text-sm font-semibold text-gray-900 border-none focus:ring-0 cursor-pointer"
          />
        </div>
      </div>
      <dl className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((item) => (
          <div
            key={item.name}
            className="relative bg-white pt-5 px-4 pb-12 sm:pt-6 sm:px-6 rounded-lg overflow-hidden shadow"
          >
            <dt>
              <div className="absolute bg-indigo-500 rounded-md p-3">
                <item.icon className="h-6 w-6 text-white" aria-hidden="true" />
              </div>
              <p className="ml-16 text-sm font-medium text-gray-500 truncate">{item.name}</p>
            </dt>
            <dd className="ml-16 pb-6 flex items-baseline sm:pb-7">
              <p className="text-2xl font-semibold text-gray-900">{item.value}</p>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
