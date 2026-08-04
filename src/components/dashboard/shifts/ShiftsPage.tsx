import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Upload, ArrowRightLeft, X, Search, RefreshCw, Download } from 'lucide-react';
import { format, startOfWeek, endOfWeek, isSameDay, parseISO } from 'date-fns';
import { supabase } from '../../../lib/supabase';
import { validateAuth } from '../../../stores/utils/storeUtils';

import ShiftCalendar from './ShiftCalendar';
import ShiftFilter from './ShiftFilter';
import ShiftAssignment from './ShiftAssignment';
import CreateShiftModal from './CreateShiftModal';
import AssignShiftModal from './AssignShiftModal';
import ShiftList from './ShiftList';
import ImportModal from '../../ImportModal';

import {
  ShiftAssignment as ShiftAssignmentType,
  Shift,
  useShiftsStore,
} from '../../../stores/shiftsStore';
import { useEmployeesStore } from '../../../stores/employeesStore';
import { importShifts } from '../../../lib/import';

export default function ShiftsPage() {
  const { fetchShifts, assignments } = useShiftsStore();
  const { items: employees, fetchEmployees } = useEmployeesStore();

  /* -------------------- UI STATE -------------------- */
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const [selectedShift, setSelectedShift] =
    useState<ShiftAssignmentType | null>(null);

  const [selectedShiftForAssignment, setSelectedShiftForAssignment] =
    useState<Shift | null>(null);

  const [focusedDate, setFocusedDate] = useState<Date | null>(null);
  const [lastRefresh, setLastRefresh] = useState(Date.now());

  /* -------------------- REASSIGNMENT HISTORY STATE -------------------- */
  const [historyRecords, setHistoryRecords] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [historyDateFrom, setHistoryDateFrom] = useState('');
  const [historyDateTo, setHistoryDateTo] = useState('');
  const [userEmailMap, setUserEmailMap] = useState<Record<string, string>>({});
  const [historyPage, setHistoryPage] = useState(1);
  const HISTORY_PAGE_SIZE = 10;

  /* -------------------- INITIAL LOAD -------------------- */
  useEffect(() => {
    fetchEmployees();
    fetchShifts();
  }, [fetchEmployees, fetchShifts, lastRefresh]);

  /* -------------------- DERIVED DATA -------------------- */
  const availableEmployees = useMemo(
    () => employees.filter(e => e.status === 'Active'),
    [employees]
  );

  const shiftsForFocusedDate = useMemo(() => {
    if (!focusedDate) return [];

    return assignments.items.filter(s =>
      isSameDay(parseISO(s.schedule_date), focusedDate)
    );
  }, [focusedDate, assignments.items]);

  /* -------------------- HANDLERS -------------------- */
  const handleShiftClick = (shift: ShiftAssignmentType) => {
    setSelectedShift(shift);
    setFocusedDate(new Date(shift.schedule_date));
  };

  const handleAssignmentUpdate = () => {
    setSelectedShift(null);
    setLastRefresh(Date.now());
  };

  const handleAssignClick = (shift: Shift) => {
    setSelectedShiftForAssignment(shift);
    setIsAssignModalOpen(true);
  };

  const handleImport = async (rows: any[]) => {
    return await importShifts(rows);
  };

  const handleImportComplete = () => {
    setIsImportModalOpen(false);
    setLastRefresh(Date.now());
  };

  // Auto-fetch history when date filters change
  useEffect(() => {
    if (isHistoryOpen) fetchHistory();
  }, [historyDateFrom, historyDateTo]);

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const auth = await validateAuth();
      if (!auth.isAuthenticated || !auth.tenantId) return;
      let query = supabase
        .from('shift_reassignment_history')
        .select('*')
        .eq('tenant_id', auth.tenantId)
        .order('created_at', { ascending: false });
      if (historyDateFrom) query = query.gte('created_at', historyDateFrom);
      if (historyDateTo) query = query.lte('created_at', historyDateTo + 'T23:59:59');
      const { data } = await query;
      setHistoryRecords(data || []);

      // Fetch user emails for reassigned_by UUIDs
      const uniqueUserIds = [...new Set((data || []).map((r: any) => r.reassigned_by).filter(Boolean))];
      if (uniqueUserIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, email, full_name')
          .in('id', uniqueUserIds);
        if (profiles) {
          const map: Record<string, string> = {};
          profiles.forEach((p: any) => { map[p.id] = p.full_name || p.email || p.id; });
          setUserEmailMap(map);
        }
      }
    } finally {
      setHistoryLoading(false);
    }
  };

  const filteredHistory = useMemo(() => {
    const lower = historySearch.toLowerCase();
    return historyRecords.filter(r =>
      !lower ||
      r.employee_name?.toLowerCase().includes(lower) ||
      r.employee_code?.toLowerCase().includes(lower) ||
      r.previous_shift_name?.toLowerCase().includes(lower) ||
      r.reassigned_shift_name?.toLowerCase().includes(lower) ||
      r.reason?.toLowerCase().includes(lower)
    );
  }, [historyRecords, historySearch]);

  // Reset to first page whenever filtered results change
  useEffect(() => { setHistoryPage(1); }, [filteredHistory.length]);

  const totalHistoryPages = Math.max(1, Math.ceil(filteredHistory.length / HISTORY_PAGE_SIZE));
  const paginatedHistory = filteredHistory.slice(
    (historyPage - 1) * HISTORY_PAGE_SIZE,
    historyPage * HISTORY_PAGE_SIZE
  );

  const handleOpenHistory = () => {
    setIsHistoryOpen(true);
    fetchHistory();
  };

  const handleExportCSV = () => {
    const headers = ['Employee', 'Code', 'Prev Shift', 'New Shift', 'Date', 'Reason', 'Reassigned At'];
    const rows = filteredHistory.map((r: any) => [
      r.employee_name, r.employee_code ?? '',
      r.previous_shift_name,
      r.reassigned_shift_name,
      r.schedule_date,
      `"${(r.reason || '').replace(/"/g, '""')}"`,
      r.created_at,
    ]);
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `reassignment_history_${format(new Date(), 'yyyyMMdd')}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  /* -------------------- RENDER -------------------- */
  return (
    <div>
      <div className="max-w-7xl mx-auto">
        {/* HEADER */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Shift Management</h1>
            <p className="mt-1 text-sm text-gray-500">
              Manage and assign shifts, view schedules, and handle shift swaps.
            </p>
          </div>
          <div className="mt-4 md:mt-0 grid grid-cols-2 sm:grid-cols-3 gap-3">
            <button
              onClick={handleOpenHistory}
              className="whitespace-nowrap inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              <ArrowRightLeft className="h-4 w-4 mr-2" />
              <span className="hidden lg:inline">Reassigned</span> History
            </button>
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              <Upload className="h-4 w-4 mr-2" />
              Import
            </button>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="col-span-2 md:col-span-1 whitespace-nowrap inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Shift
            </button>
          </div>
        </div>

        {/* REASSIGNMENT HISTORY MODAL */}
        {isHistoryOpen && (
          <div className="fixed inset-0 z-50 overflow-hidden" aria-modal="true">
            <div className="absolute inset-0 bg-gray-500 bg-opacity-60" onClick={() => setIsHistoryOpen(false)} />
            <div className="absolute inset-y-0 right-0 flex flex-col w-full max-w-4xl bg-white shadow-2xl">
              {/* Modal Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b">
                <div className="flex items-center gap-2">
                  <ArrowRightLeft className="h-5 w-5 text-indigo-600" />
                  <h2 className="text-lg font-semibold text-gray-900">Reassignment History</h2>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={fetchHistory} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500">
                    <RefreshCw className={`h-4 w-4 ${historyLoading ? 'animate-spin' : ''}`} />
                  </button>
                  <button onClick={handleExportCSV} disabled={filteredHistory.length === 0} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-40">
                    <Download className="h-3.5 w-3.5" /> Export
                  </button>
                  <button onClick={() => setIsHistoryOpen(false)} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500">
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Filters */}
              <div className="px-4 py-2.5 border-b bg-gray-50">
                <div className="flex items-center gap-2">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                    <input type="text" placeholder="Search employee, shift, reason..." className="w-full pl-8 pr-3 py-1.5 border border-gray-300 rounded-md text-xs focus:ring-indigo-500 focus:border-indigo-500" value={historySearch} onChange={e => setHistorySearch(e.target.value)} />
                  </div>
                  <div className="flex items-center gap-1 text-xs text-gray-500 shrink-0">
                    <span className="font-medium">From</span>
                    <input type="date" className="border border-gray-300 rounded-md text-xs py-1.5 px-2 focus:ring-indigo-500 focus:border-indigo-500" value={historyDateFrom} onChange={e => setHistoryDateFrom(e.target.value)} />
                  </div>
                  <div className="flex items-center gap-1 text-xs text-gray-500 shrink-0">
                    <span className="font-medium">To</span>
                    <input type="date" className="border border-gray-300 rounded-md text-xs py-1.5 px-2 focus:ring-indigo-500 focus:border-indigo-500" value={historyDateTo} onChange={e => setHistoryDateTo(e.target.value)} />
                  </div>
                  {(historyDateFrom || historyDateTo) && (
                    <button onClick={() => { setHistoryDateFrom(''); setHistoryDateTo(''); }} className="text-xs text-gray-400 hover:text-gray-600 shrink-0">✕ Clear</button>
                  )}
                </div>
              </div>

              {/* Table */}
              <div className="flex-1 overflow-y-auto">
                {historyLoading ? (
                  <div className="flex justify-center items-center h-40"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>
                ) : filteredHistory.length === 0 ? (
                  <div className="text-center py-16 text-gray-400">
                    <ArrowRightLeft className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No reassignment records found.</p>
                  </div>
                ) : (
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Previous Shift</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">→</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">New Shift</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reassigned By</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase"> Modified Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {paginatedHistory.map((r: any) => (
                        <tr key={r.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <p className=" text-xs text-gray-900">{r.employee_name}</p>
                            {r.employee_code && <p className="text-xs text-gray-500">{r.employee_code}</p>}
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-medium text-red-700 text-xs">{r.previous_shift_name}</p>
                            <p className="text-xs text-gray-400">{r.schedule_date ? format(parseISO(r.schedule_date), 'dd MMM') : '—'}</p>
                          </td>
                          <td className="px-4 py-3 text-center text-gray-400"><ArrowRightLeft className="h-3.5 w-3.5 mx-auto" /></td>
                          <td className="px-4 py-3">
                            <p className="font-medium text-green-700 text-xs">{r.reassigned_shift_name}</p>
                            <p className="text-xs text-gray-400">{r.schedule_date ? format(parseISO(r.schedule_date), 'dd MMM') : '—'}</p>
                          </td>
                          <td className="px-4 py-3 max-w-xs"><p className="text-xs text-gray-600 line-clamp-2">{r.reason}</p></td>
                          <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{r.reassigned_by ? (userEmailMap[r.reassigned_by] || r.reassigned_by.slice(0, 8) + '...') : '—'}</td>
                          <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{r.created_at ? format(parseISO(r.created_at), 'dd MMM yy, h:mm a') : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              {!historyLoading && filteredHistory.length > 0 && (
                <div className="px-4 py-2 border-t bg-gray-50 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <button
                      disabled={historyPage === 1}
                      onClick={() => setHistoryPage(p => p - 1)}
                      className="px-2 py-1 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                    >← Prev</button>
                    {Array.from({ length: totalHistoryPages }, (_, i) => i + 1)
                      .filter(p => p === 1 || p === totalHistoryPages || Math.abs(p - historyPage) <= 1)
                      .reduce<(number | string)[]>((acc, p, idx, arr) => {
                        if (idx > 0 && (p as number) - (arr[idx - 1] as number) > 1) acc.push('...');
                        acc.push(p);
                        return acc;
                      }, [])
                      .map((p, i) => p === '...' ? (
                        <span key={`ellipsis-${i}`} className="px-1 text-xs text-gray-400">…</span>
                      ) : (
                        <button
                          key={p}
                          onClick={() => setHistoryPage(p as number)}
                          className={`px-2 py-1 text-xs rounded border ${
                            historyPage === p
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'border-gray-300 text-gray-600 hover:bg-gray-100'
                          }`}
                        >{p}</button>
                      ))
                    }
                    <button
                      disabled={historyPage === totalHistoryPages}
                      onClick={() => setHistoryPage(p => p + 1)}
                      className="px-2 py-1 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                    >Next →</button>
                  </div>
                  <span className="text-xs text-gray-500">
                    {Math.min((historyPage - 1) * HISTORY_PAGE_SIZE + 1, filteredHistory.length)}–{Math.min(historyPage * HISTORY_PAGE_SIZE, filteredHistory.length)} of {filteredHistory.length} records
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* LIST */}
        <div className="mt-4">
          <ShiftList
            lastRefresh={lastRefresh}
            onRefresh={() => setLastRefresh(Date.now())}
            onAssignClick={handleAssignClick}
          />
        </div>

        {/* CALENDAR + ASSIGNMENTS */}
        <div
          className={`mt-8 grid gap-4 ${
            selectedShift || focusedDate
              ? 'grid-cols-1 lg:grid-cols-3'
              : 'grid-cols-1'
          }`}
        >
          <div className="lg:col-span-2">
            <ShiftCalendar
              onShiftClick={handleShiftClick}
              focusedDate={focusedDate}
              onClearFocus={() => {
                setFocusedDate(null);
                setSelectedShift(null);
              }}
            />
          </div>

          {(selectedShift || focusedDate) && (
            <div className="space-y-4">
              {selectedShift ? (
                <ShiftAssignment
                  shift={selectedShift}
                  assignments={assignments.items}
                  availableEmployees={availableEmployees}
                  onAssignmentUpdate={handleAssignmentUpdate}
                />
              ) : (
                shiftsForFocusedDate.map(shift => (
                  <ShiftAssignment
                    key={shift.id}
                    shift={shift}
                    assignments={assignments.items}
                    availableEmployees={availableEmployees}
                    onAssignmentUpdate={handleAssignmentUpdate}
                  />
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* MODALS */}
      <CreateShiftModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onShiftCreated={() => setLastRefresh(Date.now())}
      />

      {selectedShiftForAssignment && (
        <AssignShiftModal
          shift={selectedShiftForAssignment}
          isOpen={isAssignModalOpen}
          onClose={() => {
            setIsAssignModalOpen(false);
            setSelectedShiftForAssignment(null);
          }}
          onAssignmentComplete={() => {
            setIsAssignModalOpen(false);
            setSelectedShiftForAssignment(null);
            setLastRefresh(Date.now());
          }}
        />
      )}

      <ImportModal
        isOpen={isImportModalOpen}
        onClose={handleImportComplete}
        entityType="shifts"
        entityName="Shifts"
        onImport={handleImport}
      />
    </div>
  );
}
