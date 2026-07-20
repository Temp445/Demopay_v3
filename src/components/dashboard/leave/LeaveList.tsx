import React, { useEffect } from 'react';
// 1. Added RotateCcw (for Revoke/Undo) and Ban (for Cancel) to imports
import { Calendar, AlertCircle, Check, X, RotateCcw, Ban, Edit2 } from 'lucide-react';
import { useLeaveStore } from '../../../stores/leaveStore';
import { useAuth } from '../../../contexts/AuthContext';
import type { Employee } from '../../../stores/employeesStore';
import type { LeaveRequest } from '../../../stores/leaveStore';
import { processLeaveApproval, revokeLeaveApproval } from '../../../lib/leaveApprovalTracking';
import { getUserEmployeeData, UserRole } from '../../../lib/roleBasedAccess';
import { User, Users } from 'lucide-react';

type RequestTarget = 'own' | 'employee';

export interface LeaveListProps {
  employee?: Employee;
  filters: {
    start_date: string;
    end_date: string;
    status: string;
    type: string;
  };
  onRefresh: () => void;
  lastRefresh?: number;
  subordinateIds?: string[];
  isReportingHead?: boolean;
  onEdit?: (request: LeaveRequest) => void;
}

export default function LeaveList({
  employee,
  filters,
  onRefresh,
  lastRefresh,
  subordinateIds,
  isReportingHead,
  onEdit,
}: LeaveListProps) {
  const { user } = useAuth();
  const { leaveRequests, fetchLeaveRequests, updateLeaveRequestStatus } = useLeaveStore();
  const [userRole, setUserRole] = React.useState<UserRole | null>(null);
  const [currentEmployeeId, setCurrentEmployeeId] = React.useState<string | null>(null);
  const [requestTarget, setRequestTarget] = React.useState<RequestTarget>('employee');
  const requests = leaveRequests.items || [];
  const loading = leaveRequests.loading;
  const error = leaveRequests.error;

  useEffect(() => {
    if (user) {
      getUserEmployeeData(user.id).then(data => {
        setUserRole(data.role);
        setCurrentEmployeeId(data.employeeId);
      });
    }
  }, [user]);

  const isAdmin = userRole === 'Admin' || userRole === 'HR Team' || userRole === 'Reporting Head';
  const isStrictReportingHead = userRole === 'Reporting Head';

  useEffect(() => {
    if (!user) return;

    fetchLeaveRequests(
      employee?.id ?? '',
      filters.start_date || undefined,
      filters.end_date || undefined
    );
  }, [employee, lastRefresh, user, filters.start_date, filters.end_date, fetchLeaveRequests]);

  useEffect(() => {
    if (employee && currentEmployeeId) {
      if (employee.id === currentEmployeeId) {
        setRequestTarget('own');
      } else {
        setRequestTarget('employee');
      }
    }
  }, [employee, currentEmployeeId]);

  // 2. Updated type definition to include 'Pending' so we can revert status
  const handleStatusUpdate = async (
    requestId: string,
    newStatus: 'Approved' | 'Rejected' | 'Cancelled' | 'Pending',
    currentStatus?: string
  ) => {
    try {
      // Get the current request to check its status
      const currentRequest = requests.find(r => r.id === requestId);
      const previousStatus = currentRequest?.status;

      // Update the leave request status
      // @ts-ignore - Assuming store update function handles the string,
      // strict typing might need adjustment in the store definition
      await updateLeaveRequestStatus(requestId, newStatus);

      // Handle leave approval tracking
      if (newStatus === 'Approved' && previousStatus !== 'Approved') {
        // Create daily leave approval records when approving
        try {
          await processLeaveApproval(requestId);
        } catch (trackingError) {
          console.error('Failed to process leave approval tracking:', trackingError);
          // Continue despite tracking error - the leave is still approved
        }
      } else if (previousStatus === 'Approved' && newStatus !== 'Approved') {
        // Delete leave approval records when revoking approval
        try {
          await revokeLeaveApproval(requestId);
        } catch (trackingError) {
          console.error('Failed to revoke leave approval tracking:', trackingError);
          // Continue despite tracking error
        }
      }

      onRefresh();
    } catch (err) {
      console.error('Failed to update request status:', err);
    }
  };

  const filteredRequests = requests.filter((request) => {
    if (filters.status && request.status !== filters.status) return false;
    if (filters.type && request.leave_type_id !== filters.type) return false;
    if (
      filters.start_date &&
      new Date(request.start_date) < new Date(filters.start_date)
    )
      return false;
    if (
      filters.end_date &&
      new Date(request.end_date) > new Date(filters.end_date)
    )
      return false;

    // Visibility rules based on role and status
    const isMyRequest = currentEmployeeId != null && currentEmployeeId === request.employee_id;
    const iCreatedIt = user != null && user.id === request.created_by;
    
    // Tab filtering (only for Reporting Head)
    if (isStrictReportingHead) {
      if (requestTarget === 'own') {
        if (!isMyRequest) return false;
      } else { // 'employee'
        if (isMyRequest) return false; // Hide own requests from employee tab
        // If they are not our subordinate, hide it
        if (!subordinateIds?.includes(request.employee_id)) return false;
      }
      // If we made it this far as a Reporting Head, it's either our own request (own tab) 
      // or a subordinate's request (employee tab). So we can show it!
      return true;
    }

    // Regular Employee Logic
    if (!isAdmin) {
      // Employees can only see their own requests or requests they created
      if (!isMyRequest && !iCreatedIt) return false;
      return true;
    }

    // Admin / HR Logic
    if (!isMyRequest && !iCreatedIt) {
      const reportingTo = Array.isArray(request.employee_reporting_to) 
        ? request.employee_reporting_to 
        : (request.employee_reporting_to ? [request.employee_reporting_to] : []);
        
      const hasReportingManager = reportingTo.length > 0;
      const amIReportingManager = hasReportingManager && 
        ((currentEmployeeId && reportingTo.includes(currentEmployeeId)) || (user && reportingTo.includes(user.id)));

      if (request.status === 'Pending' && hasReportingManager) {
        // If Pending and has a reporting manager, ONLY the reporting manager can see it.
        // Admins/HR cannot see it yet.
        if (!amIReportingManager) return false;
      }
    }

    return true;
  });

  if (loading && requests.length === 0) {
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

  if (filteredRequests.length === 0) {
    return null;
  }

  return (
    <div className="bg-white shadow overflow-hidden sm:rounded-md">
      <div className="px-6 py-4 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg 2xl:text-xl font-medium text-gray-900">Leave Requests</h2>
        </div>
        
        {isStrictReportingHead && (
          <div className="flex rounded-lg bg-gray-100 p-1 gap-1">
            <button
              onClick={() => setRequestTarget('employee')}
              className={`flex items-center gap-2 py-1.5 px-4 rounded-md text-sm font-semibold transition-all ${
                requestTarget === 'employee'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <Users className="h-4 w-4" />
              Employee
            </button>
            <button
              onClick={() => setRequestTarget('own')}
              className={`flex items-center gap-2 py-1.5 px-4 rounded-md text-sm font-semibold transition-all ${
                requestTarget === 'own'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <User className="h-4 w-4" />
              Own Request
            </button>
          </div>
        )}
      </div>
      <ul className="divide-y divide-gray-200">
        {filteredRequests.map((request) => {
          // isOwner = true only when this leave belongs to the logged-in user (as an employee).
          // We deliberately exclude the `created_by` check — an admin who submits a request
          // on behalf of another employee should still see Approve/Reject, not Edit/Cancel.
          const isOwner = currentEmployeeId != null && currentEmployeeId === request.employee_id;
          const showAdminActions = isAdmin && !isOwner;
          const showOwnerActions = !isAdmin || isOwner;

          return (
          <li key={request.id}>
            <div className="px-4 py-4 sm:px-6 hover:bg-gray-50 transition-colors duration-150">
              <div className="flex flex-col md:flex-row justify-between gap-4">
                {/* Left Side: Info */}
                <div className="flex-1 space-y-3">
                  {/* Header */}
                  <div className="flex w-full  items-center justify-between space-x-2">
                    <div className='flex  space-x-2'>
                    <h4 className="text-sm font-semibold text-gray-900">
                      {request.employee_name} <span className="text-gray-500 font-normal">({request.employee_code})</span>
                    </h4>
                    <span className="text-gray-300">•</span>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {request.leave_type?.name || 'Leave'}
                    </span>
                    </div>
                    <div className="flex justify-end ml-auto">
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold leading-5 ${
                        request.status === 'Approved'
                          ? 'bg-green-100 text-green-800'
                          : request.status === 'Rejected'
                          ? 'bg-red-100 text-red-800'
                          : request.status === 'Cancelled'
                          ? 'bg-gray-100 text-gray-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      {request.status}
                    </span>
                  </div>
                  </div>
                  

                  <div>

                  {/* Body Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm bg-white border border-gray-100 shadow-sm p-3 rounded-md">
                    <div>
                      <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Date</p>
                      <p className="font-medium text-gray-900">
                        {new Date(request.start_date).toLocaleDateString()} - {new Date(request.end_date).toLocaleDateString()}
                      </p>
                    </div>

                    <div>
                      <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Reason</p>
                      <p className="font-medium text-gray-900 break-words whitespace-pre-wrap" title={request.reason}>
                        {request.reason || "N/A"}
                      </p>
                    </div>

                    <div>
                      <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Requested By</p>
                      <p className="font-medium text-gray-900">
                        {request.created_by_name || 'Self'}
                      </p>
                    </div>

                    <div>
                      <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Reviewed By</p>
                      <p className="font-medium text-gray-900">
                        {request.status === 'Pending' ? (
                           <span className="text-gray-400 italic">Pending</span>
                        ) : (
                           request.approved_by_name || 'N/A'
                        )}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Right Side: Status and Actions */}
                <div className="flex flex-col items-start md:items-end justify-between min-w-[140px]">
                  
                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-2">

                    {/* --- PENDING STATUS ACTIONS --- */}
                    {request.status === 'Pending' && showAdminActions && (
                      <>
                        <button
                          onClick={() => handleStatusUpdate(request.id, 'Approved')}
                          className="inline-flex items-center px-3 py-1 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-green-600 hover:bg-green-700 transition-colors"
                        >
                          <Check className="h-4 w-4 mr-1" />
                          Approve
                        </button>
                        <button
                          onClick={() => handleStatusUpdate(request.id, 'Rejected')}
                          className="inline-flex items-center px-3 py-1 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-red-600 hover:bg-red-700 transition-colors"
                        >
                          <X className="h-4 w-4 mr-1" />
                          Reject
                        </button>
                      </>
                    )}

                    {request.status === 'Pending' && showOwnerActions && (
                      <>
                        <button
                          onClick={() => onEdit?.(request)}
                          className="inline-flex items-center px-3 py-1 border border-gray-300 text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                        >
                          <Edit2 className="h-4 w-4 mr-1 text-indigo-500" />
                          Edit
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm('Are you sure you want to cancel this leave request?')) {
                              handleStatusUpdate(request.id, 'Cancelled');
                            }
                          }}
                          className="inline-flex items-center px-3 py-1 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-gray-600 hover:bg-gray-700 transition-colors"
                        >
                          <Ban className="h-4 w-4 mr-1" />
                          Cancel
                        </button>
                      </>
                    )}

                    {/* --- APPROVED STATUS ACTIONS --- */}
                    {request.status === 'Approved' && showAdminActions && (
                      <>
                        <button
                          onClick={() => handleStatusUpdate(request.id, 'Pending')}
                          className="inline-flex items-center px-3 py-1 border border-gray-300 text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                          title="Set back to Pending"
                        >
                          <RotateCcw className="h-4 w-4 mr-1 text-orange-500" />
                          Revoke
                        </button>
                        <button
                          onClick={() => handleStatusUpdate(request.id, 'Cancelled')}
                          className="inline-flex items-center px-3 py-1 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-gray-600 hover:bg-gray-700 transition-colors"
                        >
                          <Ban className="h-4 w-4 mr-1" />
                          Cancel
                        </button>
                      </>
                    )}

                    {request.status === 'Approved' && showOwnerActions && (
                      <button
                        onClick={() => {
                          if (window.confirm('Are you sure you want to cancel this approved leave request?')) {
                            handleStatusUpdate(request.id, 'Cancelled');
                          }
                        }}
                        className="inline-flex items-center px-3 py-1 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-gray-600 hover:bg-gray-700 transition-colors"
                      >
                        <Ban className="h-4 w-4 mr-1" />
                        Cancel
                      </button>
                    )}

                    {/* --- REJECTED / CANCELLED: Admin can revert --- */}
                    {isAdmin && request.status === 'Rejected' && (
                      <button
                        onClick={() => handleStatusUpdate(request.id, 'Pending')}
                        className="inline-flex items-center px-3 py-1 border border-gray-300 text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                      >
                        <RotateCcw className="h-4 w-4 mr-1 text-orange-500" />
                        Revoke Rejection
                      </button>
                    )}

                    {isAdmin && request.status === 'Cancelled' && (
                      <button
                        onClick={() => handleStatusUpdate(request.id, 'Pending')}
                        className="inline-flex items-center px-3 py-1 border border-gray-300 text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                      >
                        <RotateCcw className="h-4 w-4 mr-1 text-orange-500" />
                        Revoke Cancellation
                      </button>
                    )}
                  </div>
                </div>
</div>
              </div>
            </div>
          </li>
          );
        })}
      </ul>
    </div>
  );
}