import React, { useState, useEffect, useCallback } from 'react';
import { X, Upload, Search } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useLeaveStore, type LeaveType, type LeaveRequest } from '../../../stores/leaveStore';
import { useEmployeesStore, type Employee } from '../../../stores/employeesStore';
import LeaveTypeModal from './LeaveTypeModal';
import { supabase } from '../../../lib/supabase';
import { getTenantId } from '../../../lib/tenantDb';

interface AddLeaveRequestModalProps {
  employee: Employee;
  isOpen: boolean;
  onClose: () => void;
  onLeaveAdded: () => void;
  initialData?: LeaveRequest;
}

export default function AddLeaveRequestModal({
  employee,
  isOpen,
  onClose,
  onLeaveAdded,
  initialData,
}: AddLeaveRequestModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLeaveTypeModalOpen, setIsLeaveTypeModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const { user } = useAuth();

  const { leaveTypes, fetchLeaveTypes, submitLeaveRequest, updateLeaveRequest, leaveBalances, fetchLeaveBalances } = useLeaveStore();
  const { items: employees, fetchEmployees } = useEmployeesStore();
  const [minDate, setMinDate] = useState('');

  const [formData, setFormData] = useState({
    employee_id: employee.id,
    leave_type_id: '',
    start_date: '',
    end_date: '',
    reason: '',
    document_url: '',
    is_half_day_start: false,
    is_half_day_end: false,
    half_day_period_start: null as '1st half' | '2nd half' | null,
    half_day_period_end: null as '1st half' | '2nd half' | null,
  });

  // Reset form when modal is opened/closed
  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setFormData({
          employee_id: initialData.employee_id,
          leave_type_id: initialData.leave_type_id,
          start_date: initialData.start_date,
          end_date: initialData.end_date,
          reason: initialData.reason || '',
          document_url: initialData.document_url || '',
          is_half_day_start: initialData.is_half_day_start || false,
          is_half_day_end: initialData.is_half_day_end || false,
          half_day_period_start: initialData.half_day_period_start || null,
          half_day_period_end: initialData.half_day_period_end || null,
        });
      } else {
        setFormData({
          employee_id: employee.id,
          leave_type_id: '',
          start_date: '',
          end_date: '',
          reason: '',
          document_url: '',
          is_half_day_start: false,
          is_half_day_end: false,
          half_day_period_start: null,
          half_day_period_end: null,
        });
      }
      setSearchTerm('');
      //setSelectedEmployee(null);
      setError(null);
    }
  }, [isOpen, initialData, employee.id]);

  useEffect(() => {
    const currentDay = new Date();
    const currentMonth = currentDay.getMonth(); // Get the current month (0-based index)
    const currentYear = currentDay.getFullYear();

    // Calculate the first day of the previous month
    const firstOfLastMonth = new Date(currentYear, currentMonth - 1, 1);

    // Format the date in YYYY-MM-DD format
    const formattedDate = firstOfLastMonth.toISOString().split('T')[0];

    // Set the minimum date
    setMinDate(formattedDate);
  }, []);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      await Promise.all([
        fetchLeaveTypes(),
        fetchEmployees(),
        fetchLeaveBalances(employee.id, new Date().getFullYear()),
      ]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [fetchLeaveTypes, fetchEmployees]);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, loadData]);

  // const filteredEmployees = employees.filter(employee => {
  //   const searchLower = searchTerm.toLowerCase();
  //   return (
  //     employee.name.toLowerCase().includes(searchLower) ||
  //     employee.employee_code?.toLowerCase().includes(searchLower) ||
  //     employee.department.toLowerCase().includes(searchLower)
  //   );
  // });

  const validateForm = async (): Promise<boolean> => {
    if (!formData.employee_id || formData.employee_id === '') {
      //formData.employee_id = selectedEmployee.id;
      setError('Please select a Employee');
      return false;
    }
    if (!formData.leave_type_id) {
      setError('Please select a leave type');
      return false;
    }
    if (!formData.start_date || !formData.end_date) {
      setError('Please select both start and end dates');
      return false;
    }
    if (new Date(formData.start_date) > new Date(formData.end_date)) {
      setError('Start date cannot be after end date');
      return false;
    }
    if (!formData.reason.trim()) {
      setError('Please provide a reason for the leave request');
      return false;
    }

    // Employee Status Validation - Block leave requests for terminated/suspended/relieved employees after their status date
    const restrictedStatuses = ['relieved', 'suspended', 'terminated'];
    const employeeStatus = employee.status?.toLowerCase();

    if (restrictedStatuses.includes(employeeStatus) && employee.status_date) {
      const statusDate = new Date(employee.status_date);
      statusDate.setHours(0, 0, 0, 0);

      const leaveStartDate = new Date(formData.start_date);
      leaveStartDate.setHours(0, 0, 0, 0);

      const leaveEndDate = new Date(formData.end_date);
      leaveEndDate.setHours(0, 0, 0, 0);

      // Check if any part of the leave request is after the status date
      if (leaveStartDate > statusDate || leaveEndDate > statusDate) {
        const statusLabel = employeeStatus.charAt(0).toUpperCase() + employeeStatus.slice(1);
        const formattedStatusDate = new Date(employee.status_date).toLocaleDateString();
        setError(
          `Cannot request leave for dates after ${formattedStatusDate}. Employee status is ${statusLabel} effective from this date.`
        );
        return false;
      }
    }

    // Validate half-day selections
    if (formData.is_half_day_start && !formData.half_day_period_start) {
      setError('Please select which half of the start day');
      return false;
    }
    if (formData.is_half_day_end && !formData.half_day_period_end && formData.start_date !== formData.end_date) {
      setError('Please select which half of the end day');
      return false;
    }

    // Find Calculated days based on start/end date and half-day selections
    let calculatedDays = Math.ceil((new Date(formData.end_date).getTime() - new Date(formData.start_date).getTime()) / (1000 * 60 * 60 * 24)) + 1;

    if (formData.is_half_day_start) {
      calculatedDays -= 0.5;
    }
    if (formData.is_half_day_end && formData.start_date !== formData.end_date) {
      calculatedDays -= 0.5;
    }
    if (formData.start_date === formData.end_date && formData.is_half_day_start) {
      calculatedDays = 0.5;
    }

    // Minimum leave per request
    let min_days_per_occurrence = leaveTypes.items.find(type => type.id === formData.leave_type_id)?.min_days_per_occurrence || 0;
    if (calculatedDays < min_days_per_occurrence) {
      setError(`Minimum leave per request is ${min_days_per_occurrence} day(s)`);
      return false;
    }

    // Maximum leave per request
    let max_days_per_occurrence = leaveTypes.items.find(type => type.id === formData.leave_type_id)?.max_days_per_occurrence || 0;
    if (calculatedDays > max_days_per_occurrence) {
      setError(`Maximum leave per request is ${max_days_per_occurrence} day(s)`);
      return false;
    }

    // Validate gap between occurrences
    const gap_between_occurrences = leaveTypes.items.find(type => type.id === formData.leave_type_id)?.gap_between_occurrences;
    if (gap_between_occurrences && gap_between_occurrences > 0) {
      try {
        const tenantId = await getTenantId();

        const { data: lastRequests, error: lastReqError } = await supabase
          .from('leave_requests')
          .select('end_date')
          .eq('employee_id', formData.employee_id)
          .eq('leave_type_id', formData.leave_type_id)
          .eq('tenant_id', tenantId)
          .in('status', ['Approved', 'Pending'])
          .order('end_date', { ascending: false })
          .limit(1);

        if (lastReqError) throw lastReqError;

        if (lastRequests && lastRequests.length > 0) {

          const lastEndDate = new Date(lastRequests[0].end_date);
          const newStartDate = new Date(formData.start_date);

          lastEndDate.setHours(0, 0, 0, 0);
          newStartDate.setHours(0, 0, 0, 0);

          const daysDiff = Math.floor(
            (newStartDate.getTime() - lastEndDate.getTime()) / (1000 * 60 * 60 * 24)
          ) - 1;

          if (daysDiff < gap_between_occurrences) {

            const earliestAllowedDate = new Date(lastEndDate);
            earliestAllowedDate.setDate(
              earliestAllowedDate.getDate() + gap_between_occurrences + 1
            );

            const earliestStr = earliestAllowedDate.toLocaleDateString('en-IN', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            });

            setError(
              `A minimum gap of ${gap_between_occurrences} day(s) is required between leaves of this type. ` +
              `Your last leave ended on ${lastEndDate.toLocaleDateString('en-IN', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
              })}. ` +
              `Earliest allowed start date: ${earliestStr}.`
            );

            return false;
          }
        }

      } catch (err) {
        setError('Failed to validate gap between occurrences. Please try again.');
        return false;
      }
    }

    // Attendance validation (Refined)
    // 1. Check Full Day Presence
    const { data: attendanceLogs, error: attendanceError } = await supabase
      .from('attendance_logs')
      .select('date, status')
      .eq('employee_id', formData.employee_id)
      .gte('date', formData.start_date)
      .lte('date', formData.end_date)
      .in('status', ['Present', 'Late']);

    if (attendanceError) {
      console.error('Attendance fetch error:', attendanceError);
    } else if (attendanceLogs && attendanceLogs.length > 0) {
      setError(`Cannot request leave for dates where attendance is already marked as Present: ${attendanceLogs.map(l => new Date(l.date).toLocaleDateString('en-IN')).join(', ')}`);
      return false;
    }

    // 2. Check Half Day scenarios
    const { data: history, error: historyError } = await supabase
      .from('employee_attendance_history')
      .select('date, action_type')
      .eq('employee_id', formData.employee_id)
      .gte('date', formData.start_date)
      .lte('date', formData.end_date)
      .in('action_type', ['half_day_first', 'half_day_second', 'first_off', 'second_off']);

    if (historyError) {
      console.error('History fetch error:', historyError);
    } else if (history && history.length > 0) {
      for (const record of history) {
        const isSingleDayHalfDayRequest = formData.start_date === formData.end_date && formData.is_half_day_start;

        if (!isSingleDayHalfDayRequest) {
          setError(`You were already present for half of ${new Date(record.date).toLocaleDateString('en-IN')}. If you want to request leave for the remaining half, please select 'Half Day'.`);
          return false;
        }

        const workedHalf = (record.action_type === 'half_day_second' || record.action_type === 'second_off') ? '1st half' : '2nd half';
        const requestedHalf = formData.half_day_period_start;

        if (requestedHalf === workedHalf) {
          setError(`You were already present for the ${workedHalf} of ${new Date(record.date).toLocaleDateString('en-IN')}.`);
          return false;
        }
      }
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!(await validateForm())) {
      return;
    }

    try {
      setLoading(true);
      const payload = {
        employee_id: formData.employee_id || '',
        leave_type_id: formData.leave_type_id,
        start_date: formData.start_date,
        end_date: formData.end_date,
        reason: formData.reason.trim(),
        document_url: formData.document_url || undefined,
        is_half_day_start: formData.is_half_day_start,
        is_half_day_end: formData.is_half_day_end,
        half_day_period_start: formData.half_day_period_start,
        half_day_period_end: formData.half_day_period_end,
      };

      if (initialData) {
        await updateLeaveRequest(initialData.id, payload);
      } else {
        await submitLeaveRequest(payload);
      }

      onLeaveAdded();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to save leave request'
      );
    } finally {
      setLoading(false);
    }
  };

  // const handleEmployeeSelect = (employee: Employee) => {
  //   setSelectedEmployee(employee);
  //   setFormData(prev => ({ ...prev, employee_id: employee.id }));
  // };

  const handleLeaveTypeCreated = async () => {
    try {
      await fetchLeaveTypes();
      setIsLeaveTypeModalOpen(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to refresh leave types'
      );
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity" aria-hidden="true">
          <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
        </div>

        <span
          className="hidden sm:inline-block sm:align-middle sm:h-screen"
          aria-hidden="true"
        >
          &#8203;
        </span>

        <div className="inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
          <div className="absolute top-0 right-0 pt-4 pr-4">
            <button
              type="button"
              className="bg-white rounded-md text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              onClick={onClose}
            >
              <span className="sr-only">Close</span>
              <X className="h-6 w-6" aria-hidden="true" />
            </button>
          </div>

          <div className="sm:flex sm:items-start">
            <div className="mt-3 text-left w-full">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                {initialData ? 'Edit Leave Request' : 'Request Leave'}
              </h3>
              {error && (
                <div className="mt-2 rounded-md bg-red-50 p-4">
                  <div className="text-sm text-red-700">{error}</div>
                </div>
              )}
              <form onSubmit={handleSubmit} className="mt-6 space-y-6">
                <div>
                  <label
                    htmlFor="employee-search"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Employee: {employee.name} {' - '} {employee.department}{' '}
                    {' - '} {employee.employee_code}
                  </label>
                </div>

                {/* Employee Selection */}
                {/* <div>
                  <label htmlFor="employee-search" className="block text-sm font-medium text-gray-700">
                    Select Employee
                  </label>
                  <div className="mt-1 relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Search className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      id="employee-search"
                      className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md"
                      placeholder="Search by name, ID, or department..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <div className="mt-2 max-h-40 overflow-y-auto border border-gray-200 rounded-md">
                    {filteredEmployees.map((employee) => (
                      <label
                        key={employee.id}
                        className={`flex items-center p-3 hover:bg-gray-50 cursor-pointer ${
                          selectedEmployee?.id === employee.id ? 'bg-indigo-50' : ''
                        }`}
                      >
                        <input
                          type="radio"
                          name="employee"
                          className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                          value={employee.id}
                          checked={selectedEmployee?.id === employee.id}
                          onChange={() => handleEmployeeSelect(employee)}
                        />
                        <div className="ml-3">
                          <p className="text-sm font-medium text-gray-900">{employee.name}</p>
                          <p className="text-sm text-gray-500">
                            {employee.employee_code && `ID: ${employee.employee_code} • `}
                            {employee.department}
                          </p>
                        </div>
                      </label>
                    ))}
                    {filteredEmployees.length === 0 && (
                      <div className="p-3 text-sm text-gray-500 text-center">
                        No employees found
                      </div>
                    )}
                  </div>
                    </div> */}

                <div>
                  <label
                    htmlFor="leave_type"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Leave Type
                  </label>
                  <div className="mt-1 flex gap-2">
                    <select
                      id="leave_type"
                      required
                      className="block w-full md:pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                      value={formData.leave_type_id}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          leave_type_id: e.target.value,
                        })
                      }
                    >
                      <option value="">Select Leave Type</option>
                      {leaveTypes.items
                        .filter(type =>
                          type.name === 'LOP' ||
                          leaveBalances.items.some(balance => balance.leave_type_id === type.id)
                        )
                        .map((type) => (
                          <option key={type.id} value={type.id}>
                            {type.name}
                          </option>
                        ))}
                    </select>
                    {/* <button
                      type="button"
                      onClick={() => setIsLeaveTypeModalOpen(true)}
                      className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                    >
                      Manage
                    </button> */}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="start_date"
                      className="block text-sm font-medium text-gray-700"
                    >
                      Start Date
                    </label>
                    <input
                      type="date"
                      id="start_date"
                      required
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      value={formData.start_date}
                      onChange={(e) =>
                        setFormData({ ...formData, start_date: e.target.value })
                      }
                    // min={new Date().toISOString().split('T')[0]}
                    // min={minDate}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="end_date"
                      className="block text-sm font-medium text-gray-700"
                    >
                      End Date
                    </label>
                    <input
                      type="date"
                      id="end_date"
                      required
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      value={formData.end_date}
                      onChange={(e) =>
                        setFormData({ ...formData, end_date: e.target.value })
                      }
                      min={
                        formData.start_date ||
                        minDate
                        // new Date().toISOString().split('T')[0]
                      }
                    />
                  </div>
                </div>

                {/* Half-Day Options Section */}
                <div className="border-t border-gray-200 pt-4">
                  <h4 className="text-sm font-medium text-gray-900 mb-3">Fractional Leave Options</h4>

                  {/* Start Date Half-Day Option */}
                  <div className="mb-4">
                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                        checked={formData.is_half_day_start}
                        onChange={(e) => {
                          setFormData({
                            ...formData,
                            is_half_day_start: e.target.checked,
                            half_day_period_start: e.target.checked ? '1st half' : null,
                          });
                        }}
                      />
                      <span className="text-sm font-medium text-gray-700">
                        Start date is a half day
                      </span>
                    </label>

                    {/* Show half-day period selector when checkbox is checked */}
                    {formData.is_half_day_start && (
                      <div className="mt-2 ml-6">
                        <label className="block text-sm text-gray-600 mb-1">Select period:</label>
                        <div className="flex space-x-4">
                          <label className="flex items-center space-x-2">
                            <input
                              type="radio"
                              name="start_period"
                              className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                              value="1st half"
                              checked={formData.half_day_period_start === '1st half'}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  half_day_period_start: e.target.value as '1st half',
                                })
                              }
                            />
                            <span className="text-sm text-gray-700">1st Half (Morning)</span>
                          </label>
                          <label className="flex items-center space-x-2">
                            <input
                              type="radio"
                              name="start_period"
                              className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                              value="2nd half"
                              checked={formData.half_day_period_start === '2nd half'}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  half_day_period_start: e.target.value as '2nd half',
                                })
                              }
                            />
                            <span className="text-sm text-gray-700">2nd Half (Afternoon)</span>
                          </label>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* End Date Half-Day Option - Only show if end date is different from start date */}
                  {formData.start_date && formData.end_date && formData.start_date !== formData.end_date && (
                    <div>
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                          checked={formData.is_half_day_end}
                          onChange={(e) => {
                            setFormData({
                              ...formData,
                              is_half_day_end: e.target.checked,
                              half_day_period_end: e.target.checked ? '1st half' : null,
                            });
                          }}
                        />
                        <span className="text-sm font-medium text-gray-700">
                          End date is a half day
                        </span>
                      </label>

                      {/* Show half-day period selector when checkbox is checked */}
                      {formData.is_half_day_end && (
                        <div className="mt-2 ml-6">
                          <label className="block text-sm text-gray-600 mb-1">Select period:</label>
                          <div className="flex space-x-4">
                            <label className="flex items-center space-x-2">
                              <input
                                type="radio"
                                name="end_period"
                                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                                value="1st half"
                                checked={formData.half_day_period_end === '1st half'}
                                onChange={(e) =>
                                  setFormData({
                                    ...formData,
                                    half_day_period_end: e.target.value as '1st half',
                                  })
                                }
                              />
                              <span className="text-sm text-gray-700">1st Half (Morning)</span>
                            </label>
                            <label className="flex items-center space-x-2">
                              <input
                                type="radio"
                                name="end_period"
                                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                                value="2nd half"
                                checked={formData.half_day_period_end === '2nd half'}
                                onChange={(e) =>
                                  setFormData({
                                    ...formData,
                                    half_day_period_end: e.target.value as '2nd half',
                                  })
                                }
                              />
                              <span className="text-sm text-gray-700">2nd Half (Afternoon)</span>
                            </label>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Display calculated days */}
                  {formData.start_date && formData.end_date && (
                    <div className="mt-3 p-2 bg-gray-50 rounded-md">
                      <p className="text-sm text-gray-600">
                        Total leave days: <span className="font-semibold text-gray-900">
                          {(() => {
                            const start = new Date(formData.start_date);
                            const end = new Date(formData.end_date);
                            let days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

                            if (formData.is_half_day_start) {
                              days -= 0.5;
                            }
                            if (formData.is_half_day_end && formData.start_date !== formData.end_date) {
                              days -= 0.5;
                            }
                            if (formData.start_date === formData.end_date && formData.is_half_day_start) {
                              days = 0.5;
                            }

                            return days;
                          })()}
                        </span> {(() => {
                          const start = new Date(formData.start_date);
                          const end = new Date(formData.end_date);
                          let days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

                          if (formData.is_half_day_start) {
                            days -= 0.5;
                          }
                          if (formData.is_half_day_end && formData.start_date !== formData.end_date) {
                            days -= 0.5;
                          }
                          if (formData.start_date === formData.end_date && formData.is_half_day_start) {
                            days = 0.5;
                          }

                          return days === 1 ? 'day' : 'days';
                        })()}
                      </p>
                    </div>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="reason"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Reason
                  </label>
                  <textarea
                    id="reason"
                    required
                    rows={3}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    value={formData.reason}
                    onChange={(e) =>
                      setFormData({ ...formData, reason: e.target.value })
                    }
                    placeholder="Please provide a reason for your leave request"
                  />
                </div>

                <div>
                  <label
                    htmlFor="document"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Supporting Document (Optional)
                  </label>
                  <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md">
                    <div className="space-y-1 text-center">
                      <Upload className="mx-auto h-12 w-12 text-gray-400" />
                      <div className="flex text-sm text-gray-600">
                        <label
                          htmlFor="document"
                          className="relative cursor-pointer bg-white rounded-md font-medium text-indigo-600 hover:text-indigo-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-indigo-500"
                        >
                          <span>Upload a file</span>
                          <input
                            id="document"
                            name="document"
                            type="file"
                            className="sr-only"
                            accept=".pdf,.doc,.docx"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                if (file.size > 10 * 1024 * 1024) {
                                  setError('File size must be less than 10MB');
                                  return;
                                }
                                setFormData({
                                  ...formData,
                                  document_url: file.name,
                                });
                              }
                            }}
                          />
                        </label>
                        <p className="pl-1">or drag and drop</p>
                      </div>
                      <p className="text-xs text-gray-500">
                        PDF, DOC, DOCX up to 10MB
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
                  >
                    {loading ? 'Submitting...' : 'Submit Request'}
                  </button>
                  <button
                    type="button"
                    className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:w-auto sm:text-sm"
                    onClick={onClose}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>

      {/* Leave Type Modal */}
      {isLeaveTypeModalOpen && (
        <LeaveTypeModal
          isOpen={isLeaveTypeModalOpen}
          onClose={() => setIsLeaveTypeModalOpen(false)}
          onSave={handleLeaveTypeCreated}
          leaveType={leaveTypes.items.find(
            (leave) => leave.id === formData.leave_type_id
          )}
        />
      )}
    </div>
  );
}
