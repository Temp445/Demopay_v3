import { useState } from 'react';
import { MapPin, Clock, FileText, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { useOutsideOfficeApprovalsStore } from '../../../stores/outsideOfficeApprovalsStore';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

interface OutsideOfficeReasonModalProps {
  approvalId: string;
  employeeName: string;
  clockInTime: string;
  attendanceLocation?: string | null;
  onSubmitted: () => void;
}

export default function OutsideOfficeReasonModal({
  approvalId,
  employeeName,
  clockInTime,
  attendanceLocation,
  onSubmitted,
}: OutsideOfficeReasonModalProps) {
  const { submitReason } = useOutsideOfficeApprovalsStore();
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!reason.trim()) {
      toast.error('Please enter a reason for working outside the office.');
      return;
    }
    setSubmitting(true);
    try {
      await submitReason(approvalId, reason.trim());
      toast.success('Reason submitted. Your request is pending admin approval.');
      onSubmitted();
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit reason. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-xl">
              <AlertCircle className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-amber-900">Outside Office Clock-In</h2>
              <p className="text-xs text-amber-700 mt-0.5">A reason is required to submit your request</p>
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="px-6 py-4 space-y-3 border-b border-gray-100">
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-gray-400 flex-shrink-0" />
            <span className="text-gray-600">Clock-In:</span>
            <span className="font-semibold text-gray-900">
              {format(new Date(clockInTime), 'dd MMM yyyy, hh:mm a')}
            </span>
          </div>
          {attendanceLocation && (
            <div className="flex items-start gap-2 text-sm">
              <MapPin className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
              <span className="text-gray-600">Location:</span>
              <span className="font-medium text-gray-800 text-xs leading-relaxed">{attendanceLocation}</span>
            </div>
          )}
        </div>

        {/* Reason Input */}
        <div className="px-6 py-5 space-y-3">
          <label className="block">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="h-4 w-4 text-gray-500" />
              <span className="text-sm font-semibold text-gray-800">
                Reason for Working Outside the Office
                <span className="text-red-500 ml-1">*</span>
              </span>
            </div>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Client visit at ABC Company, field inspection, site survey..."
              rows={4}
              className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-amber-400 focus:border-amber-400 resize-none transition-colors"
              autoFocus
            />
            <p className="text-xs text-gray-400 mt-1">{reason.length}/500 characters</p>
          </label>

          <button
            onClick={handleSubmit}
            disabled={submitting || !reason.trim()}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors shadow-sm"
          >
            {submitting ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Submitting...</>
            ) : (
              <><CheckCircle className="h-4 w-4" /> Submit Request</>
            )}
          </button>

          <p className="text-xs text-center text-gray-400">
            This request will be reviewed by your administrator.
          </p>
        </div>
      </div>
    </div>
  );
}
