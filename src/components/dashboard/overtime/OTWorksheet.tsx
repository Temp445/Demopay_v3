import React, { useState, useEffect, useMemo } from 'react';
import {
  Play, Calendar, Search, RefreshCcw, Info, Loader2,
  Calculator
} from 'lucide-react';
import { useOTProcessingStore } from '../../../stores/otProcessingStore';
import { useOTStructuresStore } from '../../../stores/otStructuresStore';
import { validateAuth } from '../../../stores/utils/storeUtils';
import { 
  getOTStructureWithComponents, 
  calculateTotalOTAmount, 
  getStandardMonthlyHours 
} from '../../../lib/otManagement';
import { getOvertimePolicies } from '../../../lib/overtime';
import type { OTComponent } from '../../../types/overtime';
import toast from 'react-hot-toast';


function formatOTDuration(hours: number): string {
  const totalMins = Math.round(hours * 60);
  if (totalMins < 60) return `${totalMins} mins`;
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export default function OTWorksheet() {
  const {
    eligibleEmployees, loading,
    fetchEligibleEmployees, createProcess, calculateProcess,
    componentNameToId
  } = useOTProcessingStore();
  const { structures, fetchStructures } = useOTStructuresStore();

  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
    const [structuresMap, setStructuresMap] = useState<Record<string, OTComponent[]>>({});
  const [loadingComponents, setLoadingComponents] = useState(false);

  // Date Handling Mode
  const [dateMode, setDateMode] = useState<'calendar' | 'payroll_period'>('calendar');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const [standardMonthlyHours, setStandardMonthlyHours] = useState(208);
  const [globalMultiplier, setGlobalMultiplier] = useState(1.00);
  const [allPolicies, setAllPolicies] = useState<any[]>([]);

  const [selectedPolicyId, setSelectedPolicyId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [processing, setProcessing] = useState(false);

  // Default to current month
  useEffect(() => {
    fetchStructures();
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    // Format as YYYY-MM-DD using local time to avoid timezone shifts
    const formatDate = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    setPeriodStart(formatDate(firstDay));
    setPeriodEnd(formatDate(lastDay));
    const loadInitialData = async () => {
      const auth = await validateAuth();
      if (!auth.isAuthenticated || !auth.tenantId) return;

      const hours = await getStandardMonthlyHours();
      setStandardMonthlyHours(hours);

      const policies = await getOvertimePolicies();
      setAllPolicies(policies);
      const activePolicies = policies.filter(p => p.enabled && p.is_active !== false);
      const defaultPolicy = activePolicies.find(p => p.is_default) || activePolicies[0];
      if (defaultPolicy) {
        setSelectedPolicyId(defaultPolicy.id);
      }
      
      const config = policies.find(p => p.is_default) || policies[0];
      setGlobalMultiplier(config?.global_multiplier || 1.00);
    };

    loadInitialData();
  }, [fetchStructures]);

  // Sync dates based on month/year if in payroll_period mode
  useEffect(() => {
    if (dateMode === 'payroll_period') {
      const start = new Date(selectedYear, selectedMonth, 1);
      const end = new Date(selectedYear, selectedMonth + 1, 0);
      
      const formatDate = (d: Date) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };

      setPeriodStart(formatDate(start));
      setPeriodEnd(formatDate(end));
    }
  }, [dateMode, selectedMonth, selectedYear]);

  // Fetch eligible employees on date change
  useEffect(() => {
    const load = async () => {
      if (!periodStart || !periodEnd) return;
      
      const auth = await validateAuth();
      if (auth.isAuthenticated && auth.tenantId) {
        await fetchEligibleEmployees(auth.tenantId, periodStart, periodEnd);
      }
    };
    load();
  }, [periodStart, periodEnd, fetchEligibleEmployees]);

  // Fetch structure components for all unique structures in eligible employees
  useEffect(() => {
    const load = async () => {
      const uniqueStructureIds = Array.from(new Set(eligibleEmployees.map(e => e.ot_structure_id).filter(Boolean))) as string[];
      if (!uniqueStructureIds.length) { setStructuresMap({}); return; }
      
      setLoadingComponents(true);
      try {
        const auth = await validateAuth();
        if (auth.isAuthenticated && auth.tenantId) {
          const newMap: Record<string, OTComponent[]> = {};
          await Promise.all(uniqueStructureIds.map(async (id) => {
            const structure = await getOTStructureWithComponents(id, auth.tenantId!);
            newMap[id] = structure?.components?.filter(c => c.is_active) || [];
          }));
          setStructuresMap(newMap);
        }
      } catch (err) {
        console.error('Failed to load structure components', err);
        setStructuresMap({});
      } finally {
        setLoadingComponents(false);
      }
    };
    load();
  }, [eligibleEmployees]);

  // calculation removed as it's now handled by store but worksheet needs preview
  const getCleanRefName = (name: string) => name.replace(/[\[\]]/g, '').trim().toLowerCase();

  const getMasterValue = (empValues: Record<string, number> | undefined, comp: OTComponent): number | null => {
    if (!empValues || comp.calculation_type !== 'percentage' || !comp.percentage_of) return null;
    
    // Support for "Gross Salary"
    const ref = comp.percentage_of.toLowerCase().trim();
    if (ref === 'gross salary' || ref === 'gross pay' || ref === 'gross') {
       // Ideally store should provide this, but we can sum earnings here if needed
       return Object.values(empValues).reduce((sum, val) => sum + (Number(val) || 0), 0);
    }

    const compId = componentNameToId[getCleanRefName(comp.percentage_of)];
    if (!compId) return null;
    
    return empValues[compId] ?? null;
  };

  const employeesWithAmounts = useMemo(() => {
    return eligibleEmployees.map(emp => {
      const empStructureComps = emp.ot_structure_id ? (structuresMap[emp.ot_structure_id] || []) : [];
      if (!empStructureComps.length) return { ...emp, componentAmounts: [], totalAmount: 0 };
      
      const componentValues = new Map<string, number>();
      for (const comp of empStructureComps) {
        if (comp.calculation_type === 'percentage' && comp.percentage_of) {
          const masterVal = getMasterValue(emp.masterValues, comp);
          if (masterVal !== null) {
            componentValues.set(comp.id, masterVal);
          } else {
            componentValues.set(comp.id, comp.value);
          }
        } else {
          const userValue = emp.componentValues?.get(comp.id);
          componentValues.set(comp.id, userValue !== undefined ? userValue : comp.value);
        }
      }

      const { components: processedComponents, total } = calculateTotalOTAmount(
        empStructureComps,
        emp.total_ot_hours,
        componentValues,
        standardMonthlyHours,
        globalMultiplier
      );
      return { ...emp, componentAmounts: processedComponents, totalAmount: total };
    });
  }, [eligibleEmployees, structuresMap, standardMonthlyHours, componentNameToId]);

  const filteredEmployees = useMemo(() => {
    let result = employeesWithAmounts;
    if (selectedPolicyId) {
      const defaultPolicyId = allPolicies.find(p => p.is_default)?.id;
      result = result.filter(emp => (emp.applied_policy_id || defaultPolicyId) === selectedPolicyId);
    } else {
      // If no policy is selected (e.g., all policies disabled), show no employees
      return [];
    }
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      result = result.filter(emp =>
        emp.employee_name.toLowerCase().includes(lower) ||
        emp.employee_code.toLowerCase().includes(lower) ||
        (emp.department && emp.department.toLowerCase().includes(lower))
      );
    }
    return result;
  }, [employeesWithAmounts, searchTerm, selectedPolicyId, allPolicies]);


  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedIds(e.target.checked ? filteredEmployees.map(emp => emp.employee_id) : []);
  };

  const handleSelectOne = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleProcess = async () => {
    if (selectedIds.length === 0) { toast.error('Please select at least one employee'); return; }
    setProcessing(true);
    try {
      const selectedPolicy = allPolicies.find(p => p.id === selectedPolicyId);
      const processId = await createProcess({
        process_name: `OT Batch ${periodStart} to ${periodEnd}`,
        processing_period_start: periodStart,
        processing_period_end: periodEnd,
        processing_mode: 'standalone',
        ot_structure_id: selectedPolicy?.ot_structure_id || undefined
      });
      await calculateProcess(processId, selectedIds);
      toast.success(`OT processed for ${selectedIds.length} employee(s)`);
      setSelectedIds([]);
    } catch (error: any) {
      toast.error(error?.message || 'Processing failed');
    } finally {
      setProcessing(false);
    }
  };


  return (
    <div className="space-y-4">
      {/* Filter Card */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Period Start
            </label>
            <input 
              type="date" 
              value={periodStart} 
              onChange={e => setPeriodStart(e.target.value)}
              className="block w-full border border-slate-200 rounded-lg bg-slate-50 py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow" 
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Period End
            </label>
            <input 
              type="date" 
              value={periodEnd} 
              onChange={e => setPeriodEnd(e.target.value)}
              className="block w-full border border-slate-200 rounded-lg bg-slate-50 py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow" 
            />
          </div>
          <div>
          <label className="md:col-span-1 col-span-2 block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
            Filter Policy
          </label>
          <select 
            value={selectedPolicyId} 
            onChange={e => setSelectedPolicyId(e.target.value)}
            className="block w-full border border-slate-200 rounded-lg bg-slate-50 py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow"
          >
            {allPolicies.map(p => (
              <option key={p.id} value={p.id} disabled={!p.enabled || p.is_active === false}>
                {p.name} {(!p.enabled || p.is_active === false) && '(Disabled)'}
              </option>
            ))}
          </select>
        </div>
        </div>
        
      </div>

      {/* Search + Action Row */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-slate-400" />
          </div>
          <input 
            type="text" 
            placeholder="Search employee..."
            value={searchTerm} 
            onChange={e => setSearchTerm(e.target.value)}
            className="block w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-lg bg-white text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow" 
          />
        </div>

        <button 
          onClick={handleProcess} 
          disabled={processing || selectedIds.length === 0}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors shrink-0"
        >
          {processing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          <span className="hidden sm:inline">{processing ? 'Processing...' : `Process (${selectedIds.length})`}</span>
          <span className="sm:hidden">{selectedIds.length}</span>
        </button>
      </div>

      {/* Worksheet Table */}
      <div className="bg-white border rounded-2xl overflow-hidden shadow-xl shadow-slate-100/50">
        {loading || loadingComponents ? (
          <div className="py-24 flex flex-col items-center justify-center gap-4">
            <div className="relative">
              <div className="h-14 w-14 rounded-full border-4 border-indigo-100 border-t-indigo-600 animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Calculator className="h-5 w-5 text-indigo-600" />
              </div>
            </div>
            <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">
              {loading ? 'Fetching approved overtime records...' : 'Loading structure components...'}
            </p>
          </div>
        ) : filteredEmployees.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50/50 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <tr>
                  <th className="px-5 py-4 text-left w-10">
                    <input type="checkbox"
                      checked={selectedIds.length === filteredEmployees.length && filteredEmployees.length > 0}
                      onChange={handleSelectAll}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4" />
                  </th>
                  <th className="px-5 py-4 text-left">Code</th>
                  <th className="px-5 py-4 text-left min-w-[200px]">Employee Name</th>
                  <th className="px-5 py-4 text-left">Department</th>
                  <th className="px-5 py-4 text-center">OT Hours</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-50">
                {filteredEmployees.map(emp => (
                  <tr key={emp.employee_id}
                    className={`group hover:bg-indigo-50/30 transition-all ${selectedIds.includes(emp.employee_id) ? 'bg-indigo-50/20' : ''}`}>
                    <td className="px-5 py-4">
                      <input type="checkbox"
                        checked={selectedIds.includes(emp.employee_id)}
                        onChange={() => handleSelectOne(emp.employee_id)}
                        className="rounded border-slate-300 text-indigo-600 h-4 w-4" />
                    </td>

                    {/* Employee Code */}
                    <td className="px-5 py-4 whitespace-nowrap text-xs font-mono text-slate-900 font-black uppercase tracking-tight">
                      {emp.employee_code}
                    </td>

                    {/* Name */}
                    <td className="px-5 py-4 whitespace-nowrap">
                      <div className="text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                        {emp.employee_name}
                      </div>
                    </td>

                    {/* Department */}
                    <td className="px-5 py-4 text-xs text-slate-500 font-bold uppercase tracking-wider">
                      {emp.department || 'General'}
                    </td>

                    {/* OT Hours */}
                    <td className="px-5 py-4 text-center whitespace-nowrap">
                      <span className="inline-flex items-center px-4 py-1.5 rounded-full text-xs font-black bg-slate-900 text-white shadow-lg shadow-slate-200" title={`${emp.total_ot_hours.toFixed(2)} decimal hours`}>
                        {formatOTDuration(emp.total_ot_hours)}
                      </span>
                    </td>

                  </tr>
                ))}
              </tbody>


            </table>
          </div>
        ) : (
          <div className="text-center py-16 px-6">
            <div className="bg-blue-50 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Info className="h-8 w-8 text-blue-400" />
            </div>
            <h4 className="text-base font-semibold text-slate-700 mb-2">No approved OT records found</h4>
            <p className="text-sm text-slate-400 max-w-xs mx-auto leading-relaxed">
              Ensure employees have <strong className="text-slate-600">Approved</strong> overtime in the OT Approvals module for the selected date range.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
