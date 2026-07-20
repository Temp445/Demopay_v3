import React, { useState, useEffect } from "react";
import {
  X,
  CheckCircle,
  XCircle,
  Calculator,
  AlertTriangle,
} from "lucide-react";
import { useAdvancesStore } from "../../../stores/advancesStore";
import toast from "react-hot-toast";
import type { EmployeeAdvance, AdvanceApproval } from "../../../types/advances";

interface AdvanceApprovalModalProps {
  advance: EmployeeAdvance;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function isCurrentOrPreviousTwoMonths(month: string) {
  // month is in 'YYYY-MM'
  const [year, m] = month.split("-").map(Number);
  const selectedMonth = new Date(year, m - 1, 1);

  const today = new Date();

  // First day of current month
  const currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  // First day of month two months ago
  const minAllowedMonth = new Date(
    today.getFullYear(),
    today.getMonth() - 2,
    1
  );

  return selectedMonth >= minAllowedMonth && selectedMonth <= currentMonth;
}


export default function AdvanceApprovalModal({
  advance,
  isOpen,
  onClose,
  onSuccess,
}: AdvanceApprovalModalProps) {
  const {
    settings,
    approveAdvance,
    rejectAdvance,
    calculateAdvanceDetails,
    loading,
  } = useAdvancesStore();

  const [approvalData, setApprovalData] = useState<AdvanceApproval>({
    approved_amount: advance.requested_amount,
    approved_installments: advance.requested_installments,
    approved_interest_rate: advance.requested_interest_rate,
    approved_start_month: advance.requested_start_month,
    approval_comments: "",
  });

  const [rejectReason, setRejectReason] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [calculation, setCalculation] = useState<any>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (
      approvalData.approved_amount > 0 &&
      approvalData.approved_installments > 0
    ) {
      const calc = calculateAdvanceDetails(
        approvalData.approved_amount,
        approvalData.approved_interest_rate,
        approvalData.approved_installments
      );
      setCalculation(calc);
    }
  }, [approvalData, calculateAdvanceDetails]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (approvalData.approved_amount <= 0) {
      newErrors.approved_amount = "Amount must be greater than 0";
    }

    if (
      settings?.max_advance_amount &&
      approvalData.approved_amount > settings.max_advance_amount
    ) {
      newErrors.approved_amount = `Maximum advance amount is ${settings.max_advance_amount}`;
    }

    if (
      approvalData.approved_installments < (settings?.min_installments || 1)
    ) {
      newErrors.approved_installments = `Minimum ${settings?.min_installments} installments required`;
    }

    if (
      approvalData.approved_installments > (settings?.max_installments || 24)
    ) {
      newErrors.approved_installments = `Maximum ${settings?.max_installments} installments allowed`;
    }

    if (
      approvalData.approved_interest_rate < 0 ||
      approvalData.approved_interest_rate > 100
    ) {
      newErrors.approved_interest_rate =
        "Interest rate must be between 0 and 100";
    }

    // if (!isCurrentOrPreviousTwoMonths(approvalData.approved_start_month)) {
    //   newErrors.approved_start_month =
    //     "Start month must be next month or later";
    // }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleApprove = async () => {
    if (!validate()) {
      toast.error("Please fix the errors before approving");
      return;
    }

    if (!confirm("Are you sure you want to approve this advance request?")) {
      return;
    }

