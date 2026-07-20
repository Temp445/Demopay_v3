import React from 'react';
import { format, parseISO } from 'date-fns';
import { Clock, User, AlertCircle } from 'lucide-react';
import { type ShiftAssignment } from '../../../stores/shiftsStore';
import ShiftAttendanceSettings from './ShiftAttendanceSettings';

interface ShiftCardProps {
  shift: ShiftAssignment;
  onClick?: () => void;
  compact?: boolean;
  showAttendanceSettings?: boolean;
}

export default function ShiftCard({ 
  shift, 
  onClick, 
  compact = false,
  showAttendanceSettings = false
}: ShiftCardProps) {
  const getStatusColor = (status: ShiftAssignment['status']) => {
    switch (status) {
      case 'scheduled':
        return 'bg-blue-100 text-blue-800';
      case 'in_progress':
        return 'bg-yellow-100 text-yellow-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatTime = (timeString: string | null | undefined): string => {
    if (!timeString) return 'N/A';
    try {
      // Handle both full ISO datetime and time-only strings
      const date = timeString.includes('T') 
        ? parseISO(timeString)
        : parseISO(`2000-01-01T${timeString}`);
      return format(date, 'HH:mm');
    } catch (error) {
      console.error('Error formatting time:', error);
      return 'Invalid Time';
    }
  };

  if (compact) {
    return (
      <button
        onClick={onClick}
        className="w-full text-left p-2 rounded-md bg-gray-50 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-900">
            {shift.shift?.name}
          </span>
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(
              shift.status
            )}`}
          >
            {shift.status}
          </span>
        </div>
        <div className="mt-1 text-xs text-gray-500">
          {formatTime(shift.shift?.start_time)} - {formatTime(shift.shift?.end_time)}
        </div>
      </button>
    );
  }

  return (
    <div
      className="bg-white rounded-lg shadow p-4 hover:shadow-md transition-shadow cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-gray-900">{shift.shift?.name}</h3>
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
            shift.status
          )}`}
        >
          {shift.status}
        </span>
      </div>

      <div className="space-y-2">
        <div className="flex items-center text-gray-500">
          <Clock className="h-4 w-4 mr-2" />
          <span className="text-sm">
            {formatTime(shift.shift?.start_time)} - {formatTime(shift.shift?.end_time)}
          </span>
        </div>

        {shift.employee && (
          <div className="flex items-center text-gray-500">
            <User className="h-4 w-4 mr-2" />
            <span className="text-sm">
              {shift.employee.name} - {shift.employee.department}
            </span>
          </div>
        )}

        {shift.notes && (
          <div className="flex items-start text-gray-500">
            <AlertCircle className="h-4 w-4 mr-2 mt-0.5" />
            <span className="text-sm">{shift.notes}</span>
          </div>
        )}
      </div>

      {shift.overtime_minutes > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="text-sm text-orange-600">
            Overtime: {Math.floor(shift.overtime_minutes / 60)}h{' '}
            {shift.overtime_minutes % 60}m
          </div>
        </div>
      )}

      {showAttendanceSettings && shift.shift && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <ShiftAttendanceSettings shift={shift.shift} />
        </div>
      )}
    </div>
  );
}