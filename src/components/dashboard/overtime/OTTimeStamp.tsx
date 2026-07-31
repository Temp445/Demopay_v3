import React, { useEffect, useState, useRef, useMemo } from 'react';
import { CheckCircle, XCircle, Edit, Filter, Calendar, RefreshCw, X, AlertTriangle, Search, RotateCcw, Trash2, ClipboardCheck } from 'lucide-react';
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
  const [policyFilter, setPolicyFilter] = useState('');
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
    import('../../../lib/overtime').then(({ getOvertimePolicies }) => {
      getOvertimePolicies().then(policies => {
        const config = policies.find(p => p.is_default) || policies[0];
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

  // Extract unique policy names
  const uniquePolicies = useMemo(() => {
    const policies = new Set<string>();
    approvals.forEach(a => policies.add(a.appliedPolicyName || 'Default'));
    return Array.from(policies).sort();
  }, [approvals]);

  // Derived state: Filter approvals by search term and policy
  const filteredApprovals = approvals.filter((approval) => {
    // Search filter
    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      if (!approval.employeeName.toLowerCase().includes(lowerSearch) &&
          !approval.employeeCode.toLowerCase().includes(lowerSearch)) {
        return false;
      }
    }

    // Policy filter
    if (policyFilter) {
      const policyName = approval.appliedPolicyName || 'Default';
      if (policyName !== policyFilter) {
        return false;
      }
    }

    return true;
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
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6 shrink-0 text-indigo-600" />
            OT Time Stamp Management
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Review and approve overtime records for your team</p>
        </div>
        {/* <button
          onClick={() => setIsSyncModalOpen(true)}
          disabled={!startDate || !endDate || isOTEnabled === false}
          title={isOTEnabled === false ? 'Overtime feature is disabled in Settings' : ''}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
        >
          <RefreshCw className="h-4 w-4" />
          Manual OT Sync
        </button> */}
      </div>

      {/* Summary Stats */}
      <div className="grid-cols-2 sm:grid-cols-4 gap-3 hidden md:grid">
        {([
          { label: 'Total Records', value: filteredApprovals.length, bg: 'bg-indigo-50 border-indigo-100 text-indigo-700' },
          { label: 'Pending', value: filteredApprovals.filter(a => a.approvalStatus === 'pending').length, bg: 'bg-yellow-50 border-yellow-100 text-yellow-700' },
          { label: 'Approved', value: filteredApprovals.filter(a => a.approvalStatus === 'approved').length, bg: 'bg-green-50 border-green-100 text-green-700' },
          { label: 'Rejected', value: filteredApprovals.filter(a => a.approvalStatus === 'rejected').length, bg: 'bg-red-50 border-red-100 text-red-700' },
        ] as { label: string; value: number; bg: string }[]).map(stat => (
          <div key={stat.label} className={`border rounded-xl p-4 ${stat.bg}`}>
            <div className="text-2xl font-bold">{stat.value}</div>
            <div className="text-xs font-medium mt-0.5 opacity-75">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Start Date</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent bg-gray-50" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">End Date</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent bg-gray-50" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent bg-gray-50">
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Policy</label>
            <select value={policyFilter} onChange={(e) => setPolicyFilter(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent bg-gray-50">
              <option value="">All Policies</option>
              {uniquePolicies.map(policy => (
                <option key={policy} value={policy}>{policy}</option>
              ))}
            </select>
          </div>
          <div ref={searchContainerRef} className="relative">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Search Employee</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
              <input type="text" value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setShowSuggestions(true); }}
                onFocus={() => setShowSuggestions(true)}
                placeholder="Name or Code..."
                className="w-full pl-8 pr-7 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent bg-gray-50" />
              {searchTerm && (
                <button onClick={() => setSearchTerm('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {showSuggestions && searchTerm && suggestions.length > 0 && (
              <ul className="absolute z-20 w-full mt-1 bg-white border border-gray-200 shadow-xl max-h-52 rounded-lg py-1 overflow-auto text-sm">
                {suggestions.map((emp) => (
                  <li key={emp.code} onClick={() => { setSearchTerm(emp.name); setShowSuggestions(false); }}
                    className="cursor-pointer px-3 py-2 hover:bg-indigo-50 transition-colors">
                    <div className="font-medium text-gray-900">{emp.name}</div>
                    <div className="text-xs text-gray-400">{emp.code}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 invisible">Action</label>
            <button onClick={handleBulkApprove} disabled={selectedApprovals.length === 0}
              className="w-full px-4 py-2 text-sm font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all">
              <CheckCircle className="h-4 w-4" />
              Approve ({selectedApprovals.length})
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead>
              <tr className="bg-gray-50">
                <th className="pl-5 pr-3 py-3.5 text-left">
                  <input type="checkbox" onChange={handleSelectAll}
                    checked={selectedApprovals.length > 0 && pendingFilteredApprovals.length > 0 && selectedApprovals.length === pendingFilteredApprovals.length}
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                </th>
                {['Employee', 'Date', 'OT Hours', 'Corrected Hours', 'Policy', 'Status', 'Clock In', 'Clock Out', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredApprovals.map((approval, idx) => (
                <tr key={approval.id} className={`transition-colors hover:bg-indigo-50/40 ${idx % 2 === 1 ? 'bg-gray-50/30' : 'bg-white'}`}>
                  <td className="pl-5 pr-3 py-3.5">
                    {approval.approvalStatus === 'pending' && (
                      <input type="checkbox" checked={selectedApprovals.includes(approval.id)} onChange={() => handleSelectOne(approval.id)}
                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-indigo-600">{approval.employeeName.charAt(0).toUpperCase()}</span>
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-gray-900 whitespace-nowrap">{approval.employeeName}</div>
                        <div className="text-xs text-gray-400">{approval.employeeCode}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <span className="text-sm font-medium text-gray-700">
                      {new Date(approval.attendanceDate + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <span className="text-sm font-semibold text-gray-700 bg-gray-100 px-2 py-0.5 rounded-md">
                      {formatOTDuration(approval.originalOTHours)}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 max-w-[180px]">
                    {approval.correctedOTHours !== null && approval.correctedOTHours !== undefined ? (
                      <div>
                        <span className="text-sm font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                          {formatOTDuration(approval.correctedOTHours!)}
                        </span>
                        {approval.modificationReason && (
                          <div className="text-xs text-gray-400 mt-1 line-clamp-2" title={approval.modificationReason}>
                            {approval.modificationReason}
                          </div>
                        )}
                      </div>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${approval.appliedPolicyName ? 'bg-indigo-50 text-indigo-700 border-indigo-100' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                      {approval.appliedPolicyName || 'Default'}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full ${
                      approval.approvalStatus === 'approved' ? 'bg-green-100 text-green-700' :
                      approval.approvalStatus === 'rejected' ? 'bg-red-100 text-red-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>
                      {approval.approvalStatus.charAt(0).toUpperCase() + approval.approvalStatus.slice(1)}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    {approval.clockIn
                      ? <span className="text-sm text-gray-700 font-mono bg-gray-50 px-2 py-0.5 rounded-md">{new Date(approval.clockIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    {approval.clockOut
                      ? <span className="text-sm text-gray-700 font-mono bg-gray-50 px-2 py-0.5 rounded-md">{new Date(approval.clockOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <div className="flex items-center gap-0.5">
                      {approval.approvalStatus === 'pending' && (
                        <>
                          <button onClick={() => openEditModal(approval)} title="Edit Hours" className="p-1.5 rounded-lg text-blue-500 hover:bg-blue-50 transition-colors"><Edit className="h-4 w-4" /></button>
                          <button onClick={() => handleApprove(approval.id)} title="Approve" className="p-1.5 rounded-lg text-green-500 hover:bg-green-50 transition-colors"><CheckCircle className="h-4 w-4" /></button>
                          <button onClick={() => handleReject(approval.id)} title="Reject" className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-colors"><XCircle className="h-4 w-4" /></button>
                          <button onClick={() => handleDelete(approval)} title="Delete Record" className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"><Trash2 className="h-4 w-4" /></button>
                        </>
                      )}
                      {approval.approvalStatus !== 'pending' && (
                        <button onClick={() => handleRevoke(approval.id)} title="Revoke (Set back to Pending)" className="p-1.5 rounded-lg text-amber-500 hover:bg-amber-50 transition-colors"><RotateCcw className="h-4 w-4" /></button>
                      )}
                      {approval.approvalStatus === 'approved' && approval.approvedByName && (
                        <span className="text-xs text-gray-400 ml-1">by {approval.approvedByName}</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-16 gap-3 text-gray-400">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-indigo-500 border-t-transparent" />
            <span className="text-sm font-medium">Loading OT records...</span>
          </div>
        )}
        {!loading && filteredApprovals.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <CheckCircle className="h-10 w-10 mb-3 text-gray-200" />
            <p className="text-sm font-medium">No OT records found</p>
            <p className="text-xs mt-1">Try adjusting your date range or filters</p>
          </div>
        )}
        {!loading && filteredApprovals.length > 0 && (
          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50 text-xs text-gray-400">
            Showing {filteredApprovals.length} record{filteredApprovals.length !== 1 ? 's' : ''}{selectedApprovals.length > 0 && ` · ${selectedApprovals.length} selected`}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editingApproval && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2"><Edit className="h-5 w-5 text-blue-500" /><h3 className="text-base font-semibold text-gray-900">Edit OT Hours</h3></div>
              <button onClick={() => { setEditingApproval(null); setCorrectedHours(''); setModificationReason(''); setOtSettings(null); }} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"><X className="h-4 w-4" /></button>
            </div>
            <div className="px-6 py-4 bg-blue-50 border-b border-blue-100">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0"><span className="text-sm font-bold text-blue-600">{editingApproval.employeeName.charAt(0)}</span></div>
                <div>
                  <div className="text-sm font-semibold text-gray-900">{editingApproval.employeeName}</div>
                  <div className="text-xs text-gray-500">{editingApproval.employeeCode} &bull; {new Date(editingApproval.attendanceDate + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                </div>
              </div>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Original OT</label>
                  <input type="text" value={formatOTDuration(editingApproval.originalOTHours)} disabled className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 text-gray-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Corrected OT <span className="text-red-400">*</span></label>
                  <input type="text" value={correctedHours} onChange={(e) => setCorrectedHours(e.target.value)}
                    className={`w-full px-3 py-2 text-sm border rounded-lg font-mono focus:outline-none focus:ring-2 ${correctedHours && otSettings && parseTimeToMinutes(correctedHours) < otSettings.threshold ? 'border-red-300 bg-red-50 focus:ring-red-300' : 'border-gray-200 focus:ring-indigo-300'}`}
                    placeholder="e.g. 01:30 or 90" />
                  {correctedHours && (() => {
                    const inputMins = parseTimeToMinutes(correctedHours);
                    if (!otSettings) return <p className="text-xs text-gray-400 mt-1">Loading settings...</p>;
                    if (inputMins < otSettings.threshold) return (
                      <div className="flex items-center gap-1 mt-1.5 text-red-600"><AlertTriangle className="h-3 w-3" /><span className="text-xs">{inputMins} mins is below {otSettings.threshold} min threshold</span></div>
                    );
                    const rounded = applyOTRounding(inputMins, otSettings.roundingInterval, otSettings.roundingMethod);
                    return rounded !== inputMins
                      ? <p className="text-xs text-amber-600 mt-1.5">⟳ Will round {inputMins} → <strong>{rounded} mins</strong> ({formatOTDuration(rounded / 60)})</p>
                      : <p className="text-xs text-green-600 mt-1.5">✓ {formatOTDuration(inputMins / 60)} (no rounding)</p>;
                  })()}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Modification Reason <span className="text-red-400">*</span></label>
                <textarea value={modificationReason} onChange={(e) => setModificationReason(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg h-20 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
                  placeholder="Enter reason for modifying OT hours..." />
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={() => { setEditingApproval(null); setCorrectedHours(''); setModificationReason(''); setOtSettings(null); }} className="flex-1 px-4 py-2 text-sm font-medium border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={handleSaveEdit} disabled={!!(correctedHours && otSettings && parseTimeToMinutes(correctedHours) < otSettings.threshold)} className="flex-1 px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all">Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* OT Sync Modal */}
      <OTSyncModal isOpen={isSyncModalOpen} onClose={() => setIsSyncModalOpen(false)} startDate={startDate} endDate={endDate} />

      {/* Rejection Modal */}
      {rejectingApprovalId && (() => {
        const rec = approvals.find(a => a.id === rejectingApprovalId);
        return (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <div className="flex items-center gap-2"><XCircle className="h-5 w-5 text-red-500" /><h3 className="text-base font-semibold text-gray-900">Reject OT Request</h3></div>
                <button onClick={() => { setRejectingApprovalId(null); setRejectionReason(''); }} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"><X className="h-4 w-4" /></button>
              </div>
              {rec && (
                <div className="px-6 py-4 bg-red-50 border-b border-red-100">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-red-100 flex items-center justify-center"><span className="text-sm font-bold text-red-600">{rec.employeeName.charAt(0)}</span></div>
                    <div>
                      <div className="text-sm font-semibold text-gray-900">{rec.employeeName}</div>
                      <div className="text-xs text-gray-500">{rec.employeeCode} &bull; {new Date(rec.attendanceDate + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} &bull; {formatOTDuration(rec.originalOTHours)} OT</div>
                    </div>
                  </div>
                </div>
              )}
              <div className="px-6 py-5">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Rejection Reason <span className="text-red-400">*</span></label>
                <textarea value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} rows={4} autoFocus
                  placeholder="e.g. Overtime was not pre-approved by supervisor..."
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-300 resize-none" />
                <p className="mt-1.5 text-xs text-gray-400">This reason will be recorded and visible to HR.</p>
              </div>
              <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
                <button onClick={() => { setRejectingApprovalId(null); setRejectionReason(''); }} className="flex-1 px-4 py-2 text-sm font-medium border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">Cancel</button>
                <button onClick={confirmReject} disabled={!rejectionReason.trim()} className="flex-1 px-4 py-2 text-sm font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all">
                  <XCircle className="h-4 w-4" /> Confirm Rejection
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Revocation Modal */}
      {revokingApprovalId && (() => {
        const rec = approvals.find(a => a.id === revokingApprovalId);
        return (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <div className="flex items-center gap-2"><RotateCcw className="h-5 w-5 text-amber-500" /><h3 className="text-base font-semibold text-gray-900">Revoke Approval/Rejection</h3></div>
                <button onClick={() => { setRevokingApprovalId(null); setRevocationReason(''); }} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"><X className="h-4 w-4" /></button>
              </div>
              {rec && (
                <div className="px-6 py-4 bg-amber-50 border-b border-amber-100">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-amber-100 flex items-center justify-center"><span className="text-sm font-bold text-amber-600">{rec.employeeName.charAt(0)}</span></div>
                    <div>
                      <div className="text-sm font-semibold text-gray-900">{rec.employeeName}</div>
                      <div className="text-xs text-gray-500">{rec.employeeCode} &bull; {new Date(rec.attendanceDate + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} &bull; {formatOTDuration(rec.originalOTHours)} OT</div>
                    </div>
                  </div>
                </div>
              )}
              <div className="px-6 py-5">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Revocation Reason <span className="text-amber-400">*</span></label>
                <textarea value={revocationReason} onChange={(e) => setRevocationReason(e.target.value)} rows={4} autoFocus
                  placeholder="e.g. Correction required, record was approved by mistake..."
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none" />
                <p className="mt-1.5 text-xs text-gray-400">This will return the status to 'Pending' so it can be re-processed.</p>
              </div>
              <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
                <button onClick={() => { setRevokingApprovalId(null); setRevocationReason(''); }} className="flex-1 px-4 py-2 text-sm font-medium border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">Cancel</button>
                <button onClick={confirmRevoke} disabled={!revocationReason.trim()} className="flex-1 px-4 py-2 text-sm font-semibold bg-amber-500 text-white rounded-lg hover:bg-amber-600 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all">
                  <RotateCcw className="h-4 w-4" /> Revoke Now
                </button>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
