import React, { useState, useEffect } from 'react';
import { Filter, Download, Search, Camera } from 'lucide-react';
import { Link } from 'react-router-dom';
import AttendanceList from './AttendanceList';
import AttendanceFilters from './AttendanceFilters';
import AttendanceSummary from './AttendanceSummary';
import { exportToCSV } from '../../../lib/export';
import { useAttendanceStore } from '../../../stores/attendanceStore';
import { useEmployeesStore, type Employee } from '../../../stores/employeesStore';
import { useAuth } from '../../../contexts/AuthContext';
import { useRoleAccess } from '../../../hooks/useRoleAccess';

export default function AttendancePage() {
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(Date.now());
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const { user } = useAuth();
  const { access, employeeId, canViewAllData, role, isEmployee } = useRoleAccess();
  const showAdminView = canViewAllData && role !== 'Reporting Head';

  const { items: employees, loading, error, fetchEmployees } = useEmployeesStore();
  const { items: attendanceRecords, fetchAttendanceRecords } = useAttendanceStore();

  const [filters, setFilters] = useState({
    start_date: '',
    end_date: '',
    status: '',
  });

  useEffect(() => {
    if (showAdminView) {
      fetchEmployees();
    } else if (employeeId) {
      fetchEmployees(employeeId);
    }
  }, [fetchEmployees, showAdminView, employeeId]);

  useEffect(() => {
    if ((access.restrictedToOwnData || role === 'Reporting Head') && employeeId && employees.length > 0) {
      const currentEmployee = employees.find(emp => emp.id === employeeId);
      if (currentEmployee) {
        setSelectedEmployee(currentEmployee);
      }
    }
  }, [access.restrictedToOwnData, role, employeeId, employees]);

  const handleAttendanceUpdated = () => {
    setLastRefresh(Date.now());
  };

  const handleExport = async () => {
    try {
      setExporting(true);
      setExportError(null);

      await fetchAttendanceRecords(
        selectedEmployee?.id || user?.id || '',
        filters.start_date || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
        filters.end_date || new Date().toISOString()
      );

      if (!attendanceRecords || attendanceRecords.length === 0) {
        throw new Error('No attendance data available to export');
      }

      const filename = `attendance_${new Date().toISOString().split('T')[0]}.csv`;

      const formattedData = attendanceRecords.map(record => ({
        'Date': new Date(record.date).toLocaleDateString(),
        'Clock In': record.clock_in ? new Date(record.clock_in).toLocaleTimeString() : 'N/A',
        'Clock Out': record.clock_out ? new Date(record.clock_out).toLocaleTimeString() : 'N/A',
        'Status': record.status,
        'Notes': record.notes || ''
      }));

      await exportToCSV(formattedData, filename);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to export data';
      setExportError(errorMessage);
      console.error('Export failed:', error);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="py-6">
      <div className="max-w-7xl mx-auto px-2">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Attendance</h1>
            <p className="mt-1 text-sm text-gray-500">
              Track attendance, manage clock in/out, and view attendance history.
            </p>
          </div>
          <div className="mt-4 md:mt-0 flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => setIsFiltersOpen(!isFiltersOpen)}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              <Filter className="h-4 w-4 mr-2" />
              Filters
            </button>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="h-4 w-4 mr-2" />
              {exporting ? 'Exporting...' : 'Export'}
            </button>
            
            {/* Face Enrollment Link */}
            <Link
              to="/dashboard/attendance/face-enrollment"
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              <Camera className="h-4 w-4 mr-2" />
              Face Enrollment
            </Link>
          </div>
        </div>

        {/* Employee Selector - Only for Admin/HR */}
        {showAdminView && (
          <div className="mt-4">
            <label htmlFor="employee-select" className="block text-sm font-medium text-gray-700">
              Select Employee
            </label>
            <div className="mt-1 relative rounded-md shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-gray-400" />
              </div>
              <select
                id="employee-select"
                className="mt-1 block w-full pl-10 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                value={selectedEmployee?.id || ''}
                onChange={(e) => {
                  const employee = employees.find(emp => emp.id === e.target.value);
                  setSelectedEmployee(employee || null);
                }}
              >
                <option value="">Select Employee</option>
                {employees.filter(emp => emp.status === 'Active').map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name} - {employee.department} ({employee.employee_code || 'No ID'})
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Selected Employee Info */}
        {selectedEmployee && (
          <div className="mt-4 bg-white shadow rounded-lg p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-500">Employee Name</label>
                <p className="mt-1 text-lg font-medium text-gray-900">{selectedEmployee.name}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Employee ID</label>
                <p className="mt-1 text-lg font-medium text-gray-900">
                  {selectedEmployee.employee_code || 'Not Assigned'}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Department</label>
                <p className="mt-1 text-lg font-medium text-gray-900">{selectedEmployee.department}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Status</label>
                <p className="mt-1 text-lg font-medium text-gray-900">{selectedEmployee.status}</p>
              </div>
            </div>
          </div>
        )}

        {exportError && (
          <div className="mt-4 rounded-md bg-red-50 p-4">
            <div className="flex">
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Export failed</h3>
                <div className="mt-2 text-sm text-red-700">
                  {exportError}
                </div>
              </div>
            </div>
          </div>
        )}

        {isFiltersOpen && (
          <div className="mt-4">
            <AttendanceFilters filters={filters} onFilterChange={setFilters} />
          </div>
        )}

        <div className="mt-4">
          <AttendanceSummary 
            startDate={filters.start_date} 
            endDate={filters.end_date} 
            lastRefresh={lastRefresh}
            employeeId={selectedEmployee?.id}
          />
        </div>

        <div className="mt-4">
          <AttendanceList 
            filters={filters} 
            onRefresh={handleAttendanceUpdated}
            lastRefresh={lastRefresh}
            employeeId={selectedEmployee?.id}
          />
        </div>
      </div>
    </div>
  );
}