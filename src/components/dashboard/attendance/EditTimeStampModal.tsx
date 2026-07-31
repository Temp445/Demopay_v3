import React, { useState, useEffect } from 'react';
import { X, Clock, Calendar, AlertCircle, Save, History, Info, Briefcase, AlertTriangle } from 'lucide-react';
import { useTimeStampManagementStore } from '../../../stores/timeStampManagementStore';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import type { ProcessedTimeRecord } from '../../../types/timeStampManagement';

interface EditTimeStampModalProps {
  record: ProcessedTimeRecord;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  hasPendingRequest?: boolean; // Added to check for pending requests
}

interface FormErrors {
  clock_in?: string;
  clock_out?: string;
  reason?: string;
  shift?: string;
}

export default function EditTimeStampModal({ record, isOpen, onClose, onSuccess, hasPendingRequest = false }: EditTimeStampModalProps) {
  // Pull shifts from the store
  const { updateTimeStamp, createTimeStamp, fetchEditLogs, editLogs, loading, shifts } = useTimeStampManagementStore();

  const [clockIn, setClockIn] = useState('');
  const [clockOut, setClockOut] = useState('');
  const [reason, setReason] = useState('');
  // New state for selected shift
  const [selectedShiftId, setSelectedShiftId] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [showHistory, setShowHistory] = useState(false);
  const [currentMaxTime, setCurrentMaxTime] = useState('');

  const logs = editLogs[record.id] || [];

  const formatForInput = (dateInput: string | Date | null): string => {
    if (!dateInput) return '';
    try {
      const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
      return format(date, "yyyy-MM-dd'T'HH:mm");
    } catch (error) {
      return '';
    }
  };

  useEffect(() => {
    if (isOpen) {
      setClockIn(record.clock_in ? formatForInput(record.clock_in) : '');
      setClockOut(record.clock_out ? formatForInput(record.clock_out) : '');
      setReason('');
      setErrors({});
      setShowHistory(false);
      
      // Initialize shift dropdown with the record's matched shift
      setSelectedShiftId(record.matched_shift_id || '');

      setCurrentMaxTime(formatForInput(new Date()));

      if (record.has_edits) {
        fetchEditLogs(record.id);
      }
    }
  }, [isOpen, record, fetchEditLogs]);

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};
    const now = new Date();

    if (!reason.trim()) {
      newErrors.reason = 'Reason for change is required';
    }

    if (clockIn) {
      const inDate = new Date(clockIn);
      if (inDate > now) newErrors.clock_in = 'Clock-in time cannot be in the future';
    }

    if (clockOut) {
      const outDate = new Date(clockOut);
      if (outDate > now) newErrors.clock_out = 'Clock-out time cannot be in the future';
    }

    if (clockIn && clockOut && !newErrors.clock_in && !newErrors.clock_out) {
      const inDate = new Date(clockIn);
      const outDate = new Date(clockOut);
      if (outDate <= inDate) newErrors.clock_out = 'Clock-out time must be after clock-in time';
      
      const diffHours = (outDate.getTime() - inDate.getTime()) / (1000 * 60 * 60);
      if (diffHours > 24) newErrors.clock_out = 'Clock-out cannot be more than 24 hours after clock-in';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (hasPendingRequest) return;
    if (!validateForm()) return;

    // Check if Shift changed or Times changed
    const hasTimeChanges =
      clockIn !== formatForInput(record.clock_in || '') ||
      clockOut !== formatForInput(record.clock_out || '');
    
    const hasShiftChanges = selectedShiftId !== (record.matched_shift_id || '');

    if (!hasTimeChanges && !hasShiftChanges) {
      toast.error('No changes detected');
      return;
    }

    try {
      const isRawTimestamp = record.id.startsWith('ts_');

      const payload = {
        clock_in: clockIn ? new Date(clockIn).toISOString() : null,
        clock_out: clockOut ? new Date(clockOut).toISOString() : null,
        shift_id: selectedShiftId || undefined // Send the selected Shift ID
      };

      if (isRawTimestamp) {
        await createTimeStamp({
          employee_id: record.employee_id,
          date: record.date,
          ...payload,
          notes: reason 
        });
      } else {
        await updateTimeStamp({
          attendance_log_id: record.id,
          ...payload,
          reason_for_change: reason
        });
      }

      onSuccess();
    } catch (error: any) {
      const msg = error?.message || error?.details || (error instanceof Error ? error.message : 'Failed to update time stamp');
      toast.error(msg);
    }
  };

  const calculateTotalHours = (): string => {
    if (!clockIn || !clockOut) return 'N/A';
    try {
      const inDate = new Date(clockIn);
      const outDate = new Date(clockOut);
      const diffMs = outDate.getTime() - inDate.getTime();
      const hours = diffMs / (1000 * 60 * 60);
      return diffMs > 0 ? `${hours.toFixed(2)} hrs` : 'Invalid';
    } catch (error) {
      return 'Invalid';
    }
  };

  const formatDateTime = (dateTimeString: string) => {
    try {
      return format(new Date(dateTimeString), 'MMM dd, yyyy HH:mm');
    } catch (error) {
      return 'Invalid Date';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Edit Time Stamp</h2>
            <p className="mt-1 text-sm text-gray-500">
              {record.employee_name} - {format(new Date(record.date), 'MMM dd, yyyy')}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-500">
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          
          {/* Warning Banner for Pending Requests */}
          {hasPendingRequest && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
              <div className="flex items-start">
                <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 mr-3 flex-shrink-0" />
                <div>
                  <h3 className="text-sm font-medium text-yellow-800">Cannot edit time stamp</h3>
                  <p className="mt-1 text-sm text-yellow-700">
                    This record has a pending Gate Pass or Permission request. You must review and approve/reject the request before modifying these timestamps.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-900 mb-3">Employee Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-gray-500">Employee Code</p>
                <p className="font-medium text-gray-900">{record.employee_code}</p>
              </div>
              <div>
                <p className="text-gray-500">Department</p>
                <p className="font-medium text-gray-900">{record.department}</p>
              </div>
            </div>
          </div>

          {record.has_edits && (
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
              <div className="flex items-start">
                <Info className="h-5 w-5 text-blue-400 mr-2 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-blue-800">
                    This record has been edited {record.edit_count} time(s)
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowHistory(!showHistory)}
                    className="mt-2 text-sm text-blue-600 hover:text-blue-800 underline"
                  >
                    {showHistory ? 'Hide' : 'View'} Edit History
                  </button>
                </div>
              </div>
            </div>
          )}

          {showHistory && logs.length > 0 && (
             <div className="bg-white border border-gray-200 rounded-lg p-4">
               <div className="space-y-3 max-h-60 overflow-y-auto">
                {logs.map((log) => (
                  <div key={log.id} className="bg-gray-50 rounded p-3 text-sm">
                    <div className="flex justify-between items-start mb-2">
                       <span className="text-gray-500 text-xs">{formatDateTime(log.edited_at)}</span>
                       <span className="text-gray-500 text-xs font-medium">Edited by: {log.edited_by_name || 'System'}</span>
                    </div>
                     <div className="text-xs space-y-2">
                      <div>
                        <span className="text-gray-500 font-medium">Reason: </span>
                        <span className="text-gray-900">{log.reason_for_change}</span>
                      </div>
                      
                      {(log.original_clock_in !== log.modified_clock_in || log.original_clock_out !== log.modified_clock_out) && (
                        <div className="bg-white p-2 rounded border border-gray-200 mt-2 space-y-1">
                          <p className="font-semibold text-gray-500 mb-1 text-[10px] uppercase tracking-wider">Changes Made</p>
                          {log.original_clock_in !== log.modified_clock_in && (
                            <div className="flex items-center gap-2 text-gray-700">
                              <span className="w-16 font-medium">Clock In:</span>
                              <span className="line-through text-gray-400">{log.original_clock_in ? formatDateTime(log.original_clock_in) : '--'}</span>
                              <span className="text-indigo-500 font-bold">→</span>
                              <span className="font-medium text-gray-900">{log.modified_clock_in ? formatDateTime(log.modified_clock_in) : '--'}</span>
                            </div>
                          )}
                          {log.original_clock_out !== log.modified_clock_out && (
                            <div className="flex items-center gap-2 text-gray-700">
                              <span className="w-16 font-medium">Clock Out:</span>
                              <span className="line-through text-gray-400">{log.original_clock_out ? formatDateTime(log.original_clock_out) : '--'}</span>
                              <span className="text-indigo-500 font-bold">→</span>
                              <span className="font-medium text-gray-900">{log.modified_clock_out ? formatDateTime(log.modified_clock_out) : '--'}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* --- SHIFT SELECTION --- */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Briefcase className="h-4 w-4 inline-block mr-1" />
            Work Shift
            </label>
            <select
              disabled={hasPendingRequest}
              value={selectedShiftId}
              onChange={(e) => setSelectedShiftId(e.target.value)}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm disabled:bg-gray-100 disabled:text-gray-500"
            >
              <option value="">-- No Specific Shift --</option>
              {shifts.map((shift) => (
                <option key={shift.id} value={shift.id}>
                  {shift.name} ({shift.start_time} - {shift.end_time})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Clock className="h-4 w-4 inline-block mr-1" />
                Clock-In Time
              </label>
              <input
                type="datetime-local"
                max={currentMaxTime} 
                value={clockIn}
                disabled={hasPendingRequest}
                onChange={(e) => {
                  setClockIn(e.target.value);
                  if (errors.clock_in) setErrors(prev => ({ ...prev, clock_in: undefined }));
                }}
                className={`block w-full rounded-md shadow-sm sm:text-sm disabled:bg-gray-100 disabled:text-gray-500 ${
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
                max={currentMaxTime}
                value={clockOut}
                disabled={hasPendingRequest}
                onChange={(e) => {
                  setClockOut(e.target.value);
                  if (errors.clock_out) setErrors(prev => ({ ...prev, clock_out: undefined }));
                }}
                className={`block w-full rounded-md shadow-sm sm:text-sm disabled:bg-gray-100 disabled:text-gray-500 ${
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

          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm font-medium text-gray-700">Calculated Total Hours</p>
                <p className="text-xs text-gray-500">Based on clock-in and clock-out times</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-gray-900">{calculateTotalHours()}</p>
                {record.total_hours !== null && (
                  <p className="text-xs text-gray-500">
                    Original: {record.total_hours.toFixed(2)} hrs
                  </p>
                )}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reason for Change <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              disabled={hasPendingRequest}
              onChange={(e) => {
                setReason(e.target.value);
                if (errors.reason) setErrors(prev => ({ ...prev, reason: undefined }));
              }}
              rows={4}
              className={`block w-full rounded-md shadow-sm sm:text-sm disabled:bg-gray-100 disabled:text-gray-500 ${
                errors.reason
                  ? 'border-red-300 focus:ring-red-500 focus:border-red-500'
                  : 'border-gray-300 focus:ring-indigo-500 focus:border-indigo-500'
              }`}
              placeholder="Provide a detailed reason for this change..."
            />
            {errors.reason && (
              <p className="mt-1 text-sm text-red-600 flex items-center">
                <AlertCircle className="h-4 w-4 mr-1" />
                {errors.reason}
              </p>
            )}
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
              disabled={loading || hasPendingRequest}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="h-4 w-4 mr-2" />
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}