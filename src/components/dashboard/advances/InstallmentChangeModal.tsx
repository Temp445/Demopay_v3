import React, { useState, useEffect } from 'react';
import { 
  X, 
  RefreshCw, 
  PlusCircle, 
  ArrowDownToLine, 
  Plus, 
  Minus, 
  Trash2 
} from 'lucide-react';
import { useAdvancesStore } from '../../../stores/advancesStore';
import toast from 'react-hot-toast';
import type { EmployeeAdvance, AdvanceInstallment } from '../../../types/advances';

type RedistributionMethod = 'equal' | 'proportional' | 'last_installment' | 'new_installment';

interface InstallmentChangeModalProps {
  advance: EmployeeAdvance;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface InstallmentEdit {
  installment: AdvanceInstallment;
  newAmount: number;
  isModified: boolean;
  isManual: boolean;
  isNew?: boolean; 
  isDeleted?: boolean;
}

export default function InstallmentChangeModal({
  advance,
  isOpen,
  onClose,
  onSuccess,
}: InstallmentChangeModalProps) {
  const { installments, modifyInstallments, loading } = useAdvancesStore();
  const [installmentEdits, setInstallmentEdits] = useState<InstallmentEdit[]>([]);
  
  const [redistributionMethod, setRedistributionMethod] = useState<RedistributionMethod>('equal');
  const [extendMonths, setExtendMonths] = useState(1);
  const [reason, setReason] = useState('');
  
  const [previewData, setPreviewData] = useState<{
    totalChange: number;
    modifiedCount: number;
    newBalance: number;
  } | null>(null);

  useEffect(() => {
    if (isOpen && installments.length > 0) {
      const edits = installments.map(inst => ({
        installment: inst,
        newAmount: inst.amount,
        isModified: false,
        isManual: false,
        isDeleted: false
      }));
      setInstallmentEdits(edits);
      setReason('');
      setRedistributionMethod('equal');
      setExtendMonths(1);
      setPreviewData({
        totalChange: 0,
        modifiedCount: 0,
        newBalance: advance.remaining_balance
      });
    }
  }, [isOpen, installments, advance.remaining_balance]);

  // --- CORE LOGIC ---
  const calculateDistribution = (
    currentEdits: InstallmentEdit[], 
    method: RedistributionMethod,
    monthCount: number
  ) => {
    // 1. Remove previously generated "New" rows, keep existing (even if deleted)
    let baseEdits = currentEdits.filter(e => !e.isNew);

    // Calculate how much money "freed up" or "needed"
    const manualEdits = baseEdits.filter(e => (e.isManual || e.isDeleted) && e.installment.status === 'scheduled');
    
    // Available targets are scheduled, NON-manual, and NON-deleted rows
    const availableTargets = baseEdits.filter(e => 
      !e.isManual && 
      !e.isDeleted && 
      e.installment.status === 'scheduled'
    );

    const rawChange = manualEdits.reduce((sum, edit) => {
      const currentAmt = edit.isDeleted ? 0 : edit.newAmount;
      return sum + (currentAmt - edit.installment.amount);
    }, 0);

    const amountToDistribute = -rawChange; 
    let newEdits = [...baseEdits];

    if (Math.abs(amountToDistribute) > 0.01) {

      // STRATEGY 1: EQUAL
      if (method === 'equal' && availableTargets.length > 0) {
        const perInstallment = amountToDistribute / availableTargets.length;
        newEdits = newEdits.map(edit => {
          if (!edit.isManual && !edit.isDeleted && edit.installment.status === 'scheduled') {
             const newAmt = Math.max(0, edit.installment.amount + perInstallment);
             return { ...edit, newAmount: newAmt, isModified: Math.abs(newAmt - edit.installment.amount) > 0.01 };
          }
          return edit;
        });
      } 
      
      // STRATEGY 2: PROPORTIONAL
      else if (method === 'proportional' && availableTargets.length > 0) {
        const totalTargetAmt = availableTargets.reduce((sum, t) => sum + t.installment.amount, 0);
        if (totalTargetAmt > 0) {
          newEdits = newEdits.map(edit => {
            if (!edit.isManual && !edit.isDeleted && edit.installment.status === 'scheduled') {
               const prop = edit.installment.amount / totalTargetAmt;
               const newAmt = Math.max(0, edit.installment.amount + (amountToDistribute * prop));
               return { ...edit, newAmount: newAmt, isModified: Math.abs(newAmt - edit.installment.amount) > 0.01 };
            }
            return edit;
          });
        }
      }

      // STRATEGY 3: LAST INSTALLMENT
      else if (method === 'last_installment') {
        const lastIndex = newEdits.findLastIndex(e => !e.isManual && !e.isDeleted && e.installment.status === 'scheduled');
        if (lastIndex !== -1) {
          newEdits = newEdits.map((edit, index) => {
            if (index === lastIndex) {
              const newAmt = Math.max(0, edit.installment.amount + amountToDistribute);
              return { ...edit, newAmount: newAmt, isModified: Math.abs(newAmt - edit.installment.amount) > 0.01 };
            }
            if (!edit.isManual && !edit.isDeleted && edit.installment.status === 'scheduled') {
              return { ...edit, newAmount: edit.installment.amount, isModified: false };
            }
            return edit;
          });
        }
      }

      // STRATEGY 4: MULTIPLE NEW INSTALLMENTS
      else if (method === 'new_installment') {
        if (amountToDistribute > 0) {
          // Reset existing targets
          newEdits = newEdits.map(edit => 
            (!edit.isManual && !edit.isDeleted && edit.installment.status === 'scheduled')
              ? { ...edit, newAmount: edit.installment.amount, isModified: false }
              : edit
          );

          // Loop to create N new months
          const perNewMonth = amountToDistribute / monthCount;
          // Find last valid date for calculation
          const activeBase = baseEdits.filter(e => !e.isDeleted);
          const lastInstallment = activeBase[activeBase.length - 1]?.installment || baseEdits[baseEdits.length-1].installment;
          
          for (let i = 1; i <= monthCount; i++) {
            const date = new Date(lastInstallment.due_month + '-01');
            date.setMonth(date.getMonth() + i);
            const nextMonthStr = date.toISOString().slice(0, 7); 

            newEdits.push({
              installment: {
                id: `temp-new-${i}`, 
                advance_id: lastInstallment.advance_id,
                amount: 0,
                due_month: nextMonthStr,
                status: 'scheduled',
                installment_number: lastInstallment.installment_number + i,
                created_at: '', updated_at: ''
              },
              newAmount: perNewMonth,
              isModified: true,
              isManual: false,
              isNew: true
            });
          }
        }
      }
    } else {
       // Balanced - reset unmodified rows
       newEdits = newEdits.map(edit => 
          (!edit.isManual && !edit.isNew && !edit.isDeleted && edit.installment.status === 'scheduled')
            ? { ...edit, newAmount: edit.installment.amount, isModified: false }
            : edit
       );
    }

    const totalNewAmount = newEdits
      .filter(e => e.installment.status === 'scheduled' && !e.isDeleted)
      .reduce((sum, e) => sum + (e.newAmount - (e.isNew ? 0 : e.installment.amount)), 0);

    const modifiedCount = newEdits.filter(e => (e.isModified || e.isDeleted) && e.installment.status === 'scheduled').length;

    return {
      updatedEdits: newEdits,
      summary: {
        totalChange: totalNewAmount,
        modifiedCount: modifiedCount,
        newBalance: advance.remaining_balance + totalNewAmount,
      }
    };
  };

  // --- HANDLERS ---

  const handleAmountChange = (installmentId: string, newAmountStr: string) => {
    const amount = parseFloat(newAmountStr);
    if (isNaN(amount) || amount < 0) return;

    const cleanEdits = installmentEdits.filter(e => !e.isNew);
    const initialEdits = cleanEdits.map(edit => 
      edit.installment.id === installmentId
        ? {
            ...edit,
            newAmount: amount,
            isModified: Math.abs(amount - edit.installment.amount) > 0.01,
            isManual: true, 
          }
        : edit
    );

    // --- CHECK FOR EXCESS AND RESET METHOD IF NEEDED ---
    const manualEdits = initialEdits.filter(e => (e.isManual || e.isDeleted) && e.installment.status === 'scheduled');
    const rawChange = manualEdits.reduce((sum, edit) => {
      const currentAmt = edit.isDeleted ? 0 : edit.newAmount;
      return sum + (currentAmt - edit.installment.amount);
    }, 0);
    
    // If rawChange is negative (e.g. -1000), we have Excess money.
    const hasExcess = rawChange < -0.01;
    
    let methodToUse = redistributionMethod;
    // If there is NO excess, we cannot use 'new_installment'. Force back to equal.
    if (!hasExcess && redistributionMethod === 'new_installment') {
        methodToUse = 'equal';
        setRedistributionMethod('equal');
    }

    const { updatedEdits, summary } = calculateDistribution(initialEdits, methodToUse, extendMonths);
    setInstallmentEdits(updatedEdits);
    setPreviewData(summary);
  };

  const handleMethodChange = (newMethod: RedistributionMethod) => {
    setRedistributionMethod(newMethod);
    const { updatedEdits, summary } = calculateDistribution(installmentEdits, newMethod, extendMonths);
    setInstallmentEdits(updatedEdits);
    setPreviewData(summary);
  };

  const handleExtendMonthsChange = (delta: number) => {
    const newCount = Math.max(1, extendMonths + delta);
    if (newCount === extendMonths) return;
    
    setExtendMonths(newCount);
    const { updatedEdits, summary } = calculateDistribution(installmentEdits, redistributionMethod, newCount);
    setInstallmentEdits(updatedEdits);
    setPreviewData(summary);
  };

  const handleRemoveNewRow = () => {
    if (extendMonths > 1) {
      handleExtendMonthsChange(-1);
    } else {
      handleMethodChange('equal');
    }
  };

  const handleRemoveExistingRow = (id: string) => {
    const cleanEdits = installmentEdits.filter(e => !e.isNew);
    
    const initialEdits = cleanEdits.map(edit => 
        edit.installment.id === id 
        ? { ...edit, isDeleted: true, isModified: true, newAmount: 0 } 
        : edit
    );

    // --- CHECK FOR EXCESS AND RESET METHOD IF NEEDED ---
    const manualEdits = initialEdits.filter(e => (e.isManual || e.isDeleted) && e.installment.status === 'scheduled');
    const rawChange = manualEdits.reduce((sum, edit) => {
      const currentAmt = edit.isDeleted ? 0 : edit.newAmount;
      return sum + (currentAmt - edit.installment.amount);
    }, 0);
    
    const hasExcess = rawChange < -0.01;
    
    let methodToUse = redistributionMethod;
    if (!hasExcess && redistributionMethod === 'new_installment') {
        methodToUse = 'equal';
        setRedistributionMethod('equal');
    }

    const { updatedEdits, summary } = calculateDistribution(initialEdits, methodToUse, extendMonths);
    setInstallmentEdits(updatedEdits);
    setPreviewData(summary);
  };

  const handleSubmit = async () => {
    if (!reason.trim()) {
      toast.error('Please provide a reason');
      return;
    }

    const changes = installmentEdits
      .filter(edit => edit.isModified && edit.installment.status === 'scheduled' && !edit.isNew && !edit.isDeleted)
      .map(edit => ({
        installment_id: edit.installment.id,
        new_amount: edit.newAmount,
      }));

    const deletedIds = installmentEdits
        .filter(edit => edit.isDeleted)
        .map(edit => edit.installment.id);

    if (changes.length === 0 && deletedIds.length === 0 && redistributionMethod !== 'new_installment') {
      toast.error('No changes to apply');
      return;
    }
    
    try {
      await modifyInstallments({
        advance_id: advance.id,
        installment_changes: changes,
        deleted_installment_ids: deletedIds, 
        redistribution_method: redistributionMethod,
        extension_months: redistributionMethod === 'new_installment' ? extendMonths : 0, 
        reason: reason.trim(),
      });

      toast.success(`Successfully modified installments`);
      onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to modify installments');
    }
  };

  if (!isOpen) return null;

  // Filter out isDeleted so they visually disappear
  const visibleInstallments = installmentEdits.filter(e => e.installment.status === 'scheduled' && !e.isDeleted);
  const hasModifications = installmentEdits.some(e => e.isModified || e.isDeleted);
  
  const lastVisibleIndex = visibleInstallments.length - 1;
  const totalActiveInstallments = installmentEdits.filter(e => !e.isDeleted).length;
  const approvedInstallments = advance.approved_installments || 0;

  // --- CALCULATE EXCESS FOR RENDERING UI ---
  const manualEditsForCalc = installmentEdits.filter(e => (e.isManual || e.isDeleted) && !e.isNew);
  const currentTotalChange = manualEditsForCalc.reduce((sum, edit) => {
      const currentAmt = edit.isDeleted ? 0 : edit.newAmount;
      return sum + (currentAmt - edit.installment.amount);
  }, 0);

  // If change is negative (e.g. 9000 -> 8000 = -1000), we have excess.
  const hasExcessToDistribute = currentTotalChange < -0.01;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
      <div className="relative bg-white rounded-lg shadow-xl max-w-5xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h3 className="text-lg font-medium text-gray-900">Modify Installments</h3>
            <p className="mt-1 text-sm text-gray-500">
              Adjust amounts. Choose a strategy to handle the difference.
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-500">
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-6">
          {/* Summary Cards */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-blue-700 block">Total Amount</span>
              <span className="font-semibold text-blue-900 text-lg">₹{advance.total_amount.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-blue-700 block">Remaining Balance</span>
              <span className="font-semibold text-blue-900 text-lg">₹{advance.remaining_balance.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-blue-700 block">Status</span>
              <span className="font-medium text-blue-900 capitalize px-2 py-1 bg-blue-100 rounded-full inline-block mt-1">
                {advance.status}
              </span>
            </div>
          </div>

          {/* Table */}
          {/* Table and Mobile Card View */}
          {visibleInstallments.length > 0 && (
            <>
              {/* Desktop Table View */}
              <div className="hidden sm:block border border-gray-200 rounded-lg overflow-x-auto shadow-sm">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">#</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Due Month</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Current</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">New Amount</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Impact</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {visibleInstallments.map((edit, index) => {
                      const difference = edit.newAmount - (edit.isNew ? 0 : edit.installment.amount);
                      const isLastRow = index === lastVisibleIndex;
                      const canRemove = isLastRow && totalActiveInstallments > approvedInstallments;

                      return (
                        <tr 
                          key={edit.installment.id} 
                          className={`transition-colors duration-150 ${edit.isNew ? 'bg-green-50 animate-pulse-once' : edit.isModified ? 'bg-yellow-50' : 'hover:bg-gray-50'}`}
                        >
                          <td className="px-4 py-3 text-sm text-gray-900">
                            {edit.isNew ? <span className="text-green-600 font-bold">+</span> : edit.installment.installment_number}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            {new Date(edit.installment.due_month + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'short' })}
                            {edit.isNew && <span className="ml-2 text-xs text-green-600 font-medium">(New)</span>}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500 text-right">
                            {edit.isNew ? '-' : `₹${edit.installment.amount.toFixed(2)}`}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              disabled={edit.isNew}
                              value={Math.round(edit.newAmount * 100) / 100}
                              onChange={(e) => handleAmountChange(edit.installment.id, e.target.value)}
                              className={`w-32 px-2 py-1 text-sm border rounded text-right transition-shadow ${
                                edit.isManual ? 'border-blue-500 ring-1 ring-blue-200 font-semibold' : 
                                edit.isNew ? 'border-green-400 bg-green-50 text-green-800 font-bold' : 'border-gray-300'
                              }`}
                            />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center space-x-2">
                                {(edit.isModified || edit.isNew) && (
                                  <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full ${
                                    edit.isNew || difference > 0.01 ? 'bg-green-100 text-green-800' : difference < -0.01 ? 'bg-red-100 text-red-800' : 'text-gray-500'
                                  }`}>
                                    {edit.isNew || difference > 0 ? '+' : ''}₹{Math.abs(edit.isNew ? edit.newAmount : difference).toFixed(2)}
                                  </span>
                                )}

                                {canRemove && (
                                  <button 
                                    onClick={() => edit.isNew ? handleRemoveNewRow() : handleRemoveExistingRow(edit.installment.id)}
                                    className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                                    title={edit.isNew ? "Remove new extension" : "Remove this installment and redistribute balance"}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="block sm:hidden space-y-3">
                {visibleInstallments.map((edit, index) => {
                  const difference = edit.newAmount - (edit.isNew ? 0 : edit.installment.amount);
                  const isLastRow = index === lastVisibleIndex;
                  const canRemove = isLastRow && totalActiveInstallments > approvedInstallments;

                  return (
                    <div 
                      key={edit.installment.id} 
                      className={`border border-gray-200 rounded-lg p-4 shadow-sm relative ${edit.isNew ? 'bg-green-50 border-green-200' : edit.isModified ? 'bg-yellow-50 border-yellow-200' : 'bg-white'}`}
                    >
                      {canRemove && (
                        <button 
                          onClick={() => edit.isNew ? handleRemoveNewRow() : handleRemoveExistingRow(edit.installment.id)}
                          className="absolute top-2 right-2 p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors bg-white shadow-sm border border-gray-100"
                          title={edit.isNew ? "Remove new extension" : "Remove this installment and redistribute balance"}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                      
                      <div className="flex items-center mb-3">
                        <span className={`text-xs font-bold px-2 py-1 rounded mr-2 ${edit.isNew ? 'bg-green-200 text-green-800' : 'bg-gray-100 text-gray-700'}`}>
                          {edit.isNew ? '+' : `#${edit.installment.installment_number}`}
                        </span>
                        <span className="text-sm font-medium text-gray-900">
                          {new Date(edit.installment.due_month + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}
                        </span>
                        {edit.isNew && <span className="ml-2 text-xs text-green-600 font-medium bg-green-100 px-1.5 py-0.5 rounded">(New)</span>}
                      </div>

                      <div className="grid grid-cols-2 gap-3 mb-3 border-b border-gray-100 pb-3">
                        <div>
                          <span className="text-gray-500 text-xs block mb-1">Current Amount</span>
                          <span className="text-sm font-medium text-gray-600 line-through">
                            {edit.isNew ? '-' : `₹${edit.installment.amount.toFixed(2)}`}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500 text-xs block mb-1">Impact</span>
                          {(edit.isModified || edit.isNew) ? (
                            <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full ${
                              edit.isNew || difference > 0.01 ? 'bg-green-100 text-green-800' : difference < -0.01 ? 'bg-red-100 text-red-800' : 'text-gray-500 bg-gray-100'
                            }`}>
                              {edit.isNew || difference > 0 ? '+' : ''}₹{Math.abs(edit.isNew ? edit.newAmount : difference).toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-gray-400 text-xs">-</span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col">
                        <label className="text-xs font-semibold text-gray-700 mb-1">New Installment Amount</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          disabled={edit.isNew}
                          value={Math.round(edit.newAmount * 100) / 100}
                          onChange={(e) => handleAmountChange(edit.installment.id, e.target.value)}
                          className={`w-full px-3 py-2 text-sm border rounded shadow-inner transition-shadow focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                            edit.isManual ? 'border-blue-500 ring-1 ring-blue-200 font-semibold bg-white' : 
                            edit.isNew ? 'border-green-400 bg-green-100/50 text-green-900 font-bold' : 'border-gray-300 bg-white'
                          }`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* STRATEGY SELECTION */}
          {hasModifications && (
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <h4 className="text-sm font-semibold text-gray-900 mb-4 flex items-center">
                <RefreshCw className="h-4 w-4 mr-2" />
                Redistribution Strategy
              </h4>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* 1. Equal */}
                <label className={`relative flex items-start p-3 border rounded-lg cursor-pointer transition-all ${redistributionMethod === 'equal' ? 'bg-white border-blue-500 shadow-md ring-1 ring-blue-200' : 'bg-white border-gray-200 hover:border-blue-300'}`}>
                  <input type="radio" name="redistribution" value="equal" checked={redistributionMethod === 'equal'} onChange={(e) => handleMethodChange(e.target.value as RedistributionMethod)} className="mt-1 h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500" />
                  <div className="ml-3">
                    <span className="block text-sm font-medium text-gray-900">Spread Equally</span>
                    <span className="block text-xs text-gray-500 mt-1">Split difference across all remaining months.</span>
                  </div>
                </label>

                {/* 3. Last Installment */}
                <label className={`relative flex items-start p-3 border rounded-lg cursor-pointer transition-all ${redistributionMethod === 'last_installment' ? 'bg-white border-blue-500 shadow-md ring-1 ring-blue-200' : 'bg-white border-gray-200 hover:border-blue-300'}`}>
                  <input type="radio" name="redistribution" value="last_installment" checked={redistributionMethod === 'last_installment'} onChange={(e) => handleMethodChange(e.target.value as RedistributionMethod)} className="mt-1 h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500" />
                  <div className="ml-3">
                    <span className="block text-sm font-medium text-gray-900">Defer to Last Month</span>
                    <span className="block text-xs text-gray-500 mt-1">Add full difference to the final payment.</span>
                  </div>
                  <ArrowDownToLine className="absolute top-3 right-3 h-4 w-4 text-gray-300" />
                </label>

                {/* 4. New Installment (Extend) - CONDITIONALLY RENDERED */}
                {hasExcessToDistribute && (
                    <div className={`relative flex flex-col p-3 border rounded-lg transition-all ${redistributionMethod === 'new_installment' ? 'bg-white border-blue-500 shadow-md ring-1 ring-blue-200' : 'bg-white border-gray-200'}`}>
                    <div className="flex items-start cursor-pointer" onClick={() => handleMethodChange('new_installment')}>
                        <input type="radio" name="redistribution" value="new_installment" checked={redistributionMethod === 'new_installment'} onChange={() => {}} className="mt-1 h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500" />
                        <div className="ml-3 flex-1">
                        <span className="block text-sm font-medium text-gray-900">Extend Term</span>
                        <span className="block text-xs text-gray-500 mt-1">Create new installments at the end.</span>
                        </div>
                        <PlusCircle className="h-4 w-4 text-gray-300" />
                    </div>
                    
                    {redistributionMethod === 'new_installment' && (
                        <div className="ml-7 mt-3 flex items-center bg-gray-50 p-2 rounded border border-gray-200">
                        <span className="text-xs font-medium text-gray-600 mr-2">Months to add:</span>
                        <button 
                            onClick={() => handleExtendMonthsChange(-1)}
                            className="p-1 hover:bg-gray-200 rounded text-gray-600 disabled:opacity-50"
                            disabled={extendMonths <= 1}
                        >
                            <Minus className="h-3 w-3" />
                        </button>
                        <span className="mx-3 text-sm font-bold text-gray-900 w-4 text-center">{extendMonths}</span>
                        <button 
                            onClick={() => handleExtendMonthsChange(1)}
                            className="p-1 hover:bg-gray-200 rounded text-gray-600"
                        >
                            <Plus className="h-3 w-3" />
                        </button>
                        </div>
                    )}
                    </div>
                )}
              </div>
            </div>
          )}

          {/* Reason Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason for Change <span className="text-red-500">*</span></label>
            <textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              placeholder="e.g., Shortening loan term due to early payment capability..."
            />
          </div>

          {/* Footer */}
          <div className="border-t border-gray-200 pt-4 flex flex-col sm:flex-row justify-between items-center gap-4">
             {previewData && (
                <div className={`text-sm w-full sm:w-auto text-center sm:text-left ${Math.abs(previewData.totalChange) < 0.01 ? 'text-green-600 font-medium' : 'text-red-600'}`}>
                   {/* {Math.abs(previewData.totalChange) < 0.01 
                     ? "" 
                     : `Unbalanced: ${previewData.totalChange > 0 ? '+' : ''}₹${previewData.totalChange.toFixed(2)}`} */}
                </div>
             )}
             <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                <button onClick={onClose} className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
                <button 
                  onClick={handleSubmit} 
                  disabled={!hasModifications || !reason.trim() || loading}
                  className="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center"
                >
                  {loading ? 'Saving...' : 'Apply Changes'}
                </button>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}