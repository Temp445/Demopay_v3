import React, { useState, useEffect, useMemo } from 'react';
import { Search, Clock, Calendar, RefreshCw, XCircle } from 'lucide-react';
import { useEmployeesStore, type Employee } from '../../../stores/employeesStore';
import { useShiftsStore } from '../../../stores/shiftsStore';
import { useAttendanceTimestampStore } from '../../../stores/attendanceTimestampStore';
import ClockInOutCard from './ClockInOutCard';
import { format } from 'date-fns';
// Import the role access hook (adjust path as needed based on your folder structure)
import { useRoleAccess } from '../../../hooks/useRoleAccess'; 

const timingStatusLabel: Record<'OK' | 'OUTSIDE_SHIFT' | 'NO_SHIFT_ASSIGNED', string> = {
  OK: 'Ok',
  OUTSIDE_SHIFT: 'Wrong Shift',
  NO_SHIFT_ASSIGNED: 'No Shift Assigned',
};

const timingStatusColor: Record<'OK' | 'OUTSIDE_SHIFT' | 'NO_SHIFT_ASSIGNED', string> = {
  OK: 'bg-green-100 text-green-800',
  OUTSIDE_SHIFT: 'bg-yellow-100 text-yellow-800',
  NO_SHIFT_ASSIGNED: 'bg-red-100 text-red-800',
};

// Helper function to get status badge color
const getStatusBadgeColor = (status: string): string => {
  const statusLower = status.toLowerCase();

  if (statusLower === 'active') return '';
  if (statusLower === 'terminated') return 'bg-red-100 text-red-800';
  if (statusLower === 'suspended') return 'bg-yellow-100 text-yellow-800';
  if (statusLower === 'relieved') return 'bg-orange-100 text-orange-800';
  if (statusLower === 'resigned') return 'bg-gray-100 text-gray-800';

  // Default for any other status
  return 'bg-blue-100 text-blue-800';
};

