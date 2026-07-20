import React, { useEffect, useState, useMemo } from 'react';
import { Plus, CreditCard as Edit2, X, Clock, Calendar, CheckCircle, XCircle, AlertCircle, Info, User, Users } from 'lucide-react';
import { usePermissionsStore } from '../../../stores/permissionsStore';
import { useEmployeesStore } from '../../../stores/employeesStore';
import { EmployeePermission } from '../../../types/permissions';
import { format } from 'date-fns';
import { useAuth } from '../../../contexts/AuthContext';
import { getUserEmployeeData } from '../../../lib/roleBasedAccess';

type RequestTarget = 'own' | 'employee';

export default function PermissionRequestPage() {
  const {
    permissions,
    loading,
    error,
    fetchPermissions,
    createPermission,
    updatePermission,
    cancelPermission,
    fetchBalance,
    initializeMonthlyBalances
  } = usePermissionsStore();

  const { items: employees, fetchEmployees } = useEmployeesStore();

  const [showModal, setShowModal] = useState(false);
  const [editingPermission, setEditingPermission] = useState<EmployeePermission | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [remainingBalance, setRemainingBalance] = useState<number | null>(null);
  const [requestTarget, setRequestTarget] = useState<RequestTarget>('own');

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [formData, setFormData] = useState({
    startDate: '',
    startTime: '',
    endDate: '',
    endTime: '',
    reason: '',
  });

  const { user } = useAuth();
  const [userRole, setUserRole] = useState<string | null>(null);
  const [currentEmployeeId, setCurrentEmployeeId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isReportingHead, setIsReportingHead] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const initializePage = async () => {
      // Clear permissions from store to prevent flash of shared store state from other screens
      usePermissionsStore.getState().reset();
      setIsInitializing(true);

      await Promise.all([
        fetchEmployees(),
        initializeMonthlyBalances(),
      ]);

      if (user && isMounted) {
        const { role, employeeId } = await getUserEmployeeData(user.id);
        setUserRole(role);
        setCurrentEmployeeId(employeeId);

        const admin = role?.toLowerCase() === 'admin' || role?.toLowerCase() === 'hr team';
        const reportingHead = role?.toLowerCase() === 'reporting head';

        setIsAdmin(admin);
        setIsReportingHead(reportingHead);

        // Auto-select if regular employee
        if (!admin && !reportingHead && employeeId) {
          setSelectedEmployeeId(employeeId);
        }

        // Fetch own permissions and requests raised on behalf of others
        await fetchPermissions({ employeeId: employeeId || undefined, requestedByUserId: user.id });
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

  // Filter to own requests, and pending requests raised on behalf of other employees
  const ownPermissions = useMemo(() => {
    return permissions.filter(p => {
      const isOwnEmployee = currentEmployeeId && p.employeeId === currentEmployeeId;
      const isOwnRequestor = user?.id && p.requestedBy === user.id;

      if (isOwnEmployee) {
        return true; // Always show own requests
      }

      if (isOwnRequestor) {
        // Show requests raised on behalf of other employees only while pending
        return p.status === 'pending';
      }

      return false;
    });
  }, [permissions, currentEmployeeId, user?.id]);

  // Reset to first page when data changes
  useEffect(() => {
    setCurrentPage(1);
  }, [ownPermissions.length]);

  const totalPages = Math.ceil(ownPermissions.length / itemsPerPage);

  const paginatedPermissions = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return ownPermissions.slice(startIndex, startIndex + itemsPerPage);
  }, [ownPermissions, currentPage]);

  // Current user's own employee record
  const currentEmployee = useMemo(() => {
    if (!currentEmployeeId) return null;
    return employees.find(emp => emp.id === currentEmployeeId) ?? null;
  }, [employees, currentEmployeeId]);

  // Employees who report to this Reporting Head
  const subordinates = useMemo(() => {
    if (!currentEmployeeId) return [];
    return employees.filter(emp => {
      if (!emp.reporting_to) return false;
      const reportingTo = Array.isArray(emp.reporting_to)
        ? emp.reporting_to
        : [emp.reporting_to];
      return reportingTo.includes(currentEmployeeId);
    });
  }, [employees, currentEmployeeId]);

  // Fetch balance when employee or date changes
  useEffect(() => {
    const getBalance = async () => {
      if (selectedEmployeeId && formData.startDate) {
        const date = new Date(formData.startDate);
        const month = date.getMonth() + 1;
        const year = date.getFullYear();
        const balance = await fetchBalance(selectedEmployeeId, month, year);
        setRemainingBalance(balance !== null ? balance : 0);
      } else {
        setRemainingBalance(null);
      }
    };
    getBalance();
  }, [selectedEmployeeId, formData.startDate, fetchBalance]);

  const resetForm = () => {
    setFormData({ startDate: '', startTime: '', endDate: '', endTime: '', reason: '' });
    setRemainingBalance(null);
  };

  const handleOpenModal = (permission?: EmployeePermission) => {
    if (permission) {
      setEditingPermission(permission);
      setSelectedEmployeeId(permission.employeeId);
      setFormData({
        startDate: permission.startDate,
        startTime: permission.startTime,
        endDate: permission.endDate,
        endTime: permission.endTime,
        reason: permission.reason,
      });
    } else {
      setEditingPermission(null);
      setRequestTarget('own');
      // For admin/HR always blank; for reporting head default to own; for employee auto-select
      if (isAdmin) {
        setSelectedEmployeeId('');
      } else if (isReportingHead) {
        setSelectedEmployeeId(currentEmployeeId || '');
      } else {
        setSelectedEmployeeId(currentEmployeeId || '');
      }
      resetForm();
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingPermission(null);
    setRequestTarget('own');
    if (isAdmin) {
      setSelectedEmployeeId('');
    } else {
      setSelectedEmployeeId(currentEmployeeId || '');
    }
    resetForm();
  };

  // When target tab switches, update selectedEmployeeId accordingly
  const handleTargetChange = (target: RequestTarget) => {
    setRequestTarget(target);
    if (target === 'own') {
      setSelectedEmployeeId(currentEmployeeId || '');
    } else {
      setSelectedEmployeeId('');
    }
    setRemainingBalance(null);
  };

  const calculateDurationInMinutes = () => {
    const start = new Date(`${formData.startDate}T${formData.startTime}`);
    const end = new Date(`${formData.endDate}T${formData.endTime}`);
    const diffMs = end.getTime() - start.getTime();
    return Math.max(0, Math.floor(diffMs / 60000));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.startDate || !formData.startTime || !formData.endDate || !formData.endTime || !formData.reason.trim()) {
      alert('Please fill in all required fields');
      return;
    }

    let finalEmployeeId = selectedEmployeeId;
    if (requestTarget === 'own' && !editingPermission) {
      finalEmployeeId = currentEmployeeId || '';
    }

    if (!finalEmployeeId && !editingPermission) {
      alert('Please select an employee');
      return;
    }

    const requestedMinutes = calculateDurationInMinutes();
    if (requestedMinutes <= 0) {
      alert('End date and time must be after start date and time.');
      return;
    }

    if (remainingBalance !== null && requestedMinutes > remainingBalance) {
      alert(`Request denied: You are requesting ${requestedMinutes} minutes, but the employee only has ${remainingBalance} minutes left for this month.`);
      return;
    }

    const success = editingPermission
      ? await updatePermission(editingPermission.id, formData)
      : await createPermission({ employeeId: finalEmployeeId, ...formData });

    if (success) {
      handleCloseModal();
    }
  };

  const handleCancel = async (id: string) => {
    if (window.confirm('Are you sure you want to cancel this permission request?')) {
      await cancelPermission(id);
    }
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

  // Determine which employee list to show in the modal
  const employeeListForModal = useMemo(() => {
    if (isAdmin) return employees;
    if (isReportingHead && requestTarget === 'employee') return subordinates;
    return [];
  }, [isAdmin, isReportingHead, requestTarget, employees, subordinates]);

  const showEmployeeSelector = !editingPermission && (isAdmin || (isReportingHead && requestTarget === 'employee'));

  return (
    <div className="max-w-7xl mx-auto px-2 sm:py-8">
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Permission Requests</h1>
            <p className="mt-1 sm:mt-2 text-sm text-gray-600">Submit and manage your permission requests</p>
          </div>
          <button
            onClick={() => handleOpenModal()}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Request
          </button>
        </div>
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

      {(loading || isInitializing) && ownPermissions.length === 0 ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-sm text-gray-500">Loading permissions...</p>
        </div>
      ) : ownPermissions.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <Calendar className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No permission requests</h3>
          <p className="mt-1 text-sm text-gray-500">Get started by creating a new permission request.</p>
        </div>
      ) : (
        <div className="space-y-4 xl:space-y-0 xl:bg-white xl:shadow xl:overflow-hidden xl:rounded-lg">
          {/* Mobile & Tablet Card View (up to 1280px) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 xl:hidden">
            {paginatedPermissions.map((permission) => (
              <div key={permission.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">{permission.employeeName}</h3>
                    <p className="text-xs text-gray-500">{permission.employeeCode}</p>
                  </div>
                  <div>{getStatusBadge(permission.status)}</div>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-3 bg-gray-50/80 rounded-lg p-3 border border-gray-100/50">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">Start</p>
                    <p className="text-xs font-medium text-gray-900">{formatDateTime(permission.startDate, permission.startTime)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">End</p>
                    <p className="text-xs font-medium text-gray-900">{formatDateTime(permission.endDate, permission.endTime)}</p>
                  </div>
                </div>

                <div className="mb-3">
                  <p className="text-xs text-gray-700"><span className="font-medium text-gray-900">Reason:</span> {permission.reason}</p>
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

                {permission.status === 'pending' && (
                  <div className="flex justify-end space-x-2 pt-3 border-t border-gray-100 mt-2">
                    <button onClick={() => handleOpenModal(permission)} className="flex items-center px-3 py-1.5 bg-blue-50 text-blue-700 rounded-md text-sm font-medium hover:bg-blue-100 transition-colors">
                      <Edit2 className="h-4 w-4 mr-1.5" />
                      Edit
                    </button>
                    <button onClick={() => handleCancel(permission.id)} className="flex items-center px-3 py-1.5 bg-red-50 text-red-700 rounded-md text-sm font-medium hover:bg-red-100 transition-colors">
                      <X className="h-4 w-4 mr-1.5" />
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Desktop Table View (1280px and above) */}
          <div className="hidden xl:block overflow-x-auto w-full">
            <table className="min-w-[1000px] w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 xl:px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Employee</th>
                  <th className="px-3 xl:px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Start / End</th>
                  <th className="px-3 xl:px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reason</th>
                  <th className="px-3 xl:px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Requested By</th>
                  <th className="px-3 xl:px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reviewed By</th>
                  <th className="px-3 xl:px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-3 xl:px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paginatedPermissions.map((permission) => (
                  <tr key={permission.id} className="hover:bg-gray-50">
                    <td className="px-3 xl:px-4 py-3 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{permission.employeeName}</div>
                      <div className="text-xs text-gray-500">{permission.employeeCode}</div>
                    </td>
                    <td className="px-3 xl:px-4 py-3 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{format(new Date(permission.startDate), 'MMM dd, yyyy')}</div>
                      <div className="text-xs text-gray-500">{permission.startTime} to {permission.endTime}</div>
                    </td>
                    <td className="px-3 xl:px-4 py-3 text-sm text-gray-900 max-w-[200px] whitespace-normal break-words">
                      {permission.reason}
                    </td>
                    <td className="px-3 xl:px-4 py-3 whitespace-nowrap">
                      <div className="text-sm text-gray-900 truncate max-w-[100px] xl:max-w-[120px]" title={permission.requestedByName || ''}>
                        {permission.requestedByName || '-'}
                      </div>
                    </td>
                    <td className="px-3 xl:px-4 py-3 whitespace-nowrap">
                      {permission.approvedByName ? (
                        <div>
                          <div className="text-sm text-gray-900 truncate max-w-[100px] xl:max-w-[120px]" title={permission.approvedByName}>
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
                    <td className="px-3 xl:px-4 py-3 whitespace-nowrap">
                      {getStatusBadge(permission.status)}
                    </td>
                    <td className="px-3 xl:px-4 py-3 whitespace-nowrap text-sm font-medium">
                      {permission.status === 'pending' ? (
                        <div className="flex space-x-3">
                          <button onClick={() => handleOpenModal(permission)} className="flex items-center text-blue-600 hover:text-blue-900 transition-colors">
                            <Edit2 className="h-4 w-4 mr-1" />
                            <span>Edit</span>
                          </button>
                          <button onClick={() => handleCancel(permission.id)} className="flex items-center text-red-600 hover:text-red-900 transition-colors">
                            <X className="h-4 w-4 mr-1" />
                            <span>Cancel</span>
                          </button>
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 pb-4 px-4 sm:px-6 bg-gray-50 border-t border-gray-200 rounded-b-lg shadow-sm">
              <div className="text-xs sm:text-sm text-gray-600 font-medium">
                Showing{' '}
                <span className="font-semibold text-gray-900">
                  {ownPermissions.length === 0 ? 0 : Math.min(ownPermissions.length, (currentPage - 1) * itemsPerPage + 1)}
                </span>{' '}
                to{' '}
                <span className="font-semibold text-gray-900">
                  {Math.min(ownPermissions.length, currentPage * itemsPerPage)}
                </span>{' '}
                of{' '}
                <span className="font-semibold text-gray-900">{ownPermissions.length}</span>{' '}
                requests
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 rounded-md text-xs sm:text-sm font-semibold border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
                >
                  Previous
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                  if (
                    page === 1 ||
                    page === totalPages ||
                    Math.abs(currentPage - page) <= 1
                  ) {
                    return (
                      <button
                        key={page}
                        type="button"
                        onClick={() => setCurrentPage(page)}
                        className={`w-8 h-8 rounded-md text-xs sm:text-sm font-semibold transition-all shadow-sm ${currentPage === page
                          ? 'bg-blue-600 text-white border border-blue-600'
                          : 'border border-gray-300 text-gray-700 bg-white hover:bg-gray-50'
                          }`}
                      >
                        {page}
                      </button>
                    );
                  } else if (
                    (page === 2 && currentPage > 3) ||
                    (page === totalPages - 1 && currentPage < totalPages - 2)
                  ) {
                    return (
                      <span key={page} className="px-1 text-gray-400 font-semibold select-none">
                        ...
                      </span>
                    );
                  }
                  return null;
                })}

                <button
                  type="button"
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 rounded-md text-xs sm:text-sm font-semibold border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">
                {editingPermission ? 'Edit Permission Request' : 'New Permission Request'}
              </h3>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-4">

              {/* Own / Employee Tab Toggle — shown only for Reporting Head and not when editing */}
              {!editingPermission && isReportingHead && (
                <div className="mb-5">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Request For</label>
                  <div className="flex rounded-lg bg-gray-100 p-1 gap-1">
                    <button
                      type="button"
                      onClick={() => handleTargetChange('own')}
                      className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-semibold transition-all ${requestTarget === 'own'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-gray-600 hover:text-gray-800'
                        }`}
                    >
                      <User className="h-4 w-4" />
                      Own
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTargetChange('employee')}
                      className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-semibold transition-all ${requestTarget === 'employee'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-gray-600 hover:text-gray-800'
                        }`}
                    >
                      <Users className="h-4 w-4" />
                      Employee
                    </button>
                  </div>
                </div>
              )}

              {/* Own tab — read-only name display (Reporting Head) */}
              {!editingPermission && isReportingHead && requestTarget === 'own' && (
                <div className="mb-4">
                  {/* <label className="block text-sm font-medium text-gray-700 mb-1">Requesting For</label> */}
                  <div className="flex items-center gap-3 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-md">
                    <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                      <User className="h-4 w-4 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {currentEmployee?.name ?? 'You'}
                      </p>
                      {currentEmployee?.employee_code && (
                        <p className="text-xs text-gray-500">{currentEmployee.employee_code}</p>
                      )}
                    </div>
                    {/* <span className="ml-auto text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">Own</span> */}
                  </div>
                </div>
              )}

              {/* Employee Selector — Admin always, Reporting Head only on "employee" tab */}
              {showEmployeeSelector && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Employee <span className="text-red-500">*</span>
                  </label>
                  {isReportingHead && requestTarget === 'employee' && subordinates.length === 0 ? (
                    <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-3 flex items-center gap-2 text-sm text-amber-800">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      No employees are currently assigned to report under you.
                    </div>
                  ) : (
                    <select
                      value={selectedEmployeeId}
                      onChange={(e) => setSelectedEmployeeId(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                      required
                    >
                      <option value="">Select Employee</option>
                      {employeeListForModal.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.name} ({emp.employee_code})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* Balance info */}
              {remainingBalance !== null && (
                <div className="mb-4 bg-blue-50 p-3 rounded-md flex items-start">
                  <Info className="h-5 w-5 text-blue-400 mr-2 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-medium text-blue-800">Available Balance</h4>
                    <p className="text-sm text-blue-700">
                      This employee has <strong>{remainingBalance} minutes</strong> remaining for the selected month.
                    </p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Start Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Start Time <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="time"
                    value={formData.startTime}
                    onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    End Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    End Time <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="time"
                    value={formData.endTime}
                    onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter reason for permission request..."
                  required
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || (isReportingHead && requestTarget === 'employee' && subordinates.length === 0)}
                  className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? 'Saving...' : editingPermission ? 'Update Request' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}