    try {
      await approveAdvance(advance.id, approvalData);
      toast.success("Advance approved successfully");
      onSuccess();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to approve advance"
      );
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      toast.error("Please provide a reason for rejection");
      return;
    }

    if (!confirm("Are you sure you want to reject this advance request?")) {
      return;
    }

    try {
      await rejectAdvance(advance.id, rejectReason);
      toast.success("Advance rejected");
      onSuccess();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to reject advance"
      );
    }
  };

  const hasChanges =
    approvalData.approved_amount !== advance.requested_amount ||
    approvalData.approved_installments !== advance.requested_installments ||
    approvalData.approved_interest_rate !== advance.requested_interest_rate ||
    approvalData.approved_start_month !== advance.requested_start_month;

  if (!isOpen) return null;

  if (showRejectForm) {
    return (
      <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
        <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-lg font-medium text-gray-900">
              Reject Advance Request
            </h3>
            <button
              onClick={() => setShowRejectForm(false)}
              className="text-gray-400 hover:text-gray-500"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <div className="px-6 py-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Reason for Rejection
            </label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
              placeholder="Provide a clear reason for rejecting this request..."
            />
          </div>

          <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
            <button
              onClick={() => setShowRejectForm(false)}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleReject}
              disabled={loading || !rejectReason.trim()}
              className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
            >
              {loading ? "Rejecting..." : "Confirm Rejection"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
      <div className="relative bg-white rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <h3 className="text-lg font-medium text-gray-900">
            Review & Approve Advance
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500 focus:outline-none"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-6">
          {/* Employee & Request Info */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Employee:</span>
                <span className="ml-2 font-medium text-gray-900">
                  {advance.employee?.name}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Request Date:</span>
                <span className="ml-2 font-medium text-gray-900">
                  {new Date(advance.request_date).toLocaleDateString()}
                </span>
              </div>
            </div>
            {advance.justification && (
              <div className="mt-3">
                <span className="text-gray-500 text-sm">Justification:</span>
                <p className="mt-1 text-sm text-gray-700">
                  {advance.justification}
                </p>
              </div>
            )}
          </div>

          {/* Original Request vs Approval */}
          <div>
            <h4 className="text-sm font-medium text-gray-900 mb-3">
              Approval Terms
            </h4>
            {hasChanges && (
              <div className="mb-3 bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-start">
                <AlertTriangle className="h-5 w-5 text-yellow-600 mr-2 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-yellow-800">
                  You have modified the approval terms from the original
                  request. Please ensure the employee is notified of these
                  changes.
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Approved Amount
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={approvalData.approved_amount}
                  onChange={(e) =>
                    setApprovalData({
                      ...approvalData,
                      approved_amount: parseFloat(e.target.value) || 0,
                    })
                  }
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.approved_amount
                      ? "border-red-300"
                      : "border-gray-300"
                  }`}
                />
                {errors.approved_amount && (
                  <p className="mt-1 text-sm text-red-600">
                    {errors.approved_amount}
                  </p>
                )}
                {approvalData.approved_amount !== advance.requested_amount && (
                  <p className="mt-1 text-xs text-gray-500">
                    Originally requested: $
                    {advance.requested_amount.toLocaleString()}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Number of Installments
                </label>
                <select
                  value={approvalData.approved_installments}
                  onChange={(e) =>
                    setApprovalData({
                      ...approvalData,
                      approved_installments: parseInt(e.target.value),
                    })
                  }
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.approved_installments
                      ? "border-red-300"
                      : "border-gray-300"
                  }`}
                >
                  {Array.from(
                    { length: settings?.max_installments || 24 },
                    (_, i) => i + 1
                  )
                    .filter((i) => i >= (settings?.min_installments || 1))
                    .map((num) => (
                      <option key={num} value={num}>
                        {num} {num === 1 ? "month" : "months"}
                      </option>
                    ))}
                </select>
                {errors.approved_installments && (
                  <p className="mt-1 text-sm text-red-600">
                    {errors.approved_installments}
                  </p>
                )}
                {approvalData.approved_installments !==
                  advance.requested_installments && (
                  <p className="mt-1 text-xs text-gray-500">
                    Originally requested: {advance.requested_installments}{" "}
                    months
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Interest Rate (%)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={approvalData.approved_interest_rate}
                  onChange={(e) =>
                    setApprovalData({
                      ...approvalData,
                      approved_interest_rate: parseFloat(e.target.value) || 0,
                    })
                  }
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.approved_interest_rate
                      ? "border-red-300"
                      : "border-gray-300"
                  }`}
                />
                {errors.approved_interest_rate && (
                  <p className="mt-1 text-sm text-red-600">
                    {errors.approved_interest_rate}
                  </p>
                )}
                {approvalData.approved_interest_rate !==
                  advance.requested_interest_rate && (
                  <p className="mt-1 text-xs text-gray-500">
                    Originally requested: {advance.requested_interest_rate}%
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Deduction Start Month
                </label>
                <input
                  type="month"
                  value={approvalData.approved_start_month}
                  min={(() => {
                    const today = new Date();
                    const nextMonth = new Date(
                      today.getFullYear(),
                      today.getMonth() - 1,
                      1
                    );
                    return nextMonth.toISOString().slice(0, 7); // 'YYYY-MM'
                  })()}
                  onChange={(e) =>
                    setApprovalData({
                      ...approvalData,
                      approved_start_month: e.target.value,
                    })
                  }
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.approved_start_month
                      ? "border-red-300"
                      : "border-gray-300"
                  }`}
                />

                {errors.approved_start_month && (
                  <p className="mt-1 text-sm text-red-600">
                    {errors.approved_start_month}
                  </p>
                )}
                {approvalData.approved_start_month !==
                  advance.requested_start_month && (
                  <p className="mt-1 text-xs text-gray-500">
                    Originally requested:{" "}
                    {new Date(
                      advance.requested_start_month + "-01"
                    ).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                    })}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Calculation Summary */}
          {calculation && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="text-sm font-medium text-blue-900 mb-3 flex items-center">
                <Calculator className="h-4 w-4 mr-2" />
                Approval Summary
              </h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-blue-700">Principal Amount:</span>
                  <span className="float-right font-medium text-blue-900">
                    ₹{calculation.requested_amount.toFixed(2)}
                  </span>
                </div>
                <div>
                  <span className="text-blue-700">
                    Interest ({calculation.interest_rate}%):
                  </span>
                  <span className="float-right font-medium text-blue-900">
                    ₹
                    {(
                      calculation.total_amount - calculation.requested_amount
                    ).toFixed(2)}
                  </span>
                </div>
                <div className="col-span-2 pt-2 border-t border-blue-300">
                  <span className="text-blue-700">Total Amount:</span>
                  <span className="float-right font-bold text-blue-900">
                    ₹{calculation.total_amount.toFixed(2)}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-blue-700">Monthly Deduction:</span>
                  <span className="float-right font-bold text-blue-900 text-lg">
                    ₹{calculation.monthly_installment.toFixed(2)}
                  </span>
                </div>
                <div className="col-span-2 text-xs text-blue-600">
                  (Principal: ₹{calculation.principal_per_month.toFixed(2)} +
                  Interest: ₹{calculation.interest_per_month.toFixed(2)} per
                  month)
                </div>
              </div>
            </div>
          )}

          {/* Approval Comments */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Approval Comments (Optional)
            </label>
            <textarea
              value={approvalData.approval_comments}
              onChange={(e) =>
                setApprovalData({
                  ...approvalData,
                  approval_comments: e.target.value,
                })
              }
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Add any comments or notes about this approval..."
            />
          </div>

          {/* Action Buttons */}
          <div className="border-t border-gray-200 pt-4 flex justify-between">
            <button
              onClick={() => setShowRejectForm(true)}
              className="inline-flex items-center px-4 py-2 border border-red-300 rounded-md shadow-sm text-sm font-medium text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
            >
              <XCircle className="h-4 w-4 mr-2" />
              Reject
            </button>
            <div className="flex space-x-3">
              <button
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleApprove}
                disabled={loading}
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                {loading ? "Approving..." : "Approve Advance"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
