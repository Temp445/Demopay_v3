import React, { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { Clock, AlertCircle } from 'lucide-react';
import { useShiftsStore, type ShiftAssignment } from '../../../stores/shiftsStore';
import { type Employee } from '../../../stores/employeesStore';

interface EmployeeAvailabilityProps {
  employee: Employee;
  startDate: string;
  endDate: string;
}

export default function EmployeeAvailability({
  employee,
  startDate,
  endDate
}: EmployeeAvailabilityProps) {
  const { assignments: assignmentsState, fetchShiftAssignments } = useShiftsStore();
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadAssignments = async () => {
      try {
        setLoading(true);
        await fetchShiftAssignments(startDate, endDate, employee.id);
        setAssignments(assignmentsState.items);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load assignments');
      } finally {
        setLoading(false);
      }
    };

    loadAssignments();
  }, [employee.id, startDate, endDate]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-32">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md bg-red-50 p-4">
        <div className="flex">
          <AlertCircle className="h-5 w-5 text-red-400" />
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">{error}</h3>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-4 border-b">
        <h3 className="text-lg font-medium text-gray-900">
          {employee.name}'s Schedule
        </h3>
        <p className="mt-1 text-sm text-gray-500">
          {format(parseISO(startDate), 'MMM d')} -{' '}
          {format(parseISO(endDate), 'MMM d, yyyy')}
        </p>
      </div>

      <div className="p-4">
        {assignments.length === 0 ? (
          <p className="text-sm text-gray-500">No shifts scheduled</p>
        ) : (
          <div className="space-y-4">
            {assignments.map((assignment) => (
              <div
                key={assignment.id}
                className="flex items-start p-3 bg-gray-50 rounded-md"
              >
                <Clock className="h-5 w-5 text-gray-400 mt-0.5 mr-3" />
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {assignment.shift?.name}
                  </p>
                  <p className="text-sm text-gray-500">
                    {format(parseISO(assignment.schedule_date), 'MMM d')} •{' '}
                    {format(parseISO(assignment.shift?.start_time || ''), 'HH:mm')}{' '}
                    - {format(parseISO(assignment.shift?.end_time || ''), 'HH:mm')}
                  </p>
                  {assignment.notes && (
                    <p className="mt-1 text-sm text-gray-500">
                      {assignment.notes}
                    </p>
                  )}
                </div>
                <span
                  className={`ml-auto inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    assignment.status === 'completed'
                      ? 'bg-green-100 text-green-800'
                      : assignment.status === 'in_progress'
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-blue-100 text-blue-800'
                  }`}
                >
                  {assignment.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}