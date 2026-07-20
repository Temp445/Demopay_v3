import React, { useEffect, useState } from 'react';
import { Trash2, CheckCircle, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { PayrollEntry, usePayrollStore } from '../../../stores/payrollStore';
// Import the advance integration helpers
import { 
  markInstallmentsAsDeducted, 
  extractAdvanceInstallmentIds 
} from '../../../lib/advancePayrollIntegration'; 
import { supabase } from '../../../lib/supabase';
import { finalizeOTProcess } from '../../../lib/otManagement';
import { sendPayslipEmail } from '../../../lib/payslipEmailSender';
import { useSettingsStore } from '../../../stores/settingsStore';

interface PayrollListProps {
  filters: {
    period_start: string;
    period_end: string;
    status: string;
    department: string;
    cadre: string;
    employeeSearch: string;
  };
  entries: PayrollEntry[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  lastRefresh: number;
}

// In-memory cache for OT process lookup during bulk operations
const otProcessCache: { [key: string]: any } = {};

export default function PayrollList({ filters, entries, loading, error, onRefresh, lastRefresh }: PayrollListProps) {
  const { updatePayrollEntry, deletePayrollEntry } = usePayrollStore();
  const { companySettings, fetchCompanySettings } = useSettingsStore();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const isAutoSendEnabled = (companySettings as any)?.enable_send_payslip_on_mark_paid ?? false;

  useEffect(() => {
    fetchCompanySettings();
  }, [fetchCompanySettings]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isProcessingBulk, setIsProcessingBulk] = useState(false);
  const [empDispatchStatus, setEmpDispatchStatus] = useState<{
    [empId: string]: {
      status: 'sending' | 'success' | 'error';
      progress: number;
      message?: string;
    };
  }>({});
  const [sortConfig, setSortConfig] = useState<{ key: 'employee' | 'earnings' | 'total' | 'deductions', direction: 'asc' | 'desc' }>({ key: 'employee', direction: 'asc' });

  const handleSort = (key: 'employee' | 'earnings' | 'total' | 'deductions') => {
    setSortConfig(current => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  useEffect(() => {
    setSelectedIds(new Set());
  }, [filters.period_start, filters.period_end, lastRefresh]);

  const handleDelete = async (id: string) => {
    try {
      await deletePayrollEntry(id);
      onRefresh();
      setShowDeleteConfirm(null);
    } catch (err) {
      console.error('Failed to delete payroll entry:', err);
    }
  };

  const processStatusUpdate = async (id: string, newStatus: PayrollEntry['status'], cachedUserId?: string, onProgress?: (empName: string, success: boolean) => void) => {
    const currentEntry = entries.find(e => e.id === id);
    const empName = currentEntry?.employee?.name || 'Employee';
    
    if (newStatus === 'Paid' && currentEntry && currentEntry.status !== 'Paid') {
      if (currentEntry.deduction_components && currentEntry.deduction_components.length > 0) {
        const installmentIds = extractAdvanceInstallmentIds(currentEntry.deduction_components);
        if (installmentIds.length > 0) {
          console.log('Finalizing advance deductions for payroll:', id);
          await markInstallmentsAsDeducted(id, installmentIds);
        }
      }

      // Check for linked OT process with in-memory caching for lightning fast performance
      const cacheKey = `${currentEntry.period_start}_${currentEntry.period_end}_${currentEntry.tenant_id}`;
      let otProcess = otProcessCache[cacheKey];
      if (otProcess === undefined) {
        const { data } = await supabase
          .from('ot_processing')
          .select('id, tenant_id')
          .eq('processing_period_start', currentEntry.period_start)
          .eq('processing_period_end', currentEntry.period_end)
          .eq('processing_mode', 'linked')
          .eq('tenant_id', currentEntry.tenant_id)
          .maybeSingle();
        otProcess = data || null;
        otProcessCache[cacheKey] = otProcess;
      }

      if (otProcess) {
        console.log('Finalizing linked OT process:', otProcess.id);
        await finalizeOTProcess(otProcess.id, otProcess.tenant_id);

        const { error: dataError } = await supabase
          .from('ot_processed_data')
          .update({ 
            processing_status: 'finalized', 
            updated_at: new Date().toISOString() 
          })
          .eq('ot_processing_id', otProcess.id)
          .eq('employee_id', currentEntry.employee_id);

        if (dataError) {
          console.error('Failed to auto-approve individual OT record:', dataError);
        }
      }

      // High-speed Auto Send Payslip
      if (isAutoSendEnabled && currentEntry.tenant_id) {
        let uid = cachedUserId;
        if (!uid) {
          const { data } = await supabase.auth.getSession();
          uid = data?.session?.user?.id || '';
        }
        try {
          const res = await sendPayslipEmail(currentEntry, currentEntry.tenant_id, uid);
          if (res.success) {
            onProgress?.(empName, true);
          } else {
            onProgress?.(empName, false);
          }
        } catch (err) {
          onProgress?.(empName, false);
        }
      } else {
        onProgress?.(empName, true);
      }
    }

    await updatePayrollEntry(id, {
      status: newStatus,
      payment_date: newStatus === 'Paid' ? new Date().toISOString() : null
    });
  };

  const handleStatusUpdate = async (id: string, newStatus: PayrollEntry['status']) => {
    try {
      const targetEntry = entries.find(e => e.id === id);
      if (!targetEntry) return;
      const empId = targetEntry.employee?.id || targetEntry.employee_id;

      if (newStatus === 'Paid' && isAutoSendEnabled) {
        setEmpDispatchStatus(prev => ({
          ...prev,
          [empId]: { status: 'sending', progress: 15, message: 'Auto-sending payslip...' }
        }));
      }

      const timer = (newStatus === 'Paid' && isAutoSendEnabled) ? setInterval(() => {
        setEmpDispatchStatus(prev => {
          const current = prev[empId];
          if (current && current.status === 'sending' && current.progress < 90) {
            return { ...prev, [empId]: { ...current, progress: current.progress + 20 } };
          }
          return prev;
        });
      }, 500) : null;

      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id || '';

      await processStatusUpdate(id, newStatus, userId, (name, success) => {
        if (newStatus === 'Paid' && isAutoSendEnabled) {
          if (timer) clearInterval(timer);
          setEmpDispatchStatus(prev => ({
            ...prev,
            [empId]: success 
              ? { status: 'success', progress: 100, message: 'Payslip Sent' }
              : { status: 'error', progress: 100, message: 'Delivery Failed' }
          }));

          if (success) {
            setTimeout(() => {
              setEmpDispatchStatus(prev => {
                const next = { ...prev };
                delete next[empId];
                return next;
              });
            }, 3000);
          }
        }
      });

      if (newStatus !== 'Paid') {
        onRefresh();
      }
    } catch (err) {
      console.error('Failed to update payroll status:', err);
    }
  };

  const toggleSelection = (id: string) => {
    const entry = entries.find(e => e.id === id);
    if (entry?.status === 'Paid') return;

    const newSelection = new Set(selectedIds);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedIds(newSelection);
  };

  const toggleAll = () => {
    const selectableEntries = entries.filter(e => e.status !== 'Paid');
    if (selectableEntries.length === 0) return;

    if (selectedIds.size === selectableEntries.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableEntries.map(e => e.id)));
    }
  };

  const handleBulkMarkPaid = async () => {
    if (selectedIds.size === 0) return;
    
    const entriesToUpdate = entries.filter(e => selectedIds.has(e.id) && e.status !== 'Paid');
    const alreadyPaidCount = selectedIds.size - entriesToUpdate.length;
    
    if (entriesToUpdate.length === 0) {
      toast.error('Selected entries are already marked as Paid.');
      return;
    }

    if (alreadyPaidCount > 0) {
      toast.info(`Skipping ${alreadyPaidCount} entries that are already Paid.`);
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id || '';

    setIsProcessingBulk(true);
    let successCount = 0;
    let failCount = 0;

    setEmpDispatchStatus(prev => {
      const next = { ...prev };
      entriesToUpdate.forEach(entry => {
        const empId = entry.employee?.id || entry.employee_id;
        next[empId] = { status: 'sending', progress: 15, message: isAutoSendEnabled ? 'Generating & Sending...' : 'Marking Paid...' };
      });
      return next;
    });

    const progressTimer = setInterval(() => {
      setEmpDispatchStatus(prev => {
        let changed = false;
        const next = { ...prev };
        Object.keys(next).forEach(empId => {
          if (next[empId].status === 'sending' && next[empId].progress < 90) {
            next[empId] = { ...next[empId], progress: next[empId].progress + 15 };
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }, 400);

    try {
      const CHUNK_SIZE = 15;
      for (let i = 0; i < entriesToUpdate.length; i += CHUNK_SIZE) {
        const chunk = entriesToUpdate.slice(i, i + CHUNK_SIZE);

        await Promise.all(
          chunk.map(async (entry) => {
            const empId = entry.employee?.id || entry.employee_id;
            try {
              await processStatusUpdate(entry.id, 'Paid', userId, (name, success) => {
                if (success) successCount++;
                else failCount++;
                setEmpDispatchStatus(prev => ({
                  ...prev,
                  [empId]: success
                    ? { status: 'success', progress: 100, message: isAutoSendEnabled ? 'Sent Successfully' : 'Marked Paid' }
                    : { status: 'error', progress: 100, message: isAutoSendEnabled ? 'Delivery Failed' : 'Update Failed' }
                }));

                if (success) {
                  setTimeout(() => {
                    setEmpDispatchStatus(prev => {
                      const next = { ...prev };
                      delete next[empId];
                      return next;
                    });
                  }, 3000);
                }
              });
              if (!isAutoSendEnabled) {
                successCount++;
                setEmpDispatchStatus(prev => ({
                  ...prev,
                  [empId]: { status: 'success', progress: 100, message: 'Marked Paid' }
                }));

                setTimeout(() => {
                  setEmpDispatchStatus(prev => {
                    const next = { ...prev };
                    delete next[empId];
                    return next;
                  });
                }, 3000);
              }
            } catch (e) {
              failCount++;
              setEmpDispatchStatus(prev => ({
                ...prev,
                [empId]: { status: 'error', progress: 100, message: 'Update Failed' }
              }));
            }
          })
        );
      }
      
      clearInterval(progressTimer);

      if (failCount === 0) {
        toast.success(`Successfully marked ${entriesToUpdate.length} entries as Paid${isAutoSendEnabled ? ' and dispatched payslips' : ''}!`);
      } else {
        toast.success(`Completed ${entriesToUpdate.length} entries (${failCount} payslip dispatches failed)`);
      }

      setSelectedIds(new Set());

    } catch (error) {
      clearInterval(progressTimer);
      console.error('Failed to process bulk mark paid:', error);
      toast.error('Some entries failed to update. Please refresh and try again.');
    } finally {
      setIsProcessingBulk(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    
    // Filter out Paid entries
    const entriesToDelete = entries.filter(e => selectedIds.has(e.id) && e.status !== 'Paid');
    const paidEntriesCount = selectedIds.size - entriesToDelete.length;
    
    if (entriesToDelete.length === 0) {
      toast.error('Paid entries cannot be deleted.');
      return;
    }

    const message = paidEntriesCount > 0 
      ? `Are you sure you want to delete ${entriesToDelete.length} entries? (${paidEntriesCount} Paid entries will be skipped)`
      : `Are you sure you want to delete ${entriesToDelete.length} entries? This action cannot be undone.`;

    if (!window.confirm(message)) return;

    setIsProcessingBulk(true);
    try {
      for (const entry of entriesToDelete) {
        await deletePayrollEntry(entry.id);
      }
      onRefresh();
      setSelectedIds(new Set());
      toast.success(`Successfully deleted ${selectedIds.size} entries`);
    } catch (error) {
      console.error('Failed to process bulk delete:', error);
      toast.error('Some entries failed to delete. Please refresh and try again.');
    } finally {
      setIsProcessingBulk(false);
    }
  };

  const sortedEntries = [...entries].sort((a, b) => {
    let comparison = 0;
    if (sortConfig.key === 'employee') {
      const codeA = a.employee?.employee_code || '';
      const codeB = b.employee?.employee_code || '';
      comparison = codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: 'base' });
    } else if (sortConfig.key === 'earnings') {
      const earningsA = a.base_salary + (a.bonus || 0);
      const earningsB = b.base_salary + (b.bonus || 0);
      comparison = earningsA - earningsB;
    } else if (sortConfig.key === 'total') {
      comparison = (a.total_amount || 0) - (b.total_amount || 0);
    } else if (sortConfig.key === 'deductions') {
      comparison = (a.deductions || 0) - (b.deductions || 0);
    }
    
    return sortConfig.direction === 'asc' ? comparison : -comparison;
  });

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md bg-red-50 p-4">
        <div className="text-sm text-red-700">{error}</div>
      </div>
    );
  }

  return (
    <div className="mt-8 flex flex-col relative min-h-[500px]">
      {selectedIds.size > 0 && (
        <div className="mb-4 flex items-center justify-between bg-indigo-50 p-3 rounded-lg border border-indigo-100">
          <span className="text-sm font-medium text-indigo-800">
            {selectedIds.size} {selectedIds.size === 1 ? 'item' : 'items'} selected
          </span>
          <div className="flex gap-2">
            <button
              onClick={handleBulkMarkPaid}
              disabled={isProcessingBulk}
              className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
            >
              <CheckCircle className="h-4 w-4 mr-1.5" />
              Mark Paid
            </button>
            <button
              onClick={handleBulkDelete}
              disabled={isProcessingBulk}
              className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4 mr-1.5" />
              Delete
            </button>
          </div>
        </div>
      )}

      <div className="-my-2 -mx-4 overflow-x-auto sm:-mx-6 lg:-mx-8">
        <div className="inline-block min-w-full py-2 align-middle md:px-6 lg:px-8">
          <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
            {entries.length === 0 ? (
               <div className="p-8 text-center text-gray-500">
                 No payroll entries found for the selected period.
               </div>
            ) : (
              <table className="min-w-full divide-y divide-gray-300">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="relative px-4 sm:w-12 sm:px-6">
                      <input
                        type="checkbox"
                        className="absolute left-4 top-1/2 -mt-2 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 sm:left-6"
                        checked={entries.filter(e => e.status !== 'Paid').length > 0 && selectedIds.size === entries.filter(e => e.status !== 'Paid').length}
                        onChange={toggleAll}
                      />
                    </th>
                    <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-0 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('employee')}>
                      <div className="flex items-center gap-1">
                        Employee
                        {sortConfig.key === 'employee' && (
                          <span className="text-gray-500">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </div>
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                      Period
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('earnings')}>
                      <div className="flex items-center gap-1">
                        Earnings
                        {sortConfig.key === 'earnings' && (
                          <span className="text-gray-500">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </div>
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('deductions')}>
                      <div className="flex items-center gap-1">
                        Deductions
                        {sortConfig.key === 'deductions' && (
                          <span className="text-gray-500">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </div>
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('total')}>
                      <div className="flex items-center gap-1">
                        Total Amount
                        {sortConfig.key === 'total' && (
                          <span className="text-gray-500">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </div>
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                      Status
                    </th>
                    <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {sortedEntries.map((entry) => (
                    <tr key={entry.id} className={selectedIds.has(entry.id) ? 'bg-indigo-50/50' : undefined}>
                      <td className="relative px-4 sm:w-12 sm:px-6">
                        {selectedIds.has(entry.id) && (
                          <div className="absolute inset-y-0 left-0 w-0.5 bg-indigo-600" />
                        )}
                        <input
                          type="checkbox"
                          className={`absolute left-4 top-1/2 -mt-2 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 sm:left-6 ${entry.status === 'Paid' ? 'opacity-50 cursor-not-allowed' : ''}`}
                          value={entry.id}
                          checked={selectedIds.has(entry.id)}
                          disabled={entry.status === 'Paid'}
                          onChange={() => toggleSelection(entry.id)}
                        />
                      </td>
                      <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm sm:pl-0">
                        <div className="flex items-center">
                          <div className="w-full">
                             <div className="flex font-medium text-gray-900 gap-2 items-center">
                              {entry.employee?.name}
                              <span className="inline-flex items-center rounded-md bg-gray-50 px-1.5 py-0.5 text-[11px] font-medium text-gray-800 ring-1 ring-inset ring-gray-500/10">
                                {entry.employee?.employee_code}
                              </span>
                            </div>
                            <div className="text-gray-500 text-xs mt-0.5 mb-1">
                              {entry.employee?.department?.name || 'N/A'}
                              {entry.employee?.role?.name ? ` • ${entry.employee.role.name}` : ''}
                            </div>
                            
                            {/* Inline Progress Bar */}
                            {empDispatchStatus[entry.employee?.id || entry.employee_id] && (
                              <div className="mt-2 pt-1.5 border-t border-gray-100 max-w-xs animate-fadeIn">
                                <div className="flex items-center justify-between text-[11px] font-bold mb-1">
                                  <span className={`flex items-center gap-1.5 ${
                                    empDispatchStatus[entry.employee?.id || entry.employee_id].status === 'success' ? 'text-emerald-600' :
                                    empDispatchStatus[entry.employee?.id || entry.employee_id].status === 'error' ? 'text-rose-600' : 'text-indigo-600'
                                  }`}>
                                    {empDispatchStatus[entry.employee?.id || entry.employee_id].status === 'sending' && <RefreshCw className="h-3 w-3 animate-spin text-indigo-500 inline" />}
                                    {empDispatchStatus[entry.employee?.id || entry.employee_id].status === 'success' && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 inline" />}
                                    {empDispatchStatus[entry.employee?.id || entry.employee_id].status === 'error' && <AlertCircle className="h-3.5 w-3.5 text-rose-500 inline" />}
                                    {empDispatchStatus[entry.employee?.id || entry.employee_id].message || (empDispatchStatus[entry.employee?.id || entry.employee_id].status === 'sending' ? 'Sending Payslip...' : '')}
                                  </span>
                                  <span className={`font-extrabold ${
                                    empDispatchStatus[entry.employee?.id || entry.employee_id].status === 'success' ? 'text-emerald-600' :
                                    empDispatchStatus[entry.employee?.id || entry.employee_id].status === 'error' ? 'text-rose-600' : 'text-indigo-600'
                                  }`}>{empDispatchStatus[entry.employee?.id || entry.employee_id].progress}%</span>
                                </div>
                                <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden shadow-inner">
                                  <div 
                                    className={`h-full rounded-full transition-all duration-300 ${
                                      empDispatchStatus[entry.employee?.id || entry.employee_id].status === 'success' ? 'bg-emerald-500 shadow-emerald-500/50' :
                                      empDispatchStatus[entry.employee?.id || entry.employee_id].status === 'error' ? 'bg-rose-500 shadow-rose-500/50' :
                                      'bg-gradient-to-r from-indigo-500 to-violet-600 animate-pulse'
                                    }`}
                                    style={{ width: `${empDispatchStatus[entry.employee?.id || entry.employee_id].progress}%` }}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        <div>{new Date(entry.period_start).toLocaleDateString('en-GB')}</div>
                        <div>{new Date(entry.period_end).toLocaleDateString('en-GB')}</div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        ₹{entry.base_salary.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        ₹{entry.deductions.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-900 font-medium">
                        ₹{entry.total_amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        <span
                          className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                            entry.status === 'Paid'
                              ? 'bg-green-100 text-green-800'
                              : entry.status === 'Pending'
                              ? 'bg-yellow-100 text-yellow-800'
                              : entry.status === 'Approved'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {entry.status}
                        </span>
                      </td>
                      <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                        <div className="flex items-center justify-end gap-4">
                          {entry.status !== 'Paid' && (
                            <button
                              type="button"
                              className="text-green-600 hover:text-green-900"
                              onClick={() => handleStatusUpdate(entry.id, 'Paid')}
                              title="Mark as Paid"
                            >
                              <CheckCircle className="h-4 w-4" />
                            </button>
                          )}
                          {entry.status !== 'Paid' && (
                            <button
                              type="button"
                              className="text-red-600 hover:text-red-900"
                              onClick={() => setShowDeleteConfirm(entry.id)}
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-end justify-center px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"></div>
            <span className="hidden sm:inline-block sm:h-screen sm:align-middle">&#8203;</span>
            <div className="relative inline-block transform overflow-hidden rounded-lg bg-white px-4 pt-5 pb-4 text-left align-bottom shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:p-6 sm:align-middle">
              <div className="sm:flex sm:items-start">
                <div className="mt-3 text-center sm:mt-0 sm:text-left">
                  <h3 className="text-lg font-medium leading-6 text-gray-900">Delete Payroll Entry</h3>
                  <div className="mt-2">
                    <p className="text-sm text-gray-500">
                      Are you sure you want to delete this payroll entry? This action cannot be undone.
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
                <button
                  type="button"
                  className="inline-flex w-full justify-center rounded-md border border-transparent bg-red-600 px-4 py-2 text-base font-medium text-white shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 sm:ml-3 sm:w-auto sm:text-sm"
                  onClick={() => handleDelete(showDeleteConfirm)}
                >
                  Delete
                </button>
                <button
                  type="button"
                  className="mt-3 inline-flex w-full justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-base font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 sm:mt-0 sm:w-auto sm:text-sm"
                  onClick={() => setShowDeleteConfirm(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}