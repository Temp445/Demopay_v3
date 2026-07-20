import React, { useState, useEffect } from 'react';
import { Plus, Search, Filter, Clock, CheckCircle, XCircle, Ban, MapPin, Activity, PauseCircle } from 'lucide-react';
import { useGatePassesStore } from '../../../stores/gatePassesStore';
import { format } from 'date-fns';
import CreateGatePassModal from './CreateGatePassModal';
import GatePassDetailsModal from './GatePassDetailsModal';
import type { GatePassRequest, GatePassStatus } from '../../../types/gatePasses';
import { useRoleAccess } from '../../../hooks/useRoleAccess';
import { useEmployeesStore } from '../../../stores/employeesStore';
import { useLocationSettingsStore } from '../../../stores/locationSettingsStore';
import { useTenant } from '../../../contexts/TenantContext';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';

export default function GatePassesPage() {
  const { currentTenant } = useTenant();
  const { user } = useAuth();
  const { items: gatePasses, loading, error, fetchGatePasses, fetchStatistics, statistics } = useGatePassesStore();
  
  const { access, employeeId, loading: roleLoading, role } = useRoleAccess();
  const { items: employees, fetchEmployees } = useEmployeesStore();

  const isVisibleToApprover = React.useCallback((gatePass: GatePassRequest) => {
    const requestingEmployee = gatePass.employee_id ? employees.find(emp => emp.id === gatePass.employee_id) : null;
    
    if (requestingEmployee && requestingEmployee.reporting_to) {
      const reportingToArray = Array.isArray(requestingEmployee.reporting_to)
        ? requestingEmployee.reporting_to
        : [requestingEmployee.reporting_to];

      const matchesEmployeeId = employeeId && reportingToArray.includes(employeeId);
      const matchesUserId = user && reportingToArray.includes(user.id);

      if (matchesEmployeeId || matchesUserId) {
        return true;
      }
    }

    return false;
  }, [employees, employeeId, user]);

  const { fetchSettings: fetchLocationSettings, initialized: locationSettingsInitialized } = useLocationSettingsStore();

  const [statusFilter, setStatusFilter] = useState<GatePassStatus | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedGatePass, setSelectedGatePass] = useState<GatePassRequest | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);

  useEffect(() => {
    if (roleLoading) return;

    const listFilters: any = { status: statusFilter };
    const statsFilters: any = {};

    if (access.restrictedToOwnData) {
      if (employeeId) {
        listFilters.employee_id = employeeId;
        statsFilters.employee_id = employeeId;
      } else {
        return;
      }
    }

    fetchGatePasses(listFilters);
    fetchStatistics(statsFilters);
    fetchEmployees();

    if (currentTenant?.id && !locationSettingsInitialized) {
      fetchLocationSettings(currentTenant.id);
    }
  }, [roleLoading, statusFilter, fetchGatePasses, fetchStatistics, fetchEmployees, access.restrictedToOwnData, employeeId, currentTenant?.id, locationSettingsInitialized]);

  // Real-time synchronization
  useEffect(() => {
    if (!currentTenant?.id) return;

    const channel = supabase
      .channel('gate-passes-sync')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'gate_pass_requests',
        filter: `tenant_id=eq.${currentTenant.id}`,
      }, () => {
        const listFilters: any = { status: statusFilter };
        if (access.restrictedToOwnData && employeeId) listFilters.employee_id = employeeId;
        fetchGatePasses(listFilters);
        fetchStatistics(listFilters);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentTenant?.id, statusFilter, employeeId, access.restrictedToOwnData, fetchGatePasses, fetchStatistics]);

  const [requestTarget, setRequestTarget] = useState<'own' | 'employee'>('employee');
  const isReportingHead = role === 'Reporting Head';

  const filteredGatePasses = gatePasses.filter(gatePass => {
    const isOwner = gatePass.employee_id === employeeId;
    const isAdminOrHR = role === 'Admin' || role === 'HR Team';
    
    if (isReportingHead) {
      if (requestTarget === 'own' && !isOwner) return false;
      if (requestTarget === 'employee' && isOwner) return false;
    }

    if (!isOwner) {
      if (gatePass.status === 'pending') {
        // Pending requests: 
        // ONLY Reporting head can see it (if not owner), UNLESS Admin/HR created it themselves
        if (isAdminOrHR && user?.id && gatePass.requested_by === user.id) {
          // allow because this admin/HR user created the request on behalf of the employee
        } else if (!isVisibleToApprover(gatePass)) {
          return false;
        }
      } else {
        // Non-pending (processed):
        // 1. Admin/HR can see all processed requests
        // 2. Reporting head can see if they are the approver or subordinate
        if (isAdminOrHR) {
          // allow
        } else if (!isVisibleToApprover(gatePass) && gatePass.approval?.approver_id !== user?.id) {
          return false;
        }
      }
    }

    const matchesSearch = !searchTerm ||
      gatePass.employee?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      gatePass.employee?.employee_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      gatePass.reason.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'approved': return 'bg-green-100 text-green-800';
      case 'assigned': return 'bg-blue-100 text-blue-800';
      case 'in_progress': return 'bg-orange-100 text-orange-800';
      case 'paused': return 'bg-amber-100 text-amber-800';
      case 'completed': return 'bg-emerald-100 text-emerald-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      case 'cancelled': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const handleCreateSuccess = () => {
    setIsCreateModalOpen(false);
    refreshData();
  };

  const handleDetailsClose = () => {
    setIsDetailsModalOpen(false);
    setSelectedGatePass(null);
    refreshData();
  };

  const refreshData = () => {
    const listFilters: any = { status: statusFilter };
    const statsFilters: any = {};
    if (access.restrictedToOwnData && employeeId) {
      listFilters.employee_id = employeeId;
      statsFilters.employee_id = employeeId;
    }
    fetchGatePasses(listFilters);
    fetchStatistics(statsFilters);
  };

  const formatDateTime = (date: string, time: string) => {
    try {
      const dateTime = new Date(`${date}T${time}`);
      return format(dateTime, 'MMM dd, yyyy hh:mm a');
    } catch (error) {
      return `${date} ${time}`;
    }
  };

  if (roleLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="xl:py-6">
      <div className="max-w-7xl mx-auto px-2 sm:px-6 md:px-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Gate Passes</h1>
            <p className="mt-1 text-sm text-gray-500">
              Manage employee gate pass requests and approvals
            </p>
          </div>
          <div className="mt-4 md:mt-0">
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Gate Pass
            </button>
          </div>
        </div>

        {statistics && (
          <div className="mt-6 grid grid-cols-2 gap-3 md:gap-5 sm:grid-cols-4 lg:grid-cols-8">
            <div className="bg-white overflow-hidden shadow rounded-lg p-4">
              <div className="flex items-center">
                <div className="flex-shrink-0"><Clock className="h-5 w-5 text-gray-400" /></div>
                <div className="ml-3 w-0 flex-1">
                  <dt className="text-xs font-medium text-gray-500 truncate">Total</dt>
                  <dd className="text-lg font-semibold text-gray-900">{statistics.total}</dd>
                </div>
              </div>
            </div>
            <div className="bg-white overflow-hidden shadow rounded-lg p-4">
              <div className="flex items-center">
                <div className="flex-shrink-0"><Clock className="h-5 w-5 text-yellow-400" /></div>
                <div className="ml-3 w-0 flex-1">
                  <dt className="text-xs font-medium text-gray-500 truncate">Pending</dt>
                  <dd className="text-lg font-semibold text-gray-900">{statistics.pending}</dd>
                </div>
              </div>
            </div>
            <div className="bg-white overflow-hidden shadow rounded-lg p-4">
              <div className="flex items-center">
                <div className="flex-shrink-0"><MapPin className="h-5 w-5 text-blue-400" /></div>
                <div className="ml-3 w-0 flex-1">
                  <dt className="text-xs font-medium text-gray-500 truncate">Assigned</dt>
                  <dd className="text-lg font-semibold text-gray-900">{statistics.assigned}</dd>
                </div>
              </div>
            </div>
            <div className="bg-white overflow-hidden shadow rounded-lg p-4">
              <div className="flex items-center">
                <div className="flex-shrink-0"><Activity className="h-5 w-5 text-orange-400" /></div>
                <div className="ml-3 w-0 flex-1">
                  <dt className="text-xs font-medium text-gray-500 truncate">Active</dt>
                  <dd className="text-lg font-semibold text-gray-900">{((statistics as any).in_progress || 0)}</dd>
                </div>
              </div>
            </div>
            <div className="bg-white overflow-hidden shadow rounded-lg p-4">
              <div className="flex items-center">
                <div className="flex-shrink-0"><PauseCircle className="h-5 w-5 text-amber-400" /></div>
                <div className="ml-3 w-0 flex-1">
                  <dt className="text-xs font-medium text-gray-500 truncate">Paused</dt>
                  <dd className="text-lg font-semibold text-gray-900">{((statistics as any).paused || 0)}</dd>
                </div>
              </div>
            </div>
            <div className="bg-white overflow-hidden shadow rounded-lg p-4">
              <div className="flex items-center">
                <div className="flex-shrink-0"><CheckCircle className="h-5 w-5 text-emerald-400" /></div>
                <div className="ml-3 w-0 flex-1">
                  <dt className="text-xs font-medium text-gray-500 truncate">Completed</dt>
                  <dd className="text-lg font-semibold text-gray-900">{((statistics as any).completed || 0)}</dd>
                </div>
              </div>
            </div>
            <div className="bg-white overflow-hidden shadow rounded-lg p-4">
              <div className="flex items-center">
                <div className="flex-shrink-0"><XCircle className="h-5 w-5 text-red-400" /></div>
                <div className="ml-3 w-0 flex-1">
                  <dt className="text-xs font-medium text-gray-500 truncate">Rejected</dt>
                  <dd className="text-lg font-semibold text-gray-900">{statistics.rejected}</dd>
                </div>
              </div>
            </div>
            <div className="bg-white overflow-hidden shadow rounded-lg p-4">
              <div className="flex items-center">
                <div className="flex-shrink-0"><Ban className="h-5 w-5 text-gray-400" /></div>
                <div className="ml-3 w-0 flex-1">
                  <dt className="text-xs font-medium text-gray-500 truncate">Cancelled</dt>
                  <dd className="text-lg font-semibold text-gray-900">{statistics.cancelled}</dd>
                </div>
              </div>
            </div>
          </div>
        )}


        {isReportingHead && (
              <div className="mt-4 flex rounded-md shadow-sm w-fit">
                <button
                  onClick={() => setRequestTarget('employee')}
                  className={`px-4 py-2 text-sm font-medium border border-gray-200 rounded-l-lg ${
                    requestTarget === 'employee' ? 'bg-indigo-50 text-indigo-600 z-10 border-indigo-200' : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Team Requests
                </button>
                <button
                  onClick={() => setRequestTarget('own')}
                  className={`px-4 py-2 text-sm font-medium border border-gray-200 border-l-0 rounded-r-lg ${
                    requestTarget === 'own' ? 'bg-indigo-50 text-indigo-600 z-10 border-indigo-200' : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Own Requests
                </button>
              </div>
            )}

        <div className="mt-4 bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="relative rounded-md shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md"
                    placeholder="Search by employee, code, or reason..."
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Filter className="h-5 w-5 text-gray-400" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                >
                  <option value="all">All Status</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="assigned">Assigned</option>
                  <option value="in_progress">In Progress</option>
                  <option value="paused">Paused</option>
                  <option value="completed">Completed</option>
                  <option value="rejected">Rejected</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            </div>

            {error && (
              <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}

            {loading ? (
              <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
              </div>
            ) : filteredGatePasses.length === 0 ? (
              <div className="text-center py-12">
                <Clock className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No gate passes found</h3>
                <p className="mt-1 text-sm text-gray-500">
                  {searchTerm || statusFilter !== 'all'
                    ? 'Try changing your search or filter.'
                    : 'Get started by creating a new gate pass.'}
                </p>
              </div>
            ) : (
              <div className="mt-6 overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Employee</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Start</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">End</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reason</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredGatePasses.map((gatePass) => (
                      <tr key={gatePass.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex flex-col">
                            <div className="text-sm font-medium text-gray-900 flex items-center gap-2">
                              {gatePass.employee?.name}
                              {gatePass.gate_pass_type === 'paid' && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-800">Paid</span>
                              )}
                            </div>
                            <div className="text-sm text-gray-500">
                              {gatePass.employee?.employee_code}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {formatDateTime(gatePass.start_date, gatePass.start_time)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {formatDateTime(gatePass.end_date, gatePass.end_time)}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                          {gatePass.reason}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full border ${getStatusBadgeColor(gatePass.status)}`}>
                            {gatePass.status.replace('_', ' ').toUpperCase()}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <button onClick={() => { setSelectedGatePass(gatePass); setIsDetailsModalOpen(true); }} className="text-indigo-600 hover:text-indigo-900" title="View General Details">
                            Details
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      <CreateGatePassModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} onSuccess={handleCreateSuccess} />
      
      {selectedGatePass && isDetailsModalOpen && (
        <GatePassDetailsModal 
          gatePass={selectedGatePass} 
          isOpen={isDetailsModalOpen} 
          onClose={handleDetailsClose} 
          onUpdate={handleDetailsClose} 
        />
      )}
    </div>
  );
}