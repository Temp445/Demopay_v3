import React, { useEffect } from 'react';
import { Clock, AlertCircle } from 'lucide-react';
import { useAttendanceStore, type AttendanceLog } from '../../../stores/attendanceStore';
import { useAuth } from '../../../contexts/AuthContext';

interface AttendanceListProps {
  filters: {
    start_date: string;
    end_date: string;
    status: string;
  };
  onRefresh: () => void;
  lastRefresh: number;
  employeeId?: string;
}

export default function AttendanceList({
  filters,
  lastRefresh,
  employeeId,
}: AttendanceListProps) {
  const { user } = useAuth();
  const { items: records, loading, error, fetchAttendanceRecords } = useAttendanceStore();

  useEffect(() => {
    if (!user) return;

    fetchAttendanceRecords(
      employeeId || '',
      filters.start_date ||
        new Date(new Date().getFullYear(), new Date().getMonth(), 1)
          .toISOString()
          .split('T')[0],
      filters.end_date || new Date().toISOString().split('T')[0]
    );
  }, [user, filters, lastRefresh, employeeId, fetchAttendanceRecords]);

  const filteredRecords = records.filter((record) => {
    if (filters.status && record.status !== filters.status) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
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
    <div className="bg-white shadow overflow-hidden sm:rounded-md">
      <ul className="divide-y divide-gray-200">
        {filteredRecords.map((record) => (
          <li key={record.id}>
            <div className="px-4 py-4 sm:px-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <Clock className="h-5 w-5 text-gray-400" />
                  <p className="ml-2 text-sm font-medium text-gray-900">
                    {new Date(record.date).toLocaleDateString()}
                  </p>
                </div>
                <div className="ml-2 flex-shrink-0">
                  <span
                    className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                      record.status === 'Present'
                        ? 'bg-green-100 text-green-800'
                        : record.status === 'Late'
                        ? 'bg-yellow-100 text-yellow-800'
                        : record.status === 'Half Day'
                        ? 'bg-orange-100 text-orange-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {record.status}
                  </span>
                </div>
              </div>
              <div className="mt-2 sm:flex sm:justify-between">
                <div className="sm:flex">
                  <p className="flex items-center text-sm text-gray-500">
                    Clock In:{' '}
                    {record.clock_in
                      ? new Date(record.clock_in).toLocaleTimeString()
                      : 'N/A'}
                  </p>
                  <p className="mt-2 flex items-center text-sm text-gray-500 sm:mt-0 sm:ml-6">
                    Clock Out:{' '}
                    {record.clock_out
                      ? new Date(record.clock_out).toLocaleTimeString()
                      : 'N/A'}
                  </p>
                </div>
              </div>
              {record.notes && (
                <div className="mt-2">
                  <p className="text-sm text-gray-500">{record.notes}</p>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
