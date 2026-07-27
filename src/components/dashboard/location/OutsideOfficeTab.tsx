import { useEffect, useState, useMemo } from 'react';
import {
  CheckCircle, XCircle, Clock, MapPin, User, Calendar, Loader2, X,
  FileText, CheckCircle2, AlertCircle, Building2, BadgeCheck, Ban, Search, Navigation
} from 'lucide-react';
import { useOutsideOfficeApprovalsStore, type OutsideOfficeApproval } from '../../../stores/outsideOfficeApprovalsStore';
import { useTenant } from '../../../contexts/TenantContext';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import OutsideOfficeApprovalModal from './OutsideOfficeApprovalModal';
import TravelRouteViewer from './TravelRouteViewer';

type TabType = 'pending' | 'approved' | 'rejected';

function StatusBadge({ status }: { status: OutsideOfficeApproval['status'] }) {
  if (status === 'approved') return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-50 border border-green-200 text-green-700 rounded-full text-xs font-semibold">
      <BadgeCheck className="h-3 w-3" /> Approved
    </span>
  );
  if (status === 'rejected') return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-50 border border-red-200 text-red-700 rounded-full text-xs font-semibold">
      <Ban className="h-3 w-3" /> Rejected
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 border border-amber-200 text-amber-700 rounded-full text-xs font-semibold">
      <Clock className="h-3 w-3 animate-pulse" /> Pending
    </span>
  );
}

