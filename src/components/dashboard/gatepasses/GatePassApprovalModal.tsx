import React, { useState } from 'react';
import { X, CheckCircle, XCircle, Calendar, Clock, AlertCircle, Info } from 'lucide-react';
import { useGatePassesStore } from '../../../stores/gatePassesStore';
import toast from 'react-hot-toast';
import type { GatePassRequest, ApproveGatePassRequest, RejectGatePassRequest } from '../../../types/gatePasses';

interface GatePassApprovalModalProps {
  gatePass: GatePassRequest;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type ApprovalAction = 'approve' | 'reject';

interface FormErrors {
  approved_start_date?: string;
  approved_start_time?: string;
  approved_end_date?: string;
  approved_end_time?: string;
  rejection_reason?: string;
}

export default function GatePassApprovalModal({ gatePass, isOpen, onClose, onSuccess }: GatePassApprovalModalProps) {
  const { approveGatePass, rejectGatePass, loading } = useGatePassesStore();

  const [action, setAction] = useState<ApprovalAction>('approve');

  const [approvalData, setApprovalData] = useState<ApproveGatePassRequest>({
    approved_start_date: gatePass.start_date,
    approved_start_time: gatePass.start_time,
    approved_end_date: gatePass.end_date,
    approved_end_time: gatePass.end_time,
    comments: ''
  });

  const [rejectionReason, setRejectionReason] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});

  const hasModifications =
    approvalData.approved_start_date !== gatePass.start_date ||
    approvalData.approved_start_time !== gatePass.start_time ||
    approvalData.approved_end_date !== gatePass.end_date ||
    approvalData.approved_end_time !== gatePass.end_time;

  const validateApproval = (): boolean => {
    const newErrors: FormErrors = {};

    if (!approvalData.approved_start_date) {
      newErrors.approved_start_date = 'Start date is required';
    }

    if (!approvalData.approved_start_time) {
      newErrors.approved_start_time = 'Start time is required';
    }

    if (!approvalData.approved_end_date) {
      newErrors.approved_end_date = 'End date is required';
    }

    if (!approvalData.approved_end_time) {
      newErrors.approved_end_time = 'End time is required';
    }

    if (approvalData.approved_start_date && approvalData.approved_end_date) {
      if (new Date(approvalData.approved_end_date) < new Date(approvalData.approved_start_date)) {
        newErrors.approved_end_date = 'End date cannot be before start date';
      }
    }

    if (
      approvalData.approved_start_date &&
      approvalData.approved_end_date &&
      approvalData.approved_start_time &&
      approvalData.approved_end_time &&
      approvalData.approved_start_date === approvalData.approved_end_date
    ) {
      const startDateTime = new Date(`${approvalData.approved_start_date}T${approvalData.approved_start_time}`);
      const endDateTime = new Date(`${approvalData.approved_end_date}T${approvalData.approved_end_time}`);

      if (endDateTime <= startDateTime) {
        newErrors.approved_end_time = 'End time must be after start time';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateRejection = (): boolean => {
    const newErrors: FormErrors = {};

    if (!rejectionReason.trim()) {
      newErrors.rejection_reason = 'Rejection reason is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleApprove = async () => {
    if (!validateApproval()) {
      return;
    }

    try {
      await approveGatePass(gatePass.id, approvalData);
      toast.success('Gate pass approved successfully');
      onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to approve gate pass');
    }
  };

  const handleReject = async () => {
    if (!validateRejection()) {
      return;
    }

    try {
      await rejectGatePass(gatePass.id, { rejection_reason: rejectionReason });
      toast.success('Gate pass rejected');
      onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to reject gate pass');
    }
  };

  const handleChange = (field: keyof ApproveGatePassRequest, value: string) => {
    setApprovalData(prev => ({ ...prev, [field]: value }));
    if (errors[field as keyof FormErrors]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4 z-[60]">
      <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Approve or Reject Gate Pass</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-500">
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-900 mb-3">Request Summary</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-gray-500">Employee</p>
                <p className="font-medium text-gray-900">{gatePass.employee?.name}</p>
              </div>
              <div>
                <p className="text-gray-500">Employee Code</p>
                <p className="font-medium text-gray-900">{gatePass.employee?.employee_code}</p>
              </div>
              <div>
                <p className="text-gray-500">Requested Start</p>
                <p className="font-medium text-gray-900">
                  {gatePass.start_date} {gatePass.start_time}
                </p>
              </div>
              <div>
                <p className="text-gray-500">Requested End</p>
                <p className="font-medium text-gray-900">
                  {gatePass.end_date} {gatePass.end_time}
                </p>
              </div>
              <div className="md:col-span-2">
                <p className="text-gray-500">Reason</p>
                <p className="font-medium text-gray-900">{gatePass.reason}</p>
              </div>
            </div>
          </div>

          <div className="flex gap-4 border-b border-gray-200">
            <button
              onClick={() => setAction('approve')}
              className={`pb-3 px-4 text-sm font-medium border-b-2 transition-colors ${
                action === 'approve'
                  ? 'border-green-500 text-green-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <CheckCircle className="h-4 w-4 inline-block mr-2" />
              Approve
            </button>
            <button
              onClick={() => setAction('reject')}
              className={`pb-3 px-4 text-sm font-medium border-b-2 transition-colors ${
                action === 'reject'
                  ? 'border-red-500 text-red-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <XCircle className="h-4 w-4 inline-block mr-2" />
              Reject
            </button>
          </div>

          {action === 'approve' ? (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                <div className="flex">
                  <Info className="h-5 w-5 text-blue-400 mr-2 flex-shrink-0" />
                  <div className="text-sm text-blue-800">
                    <p className="font-medium">You can modify the timing before approval</p>
                    <p className="mt-1">
                      Changes will be logged and visible in the gate pass history. The employee will receive
                      the approved timing.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    <Calendar className="h-4 w-4 inline-block mr-1" />
                    Approved Start Date
                  </label>
                  <input
                    type="date"
                    value={approvalData.approved_start_date}
                    onChange={(e) => handleChange('approved_start_date', e.target.value)}
                    className={`mt-1 block w-full rounded-md shadow-sm sm:text-sm ${
                      errors.approved_start_date
                        ? 'border-red-300 focus:ring-red-500 focus:border-red-500'
                        : 'border-gray-300 focus:ring-indigo-500 focus:border-indigo-500'
                    }`}
                  />
                  {errors.approved_start_date && (
                    <p className="mt-1 text-sm text-red-600 flex items-center">
                      <AlertCircle className="h-4 w-4 mr-1" />
                      {errors.approved_start_date}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    <Clock className="h-4 w-4 inline-block mr-1" />
                    Approved Start Time
                  </label>
                  <input
                    type="time"
                    value={approvalData.approved_start_time}
                    onChange={(e) => handleChange('approved_start_time', e.target.value)}
                    className={`mt-1 block w-full rounded-md shadow-sm sm:text-sm ${
                      errors.approved_start_time
                        ? 'border-red-300 focus:ring-red-500 focus:border-red-500'
                        : 'border-gray-300 focus:ring-indigo-500 focus:border-indigo-500'
                    }`}
                  />
                  {errors.approved_start_time && (
                    <p className="mt-1 text-sm text-red-600 flex items-center">
                      <AlertCircle className="h-4 w-4 mr-1" />
                      {errors.approved_start_time}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    <Calendar className="h-4 w-4 inline-block mr-1" />
                    Approved End Date
                  </label>
                  <input
                    type="date"
                    value={approvalData.approved_end_date}
                    onChange={(e) => handleChange('approved_end_date', e.target.value)}
                    min={approvalData.approved_start_date}
                    className={`mt-1 block w-full rounded-md shadow-sm sm:text-sm ${
                      errors.approved_end_date
                        ? 'border-red-300 focus:ring-red-500 focus:border-red-500'
                        : 'border-gray-300 focus:ring-indigo-500 focus:border-indigo-500'
                    }`}
                  />
                  {errors.approved_end_date && (
                    <p className="mt-1 text-sm text-red-600 flex items-center">
                      <AlertCircle className="h-4 w-4 mr-1" />
                      {errors.approved_end_date}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    <Clock className="h-4 w-4 inline-block mr-1" />
                    Approved End Time
                  </label>
                  <input
                    type="time"
                    value={approvalData.approved_end_time}
                    onChange={(e) => handleChange('approved_end_time', e.target.value)}
                    className={`mt-1 block w-full rounded-md shadow-sm sm:text-sm ${
                      errors.approved_end_time
                        ? 'border-red-300 focus:ring-red-500 focus:border-red-500'
                        : 'border-gray-300 focus:ring-indigo-500 focus:border-indigo-500'
                    }`}
                  />
                  {errors.approved_end_time && (
                    <p className="mt-1 text-sm text-red-600 flex items-center">
                      <AlertCircle className="h-4 w-4 mr-1" />
                      {errors.approved_end_time}
                    </p>
                  )}
                </div>
              </div>

              {hasModifications && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
                  <div className="flex">
                    <AlertCircle className="h-5 w-5 text-yellow-400 mr-2 flex-shrink-0" />
                    <div className="text-sm text-yellow-800">
                      <p className="font-medium">You have modified the requested timing</p>
                      <p className="mt-1">
                        The employee will receive the approved timing, not the originally requested timing.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Comments (Optional)
                </label>
                <textarea
                  value={approvalData.comments}
                  onChange={(e) => handleChange('comments', e.target.value)}
                  rows={3}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  placeholder="Add any comments about this approval..."
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-md p-4">
                <div className="flex">
                  <AlertCircle className="h-5 w-5 text-red-400 mr-2 flex-shrink-0" />
                  <div className="text-sm text-red-800">
                    <p className="font-medium">This action will reject the gate pass request</p>
                    <p className="mt-1">
                      The request will be marked as rejected and the employee will be notified.
                      The record will be retained for audit purposes.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Rejection Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => {
                    setRejectionReason(e.target.value);
                    if (errors.rejection_reason) {
                      setErrors(prev => ({ ...prev, rejection_reason: undefined }));
                    }
                  }}
                  rows={4}
                  className={`mt-1 block w-full rounded-md shadow-sm sm:text-sm ${
                    errors.rejection_reason
                      ? 'border-red-300 focus:ring-red-500 focus:border-red-500'
                      : 'border-gray-300 focus:ring-indigo-500 focus:border-indigo-500'
                  }`}
                  placeholder="Please provide a clear reason for rejection..."
                />
                {errors.rejection_reason && (
                  <p className="mt-1 text-sm text-red-600 flex items-center">
                    <AlertCircle className="h-4 w-4 mr-1" />
                    {errors.rejection_reason}
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Cancel
            </button>
            {action === 'approve' ? (
              <button
                onClick={handleApprove}
                disabled={loading}
                className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                {loading ? 'Approving...' : 'Approve Gate Pass'}
              </button>
            ) : (
              <button
                onClick={handleReject}
                disabled={loading}
                className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <XCircle className="h-4 w-4 mr-2" />
                {loading ? 'Rejecting...' : 'Reject Gate Pass'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
