import React, { useState, useEffect } from 'react';
import { 
  X, Calendar, DollarSign, User, FileText, CheckCircle, 
  Clock, Ban, Edit, Pause, XCircle, RefreshCw, Play 
} from 'lucide-react';
import { useAdvancesStore } from '../../../stores/advancesStore';
import AdvanceApprovalModal from './AdvanceApprovalModal';
import DeductionHoldModal from './DeductionHoldModal';
import ShortClosureModal from './ShortClosureModal';
import InstallmentChangeModal from './InstallmentChangeModal';
import toast from 'react-hot-toast';
import type { EmployeeAdvance } from '../../../types/advances';

interface AdvanceDetailsModalProps {
  advance: EmployeeAdvance;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

export default function AdvanceDetailsModal({
  advance,
  isOpen,
  onClose,
  onUpdate,
}: AdvanceDetailsModalProps) {
  // Added deleteDeductionHold to destructuring
  const { 
    installments, 
    holds, 
    fetchInstallments, 
    fetchHolds, 
    cancelAdvanceRequest, 
    deleteDeductionHold, // Ensure this exists in your store
    loading 
  } = useAdvancesStore();

  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [showHoldModal, setShowHoldModal] = useState(false);
  const [showClosureModal, setShowClosureModal] = useState(false);
  const [showInstallmentChangeModal, setShowInstallmentChangeModal] = useState(false);

  useEffect(() => {
    if (isOpen && advance) {
      fetchInstallments(advance.id);
      fetchHolds(advance.id);
    }
  }, [isOpen, advance, fetchInstallments, fetchHolds]);

  const handleCancel = async () => {
    if (!confirm('Are you sure you want to cancel this advance request?')) {
      return;
    }

    try {
      await cancelAdvanceRequest(advance.id);
      toast.success('Advance request cancelled successfully');
      onUpdate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to cancel request');
    }
  };

  const handleUnhold = async (holdId: string, holdMonth: string) => {
    const dateStr = new Date(holdMonth + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
    
    if (!confirm(`Are you sure you want to remove the hold for ${dateStr}? The installment will be deducted as scheduled.`)) {
      return;
    }

    try {
      // Assuming deleteDeductionHold takes the hold ID
      await deleteDeductionHold(holdId);
      toast.success('Deduction hold removed successfully');
      // Refresh data
      fetchHolds(advance.id);
      fetchInstallments(advance.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to remove hold');
    }
  };

  // Helper to check if a month is current or future
  const canUnhold = (holdMonth: string) => {
    const today = new Date();
    // Set to first day of current month to compare strictly by month
    const currentMonthDate = new Date(today.getFullYear(), today.getMonth(), 1);
    const holdDate = new Date(holdMonth + '-01');
    
    // Allow unhold if the hold month is greater than or equal to current month
    return holdDate >= currentMonthDate;
  };

  const getStatusColor = (status: string) => {
    const colors = {
      pending: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-blue-100 text-blue-800',
      rejected: 'bg-red-100 text-red-800',
      active: 'bg-green-100 text-green-800',
      completed: 'bg-gray-100 text-gray-800',
      cancelled: 'bg-gray-100 text-gray-800',
      closed: 'bg-purple-100 text-purple-800',
    };
    return colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  const getInstallmentStatusColor = (status: string) => {
    const colors = {
      scheduled: 'text-yellow-600',
      deducted: 'text-green-600',
      held: 'text-orange-600',
      waived: 'text-gray-600',
    };
    return colors[status as keyof typeof colors] || 'text-gray-600';
  };

  if (!isOpen) return null;

  const canApprove = advance.status === 'pending';
  const canHold = advance.status === 'approved' || advance.status === 'active';
  const canClose = advance.status === 'approved' || advance.status === 'active';
  const canCancel = advance.status === 'pending';
  const canModifyInstallments = advance.status === 'approved' || advance.status === 'active';

  return (
    <>
      <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
        <div className="relative bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
            <div className="flex items-center space-x-3">
              <h3 className="text-lg font-medium text-gray-900">Advance Details</h3>
              <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(advance.status)}`}>
                {advance.status.charAt(0).toUpperCase() + advance.status.slice(1)}
              </span>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500 focus:outline-none"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <div className="px-6 py-4 space-y-6">
            {/* Employee Information */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-900 mb-3 flex items-center">
                <User className="h-4 w-4 mr-2" />
                Employee Information
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500 block sm:inline">Name:</span>
                  <span className="sm:ml-2 font-medium text-gray-900 block sm:inline">{advance.employee?.name || 'Unknown'}</span>
                </div>
                <div>
                  <span className="text-gray-500 block sm:inline">Employee Code:</span>
                  <span className="sm:ml-2 font-medium text-gray-900 block sm:inline">
                    {advance.employee?.employee_code || advance.employee?.email}
                  </span>
                </div>
              </div>
            </div>

            {/* Request Information */}
            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-3 flex items-center">
                <FileText className="h-4 w-4 mr-2" />
                Request Information
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500 block sm:inline">Request Date:</span>
                  <span className="sm:ml-2 font-medium text-gray-900 block sm:inline">
                    {new Date(advance.request_date).toLocaleDateString('en-GB')}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 block sm:inline">Requested By:</span>
                  <span className="sm:ml-2 font-medium text-gray-900 block sm:inline">
                    {advance.requestedByName || '-'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 block sm:inline">Requested Amount:</span>
                  <span className="sm:ml-2 font-medium text-gray-900 block sm:inline">
                    ₹{advance.requested_amount.toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 block sm:inline">Installments:</span>
                  <span className="sm:ml-2 font-medium text-gray-900 block sm:inline">
                    {advance.requested_installments} months
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 block sm:inline">Interest Rate:</span>
                  <span className="sm:ml-2 font-medium text-gray-900 block sm:inline">
                    {advance.requested_interest_rate}%
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 block sm:inline">Start Month:</span>
                  <span className="sm:ml-2 font-medium text-gray-900 block sm:inline">
                    {new Date(advance.requested_start_month + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}
                  </span>
                </div>
              </div>
              {advance.justification && (
                <div className="mt-3">
                  <span className="text-gray-500 text-sm">Justification:</span>
                  <p className="mt-1 text-sm text-gray-900 bg-white rounded border border-gray-200 p-3">
                    {advance.justification}
                  </p>
                </div>
              )}
            </div>

            {/* Approval Information */}
            {(advance.status === 'approved' || advance.status === 'active' || advance.status === 'completed' || advance.status === 'closed') && (
              <div className="bg-green-50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-green-900 mb-3 flex items-center">
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Approval Information
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-green-700 block sm:inline">Approved Amount:</span>
                    <span className="sm:ml-2 font-medium text-green-900 block sm:inline">
                      ₹{advance.approved_amount?.toLocaleString() || '0'}
                    </span>
                  </div>
                  <div>
                    <span className="text-green-700 block sm:inline">Approved Installments:</span>
                    <span className="sm:ml-2 font-medium text-green-900 block sm:inline">
                      {advance.approved_installments || 0} months
                    </span>
                  </div>
                  <div>
                    <span className="text-green-700 block sm:inline">Interest Rate:</span>
                    <span className="sm:ml-2 font-medium text-green-900 block sm:inline">
                      {advance.approved_interest_rate || 0}%
                    </span>
                  </div>
                  <div>
                    <span className="text-green-700 block sm:inline">Total Amount:</span>
                    <span className="sm:ml-2 font-medium text-green-900 block sm:inline">
                      ₹{advance.total_amount.toFixed(2)}
                    </span>
                  </div>
                  <div>
                    <span className="text-green-700 block sm:inline">Remaining Balance:</span>
                    <span className="sm:ml-2 font-medium text-green-900 block sm:inline">
                      ₹{advance.remaining_balance.toFixed(2)}
                    </span>
                  </div>
                  <div>
                    <span className="text-green-700 block sm:inline">Approved Date:</span>
                    <span className="sm:ml-2 font-medium text-green-900 block sm:inline">
                      {advance.approved_date ? new Date(advance.approved_date).toLocaleDateString('en-GB') : 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span className="text-green-700 block sm:inline">Approved By:</span>
                    <span className="sm:ml-2 font-medium text-green-900 block sm:inline">
                      {advance.approvedByName || '-'}
                    </span>
                  </div>
                </div>
                {advance.approval_comments && (
                  <div className="mt-3">
                    <span className="text-green-700 text-sm">Comments:</span>
                    <p className="mt-1 text-sm text-green-900 bg-white rounded border border-green-200 p-3">
                      {advance.approval_comments}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Rejection Information */}
            {advance.status === 'rejected' && (
              <div className="bg-red-50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-red-900 mb-3 flex items-center">
                  <XCircle className="h-4 w-4 mr-2" />
                  Rejection Information
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-red-700 block sm:inline">Rejected Date:</span>
                    <span className="sm:ml-2 font-medium text-red-900 block sm:inline">
                      {advance.approved_date ? new Date(advance.approved_date).toLocaleDateString('en-GB') : 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span className="text-red-700 block sm:inline">Rejected By:</span>
                    <span className="sm:ml-2 font-medium text-red-900 block sm:inline">
                      {advance.approvedByName || '-'}
                    </span>
                  </div>
                </div>
                {advance.approval_comments && (
                  <div className="mt-3">
                    <span className="text-red-700 text-sm">Reason:</span>
                    <p className="mt-1 text-sm text-red-900 bg-white rounded border border-red-200 p-3">
                      {advance.approval_comments}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Cancellation Information */}
            {advance.status === 'cancelled' && (
              <div className="bg-gray-100 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-900 mb-3 flex items-center">
                  <XCircle className="h-4 w-4 mr-2" />
                  Cancellation Information
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-700 block sm:inline">Cancelled Date:</span>
                    <span className="sm:ml-2 font-medium text-gray-900 block sm:inline">
                      {advance.updated_at ? new Date(advance.updated_at).toLocaleDateString('en-GB') : 'N/A'}
                    </span>
                  </div>
                  {/* <div>
                    <span className="text-gray-700 block sm:inline">Cancelled By:</span>
                    <span className="sm:ml-2 font-medium text-gray-900 block sm:inline">
                      {advance.approvedByName || '-'}
                    </span>
                  </div> */}
                </div>
                {advance.approval_comments && (
                  <div className="mt-3">
                    <span className="text-gray-700 text-sm">Reason:</span>
                    <p className="mt-1 text-sm text-gray-900 bg-white rounded border border-gray-300 p-3">
                      {advance.approval_comments}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Installment Schedule */}
            {installments.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-900 mb-3 flex items-center">
                  <Calendar className="h-4 w-4 mr-2" />
                  Installment Schedule
                </h4>
                {/* Desktop Table View */}
                <div className="hidden sm:block border border-gray-200 rounded-lg overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          #
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Due Month
                        </th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                          Amount
                        </th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                          Principal
                        </th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                          Interest
                        </th>
                        <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {installments.map((installment) => (
                        <tr key={installment.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2 text-sm text-gray-900">
                            {installment.installment_number}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-900">
                            {new Date(installment.due_month + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'short' })}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-900 text-right">
                            ₹{installment.amount.toFixed(2)}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-500 text-right">
                            ₹{installment.principal_amount.toFixed(2)}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-500 text-right">
                            ₹{installment.interest_amount.toFixed(2)}
                          </td>
                          <td className="px-4 py-2 text-center">
                            <span className={`text-xs font-medium ${getInstallmentStatusColor(installment.status)}`}>
                              {installment.status.charAt(0).toUpperCase() + installment.status.slice(1)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Card View */}
                <div className="block sm:hidden space-y-3">
                  {installments.map((installment) => (
                    <div key={installment.id} className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
                      <div className="flex justify-between items-center mb-2 border-b border-gray-100 pb-2">
                        <div className="flex items-center">
                          <span className="bg-gray-100 text-gray-700 text-xs font-bold px-2 py-1 rounded mr-2">
                            #{installment.installment_number}
                          </span>
                          <span className="text-sm font-medium text-gray-900">
                            {new Date(installment.due_month + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'short' })}
                          </span>
                        </div>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${getInstallmentStatusColor(installment.status)} bg-opacity-10`}>
                          {installment.status.charAt(0).toUpperCase() + installment.status.slice(1)}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-2 text-sm">
                        <div>
                          <span className="text-gray-500 text-xs block">Amount</span>
                          <span className="font-medium text-gray-900">₹{installment.amount.toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="text-gray-500 text-xs block">Principal</span>
                          <span className="text-gray-900">₹{installment.principal_amount.toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="text-gray-500 text-xs block">Interest</span>
                          <span className="text-gray-900">₹{installment.interest_amount.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Active Holds with UNHOLD Option */}
            {holds.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-900 mb-3 flex items-center">
                  <Pause className="h-4 w-4 mr-2" />
                  Active Holds
                </h4>
                <div className="space-y-2">
                  {holds.map((hold) => {
                    const isUnholdable = canUnhold(hold.hold_month);
                    
                    return (
                      <div key={hold.id} className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center">
                                <span className="text-sm font-medium text-orange-900">
                                {new Date(hold.hold_month + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}
                                </span>
                                {!isUnholdable && (
                                <span className="ml-2 text-xs text-gray-500 bg-white px-2 py-0.5 rounded border border-gray-200">
                                    Past Hold
                                </span>
                                )}
                            </div>
                            <p className="text-xs text-orange-700 mt-1">{hold.reason}</p>
                            <span className="text-xs text-orange-600 block mt-1">
                              Created: {new Date(hold.created_at).toLocaleDateString('en-GB')}
                            </span>
                          </div>
                          
                          {/* Unhold Button */}
                          {isUnholdable && (
                            <button
                              onClick={() => handleUnhold(hold.id, hold.hold_month)}
                              disabled={loading}
                              className="ml-4 inline-flex items-center px-3 py-1.5 border border-orange-300 shadow-sm text-xs font-medium rounded text-orange-700 bg-white hover:bg-orange-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:opacity-50"
                              title="Resume deduction (Remove Hold)"
                            >
                              <Play className="h-3 w-3 mr-1.5 fill-current" />
                              Unhold
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="border-t border-gray-200 pt-4 flex flex-col sm:flex-row gap-3 sm:justify-between">
              <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                {canApprove && (
                  <button
                    onClick={() => setShowApprovalModal(true)}
                    className="flex-1 sm:flex-none justify-center inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Review & Approve
                  </button>
                )}
                {canModifyInstallments && (
                  <button
                    onClick={() => setShowInstallmentChangeModal(true)}
                    className="flex-1 sm:flex-none justify-center inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Modify Installments
                  </button>
                )}
                {canHold && (
                  <button
                    onClick={() => setShowHoldModal(true)}
                    className="flex-1 sm:flex-none justify-center inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    <Pause className="h-4 w-4 mr-2" />
                    Hold Deduction
                  </button>
                )}
                {canClose && (
                  <button
                    onClick={() => setShowClosureModal(true)}
                    className="flex-1 sm:flex-none justify-center inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    <Ban className="h-4 w-4 mr-2" />
                    Short Closure
                  </button>
                )}
              </div>
              <button
                onClick={onClose}
                className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Sub-modals */}
      {showApprovalModal && (
        <AdvanceApprovalModal
          advance={advance}
          isOpen={showApprovalModal}
          onClose={() => setShowApprovalModal(false)}
          onSuccess={() => {
            setShowApprovalModal(false);
            onUpdate();
          }}
        />
      )}

      {showHoldModal && (
        <DeductionHoldModal
          advance={advance}
          isOpen={showHoldModal}
          onClose={() => setShowHoldModal(false)}
          onSuccess={() => {
            setShowHoldModal(false);
            fetchHolds(advance.id);
            fetchInstallments(advance.id); // Refresh installments to show correct status
          }}
        />
      )}

      {showClosureModal && (
        <ShortClosureModal
          advance={advance}
          isOpen={showClosureModal}
          onClose={() => setShowClosureModal(false)}
          onSuccess={() => {
            setShowClosureModal(false);
            onUpdate();
          }}
        />
      )}

      {showInstallmentChangeModal && (
        <InstallmentChangeModal
          advance={advance}
          isOpen={showInstallmentChangeModal}
          onClose={() => setShowInstallmentChangeModal(false)}
          onSuccess={() => {
            setShowInstallmentChangeModal(false);
            fetchInstallments(advance.id);
            onUpdate();
          }}
        />
      )}
    </>
  );
}