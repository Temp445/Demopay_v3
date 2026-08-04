import React, { useState, useEffect } from 'react';
import { format, differenceInDays, parseISO } from 'date-fns';
import { X, Search, AlertCircle, Calendar } from 'lucide-react';
import { useShiftsStore, type Shift, BulkAssignmentRequest } from '../../../stores/shiftsStore';
import { useEmployeesStore, type Employee } from '../../../stores/employeesStore';
import RotationPatternSelector from './RotationPatternSelector';
import DepartmentRules from './DepartmentRules';
import ValidationStatus from './ValidationStatus';
import { supabase } from '../../../lib/supabase';

interface AssignShiftModalProps {
  shift: Shift;
  isOpen: boolean;
  onClose: () => void;
  onAssignmentComplete: () => void;
}

interface FormData {
  employeeIds: string[];
  startDate: string;
  endDate: string;
  rotationPattern: 'none' | 'daily' | 'weekly' | 'monthly';
  rotationWeeks: number;
  rotationMonths: number;
  department: string;
}

export default function AssignShiftModal({
  shift,
  isOpen,
  onClose,
  onAssignmentComplete
}: AssignShiftModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [assignmentFilter, setAssignmentFilter] = useState<'all' | 'assigned' | 'unassigned'>('all');
  const [assignedEmployeesDetails, setAssignedEmployeesDetails] = useState<any[]>([]);
  const [validationStatus, setValidationStatus] = useState<{
    valid: boolean;
    messages: string[];
  }>({ valid: true, messages: [] });
  const [progress, setProgress] = useState<{
    total: number;
    current: number;
    success: number;
    failed: number;
  }>({ total: 0, current: 0, success: 0, failed: 0 });
  const [preAssignedEmployees, setPreAssignedEmployees] = useState<string[]>([]);
  const [skippedDates, setSkippedDates] = useState<any[]>([]);
  const [reassignReason, setReassignReason] = useState('');

  // NEW: Track if assignments were made so we can refresh calendar on close
  const [hasAssigned, setHasAssigned] = useState(false);

  const [formData, setFormData] = useState<FormData>({
    employeeIds: [],
    startDate: format(new Date(), 'yyyy-MM-dd'),
    endDate: '',
    rotationPattern: 'none',
    rotationWeeks: 1,
    rotationMonths: 1,
    department: ''
  });

  const { items: employeesData, fetchEmployees } = useEmployeesStore();
  const { createBulkAssignments } = useShiftsStore();

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setHasAssigned(false);
      setSkippedDates([]);
      setError(null);
    }
  }, [isOpen]);

  // Watch for date changes to auto-correct the rotation pattern
  useEffect(() => {
    if (!formData.endDate) {
      if (formData.rotationPattern !== 'none') {
        setFormData(prev => ({ ...prev, rotationPattern: 'none' }));
      }
      return;
    }

    const start = parseISO(formData.startDate);
    const end = parseISO(formData.endDate);
    const diff = differenceInDays(end, start);

    let newPattern = formData.rotationPattern;

    if (diff < 1) {
      newPattern = 'none';
    } else if (diff < 7 && (newPattern === 'weekly' || newPattern === 'monthly')) {
      newPattern = 'daily';
    } else if (diff < 30 && newPattern === 'monthly') {
      newPattern = 'weekly';
    }

    if (newPattern !== formData.rotationPattern) {
      setFormData(prev => ({ ...prev, rotationPattern: newPattern }));
    }
  }, [formData.startDate, formData.endDate, formData.rotationPattern]);

  // Helper function to check if employee is eligible based on status and dates
  const isEmployeeEligible = (employee: Employee, startDate: string, endDate: string): boolean => {
    const restrictedStatuses = ['relieved', 'suspended', 'terminated'];
    const employeeStatus = employee.status?.toLowerCase();

    // If employee doesn't have a restricted status, they're eligible
    if (!restrictedStatuses.includes(employeeStatus)) {
      return true;
    }

    // If employee has restricted status but no status_date, assume eligible (failsafe)
    if (!employee.status_date) {
      return true;
    }

    const statusDate = new Date(employee.status_date);
    statusDate.setHours(0, 0, 0, 0);

    const assignmentStartDate = new Date(startDate);
    assignmentStartDate.setHours(0, 0, 0, 0);

    // If endDate is not provided, only check against startDate
    if (!endDate) {
      // Employee is eligible if assignment start date is on or before status date
      return assignmentStartDate <= statusDate;
    }

    const assignmentEndDate = new Date(endDate);
    assignmentEndDate.setHours(0, 0, 0, 0);

    // Employee is eligible if the entire assignment period is on or before status date
    // return assignmentStartDate <= statusDate && assignmentEndDate <= statusDate;
    return assignmentStartDate <= statusDate;
  };

  useEffect(() => {
    const loadEmployees = async () => {
      try {
        setLoading(true);
        await fetchEmployees();

        // Filter employees based on status and selected date range
        const eligibleEmployees = employeesData.filter(emp => {
          // First check if employee is Active
          // if (emp.status !== 'Active') return false;

          // Then check if they're eligible for the selected date range
          return isEmployeeEligible(emp, formData.startDate, formData.endDate);
        });

        setEmployees(eligibleEmployees);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load employees');
      } finally {
        setLoading(false);
      }
    };

    const loadPreAssignedEmployees = async () => {
      try {
        // Isolated fetch prevents calendar data pollution
        const { data, error } = await supabase
          .from('shift_assignments')
          .select('employee_id, shift_id, schedule_date, status, shifts!inner(name)')
          .gte('schedule_date', formData.startDate)
          .lte('schedule_date', formData.endDate || formData.startDate);

        if (error) throw error;

        const details = data ? data.map(a => ({
          employee_id: a.employee_id,
          shift_id: a.shift_id,
          schedule_date: a.schedule_date,
          status: a.status,
          shift_name: a.shifts?.name || 'Unknown Shift'
        })) : [];

        setAssignedEmployeesDetails(details);

        const preAssigned = details.filter(d => d.shift_id === shift.id).map(a => a.employee_id);
        setPreAssignedEmployees(preAssigned);

        setFormData(prev => ({
          ...prev,
          employeeIds: [...new Set([...prev.employeeIds, ...preAssigned])]
        }));
      } catch (err) {
        console.error('Failed to load pre-assigned employees:', err);
      }
    };

    if (isOpen) {
      loadEmployees();
      loadPreAssignedEmployees();
    }
  }, [isOpen, shift.id, formData.startDate, formData.endDate]);

  const filteredEmployees = employees.filter(employee => {
    const matchesSearch = employee.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      employee.department.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (employee.employee_code && employee.employee_code.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesDepartment = !formData.department || employee.department === formData.department;

    const isAssigned = assignedEmployeesDetails.some(a => a.employee_id === employee.id);
    const matchesAssignment = assignmentFilter === 'all'
      ? true
      : assignmentFilter === 'assigned' ? isAssigned : !isAssigned;

    return matchesSearch && matchesDepartment && matchesAssignment;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.employeeIds.length === 0) {
      setError('Please select at least one employee');
      return;
    }

    // Validate employee eligibility before submission
    const selectedEmployees = employeesData.filter(emp =>
      formData.employeeIds.includes(emp.id)
    );

    // Check if any selected employee is ineligible
    const ineligibleEmployees = selectedEmployees.filter(emp =>
      !isEmployeeEligible(emp, formData.startDate, formData.endDate)
    );

    // If single employee selected and they're ineligible, show error
    if (formData.employeeIds.length === 1 && ineligibleEmployees.length > 0) {
      const employee = ineligibleEmployees[0];
      const statusLabel = employee.status.charAt(0).toUpperCase() + employee.status.slice(1).toLowerCase();
      const formattedStatusDate = new Date(employee.status_date).toLocaleDateString();

      setError(
        `Cannot assign shifts to ${employee.name}. Employee status is ${statusLabel} effective from ${formattedStatusDate}. The selected date range falls after this date.`
      );
      return;
    }

    // If multiple employees selected, filter out ineligible ones automatically
    let eligibleEmployeeIds = formData.employeeIds;
    if (ineligibleEmployees.length > 0) {
      eligibleEmployeeIds = formData.employeeIds.filter(id =>
        !ineligibleEmployees.some(emp => emp.id === id)
      );

      // If all employees are ineligible after filtering
      if (eligibleEmployeeIds.length === 0) {
        setError('None of the selected employees are eligible for the selected date range. All have restrictive employment status dates.');
        return;
      }
    }

    setLoading(true);
    setError(null);
    setProgress({
      total: eligibleEmployeeIds.length,
      current: 0,
      success: 0,
      failed: 0
    });

    try {
      const requiresReassignment = eligibleEmployeeIds.some(id => {
        const otherAssignments = assignedEmployeesDetails.filter(a => a.employee_id === id && a.shift_id !== shift.id);
        return otherAssignments.length > 0;
      });

      if (requiresReassignment && !reassignReason.trim()) {
        setError('Please provide a reason for reassigning employees.');
        setLoading(false);
        return;
      }

      const request: BulkAssignmentRequest = {
        shift_id: shift.id,
        employee_ids: eligibleEmployeeIds,
        reassign_reason: requiresReassignment ? reassignReason : undefined,
        rotation: {
          type: formData.endDate ? formData.rotationPattern : 'none',
          interval: formData.rotationPattern === 'weekly'
            ? formData.rotationWeeks
            : formData.rotationPattern === 'monthly'
              ? formData.rotationMonths
              : 1,
          startDate: formData.startDate,
          endDate: formData.endDate || undefined
        },
        department: formData.department
      };

      const result = await createBulkAssignments(request);

      if (!result.success) {
        const errorMessages = result.errors?.map((err: any) => err.message).join('\n');
        throw new Error(errorMessages || 'Failed to create assignments');
      }

      if (result.skippedDates && result.skippedDates.length > 0) {
        setSkippedDates(result.skippedDates);
        setHasAssigned(true); // Flag that data was created so calendar refreshes on close
        setError(null);
      } else {
        onAssignmentComplete(); // Closes and refreshes immediately
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign shifts');
    } finally {
      setLoading(false);
    }
  };

  // Safe close ensures the calendar refreshes if data was created but the modal stayed open to show warnings
  const handleSafeClose = () => {
    if (hasAssigned) {
      onAssignmentComplete();
    } else {
      onClose();
    }
  };

  const handleDepartmentChange = (department: string) => {
    setFormData(prev => ({ ...prev, department }));

    if (department) {
      const departmentEmployees = employees
        .filter(emp => emp.department === department)
        .map(emp => emp.id);
      setFormData(prev => ({
        ...prev,
        employeeIds: [...new Set([
          ...preAssignedEmployees,
          ...prev.employeeIds.filter(id => departmentEmployees.includes(id))
        ])]
      }));
    }
  };

  const filteredEmployeeIds = filteredEmployees.map(emp => emp.id);

  // We only want to select employees who are NOT assigned to OTHER shifts
  const selectableFilteredEmployeeIds = filteredEmployees
    .filter(emp => !assignedEmployeesDetails.some(a => a.employee_id === emp.id && a.shift_id !== shift.id))
    .map(emp => emp.id);

  const isAllSelected =
    selectableFilteredEmployeeIds.length > 0 &&
    selectableFilteredEmployeeIds.every(id => formData.employeeIds.includes(id));

  const handleSelectAll = () => {
    if (isAllSelected) {
      setFormData(prev => ({
        ...prev,
        employeeIds: prev.employeeIds.filter(
          id => !selectableFilteredEmployeeIds.includes(id) || preAssignedEmployees.includes(id)
        ),
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        employeeIds: Array.from(
          new Set([...prev.employeeIds, ...selectableFilteredEmployeeIds])
        ),
      }));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity" aria-hidden="true" onClick={handleSafeClose}>
          <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
        </div>

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">
          &#8203;
        </span>

        <div className="inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle w-full max-w-2xl sm:w-full sm:p-6">
          <div className="absolute top-0 right-0 pt-4 pr-4">
            <button
              onClick={handleSafeClose}
              className="bg-white rounded-md text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              <span className="sr-only">Close</span>
              <X className="h-6 w-6" aria-hidden="true" />
            </button>
          </div>

          <div className="sm:flex sm:items-start">
            <div className="mt-3 sm:mt-0 text-left w-full">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between">
                <h3 className="text-lg leading-6 font-medium text-gray-900">
                  Assign Shifts
                </h3>
                <div className="mt-2 sm:mt-0 mr-10">
                  <p className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                    <span className="font-medium text-gray-700">{shift.name}</span> ({format(new Date(`2000-01-01T${shift.start_time}`), 'h:mm a')} -
                    {format(new Date(`2000-01-01T${shift.end_time}`), 'h:mm a')})
                  </p>
                </div>
              </div>

              {error && (
                <div className="mt-2 rounded-md bg-red-50 p-4">
                  <div className="flex">
                    <AlertCircle className="h-5 w-5 text-red-400" />
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-red-800">{error}</h3>
                    </div>
                  </div>
                </div>
              )}

              {/* Added an OK button to close the modal after skipping dates */}
              {skippedDates.length > 0 && (
                <div className="mt-4">
                  <div className="rounded-md bg-yellow-50 border border-yellow-200 p-4">
                    <div className="flex">
                      <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0" />
                      <div className="ml-3 flex-1">
                        <h3 className="text-sm font-medium text-yellow-800">
                          Assignments Created with Skipped Dates
                        </h3>
                        <div className="mt-2 text-sm text-yellow-700">
                          <p className="mb-2">
                            The following dates were automatically skipped because they are holidays or weekly offs:
                          </p>
                          <div className="max-h-40 overflow-y-auto space-y-1">
                            {skippedDates.map((skip: any, idx: number) => (
                              <div key={idx} className="flex items-center justify-between bg-yellow-100 rounded px-2 py-1">
                                <span className="font-medium">
                                  {format(new Date(skip.date), 'MMM d, yyyy')}
                                </span>
                                <span className="text-xs">{skip.reason}</span>
                              </div>
                            ))}
                          </div>
                          <p className="mt-3 text-xs font-semibold">
                            Total: {skippedDates.length} date(s) skipped
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
                    <button
                      type="button"
                      className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:ml-3 sm:w-auto sm:text-sm"
                      onClick={handleSafeClose}
                    >
                      Acknowledge & Close
                    </button>
                  </div>
                </div>
              )}

              {skippedDates.length === 0 && (
                <form onSubmit={handleSubmit} className="mt-4 flex flex-col">
                  <div className="space-y-4 overflow-y-auto pr-2 pb-2">
                    <div className="flex flex-col sm:flex-row gap-4">
                      <div className="flex-1">
                        <label htmlFor="department" className="block text-sm font-medium text-gray-700">
                          Department
                        </label>
                        <select
                          id="department"
                          className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md shadow-sm"
                          value={formData.department}
                          onChange={(e) => handleDepartmentChange(e.target.value)}
                        >
                          <option value="">All Departments</option>
                          {Array.from(new Set(employees.map(emp => emp.department))).map(dept => (
                            <option key={dept} value={dept}>{dept}</option>
                          ))}
                        </select>
                      </div>

                      <div className="flex-1">
                        <label htmlFor="start_date" className="block text-sm font-medium text-gray-700">
                          Start Date
                        </label>
                        <div className="mt-1 relative rounded-md shadow-sm">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Calendar className="h-5 w-5 text-gray-400" />
                          </div>
                          <input
                            type="date"
                            id="start_date"
                            required
                            className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 py-2 sm:text-sm border-gray-300 rounded-md shadow-sm"
                            value={formData.startDate}
                            onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                          />
                        </div>
                      </div>

                      <div className="flex-1">
                        <label htmlFor="end_date" className="block text-sm font-medium text-gray-700">
                          End Date
                        </label>
                        <div className="mt-1 relative rounded-md shadow-sm">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Calendar className="h-5 w-5 text-gray-400" />
                          </div>
                          <input
                            type="date"
                            id="end_date"
                            className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 py-2 sm:text-sm border-gray-300 rounded-md shadow-sm"
                            value={formData.endDate}
                            onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                          />
                        </div>
                      </div>
                    </div>

                    {formData.department && (
                      <DepartmentRules
                        department={formData.department}
                        onValidationChange={setValidationStatus}
                      />
                    )}

                    <RotationPatternSelector
                      value={formData.rotationPattern}
                      weekInterval={formData.rotationWeeks}
                      monthInterval={formData.rotationMonths}
                      startDate={formData.startDate}
                      endDate={formData.endDate}
                      onChange={(pattern, interval) => {
                        if (!formData.endDate && pattern !== 'none') return;

                        setFormData({
                          ...formData,
                          rotationPattern: pattern,
                          ...(pattern === 'weekly' ? { rotationWeeks: interval } : {}),
                          ...(pattern === 'monthly' ? { rotationMonths: interval } : {})
                        });
                      }}
                    />

                    <div className="flex flex-col sm:flex-row gap-4">
                      <div className="flex-1">
                        <label htmlFor="employee-search" className="block text-sm font-medium text-gray-700">
                          Search Employees
                        </label>
                        <div className="mt-1 relative rounded-md shadow-sm">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-5 w-5 text-gray-400" />
                          </div>
                          <input
                            type="text"
                            id="employee-search"
                            className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 py-2 sm:text-sm border-gray-300 rounded-md shadow-sm"
                            placeholder="Search by name, code or department"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="w-full sm:w-48">
                        <label htmlFor="assignment-filter" className="block text-sm font-medium text-gray-700">
                          Assignment Status
                        </label>
                        <select
                          id="assignment-filter"
                          className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md shadow-sm"
                          value={assignmentFilter}
                          onChange={(e) => setAssignmentFilter(e.target.value as any)}
                        >
                          <option value="all">All Employees</option>
                          <option value="unassigned">Unassigned</option>
                          <option value="assigned">Assigned</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex items-center justify-between mb-2">
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                          checked={isAllSelected}
                          onChange={handleSelectAll}
                        />
                        <span className="text-sm font-medium text-gray-700">
                          Select All
                        </span>
                      </label>
                      <span className="text-xs text-gray-500">
                        {formData.employeeIds.length} selected | {filteredEmployeeIds.length} shown
                      </span>
                    </div>

                    <div className="mt-4 h-72 2xl:h-72 xl:h-60 overflow-y-auto border border-gray-200 rounded-md p-2">
                      {filteredEmployees.map((employee) => {
                        const isPreAssigned = preAssignedEmployees.includes(employee.id);
                        const otherAssignments = assignedEmployeesDetails.filter(a => a.employee_id === employee.id && a.shift_id !== shift.id);
                        const isAssignedToOther = otherAssignments.length > 0;
                        const hasUnresolvableConflict = otherAssignments.some(a => ['in_progress', 'completed', 'absent'].includes(a.status));
                        const isDisabled = hasUnresolvableConflict;

                        return (
                          <label
                            key={employee.id}
                            className={`flex items-start space-x-3 py-2 px-2 hover:bg-gray-50 rounded-md ${isDisabled ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'
                              } ${isPreAssigned ? 'bg-indigo-50' : ''}`}
                          >
                            <input
                              type="checkbox"
                              className="mt-1 h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded disabled:opacity-50"
                              checked={formData.employeeIds.includes(employee.id)}
                              disabled={isDisabled}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setFormData({
                                    ...formData,
                                    employeeIds: [...formData.employeeIds, employee.id]
                                  });
                                } else {
                                  setFormData({
                                    ...formData,
                                    employeeIds: formData.employeeIds.filter(id => id !== employee.id)
                                  });
                                }
                              }}
                            />
                            <div className="flex flex-col flex-1">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-0">
                                <span className="text-sm font-medium text-gray-900">
                                  {employee.name} {employee.employee_code && <span className="text-xs text-gray-500">({employee.employee_code})</span>}
                                </span>
                                <span className="text-sm text-gray-500">{employee.department}</span>
                              </div>
                              {isPreAssigned && (
                                <span className="text-xs text-indigo-600 font-medium">Currently assigned to this shift</span>
                              )}
                              {isAssignedToOther && (
                                <div className="mt-1.5 flex flex-wrap gap-1.5">
                                  {otherAssignments.map((assignment, idx) => {
                                    const isUnresolvable = ['in_progress', 'completed', 'absent'].includes(assignment.status);
                                    return (
                                      <span key={idx} className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${isUnresolvable ? 'bg-red-50 text-red-700 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                                        {isUnresolvable ? 'Conflict' : 'Reassign'}: {assignment.shift_name} ({format(new Date(assignment.schedule_date), 'MMM d')})
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </label>
                        );
                      })}
                      {filteredEmployees.length === 0 && (
                        <div className="text-center py-4 text-sm text-gray-500">
                          No employees found.
                        </div>
                      )}
                    </div>

                    {loading && progress.total > 0 && (
                      <div className="mt-4">
                        <div className="relative pt-1">
                          <div className="flex mb-2 items-center justify-between">
                            <div>
                              <span className="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full text-indigo-600 bg-indigo-200">
                                Progress
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="text-xs font-semibold inline-block text-indigo-600">
                                {Math.round((progress.current / progress.total) * 100)}%
                              </span>
                            </div>
                          </div>
                          <div className="overflow-hidden h-2 mb-4 text-xs flex rounded bg-indigo-200">
                            <div
                              style={{ width: `${(progress.current / progress.total) * 100}%` }}
                              className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-indigo-500"
                            ></div>
                          </div>
                          <div className="text-xs text-gray-500">
                            Processed: {progress.current} / {progress.total}
                            (Success: {progress.success}, Failed: {progress.failed})
                          </div>
                        </div>
                      </div>
                    )}

                    <ValidationStatus status={validationStatus} />

                    {formData.employeeIds.some(id => assignedEmployeesDetails.some(a => a.employee_id === id && a.shift_id !== shift.id)) && (
                      <div className="mt-4 p-4 bg-amber-50 rounded-md border border-amber-200">
                        <label htmlFor="reassignReason" className="block text-sm font-medium text-amber-800 mb-1">
                          Reason for Reassignment <span className="text-red-500">*</span>
                        </label>
                        <textarea
                          id="reassignReason"
                          required
                          rows={2}
                          className="shadow-sm focus:ring-amber-500 focus:border-amber-500 block w-full sm:text-sm border-amber-300 rounded-md"
                          placeholder="Please explain why these employees are being reassigned..."
                          value={reassignReason}
                          onChange={(e) => setReassignReason(e.target.value)}
                        />
                      </div>
                    )}
                  </div>

                  <div className="mt-4 sm:mt-3 sm:flex sm:flex-row-reverse shrink-0 pt-3 border-t border-gray-200">
                    <button
                      type="submit"
                      disabled={loading || !validationStatus.valid}
                      className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-3 py-1.5 bg-indigo-600 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:ml-3 sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loading ? 'Assigning...' : 'Assign Shifts'}
                    </button>
                    <button
                      type="button"
                      className="mt-2 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-3 py-1.5 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:w-auto"
                      onClick={handleSafeClose}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}