export default function AttendanceTimestamp() {
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [lastRefresh, setLastRefresh] = useState(Date.now());

  // Custom searchable dropdown states
  const [employeeSearchText, setEmployeeSearchText] = useState('');
  const [showEmployeeDropdown, setShowEmployeeDropdown] = useState(false);

  const { items: employees, fetchEmployees } = useEmployeesStore();
  const { items: shifts, fetchShifts } = useShiftsStore();
  const { items: timestamps, loading, fetchTimestampsByEmployee } = useAttendanceTimestampStore();
  
  // 1. Get role access details
  const { isEmployee, employeeId, canViewAllData, loading: roleLoading, role } = useRoleAccess();
  const showAdminView = canViewAllData && role !== 'Reporting Head';

  useEffect(() => {
    fetchEmployees();
    fetchShifts();
  }, [fetchEmployees, fetchShifts]);

  // 2. Auto-select the employee if they are not an Admin/HR
  useEffect(() => {
    if (employees.length > 0 && !showAdminView && employeeId && !selectedEmployee) {
      const myEmployeeData = employees.find(emp => emp.id === employeeId);
      if (myEmployeeData) {
        setSelectedEmployee(myEmployeeData);
      }
    }
  }, [employees, showAdminView, employeeId, selectedEmployee]);

  useEffect(() => {
    if (selectedEmployee) {
      fetchTimestampsByEmployee(selectedEmployee.id, selectedDate);
    }
  }, [selectedEmployee, selectedDate, lastRefresh, fetchTimestampsByEmployee]);

  // Filter logic for the searchable dropdown
  const filteredEmployeeOptions = useMemo(() => {
    if (!employeeSearchText) return employees;
    const lowerSearch = employeeSearchText.toLowerCase();
    return employees.filter(
      (emp) =>
        emp.name.toLowerCase().includes(lowerSearch) ||
        (emp.employee_code && emp.employee_code.toLowerCase().includes(lowerSearch))
    );
  }, [employees, employeeSearchText]);

  const handleAttendanceUpdated = () => {
    setLastRefresh(Date.now());
  };

  const handleRefresh = () => {
    setLastRefresh(Date.now());
  };

  if (roleLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-indigo-600" />
      </div>
    );
  }

  return (
    <div className="xl:py-6">
      <div className="max-w-7xl mx-auto px-2">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Attendance</h1>
            <p className="mt-1 text-sm text-gray-500">
              Clock in/out and view timestamp entries
            </p>
          </div>
        </div>

        <div className="bg-white shadow rounded-lg p-6 mb-6">
          {/* 3. Change title based on role */}
          <h2 className="text-lg font-medium text-gray-900 mb-4">
            {showAdminView ? 'Employee Selection' : 'My Information'}
          </h2>

          {/* 4. Hide the select dropdown for standard employees */}
          {showAdminView && (
            <div className="mb-4">
              <label htmlFor="employee-search" className="block text-sm font-medium text-gray-700 mb-2">
                Search Employee
              </label>
              <div className="relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  id="employee-search"
                  value={employeeSearchText}
                  onChange={(e) => {
                    setEmployeeSearchText(e.target.value);
                    setShowEmployeeDropdown(true);
                    // Clear the actual selected profile if they start typing to modify the selection
                    if (selectedEmployee) {
                      setSelectedEmployee(null);
                    }
                  }}
                  onFocus={() => setShowEmployeeDropdown(true)}
                  onBlur={() => {
                    // Slight delay to allow the onMouseDown event on the list items to fire first
                    setTimeout(() => setShowEmployeeDropdown(false), 150);
                  }}
                  className="block w-full pl-10 pr-10 py-2 border border-gray-300 text-base focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                  placeholder="Search by name or code..."
                />
                
                {/* Clear Button */}
                {employeeSearchText && (
                  <button
                    type="button"
                    onClick={() => {
                      setEmployeeSearchText("");
                      setSelectedEmployee(null);
                      setShowEmployeeDropdown(true);
                    }}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none"
                  >
                    <XCircle className="h-5 w-5" />
                  </button>
                )}

                {/* Custom Dropdown Options */}
                {showEmployeeDropdown && filteredEmployeeOptions.length > 0 && (
                  <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
                    {filteredEmployeeOptions.map((employee) => {
                      const statusBadgeColor = getStatusBadgeColor(employee.status);
                      const isActive = employee.status.toLowerCase() === 'active' || employee.status.toLowerCase() === 'rejoin';

                      return (
                        <li
                          key={employee.id}
                          onMouseDown={(e) => {
                            // Prevent default so the input doesn't lose focus immediately
                            e.preventDefault();
                            setSelectedEmployee(employee);
                            // Fill the input with the selected employee's info
                            setEmployeeSearchText(
                              `${employee.name} - ${employee.department} (${employee.employee_code || 'No ID'})`
                            );
                            setShowEmployeeDropdown(false);
                          }}
                          className="relative cursor-pointer select-none py-2 pl-3 pr-9 text-gray-900 hover:bg-indigo-600 hover:text-white group"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              {employee.name} - {employee.department}{" "}
                              <span className="text-xs opacity-75 ml-1">
                                ({employee.employee_code || 'No ID'})
                              </span>
                            </div>
                            {!isActive && (
                              <span
                                className={`ml-2 px-2 py-0.5 text-xs font-medium rounded-full ${statusBadgeColor} group-hover:bg-white group-hover:bg-opacity-20`}
                              >
                                {employee.status.toUpperCase()}
                              </span>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          )}

          {selectedEmployee && (
            <div className={`${showAdminView ? 'mt-4' : ''} bg-gray-50 rounded-lg p-4`}>
              <h3 className="text-sm font-medium text-gray-900 mb-3">Employee Details</h3>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-500">Employee Name</label>
                  <p className="mt-1 text-sm font-medium text-gray-900">{selectedEmployee.name}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Employee ID</label>
                  <p className="mt-1 text-sm font-medium text-gray-900">
                    {selectedEmployee.employee_code || 'Not Assigned'}
                  </p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Department</label>
                  <p className="mt-1 text-sm font-medium text-gray-900">{selectedEmployee.department}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Status</label>
                  <p className="mt-1 text-sm font-medium text-gray-900">{selectedEmployee.status}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {selectedEmployee && (
          <>
            <div className="mb-6">
              <ClockInOutCard
                onAttendanceUpdated={handleAttendanceUpdated}
                shifts={shifts}
                selectedEmployee={selectedEmployee}
                lastRefresh={lastRefresh}
                canViewAllData={showAdminView}
              />
            </div>

            <div className="bg-white shadow rounded-lg">
              <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-medium text-gray-900">Timestamp Entries</h2>
                    <p className="mt-1 text-sm text-gray-500">
                      View all clock in/out entries for the selected date
                    </p>
                  </div>
                  <div className="flex  items-stretch sm:items-center gap-3">
                    <div className="flex items-center">
                      <Calendar className="h-6 w-6 text-gray-400 mr-2" />
                      <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="block w-full sm:w-auto py-1 px-0.5 md:py-1.5 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      />
                    </div>
                    <button
                      onClick={handleRefresh}
                      className="inline-flex justify-center items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Refresh
                    </button>
                  </div>
                </div>
              </div>

              <div className="px-6 py-4">
                {loading ? (
                  <div className="flex justify-center items-center h-32">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-indigo-600" />
                  </div>
                ) : timestamps.length === 0 ? (
                  <div className="text-center py-12">
                    <Clock className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-sm font-medium text-gray-900">No timestamps found</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      No clock in/out entries found on {format(new Date(selectedDate), 'MMMM d, yyyy')}
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Entry Type
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Timestamp
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Assigned Shift
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Timing Status
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Mode
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Location
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Reason
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {timestamps.map((entry) => (
                          <tr key={entry.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                {entry.entry === 'IN' ? (
                                  <div className="flex items-center">
                                    <div className="h-10 w-10 flex items-center justify-center rounded-full bg-green-100">
                                      <Clock className="h-5 w-5 text-green-600" />
                                    </div>
                                    <span className="ml-3 text-sm font-medium text-gray-900">Clock In</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center">
                                    <div className="h-10 w-10 flex items-center justify-center rounded-full bg-red-100">
                                      <Clock className="h-5 w-5 text-red-600" />
                                    </div>
                                    <span className="ml-3 text-sm font-medium text-gray-900">Clock Out</span>
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-medium text-gray-900">
                                {format(new Date(entry.timestamp), 'h:mm:ss a')}
                              </div>
                              <div className="text-sm font-medium text-gray-600 mt-0.5">
                                {format(new Date(entry.timestamp), 'MMMM d, yyyy')}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">
                                {entry.shift_name || '-'}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${timingStatusColor[entry.timing_status]}`}>
                                {timingStatusLabel[entry.timing_status]}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {entry.attendance_mode || '-'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">{entry.office_location_status || '-'}</div>
                              {entry.distance_from_branch != null && (
                                <div className="text-xs text-gray-500">{Math.round(entry.distance_from_branch)}m away</div>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 truncate max-w-[150px]" title={entry.manual_reason || ''}>
                              {entry.manual_reason || '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* 5. Update fallback messaging based on role */}
        {!selectedEmployee && !roleLoading && (
          <div className="bg-white shadow rounded-lg p-12">
            <div className="text-center">
              <Search className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">
                {showAdminView ? 'No Employee Selected' : 'Employee Record Not Found'}
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                {showAdminView 
                  ? 'Please select an employee from the dropdown above to view clock in/out options and timestamp entries.'
                  : 'We could not link your account to an employee profile. Please contact HR.'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}