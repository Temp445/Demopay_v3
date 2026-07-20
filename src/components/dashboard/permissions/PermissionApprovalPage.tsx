import React, { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Clock, Calendar, Eye, CreditCard as Edit2, AlertCircle, History, Search, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import { usePermissionsStore } from '../../../stores/permissionsStore';
import { EmployeePermission, EmployeePermissionLog } from '../../../types/permissions';
import { format } from 'date-fns';
import { useAuth } from '../../../contexts/AuthContext';
import { getUserEmployeeData } from '../../../lib/roleBasedAccess';
import { useEmployeesStore } from '../../../stores/employeesStore';

export default function PermissionApprovalPage() {
  const { permissions, logs, loading, error, fetchPermissions, fetchPermissionLogs, approvePermission, rejectPermission, updatePermission } = usePermissionsStore();

  const [showModal, setShowModal] = useState(false);
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [selectedPermission, setSelectedPermission] = useState<EmployeePermission | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    startDate: '',
    startTime: '',
    endDate: '',
    endTime: '',
    reason: '',
  });

  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isReportingHead, setIsReportingHead] = useState(false);
  const [currentEmployeeId, setCurrentEmployeeId] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');
  const [reviewerFilter, setReviewerFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [pendingCurrentPage, setPendingCurrentPage] = useState(1);
  const pendingItemsPerPage = 10;
  const [loadingLogsId, setLoadingLogsId] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  const { items: employees, fetchEmployees } = useEmployeesStore();

  useEffect(() => {
    let isMounted = true;

    const initializePage = async () => {
      // Clear permissions from store to prevent flash of shared store state from other screens
      usePermissionsStore.getState().reset();
      setIsInitializing(true);
      await Promise.all([
        fetchPermissions(),
        fetchEmployees()
      ]);

      if (user && isMounted) {
        const { role, employeeId } = await getUserEmployeeData(user.id);
        setIsAdmin(role?.toLowerCase() === 'admin' || role?.toLowerCase() === 'hr team');
        setIsReportingHead(role?.toLowerCase() === 'reporting head');
        setCurrentEmployeeId(employeeId);
      }

      if (isMounted) {
        setIsInitializing(false);
      }
    };

    initializePage();

    return () => {
      isMounted = false;
    };
  }, [user?.id]);

  const handleViewDetails = (permission: EmployeePermission) => {
    setSelectedPermission(permission);
    setIsEditing(false);
    setFormData({
      startDate: permission.startDate,
      startTime: permission.startTime,
      endDate: permission.endDate,
      endTime: permission.endTime,
      reason: permission.reason,
    });
    setShowModal(true);
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleSaveChanges = async () => {
    if (!selectedPermission) return;

    const success = await updatePermission(selectedPermission.id, formData);
    if (success) {
      setIsEditing(false);
      setSelectedPermission({
        ...selectedPermission,
        ...formData,
      });
    }
  };

  const handleApprove = async () => {
    if (!selectedPermission) return;

    const updatedData = isEditing ? formData : undefined;
    const success = await approvePermission(selectedPermission.id, updatedData);
    if (success) {
      setShowModal(false);
      setSelectedPermission(null);
    }
  };

  const handleReject = async () => {
    if (!selectedPermission) return;

    if (confirm('Are you sure you want to reject this permission request?')) {
      const success = await rejectPermission(selectedPermission.id);
      if (success) {
        setShowModal(false);
        setSelectedPermission(null);
      }
    }
  };

  const handleViewLogs = async (permission: EmployeePermission) => {
    setSelectedPermission(permission);
    setLoadingLogsId(permission.id);
    await fetchPermissionLogs(permission.id);
    setLoadingLogsId(null);
    setShowLogsModal(true);
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      pending: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
      cancelled: 'bg-gray-100 text-gray-800',
    };

    const icons = {
      pending: <Clock className="h-4 w-4" />,
      approved: <CheckCircle className="h-4 w-4" />,
      rejected: <XCircle className="h-4 w-4" />,
      cancelled: <AlertCircle className="h-4 w-4" />,
    };

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status as keyof typeof styles]}`}>
        {icons[status as keyof typeof icons]}
        <span className="ml-1 capitalize">{status}</span>
      </span>
    );
  };

  const formatDateTime = (date: string, time: string) => {
    try {
      return `${format(new Date(date), 'MMM dd, yyyy')} at ${time}`;
    } catch {
      return `${date} at ${time}`;
    }
  };

  const formatLogDateTime = (dateTime: string) => {
    try {
      return format(new Date(dateTime), 'MMM dd, yyyy HH:mm:ss');
    } catch {
      return dateTime;
    }
  };

  const isVisibleToApprover = (p: EmployeePermission) => {
    const requestingEmployee = employees.find(emp => emp.id === p.employeeId);

    // Check if the current user (either by employee ID or auth profile ID) is in the requesting employee's reporting_to array
    if (requestingEmployee && requestingEmployee.reporting_to) {
      const reportingToArray = Array.isArray(requestingEmployee.reporting_to)
        ? requestingEmployee.reporting_to
        : [requestingEmployee.reporting_to];

      const matchesEmployeeId = currentEmployeeId && reportingToArray.includes(currentEmployeeId);
      const matchesUserId = user && reportingToArray.includes(user.id);

      if (matchesEmployeeId || matchesUserId) {
        return true;
      }
    }

    return false;
  };

  // Pending approvals strictly require the user to be the reporting head, OR the user is an Admin/HR who created the request
  const pendingPermissions = permissions.filter(p => {
    if (p.status !== 'pending') return false;
    
    if (isAdmin && p.requestedBy === user?.id) {
      return true;
    }
    
    return isVisibleToApprover(p);
  });

  const totalPendingPages = Math.ceil(pendingPermissions.length / pendingItemsPerPage);
  const paginatedPendingPermissions = pendingPermissions.slice(
    (pendingCurrentPage - 1) * pendingItemsPerPage,
    pendingCurrentPage * pendingItemsPerPage
  );

  // Processed requests are filtered based on role: Admin/HR see all processed requests, Reporting Heads see those they reviewed or for their subordinates
  const otherPermissions = permissions.filter(p => {
    if (p.status === 'pending') return false;

    if (isAdmin) return true;

    return p.approvedBy === user?.id || isVisibleToApprover(p);
  });

  const uniqueReviewers = React.useMemo(() => {
    const reviewers = new Set<string>();
    otherPermissions.forEach(p => {
      if (p.approvedByName) reviewers.add(p.approvedByName);
    });
    return Array.from(reviewers).sort();
  }, [otherPermissions]);

  const uniqueEmployees = React.useMemo(() => {
    const emps = new Map<string, string>();
    otherPermissions.forEach(p => {
      if (p.employeeName) emps.set(p.employeeCode || p.employeeName, p.employeeName);
    });
    return Array.from(emps.entries()).map(([code, name]) => ({ code, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [otherPermissions]);

  const filteredOtherPermissions = React.useMemo(() => {
    return otherPermissions.filter(p => {
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch =
        !searchTerm ||
        p.employeeName?.toLowerCase().includes(searchLower) ||
        p.employeeCode?.toLowerCase().includes(searchLower);

      const matchesStatus = statusFilter === 'all' || p.status === statusFilter;

      const matchesStartDate = !startDateFilter || p.startDate >= startDateFilter;
      const matchesEndDate = !endDateFilter || p.startDate <= endDateFilter;

      const matchesReviewer = !reviewerFilter || p.approvedByName?.toLowerCase().includes(reviewerFilter.toLowerCase());

      return matchesSearch && matchesStatus && matchesStartDate && matchesEndDate && matchesReviewer;
    });
  }, [otherPermissions, searchTerm, statusFilter, startDateFilter, endDateFilter, reviewerFilter]);

  const totalPages = Math.ceil(filteredOtherPermissions.length / itemsPerPage);
  const paginatedPermissions = filteredOtherPermissions.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div className="max-w-7xl mx-auto px-2  md:py-8">
      <div className="mb-8">
        <h1 className=" text-xl md:text-3xl font-bold text-gray-900">Permission Approvals</h1>
        <p className="mt-2 text-sm text-gray-600">
          Review and approve permission requests from employees
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-4 mb-6">
          <div className="flex">
            <AlertCircle className="h-5 w-5 text-red-400" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">{error}</h3>
            </div>
          </div>
        </div>
      )}

      {(loading || isInitializing) ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-sm text-gray-500">Loading permissions...</p>
        </div>
      ) : (
        <>
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Pending Approvals</h2>
            {pendingPermissions.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-lg shadow">
                <CheckCircle className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No pending requests</h3>
                <p className="mt-1 text-sm text-gray-500">All permission requests have been processed.</p>
              </div>
            ) : (
              <>
                {/* Mobile/Tablet Card View */}
                <div className="xl:hidden grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  {paginatedPendingPermissions.map((permission) => (
                    <div key={permission.id} className="bg-white rounded-lg shadow p-4 border border-gray-200">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h3 className="text-sm font-medium text-gray-900">{permission.employeeName}</h3>
                          <p className="text-xs text-gray-500">{permission.employeeCode}</p>
                        </div>
                        {getStatusBadge(permission.status)}
                      </div>

                      <div className="space-y-2 mb-3">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">Start:</span>
                          <span className="font-medium text-gray-900">{format(new Date(permission.startDate), 'MMM dd, yyyy')} {permission.startTime}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">End:</span>
                          <span className="font-medium text-gray-900">{format(new Date(permission.endDate), 'MMM dd, yyyy')} {permission.endTime}</span>
                        </div>
                        <div className="text-sm">
                          <span className="text-gray-500 block mb-1">Reason:</span>
                          <p className="text-gray-900 bg-gray-50 p-2 rounded text-xs whitespace-normal break-words">{permission.reason}</p>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1.5 mb-3 pt-3 border-t border-gray-100">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-gray-500">Requested:</span>
                          <span className="font-medium text-gray-900">{formatLogDateTime(permission.createdAt)}</span>
                        </div>
                      </div>

                      <div className="flex justify-end pt-3 border-t border-gray-100 mt-2">
                        <button onClick={() => handleViewDetails(permission)} className="flex items-center px-3 py-1.5 bg-blue-50 text-blue-700 rounded-md text-sm font-medium hover:bg-blue-100 transition-colors">
                          <Eye className="h-4 w-4 mr-1.5" />
                          Review
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop Table View */}
                <div className="hidden xl:block bg-white shadow overflow-x-auto sm:rounded-lg">
                  <table className="min-w-[1000px] w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Employee
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Start / End
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Reason
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Requested
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {paginatedPendingPermissions.map((permission) => (
                        <tr key={permission.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">{permission.employeeName}</div>
                            <div className="text-sm text-gray-500">{permission.employeeCode}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">{format(new Date(permission.startDate), 'MMM dd, yyyy')}</div>
                            <div className="text-xs text-gray-500">{permission.startTime} to {permission.endTime}</div>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-900 max-w-[200px] whitespace-normal break-words">
                            {permission.reason}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900 truncate max-w-[120px]" title={permission.requestedByName || ''}>
                              {permission.requestedByName || '-'}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <button
                              onClick={() => handleViewDetails(permission)}
                              className="text-blue-600 hover:text-blue-900 inline-flex items-center"
                            >
                              <Eye className="h-4 w-4 mr-1" />
                              Review
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pending Approvals Pagination */}
                {totalPendingPages > 1 && (
                  <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6 mt-4 sm:rounded-lg shadow">
                    <div className="flex-1 flex justify-between sm:hidden">
                      <button
                        onClick={() => setPendingCurrentPage(prev => Math.max(prev - 1, 1))}
                        disabled={pendingCurrentPage === 1}
                        className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400"
                      >
                        Previous
                      </button>
                      <button
                        onClick={() => setPendingCurrentPage(prev => Math.min(prev + 1, totalPendingPages))}
                        disabled={pendingCurrentPage === totalPendingPages}
                        className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400"
                      >
                        Next
                      </button>
                    </div>
                    <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm text-gray-700">
                          Showing <span className="font-medium">{((pendingCurrentPage - 1) * pendingItemsPerPage) + 1}</span> to{' '}
                          <span className="font-medium">{Math.min(pendingCurrentPage * pendingItemsPerPage, pendingPermissions.length)}</span> of{' '}
                          <span className="font-medium">{pendingPermissions.length}</span> results
                        </p>
                      </div>
                      <div>
                        <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                          <button
                            onClick={() => setPendingCurrentPage(prev => Math.max(prev - 1, 1))}
                            disabled={pendingCurrentPage === 1}
                            className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400"
                          >
                            <span className="sr-only">Previous</span>
                            <ChevronLeft className="h-5 w-5" />
                          </button>
                          {[...Array(totalPendingPages)].map((_, i) => (
                            <button
                              key={i + 1}
                              onClick={() => setPendingCurrentPage(i + 1)}
                              className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium
                                ${pendingCurrentPage === i + 1
                                  ? 'z-10 bg-blue-50 border-blue-500 text-blue-600'
                                  : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                                }`}
                            >
                              {i + 1}
                            </button>
                          ))}
                          <button
                            onClick={() => setPendingCurrentPage(prev => Math.min(prev + 1, totalPendingPages))}
                            disabled={pendingCurrentPage === totalPendingPages}
                            className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400"
                          >
                            <span className="sr-only">Next</span>
                            <ChevronRight className="h-5 w-5" />
                          </button>
                        </nav>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="mt-8">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-gray-900">Processed Requests History</h2>
              <p className="text-sm text-gray-500 mt-1">Review previously approved, rejected, or cancelled requests and their complete audit logs.</p>
            </div>

            <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-4 mb-6">
              <div className="relative w-full sm:w-64">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  type="text"
                  list="employee-suggestions"
                  placeholder="Search employee..."
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                  className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
                <datalist id="employee-suggestions">
                  {uniqueEmployees.map(emp => (
                    <option key={emp.code} value={emp.name}>{emp.code}</option>
                  ))}
                </datalist>
              </div>

              <div className="w-full sm:w-auto">
                <select
                  value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                  className="block w-full py-2 pl-3 pr-8 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                >
                  <option value="all">All Status</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              <div className="flex items-center space-x-2 w-full sm:w-auto">
                <input
                  type="date"
                  value={startDateFilter}
                  onChange={(e) => { setStartDateFilter(e.target.value); setCurrentPage(1); }}
                  className="block w-full sm:w-auto px-3 py-2 border border-gray-300 rounded-md leading-5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
                <span className="text-gray-500 text-sm">to</span>
                <input
                  type="date"
                  value={endDateFilter}
                  onChange={(e) => { setEndDateFilter(e.target.value); setCurrentPage(1); }}
                  className="block w-full sm:w-auto px-3 py-2 border border-gray-300 rounded-md leading-5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>

              <div className="w-full sm:w-auto">
                <select
                  value={reviewerFilter}
                  onChange={(e) => { setReviewerFilter(e.target.value); setCurrentPage(1); }}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md leading-5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                >
                  <option value="">All Reviewers</option>
                  {uniqueReviewers.map(reviewer => (
                    <option key={reviewer} value={reviewer}>{reviewer}</option>
                  ))}
                </select>
              </div>
            </div>

            {filteredOtherPermissions.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-lg shadow">
                <Calendar className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No processed requests</h3>
                <p className="mt-1 text-sm text-gray-500">Approved or rejected requests will appear here.</p>
              </div>
            ) : (
              <>
                {/* Mobile/Tablet Card View */}
                <div className="xl:hidden grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  {paginatedPermissions.map((permission) => (
                    <div key={permission.id} className="bg-white rounded-lg shadow p-4 border border-gray-200">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h3 className="text-sm font-medium text-gray-900">{permission.employeeName}</h3>
                          <p className="text-xs text-gray-500">{permission.employeeCode}</p>
                        </div>
                        {getStatusBadge(permission.status)}
                      </div>

                      <div className="space-y-2 mb-3">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">Start / End:</span>
                          <div className="text-right">
                            <span className="font-medium text-gray-900 block">{format(new Date(permission.startDate), 'MMM dd, yyyy')}</span>
                            <span className="text-gray-500 text-xs">{permission.startTime} to {permission.endTime}</span>
                          </div>
                        </div>
                        <div className="text-sm">
                          <span className="text-gray-500 block mb-1">Reason:</span>
                          <p className="text-gray-900 bg-gray-50 p-2 rounded text-xs whitespace-normal break-words">{permission.reason}</p>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1.5 mb-3 pt-3 border-t border-gray-100">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-gray-500">Requested By:</span>
                          <span className="font-medium text-gray-900 truncate max-w-[150px] text-right" title={permission.requestedByName || ''}>{permission.requestedByName || '-'}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-gray-500">Reviewed By:</span>
                          <span className="font-medium text-gray-900 truncate max-w-[150px] text-right" title={permission.approvedByName || ''}>{permission.approvedByName || '-'}</span>
                        </div>
                        {permission.approvalDate && (
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-gray-500">Reviewed On:</span>
                            <span className="font-medium text-gray-900">{format(new Date(permission.approvalDate), 'MMM dd, yyyy')}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex justify-end pt-3 border-t border-gray-100 mt-2">
                        <button
                          onClick={() => handleViewLogs(permission)}
                          disabled={loadingLogsId === permission.id}
                          className="flex items-center px-3 py-1.5 bg-blue-50 text-blue-700 rounded-md text-sm font-medium hover:bg-blue-100 transition-colors disabled:opacity-50"
                        >
                          {loadingLogsId === permission.id ? (
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-700 mr-1.5"></div>
                          ) : (
                            <History className="h-4 w-4 mr-1.5" />
                          )}
                          Logs
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop Table View */}
                <div className="hidden xl:block bg-white shadow overflow-x-auto sm:rounded-lg">
                  <table className="min-w-[1000px] w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Employee
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Start / End
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Reason
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Requested By
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Reviewed By
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {paginatedPermissions.map((permission) => (
                        <tr key={permission.id} className="hover:bg-gray-50">
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">{permission.employeeName}</div>
                            <div className="text-sm text-gray-500">{permission.employeeCode}</div>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">{format(new Date(permission.startDate), 'MMM dd, yyyy')}</div>
                            <div className="text-xs text-gray-500">{permission.startTime} to {permission.endTime}</div>
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-900 max-w-[200px] whitespace-normal break-words">
                            {permission.reason}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900 truncate max-w-[120px]" title={permission.requestedByName || ''}>
                              {permission.requestedByName || '-'}
                            </div>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            {permission.approvedByName ? (
                              <div>
                                <div className="text-sm text-gray-900 truncate max-w-[120px]" title={permission.approvedByName}>
                                  {permission.approvedByName}
                                </div>
                                {permission.approvalDate && (
                                  <div className="text-xs text-gray-500">
                                    {format(new Date(permission.approvalDate), 'MMM dd, yyyy')}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            {getStatusBadge(permission.status)}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
                            <button
                              onClick={() => handleViewLogs(permission)}
                              disabled={loadingLogsId === permission.id}
                              className="text-blue-600 hover:text-blue-900 inline-flex items-center disabled:opacity-50"
                            >
                              {loadingLogsId === permission.id ? (
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-700 mr-1"></div>
                              ) : (
                                <History className="h-4 w-4 mr-1" />
                              )}
                              Logs
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
                      <div className="flex-1 flex justify-between sm:hidden">
                        <button
                          onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                          disabled={currentPage === 1}
                          className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400"
                        >
                          Previous
                        </button>
                        <button
                          onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                          disabled={currentPage === totalPages}
                          className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400"
                        >
                          Next
                        </button>
                      </div>
                      <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm text-gray-700">
                            Showing <span className="font-medium">{((currentPage - 1) * itemsPerPage) + 1}</span> to{' '}
                            <span className="font-medium">{Math.min(currentPage * itemsPerPage, filteredOtherPermissions.length)}</span> of{' '}
                            <span className="font-medium">{filteredOtherPermissions.length}</span> results
                          </p>
                        </div>
                        <div>
                          <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                            <button
                              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                              disabled={currentPage === 1}
                              className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400"
                            >
                              <span className="sr-only">Previous</span>
                              <ChevronLeft className="h-5 w-5" />
                            </button>
                            {[...Array(totalPages)].map((_, i) => (
                              <button
                                key={i + 1}
                                onClick={() => setCurrentPage(i + 1)}
                                className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium
                                ${currentPage === i + 1
                                    ? 'z-10 bg-blue-50 border-blue-500 text-blue-600'
                                    : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                                  }`}
                              >
                                {i + 1}
                              </button>
                            ))}
                            <button
                              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                              disabled={currentPage === totalPages}
                              className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400"
                            >
                              <span className="sr-only">Next</span>
                              <ChevronRight className="h-5 w-5" />
                            </button>
                          </nav>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </>
      )}

      {showModal && selectedPermission && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-gray-900">Permission Request Details</h3>
                {selectedPermission.status === 'pending' && !isEditing && (
                  <button
                    onClick={handleEdit}
                    className="text-blue-600 hover:text-blue-900 inline-flex items-center text-sm"
                  >
                    <Edit2 className="h-4 w-4 mr-1" />
                    Edit
                  </button>
                )}
              </div>
            </div>

            <div className="px-6 py-4">
              <div className="mb-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Employee Information</h4>
                <p className="text-sm text-gray-900">{selectedPermission.employeeName}</p>
                <p className="text-sm text-gray-500">{selectedPermission.employeeCode}</p>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    disabled={!isEditing}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                  <input
                    type="time"
                    value={formData.startTime}
                    onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                    disabled={!isEditing}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                  <input
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    disabled={!isEditing}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                  <input
                    type="time"
                    value={formData.endTime}
                    onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                    disabled={!isEditing}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                  />
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                <textarea
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  disabled={!isEditing}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                />
              </div>

              <div className="mb-4">
                <p className="text-sm text-gray-500">
                  Requested on: {formatLogDateTime(selectedPermission.createdAt)}
                </p>
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-between">
              <button
                onClick={() => {
                  setShowModal(false);
                  setSelectedPermission(null);
                  setIsEditing(false);
                }}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
              {selectedPermission.status === 'pending' && (
                <div className="flex space-x-3">
                  {isEditing && (
                    <button
                      onClick={handleSaveChanges}
                      disabled={loading}
                      className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                    >
                      Save Changes
                    </button>
                  )}
                  <button
                    onClick={handleReject}
                    disabled={loading}
                    className="inline-flex items-center px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Reject
                  </button>
                  <button
                    onClick={handleApprove}
                    disabled={loading}
                    className="inline-flex items-center px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Approve
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showLogsModal && selectedPermission && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Change History</h3>
              <p className="text-sm text-gray-500 mt-1">
                {selectedPermission.employeeName} ({selectedPermission.employeeCode})
              </p>
            </div>

            <div className="px-6 py-4">
              {logs.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">No changes recorded</p>
              ) : (
                <div className="space-y-4">
                  {logs.map((log) => (
                    <div key={log.id} className="border-l-4 border-blue-500 pl-4 py-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-gray-900 capitalize">
                          {log.fieldName.replace('_', ' ')}
                        </span>
                        <span className="text-xs text-gray-500">{formatLogDateTime(log.modifiedAt)}</span>
                      </div>
                      <div className="text-sm text-gray-600">
                        <span className="line-through text-red-600">{log.oldValue || 'N/A'}</span>
                        {' → '}
                        <span className="text-green-600">{log.newValue || 'N/A'}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">Modified by: {log.modifiedByName}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end">
              <button
                onClick={() => {
                  setShowLogsModal(false);
                  setSelectedPermission(null);
                }}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
