import React, { useState, useEffect } from 'react';
import { Search, TrendingUp, Clock, CheckCircle, IndianRupee } from 'lucide-react';
import { useAdvancesStore } from '../../../stores/advancesStore';
import AdvanceDetailsModal from './AdvanceDetailsModal';
import type { AdvanceStatus, EmployeeAdvance } from '../../../types/advances';
import { useAuth } from '../../../contexts/AuthContext';
import { useRoleAccess } from '../../../hooks/useRoleAccess';
import { useEmployeesStore } from '../../../stores/employeesStore';

export default function AdvanceApprovalPage() {
  const { user } = useAuth();
  const { role, employeeId, isAdmin, isHR } = useRoleAccess();
  const isReportingHead = role === 'Reporting Head';
  const { items: employees, fetchEmployees } = useEmployeesStore();

  const { advances, fetchAdvances, loading } = useAdvancesStore();
  const [selectedAdvance, setSelectedAdvance] = useState<EmployeeAdvance | null>(null);
  const [statusFilter, setStatusFilter] = useState<AdvanceStatus | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [isInitialLoad, setIsInitialLoad] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      setIsInitialLoad(true);
      await Promise.all([
        fetchAdvances(),
        fetchEmployees()
      ]);
      setIsInitialLoad(false);
    };
    loadData();
  }, [fetchAdvances, fetchEmployees]);

  const isLoading = loading || isInitialLoad;

  const isVisibleToApprover = React.useCallback((p: EmployeeAdvance) => {
    const requestingEmployee = employees.find(emp => emp.id === p.employee_id);
    if (requestingEmployee && requestingEmployee.reporting_to) {
      const reportingTo = Array.isArray(requestingEmployee.reporting_to)
        ? requestingEmployee.reporting_to
        : [requestingEmployee.reporting_to];
      const matchesEmployeeId = employeeId && reportingTo.includes(employeeId);
      const matchesUserId = user && reportingTo.includes(user.id);
      return !!(matchesEmployeeId || matchesUserId);
    }
    return false;
  }, [employees, employeeId, user]);

  // 1. Role-based filtered advances (all advances this user has permission to see)
  const roleFilteredAdvances = React.useMemo(() => {
    return advances.filter(advance => {
      // Prevent Reporting Heads from seeing their own requests in the approval queue
      if (isReportingHead && employeeId && advance.employee_id === employeeId) {
        return false;
      }

      if (advance.status === 'pending') {
        if ((isAdmin || isHR) && advance.requested_by === user?.id) {
          return true;
        }
        return isVisibleToApprover(advance);
      } else {
        if (isAdmin || (isHR && !isReportingHead)) {
          return true;
        } else if (isReportingHead) {
          return advance.approved_by === user?.id || isVisibleToApprover(advance);
        }
        return false;
      }
    });
  }, [advances, isVisibleToApprover, isAdmin, isHR, isReportingHead, user?.id, employeeId]);

  // 2. Stats calculated based strictly on roleFilteredAdvances (the allowed records)
  const stats = React.useMemo(() => {
    return {
      total: roleFilteredAdvances.length,
      pending: roleFilteredAdvances.filter(a => a.status === 'pending').length,
      approved: roleFilteredAdvances.filter(a => a.status === 'approved').length,
      completed: roleFilteredAdvances.filter(a => a.status === 'completed').length,
      totalAmount: roleFilteredAdvances
        .filter(a => a.status === 'active' || a.status === 'approved')
        .reduce((sum, a) => sum + a.remaining_balance, 0),
    };
  }, [roleFilteredAdvances]);

  // 3. Final filtered advances after applying dropdown status and search filters
  const filteredAdvances = React.useMemo(() => {
    return roleFilteredAdvances.filter(advance => {
      const matchesStatus = statusFilter === 'all' || advance.status === statusFilter;
      const matchesSearch =
        !searchTerm ||
        advance.employee?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        advance.employee?.employee_code?.toLowerCase().includes(searchTerm.toLowerCase());

      return matchesStatus && matchesSearch;
    });
  }, [roleFilteredAdvances, statusFilter, searchTerm]);

  // Reset to first page when data changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filteredAdvances.length]);

  const totalPages = Math.ceil(filteredAdvances.length / itemsPerPage);

  const paginatedAdvances = React.useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredAdvances.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredAdvances, currentPage]);

  const getStatusBadge = (status: AdvanceStatus) => {
    const styles = {
      pending: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-blue-100 text-blue-800',
      rejected: 'bg-red-100 text-red-800',
      active: 'bg-green-100 text-green-800',
      completed: 'bg-gray-100 text-gray-800',
      cancelled: 'bg-gray-100 text-gray-800',
      closed: 'bg-purple-100 text-purple-800',
    };

    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${styles[status]}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  return (
    <div className="md:py-6">
      <div className="max-w-7xl mx-auto px-2">
        <div className="md:flex md:items-center md:justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Advance Approval</h1>
            <p className="mt-1 text-sm text-gray-500">
              Review and approve employee advance requests
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 md:gap-3 lg:gap-4 lg:grid-cols-4 mb-6">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <TrendingUp className="h-6 w-6 text-gray-400" />
                </div>
                <div className="ml-2 md:ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm text-center md:text-start font-medium text-gray-500 truncate">Total Advances</dt>
                    <dd className="text-lg text-center md:text-start font-semibold text-gray-900">{stats.total}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <Clock className="h-6 w-6 text-yellow-400" />
                </div>
                <div className="ml-2 md:ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm text-center md:text-start font-medium text-gray-500 truncate">Pending Approval</dt>
                    <dd className="text-lg text-center md:text-start font-semibold text-gray-900">{stats.pending}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <CheckCircle className="h-6 w-6 text-green-400" />
                </div>
                <div className="ml-2 md:ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm text-center md:text-start font-medium text-gray-500 truncate">Approved</dt>
                    <dd className="text-lg text-center md:text-start font-semibold text-gray-900">{stats.approved}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <IndianRupee className="h-6 w-6 text-blue-400" />
                </div>
                <div className="ml-2 md:ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm text-center md:text-start font-medium text-gray-500 truncate">Outstanding</dt>
                    <dd className="text-lg text-center md:text-start font-semibold text-gray-900">
                      ₹{stats.totalAmount.toFixed(2)}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white shadow rounded-lg w-full overflow-hidden">
          <div className="p-4 border-b border-gray-200">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex-1 w-full sm:min-w-0">
                <div className="relative rounded-md shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md"
                    placeholder="Search by employee name or code..."
                  />
                </div>
              </div>

              <div className="w-full sm:w-auto">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as AdvanceStatus | 'all')}
                  className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                >
                  <option value="all">All Status</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                  <option value="rejected">Rejected</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
            </div>
          </div>

          {/* Desktop Table View */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Employee
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Installments
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  {/* <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Requested By
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Reviewed By
                  </th> */}
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Request Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Balance
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {isLoading ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center text-sm text-gray-500">
                      Loading advances...
                    </td>
                  </tr>
                ) : filteredAdvances.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center text-sm text-gray-500">
                      No advances found
                    </td>
                  </tr>
                ) : (
                  paginatedAdvances.map((advance) => (
                    <tr key={advance.id} className="hover:bg-gray-50">
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {advance.employee?.name || 'Unknown'}
                        </div>
                        <div className="text-sm text-gray-500">
                          {advance.employee?.employee_code || advance.employee?.email}
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          ₹{(advance.approved_amount || advance.requested_amount).toLocaleString('en-GB')}
                        </div>
                        {advance.requested_interest_rate > 0 && (
                          <div className="text-xs text-gray-500">
                            @ {advance.requested_interest_rate}% interest
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                        {advance.approved_installments || advance.requested_installments} months
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        {getStatusBadge(advance.status)}
                      </td>
                      {/* <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                        {advance.requestedByName || '-'}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                        {advance.approvedByName || '-'}
                      </td> */}
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(advance.request_date).toLocaleDateString('en-GB')}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          ₹{advance.remaining_balance.toFixed(2)}
                        </div>
                        {advance.total_amount > 0 && (
                          <div className="text-xs text-gray-500">
                            of ₹{advance.total_amount.toFixed(2)}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => setSelectedAdvance(advance)}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="block lg:hidden bg-gray-50 p-4 space-y-4">
            {isLoading ? (
              <div className="p-8 text-center text-sm text-gray-500 bg-white rounded-lg shadow-sm border border-gray-200">Loading advances...</div>
            ) : filteredAdvances.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-500 bg-white rounded-lg shadow-sm border border-gray-200">No advances found</div>
            ) : (
              paginatedAdvances.map((advance) => (
                <div key={advance.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 space-y-4 transition-shadow hover:shadow-md">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{advance.employee?.name || 'Unknown'}</div>
                      <div className="text-xs text-gray-500">{advance.employee?.employee_code || advance.employee?.email}</div>
                    </div>
                    <div>
                      {getStatusBadge(advance.status)}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500 text-xs block mb-1">Amount</span>
                      <div className="font-medium text-gray-900">
                        ₹{(advance.approved_amount || advance.requested_amount).toLocaleString('en-GB')}
                        {advance.requested_interest_rate > 0 && (
                          <span className="text-xs text-gray-500 block">@ {advance.requested_interest_rate}%</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <span className="text-gray-500 text-xs block mb-1">Balance</span>
                      <div className="font-medium text-gray-900">
                        ₹{advance.remaining_balance.toFixed(2)}
                        {advance.total_amount > 0 && (
                          <span className="text-xs text-gray-500 block">of ₹{advance.total_amount.toFixed(2)}</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <span className="text-gray-500 text-xs block mb-1">Request Date</span>
                      <div className="text-gray-900">
                        {new Date(advance.request_date).toLocaleDateString('en-GB')}
                      </div>
                    </div>
                    <div>
                      <span className="text-gray-500 text-xs block mb-1">Installments</span>
                      <div className="text-gray-900">
                        {advance.approved_installments || advance.requested_installments} months
                      </div>
                    </div>
                    <div>
                      <span className="text-gray-500 text-xs block mb-1">Requested By</span>
                      <div className="text-gray-900 truncate">
                        {advance.requestedByName || '-'}
                      </div>
                    </div>
                    <div>
                      <span className="text-gray-500 text-xs block mb-1">Reviewed By</span>
                      <div className="text-gray-900 truncate">
                        {advance.approvedByName || '-'}
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 flex justify-end border-t border-gray-100">
                    <button
                      onClick={() => setSelectedAdvance(advance)}
                      className="text-blue-600 hover:text-blue-900 text-sm font-medium px-3 py-1.5 rounded hover:bg-blue-50 transition-colors"
                    >
                      View Details
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 pb-4 px-4 sm:px-6 bg-gray-50 border-t border-gray-200 rounded-b-lg shadow-sm">
              <div className="text-xs sm:text-sm text-gray-600 font-medium text-center sm:text-left w-full sm:w-auto">
                Showing{' '}
                <span className="font-semibold text-gray-900">
                  {filteredAdvances.length === 0 ? 0 : Math.min(filteredAdvances.length, (currentPage - 1) * itemsPerPage + 1)}
                </span>{' '}
                to{' '}
                <span className="font-semibold text-gray-900">
                  {Math.min(filteredAdvances.length, currentPage * itemsPerPage)}
                </span>{' '}
                of{' '}
                <span className="font-semibold text-gray-900">{filteredAdvances.length}</span>{' '}
                requests
              </div>
              <div className="flex flex-wrap justify-center sm:justify-end items-center gap-1.5 w-full sm:w-auto">
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
      </div>

      {selectedAdvance && (
        <AdvanceDetailsModal
          advance={selectedAdvance}
          isOpen={!!selectedAdvance}
          onClose={() => setSelectedAdvance(null)}
          onUpdate={() => {
            fetchAdvances();
            setSelectedAdvance(null);
          }}
        />
      )}
    </div>
  );
}
