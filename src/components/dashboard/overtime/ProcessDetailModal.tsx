import React, { useEffect, useState, useMemo } from 'react';
import { X, Play, CheckCircle, Download, RefreshCcw, Search, Info, AlertCircle } from 'lucide-react';
import { useOTProcessingStore } from '../../../stores/otProcessingStore';
import toast from 'react-hot-toast';

interface ProcessDetailModalProps {
  processId: string;
  onClose: () => void;
}

function formatOTDuration(hours: number): string {
  const totalMins = Math.round(hours * 60);
  if (totalMins < 60) return `${totalMins} mins`;
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export default function ProcessDetailModal({ processId, onClose }: ProcessDetailModalProps) {
  const {
    currentProcess,
    eligibleEmployees,
    loading,
    fetchProcess,
    loadEligibleEmployees,
    calculateProcess,
    finalizeProcess,
  } = useOTProcessingStore();

  const [activeTab, setActiveTab] = useState<'employees' | 'summary'>('employees');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchProcess(processId);
  }, [processId, fetchProcess]);

  useEffect(() => {
    if (currentProcess && (currentProcess.processing_status === 'draft' || eligibleEmployees.length === 0)) {
      loadEligibleEmployees(processId);
    }
  }, [currentProcess, processId, loadEligibleEmployees]);

  const filteredEmployees = useMemo(() => {
    if (!searchTerm) return eligibleEmployees;
    const lower = searchTerm.toLowerCase();
    return eligibleEmployees.filter(emp => 
      emp.employee_name.toLowerCase().includes(lower) || 
      emp.employee_code.toLowerCase().includes(lower) ||
      (emp.department && emp.department.toLowerCase().includes(lower))
    );
  }, [eligibleEmployees, searchTerm]);

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(filteredEmployees.map(emp => emp.employee_id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleCalculateBulk = async () => {
    if (selectedIds.length === 0) {
      toast.error('Please select employees to calculate');
      return;
    }

    try {
      await calculateProcess(processId, selectedIds);
      toast.success(`Calculated OT for ${selectedIds.length} employees`);
      setSelectedIds([]);
    } catch (error) {
      toast.error('Failed to calculate process');
      console.error(error);
    }
  };

  const handleReprocessRow = async (employeeId: string) => {
    try {
      await calculateProcess(processId, [employeeId]);
      toast.success('Record reprocessed successfully');
    } catch (error) {
      toast.error('Reprocessing failed');
    }
  };

  const handleFinalize = async () => {
    if (!confirm('Are you sure you want to finalize this process? This action cannot be undone.')) {
      return;
    }

    try {
      await finalizeProcess(processId);
      toast.success('Process finalized successfully');
      await fetchProcess(processId);
    } catch (error) {
      toast.error('Failed to finalize process');
      console.error(error);
    }
  };

  if (!currentProcess || (loading && eligibleEmployees.length === 0)) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  const isFinalized = currentProcess.processing_status === 'finalized';
  const canModify = currentProcess.processing_status !== 'finalized';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-7xl w-full max-h-[95vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between mb-8 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl border ${isFinalized ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 'bg-indigo-50 border-indigo-100 text-indigo-600'}`}>
              <Play className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900">{currentProcess.process_name}</h3>
              <p className="text-xs text-slate-500 flex items-center gap-2 mt-1 font-medium">
                <span className={`px-2 py-0.5 rounded border leading-none uppercase font-bold text-[9px] ${
                  isFinalized ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-indigo-50 border-indigo-200 text-indigo-700'
                }`}>
                  {currentProcess.processing_status}
                </span>
                <span className="text-slate-300">•</span>
                <span className="flex items-center gap-1">
                  {new Date(currentProcess.processing_period_start).toLocaleDateString()} - {new Date(currentProcess.processing_period_end).toLocaleDateString()}
                </span>
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-2 hover:bg-slate-100 rounded-lg transition-colors border border-transparent hover:border-slate-200">
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Dashboard Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Processing Status</div>
            <div className={`text-lg font-bold flex items-center gap-2 ${isFinalized ? 'text-emerald-600' : 'text-indigo-600'}`}>
              {isFinalized ? <CheckCircle className="h-5 w-5" /> : <Play className="h-5 w-5" />}
              {currentProcess.processing_status === 'draft' ? 'Worksheet Draft' : 
               currentProcess.processing_status === 'completed' ? 'Ready to Post' : 'Finalized'}
            </div>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Process Mode</div>
            <div className="text-lg font-bold text-slate-900">
              {currentProcess.processing_mode === 'linked' ? 'Payroll Integrated' : 'Standalone'}
            </div>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Employees Count</div>
            <div className="text-lg font-bold text-slate-900">
               <span className="text-indigo-600">{currentProcess.total_employees}</span>
               <span className="text-slate-300 mx-1">/</span>
               <span className="text-slate-500 font-medium">{eligibleEmployees.length}</span>
            </div>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Total Batch Amount</div>
            <div className="text-lg font-bold text-slate-900 flex items-baseline gap-1">
              <span className="text-xs text-slate-400 font-medium">₹</span>
              <span>{currentProcess.processing_status === 'draft' && currentProcess.total_ot_amount === 0 ? '--' : currentProcess.total_ot_amount.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Action Bar */}
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-4 bg-gray-50 p-4 rounded-xl border">
          <div className="flex items-center gap-4 w-full md:w-auto">
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search employee..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
            {selectedIds.length > 0 && canModify && (
              <div className="flex items-center gap-3 animate-in fade-in slide-in-from-left-2">
                <span className="text-sm font-medium text-blue-600 bg-blue-50 px-3 py-1 rounded-full border border-blue-200">
                  {selectedIds.length} Selected
                </span>
                <button
                  onClick={handleCalculateBulk}
                  disabled={loading}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-md transition-all active:scale-95 disabled:opacity-50"
                >
                  <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  Process Selected
                </button>
              </div>
            )}
          </div>

          <div className="flex gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200">
            <button
              onClick={() => setActiveTab('employees')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                activeTab === 'employees' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Employee List ({eligibleEmployees.length})
            </button>
            <button
              onClick={() => setActiveTab('summary')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                activeTab === 'summary' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Batch Summary
            </button>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'employees' && (
          <div className="border rounded-xl overflow-hidden shadow-sm bg-white">
            {eligibleEmployees.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      {canModify && (
                        <th className="px-4 py-3 text-left">
                          <input
                            type="checkbox"
                            checked={selectedIds.length === filteredEmployees.length && filteredEmployees.length > 0}
                            onChange={handleSelectAll}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                        </th>
                      )}
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-widest">
                        Employee Info
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-widest">
                        Department
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-widest">
                        OT Hours
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-widest">
                        Calculated Amount
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-widest">
                        Status
                      </th>
                      {canModify && (
                        <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-widest">
                          Actions
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {filteredEmployees.map((emp) => (
                      <tr key={emp.employee_id} className={`hover:bg-blue-50/30 transition-colors ${selectedIds.includes(emp.employee_id) ? 'bg-blue-50/50' : ''}`}>
                        {canModify && (
                          <td className="px-4 py-4 whitespace-nowrap">
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(emp.employee_id)}
                              onChange={() => handleSelectOne(emp.employee_id)}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                          </td>
                        )}
                        <td className="px-4 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs">
                              {emp.employee_name.charAt(0)}
                            </div>
                            <div>
                              <div className="text-sm font-semibold text-gray-900">{emp.employee_name}</div>
                              <div className="text-xs text-gray-500 font-mono uppercase">{emp.employee_code}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600 italic">
                          {emp.department || 'General'}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-center">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-100" title={`${emp.total_ot_hours.toFixed(2)} decimal hours`}>
                            {formatOTDuration(emp.total_ot_hours)}
                          </span>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-right">
                          <div className="text-sm font-bold text-gray-900">
                            {emp.totalAmount !== undefined ? `₹${emp.totalAmount.toFixed(2)}` : '--'}
                          </div>
                          {emp.processedComponents && emp.processedComponents.length > 0 && (
                            <div className="text-[10px] text-gray-400 mt-0.5">
                              {emp.processedComponents.length} components applied
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-center">
                          {emp.totalAmount !== undefined ? (
                            <span className="flex items-center justify-center gap-1 text-green-600 text-[10px] font-bold uppercase py-1 px-2 bg-green-50 rounded-lg border border-green-100">
                              <CheckCircle className="h-3 w-3" /> Ready
                            </span>
                          ) : (
                            <span className="flex items-center justify-center gap-1 text-gray-400 text-[10px] font-bold uppercase py-1 px-2 bg-gray-50 rounded-lg border border-gray-100">
                              <AlertCircle className="h-3 w-3" /> Pending
                            </span>
                          )}
                        </td>
                        {canModify && (
                          <td className="px-4 py-4 whitespace-nowrap text-right">
                            <button
                              onClick={() => handleReprocessRow(emp.employee_id)}
                              title="Recalculate this record"
                              className="p-1.5 text-blue-500 hover:bg-blue-100 rounded-lg transition-colors border border-transparent hover:border-blue-200"
                            >
                              <RefreshCcw className="h-4 w-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-16 px-4">
                <div className="bg-blue-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Info className="h-8 w-8 text-blue-400" />
                </div>
                <h4 className="text-lg font-bold text-gray-900 mb-1">No eligible employees found</h4>
                <p className="text-gray-500 max-w-sm mx-auto mb-6">
                  Only employees with <strong>Approved</strong> overtime records in the Approvals module for this period will appear in the processing list.
                </p>
                <div className="flex gap-3 justify-center">
                  <button 
                    onClick={() => loadEligibleEmployees(processId)}
                    className="flex items-center gap-2 px-4 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                  >
                    <RefreshCcw className="h-4 w-4" /> Refresh Data
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'summary' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white border p-6 rounded-xl shadow-sm">
              <h4 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-blue-500" />
                Process Configuration
              </h4>
              <div className="space-y-4">
                <div className="flex justify-between border-b pb-3">
                  <span className="text-sm text-gray-500">Selected Structure</span>
                  <span className="text-sm font-bold text-gray-900">{currentProcess.structure?.structure_name || 'N/A'}</span>
                </div>
                <div className="flex justify-between border-b pb-3">
                  <span className="text-sm text-gray-500">Period Start</span>
                  <span className="text-sm font-medium text-gray-900">{new Date(currentProcess.processing_period_start).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between border-b pb-3">
                  <span className="text-sm text-gray-500">Period End</span>
                  <span className="text-sm font-medium text-gray-900">{new Date(currentProcess.processing_period_end).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between border-b pb-3">
                  <span className="text-sm text-gray-500">Calculated Employees</span>
                  <span className="text-sm font-bold text-blue-600">{currentProcess.total_employees}</span>
                </div>
              </div>
            </div>

            {currentProcess.structure && (
              <div className="bg-white border p-6 rounded-xl shadow-sm">
                <h4 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <div className="p-1 bg-green-100 rounded text-green-600"><CheckCircle className="h-4 w-4" /></div>
                  Calculation Strategy
                </h4>
                <div className="text-sm text-gray-600 leading-relaxed italic bg-gray-50 p-4 rounded-lg border">
                  {currentProcess.structure.description || 'Standard calculation methodology applied based on hourly earning components.'}
                </div>
                <div className="mt-6">
                  <h5 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Linked Earning Components</h5>
                  <div className="flex flex-wrap gap-2">
                    {eligibleEmployees[0]?.processedComponents?.map(comp => (
                      <span key={comp.componentId} className="text-[10px] font-bold px-2 py-1 bg-gray-100 text-gray-600 rounded-md border">
                        {comp.componentName}
                      </span>
                    ))}
                    {(eligibleEmployees[0]?.processedComponents?.length || 0) === 0 && (
                      <span className="text-[10px] text-gray-400 italic">No components applied yet. Process to see breakdown.</span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Action Footer */}
        <div className="flex justify-end gap-3 mt-8 pt-6 border-t">
          {canModify && currentProcess.processing_status === 'completed' && (
            <button
              onClick={handleFinalize}
              disabled={loading}
              className="flex items-center gap-2 px-8 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 hover:shadow-lg hover:shadow-emerald-100 transition-all active:scale-95 disabled:opacity-50 font-semibold"
            >
              <CheckCircle className="h-4 w-4" />
              Finalize Batch
            </button>
          )}

          <button
            onClick={onClose}
            className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors active:scale-95"
          >
            Close Worksheet
          </button>
        </div>
      </div>
    </div>
  );
}
