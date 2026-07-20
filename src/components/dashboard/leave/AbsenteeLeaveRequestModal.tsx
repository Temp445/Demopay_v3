import React, { useState, useEffect } from 'react';
import { X, Upload, Calendar, User, AlertCircle } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useLeaveStore } from '../../../stores/leaveStore';

interface AbsenteeLeaveRequestModalProps {
  employeeId: string;
  employeeName: string;
  absentDate: string;
  initialStatus?: string;
  isOpen: boolean;
  onClose: () => void;
  onLeaveAdded: () => void;
}

export default function AbsenteeLeaveRequestModal({
  employeeId,
  employeeName,
  absentDate,
  initialStatus,
  isOpen,
  onClose,
  onLeaveAdded,
}: AbsenteeLeaveRequestModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  const { 
    leaveTypes, 
    leaveBalances, 
    fetchLeaveTypes, 
    fetchLeaveBalances, 
    submitLeaveRequest 
  } = useLeaveStore();

  const safeStatus = initialStatus?.trim().toLowerCase() || '';
  const isFirstOff = safeStatus === 'first off';
  const isSecondOff = safeStatus === 'second off';
  const isForcedHalfDay = isFirstOff || isSecondOff;
  const forcedPeriod = isFirstOff ? '1st half' : isSecondOff ? '2nd half' : null;

  const [formData, setFormData] = useState({
    employee_id: employeeId,
    leave_type_id: '',
    start_date: absentDate,
    end_date: absentDate,
    reason: '',
    document_url: '',
    is_half_day_start: false,
    is_half_day_end: false,
    half_day_period_start: null as '1st half' | '2nd half' | null,
    half_day_period_end: null as '1st half' | '2nd half' | null,
  });

  useEffect(() => {
    if (isOpen) {
      fetchLeaveTypes();
      // Fetch the specific employee's balances for the year of the absent date
      const year = new Date(absentDate).getFullYear();
      fetchLeaveBalances(employeeId, year);
      
      setFormData({
        employee_id: employeeId,
        leave_type_id: '',
        start_date: absentDate,
        end_date: absentDate,
        reason: '', // Do not fill the reason
        document_url: '',
        is_half_day_start: isForcedHalfDay, // Check by default if First/Second Off
        is_half_day_end: false,
        half_day_period_start: forcedPeriod,
        half_day_period_end: null,
      });
      setError(null);
    }
  }, [isOpen, employeeId, absentDate, initialStatus, isForcedHalfDay, forcedPeriod, fetchLeaveTypes, fetchLeaveBalances]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      setError('You must be logged in to submit leave requests');
      return;
    }

    if (!formData.leave_type_id) {
      setError('Please select a leave type');
      return;
    }

    if (!formData.reason.trim()) {
      setError('Please provide a reason for leave');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      await submitLeaveRequest({
        ...formData,
        created_by: user.id,
      });

      onLeaveAdded();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit leave request');
    } finally {
      setLoading(false);
    }
  };


  const formatDate = (dateStr: string): string => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  // Helper function to calculate exact available balance
  const getAvailableBalance = (leaveTypeId: string): number => {
    const balance = leaveBalances.items.find((b) => b.leave_type_id === leaveTypeId);
    if (!balance) return 0;
    return balance.total_days - balance.used_days;
  };

  if (!isOpen) return null;

  const filteredLeaveTypes = leaveTypes.items.filter(
    (type) => type.is_active
  );

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                Create Leave Request for Absentee
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Pre-filled with absentee information
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6">
            {error && (
              <div className="mb-4 rounded-md bg-red-50 p-4">
                <div className="flex">
                  <AlertCircle className="h-5 w-5 text-red-400" />
                  <div className="ml-3">
                    <div className="text-sm text-red-700">{error}</div>
                  </div>
                </div>
              </div>
            )}

            <div className="mb-6 p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
              <div className="flex items-center gap-3 mb-2">
                <User className="h-5 w-5 text-indigo-600" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Employee</p>
                  <p className="text-sm text-gray-600">{employeeName}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-indigo-600" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Absent Date</p>
                  <p className="text-sm text-gray-600">{formatDate(absentDate)}</p>
                </div>
              </div>
            </div>

            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <label
                  htmlFor="leave_type_id"
                  className="block text-sm font-medium text-gray-700"
                >
                  Leave Type *
                </label>
              </div>
              <select
                id="leave_type_id"
                value={formData.leave_type_id}
                onChange={(e) =>
                  setFormData({ ...formData, leave_type_id: e.target.value })
                }
                required
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              >
                <option value="">Select leave type</option>
                {filteredLeaveTypes.map((type) => {
                  return (
                    <option key={type.id} value={type.id}>
                      {type.name} 
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="mb-4">
              <label
                htmlFor="start_date"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Start Date *
              </label>
              <input
                type="date"
                id="start_date"
                value={formData.start_date}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    start_date: e.target.value,
                    end_date: e.target.value,
                  })
                }
                required
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              />
            </div>

            <div className="mb-4">
              <label
                htmlFor="end_date"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                End Date *
              </label>
              <input
                type="date"
                id="end_date"
                value={formData.end_date}
                onChange={(e) =>
                  setFormData({ ...formData, end_date: e.target.value })
                }
                min={formData.start_date}
                required
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              />
            </div>

            <div className="mb-4">
              <div className="flex items-center gap-4">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.is_half_day_start}
                    // Checkbox is NO LONGER disabled so user can toggle it
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        is_half_day_start: e.target.checked,
                        half_day_period_start: e.target.checked
                          ? (isForcedHalfDay ? forcedPeriod : '1st half')
                          : null,
                      })
                    }
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                  />
                  <span className="ml-2 text-sm text-gray-700">
                    Half day on start date
                  </span>
                </label>

                {formData.is_half_day_start && (
                  <select
                    value={formData.half_day_period_start || ''}
                    disabled={isForcedHalfDay} // Keeps the dropdown locked to the forced period
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        half_day_period_start: e.target.value as
                          | '1st half'
                          | '2nd half',
                      })
                    }
                    className={`rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm ${isForcedHalfDay ? 'bg-gray-100 cursor-not-allowed text-gray-500' : ''}`}
                  >
                    <option value="1st half">1st Half</option>
                    <option value="2nd half">2nd Half</option>
                  </select>
                )}
              </div>
            </div>

            {formData.start_date !== formData.end_date && (
              <div className="mb-4">
                <div className="flex items-center gap-4">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.is_half_day_end}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          is_half_day_end: e.target.checked,
                          half_day_period_end: e.target.checked
                            ? '1st half'
                            : null,
                        })
                      }
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                    />
                    <span className="ml-2 text-sm text-gray-700">
                      Half day on end date
                    </span>
                  </label>

                  {formData.is_half_day_end && (
                    <select
                      value={formData.half_day_period_end || ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          half_day_period_end: e.target.value as
                            | '1st half'
                            | '2nd half',
                        })
                      }
                      className="rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    >
                      <option value="1st half">1st Half</option>
                      <option value="2nd half">2nd Half</option>
                    </select>
                  )}
                </div>
              </div>
            )}

            <div className="mb-4">
              <label
                htmlFor="reason"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Reason *
              </label>
              <textarea
                id="reason"
                value={formData.reason}
                onChange={(e) =>
                  setFormData({ ...formData, reason: e.target.value })
                }
                rows={3}
                required
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                placeholder="Enter reason for leave"
              />
            </div>

            <div className="mb-6">
              <label
                htmlFor="document_url"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Supporting Document URL (Optional)
              </label>
              <div className="flex items-center gap-2">
                <Upload className="h-5 w-5 text-gray-400" />
                <input
                  type="url"
                  id="document_url"
                  value={formData.document_url}
                  onChange={(e) =>
                    setFormData({ ...formData, document_url: e.target.value })
                  }
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  placeholder="https://..."
                />
              </div>
            </div>

            <div className="flex justify-end gap-3">
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
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Submitting...' : 'Submit Leave Request'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}