import React, { useState } from 'react';
import { X, Ban, AlertTriangle, CheckCircle } from 'lucide-react';
import { useAdvancesStore } from '../../../stores/advancesStore';
import toast from 'react-hot-toast';
import type { EmployeeAdvance, ClosureType } from '../../../types/advances';

interface ShortClosureModalProps {
  advance: EmployeeAdvance;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ShortClosureModal({
  advance,
  isOpen,
  onClose,
  onSuccess,
}: ShortClosureModalProps) {
  const { initiateShortClosure, loading } = useAdvancesStore();

  const [closureType, setClosureType] = useState<ClosureType>('authority_initiated');
  const [closureReason, setClosureReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!closureReason.trim()) {
      newErrors.closureReason = 'Please provide a reason for closure';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    const confirmMessage =
      closureType === 'authority_initiated'
        ? `Are you sure you want to close this advance and waive the remaining balance of ₹${advance.remaining_balance.toFixed(2)}? This action cannot be undone.`
        : `Are you sure you want to close this advance? The remaining balance of ₹${advance.remaining_balance.toFixed(2)} will be deducted from the employee's next payroll. This action cannot be undone.`;

    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      await initiateShortClosure({
        advance_id: advance.id,
        closure_type: closureType,
        closure_reason: closureReason,
      });

      const successMessage =
        closureType === 'authority_initiated'
          ? 'Advance closed successfully. Remaining balance waived.'
          : 'Advance closure initiated. Balance will be deducted in next payroll.';

      toast.success(successMessage);
      onSuccess();
      handleClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to close advance');
    }
  };

  const handleClose = () => {
    setClosureType('authority_initiated');
    setClosureReason('');
    setErrors({});
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
      <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <h3 className="text-lg font-medium text-gray-900 flex items-center">
            <Ban className="h-5 w-5 mr-2 text-purple-600" />
            Short Closure - Early Termination
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
                <span className="text-gray-500">Total Advance:</span>
                <span className="ml-2 font-medium text-gray-900">
                  ₹{advance.total_amount.toFixed(2)}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Amount Recovered:</span>
                <span className="ml-2 font-medium text-gray-900">
                  ₹{(advance.total_amount - advance.remaining_balance).toFixed(2)}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Remaining Balance:</span>
                <span className="ml-2 font-bold text-purple-600">
                  ₹{advance.remaining_balance.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Closure Type Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Closure Type
            </label>
            <div className="space-y-3">
              {/* Authority Initiated */}
              <div
                className={`border-2 rounded-lg p-4 cursor-pointer transition-colors ${
                  closureType === 'authority_initiated'
                    ? 'border-purple-500 bg-purple-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => setClosureType('authority_initiated')}
              >
                <div className="flex items-start">
                  <input
                    type="radio"
                    name="closureType"
                    value="authority_initiated"
                    checked={closureType === 'authority_initiated'}
                    onChange={(e) => setClosureType(e.target.value as ClosureType)}
                    className="mt-1 h-4 w-4 text-purple-600 focus:ring-purple-500"
                  />
                  <div className="ml-3">
                    <label className="block text-sm font-medium text-gray-900 cursor-pointer">
                      Authority Initiated - Waive Balance
                    </label>
                    <p className="text-sm text-gray-500 mt-1">
                      The remaining balance of ₹{advance.remaining_balance.toFixed(2)} will be waived
                      and forgiven. No further deductions will be made from the employee's salary.
                    </p>
                    <div className="mt-2 bg-white border border-purple-200 rounded p-2 text-xs text-purple-800">
                      <CheckCircle className="inline h-3 w-3 mr-1" />
                      Use this when the advance is being forgiven due to special circumstances
                    </div>
                  </div>
                </div>
              </div>

              {/* Employee Requested */}
              <div
                className={`border-2 rounded-lg p-4 cursor-pointer transition-colors ${
                  closureType === 'employee_requested'
                    ? 'border-purple-500 bg-purple-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => setClosureType('employee_requested')}
              >
                <div className="flex items-start">
                  <input
                    type="radio"
                    name="closureType"
                    value="employee_requested"
                    checked={closureType === 'employee_requested'}
                    onChange={(e) => setClosureType(e.target.value as ClosureType)}
                    className="mt-1 h-4 w-4 text-purple-600 focus:ring-purple-500"
                  />
                  <div className="ml-3">
                    <label className="block text-sm font-medium text-gray-900 cursor-pointer">
                      Employee Requested - One-Time Deduction
                    </label>
                    <p className="text-sm text-gray-500 mt-1">
                      The remaining balance of ₹{advance.remaining_balance.toFixed(2)} will be deducted
                      in full from the employee's next payroll in a single payment.
                    </p>
                    <div className="mt-2 bg-white border border-purple-200 rounded p-2 text-xs text-purple-800">
                      <AlertTriangle className="inline h-3 w-3 mr-1" />
                      Ensure the employee has sufficient salary to cover this deduction
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Warning Message */}
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start">
            <AlertTriangle className="h-5 w-5 text-red-600 mr-3 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-red-800">
              <p className="font-medium mb-1">Warning - Irreversible Action:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>This action cannot be undone once confirmed</li>
                <li>All remaining scheduled installments will be marked as waived</li>
                <li>The advance status will be permanently changed to "Closed"</li>
                <li>
                  {closureType === 'authority_initiated'
                    ? 'The remaining balance will be written off'
                    : 'The employee will see a large deduction in their next payroll'}
                </li>
              </ul>
            </div>
          </div>

          {/* Closure Reason */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reason for Closure <span className="text-red-500">*</span>
            </label>
            <textarea
              value={closureReason}
              onChange={(e) => setClosureReason(e.target.value)}
              rows={4}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                errors.closureReason ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="Provide a detailed reason for closing this advance early (e.g., employee resignation, special approval, hardship case, etc.)..."
            />
            {errors.closureReason && (
              <p className="mt-1 text-sm text-red-600">{errors.closureReason}</p>
            )}
          </div>

          {/* Impact Summary */}
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <h4 className="text-sm font-medium text-purple-900 mb-2">Closure Impact Summary</h4>
            <div className="space-y-2 text-sm text-purple-800">
              <div className="flex justify-between">
                <span>Advance Status:</span>
                <span className="font-medium">Active → Closed</span>
              </div>
              <div className="flex justify-between">
                <span>Remaining Balance:</span>
                <span className="font-medium">₹{advance.remaining_balance.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Action:</span>
                <span className="font-medium">
                  {closureType === 'authority_initiated' ? 'Balance Waived' : 'Full Deduction Next Payroll'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Future Deductions:</span>
                <span className="font-medium">None (All waived)</span>
              </div>
            </div>
          </div>

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
              disabled={loading}
              className="w-full sm:w-auto flex justify-center items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50"
            >
              <Ban className="h-4 w-4 mr-2" />
              {loading ? 'Processing Closure...' : 'Confirm Closure'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
