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
import { getGlobalOvertimeConfig } from '../../../lib/overtime';
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
  const [selectedStructureId, setSelectedStructureId] = useState('');
  const [structureComponents, setStructureComponents] = useState<OTComponent[]>([]);
  const [loadingComponents, setLoadingComponents] = useState(false);

  // Date Handling Mode
  const [dateMode, setDateMode] = useState<'calendar' | 'payroll_period'>('calendar');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const [standardMonthlyHours, setStandardMonthlyHours] = useState(208);
  const [globalMultiplier, setGlobalMultiplier] = useState(1.00);

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
    
    getStandardMonthlyHours().then(hours => setStandardMonthlyHours(hours));
    getGlobalOvertimeConfig().then(config => setGlobalMultiplier(config?.global_multiplier || 1.00));
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

  // Fetch structure components on structure change
  useEffect(() => {
    const load = async () => {
      if (!selectedStructureId) { setStructureComponents([]); return; }
      setLoadingComponents(true);
      try {
        const auth = await validateAuth();
        if (auth.isAuthenticated && auth.tenantId) {
          const structure = await getOTStructureWithComponents(selectedStructureId, auth.tenantId);
          setStructureComponents(structure?.components?.filter(c => c.is_active) || []);
        }
      } catch (err) {
        console.error('Failed to load structure components', err);
        setStructureComponents([]);
      } finally {
        setLoadingComponents(false);
      }
    };
    load();
  }, [selectedStructureId]);

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
      if (!structureComponents.length) return { ...emp, componentAmounts: [], totalAmount: 0 };
      
      const componentValues = new Map<string, number>();
      for (const comp of structureComponents) {
        if (comp.calculation_type === 'percentage' && comp.percentage_of) {
          // Use the employee's master value as base for percentage calculation
          const masterVal = getMasterValue(emp.masterValues, comp);
          if (masterVal !== null) {
            componentValues.set(comp.id, masterVal);
          } else {
            componentValues.set(comp.id, comp.value);
          }
        } else {
          // Handle manual overrides from worksheet if any (though usually for fixed/editable)
          const userValue = emp.componentValues?.get(comp.id);
          componentValues.set(comp.id, userValue !== undefined ? userValue : comp.value);
        }
      }

      const { components: processedComponents, total } = calculateTotalOTAmount(
        structureComponents,
        emp.total_ot_hours,
        componentValues,
        standardMonthlyHours,
        globalMultiplier
      );
      return { ...emp, componentAmounts: processedComponents, totalAmount: total };
    });
  }, [eligibleEmployees, structureComponents, standardMonthlyHours, componentNameToId]);

  const filteredEmployees = useMemo(() => {
    if (!searchTerm) return employeesWithAmounts;
    const lower = searchTerm.toLowerCase();
    return employeesWithAmounts.filter(emp =>
      emp.employee_name.toLowerCase().includes(lower) ||
      emp.employee_code.toLowerCase().includes(lower) ||
      (emp.department && emp.department.toLowerCase().includes(lower))
    );
  }, [employeesWithAmounts, searchTerm]);


  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedIds(e.target.checked ? filteredEmployees.map(emp => emp.employee_id) : []);
  };

  const handleSelectOne = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleProcess = async () => {
    if (!selectedStructureId) { toast.error('Please select an OT structure first'); return; }
    if (selectedIds.length === 0) { toast.error('Please select at least one employee'); return; }
    setProcessing(true);
    try {
      const processId = await createProcess({
        process_name: `OT Batch ${periodStart} to ${periodEnd}`,
        processing_period_start: periodStart,
        processing_period_end: periodEnd,
        processing_mode: 'standalone',
        ot_structure_id: selectedStructureId
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
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Calendar className="inline h-4 w-4 mr-1 text-slate-400" /> Period Start
            </label>
            <input 
              type="date" 
              value={periodStart} 
              onChange={e => setPeriodStart(e.target.value)}
              className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" 
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Calendar className="inline h-4 w-4 mr-1 text-slate-400" /> Period End
            </label>
            <input 
              type="date" 
              value={periodEnd} 
              onChange={e => setPeriodEnd(e.target.value)}
              className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" 
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <RefreshCcw className="inline h-4 w-4 mr-1 text-slate-400" /> OT Structure
            </label>
            <select 
              value={selectedStructureId} 
              onChange={e => setSelectedStructureId(e.target.value)}
              className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            >
              <option value="">Select Structure</option>
              {structures.filter(s => s.is_active).map(s => (
                <option key={s.id} value={s.id}>{s.structure_name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="relative w-full md:w-96">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          <input 
            type="text" 
            placeholder="Search by employee name or code..."
            value={searchTerm} 
            onChange={e => setSearchTerm(e.target.value)}
            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" 
          />
        </div>

        <button 
          onClick={handleProcess} 
          disabled={processing || selectedIds.length === 0 || !selectedStructureId}
          className="inline-flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          {processing ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Play className="h-4 w-4 mr-2" />
          )}
          {processing ? 'Processing...' : `Process Selected (${selectedIds.length})`}
        </button>
      </div>

      {/* Worksheet Table */}
      <div className="bg-white border rounded-2xl overflow-hidden shadow-xl shadow-slate-100/50">
        {loading ? (
          <div className="py-24 flex flex-col items-center justify-center gap-4">
            <div className="relative">
              <div className="h-14 w-14 rounded-full border-4 border-indigo-100 border-t-indigo-600 animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Calculator className="h-5 w-5 text-indigo-600" />
              </div>
            </div>
            <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Fetching approved overtime records...</p>
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
          <div className="text-center py-24 px-4 bg-gray-50/20">
            <div className="bg-white w-24 h-24 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-xl border border-gray-100">
              <Info className="h-12 w-12 text-blue-200" />
            </div>
            <h4 className="text-2xl font-semibold text-gray-900 mb-3">No approved OT records found</h4>
            <p className="text-gray-400 max-w-sm mx-auto font-medium leading-relaxed">
              Ensure employees have <strong>Approved</strong> overtime in the OT Approvals module for the selected date range.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
