import React, { useEffect, useState, useRef, useMemo } from 'react';
import { CheckCircle, XCircle, Edit, Filter, Calendar, RefreshCw, X, AlertTriangle, Search, RotateCcw, Trash2 } from 'lucide-react';
import { useOTApprovalsStore } from '../../../stores/otApprovalsStore';
import { supabase } from '../../../lib/supabase';
import { getTenantId } from '../../../lib/tenantDb';
import toast from 'react-hot-toast';
import type { OTApprovalRecord } from '../../../types/overtime';
import OTSyncModal from './OTSyncModal';

/** Smart OT duration formatter:
 * < 60 mins  → "10 mins"
 * >= 60 mins  → "1h 30m"  or  "2h" (omits 0 minutes)
 */
function formatOTDuration(hours: number): string {
  const totalMins = Math.round(hours * 60);
  if (totalMins < 60) return `${totalMins} mins`;
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Mirrors the DB apply_overtime_rounding function in the frontend */
function applyOTRounding(mins: number, interval: number, method: string): number {
  if (mins <= 0) return 0;
  const quotient = Math.floor(mins / interval);
  const remainder = mins % interval;
  if (method === 'nearest') return remainder >= interval / 2 ? (quotient + 1) * interval : quotient * interval;
  if (method === 'midpoint') return remainder > interval / 2 ? (quotient + 1) * interval : quotient * interval;
  return quotient * interval; // 'start' — always round down
}

/** Parses "5:50" or "350" into total minutes */
function parseTimeToMinutes(input: string): number {
  if (!input) return 0;
  if (input.includes(':')) {
    const [h, m] = input.split(':').map(val => parseInt(val, 10) || 0);
    return (h * 60) + m;
  }
  return parseInt(input, 10) || 0;
}

/** Formats 350 into "05:50" */
function formatMinutesToTime(totalMins: number): string {
  const h = Math.floor(Math.max(0, totalMins) / 60);
  const m = Math.round(Math.max(0, totalMins) % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export default function OTTimeStamp() {
  const { approvals, loading, fetchApprovals, approveOT, approveMultiple, rejectOT, revokeOT, editOTHours, deleteOT, syncOT } = useOTApprovalsStore();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false); // Added suggestion state
  const searchContainerRef = useRef<HTMLDivElement>(null); // Added ref for click-outside
  const [selectedApprovals, setSelectedApprovals] = useState<string[]>([]);
  const [editingApproval, setEditingApproval] = useState<OTApprovalRecord | null>(null);
  const [correctedHours, setCorrectedHours] = useState('');
  const [modificationReason, setModificationReason] = useState('');

  // Sync OT state
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);

  // Rejection modal state
  const [rejectingApprovalId, setRejectingApprovalId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // Revocation modal state
  const [revokingApprovalId, setRevokingApprovalId] = useState<string | null>(null);
  const [revocationReason, setRevocationReason] = useState('');

  // OT system master toggle
  const [isOTEnabled, setIsOTEnabled] = useState<boolean | null>(null);

  // OT settings loaded when edit modal opens
  const [otSettings, setOtSettings] = useState<{
    threshold: number;
    roundingInterval: number;
    roundingMethod: string;
  } | null>(null);

  useEffect(() => {
    import('../../../lib/overtime').then(({ getGlobalOvertimeConfig }) => {
      getGlobalOvertimeConfig().then(config => {
        if (config) setIsOTEnabled(config.enabled);
      }).catch(console.error);
    });
  }, []);

  useEffect(() => {
    // Format date in local timezone to prevent UTC day-shift bugs
    const formatDateLocal = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    setStartDate(formatDateLocal(firstDay));
    setEndDate(formatDateLocal(lastDay));
  }, []);

  useEffect(() => {
    if (startDate && endDate) {
      fetchApprovals(startDate, endDate, statusFilter);
    }
  }, [startDate, endDate, statusFilter, fetchApprovals]);

  // Handle clicking outside the search suggestions
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Extract unique employees from the approvals list for suggestions
  const uniqueEmployees = useMemo(() => {
    const map = new Map<string, { name: string; code: string }>();
    approvals.forEach((a) => {
      if (!map.has(a.employeeCode)) {
        map.set(a.employeeCode, { name: a.employeeName, code: a.employeeCode });
      }
    });
    return Array.from(map.values());
  }, [approvals]);

  // Filter suggestions based on search term
  const suggestions = useMemo(() => {
    if (!searchTerm) return [];
    const lowerSearch = searchTerm.toLowerCase();
    return uniqueEmployees.filter(
      (emp) =>
        emp.name.toLowerCase().includes(lowerSearch) ||
        emp.code.toLowerCase().includes(lowerSearch)
    );
  }, [searchTerm, uniqueEmployees]);

  // Derived state: Filter approvals by search term
  const filteredApprovals = approvals.filter((approval) => {
    if (!searchTerm) return true;
    const lowerSearch = searchTerm.toLowerCase();
    return (
      approval.employeeName.toLowerCase().includes(lowerSearch) ||
      approval.employeeCode.toLowerCase().includes(lowerSearch)
    );
  });

  const pendingFilteredApprovals = filteredApprovals.filter(a => a.approvalStatus === 'pending');

  const handleApprove = async (approvalId: string) => {
    try {
      await approveOT(approvalId);
      toast.success('OT approved');
    } catch (error) {
      toast.error('Failed to approve');
      console.error(error);
    }
  };

  const handleBulkApprove = async () => {
    if (selectedApprovals.length === 0) {
      toast.error('Please select approvals first');
      return;
    }

    try {
      await approveMultiple(selectedApprovals);
      toast.success(`Approved ${selectedApprovals.length} OT records`);
      setSelectedApprovals([]);
    } catch (error) {
      toast.error('Failed to bulk approve');
      console.error(error);
    }
  };

  const handleReject = (approvalId: string) => {
    setRejectingApprovalId(approvalId);
    setRejectionReason('');
  };

  const confirmReject = async () => {
    if (!rejectingApprovalId) return;
    if (!rejectionReason.trim()) {
      toast.error('Please enter a rejection reason');
      return;
    }
    try {
      await rejectOT(rejectingApprovalId, rejectionReason.trim());
      toast.success('OT rejected');
      setRejectingApprovalId(null);
      setRejectionReason('');
    } catch (error) {
      toast.error('Failed to reject');
      console.error(error);
    }
  };

  const handleRevoke = (approvalId: string) => {
    setRevokingApprovalId(approvalId);
    setRevocationReason('');
  };

  const confirmRevoke = async () => {
    if (!revokingApprovalId) return;
    if (!revocationReason.trim()) {
      toast.error('Please enter a reason for revoking');
      return;
    }
    try {
      await revokeOT(revokingApprovalId, revocationReason.trim());
      toast.success('OT revoked and set to pending');
      setRevokingApprovalId(null);
      setRevocationReason('');
    } catch (error) {
      toast.error('Failed to revoke');
      console.error(error);
    }
  };

  const openEditModal = async (approval: OTApprovalRecord) => {
    setEditingApproval(approval);
    const hoursToEdit = approval.correctedOTHours ?? approval.originalOTHours;
    const totalMins = Math.round(hoursToEdit * 60);
    setCorrectedHours(formatMinutesToTime(totalMins));
    setModificationReason(approval.modificationReason || '');
    setOtSettings(null);

    try {
      const tenantId = await getTenantId();
      const { data } = await supabase
        .from('company_settings')
        .select('overtime_threshold_minutes, overtime_rounding_interval, overtime_rounding_method')
        .eq('tenant_id', tenantId)
        .maybeSingle();
      setOtSettings({
        threshold: data?.overtime_threshold_minutes ?? 30,
        roundingInterval: data?.overtime_rounding_interval ?? 30,
        roundingMethod: data?.overtime_rounding_method ?? 'nearest',
      });
    } catch (e) {
      console.error('Failed to load OT settings:', e);
      setOtSettings({ threshold: 0, roundingInterval: 1, roundingMethod: 'nearest' });
    }
  };

  const handleSaveEdit = async () => {
    if (!editingApproval) return;

    const inputMins = parseTimeToMinutes(correctedHours);
    if (isNaN(inputMins) || inputMins < 0) {
      toast.error('Please enter a valid time (e.g. 5:50 or 350)');
      return;
    }

    if (otSettings && inputMins < otSettings.threshold) {
      toast.error(`Cannot save: ${inputMins} mins is below the ${otSettings.threshold} min threshold`);
      return;
    }

    if (!modificationReason.trim()) {
      toast.error('Modification reason is required');
      return;
    }

    const finalMins = otSettings
      ? applyOTRounding(inputMins, otSettings.roundingInterval, otSettings.roundingMethod)
      : inputMins;
    const hours = parseFloat((finalMins / 60).toFixed(4));

    try {
      await editOTHours(editingApproval.id, hours, modificationReason);
      toast.success(`OT updated to ${formatOTDuration(hours)}`);
      setEditingApproval(null);
      setCorrectedHours('');
      setModificationReason('');
      setOtSettings(null);
    } catch (error) {
      toast.error('Failed to update');
      console.error(error);
    }
  };
  
  const handleDelete = async (approval: OTApprovalRecord) => {
    if (!window.confirm(`Are you sure you want to delete the OT record for ${approval.employeeName} on ${new Date(approval.attendanceDate + 'T00:00:00').toLocaleDateString()}?`)) {
      return;
    }

    try {
      await deleteOT(approval.id);
      toast.success('OT record deleted');
    } catch (error) {
      toast.error('Failed to delete OT record');
      console.error(error);
    }
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedApprovals(pendingFilteredApprovals.map(a => a.id));
    } else {
      setSelectedApprovals([]);
    }
  };

  const handleSelectOne = (approvalId: string) => {
    setSelectedApprovals(prev =>
      prev.includes(approvalId)
        ? prev.filter(id => id !== approvalId)
        : [...prev, approvalId]
    );
  };

  const handleSyncOT = () => {
    if (!startDate || !endDate) {
      toast.error('Please set a date range before syncing');
      return;
    }
    setIsSyncModalOpen(true);
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <CheckCircle className="h-6 w-6" />
          OT Time Stamp Management
        </h1>
        <button
          onClick={() => setIsSyncModalOpen(true)}
          disabled={!startDate || !endDate || isOTEnabled === false}
          title={isOTEnabled === false ? 'Overtime feature is disabled in Settings' : ''}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
         Manual OT Sync
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow mb-6 p-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Calendar className="h-4 w-4 inline mr-1" />
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Filter className="h-4 w-4 inline mr-1" />
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          <div ref={searchContainerRef} className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Search className="h-4 w-4 inline mr-1" />
              Search Employee
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              placeholder="Name or Code..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            
            {/* Auto-suggestions Dropdown */}
            {showSuggestions && searchTerm && suggestions.length > 0 && (
              <ul className="absolute z-10 w-full mt-1 bg-white border border-gray-200 shadow-lg max-h-60 rounded-md py-1 overflow-auto text-sm">
                {suggestions.map((emp) => (
                  <li
                    key={emp.code}
                    onClick={() => {
                      setSearchTerm(emp.name);
                      setShowSuggestions(false);
                    }}
                    className="cursor-pointer px-3 py-2 hover:bg-indigo-50 transition-colors border-b border-gray-50 last:border-0"
                  >
                    <div className="font-medium text-gray-900">{emp.name}</div>
                    <div className="text-xs text-gray-500">{emp.code}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex items-end">
            <button
              onClick={handleBulkApprove}
              disabled={selectedApprovals.length === 0}
              className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <CheckCircle className="h-4 w-4" />
              Approve Selected ({selectedApprovals.length})
            </button>
          </div>
        </div>
      </div>

      {/* Approvals Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left">
                <input
                  type="checkbox"
                  onChange={handleSelectAll}
                  checked={
                    selectedApprovals.length > 0 && 
                    pendingFilteredApprovals.length > 0 && 
                    selectedApprovals.length === pendingFilteredApprovals.length
                  }
                  className="rounded"
                />
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Original Hours</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Corrected Hours</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Clock In</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Clock Out</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredApprovals.map((approval) => (
              <tr key={approval.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  {approval.approvalStatus === 'pending' && (
                    <input
                      type="checkbox"
                      checked={selectedApprovals.includes(approval.id)}
                      onChange={() => handleSelectOne(approval.id)}
                      className="rounded"
                    />
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">{approval.employeeName}</div>
                  <div className="text-sm text-gray-500">{approval.employeeCode}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {new Date(approval.attendanceDate + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'numeric', year: 'numeric' })}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {formatOTDuration(approval.originalOTHours)}
                </td>
                <td className="px-6 py-4 max-w-[200px] whitespace-normal">
                  {approval.correctedOTHours !== null && approval.correctedOTHours !== undefined ? (
                    <div>
                      <div className="text-sm font-medium text-blue-600">
                        {formatOTDuration(approval.correctedOTHours!)}
                      </div>
                      {approval.modificationReason && (
                        <div 
                          className="text-xs text-gray-500 mt-0.5 line-clamp-2"
                          title={approval.modificationReason}
                        >
                          {approval.modificationReason}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="text-sm text-gray-400">-</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    approval.approvalStatus === 'approved' ? 'bg-green-100 text-green-800' :
                    approval.approvalStatus === 'rejected' ? 'bg-red-100 text-red-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {approval.approvalStatus}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {approval.clockIn ? (
                    <div className="text-sm text-gray-900 font-mono">
                      {new Date(approval.clockIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  ) : (
                    <span className="text-sm text-gray-400">—</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {approval.clockOut ? (
                    <div className="text-sm text-gray-900 font-mono">
                      {new Date(approval.clockOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  ) : (
                    <span className="text-sm text-gray-400">—</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                  {approval.approvalStatus === 'pending' && (
                    <>
                      <button
                        onClick={() => openEditModal(approval)}
                        className="text-blue-600 hover:text-blue-900"
                        title="Edit Hours"
                      >
                        <Edit className="h-4 w-4 inline" />
                      </button>
                      <button
                        onClick={() => handleApprove(approval.id)}
                        className="text-green-600 hover:text-green-900"
                        title="Approve"
                      >
                        <CheckCircle className="h-4 w-4 inline" />
                      </button>
                      <button
                        onClick={() => handleReject(approval.id)}
                        className="text-red-600 hover:text-red-900"
                        title="Reject"
                      >
                        <XCircle className="h-4 w-4 inline" />
                      </button>
                      <button
                        onClick={() => handleDelete(approval)}
                        className="text-red-500 hover:text-red-700"
                        title="Delete Record"
                      >
                        <Trash2 className="h-4 w-4 inline" />
                      </button>
                    </>
                  )}
                  {approval.approvalStatus !== 'pending' && (
                    <button
                      onClick={() => handleRevoke(approval.id)}
                      className="text-amber-600 hover:text-amber-900"
                      title="Revoke (Set to Pending)"
                    >
                      <RotateCcw className="h-4 w-4 inline" />
                    </button>
                  )}
                  {approval.approvalStatus === 'approved' && approval.approvedByName && (
                    <span className="text-xs text-gray-500">
                      by {approval.approvedByName}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {loading ? (
          <div className="flex items-center justify-center py-16 gap-3 text-gray-400">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
            <span className="text-sm">Loading...</span>
          </div>
        ) : filteredApprovals.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            No OT approvals found for the selected filters
          </div>
        ) : null}
      </div>

      {/* Edit Modal */}
      {editingApproval && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full">
            <h3 className="text-lg font-semibold mb-4">Edit OT Hours</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Employee
                </label>
                <div className="text-sm text-gray-900">{editingApproval.employeeName}</div>
                <div className="text-sm text-gray-500">
                  {new Date(editingApproval.attendanceDate + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'numeric', year: 'numeric' })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Original OT
                  </label>
                  <input
                    type="text"
                    value={formatOTDuration(editingApproval.originalOTHours)}
                    disabled
                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-700"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Corrected OT (HH:MM or mins) *
                  </label>
                  <input
                    type="text"
                    value={correctedHours}
                    onChange={(e) => setCorrectedHours(e.target.value)}
                    className={`w-full px-3 py-2 border rounded-md font-mono ${
                      correctedHours && otSettings && parseTimeToMinutes(correctedHours) < otSettings.threshold
                        ? 'border-red-400 bg-red-50 focus:ring-red-300'
                        : 'border-gray-300 focus:ring-indigo-200'
                    }`}
                    placeholder="e.g. 05:50 or 350"
                  />

                  {/* Live smart feedback */}
                  {correctedHours && (() => {
                    const inputMins = parseTimeToMinutes(correctedHours);
                    if (!otSettings) return <p className="text-xs text-gray-400 mt-1">Loading settings...</p>;

                    if (inputMins < otSettings.threshold) {
                      return (
                        <div className="flex items-center gap-1 mt-1 text-red-600">
                          <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                          <span className="text-xs">
                            {inputMins} mins ({formatMinutesToTime(inputMins)}) is below the <strong>{otSettings.threshold} min</strong> threshold.
                          </span>
                        </div>
                      );
                    }

                    const rounded = applyOTRounding(inputMins, otSettings.roundingInterval, otSettings.roundingMethod);
                    const changed = rounded !== inputMins;
                    return (
                      <div className="mt-1 space-y-0.5">
                        {changed ? (
                          <div className="flex items-center gap-1 text-amber-600">
                            <span className="text-xs">⟳ Rounded {inputMins} → <strong>{rounded} mins</strong> ({formatOTDuration(rounded / 60)})</span>
                          </div>
                        ) : (
                          <p className="text-xs text-green-600">✓ {inputMins} mins → {formatOTDuration(inputMins / 60)} (no rounding needed)</p>
                        )}
                        <p className="text-xs text-gray-400">Interval: {otSettings.roundingInterval} min · Method: {otSettings.roundingMethod}</p>
                      </div>
                    );
                  })()}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Modification Reason *
                </label>
                <textarea
                  value={modificationReason}
                  onChange={(e) => setModificationReason(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md h-24"
                  placeholder="Enter reason for modification..."
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => {
                  setEditingApproval(null);
                  setCorrectedHours('');
                  setModificationReason('');
                  setOtSettings(null);
                }}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={!!(correctedHours && otSettings && parseInt(correctedHours) < otSettings.threshold)}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OTSyncModal Integration */}
      <OTSyncModal 
        isOpen={isSyncModalOpen} 
        onClose={() => setIsSyncModalOpen(false)} 
        startDate={startDate}
        endDate={endDate}
      />

      {/* Rejection Reason Modal */}
      {rejectingApprovalId && (() => {
        const rejectingRecord = approvals.find(a => a.id === rejectingApprovalId);
        return (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4">
              {/* Modal Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                <div className="flex items-center gap-2">
                  <XCircle className="h-5 w-5 text-red-500" />
                  <h3 className="text-base font-semibold text-gray-900">Reject OT Request</h3>
                </div>
                <button
                  onClick={() => { setRejectingApprovalId(null); setRejectionReason(''); }}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Employee Info */}
              {rejectingRecord && (
                <div className="px-6 py-4 bg-red-50 border-b border-red-100">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-red-100 flex items-center justify-center">
                      <span className="text-sm font-bold text-red-600">
                        {rejectingRecord.employeeName.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-gray-900">{rejectingRecord.employeeName}</div>
                      <div className="text-xs text-gray-500">
                        {rejectingRecord.employeeCode} &bull; {new Date(rejectingRecord.attendanceDate + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'numeric', year: 'numeric' })} &bull; {formatOTDuration(rejectingRecord.originalOTHours)} OT
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Reason Input */}
              <div className="px-6 py-5">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Rejection Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  rows={4}
                  autoFocus
                  placeholder="e.g. Overtime was not pre-approved by supervisor..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent resize-none"
                />
                <p className="mt-1 text-xs text-gray-400">This reason will be recorded and visible to HR.</p>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
                <button
                  onClick={() => { setRejectingApprovalId(null); setRejectionReason(''); }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmReject}
                  disabled={!rejectionReason.trim()}
                  className="flex-1 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  <XCircle className="h-4 w-4" />
                  Confirm Rejection
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Revocation Reason Modal */}
      {revokingApprovalId && (() => {
        const revokingRecord = approvals.find(a => a.id === revokingApprovalId);
        return (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4">
              {/* Modal Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                <div className="flex items-center gap-2">
                  <RotateCcw className="h-5 w-5 text-amber-500" />
                  <h3 className="text-base font-semibold text-gray-900">Revoke Approval/Rejection</h3>
                </div>
                <button
                  onClick={() => { setRevokingApprovalId(null); setRevocationReason(''); }}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Employee Info */}
              {revokingRecord && (
                <div className="px-6 py-4 bg-amber-50 border-b border-amber-100">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-amber-100 flex items-center justify-center">
                      <span className="text-sm font-bold text-amber-600">
                        {revokingRecord.employeeName.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-gray-900">{revokingRecord.employeeName}</div>
                      <div className="text-xs text-gray-500">
                        {revokingRecord.employeeCode} &bull; {new Date(revokingRecord.attendanceDate + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'numeric', year: 'numeric' })} &bull; {formatOTDuration(revokingRecord.originalOTHours)} OT
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Reason Input */}
              <div className="px-6 py-5">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Revocation Reason <span className="text-amber-500">*</span>
                </label>
                <textarea
                  value={revocationReason}
                  onChange={(e) => setRevocationReason(e.target.value)}
                  rows={4}
                  autoFocus
                  placeholder="e.g. Correction required in hours, record was approved by mistake..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent resize-none"
                />
                <p className="mt-1 text-xs text-gray-400">This will return the status to 'Pending' so it can be re-processed.</p>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
                <button
                  onClick={() => { setRevokingApprovalId(null); setRevocationReason(''); }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmRevoke}
                  disabled={!revocationReason.trim()}
                  className="flex-1 px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  <RotateCcw className="h-4 w-4" />
                  Revoke Now
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}