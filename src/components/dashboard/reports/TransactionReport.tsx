import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AlertCircle, FileText, ChevronDown, LayoutList, Table2 } from 'lucide-react';
import { useReportsStore } from '../../../stores/reportsStore';
import { supabase } from '../../../lib/supabase';
import ReportTable from './ReportTable';
import ReportActions from './ReportActions';
import PayslipReport from './PayslipReport';

interface TransactionReportProps {
  subtype: string;
  filters: {
    startDate: string;
    endDate: string;
    department: string;
    employee: string;
  };
  externalSelectedComponents?: string[];
  onComponentsChange?: (components: string[]) => void;
}

// Types for Auxiliary Data
type Holiday = { id: string; name: string; date: string; is_recurring: boolean; };
type RecurringPattern = { week_day: string; week_occurrence: string; };

type LeaveRequest = {
  start_date: string;
  end_date: string;
  status: string;
  leave_types: { name: string } | null;
  employee: { employee_code: string } | null;
};

export default function TransactionReport({
  subtype,
  filters,
  externalSelectedComponents,
  onComponentsChange
}: TransactionReportProps) {
  const { transactionReports, loading, error, fetchTransactionReport } = useReportsStore();

  const [columns, setColumns] = useState<string[]>([]);
  const [availableEarnings, setAvailableEarnings] = useState<string[]>([]);
  const [availableDeductions, setAvailableDeductions] = useState<string[]>([]);

  const [localSelectedComponents, setLocalSelectedComponents] = useState<string[]>([]);
  const selectedComponents = externalSelectedComponents || localSelectedComponents;

  const updateSelectedComponents = (newSelection: string[]) => {
    setLocalSelectedComponents(newSelection);
    if (onComponentsChange) {
      onComponentsChange(newSelection);
    }
  };

  const [showComponentDropdown, setShowComponentDropdown] = useState(false);
  const componentDropdownRef = useRef<HTMLDivElement>(null);

  const [expandedEmployee, setExpandedEmployee] = useState<string | null>(null);
  const [detailMode, setDetailMode] = useState(false);

  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [patterns, setPatterns] = useState<RecurringPattern[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [auxLoading, setAuxLoading] = useState(true);

  const reportData = transactionReports[subtype]?.data || [];
  const summary = transactionReports[subtype]?.summary || {};
  const isAttendance = subtype === 'attendance';

  // --- HELPER: Formats keys ---
  const formatColumnName = (key: string) => {
    if (!key) return '';

    // Custom formatting for LOP Days
    if (key === 'lopDays') return 'LOP';
    if (key === 'totalWorkingDays') return 'Work Days';
    if (key === 'paidWorkingDays') return 'Paid Days';

    let cleanKey = key.replace(/\s+/g, ' ').trim();
    cleanKey = cleanKey.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
    return cleanKey.split(' ').map(word =>
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' ');
  };

  useEffect(() => {
    fetchTransactionReport(subtype, filters);
  }, [subtype, filters, fetchTransactionReport]);

  useEffect(() => {
    if (!isAttendance) return;
    const fetchAuxData = async () => {
      setAuxLoading(true);
      try {
        const promises: Promise<any>[] = [
          supabase.from('holidays').select('id, name, date, is_recurring').eq('is_active', true),
          supabase.from('holiday_recurring_patterns').select('week_day, week_occurrence').eq('is_active', true)
        ];
        let leaveQuery = supabase
          .from('leave_requests')
          .select('start_date, end_date, status, leave_types(name), employee:employees(employee_code)')
          .in('status', ['Approved', 'Pending']);
        if (filters.startDate) leaveQuery = leaveQuery.gte('end_date', filters.startDate);
        if (filters.endDate) leaveQuery = leaveQuery.lte('start_date', filters.endDate);
        promises.push(leaveQuery);
        const [holRes, patRes, leaveRes] = await Promise.all(promises);
        setHolidays(holRes.data || []);
        setPatterns(patRes.data || []);
        setLeaveRequests(leaveRes.data || []);
      } catch (err) {
        console.error('Unexpected error fetching aux data:', err);
      } finally {
        setAuxLoading(false);
      }
    };
    fetchAuxData();
  }, [isAttendance, filters.startDate, filters.endDate]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (componentDropdownRef.current && !componentDropdownRef.current.contains(event.target as Node)) {
        setShowComponentDropdown(false);
      }
    };
    if (showComponentDropdown) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showComponentDropdown]);

  /* ---------------- HELPERS ---------------- */
  const isHoliday = (dateStr: string) => {
    const date = new Date(dateStr);
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    if (holidays.some(h => h.date === dateStr)) return true;
    const dayOfMonth = date.getDate();
    const weekNum = Math.ceil(dayOfMonth / 7);
    const isLast = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate() - dayOfMonth < 7;
    const occurrenceMap: Record<number, string> = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth' };
    return patterns.some(p => p.week_day === dayName && (p.week_occurrence === occurrenceMap[weekNum] || (p.week_occurrence === 'last' && isLast)));
  };

  const getLeaveStatus = (empCode: string, dateStr: string): string | null => {
    const leave = leaveRequests.find(req => req.employee?.employee_code === empCode && req.start_date <= dateStr && req.end_date >= dateStr);
    if (!leave) return null;
    if (leave.status === 'Approved') return leave.leave_types?.name || 'Leave'; // @ts-ignore
    else if (leave.status === 'Pending') return 'Pending';
    return null;
  };

  /* ---------------- ATTENDANCE GROUPING LOGIC ---------------- */
  const groupedAttendance = useMemo(() => {
    if (!isAttendance || auxLoading) return [];
    const uniqueEmployees = new Map<string, any>();
    const recordMap = new Map<string, any>();
    reportData.forEach((row: any) => {
      const dateStr = row.date ? new Date(row.date).toISOString().split('T')[0] : '';
      if (!dateStr) return;
      if (!uniqueEmployees.has(row.employeeCode)) uniqueEmployees.set(row.employeeCode, { employeeCode: row.employeeCode, name: row.name, department: row.department });
      recordMap.set(`${row.employeeCode}_${dateStr}`, row);
    });
    let targetDates: string[] = [];
    if (filters.startDate && filters.endDate) {
      const start = new Date(filters.startDate);
      const end = new Date(filters.endDate);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) targetDates.push(d.toISOString().split('T')[0]);
    } else {
      const dates = new Set<string>();
      reportData.forEach((r: any) => { if (r.date) dates.add(new Date(r.date).toISOString().split('T')[0]); });
      targetDates = Array.from(dates).sort();
    }
    const result: any[] = [];
    uniqueEmployees.forEach((empInfo, empCode) => {
      const empStats = { 
        ...empInfo, 
        presentDays: 0, 
        absentDays: 0, 
        lateDays: 0,
        permissionDays: 0,
        earlyExitDays: 0,
        firstOffDays: 0,
        secondOffDays: 0,
        totalWorkingHours: 0,
        totalDays: 0, 
        records: [] as any[] 
      };
      targetDates.forEach(date => {
        empStats.totalDays += 1;
        const key = `${empCode}_${date}`;
        let status = 'Absent', request = '-', record = null, isPresent = false;
        if (recordMap.has(key)) {
          record = recordMap.get(key);
          const activeStatuses = ['Present', 'Half Day', 'Late', 'Early Exit', 'Permission', 'First Off', 'Second Off'];
          if (activeStatuses.includes(record.status)) isPresent = true;
        }
        if (isPresent) { 
          status = record.status; 
          
          if (status === 'Present') empStats.presentDays += 1;
          else if (status === 'Late') empStats.lateDays += 1;
          else if (status === 'Permission') empStats.permissionDays += 1;
          else if (status === 'Early Exit') empStats.earlyExitDays += 1;
          else if (status === 'First Off') empStats.firstOffDays += 1;
          else if (status === 'Second Off') empStats.secondOffDays += 1;
          
          empStats.totalWorkingHours += (record.workingHours || 0);
          empStats.records.push({ ...record, request: request }); 
        }
        else {
          if (isHoliday(date)) return;
          
          const leaveName = getLeaveStatus(empCode, date);
          const currentDate = new Date().toISOString().split('T')[0];
          
          if (date > currentDate) {
            status = '-';
            request = '-';
            // Do not increment absentDays for future dates
          } else {
            if (leaveName) { status = 'Absent'; request = leaveName; empStats.absentDays += 1; }
            else { status = 'Absent'; request = '-'; empStats.absentDays += 1; }
          }
          
          empStats.records.push({ date: date, status: status, request: request, clockIn: '-', clockOut: '-', workingHours: 0, lateMinutes: 0, overtimeMinutes: 0, ...empInfo });
        }
      });
      empStats.records.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
      result.push(empStats);
    });
    return result;
  }, [reportData, isAttendance, filters, holidays, patterns, leaveRequests, auxLoading]);


  /* ---------------- COLUMN LOGIC ---------------- */
  useEffect(() => {
    if (reportData.length > 0 && subtype === 'monthly') {
      // UPDATED: Added 'lopDays' to the default list of columns
      const defaultColumns = [
        'employeeCode',
        'name',
        'department',
        'payPeriod',
        'totalWorkingDays', // Add this
        'lopDays',
        'paidWorkingDays',  // Add this
        'earnings',
        'deductions',
        'netAmount',
        'paymentDate',
        'status'
      ];
      const earningSet = new Set<string>();
      const deductionSet = new Set<string>();

      reportData.forEach((row: any) => {
        if (row.salary_components && Array.isArray(row.salary_components)) {
          row.salary_components.forEach((comp: any) => { if (comp.name) earningSet.add(comp.name); });
        }
        if (row.deduction_components && Array.isArray(row.deduction_components)) {
          row.deduction_components.forEach((comp: any) => { if (comp.name) deductionSet.add(comp.name); });
        }

        // Manually check for Bonus and Overtime
        if (row.bonus !== undefined && row.bonus !== null) earningSet.add('Bonus');
        if (row.overtime_amount !== undefined && row.overtime_amount !== null) earningSet.add('Overtime Amount');
      });

      deductionSet.forEach((deductionName) => {
        if (earningSet.has(deductionName)) earningSet.delete(deductionName);
      });

      const sortedEarnings = Array.from(earningSet).sort();
      const sortedDeductions = Array.from(deductionSet).sort();

      setAvailableEarnings(sortedEarnings);
      setAvailableDeductions(sortedDeductions);

      const allAvailable = [...sortedEarnings, ...sortedDeductions];
      const selectedSortedColumns = allAvailable.filter(comp => selectedComponents.includes(comp));
      setColumns([...defaultColumns, ...selectedSortedColumns]);

    } else if (reportData.length > 0) {
      const excludeKeys = new Set([
        'employeeId', 
        'dailyRecords', 
        ...(subtype === 'dailyAttendance' ? ['punches'] : []),
        ...(subtype === 'attendance' ? ['lateMinutes', 'earlyDepartureMinutes', 'overtimeMinutes'] : [])
      ]);
      const keys = Object.keys(reportData[0]).filter(k => !excludeKeys.has(k));
      setColumns(keys);
    }
  }, [reportData, selectedComponents, subtype]);

  const getReportTitle = () => {
    switch (subtype) {
      case 'monthly': return 'Monthly Salary Report';
      case 'attendance': return 'Monthly Attendance Report';
      case 'weeklyAttendance': return 'Weekly Attendance Report';
      case 'dailyAttendance': return 'Daily Attendance Report';
      case 'leave': return 'Leave Balance Report';
      case 'overtime': return 'Overtime Report';
      case 'bonus': return 'Bonus Payment Report';
      case 'loan': return 'Loan/Advance Report';
      case 'payslip': return 'Payslip Report';
      case 'permissionBalance': return 'Employee Permission Balance Report';
      default: return 'Transaction Report';
    }
  };

  /* ---------------- DATA PROCESSING ---------------- */
  const enhancedReportData = useMemo(() => {
    return reportData.map((row: any) => {
      const enhancedRow = { ...row };
      
      if (subtype === 'dailyAttendance' && Array.isArray(row.punches)) {
        enhancedRow.punches = row.punches.map((p: any) => `${p.type}: ${p.time} (${p.location})`).join(', ');
      }

      if (subtype !== 'monthly') return enhancedRow;

      selectedComponents.forEach(compName => {
        // 1. Try finding in arrays
        const sComp = row.salary_components?.find((c: any) => c.name === compName);
        const dComp = row.deduction_components?.find((c: any) => c.name === compName);

        let amount = sComp?.amount || dComp?.amount;

        // 2. If not in arrays, check top-level keys for Bonus/Overtime
        if (amount === undefined) {
          if (compName === 'Bonus') amount = row.bonus;
          if (compName === 'Overtime Amount') amount = row.overtime_amount;
        }

        enhancedRow[compName] = amount || 0;
      });
      return enhancedRow;
    });
  }, [reportData, subtype, selectedComponents]);

  const handleComponentToggle = (componentName: string) => {
    const isSelected = selectedComponents.includes(componentName);
    const newSelection = isSelected
      ? selectedComponents.filter(c => c !== componentName)
      : [...selectedComponents, componentName];
    updateSelectedComponents(newSelection);
  };

  const handleSelectAllComponents = () => {
    const allComponents = [...availableEarnings, ...availableDeductions];
    const newSelection = selectedComponents.length === allComponents.length ? [] : allComponents;
    updateSelectedComponents(newSelection);
  };

  const { exportData, exportColumns } = useMemo(() => {
    if (subtype === 'attendance') {
      if (detailMode) {
        return { exportData: enhancedReportData, exportColumns: columns };
      } else {
        const aggColumns = ['employeeCode', 'name', 'department', 'totalWorkingHours', 'presentDays', 'absentDays', 'lateDays', 'earlyExitDays', 'permissionDays', 'firstOffDays', 'secondOffDays'];
        return { exportData: groupedAttendance, exportColumns: aggColumns };
      }
    } else if (subtype === 'weeklyAttendance') {
      if (detailMode) {
        const flatData: any[] = [];
        enhancedReportData.forEach(row => {
          if (row.dailyRecords && Array.isArray(row.dailyRecords)) {
            row.dailyRecords.forEach((dr: any) => {
              flatData.push({
                employeeCode: row.employeeCode,
                name: row.name,
                department: row.department,
                date: dr.date,
                status: dr.status,
                clockIn: dr.clockIn || '-',
                clockOut: dr.clockOut || '-',
                workingHours: dr.workingHours || 0
              });
            });
          }
        });
        const detColumns = ['employeeCode', 'name', 'department', 'date', 'status', 'clockIn', 'clockOut', 'workingHours'];
        return { exportData: flatData, exportColumns: detColumns };
      } else {
        return { exportData: enhancedReportData, exportColumns: columns };
      }
    }
    return { exportData: enhancedReportData, exportColumns: columns };
  }, [subtype, detailMode, enhancedReportData, columns, groupedAttendance]);

  /* ---------------- RENDER ---------------- */
  // Special rendering for payslip report
  if (subtype === 'payslip') {
    return <PayslipReport data={reportData} loading={loading} error={error} />;
  }

  if (loading || (isAttendance && auxLoading)) return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div></div>;
  if (error) return <div className="rounded-md bg-red-50 p-4"><div className="flex"><AlertCircle className="h-5 w-5 text-red-400" /><div className="ml-3"><h3 className="text-sm font-medium text-red-800">{error}</h3></div></div></div>;
  if (reportData.length === 0) return <div className="text-center py-12"><FileText className="mx-auto h-12 w-12 text-gray-400" /><h3 className="mt-2 text-sm font-medium text-gray-900">No data available</h3><p className="mt-1 text-sm text-gray-500">Try changing your filters.</p></div>;

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <h2 className="text-xl font-semibold text-gray-900">{getReportTitle()}</h2>
        <div className="flex flex-wrap items-center gap-2">
          {subtype === 'monthly' && (availableEarnings.length + availableDeductions.length) > 0 && (
            <div className="relative" ref={componentDropdownRef}>
              <button
                className="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                onClick={() => setShowComponentDropdown(!showComponentDropdown)}
              >
                <FileText className="h-4 w-4 mr-2" />
                Select Components ({selectedComponents.length})
                <ChevronDown className="h-4 w-4 ml-1" />
              </button>
              {showComponentDropdown && (
                <div className="absolute right-0 mt-2 w-72 bg-white rounded-md shadow-lg z-10 border border-gray-200 max-h-96 overflow-y-auto">
                  <div className="p-2 border-b border-gray-200 sticky top-0 bg-white z-20">
                    <button onClick={handleSelectAllComponents} className="w-full text-left px-3 py-2 text-xs font-medium text-indigo-600 hover:bg-indigo-50 rounded-md">
                      {selectedComponents.length === (availableEarnings.length + availableDeductions.length) ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>
                  <div className="py-2">
                    {availableEarnings.length > 0 && (
                      <>
                        <div className="px-3 py-1 text-xs font-semibold text-gray-500 uppercase bg-gray-50">Earnings</div>
                        {availableEarnings.map((comp) => (
                          <label key={comp} className="flex items-center px-3 py-2 hover:bg-gray-50 cursor-pointer">
                            <input type="checkbox" checked={selectedComponents.includes(comp)} onChange={() => handleComponentToggle(comp)} className="h-4 w-4 text-indigo-600 rounded border-gray-300" />
                            <span className="ml-3 text-xs text-gray-700">{formatColumnName(comp)}</span>
                          </label>
                        ))}
                      </>
                    )}
                    {availableDeductions.length > 0 && (
                      <>
                        <div className="px-3 py-1 text-xs font-semibold text-gray-500 uppercase bg-gray-50 mt-2">Deductions</div>
                        {availableDeductions.map((comp) => (
                          <label key={comp} className="flex items-center px-3 py-2 hover:bg-gray-50 cursor-pointer">
                            <input type="checkbox" checked={selectedComponents.includes(comp)} onChange={() => handleComponentToggle(comp)} className="h-4 w-4 text-indigo-600 rounded border-gray-300" />
                            <span className="ml-3 text-xs text-gray-700">{formatColumnName(comp)}</span>
                          </label>
                        ))}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <ReportActions data={exportData} columns={exportColumns} title={getReportTitle()} />
          {(isAttendance || subtype === 'weeklyAttendance') && (
            <button
              onClick={() => setDetailMode(m => !m)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm font-medium transition-colors ${
                detailMode
                  ? 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {detailMode ? <LayoutList className="h-4 w-4" /> : <Table2 className="h-4 w-4" />}
              {detailMode ? 'Detail Mode' : 'Normal Mode'}
            </button>
          )}
        </div>
      </div>

      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <div className="px-4 py-5 sm:px-6 bg-gray-50 border-b border-gray-200">
          <h3 className="text-lg leading-6 font-medium text-gray-900">Report Details</h3>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Generated on {new Date().toLocaleString('en-GB')}
            {filters.department && ` | Department: ${filters.department}`}
            {filters.startDate && ` | Period: ${filters.startDate} to ${filters.endDate}`}
          </p>
        </div>

        {isAttendance ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Emp Code</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Department</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Hrs</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Present</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Absent</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Late</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Early Exit</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Permission</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">First Off</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Second Off</th>
                </tr>
              </thead>
              <tbody className="divide-y bg-white">
                {groupedAttendance.map(emp => (
                  <React.Fragment key={emp.employeeCode}>
                    <tr className="hover:bg-gray-50">
                      <td className="px-4 py-4 text-sm font-semibold text-gray-900">{emp.employeeCode}</td>
                      <td className="px-4 py-4 text-sm font-medium text-gray-900">{emp.name}</td>
                      <td className="px-4 py-4 text-sm text-gray-500">{emp.department}</td>
                      <td className="px-4 py-4 text-sm font-bold text-gray-900">{emp.totalWorkingHours.toFixed(2)}</td>
                      <td className="px-4 py-4 text-sm font-semibold text-green-600">{emp.presentDays}</td>
                      <td className="px-4 py-4 text-sm font-semibold text-red-600">{emp.absentDays}</td>
                      <td className="px-4 py-4 text-sm font-semibold text-yellow-600">{emp.lateDays}</td>
                      <td className="px-4 py-4 text-sm font-semibold text-orange-600">{emp.earlyExitDays}</td>
                      <td className="px-4 py-4 text-sm font-semibold text-teal-600">{emp.permissionDays}</td>
                      <td className="px-4 py-4 text-sm font-semibold text-rose-600">{emp.firstOffDays}</td>
                      <td className="px-4 py-4 text-sm font-semibold text-rose-600">{emp.secondOffDays}</td>
                    </tr>
                    {detailMode && (
                      <tr><td colSpan={11} className="bg-gray-50 px-4 py-4"><ReportTable data={emp.records} columns={['date', 'status', 'request', 'clockIn', 'clockOut', 'workingHours']} /></td></tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        ) : subtype === 'weeklyAttendance' ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Emp Code</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Department</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Hrs</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Present</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Absent</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Late</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Early Exit</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Permission</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">First Off</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Second Off</th>
                </tr>
              </thead>
              <tbody className="divide-y bg-white">
                {reportData.length === 0 ? (
                  <tr><td colSpan={11} className="px-4 py-8 text-center text-sm text-gray-500">No data for this week. Try adjusting the date range.</td></tr>
                ) : (
                  reportData.map((row: any, i: number) => (
                    <React.Fragment key={i}>
                      <tr className="hover:bg-gray-50">
                        <td className="px-4 py-4 text-sm font-semibold text-gray-900">{row.employeeCode}</td>
                        <td className="px-4 py-4 text-sm font-medium text-gray-900">{row.name}</td>
                        <td className="px-4 py-4 text-sm text-gray-500">{row.department}</td>
                        <td className="px-4 py-4 text-sm font-bold text-gray-900">{row.totalWorkingHours?.toFixed(2) ?? '-'}</td>
                        <td className="px-4 py-4 text-sm font-semibold text-green-600">{row.present ?? 0}</td>
                        <td className="px-4 py-4 text-sm font-semibold text-red-600">{row.absent ?? 0}</td>
                        <td className="px-4 py-4 text-sm font-semibold text-yellow-600">{row.late ?? 0}</td>
                        <td className="px-4 py-4 text-sm font-semibold text-orange-600">{row.earlyExit ?? 0}</td>
                        <td className="px-4 py-4 text-sm font-semibold text-teal-600">{row.permission ?? 0}</td>
                        <td className="px-4 py-4 text-sm font-semibold text-rose-600">{row.firstOff ?? 0}</td>
                        <td className="px-4 py-4 text-sm font-semibold text-rose-600">{row.secondOff ?? 0}</td>
                      </tr>
                      {detailMode && row.dailyRecords && row.dailyRecords.length > 0 && (
                        <tr>
                          <td colSpan={11} className="bg-gray-50 px-6 py-3">
                            <table className="min-w-full text-xs">
                              <thead>
                                <tr className="text-gray-500 uppercase">
                                  <th className="px-3 py-2 text-left">Date</th>
                                  <th className="px-3 py-2 text-left">Status</th>
                                  <th className="px-3 py-2 text-left">Clock In</th>
                                  <th className="px-3 py-2 text-left">Clock Out</th>
                                  <th className="px-3 py-2 text-left">Working Hrs</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {row.dailyRecords.map((rec: any, j: number) => (
                                  <tr key={j} className="hover:bg-gray-100">
                                    <td className="px-3 py-2">{rec.date}</td>
                                    <td className="px-3 py-2">{rec.status}</td>
                                    <td className="px-3 py-2">{rec.clockIn ?? '-'}</td>
                                    <td className="px-3 py-2">{rec.clockOut ?? '-'}</td>
                                    <td className="px-3 py-2">{rec.workingHours?.toFixed(2) ?? '-'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <ReportTable data={enhancedReportData} columns={columns} />
        )}

        {Object.keys(summary).length > 0 && (
          <div className="px-4 py-5 sm:px-6 bg-gray-50 border-t border-gray-200">
            <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">Summary</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Object.entries(summary).map(([key, value]) => (
                <div key={key} className="bg-white p-4 shadow rounded-lg border border-gray-200">
                  <dt className="text-sm font-medium text-gray-500 truncate">{formatColumnName(key)}</dt>
                  <dd className="mt-1 text-2xl font-semibold text-gray-900">{typeof value === 'number' ? value.toLocaleString('en-IN', { style: 'currency', currency: 'INR' }) : value}</dd>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}