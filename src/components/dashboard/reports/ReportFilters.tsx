import React, { useEffect } from 'react';
import { Search } from 'lucide-react';
import { useDepartmentsStore } from '../../../stores/departmentsStore';
import { useEmployeesStore } from '../../../stores/employeesStore';
import { useCadresStore } from '../../../stores/cadresStore';

interface ReportFiltersProps {
  filters: {
    startDate: string;
    endDate: string;
    department: string;
    cadre: string;
    employee: string;
  };
  onFilterChange: (filters: {
    startDate: string;
    endDate: string;
    department: string;
    cadre: string;
    employee: string;
  }) => void;
  isRestricted?: boolean;
  reportSubtype?: string;
}

export default function ReportFilters({ filters, onFilterChange, isRestricted, reportSubtype }: ReportFiltersProps) {
  const { items: departments, loading: deptLoading, error: deptError, fetchDepartments } = useDepartmentsStore();
  const { items: employees, loading: empLoading, error: empError, fetchEmployees } = useEmployeesStore();
  const { items: cadres, loading: cadresLoading, error: cadresError, fetchCadres } = useCadresStore();

  const loading = deptLoading || empLoading || cadresLoading;
  const error = deptError || empError || cadresError;

  useEffect(() => {
    fetchDepartments();
    fetchEmployees();
    fetchCadres();
  }, [fetchDepartments, fetchEmployees, fetchCadres]);

  // Filter employees based on selected department and cadre
  const filteredEmployees = employees.filter(emp => {
    if (filters.department && emp.department !== filters.department) return false;
    if (filters.cadre && emp.cadre !== filters.cadre) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="h-10 bg-gray-200 animate-pulse rounded-md"></div>
        <div className="h-10 bg-gray-200 animate-pulse rounded-md"></div>
        <div className="h-10 bg-gray-200 animate-pulse rounded-md"></div>
        <div className="h-10 bg-gray-200 animate-pulse rounded-md"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-red-600 text-sm">
        Error loading filters: {error}
      </div>
    );
  }

  const today = new Date().toISOString().split('T')[0];
  const currentMonth = new Date().toISOString().substring(0, 7);

  const fmtDate = (d: Date) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  // Helper: render the resolved date range as a readable label
  const dateRangeLabel = () => {
    if (!filters.startDate || !filters.endDate) return '-';
    if (filters.startDate === filters.endDate) return filters.startDate;
    return `${filters.startDate} → ${filters.endDate}`;
  };

  return (
    <div className="bg-white p-4 rounded-lg shadow">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">

        {/* ── COL 1: Primary date input ── */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            {reportSubtype === 'dailyAttendance' ? 'Date'
              : reportSubtype === 'weeklyAttendance' ? 'Week of'
              : (reportSubtype === 'monthly' || reportSubtype === 'attendance') ? 'Month & Year'
              : 'Start Date'}
          </label>
          {(reportSubtype === 'monthly' || reportSubtype === 'attendance') ? (
            <input
              type="month"
              id="monthYear"
              className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              value={filters.startDate.substring(0, 7)}
              max={currentMonth}
              onChange={(e) => {
                const val = e.target.value;
                if (val) {
                  const [year, month] = val.split('-');
                  const firstDay = new Date(parseInt(year), parseInt(month) - 1, 1);
                  const lastDay = new Date(parseInt(year), parseInt(month), 0);
                  onFilterChange({ ...filters, startDate: fmtDate(firstDay), endDate: fmtDate(lastDay) });
                }
              }}
            />
          ) : (
            <input
              type="date"
              id="primaryDate"
              className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              value={filters.startDate}
              max={today}
              onChange={(e) => {
                const val = e.target.value;
                if (reportSubtype === 'dailyAttendance') {
                  onFilterChange({ ...filters, startDate: val, endDate: val });
                } else if (reportSubtype === 'weeklyAttendance') {
                  const picked = new Date(val + 'T00:00:00');
                  const day = picked.getDay();
                  const diffToMonday = day === 0 ? -6 : 1 - day;
                  const monday = new Date(picked);
                  monday.setDate(picked.getDate() + diffToMonday);
                  const sunday = new Date(monday);
                  sunday.setDate(monday.getDate() + 6);
                  onFilterChange({ ...filters, startDate: fmtDate(monday), endDate: fmtDate(sunday) });
                } else {
                  onFilterChange({ ...filters, startDate: val });
                }
              }}
            />
          )}
        </div>

        {/* ── COL 2: Secondary date input or range display ── */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            {reportSubtype === 'dailyAttendance' ? 'Day'
              : reportSubtype === 'weeklyAttendance' ? 'Week Range'
              : (reportSubtype === 'monthly' || reportSubtype === 'attendance') ? 'Period'
              : 'End Date'}
          </label>
          {reportSubtype === 'dailyAttendance' ? (
            <div className="block w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
              {filters.startDate
                ? new Date(filters.startDate + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long' })
                : '—'}
            </div>
          ) : (reportSubtype === 'weeklyAttendance' || reportSubtype === 'monthly' || reportSubtype === 'attendance') ? (
            <div className="block w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600 truncate">
              {dateRangeLabel()}
            </div>
          ) : (
            <input
              type="date"
              id="endDate"
              className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              value={filters.endDate}
              max={today}
              onChange={(e) => onFilterChange({ ...filters, endDate: e.target.value })}
            />
          )}
        </div>

        {/* ── COL 3–5: Department / Cadre / Employee (hidden for restricted users) ── */}
        {!isRestricted ? (
          <>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Department</label>
              <select
                id="department"
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                value={filters.department}
                onChange={(e) => onFilterChange({ ...filters, department: e.target.value, employee: '' })}
              >
                <option value="">All Departments</option>
                {departments.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Cadre</label>
              <select
                id="cadre"
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                value={filters.cadre}
                onChange={(e) => onFilterChange({ ...filters, cadre: e.target.value })}
              >
                <option value="">All Cadres</option>
                {cadres.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Employee</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-gray-400" />
                </div>
                <select
                  id="employee"
                  className="block w-full pl-9 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  value={filters.employee}
                  onChange={(e) => onFilterChange({ ...filters, employee: e.target.value })}
                >
                  <option value="">All Employees</option>
                  {filteredEmployees.map((emp) => (
                    <option key={emp.id} value={emp.id}>{emp.name} – {emp.department}</option>
                  ))}
                </select>
              </div>
            </div>
          </>
        ) : (
          // Restricted user: fill the remaining 3 cols with placeholder spacers to keep layout stable
          <>
            <div /><div /><div />
          </>
        )}

      </div>
    </div>
  );
}