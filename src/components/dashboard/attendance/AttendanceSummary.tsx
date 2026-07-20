import React, { useState, useEffect } from 'react';
import { Clock, AlertCircle, Sun, Coffee } from 'lucide-react';
import { useAttendanceStore } from '../../../stores/attendanceStore';
import { useAuth } from '../../../contexts/AuthContext';

interface AttendanceSummaryProps {
  startDate: string;
  endDate: string;
  lastRefresh: number;
  employeeId?: string;
}

interface SummaryStats {
  totalDays: number;
  presentDays: number;
  lateDays: number;
  absentDays: number;
  halfDays: number;
  averageClockIn: string;
  averageClockOut: string;
}

export default function AttendanceSummary({
  startDate,
  endDate,
  lastRefresh,
  employeeId,
}: AttendanceSummaryProps) {
  const [summary, setSummary] = useState<SummaryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const { fetchAttendanceRecords } = useAttendanceStore();

  useEffect(() => {
    const calculateSummary = async () => {
      if (!user) return;

      try {
        setLoading(true);
        await fetchAttendanceRecords(
          employeeId || '',
          startDate ||
            new Date(new Date().getFullYear(), new Date().getMonth(), 1)
              .toISOString()
              .split('T')[0],
          endDate || new Date().toISOString().split('T')[0]
        );

        const records = useAttendanceStore.getState().items;

        const stats: SummaryStats = {
          totalDays: records.length,
          presentDays: records.filter((r) => r.status === 'Present').length,
          lateDays: records.filter((r) => r.status === 'Late').length,
          absentDays: records.filter((r) => r.status === 'Absent').length,
          halfDays: records.filter((r) => r.status === 'Half Day').length,
          averageClockIn: '00:00',
          averageClockOut: '00:00',
        };

        // Calculate average clock in/out times
        const clockInTimes = records
          .filter((r) => r.clock_in)
          .map(
            (r) =>
              new Date(r.clock_in!).getHours() * 60 +
              new Date(r.clock_in!).getMinutes()
          );

        const clockOutTimes = records
          .filter((r) => r.clock_out)
          .map(
            (r) =>
              new Date(r.clock_out!).getHours() * 60 +
              new Date(r.clock_out!).getMinutes()
          );

        if (clockInTimes.length > 0) {
          const avgClockIn = Math.floor(
            clockInTimes.reduce((a, b) => a + b, 0) / clockInTimes.length
          );
          stats.averageClockIn = `${Math.floor(avgClockIn / 60)
            .toString()
            .padStart(2, '0')}:${(avgClockIn % 60)
            .toString()
            .padStart(2, '0')}`;
        }

        if (clockOutTimes.length > 0) {
          const avgClockOut = Math.floor(
            clockOutTimes.reduce((a, b) => a + b, 0) / clockOutTimes.length
          );
          stats.averageClockOut = `${Math.floor(avgClockOut / 60)
            .toString()
            .padStart(2, '0')}:${(avgClockOut % 60)
            .toString()
            .padStart(2, '0')}`;
        }

        setSummary(stats);
        setError(null);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Failed to load attendance summary'
        );
      } finally {
        setLoading(false);
      }
    };

    calculateSummary();
  }, [user, startDate, endDate, lastRefresh, employeeId, fetchAttendanceRecords]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, index) => (
          <div
            key={index}
            className="bg-white rounded-lg p-6 shadow animate-pulse"
          >
            <div className="h-4 bg-gray-200 rounded w-1/2 mb-4"></div>
            <div className="h-8 bg-gray-200 rounded"></div>
          </div>
        ))}
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

  if (!summary) return null;

  const stats = [
    {
      name: 'Present Days',
      value: summary.presentDays,
      icon: Sun,
      color: 'text-green-600',
      bgColor: 'bg-green-500',
    },
    {
      name: 'Late Days',
      value: summary.lateDays,
      icon: Clock,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-500',
    },
    {
      name: 'Half Days',
      value: summary.halfDays,
      icon: Coffee,
      color: 'text-orange-600',
      bgColor: 'bg-orange-500',
    },
    {
      name: 'Absent Days',
      value: summary.absentDays,
      icon: AlertCircle,
      color: 'text-red-600',
      bgColor: 'bg-red-500',
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((item) => (
        <div
          key={item.name}
          className="relative bg-white pt-5 px-4 pb-12 sm:pt-6 sm:px-6 rounded-lg overflow-hidden shadow"
        >
          <dt>
            <div className={`absolute rounded-md p-3 ${item.bgColor}`}>
              <item.icon className="h-6 w-6 text-white" aria-hidden="true" />
            </div>
            <p className="ml-16 text-sm font-medium text-gray-500 truncate">
              {item.name}
            </p>
          </dt>
          <dd className="ml-16 pb-6 flex items-baseline sm:pb-7">
            <p className="text-2xl font-semibold text-gray-900">{item.value}</p>
            <div className="absolute bottom-0 inset-x-0 bg-gray-50 px-4 py-4 sm:px-6">
              <div className="text-sm">
                <span className="font-medium text-gray-500">
                  {item.name === 'Present Days' &&
                    `Avg. Clock In: ${summary.averageClockIn}`}
                  {item.name === 'Late Days' &&
                    `Avg. Clock Out: ${summary.averageClockOut}`}
                </span>
              </div>
            </div>
          </dd>
        </div>
      ))}
    </div>
  );
}
