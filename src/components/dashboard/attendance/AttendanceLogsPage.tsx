import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../../../lib/supabase';
import { ChevronDown, Search, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { validateAuth } from '../../../stores/utils/storeUtils';
import { useRoleAccess } from '../../../hooks/useRoleAccess';

type Employee = { id: string; name: string; employee_code: string; status?: string; status_date?: string; };
type Holiday = { id: string; name: string; date: string; is_recurring: boolean; };
type RecurringPattern = { week_day: string; week_occurrence: string; };

type ShiftAssignment = {
  id: string;
  employee_id: string;
  schedule_date: string;
};

// 1. Updated Status Type
export type AttendanceStatus = 
  | 'Present' 
  | 'Absent' 
  | 'Late' 
  | 'Half Day' 
  | 'Permission' 
  | 'Early Exit' 
  | 'First Half Absent' 
  | 'Second Half Absent' 
  | 'First Off' 
  | 'Second Off';

type AttendanceLog = {
  id: string;
  employee_id?: string;
  employee: Employee;
  date: string;
  clock_in: string | null;
  clock_out: string | null;
  status: AttendanceStatus;
};

const calculateTotalHours = (clockIn: string | null, clockOut: string | null) => {
  if (!clockIn || !clockOut) return '--';

  const start = new Date(clockIn);
  const end = new Date(clockOut);
  const diffMs = end.getTime() - start.getTime();

  if (diffMs < 0) return '--';

  const diffMins = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(diffMins / 60);
  const minutes = diffMins % 60;

  return `${hours}h ${minutes}m`;
};


export default function AttendanceLogsPage() {
  const { isEmployee, isAdmin, isHR, employeeId, role, canViewAllData, loading: roleLoading } = useRoleAccess();

  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [patterns, setPatterns] = useState<RecurringPattern[]>([]);
  const [shiftAssignments, setShiftAssignments] = useState<ShiftAssignment[]>([]);
  const [loading, setLoading] = useState(true);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  // Filter State
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<'name' | 'date'>('date');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Modal State
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Helper to determine restrictions
  const showAdminView = canViewAllData && role !== 'Reporting Head';
  const shouldRestrictData = !showAdminView;

  useEffect(() => {
    const fetchData = async () => {
      if (roleLoading) return;

      const auth = await validateAuth();
      if (!auth.isAuthenticated || !auth.tenantId) return;

      setLoading(true);
      let employeesQuery = supabase.from('employees').select('id, name, employee_code, status, status_date').eq('tenant_id', auth.tenantId);

      if (shouldRestrictData && employeeId) {
        employeesQuery = employeesQuery.eq('id', employeeId);
      }
      employeesQuery = employeesQuery.order('employee_code', { ascending: true });
      
      const [logsRes, empRes, holRes, patRes, shiftRes] = await Promise.all([
        fetchAllAttendanceLogs(auth),
        employeesQuery,
        supabase.from('holidays').select('id, name, date, is_recurring').eq('is_active', true).eq('tenant_id', auth.tenantId),
        supabase.from('holiday_recurring_patterns').select('week_day, week_occurrence').eq('is_active', true).eq('tenant_id', auth.tenantId),
        fetchAllShiftAssignments(auth)
      ]);

      setLogs(logsRes || []);
      setEmployees(empRes.data || []);
      setHolidays(holRes.data || []);
      setPatterns(patRes.data || []);
      setShiftAssignments(shiftRes || []);
      setLoading(false);
    };

    fetchData();
  }, [roleLoading, employeeId, isEmployee, isAdmin, isHR]);

  const fetchAllAttendanceLogs = async (auth: any) => {
    const PAGE_SIZE = import.meta.env.VITE_SUPABASE_MAX_ROWS || 1000;
    let allLogs: any[] = [];
    let from = 0;
    let to = PAGE_SIZE - 1;

    while (true) {
      let query = supabase
        .from('attendance_logs')
        .select(`*, employee:employee_id (id, name, employee_code)`)
        .eq('tenant_id', auth.tenantId);

      if (shouldRestrictData && employeeId) {
        query = query.eq('employee_id', employeeId);
      }

      const { data, error } = await query.range(from, to);

      if (error) throw error;
      if (!data || data.length === 0) break;

      allLogs = allLogs.concat(data);

      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
      to += PAGE_SIZE;
    }

    return allLogs;
  };

  const fetchAllShiftAssignments = async (auth: any) => {
    const PAGE_SIZE = import.meta.env.VITE_SUPABASE_MAX_ROWS || 1000;
    let allData: any[] = [];
    let from = 0;
    let to = PAGE_SIZE - 1;

    while (true) {
      let query = supabase
        .from('shift_assignments')
        .select('id, employee_id, schedule_date')
        .eq('tenant_id', auth.tenantId);

      if (shouldRestrictData && employeeId) {
        query = query.eq('employee_id', employeeId);
      }

      const { data, error } = await query.range(from, to);

      if (error) throw error;
      if (!data || data.length === 0) break;

      allData = allData.concat(data);

      if (data.length < PAGE_SIZE) break; 
      from += PAGE_SIZE;
      to += PAGE_SIZE;
    }

    return allData;
  };

  const handleStatusChange = async (log: AttendanceLog, newStatus: AttendanceStatus) => {
    if (!log.clock_in || !log.clock_out) {
      alert("Cannot change status: Missing Clock In or Clock Out time.");
      return;
    }

    try {
      if (log.id.startsWith('virtual-absent-')) {
        const { data, error } = await supabase
          .from('attendance_logs')
          .insert([{ 
            employee_id: log.employee.id, 
            date: log.date, 
            status: newStatus 
          }])
          .select(`*, employee:employee_id (id, name, employee_code)`)
          .single();

        if (error) throw error;
        setLogs(prev => [...prev, data]);
      } else {
        const { error } = await supabase
          .from('attendance_logs')
          .update({ status: newStatus })
          .eq('id', log.id);

        if (error) throw error;
        setLogs(prev => prev.map(l => l.id === log.id ? { ...l, status: newStatus } : l));
      }
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Failed to update status. Please try again.');
    }
  };

  const isHoliday = (dateStr: string) => {
  const date = new Date(dateStr);

  // 1️⃣ Fixed holidays (non-recurring)
  const isFixedHoliday = holidays.some(
    (h) => h.date === dateStr && h.is_recurring === false
  );

  if (isFixedHoliday) return true;

  // 2️⃣ Recurring patterns
  const dayName = date
    .toLocaleDateString('en-US', { weekday: 'long' })
    .toLowerCase();

  const dayOfMonth = date.getDate();
  const weekNum = Math.ceil(dayOfMonth / 7);
  const isLast = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate() - dayOfMonth < 7;
  const occurrenceMap: Record<number, string> = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth' };

  return patterns.some(
    (p) =>
      p.week_day === dayName &&
      (p.week_occurrence === occurrenceMap[weekNum] ||
        (p.week_occurrence === 'last' && isLast))
  );
};

  const processedLogs = useMemo(() => {
    if (employees.length === 0) return [];

    const uniqueDates = Array.from(new Set([
      ...logs.map((l) => l.date),
      ...shiftAssignments.map((s) => s.schedule_date)
    ]));

    if (uniqueDates.length === 0) uniqueDates.push(new Date().toISOString().split('T')[0]);

    const fullGrid: AttendanceLog[] = [];
    const todayStr = new Date().toISOString().split('T')[0];

    uniqueDates.forEach((date) => {
      if (isHoliday(date)) return;

      employees.forEach((emp) => {
        if (['Relieved', 'Terminated', 'Suspended'].includes(emp.status || '') && emp.status_date) {
          const currentLogDate = new Date(date);
          const statusDate = new Date(emp.status_date);
          
          const logYear = currentLogDate.getFullYear();
          const logMonth = currentLogDate.getMonth();
          const statusYear = statusDate.getFullYear();
          const statusMonth = statusDate.getMonth();

          // Skip this employee if the log date is in a month AFTER their status date
          if (logYear > statusYear || (logYear === statusYear && logMonth > statusMonth)) {
            return;
          }
        }

        const existingLog = logs.find(
          (l) => (l.employee?.id === emp.id || l.employee_id === emp.id) && l.date === date
        );

        if (existingLog) {
          fullGrid.push(existingLog);
        } else {
          if (date <= todayStr) {
            fullGrid.push({
              id: `virtual-absent-${emp.id}-${date}`,
              employee: emp,
              date: date,
              clock_in: null,
              clock_out: null,
              status: 'Absent',
            });
          }
        }
      });
    });

    let filtered = fullGrid.filter((log) => {
      const matchesSearch = log.employee?.name.toLowerCase().includes(search.toLowerCase()) ||
                            log.employee?.employee_code.toLowerCase().includes(search.toLowerCase());
      
      const logDate = new Date(log.date);
      const isAfterStart = startDate ? logDate >= new Date(startDate) : true;
      const isBeforeEnd = endDate ? logDate <= new Date(endDate) : true;

      return matchesSearch && isAfterStart && isBeforeEnd;
    });

    filtered.sort((a, b) => {
      if (sortField === 'date') {
        return sortOrder === 'asc' 
          ? new Date(a.date).getTime() - new Date(b.date).getTime() 
          : new Date(b.date).getTime() - new Date(a.date).getTime();
      }
      return sortOrder === 'asc' 
        ? (a.employee?.name || '').localeCompare(b.employee?.name || '') 
        : (b.employee?.name || '').localeCompare(a.employee?.name || '');
    });

    return filtered;
  }, [logs, employees, holidays, patterns, shiftAssignments, search, sortField, sortOrder, startDate, endDate]);

  const totalPages = Math.ceil(processedLogs.length / itemsPerPage);
  const paginatedLogs = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return processedLogs.slice(startIndex, startIndex + itemsPerPage);
  }, [processedLogs, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, sortField, sortOrder, startDate, endDate]); 

  const handleExport = () => {
    if (processedLogs.length === 0) {
      alert("No attendance records found for the current filters.");
      return;
    }

    const headers = ['Date', 'Employee Code', 'Employee Name', 'Clock In', 'Clock Out', 'Total Hours', 'Status'];
    const csvRows = processedLogs.map(log => [
      `="${log.date}"`, 
      `="${log.employee.employee_code}"`, 
      `"${log.employee.name}"`, 
      log.clock_in ? `="${new Date(log.clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}"` : 'N/A',
      log.clock_out ? `="${new Date(log.clock_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}"` : 'N/A',
      `"${calculateTotalHours(log.clock_in, log.clock_out)}"`,
      log.status
    ]);

    const csvContent = [headers.join(','), ...csvRows.map(row => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const fileNameSuffix = (startDate && endDate) ? `_${startDate}_to_${endDate}` : '';
    a.download = `attendance_logs${fileNameSuffix}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // 2. Updated Color Styles for All Statuses
  const getStatusStyles = (status: string) => {
    const styles: Record<string, string> = {
      'Present': 'bg-green-100 text-green-800 border-green-200',
      'Permission': 'bg-teal-100 text-teal-800 border-teal-200',
      'Late': 'bg-yellow-100 text-yellow-800 border-yellow-200',
      'Early Exit': 'bg-orange-100 text-orange-800 border-orange-200',
      'Half Day': 'bg-blue-100 text-blue-800 border-blue-200',
      'First Half Absent': 'bg-indigo-100 text-indigo-800 border-indigo-200',
      'Second Half Absent': 'bg-indigo-100 text-indigo-800 border-indigo-200',
      'First Off': 'bg-rose-100 text-rose-800 border-rose-200',
      'Second Off': 'bg-rose-100 text-rose-800 border-rose-200',
      'Absent': 'bg-red-100 text-red-800 border-red-200',
    };
    return styles[status] || 'bg-gray-100 text-gray-800 border-gray-200';
  };

   if (loading || roleLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="md:p-6 w-full bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 p-2 sm:mb-8 md:flex flex-col md:flex-row md:justify-between md:items-end gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Attendance Logs</h1>
          </div>
          
          <div className="grid grid-cols-2 sm:flex sm:flex-row items-stretch sm:items-end gap-3 w-full md:w-auto">
            <div className="flex-1">
              <label className="text-xs font-bold text-gray-500 uppercase">Start Date</label>
              <input 
                type="date" 
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="block mt-1 p-2 w-full border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" 
              />
            </div>
            <div className="flex-1">
              <label className="text-xs font-bold text-gray-500 uppercase">End Date</label>
              <input 
                type="date" 
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate}
                className="block mt-1 p-2 w-full border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" 
              />
            </div>
            <button 
              onClick={handleExport}
              className="mt-2 sm:mt-0 hidden md:flex justify-center items-center gap-2 border px-4 py-2 border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-4 mb-6 border grid grid-cols-2 md:flex flex-wrap gap-4 items-end">
          <div className="w-full sm:flex-1 col-span-2">
            <label className="text-xs font-bold text-gray-500 uppercase">Search</label>
            <div className="relative mt-1">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500 transition"
                placeholder="Name or Code..."
              />
            </div>
          </div>
          <div className="w-full sm:w-40 flex-shrink-0">
            <label className="text-xs font-bold text-gray-500 uppercase">Sort</label>
            <select value={sortField} onChange={(e) => setSortField(e.target.value as any)} className="w-full mt-1 p-2 border rounded-lg outline-none">
              <option value="date">Date</option>
              <option value="name">Employee</option>
            </select>
          </div>
          <div className="w-full sm:w-40 flex-shrink-0">
            <label className="text-xs font-bold text-gray-500 uppercase">Order</label>
            <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value as any)} className="w-full mt-1 p-2 border rounded-lg outline-none">
              <option value="desc">Newest</option>
              <option value="asc">Oldest</option>
            </select>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left whitespace-nowrap">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Employee Code</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Employee</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Clock In/Out</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Total Hours</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {paginatedLogs.length > 0 ? (
                  paginatedLogs.map((log) => {
                    const canEditStatus = log.clock_in && log.clock_out;
                    
                    return (
                      <tr 
                        key={log.id} 
                        onClick={() => {
                          if (shouldRestrictData) return; 

                          if (log.employee?.id) {
                            setSelectedEmployeeId(log.employee.id);
                            setSelectedDate(log.date);
                            setIsModalOpen(true);
                          }
                        }} 
                        className={`
                          transition
                          ${shouldRestrictData ? '' : 'cursor-pointer hover:bg-gray-50'}
                        `}
                      >
                        <td className="px-6 py-4">
                          <div className="font-semibold text-gray-900">{log.employee.employee_code}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-semibold text-gray-900">{log.employee.name}</div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {new Date(log.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {log.clock_in ? new Date(log.clock_in).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '--'} - 
                          {log.clock_out ? new Date(log.clock_out).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '--'}
                        </td>
                        <td className="px-6 py-4 text-sm font-medium text-gray-700">
                          {calculateTotalHours(log.clock_in, log.clock_out)}
                        </td>
                        <td className="px-6 py-4">
                          <select
                            value={log.status}
                            onChange={(e) => handleStatusChange(log, e.target.value as AttendanceStatus)}
                            onClick={(e) => e.stopPropagation()} 
                            disabled={!canEditStatus || shouldRestrictData}
                            className={`
                              px-3 py-1 rounded-full text-center text-xs font-bold uppercase border appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500
                              ${getStatusStyles(log.status)}
                              ${(!canEditStatus || shouldRestrictData) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                            `}
                          >
                            <option value="Present">Present</option>
                            <option value="Permission">Permission</option>
                            <option value="Late">Late</option>
                            <option value="Early Exit">Early Exit</option>
                            <option value="Half Day">Half Day</option>
                              {/* <option value="First Half Absent">First Half Absent</option>
                              <option value="Second Half Absent">Second Half Absent</option> */}
                            <option value="First Off">First Off</option>
                            <option value="Second Off">Second Off</option>
                            <option value="Absent">Absent</option>
                          </select>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                      No attendance records found for this date range.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="px-4 sm:px-6 py-4 bg-gray-50 border-t flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-sm text-gray-500 text-center sm:text-left">
              Showing <span className="font-medium">{processedLogs.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0}</span> to <span className="font-medium">{Math.min(currentPage * itemsPerPage, processedLogs.length)}</span> of <span className="font-medium">{processedLogs.length}</span> results
            </div>
            <div className="flex gap-2 w-full sm:w-auto justify-center sm:justify-end">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-2 border rounded-md bg-white disabled:opacity-50 hover:bg-gray-50 transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex items-center px-4 text-sm font-medium text-gray-700">
                Page {currentPage} of {Math.max(1, totalPages)}
              </div>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages || totalPages === 0}
                className="p-2 border rounded-md bg-white disabled:opacity-50 hover:bg-gray-50 transition"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
      
    </div>
  );
}