import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  History, Calendar, Search, Clock, IndianRupee,
  X, CheckCircle2, Trash2, RotateCcw, Calculator, Users
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { validateAuth } from '../../../stores/utils/storeUtils';
import toast from 'react-hot-toast';
import OTWorksheet from './OTWorksheet';

interface EmployeeProcessRecord {
  id: string;
  ot_processing_id: string;
  employee_name: string;
  employee_code: string;
  process_period_start: string;
  process_period_end: string;
  processed_at: string;
  total_ot_hours: number;
  total_ot_amount: number;
  processing_status: string;
  ot_structure_name?: string;
}

function formatOTDuration(hours: number): string {
  const totalMins = Math.round(hours * 60);
  if (totalMins < 60) return `${totalMins}m`;
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

type ActiveTab = 'calculation' | 'pending' | 'approved';

export default function OTProcessingPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('calculation');

  // History state
  const [records, setRecords] = useState<EmployeeProcessRecord[]>([]);
  const [loading, setLoading] = useState(false);

  // Search state
  const [searchTerm, setSearchTerm] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Date filter — default to current month
  const getMonthBounds = () => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const year = now.getFullYear();
    const month = now.getMonth();
    const firstDay = `${year}-${pad(month + 1)}-01`;
    const lastDay = `${year}-${pad(month + 1)}-${pad(new Date(year, month + 1, 0).getDate())}`;
    return { firstDay, lastDay };
  };
  const { firstDay, lastDay } = getMonthBounds();
  const [filterFrom, setFilterFrom] = useState(firstDay);
  const [filterTo, setFilterTo] = useState(lastDay);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Load history when switching to history tabs
  useEffect(() => {
    if (activeTab === 'pending' || activeTab === 'approved') {
      fetchRecords();
      setSelectedIds([]); // Clear selection on tab change
    }
  }, [activeTab]);


  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const auth = await validateAuth();
      if (!auth.isAuthenticated || !auth.tenantId) return;

      const { data, error } = await supabase
        .from('ot_processed_data')
        .select(`
          id,
          ot_processing_id,
          total_ot_hours,
          total_ot_amount,
          processing_status,
          ot_processing:ot_processing_id (
            id,
            processing_period_start,
            processing_period_end,
            processed_at,
            created_at
          ),
          employee:employee_id (
            name,
            employee_code
          ),
          ot_structure:ot_structures (
            structure_name
          )
        `)
        .eq('tenant_id', auth.tenantId)
        .order('id', { ascending: false });

      if (error) throw error;

      const mapped: EmployeeProcessRecord[] = (data || []).map((row: any) => ({
        id: row.id,
        ot_processing_id: row.ot_processing_id || row.ot_processing?.id || '',
        employee_name: row.employee?.name || '—',
        employee_code: row.employee?.employee_code || '—',
        process_period_start: row.ot_processing?.processing_period_start || '',
        process_period_end: row.ot_processing?.processing_period_end || '',
        processed_at: row.ot_processing?.processed_at || row.ot_processing?.created_at || '',
        total_ot_hours: row.total_ot_hours || 0,
        total_ot_amount: row.total_ot_amount || 0,
        processing_status: row.processing_status || row.ot_processing?.processing_status || 'draft',
        ot_structure_name: row.ot_structure?.structure_name || '—',
      }));

      setRecords(mapped);
    } catch (err) {
      console.error('Failed to fetch OT history records:', err);
      toast.error('Failed to load OT process history');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (record: EmployeeProcessRecord) => {
    if (!confirm(`Approve OT for ${record.employee_name}?`)) return;
    try {
      const { error } = await supabase
        .from('ot_processed_data')
        .update({ processing_status: 'finalized', updated_at: new Date().toISOString() })
        .eq('id', record.id);
      if (error) throw new Error(error.message);
      toast.success(`${record.employee_name}'s OT approved`);
      fetchRecords();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to approve OT record');
    }
  };

  const handleRevoke = async (record: EmployeeProcessRecord) => {
    if (!confirm(`Revoke approval for ${record.employee_name}? This moves it back to Pending.`)) return;
    try {
      const { error } = await supabase
        .from('ot_processed_data')
        .update({ processing_status: 'completed', updated_at: new Date().toISOString() })
        .eq('id', record.id);
      if (error) throw new Error(error.message);
      toast.success(`${record.employee_name}'s OT revoked — moved to Pending`);
      setSelectedIds(prev => prev.filter(id => id !== record.id));
      fetchRecords();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to revoke OT record');
    }
  };

  const handleBulkApprove = async () => {
    if (!confirm(`Approve ${selectedIds.length} selected records?`)) return;
    try {
      const { error } = await supabase
        .from('ot_processed_data')
        .update({ processing_status: 'finalized', updated_at: new Date().toISOString() })
        .in('id', selectedIds);

      if (error) throw error;
      toast.success(`Successfully approved selected records`);
      setSelectedIds([]);
      fetchRecords();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to approve records');
    }
  };

  const handleBulkRevoke = async () => {
    if (!confirm(`Revoke approval for ${selectedIds.length} selected records?`)) return;
    try {
      const { error } = await supabase
        .from('ot_processed_data')
        .update({ processing_status: 'completed', updated_at: new Date().toISOString() })
        .in('id', selectedIds);

      if (error) throw error;
      toast.success(`Successfully revoked selected records`);
      setSelectedIds([]);
      fetchRecords();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to revoke records');
    }
  };

  const handleDelete = async (record: EmployeeProcessRecord) => {
    if (!confirm(`Delete OT record for ${record.employee_name}? This cannot be undone.`)) return;
    try {
      const { error } = await supabase.from('ot_processed_data').delete().eq('id', record.id);
      if (error) throw error;
      toast.success('Record deleted');
      setRecords(prev => prev.filter(r => r.id !== record.id));
    } catch (err: any) {
      toast.error('Failed to delete record');
    }
  };

  const tabRecords = useMemo(() =>
    activeTab === 'approved'
      ? records.filter(r => r.processing_status === 'finalized')
      : records.filter(r => r.processing_status !== 'finalized'),
    [records, activeTab]
  );

  const suggestions = useMemo(() => {
    if (!searchTerm.trim()) return [];
    const lower = searchTerm.toLowerCase();
    const seen = new Set<string>();
    return tabRecords
      .filter(r => {
        const match = r.employee_name.toLowerCase().includes(lower) || r.employee_code.toLowerCase().includes(lower);
        const key = `${r.employee_code}::${r.employee_name}`;
        if (match && !seen.has(key)) { seen.add(key); return true; }
        return false;
      })
      .slice(0, 6)
      .map(r => ({ name: r.employee_name, code: r.employee_code }));
  }, [searchTerm, tabRecords]);

  const filtered = useMemo(() =>
    tabRecords.filter(r => {
      if (searchTerm.trim()) {
        const lower = searchTerm.toLowerCase();
        if (!r.employee_name.toLowerCase().includes(lower) && !r.employee_code.toLowerCase().includes(lower)) return false;
      }
      if (filterFrom && r.process_period_start && r.process_period_start < filterFrom) return false;
      if (filterTo && r.process_period_end && r.process_period_end > filterTo) return false;
      return true;
    }),
    [tabRecords, searchTerm, filterFrom, filterTo]
  );

  const clearFilters = () => { setSearchTerm(''); setFilterFrom(firstDay); setFilterTo(lastDay); setSelectedIds([]); };
  const hasFilters = searchTerm || filterFrom !== firstDay || filterTo !== lastDay;

  const filteredEmployeeCount = useMemo(() => new Set(filtered.map(r => r.employee_code)).size, [filtered]);
  const filteredTotalAmount = useMemo(() => filtered.reduce((acc, r) => acc + r.total_ot_amount, 0), [filtered]);
  const filteredTotalHours = useMemo(() => filtered.reduce((acc, r) => acc + r.total_ot_hours, 0), [filtered]);

  const pendingCount = useMemo(() =>
    records.filter(r => {
      if (r.processing_status === 'finalized') return false;
      if (filterFrom && r.process_period_start && r.process_period_start < filterFrom) return false;
      if (filterTo && r.process_period_end && r.process_period_end > filterTo) return false;
      return true;
    }).length,
    [records, filterFrom, filterTo]
  );

  const approvedCount = useMemo(() =>
    records.filter(r => {
      if (r.processing_status !== 'finalized') return false;
      if (filterFrom && r.process_period_start && r.process_period_start < filterFrom) return false;
      if (filterTo && r.process_period_end && r.process_period_end > filterTo) return false;
      return true;
    }).length,
    [records, filterFrom, filterTo]
  );

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(filtered.map(r => r.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelect = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedIds(prev => [...prev, id]);
    } else {
      setSelectedIds(prev => prev.filter(selectedId => selectedId !== id));
    }
  };


  return (
    <div className=" sm:p-6 lg:p-8 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl md:text-2xl   font-bold text-slate-900 tracking-tight">OT Processing</h1>
        <p className="text-sm text-slate-500 mt-1 font-medium">Calculate, manage and approve employee overtime</p>
      </div>

      {/* Tab Nav — Full-width 3 column */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-4">
        <div className="grid grid-cols-3">
          {/* Process OT */}
          <button
            onClick={() => setActiveTab('calculation')}
            className={`flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-3 sm:py-4 text-xs sm:text-sm font-bold transition-all focus:outline-none border-b-2 ${activeTab === 'calculation'
                ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50'
                : 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-50'
              }`}
          >
            <Calculator className="h-4 w-4 shrink-0 hidden md:flex" />
            <span>Process OT</span>
          </button>

          {/* Pending OT */}
          <button
            onClick={() => { setActiveTab('pending'); setSearchTerm(''); }}
            className={`flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-3 sm:py-4 text-xs sm:text-sm font-bold transition-all focus:outline-none border-b-2 border-x border-slate-100 ${activeTab === 'pending'
                ? 'border-b-amber-500 text-amber-600 bg-amber-50/50'
                : 'border-b-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-50'
              }`}
          >
            <Clock className="h-4 w-4 shrink-0 hidden md:flex" />
            <span className="flex items-center gap-1">
              Pending OT
              {pendingCount > 0 && (
                <span className="bg-amber-100 text-amber-700 py-0.5 px-1.5 rounded-full text-[10px] font-black">{pendingCount}</span>
              )}
            </span>
          </button>

          {/* Approved OT */}
          <button
            onClick={() => { setActiveTab('approved'); setSearchTerm(''); }}
            className={`flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-3 sm:py-4 text-xs sm:text-sm font-bold transition-all focus:outline-none border-b-2 ${activeTab === 'approved'
                ? 'border-emerald-600 text-emerald-600 bg-emerald-50/50'
                : 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-50'
              }`}
          >
            <CheckCircle2 className="h-4 w-4 shrink-0 hidden md:flex" />
            <span className="flex items-center gap-1">
              Approved OT
              {approvedCount > 0 && (
                <span className="bg-emerald-100 text-emerald-700 py-0.5 px-1.5 rounded-full text-[10px] font-black">{approvedCount}</span>
              )}
            </span>
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'calculation' ? (
        <OTWorksheet />
      ) : (
        <>
          {/* Approved OT Summary Cards */}
          {activeTab === 'approved' && (
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 sm:p-4 flex flex-col justify-center relative overflow-hidden">
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="h-6 w-6 sm:h-8 sm:w-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
                    <Users className="h-3 w-3 sm:h-4 sm:w-4" />
                  </div>
                  <p className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider leading-tight">Employees</p>
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-slate-900">{filteredEmployeeCount}</h3>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 sm:p-4 flex flex-col justify-center relative overflow-hidden">
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="h-6 w-6 sm:h-8 sm:w-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                    <Clock className="h-3 w-3 sm:h-4 sm:w-4" />
                  </div>
                  <p className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider leading-tight">Hours</p>
                </div>
                <h3 className="text-sm sm:text-2xl font-bold text-slate-900">{formatOTDuration(filteredTotalHours)}</h3>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 sm:p-4 flex flex-col justify-center relative overflow-hidden">
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="h-6 w-6 sm:h-8 sm:w-8 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
                    <IndianRupee className="h-3 w-3 sm:h-4 sm:w-4" />
                  </div>
                  <p className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider leading-tight">Amount</p>
                </div>
                <h3 className="text-sm sm:text-2xl font-bold text-slate-900">₹{filteredTotalAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</h3>
              </div>
            </div>
          )}

          {/* Filter Bar */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4">
            <div className="grid grid-cols-2 gap-3 mb-3" ref={searchRef}>
              <div className="col-span-2">
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-4 w-4 text-slate-400" />
                  </div>
                  <input
                    type="text"
                    placeholder="Search by name or code..."
                    value={searchTerm}
                    onChange={e => { setSearchTerm(e.target.value); setShowSuggestions(true); }}
                    onFocus={() => setShowSuggestions(true)}
                    className="block w-full pl-9 pr-8 py-2.5 border border-slate-200 rounded-lg bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                  {searchTerm && (
                    <button onClick={() => setSearchTerm('')} className="absolute inset-y-0 right-2 flex items-center text-slate-300 hover:text-slate-500">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {showSuggestions && suggestions.length > 0 && (
                    <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden">
                      {suggestions.map((s, i) => (
                        <button
                          key={i}
                          onMouseDown={() => { setSearchTerm(s.name); setShowSuggestions(false); }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-indigo-50 text-left transition-colors"
                        >
                          <div className="h-7 w-7 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-black shrink-0">
                            {s.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="text-sm font-bold text-slate-900">{s.name}</div>
                            <div className="text-[10px] font-mono text-slate-400 uppercase">{s.code}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">From</label>
                <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
                  className="block w-full border border-slate-200 rounded-lg bg-slate-50 py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">To</label>
                <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
                  className="block w-full border border-slate-200 rounded-lg bg-slate-50 py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
              </div>
            </div>
            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="text-xs text-slate-500 font-medium">
                  <span className="font-black text-slate-800">{filtered.length}</span> record{filtered.length !== 1 ? 's' : ''}
                </div>
                {selectedIds.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">{selectedIds.length} selected</span>
                    {activeTab === 'pending' ? (
                      <button onClick={handleBulkApprove} className="px-3 py-1 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 transition">
                        Bulk Approve
                      </button>
                    ) : (
                      <button onClick={handleBulkRevoke} className="px-3 py-1 bg-amber-500 text-white text-xs font-bold rounded-lg hover:bg-amber-600 transition">
                        Bulk Revoke
                      </button>
                    )}
                  </div>
                )}
              </div>
              {hasFilters && (
                <button onClick={clearFilters} className="flex items-center gap-1 text-xs font-bold text-rose-500 hover:text-rose-700">
                  <X className="h-3 w-3" />Clear
                </button>
              )}
            </div>
          </div>

          {/* Mobile Card List */}
          <div className="sm:hidden space-y-3">
            {loading && records.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-sm">Loading records...</div>
            ) : filtered.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
                <History className="h-10 w-10 text-slate-200 mx-auto mb-3" />
                <p className="text-slate-400 font-semibold text-sm">No records found</p>
                {hasFilters && <button onClick={clearFilters} className="mt-2 text-xs text-indigo-500 hover:underline">Clear filters</button>}
              </div>
            ) : filtered.map(record => (
              <div key={record.id} className={`bg-white rounded-xl border p-4 transition-colors ${selectedIds.includes(record.id) ? 'border-indigo-300 bg-indigo-50/30' : 'border-slate-200'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(record.id)}
                      onChange={(e) => handleSelect(record.id, e.target.checked)}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 shrink-0 mt-0.5"
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-slate-900 truncate">{record.employee_name}</div>
                      <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">{record.employee_code}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {activeTab === 'pending' ? (
                      <>
                        <button onClick={() => handleApprove(record)} className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 transition-colors">
                          <CheckCircle2 className="h-3.5 w-3.5" />Approve
                        </button>
                        <button onClick={() => handleDelete(record)} className="p-1.5 text-rose-400 hover:bg-rose-50 rounded-lg border border-rose-100 transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    ) : (
                      <button onClick={() => handleRevoke(record)} className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-amber-500 text-white text-xs font-bold rounded-lg hover:bg-amber-600 transition-colors">
                        <RotateCcw className="h-3.5 w-3.5" />Revoke
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-slate-50 rounded-lg p-2">
                    <div className="text-slate-400 font-medium mb-0.5">Period</div>
                    <div className="font-semibold text-slate-700">
                      {record.process_period_start ? new Date(record.process_period_start).toLocaleDateString('en-GB') : '—'}
                      {' – '}
                      {record.process_period_end ? new Date(record.process_period_end).toLocaleDateString('en-GB') : '—'}
                    </div>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-2">
                    <div className="text-slate-400 font-medium mb-0.5">OT Hours</div>
                    <div className="font-bold text-indigo-700">{formatOTDuration(record.total_ot_hours)}</div>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-2">
                    <div className="text-slate-400 font-medium mb-0.5">Amount</div>
                    <div className="font-black text-slate-900 flex items-center gap-0.5">
                      <IndianRupee className="h-3 w-3 text-emerald-600" />
                      {record.total_ot_amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-2">
                    <div className="text-slate-400 font-medium mb-0.5">Processed On</div>
                    <div className="font-semibold text-slate-700">{record.processed_at ? new Date(record.processed_at).toLocaleDateString('en-GB') : '—'}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table */}
          <div className="hidden sm:block bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <tr>
                  <th className="px-6 py-3 text-left w-12">
                    <input
                      type="checkbox"
                      checked={filtered.length > 0 && selectedIds.length === filtered.length}
                      onChange={handleSelectAll}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                  </th>
                  <th className="px-6 py-3 text-left">Employee</th>
                  <th className="px-6 py-3 text-left">Process Period</th>
                  <th className="px-6 py-3 text-left">Processed On</th>
                  <th className="px-6 py-3 text-left">OT Structure</th>
                  <th className="px-6 py-3 text-center">OT Hours</th>
                  <th className="px-6 py-3 text-right">Amount</th>
                  <th className="px-6 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading && records.length === 0 ? (
                  <tr><td colSpan={7} className="px-6 py-16 text-center text-slate-400 text-sm">Loading records...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-20 text-center">
                      <History className="h-12 w-12 text-slate-100 mx-auto mb-3" />
                      <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">No records found</p>
                      {hasFilters && <button onClick={clearFilters} className="mt-3 text-xs text-indigo-500 hover:underline">Clear filters</button>}
                    </td>
                  </tr>
                ) : (
                  filtered.map(record => (
                    <tr key={record.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(record.id)}
                          onChange={(e) => handleSelect(record.id, e.target.checked)}
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-bold text-slate-900">{record.employee_name}</div>
                        <div className="text-[10px] text-slate-400 font-mono font-bold uppercase tracking-wider mt-0.5">{record.employee_code}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-slate-100 w-fit px-2 py-1 rounded-md">
                          <Calendar className="h-3 w-3" />
                          {record.process_period_start ? new Date(record.process_period_start).toLocaleDateString('en-GB') : '—'}
                          {' – '}
                          {record.process_period_end ? new Date(record.process_period_end).toLocaleDateString('en-GB') : '—'}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-slate-600 font-medium">
                          {record.processed_at ? new Date(record.processed_at).toLocaleDateString('en-GB') : '—'}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-slate-600 font-medium">{record.ot_structure_name || '—'}</div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 text-indigo-700 text-xs font-black rounded-md">
                          <Clock className="h-3 w-3" />
                          {formatOTDuration(record.total_ot_hours)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          <IndianRupee className="h-3.5 w-3.5 text-emerald-600" />
                          <span className="text-sm font-black text-slate-900">
                            {record.total_ot_amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-2">
                          {activeTab === 'pending' ? (
                            <>
                              <button onClick={() => handleApprove(record)} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-md hover:bg-emerald-700 transition-colors shadow-sm">
                                <CheckCircle2 className="h-3.5 w-3.5" />Approve
                              </button>
                              <button onClick={() => handleDelete(record)} className="p-1.5 text-rose-400 hover:text-white hover:bg-rose-500 rounded-md transition-colors border border-rose-100 hover:border-rose-500" title="Delete">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          ) : (
                            <button onClick={() => handleRevoke(record)} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 text-white text-xs font-bold rounded-md hover:bg-amber-600 transition-colors shadow-sm">
                              <RotateCcw className="h-3.5 w-3.5" />Revoke
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
