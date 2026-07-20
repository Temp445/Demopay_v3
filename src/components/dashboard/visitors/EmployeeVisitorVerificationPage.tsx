import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Clock, User, Mail, Phone, FileText, AlertCircle } from 'lucide-react';
import { useVisitorStore } from '../../../stores/visitorStore';
import { useEmployeesStore } from '../../../stores/employeesStore';
import { useTenant } from '../../../contexts/TenantContext';
import { supabase } from '../../../lib/supabase';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import type { VisitorWithDetails } from '../../../types/visitor';

export default function EmployeeVisitorVerificationPage() {
  const { currentTenant  } = useTenant();
  const { visitors, loading, fetchVisitors, approveOrRejectVisitor } = useVisitorStore();
  const { employees } = useEmployeesStore();

  const [currentEmployeeId, setCurrentEmployeeId] = useState<string | null>(null);
  const [selectedVisitor, setSelectedVisitor] = useState<VisitorWithDetails | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [actionType, setActionType] = useState<'approved' | 'rejected' | null>(null);

  useEffect(() => {
    const fetchCurrentEmployee = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const employee = employees.find((emp) => emp.email === user.email);
        if (employee) {
          setCurrentEmployeeId(employee.id);
        }
      }
    };

    fetchCurrentEmployee();
  }, [employees]);

  useEffect(() => {
    if (currentTenant ) {
      fetchVisitors(currentTenant .id);
    }
  }, [currentTenant , fetchVisitors]);

  const pendingVisitors = visitors.filter(
    (v) => v.visitor_status === 'verification_pending' && v.employee_to_visit === currentEmployeeId
  );

  const handleApproval = async (visitor: VisitorWithDetails, action: 'approved' | 'rejected') => {
    setSelectedVisitor(visitor);
    setActionType(action);
  };

  const confirmAction = async () => {
    if (!selectedVisitor || !actionType || !currentEmployeeId || !currentTenant ) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('User not authenticated');
        return;
      }

      await approveOrRejectVisitor(
        currentTenant .id,
        currentEmployeeId,
        {
          visitor_id: selectedVisitor.id,
          action: actionType,
          reason: actionReason || undefined,
        },
        user.id
      );

      toast.success(`Visitor ${actionType === 'approved' ? 'approved' : 'rejected'} successfully`);
      setSelectedVisitor(null);
      setActionType(null);
      setActionReason('');
      fetchVisitors(currentTenant .id);
    } catch (error) {
      toast.error(`Failed to ${actionType} visitor`);
    }
  };

  const getVisitorImage = (visitor: VisitorWithDetails) => {
    if (visitor.visitor_image) {
      return visitor.visitor_image;
    }
    if (visitor.visitor_image_data) {
      try {
        const blob = new Blob([visitor.visitor_image_data as any], { type: 'image/jpeg' });
        return URL.createObjectURL(blob);
      } catch (error) {
        return null;
      }
    }
    return null;
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Clock className="h-6 w-6" />
          Visitor Verification
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          Review and approve visitors requesting to meet with you
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : pendingVisitors.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">All caught up!</h3>
          <p className="text-gray-500">
            You have no pending visitor approval requests
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {pendingVisitors.map((visitor) => {
            const imageUrl = getVisitorImage(visitor);

            return (
              <div
                key={visitor.id}
                className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
              >
                <div className="p-6">
                  <div className="flex gap-6">
                    <div className="flex-shrink-0">
                      <div className="w-32 h-32 bg-gray-100 rounded-lg overflow-hidden">
                        {imageUrl ? (
                          <img
                            src={imageUrl}
                            alt="Visitor"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <User className="h-16 w-16 text-gray-400" />
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex-1">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900 mb-1">
                            {visitor.visitor_name || 'Unknown Visitor'}
                          </h3>
                          <div className="flex items-center gap-1 text-sm text-yellow-700">
                            <Clock className="h-4 w-4" />
                            Pending Approval
                          </div>
                        </div>
                        <div className="text-right text-sm text-gray-500">
                          <div>Detected {format(new Date(visitor.first_detected_at), 'PPp')}</div>
                          <div className="font-medium text-gray-700 mt-1">
                            {visitor.visit_count} {visitor.visit_count === 1 ? 'visit' : 'visits'}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        {visitor.email && (
                          <div className="flex items-center gap-2 text-sm">
                            <Mail className="h-4 w-4 text-gray-400" />
                            <span className="text-gray-700">{visitor.email}</span>
                          </div>
                        )}
                        {visitor.phone_number && (
                          <div className="flex items-center gap-2 text-sm">
                            <Phone className="h-4 w-4 text-gray-400" />
                            <span className="text-gray-700">{visitor.phone_number}</span>
                          </div>
                        )}
                      </div>

                      {visitor.reason_for_visit && (
                        <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-start gap-2 text-sm">
                            <FileText className="h-4 w-4 text-gray-400 mt-0.5" />
                            <div>
                              <div className="font-medium text-gray-700 mb-1">Reason for Visit</div>
                              <div className="text-gray-600">{visitor.reason_for_visit}</div>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="flex gap-3">
                        <button
                          onClick={() => handleApproval(visitor, 'approved')}
                          className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                        >
                          <CheckCircle className="h-4 w-4" />
                          Approve
                        </button>
                        <button
                          onClick={() => handleApproval(visitor, 'rejected')}
                          className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
                        >
                          <XCircle className="h-4 w-4" />
                          Reject
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedVisitor && actionType && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              {actionType === 'approved' ? (
                <CheckCircle className="h-8 w-8 text-green-600" />
              ) : (
                <XCircle className="h-8 w-8 text-red-600" />
              )}
              <h2 className="text-xl font-bold text-gray-900">
                {actionType === 'approved' ? 'Approve' : 'Reject'} Visitor
              </h2>
            </div>

            <p className="text-gray-600 mb-4">
              Are you sure you want to {actionType === 'approved' ? 'approve' : 'reject'}{' '}
              <span className="font-medium">{selectedVisitor.visitor_name}</span>?
            </p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {actionType === 'approved' ? 'Add a note (optional)' : 'Reason for rejection (optional)'}
              </label>
              <textarea
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                rows={3}
                placeholder={`Enter ${actionType === 'approved' ? 'note' : 'reason'}...`}
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setSelectedVisitor(null);
                  setActionType(null);
                  setActionReason('');
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmAction}
                disabled={loading}
                className={`flex-1 px-4 py-2 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  actionType === 'approved'
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