export default function OutsideOfficeTab() {
  const { currentTenant } = useTenant();
  const { user } = useAuth();
  const { items, loading, fetchAll, approve, reject } = useOutsideOfficeApprovalsStore();

  const [activeTab, setActiveTab] = useState<TabType>('pending');
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [viewingRoute, setViewingRoute] = useState<OutsideOfficeApproval | null>(null);

  // Reject modal state
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<OutsideOfficeApproval | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Approve modal state
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [approvalTarget, setApprovalTarget] = useState<OutsideOfficeApproval | null>(null);

  useEffect(() => {
    if (currentTenant?.id) {
      fetchAll(currentTenant.id);
    }
  }, [currentTenant?.id, fetchAll]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items
      .filter(item => item.status === activeTab)
      .filter(item =>
        !q ||
        item.employee_name?.toLowerCase().includes(q) ||
        item.employee_code?.toLowerCase().includes(q) ||
        item.department_name?.toLowerCase().includes(q) ||
        item.attendance_location?.toLowerCase().includes(q)
      );
  }, [items, activeTab, search]);

  const counts = useMemo(() => ({
    pending: items.filter(i => i.status === 'pending').length,
    approved: items.filter(i => i.status === 'approved').length,
    rejected: items.filter(i => i.status === 'rejected').length,
  }), [items]);

  const handleOpenApprove = (item: OutsideOfficeApproval) => {
    setApprovalTarget(item);
    setShowApprovalModal(true);
  };

  const handleApprove = async (id: string, distanceMeters: number, allowanceAmount: number, allowanceUnit: string) => {
    if (!user?.id) return;
    setSubmitting(id);
    try {
      await approve(id, user.id, distanceMeters, allowanceAmount, allowanceUnit);
      toast.success(`Outside office request approved successfully with travel allowance.`);
      setShowApprovalModal(false);
      setApprovalTarget(null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to approve');
      throw err;
    } finally {
      setSubmitting(null);
    }
  };

  const handleOpenReject = (item: OutsideOfficeApproval) => {
    setRejectTarget(item);
    setRejectReason('');
    setShowRejectModal(true);
  };

  const handleReject = async () => {
    if (!rejectTarget || !user?.id) return;
    setSubmitting(rejectTarget.id);
    try {
      await reject(rejectTarget.id, user.id, rejectReason.trim() || undefined);
      toast.success(`Rejected ${rejectTarget.employee_name}'s outside office request.`);
      setShowRejectModal(false);
      setRejectTarget(null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to reject');
    } finally {
      setSubmitting(null);
    }
  };

  const tabs: { key: TabType; label: string; color: string }[] = [
    { key: 'pending', label: 'Pending', color: 'amber' },
    { key: 'approved', label: 'Approved', color: 'green' },
    { key: 'rejected', label: 'Rejected', color: 'red' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Outside Office Clock-In Approvals</h1>
          <p className="text-sm text-gray-500 mt-0.5">Review and approve travel slips for employees who clocked in outside the office</p>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${activeTab === tab.key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}
          >
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${activeTab === tab.key ? 'bg-gray-100 text-gray-700' : 'bg-gray-200 text-gray-500'
              }`}>{counts[tab.key]}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, code, department..."
          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
        />
      </div>

      {/* Content */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 px-6">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="h-8 w-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">No {activeTab} requests</h3>
            <p className="text-gray-500 text-sm">Outside office approval requests with status "{activeTab}" will appear here.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filtered.map(item => (
              <div key={item.id} className="p-5 hover:bg-gray-50/50 transition-colors">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                  {/* Employee Info */}
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    <div className="flex-shrink-0 h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 font-bold text-sm">
                      {item.employee_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'EE'}
                    </div>
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-3 flex-wrap">
                        <h3 className="text-sm font-bold text-gray-900">{item.employee_name || 'Unknown'}</h3>
                        {item.employee_code && (
                          <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded font-mono">{item.employee_code}</span>
                        )}
                        {item.department_name && (
                          <span className="inline-flex items-center gap-1 text-xs text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">
                            <Building2 className="h-3 w-3" />
                            {item.department_name}
                          </span>
                        )}
                        <StatusBadge status={item.status} />
                      </div>

                      {/* Time Details */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
                        <div className="flex items-center gap-1.5 text-gray-600">
                          <Calendar className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                          <span className="font-medium">Date:</span>
                          <span>{format(new Date(item.clock_in_time), 'dd MMM yyyy')}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-gray-600">
                          <Clock className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                          <span className="font-medium">Clock-In:</span>
                          <span>{format(new Date(item.clock_in_time), 'hh:mm a')}</span>
                        </div>
                        {item.clock_out_time && !item.inside_office_clock_in_time && (
                          <div className="flex items-center gap-1.5 text-gray-600">
                            <Clock className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />
                            <span className="font-medium">Clock-Out:</span>
                            <span>{format(new Date(item.clock_out_time), 'hh:mm a')}</span>
                          </div>
                        )}
                        {item.inside_office_clock_in_time && (
                          <div className="flex items-center gap-1.5 text-gray-600">
                            <CheckCircle className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                            <span className="font-medium">In-Office Return:</span>
                            <span>{format(new Date(item.inside_office_clock_in_time), 'hh:mm a')}</span>
                          </div>
                        )}

                      </div>

                      {/* Reason */}
                      {item.reason ? (
                        <div className="flex items-start gap-2 p-3 bg-blue-50/60 border border-blue-100 rounded-lg">
                          <FileText className="h-3.5 w-3.5 text-blue-500 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-xs font-semibold text-blue-800 mb-0.5">Employee's Reason:</p>
                            <p className="text-xs text-blue-700 leading-relaxed">{item.reason}</p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 p-2.5 bg-amber-50 border border-amber-100 rounded-lg">
                          <AlertCircle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                          <p className="text-xs text-amber-700 font-medium">Awaiting reason from employee</p>
                        </div>
                      )}

                      {/* Display Allowance if approved */}
                      {item.status === 'approved' && (item.travel_allowance_amount != null || item.distance_meters != null) && (
                        <div className="flex items-center gap-4 mt-2">
                          {item.distance_meters != null && (
                            <div className="flex items-center gap-1.5 text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-full text-xs font-semibold">
                              <MapPin className="h-3 w-3" />
                              {(item.distance_meters / 1000).toFixed(2)} km Traveled
                            </div>
                          )}
                          {item.travel_allowance_amount != null && item.travel_allowance_amount > 0 && (
                            <div className="flex items-center gap-1.5 text-green-700 bg-green-50 px-2.5 py-1 rounded-full text-xs font-semibold">
                              <CheckCircle className="h-3 w-3" />
                              ₹{item.travel_allowance_amount.toFixed(2)} Allowance
                            </div>
                          )}
                        </div>
                      )}

                      {/* Reject reason if rejected */}
                      {item.status === 'rejected' && item.reject_reason && (
                        <div className="flex items-start gap-2 p-2.5 bg-red-50 border border-red-100 rounded-lg">
                          <XCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-xs font-semibold text-red-800 mb-0.5">Rejection Reason:</p>
                            <p className="text-xs text-red-700">{item.reject_reason}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2 mt-4 shrink-0 lg:mt-0 lg:self-start lg:pt-2">
                    <button
                      onClick={() => setViewingRoute(item)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-lg transition-colors"
                    >
                      <Navigation className="h-3.5 w-3.5" />
                      View Route
                    </button>
                    {activeTab === 'pending' && (
                      <>
                        <button
                          onClick={() => handleOpenApprove(item)}
                          disabled={submitting === item.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
                        >
                          {submitting === item.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <CheckCircle className="h-3.5 w-3.5" />
                          )}
                          Review & Approve
                        </button>
                        <button
                          onClick={() => handleOpenReject(item)}
                          disabled={submitting === item.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reject Modal */}
      {showRejectModal && rejectTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-xl">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900">Reject Request</h2>
              <button onClick={() => setShowRejectModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600">
                Rejecting <span className="font-semibold text-gray-900">{rejectTarget.employee_name}</span>'s outside office request for{' '}
                <span className="font-semibold">{format(new Date(rejectTarget.clock_in_time), 'dd MMM yyyy')}</span>.
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Reason for Rejection <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  rows={3}
                  placeholder="e.g. Invalid reason provided, prior approval required..."
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-400 focus:border-red-400 resize-none"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowRejectModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReject}
                  disabled={!!submitting}
                  className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                  Confirm Reject
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Approval & Allowance Modal */}
      {showApprovalModal && approvalTarget && (
        <OutsideOfficeApprovalModal
          item={approvalTarget}
          onClose={() => {
            setShowApprovalModal(false);
            setApprovalTarget(null);
          }}
          onApprove={handleApprove}
        />
      )}

      {/* Travel Route Viewer Modal */}
      {viewingRoute && (
        <TravelRouteViewer
          timestampId={viewingRoute.timestamp_id}
          employeeName={viewingRoute.employee_name || 'Employee'}
          clockInTime={viewingRoute.clock_in_time}
          clockOutTime={viewingRoute.inside_office_clock_in_time || viewingRoute.clock_out_time || undefined}
          totalDistanceMeters={viewingRoute.distance_meters || 0}
          onClose={() => setViewingRoute(null)}
          clockOutLabel={viewingRoute.inside_office_clock_in_time ? 'Clock In (Office)' : 'Clock Out'}
        />
      )}
    </div>
  );
}
