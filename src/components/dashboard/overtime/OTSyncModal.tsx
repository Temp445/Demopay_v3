import React, { useState, useEffect, useMemo } from 'react';
import { 
  RefreshCw, 
  X, 
  Calendar, 
  Users, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  ChevronRight, 
  Search,
  CheckSquare,
  Square
} from 'lucide-react';
import { getShifts, getShiftAssignments } from '../../../lib/shifts';
import { useOTApprovalsStore } from '../../../stores/otApprovalsStore';
import { getEmployeeOTEligibility } from '../../../lib/otManagement';
import { useAuth } from '../../../contexts/AuthContext';
import toast from 'react-hot-toast';
import type { OTSyncStats, OTSyncProgress } from '../../../lib/otManagement';

interface OTSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  startDate: string;
  endDate: string;
}

type SyncStep = 'shifts' | 'employees' | 'syncing' | 'result';

export default function OTSyncModal({ isOpen, onClose, startDate, endDate }: OTSyncModalProps) {
  const { tenantId } = useAuth();
  const { syncOT } = useOTApprovalsStore();
  const [step, setStep] = useState<SyncStep>('shifts');
  
  // Data State
  const [shifts, setShifts] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Date State (Local override for sync)
  const [syncStartDate, setSyncStartDate] = useState(startDate);
  const [syncEndDate, setSyncEndDate] = useState(endDate);
  
  // Selection State
  const [selectedShiftIds, setSelectedShiftIds] = useState<string[]>([]);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [eligibilityMap, setEligibilityMap] = useState<Record<string, boolean>>({});
  
  // Execution State
  const [syncProgress, setSyncProgress] = useState<OTSyncProgress | null>(null);
  const [syncStats, setSyncStats] = useState<OTSyncStats | null>(null);

  // Load shifts on mount
  useEffect(() => {
    if (isOpen) {
      loadShifts();
      setStep('shifts');
      setSyncStartDate(startDate);
      setSyncEndDate(endDate);
      setSelectedShiftIds([]);
      setSelectedEmployeeIds([]);
      setSyncProgress(null);
      setSyncStats(null);
    }
  }, [isOpen, startDate, endDate]);

  const loadShifts = async () => {
    setLoading(true);
    try {
      const data = await getShifts();
      setShifts(data || []);
    } catch (error) {
      toast.error('Failed to load shifts');
    } finally {
      setLoading(false);
    }
  };

  const loadEmployeesForShifts = async () => {
    if (selectedShiftIds.length === 0) {
      toast.error('Select at least one shift');
      return;
    }
    setLoading(true);
    try {
      const data = await getShiftAssignments(syncStartDate, syncEndDate);
      // Filter assignments by selected shifts and unique employees
      const filteredAssignments = data.filter(a => selectedShiftIds.includes(a.shift_id));
      
      // Get unique employees
      const employeeMap = new Map();
      filteredAssignments.forEach(a => {
        if (a.employee && !employeeMap.has(a.employee_id)) {
          employeeMap.set(a.employee_id, {
            id: a.employee_id,
            name: a.employee.name,
            code: a.employee.employee_code,
            department: a.employee.department
          });
        }
      });
      
      const uniqueEmps = Array.from(employeeMap.values());
      
      // Fetch eligibility for these employees
      if (tenantId) {
        const eligibilityData = await getEmployeeOTEligibility(tenantId);
        const map: Record<string, boolean> = {};
        eligibilityData.forEach(e => {
          map[e.employee_id] = e.is_ot_eligible;
        });
        setEligibilityMap(map);
        
        // Default to all ELIGIBLE employees selected
        const eligibleIds = uniqueEmps
          .filter(e => map[e.id] !== false) // Default to true if no record
          .map(e => e.id);
        setSelectedEmployeeIds(eligibleIds);
      } else {
        setSelectedEmployeeIds(uniqueEmps.map(e => e.id));
      }

      setAssignments(uniqueEmps);
      setStep('employees');
    } catch (error) {
      toast.error('Failed to load employees for selected shifts');
    } finally {
      setLoading(false);
    }
  };

  const filteredEmployees = useMemo(() => {
    if (!employeeSearch) return assignments;
    const lower = employeeSearch.toLowerCase();
    return assignments.filter(e => 
      e.name.toLowerCase().includes(lower) || 
      (e.code && e.code.toLowerCase().includes(lower))
    );
  }, [assignments, employeeSearch]);

  const handleRunSync = async () => {
    if (selectedEmployeeIds.length === 0) {
      toast.error('Select at least one employee');
      return;
    }
    
    setStep('syncing');
    try {
      const stats = await syncOT(
        syncStartDate, 
        syncEndDate, 
        (p) => setSyncProgress(p),
        selectedShiftIds,
        selectedEmployeeIds
      );
      setSyncStats(stats);
      setStep('result');
    } catch (error) {
      toast.error('Sync failed');
      setStep('employees');
    }
  };

  const toggleShift = (id: string, enabled: boolean) => {
    if (!enabled) return;
    setSelectedShiftIds(prev => 
      prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id]
    );
  };

  const toggleEmployee = (id: string) => {
    // Prevent selecting ineligible employees
    if (eligibilityMap[id] === false) return;
    
    setSelectedEmployeeIds(prev => 
      prev.includes(id) ? prev.filter(eid => eid !== id) : [...prev, id]
    );
  };

  const toggleSelectAllShifts = () => {
    const enabledShifts = shifts.filter(s => s.overtime_enabled);
    if (selectedShiftIds.length === enabledShifts.length) {
      setSelectedShiftIds([]);
    } else {
      setSelectedShiftIds(enabledShifts.map(s => s.id));
    }
  };

  const toggleSelectAllEmps = () => {
    const eligibleEmps = assignments.filter(e => eligibilityMap[e.id] !== false);
    if (selectedEmployeeIds.length === eligibleEmps.length) {
      setSelectedEmployeeIds([]);
    } else {
      setSelectedEmployeeIds(eligibleEmps.map(e => e.id));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-indigo-50/30">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600">
              <RefreshCw className={`h-5 w-5 ${step === 'syncing' ? 'animate-spin' : ''}`} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Overtime Sync</h2>
              <div className="flex items-center gap-1.5 text-xs text-indigo-600 font-bold bg-indigo-50 px-2 py-0.5 rounded-full mt-0.5">
                <Calendar className="h-3 w-3" />
                <span>Processing Period</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        {/* Multi-Step Content */}
        <div className="flex-1 overflow-y-auto p-6">
          
          {/* STEP 1: SHIFT SELECTION */}
          {step === 'shifts' && (
            <div className="space-y-6">
              {/* Date Entry Section */}
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 shadow-inner">
                <div className="flex items-center gap-2 mb-3 text-sm font-bold text-gray-700">
                  <Calendar className="h-4 w-4 text-indigo-500" />
                  Select Sync Period
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-1">Start Date</label>
                    <input 
                      type="date"
                      value={syncStartDate || ''}
                      onChange={(e) => setSyncStartDate(e.target.value)}
                      className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-medium text-gray-700"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-1">End Date</label>
                    <input 
                      type="date"
                      value={syncEndDate || ''}
                      onChange={(e) => setSyncEndDate(e.target.value)}
                      className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-medium text-gray-700"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                  <Clock className="h-5 w-5 text-indigo-500" />
                  Step 1: Select Shifts
                </h3>
                <div className="flex items-center gap-4">
                  <button 
                    onClick={toggleSelectAllShifts}
                    className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
                  >
                    {selectedShiftIds.length === shifts.filter(s => s.overtime_enabled).length ? 'Deselect All' : 'Select All'}
                  </button>
                  <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                    {selectedShiftIds.length} Selected
                  </span>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {shifts.map(shift => (
                  <div 
                    key={shift.id}
                    onClick={() => toggleShift(shift.id, shift.overtime_enabled)}
                    className={`
                      relative p-4 rounded-xl border-2 transition-all cursor-pointer flex flex-col
                      ${!shift.overtime_enabled 
                        ? 'bg-gray-50 border-gray-200 grayscale opacity-70 cursor-not-allowed' 
                        : selectedShiftIds.includes(shift.id)
                          ? 'bg-indigo-50 border-indigo-500 shadow-sm'
                          : 'bg-white border-gray-100 hover:border-indigo-200 hover:shadow-sm'
                      }
                    `}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-gray-900">{shift.name}</span>
                      {shift.overtime_enabled ? (
                        selectedShiftIds.includes(shift.id) ? (
                          <CheckSquare className="h-5 w-5 text-indigo-600" />
                        ) : (
                          <Square className="h-5 w-5 text-gray-300" />
                        )
                      ) : (
                        <AlertCircle className="h-5 w-5 text-amber-500" />
                      )}
                    </div>
                    
                    <div className="text-xs text-gray-500 space-y-1">
                      <div className="flex justify-between">
                        <span>Timing</span>
                        <span className="font-medium text-gray-700">{shift.start_time.substring(0,5)} - {shift.end_time.substring(0,5)}</span>
                      </div>
                    </div>

                    {!shift.overtime_enabled && (
                      <div className="mt-3 py-1.5 px-2 bg-amber-50 rounded text-[10px] text-amber-700 border border-amber-100 flex items-center gap-1.5">
                        <AlertCircle className="h-3 w-3" />
                        <span>Shift OT is disabled. Enable it in Shift Settings.</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              
              {shifts.length === 0 && !loading && (
                <div className="py-12 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200">
                  <Clock className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No shifts found</p>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: EMPLOYEE SELECTION */}
          {step === 'employees' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                  <Users className="h-5 w-5 text-indigo-500" />
                  Step 2: Select Employees
                </h3>
                <div className="flex items-center gap-4">
                  <button 
                    onClick={toggleSelectAllEmps}
                    className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
                  >
                    {selectedEmployeeIds.length === assignments.length ? 'Deselect All' : 'Select All'}
                  </button>
                  <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                    {selectedEmployeeIds.length} / {assignments.length} Selected
                  </span>
                </div>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input 
                  type="text"
                  placeholder="Search by name or code..."
                  value={employeeSearch}
                  onChange={(e) => setEmployeeSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                />
              </div>
              
              <div className="border border-gray-100 rounded-xl overflow-hidden divide-y divide-gray-50 max-h-[300px] overflow-y-auto bg-gray-50/30">
                {filteredEmployees.map(emp => (
                  <div 
                    key={emp.id}
                    onClick={() => toggleEmployee(emp.id)}
                    className={`flex items-center gap-4 p-3 hover:bg-white transition-colors cursor-pointer 
                      ${selectedEmployeeIds.includes(emp.id) ? 'bg-white' : ''}
                      ${eligibilityMap[emp.id] === false ? 'opacity-60 grayscale cursor-not-allowed bg-gray-50' : ''}
                    `}
                    title={eligibilityMap[emp.id] === false ? `${emp.name} (${emp.code || 'No Code'}) is not eligible for Overtime Sync` : ""}
                  >
                    {eligibilityMap[emp.id] === false ? (
                      <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0" />
                    ) : selectedEmployeeIds.includes(emp.id) ? (
                      <CheckSquare className="h-5 w-5 text-indigo-600 flex-shrink-0" />
                    ) : (
                      <Square className="h-5 w-5 text-gray-300 flex-shrink-0" />
                    )}
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-gray-900 leading-tight">{emp.name}</p>
                        {eligibilityMap[emp.id] === false && (
                          <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100 flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            Not Eligible
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                        <span className="bg-gray-100 px-1.5 py-0.5 rounded font-mono uppercase text-[10px]">{emp.code}</span>
                        <span className="text-[10px]">•</span>
                        <span>{emp.department}</span>
                      </div>
                    </div>
                  </div>
                ))}

                {filteredEmployees.length === 0 && (
                  <div className="p-8 text-center text-gray-500 italic text-sm">
                    No matching employees found for selected shifts
                  </div>
                )}
              </div>
              
              <button 
                onClick={() => setStep('shifts')}
                className="text-xs font-medium text-gray-400 hover:text-gray-600 flex items-center gap-1"
              >
                ← Back to shifts
              </button>
            </div>
          )}

          {/* STEP 3: SYNCING */}
          {step === 'syncing' && (
            <div className="py-12 space-y-8 text-center">
              <div className="relative inline-block">
                <RefreshCw className="h-16 w-16 text-indigo-600 animate-spin mx-auto" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Users className="h-6 w-6 text-indigo-400" />
                </div>
              </div>
              
              <div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Syncing Overtime Records</h3>
                <p className="text-gray-500 mb-6">Processing attendance logs against shift configurations...</p>
                
                {syncProgress && (
                  <div className="max-w-md mx-auto space-y-3">
                    <div className="flex justify-between text-sm font-medium">
                      <span className="text-indigo-600">Syncing: {syncProgress.employeeName}</span>
                      <span className="text-gray-400">{syncProgress.current} / {syncProgress.total}</span>
                    </div>
                    <div className="w-full bg-gray-100 h-3 rounded-full overflow-hidden border border-gray-200 p-0.5">
                      <div 
                        className="bg-indigo-600 h-full rounded-full transition-all duration-300 shadow-sm"
                        style={{ width: `${(syncProgress.current / syncProgress.total) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 4: RESULT */}
          {step === 'result' && syncStats && (
            <div className="space-y-6">
              <div className="text-center py-4">
                <div className="inline-flex items-center justify-center p-3 bg-green-100 text-green-600 rounded-full mb-4">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900">Sync Complete</h3>
                <p className="text-gray-500">Overtime calculation finished successfully</p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Processed', value: syncStats.processed, color: 'blue' },
                  { label: 'Created', value: syncStats.created, color: 'green' },
                  { label: 'Updated', value: syncStats.updated, color: 'amber' },
                  { label: 'Skipped', value: syncStats.skipped, color: 'gray' },
                ].map((stat, idx) => (
                  <div key={idx} className={`p-4 rounded-2xl bg-${stat.color}-50 border border-${stat.color}-100 text-center`}>
                    <p className={`text-2xl font-black text-${stat.color}-700`}>{stat.value}</p>
                    <p className={`text-[10px] font-bold text-${stat.color}-600 uppercase tracking-widest`}>{stat.label}</p>
                  </div>
                ))}
              </div>

              <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-gray-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-gray-600 leading-relaxed">
                  Only attendance records with both clock-in and clock-out entries were processed. 
                  Existing approved or rejected records were automatically skipped to preserve data integrity.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex justify-end gap-3">
          {step === 'shifts' && (
            <>
              <button 
                onClick={onClose}
                className="px-5 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-xl transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={loadEmployeesForShifts}
                disabled={selectedShiftIds.length === 0 || loading}
                className="px-6 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 disabled:opacity-50 transition-all flex items-center gap-2"
              >
                {loading ? 'Processing...' : 'Next: Select Employees'}
                <ChevronRight className="h-4 w-4" />
              </button>
            </>
          )}

          {step === 'employees' && (
            <>
              <button 
                onClick={() => setStep('shifts')}
                className="px-5 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-xl transition-all"
              >
                Back
              </button>
              <button 
                onClick={handleRunSync}
                disabled={selectedEmployeeIds.length === 0}
                className="px-8 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all flex items-center gap-2"
              >
                Start Syncing
                <RefreshCw className="h-4 w-4" />
              </button>
            </>
          )}

          {step === 'result' && (
            <button 
              onClick={onClose}
              className="px-8 py-2 bg-gray-900 text-white rounded-xl text-sm font-bold shadow-lg shadow-gray-200 hover:bg-black transition-all"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
