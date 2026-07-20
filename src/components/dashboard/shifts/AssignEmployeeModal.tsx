import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { X, Search } from 'lucide-react';
import { useShiftsStore, type Shift } from '../../../stores/shiftsStore';
import { useEmployeesStore, type Employee } from '../../../stores/employeesStore';

interface AssignEmployeeModalProps {
  shift: Shift;
  isOpen: boolean;
  onClose: () => void;
  onAssignmentComplete: () => void;
}

export default function AssignEmployeeModal({
  shift,
  isOpen,
  onClose,
  onAssignmentComplete
}: AssignEmployeeModalProps) {
  const { items: employeesData, fetchEmployees } = useEmployeesStore();
  const { createShiftAssignment } = useShiftsStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [scheduleDate, setScheduleDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  useEffect(() => {
    const loadEmployees = async () => {
      try {
        await fetchEmployees();
        setEmployees(employeesData.filter(emp => emp.status === 'Active'));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load employees');
      }
    };

    if (isOpen) {
      loadEmployees();
    }
  }, [isOpen]);

  const filteredEmployees = employees.filter(employee =>
    employee.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    employee.department.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedEmployees.length === 0) {
      setError('Please select at least one employee');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await Promise.all(
        selectedEmployees.map(employeeId =>
          createShiftAssignment({
            shift_id: shift.id,
            employee_id: employeeId,
            schedule_date: scheduleDate,
            status: 'scheduled',
            overtime_minutes: 0
          })
        )
      );

      onAssignmentComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign employees');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity" aria-hidden="true">
          <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
        </div>

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">
          &#8203;
        </span>

        <div className="inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
          <div className="absolute top-0 right-0 pt-4 pr-4">
            <button
              onClick={onClose}
              className="bg-white rounded-md text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              <span className="sr-only">Close</span>
              <X className="h-6 w-6" aria-hidden="true" />
            </button>
          </div>

          <div className="sm:flex sm:items-start">
            <div className="mt-3 text-center sm:mt-0 sm:text-left w-full">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                Assign Employees to Shift
              </h3>
              <div className="mt-2">
                <p className="text-sm text-gray-500">
                  {shift.name} ({format(new Date(`2000-01-01T${shift.start_time}`), 'h:mm a')} - 
                  {format(new Date(`2000-01-01T${shift.end_time}`), 'h:mm a')})
                </p>
              </div>

              {error && (
                <div className="mt-2 rounded-md bg-red-50 p-4">
                  <div className="text-sm text-red-700">{error}</div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="mt-4">
                <div className="mb-4">
                  <label htmlFor="schedule_date" className="block text-sm font-medium text-gray-700">
                    Schedule Date
                  </label>
                  <input
                    type="date"
                    id="schedule_date"
                    required
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                  />
                </div>

                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    placeholder="Search employees..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>

                <div className="mt-4 max-h-60 overflow-y-auto">
                  {filteredEmployees.map((employee) => (
                    <label
                      key={employee.id}
                      className="flex items-center space-x-3 py-2 px-2 hover:bg-gray-50 rounded-md cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                        checked={selectedEmployees.includes(employee.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedEmployees([...selectedEmployees, employee.id]);
                          } else {
                            setSelectedEmployees(selectedEmployees.filter(id => id !== employee.id));
                          }
                        }}
                      />
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-gray-900">{employee.name}</span>
                        <span className="text-sm text-gray-500">{employee.department}</span>
                      </div>
                    </label>
                  ))}
                </div>

                <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
                  >
                    {loading ? 'Assigning...' : 'Assign Employees'}
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
    </div>
  );
}