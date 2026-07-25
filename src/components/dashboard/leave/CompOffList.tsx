import React, { useEffect, useState } from 'react';
import { Calendar, AlertCircle, Check, X, Clock } from 'lucide-react';
import { useCompOffStore, type CompOffRequest } from '../../../stores/compOffStore';
import { useAuth } from '../../../contexts/AuthContext';
import { getUserEmployeeData, UserRole } from '../../../lib/roleBasedAccess';

export interface CompOffListProps {
  employeeId?: string;
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
  canViewAllData?: boolean;
}

export default function CompOffList({
  employeeId,
  filters,
  onRefresh,
  lastRefresh,
  subordinateIds,
  isReportingHead,
  canViewAllData
}: CompOffListProps) {
  const { user } = useAuth();
  const { requests, loading, error, fetchRequests, approveRequest, rejectRequest } = useCompOffStore();
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [currentEmployeeId, setCurrentEmployeeId] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      getUserEmployeeData(user.id).then(data => {
        setUserRole(data.role);
        setCurrentEmployeeId(data.employeeId);
      });
    }
  }, [user]);

  const isAdmin = userRole === 'Admin' || userRole === 'HR Team' || userRole === 'Reporting Head' || canViewAllData;

  useEffect(() => {
    if (!user) return;
    fetchRequests(employeeId);
  }, [employeeId, lastRefresh, user, fetchRequests]);

  const handleApprove = async (id: string) => {
    if (!user) return;
    await approveRequest(id, user.id);
    onRefresh();
  };

  const handleReject = async (id: string) => {
    if (!user) return;
    const reason = window.prompt("Enter rejection reason:");
    if (reason !== null) {
      await rejectRequest(id, user.id, reason);
      onRefresh();
    }
  };

  const filteredRequests = requests.filter((request) => {
    if (filters.status && request.status !== filters.status) return false;
    if (filters.start_date && new Date(request.worked_date) < new Date(filters.start_date)) return false;
    if (filters.end_date && new Date(request.worked_date) > new Date(filters.end_date)) return false;

    const isMyRequest = currentEmployeeId != null && currentEmployeeId === request.employee_id;

    if (isReportingHead) {
      if (isMyRequest) return true;
      if (subordinateIds?.includes(request.employee_id)) return true;
      return false;
    }

    if (!isAdmin) {
      return isMyRequest;
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
    return (
      <div className="bg-white shadow rounded-lg p-6 text-center text-gray-500">
        No comp off credit requests found.
      </div>
    );
  }

  return (
    <div className="bg-white shadow overflow-hidden sm:rounded-md">
      <ul className="divide-y divide-gray-200">
        {filteredRequests.map((request) => (
          <li key={request.id}>
            <div className="px-4 py-4 sm:px-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <Calendar className="h-6 w-6 text-gray-400" />
                  </div>
                  <div className="ml-4">
                    <div className="text-sm font-medium text-indigo-600">
                      {request.employee?.name}
                    </div>
                    <div className="text-sm text-gray-500">
                      Worked Date: {new Date(request.worked_date).toLocaleDateString()}
                    </div>
                    <div className="text-sm text-gray-500">
                      Reason: {request.reason}
                    </div>
                    <div className="text-sm text-gray-500">
                      Credit to: {request.leave_type?.name}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      request.status === 'Approved'
                        ? 'bg-green-100 text-green-800'
                        : request.status === 'Rejected'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}
                  >
                    {request.status}
                  </span>
                  
                  {(isAdmin || isReportingHead) && request.status === 'Pending' && (
                    <div className="mt-2 flex space-x-2">
                      <button
                        onClick={() => handleApprove(request.id)}
                        className="inline-flex items-center px-2 py-1 border border-transparent text-xs font-medium rounded shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                      >
                        <Check className="h-3 w-3 mr-1" />
                        Approve
                      </button>
                      <button
                        onClick={() => handleReject(request.id)}
                        className="inline-flex items-center px-2 py-1 border border-transparent text-xs font-medium rounded shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                      >
                        <X className="h-3 w-3 mr-1" />
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
