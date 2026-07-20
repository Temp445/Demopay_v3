import React, { useState, useEffect } from 'react';
import { X, Pause, AlertTriangle } from 'lucide-react';
import { useAdvancesStore } from '../../../stores/advancesStore';
import toast from 'react-hot-toast';
import type { EmployeeAdvance } from '../../../types/advances';

interface DeductionHoldModalProps {
  advance: EmployeeAdvance;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function DeductionHoldModal({
  advance,
  isOpen,
  onClose,
  onSuccess,
}: DeductionHoldModalProps) {
  const { installments, createDeductionHold, fetchInstallments, loading } = useAdvancesStore();

  const [holdMonth, setHoldMonth] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen && advance) {
      fetchInstallments(advance.id);
    }
  }, [isOpen, advance, fetchInstallments]);

  const scheduledInstallments = installments.filter(inst => inst.status === 'scheduled');

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!holdMonth) {
      newErrors.holdMonth = 'Please select a month to hold';
    } else {
      const selectedDate = new Date(holdMonth + '-01');
      const currentDate = new Date();
      currentDate.setDate(1);

      if (selectedDate <= currentDate) {
        newErrors.holdMonth = 'Cannot hold current or past months';
      }

      const installmentExists = scheduledInstallments.some(inst => inst.due_month === holdMonth);
      if (!installmentExists) {
        newErrors.holdMonth = 'No scheduled installment found for this month';
      }
    }

    if (!reason.trim()) {
      newErrors.reason = 'Please provide a reason for the hold';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    if (!confirm(`Are you sure you want to hold the deduction for ${new Date(holdMonth + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}?`)) {
      return;
    }

    try {
      await createDeductionHold({
        advance_id: advance.id,
        hold_month: holdMonth,
        reason,
      });
      toast.success('Deduction hold applied successfully');
      onSuccess();
      handleClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to apply hold');
    }
  };

  const handleClose = () => {
    setHoldMonth('');
    setReason('');
    setErrors({});
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
      <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <h3 className="text-lg font-medium text-gray-900 flex items-center">
            <Pause className="h-5 w-5 mr-2 text-orange-600" />
            Hold Installment Deduction
          </h3>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-500 focus:outline-none"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-6">
          {/* Advance Information */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Employee:</span>
                <span className="ml-2 font-medium text-gray-900">{advance.employee?.name}</span>
              </div>
              <div>
                <span className="text-gray-500">Remaining Balance:</span>
                <span className="ml-2 font-medium text-gray-900">
                  ₹{advance.remaining_balance.toFixed(2)}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Monthly Installment:</span>
                <span className="ml-2 font-medium text-gray-900">
                  ₹{scheduledInstallments.length > 0 ? scheduledInstallments[0].amount.toFixed(2) : '0.00'}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Remaining Installments:</span>
                <span className="ml-2 font-medium text-gray-900">
                  {scheduledInstallments.length}
                </span>
              </div>
            </div>
          </div>

          {/* Warning Message */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start">
            <AlertTriangle className="h-5 w-5 text-yellow-600 mr-3 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-800">
              <p className="font-medium mb-1">Important Information:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Holding a deduction will skip the installment for the selected month</li>
                <li>The installment schedule will automatically extend by one month</li>
                <li>The total amount to be recovered remains unchanged</li>
                <li>You cannot hold current or past months</li>
              </ul>
            </div>
          </div>

          {/* Month Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Select Month to Hold
            </label>
            <select
              value={holdMonth}
              onChange={(e) => setHoldMonth(e.target.value)}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.holdMonth ? 'border-red-300' : 'border-gray-300'
              }`}
            >
              <option value="">Select a month...</option>
              {scheduledInstallments.map((installment) => {
                const dueDate = new Date(installment.due_month + '-01');
                const currentDate = new Date();
                currentDate.setDate(1);

                if (dueDate > currentDate) {
                  return (
                    <option key={installment.id} value={installment.due_month}>
                      {dueDate.toLocaleDateString('en-IN', { year: 'numeric', month: 'long' })} -
                      Installment #{installment.installment_number} (₹{installment.amount.toFixed(2)})
                    </option>
                  );
                }
                return null;
              })}
            </select>
            {errors.holdMonth && (
              <p className="mt-1 text-sm text-red-600">{errors.holdMonth}</p>
            )}
            {scheduledInstallments.length === 0 && (
              <p className="mt-1 text-sm text-gray-500">No scheduled installments available to hold</p>
            )}
          </div>

          {/* Reason */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reason for Hold
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.reason ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="Provide a clear reason for holding this deduction (e.g., employee on unpaid leave, salary adjustment, etc.)..."
            />
            {errors.reason && (
              <p className="mt-1 text-sm text-red-600">{errors.reason}</p>
            )}
          </div>

          {/* Scheduled Installments Preview */}
          {scheduledInstallments.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-2">Current Schedule (Next 6 Installments)</h4>
              <div className="hidden sm:block border border-gray-200 rounded-lg overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Month</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                      <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {scheduledInstallments.slice(0, 6).map((installment) => (
                      <tr
                        key={installment.id}
                        className={holdMonth === installment.due_month ? 'bg-orange-50' : ''}
                      >
                        <td className="px-4 py-2 text-sm text-gray-900">
                          {installment.installment_number}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-900">
                          {new Date(installment.due_month + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'short' })}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-900 text-right">
                          ₹{installment.amount.toFixed(2)}
                        </td>
                        <td className="px-4 py-2 text-center text-sm">
                          {holdMonth === installment.due_month ? (
                            <span className="text-orange-600 font-medium">Will be held</span>
                          ) : (
                            <span className="text-gray-600">Scheduled</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="block sm:hidden space-y-3">
                {scheduledInstallments.slice(0, 6).map((installment) => (
                  <div 
                    key={installment.id} 
                    className={`border border-gray-200 rounded-lg p-3 shadow-sm ${holdMonth === installment.due_month ? 'bg-orange-50 border-orange-200' : 'bg-white'}`}
                  >
                    <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center">
                        <span className={`text-xs font-bold px-2 py-1 rounded mr-2 ${holdMonth === installment.due_month ? 'bg-orange-200 text-orange-800' : 'bg-gray-100 text-gray-700'}`}>
                          #{installment.installment_number}
                        </span>
                        <span className="text-sm font-medium text-gray-900">
                          {new Date(installment.due_month + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'short' })}
                        </span>
                      </div>
                      <div className="text-sm">
                        {holdMonth === installment.due_month ? (
                          <span className="text-orange-600 font-medium text-xs">Will be held</span>
                        ) : (
                          <span className="text-gray-600 text-xs">Scheduled</span>
                        )}
                      </div>
                    </div>
                    <div className="flex justify-between items-center border-t border-gray-100 pt-2">
                      <span className="text-gray-500 text-xs">Amount</span>
                      <span className="font-medium text-gray-900">₹{installment.amount.toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="border-t border-gray-200 pt-4 flex flex-col sm:flex-row justify-end gap-3">
            <button
              type="button"
              onClick={handleClose}
              className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || scheduledInstallments.length === 0}
              className="w-full sm:w-auto flex justify-center items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:opacity-50"
            >
              <Pause className="h-4 w-4 mr-2" />
              {loading ? 'Applying Hold...' : 'Apply Hold'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
