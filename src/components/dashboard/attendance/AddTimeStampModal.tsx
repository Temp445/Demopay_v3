import React, { useState, useEffect } from 'react';
import { X, Clock, Calendar, AlertCircle, Save, UserPlus } from 'lucide-react';
import { useTimeStampManagementStore } from '../../../stores/timeStampManagementStore';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

interface AddTimeStampModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  preselectedEmployeeId?: string;
  preselectedDate?: string;
}

interface FormErrors {
  employee_id?: string;
  date?: string;
  clock_in?: string;
  clock_out?: string;
}

export default function AddTimeStampModal({
  isOpen,
  onClose,
  onSuccess,
  preselectedEmployeeId,
  preselectedDate
}: AddTimeStampModalProps) {
  const { createTimeStamp, employees, fetchEmployees, loading } = useTimeStampManagementStore();

  const [employeeId, setEmployeeId] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [clockIn, setClockIn] = useState('');
  const [clockOut, setClockOut] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});

  useEffect(() => {
    if (isOpen) {
      fetchEmployees();
      setEmployeeId(preselectedEmployeeId || '');
      setDate(preselectedDate || format(new Date(), 'yyyy-MM-dd'));
      setClockIn('');
      setClockOut('');
      setNotes('');
      setErrors({});
    }
  }, [isOpen, fetchEmployees, preselectedEmployeeId, preselectedDate]);

  const formatForInput = (dateTimeString: string): string => {
    try {
      const date = new Date(dateTimeString);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${year}-${month}-${day}T${hours}:${minutes}`;
    } catch (error) {
      return '';
    }
  };

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!employeeId) {
      newErrors.employee_id = 'Employee is required';
    }

    if (!date) {
      newErrors.date = 'Date is required';
    }

    if (clockIn && clockOut) {
      const inDate = new Date(clockIn);
      const outDate = new Date(clockOut);

      if (outDate <= inDate) {
        newErrors.clock_out = 'Clock-out time must be after clock-in time';
      }

      const diffHours = (outDate.getTime() - inDate.getTime()) / (1000 * 60 * 60);
      if (diffHours > 24) {
        newErrors.clock_out = 'Clock-out cannot be more than 24 hours after clock-in';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    if (!clockIn && !clockOut) {
      toast.error('Please provide at least clock-in or clock-out time');
      return;
    }

    try {
      await createTimeStamp({
        employee_id: employeeId,
        date: date,
        clock_in: clockIn ? new Date(clockIn).toISOString() : null,
        clock_out: clockOut ? new Date(clockOut).toISOString() : null,
        notes: notes || undefined
      });

      toast.success('Time stamp created successfully');
      onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create time stamp');
    }
  };

  const calculateTotalHours = (): string => {
    if (!clockIn || !clockOut) return 'N/A';

    try {
      const inDate = new Date(clockIn);
      const outDate = new Date(clockOut);
      const diffMs = outDate.getTime() - inDate.getTime();
      const hours = diffMs / (1000 * 60 * 60);
      return `${hours.toFixed(2)} hrs`;
    } catch (error) {
      return 'Invalid';
    }
  };

  const selectedEmployee = employees.find(emp => emp.id === employeeId);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center">
            <UserPlus className="h-6 w-6 text-indigo-600 mr-3" />
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Create New Time Stamp</h2>
              <p className="mt-1 text-sm text-gray-500">
                Enter clock-in and clock-out times for an employee
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-500">
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Employee <span className="text-red-500">*</span>
              </label>
              <select
                value={employeeId}
                onChange={(e) => {
                  setEmployeeId(e.target.value);
                  if (errors.employee_id) {
                    setErrors(prev => ({ ...prev, employee_id: undefined }));
                  }
                }}
                className={`block w-full rounded-md shadow-sm sm:text-sm ${
                  errors.employee_id
                    ? 'border-red-300 focus:ring-red-500 focus:border-red-500'
                    : 'border-gray-300 focus:ring-indigo-500 focus:border-indigo-500'
                }`}
              >
                <option value="">Select Employee</option>
                {employees.map(employee => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name} ({employee.employee_code}) - {employee.department}
                  </option>
                ))}
              </select>
              {errors.employee_id && (
                <p className="mt-1 text-sm text-red-600 flex items-center">
                  <AlertCircle className="h-4 w-4 mr-1" />
                  {errors.employee_id}
                </p>
              )}
            </div>

            {selectedEmployee && (
              <div className="md:col-span-2 bg-gray-50 rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-900 mb-2">Employee Details</h3>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">Code</p>
                    <p className="font-medium text-gray-900">{selectedEmployee.employee_code}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Department</p>
                    <p className="font-medium text-gray-900">{selectedEmployee.department}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Email</p>
                    <p className="font-medium text-gray-900">{selectedEmployee.email}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Calendar className="h-4 w-4 inline-block mr-1" />
                Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  if (errors.date) {
                    setErrors(prev => ({ ...prev, date: undefined }));
                  }
                }}
                className={`block w-full rounded-md shadow-sm sm:text-sm ${
                  errors.date
                    ? 'border-red-300 focus:ring-red-500 focus:border-red-500'
                    : 'border-gray-300 focus:ring-indigo-500 focus:border-indigo-500'
                }`}
              />
              {errors.date && (
                <p className="mt-1 text-sm text-red-600 flex items-center">
                  <AlertCircle className="h-4 w-4 mr-1" />
                  {errors.date}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Clock className="h-4 w-4 inline-block mr-1" />
                Clock-In Time
              </label>
              <input
                type="datetime-local"
                value={clockIn}
                onChange={(e) => {
                  setClockIn(e.target.value);
                  if (errors.clock_in) {
                    setErrors(prev => ({ ...prev, clock_in: undefined }));
                  }
                }}
                className={`block w-full rounded-md shadow-sm sm:text-sm ${
                  errors.clock_in
                    ? 'border-red-300 focus:ring-red-500 focus:border-red-500'
                    : 'border-gray-300 focus:ring-indigo-500 focus:border-indigo-500'
                }`}
              />
              {errors.clock_in && (
                <p className="mt-1 text-sm text-red-600 flex items-center">
                  <AlertCircle className="h-4 w-4 mr-1" />
                  {errors.clock_in}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Clock className="h-4 w-4 inline-block mr-1" />
                Clock-Out Time
              </label>
              <input
                type="datetime-local"
                value={clockOut}
                onChange={(e) => {
                  setClockOut(e.target.value);
                  if (errors.clock_out) {
                    setErrors(prev => ({ ...prev, clock_out: undefined }));
                  }
                }}
                className={`block w-full rounded-md shadow-sm sm:text-sm ${
                  errors.clock_out
                    ? 'border-red-300 focus:ring-red-500 focus:border-red-500'
                    : 'border-gray-300 focus:ring-indigo-500 focus:border-indigo-500'
                }`}
              />
              {errors.clock_out && (
                <p className="mt-1 text-sm text-red-600 flex items-center">
                  <AlertCircle className="h-4 w-4 mr-1" />
                  {errors.clock_out}
                </p>
              )}
            </div>
          </div>

          {clockIn && clockOut && (
            <div className="bg-indigo-50 rounded-lg p-4">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium text-indigo-900">Calculated Total Hours</p>
                  <p className="text-xs text-indigo-700">Based on clock-in and clock-out times</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-indigo-900">{calculateTotalHours()}</p>
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              placeholder="Add any additional notes or comments..."
            />
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
            <div className="flex">
              <AlertCircle className="h-5 w-5 text-yellow-400 mr-2 flex-shrink-0" />
              <div className="text-sm text-yellow-800">
                <p className="font-medium">Please Note:</p>
                <ul className="mt-1 list-disc list-inside space-y-1">
                  <li>At least one time (clock-in or clock-out) must be provided</li>
                  <li>All records are logged with your user information</li>
                  <li>Records can be edited later if needed</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="h-4 w-4 mr-2" />
              {loading ? 'Creating...' : 'Create Time Stamp'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
