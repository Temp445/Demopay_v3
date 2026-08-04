import React, { useEffect, useState, useRef } from 'react';
import { Search, ChevronDown } from 'lucide-react';
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
  const [empDropdownOpen, setEmpDropdownOpen] = useState(false);
  const [empSearch, setEmpSearch] = useState('');
  const empDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (empDropdownRef.current && !empDropdownRef.current.contains(event.target as Node)) {
        setEmpDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
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

  // Determine max limits based on report type
  // Allow future dates for reports like Timestamp Mismatch where looking ahead is needed
  const maxDate = reportSubtype === 'timestampMismatch' ? undefined : today;
  const maxMonth = reportSubtype === 'timestampMismatch' ? undefined : currentMonth;

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
              : (reportSubtype === 'monthly' || reportSubtype === 'attendance' || reportSubtype === 'musterRoll') ? 'Month & Year'
              : 'Start Date'}
          </label>
          {(reportSubtype === 'monthly' || reportSubtype === 'attendance' || reportSubtype === 'musterRoll') ? (
            <input
              type="month"
              id="monthYear"
              className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              value={filters.startDate.substring(0, 7)}
              max={maxMonth}
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
              max={maxDate}
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
              : (reportSubtype === 'monthly' || reportSubtype === 'attendance' || reportSubtype === 'musterRoll') ? 'Period'
              : 'End Date'}
          </label>
          {reportSubtype === 'dailyAttendance' ? (
            <div className="block w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
              {filters.startDate
                ? new Date(filters.startDate + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long' })
                : '—'}
            </div>
          ) : (reportSubtype === 'weeklyAttendance' || reportSubtype === 'monthly' || reportSubtype === 'attendance' || reportSubtype === 'musterRoll') ? (
            <div className="block w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600 truncate">
              {dateRangeLabel()}
            </div>
          ) : (
            <input
              type="date"
              id="endDate"
              className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              value={filters.endDate}
              max={maxDate}
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
              <div className="relative" ref={empDropdownRef}>
                <button
                  type="button"
                  className="block w-full text-left rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 flex justify-between items-center"
                  onClick={() => setEmpDropdownOpen(!empDropdownOpen)}
                >
                  <span className="truncate">
                    {filters.employee 
                      ? (() => {
                          const sel = employees.find(e => e.id === filters.employee);
                          return sel ? `${sel.name} ${sel.employee_code ? `- ${sel.employee_code}` : ''}` : 'All Employees';
                        })()
                      : 'All Employees'}
                  </span>
                  <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
                </button>
                {empDropdownOpen && (
                  <div className="absolute z-10 mt-1 w-full bg-white shadow-lg rounded-md border border-gray-200">
                    <div className="p-2 border-b border-gray-200">
                      <div className="relative">
                        <Search className="absolute left-2 top-2 h-4 w-4 text-gray-400" />
                        <input
                          type="text"
                          className="w-full pl-8 pr-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                          placeholder="Search name or code..."
                          value={empSearch}
                          onChange={(e) => setEmpSearch(e.target.value)}
                          autoFocus
                        />
                      </div>
                    </div>
                    <ul className="max-h-60 overflow-y-auto py-1 text-sm">
                      <li
                        className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-gray-900"
                        onClick={() => {
                          onFilterChange({ ...filters, employee: '' });
                          setEmpDropdownOpen(false);
                          setEmpSearch('');
                        }}
                      >
                        All Employees
                      </li>
                      {filteredEmployees.filter(emp => {
                        if (!empSearch) return true;
                        const s = empSearch.toLowerCase();
                        return (emp.name || '').toLowerCase().includes(s) || (emp.employee_code || '').toLowerCase().includes(s);
                      }).map((emp) => (
                        <li
                          key={emp.id}
                          className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-gray-900"
                          onClick={() => {
                            onFilterChange({ ...filters, employee: emp.id });
                            setEmpDropdownOpen(false);
                            setEmpSearch('');
                          }}
                        >
                          <div className="font-medium">{emp.name}</div>
                          {emp.employee_code && <div className="text-xs text-gray-500">{emp.employee_code} – {emp.department}</div>}
                          {!emp.employee_code && <div className="text-xs text-gray-500">{emp.department}</div>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
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