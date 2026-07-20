import React, { useState, useEffect } from "react";
import {
  X,
  Calendar,
  Percent,
  FileText,
  Calculator,
  IndianRupee,
  User,
  Users,
} from "lucide-react";
import { useAdvancesStore } from "../../../stores/advancesStore";
import { useEmployeesStore } from "../../../stores/employeesStore";
import toast from "react-hot-toast";
import type { AdvanceRequest, EmployeeAdvance } from "../../../types/advances";
import { useRoleAccess } from "../../../hooks/useRoleAccess"; 

interface AdvanceRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  employeeId?: string;
  onSuccess?: () => void;
  advance?: EmployeeAdvance;
  mode?: 'create' | 'view' | 'edit';
}

export default function AdvanceRequestModal({
  isOpen,
  onClose,
  employeeId,
  onSuccess,
  advance,
  mode = 'create',
}: AdvanceRequestModalProps) {
  const {
    settings,
    createAdvanceRequest,
    updateAdvanceRequest,
    cancelAdvanceRequest,
    calculateAdvanceDetails,
    fetchSettings,
    advances,
  } = useAdvancesStore();

  const { items: employees, fetchEmployees } = useEmployeesStore();
  
  const { isEmployee, role, employeeId: currentUserEmployeeId } = useRoleAccess();
  const isReportingHead = role === 'Reporting Head';

  const [requestTarget, setRequestTarget] = useState<'own' | 'employee'>('own');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const subordinates = React.useMemo(() => {
    if (!currentUserEmployeeId) return [];
    return (employees ?? []).filter((emp) => {
      if (emp.status !== 'Active') return false;
      if (!emp.reporting_to) return false;
      const reportingTo = Array.isArray(emp.reporting_to)
        ? emp.reporting_to
        : [emp.reporting_to];
      return reportingTo.includes(currentUserEmployeeId);
    });
  }, [employees, currentUserEmployeeId]);

  const handleTargetChange = (target: 'own' | 'employee') => {
    setRequestTarget(target);
    setFormData(prev => ({
      ...prev,
      employee_id: target === 'own' ? (currentUserEmployeeId || '') : '',
    }));
  };

  const [formData, setFormData] = useState<AdvanceRequest>({
    requested_amount: 0,
    requested_installments: 6,
    requested_interest_rate: 0,
    requested_start_month: "",
    justification: "",
    employee_id: employeeId || "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [calculation, setCalculation] = useState<any>(null);

  // Initialize data
  useEffect(() => {
    if (isOpen) {
      fetchSettings();
      fetchEmployees();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Initialize form defaults
  useEffect(() => {
    if (isOpen) {
      if (advance && (mode === 'view' || mode === 'edit')) {
        // Populate form with existing advance data
        setFormData({
          requested_amount: advance.requested_amount,
          requested_installments: advance.requested_installments,
          requested_interest_rate: advance.requested_interest_rate,
          requested_start_month: advance.requested_start_month,
          justification: advance.justification || '',
          employee_id: advance.employee_id,
        });
      } else {
        // Create mode - set defaults
        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        const defaultStartMonth = nextMonth.toISOString().substring(0, 7);

        if (isReportingHead) {
          setRequestTarget('own');
        }

        setFormData((prev) => ({
          ...prev,
          requested_start_month: prev.requested_start_month || defaultStartMonth,
          requested_interest_rate:
            prev.requested_interest_rate || settings?.default_interest_rate || 0,
          // If Reporting Head, default to their own employee ID
          employee_id: (isEmployee && currentUserEmployeeId)
            ? currentUserEmployeeId
            : (isReportingHead && currentUserEmployeeId)
              ? currentUserEmployeeId
              : (employeeId || prev.employee_id),
        }));
      }
    }
  }, [isOpen, settings, employeeId, advance, mode, isEmployee, isReportingHead, currentUserEmployeeId]);

  // Calculate details on change
  useEffect(() => {
    if (formData.requested_amount > 0 && formData.requested_installments > 0) {
      const calc = calculateAdvanceDetails(
        formData.requested_amount,
        formData.requested_interest_rate,
        formData.requested_installments
      );
      setCalculation(calc);
    } else {
      setCalculation(null);
    }
  }, [
    formData.requested_amount,
    formData.requested_interest_rate,
    formData.requested_installments,
    calculateAdvanceDetails,
  ]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.employee_id) {
      newErrors.employee_id = "Please select an employee";
    } else if (mode === 'create') {
      const hasActiveAdvance = advances?.some((adv: any) => {
        const isSameEmployee = adv.employee_id === formData.employee_id;
        const status = adv.status?.toLowerCase() || "";
        const isActiveStatus = ["pending", "approved", "active"].includes(status);
        return isSameEmployee && isActiveStatus;
      });

      if (hasActiveAdvance) {
        const errorMsg = "This employee already has an active or pending advance.";
        newErrors.employee_id = errorMsg;
        toast.error(errorMsg);
      }
    }

    if (formData.requested_amount <= 0) {
      newErrors.requested_amount = "Amount must be greater than 0";
    }

    if (
      settings?.max_advance_amount &&
      formData.requested_amount > settings.max_advance_amount
    ) {
      newErrors.requested_amount = `Maximum advance amount is ${settings.max_advance_amount}`;
    }

    if (formData.requested_installments < (settings?.min_installments || 1)) {
      newErrors.requested_installments = `Minimum ${settings?.min_installments} installments required`;
    }

    if (formData.requested_installments > (settings?.max_installments || 24)) {
      newErrors.requested_installments = `Maximum ${settings?.max_installments} installments allowed`;
    }

    if (
      formData.requested_interest_rate < 0 ||
      formData.requested_interest_rate > 100
    ) {
      newErrors.requested_interest_rate =
        "Interest rate must be between 0 and 100";
    }

    if (!formData.requested_start_month) {
      newErrors.requested_start_month = "Please select start month";
    }

    if (settings?.require_justification && !formData.justification.trim()) {
      newErrors.justification = "Justification is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    try {
      setIsSubmitting(true);
      if (mode === 'edit' && advance) {
        await updateAdvanceRequest(advance.id, formData);
        toast.success("Advance request updated successfully");
      } else {
        await createAdvanceRequest(formData);
        toast.success("Advance request submitted successfully");
      }
      onSuccess?.();
      handleClose();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to submit request"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelRequest = async () => {
    if (!advance) return;
    if (window.confirm("Are you sure you want to cancel this advance request?")) {
      try {
        setIsSubmitting(true);
        await cancelAdvanceRequest(advance.id);
        toast.success("Advance request cancelled successfully");
        onSuccess?.();
        handleClose();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to cancel request"
        );
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const handleClose = () => {
    setFormData({
      requested_amount: 0,
      requested_installments: 6,
      requested_interest_rate: settings?.default_interest_rate || 0,
      requested_start_month: "",
      justification: "",
      employee_id: employeeId || "",
    });
    setRequestTarget('own');
    setErrors({});
    setCalculation(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
      <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <h3 className="text-lg font-medium text-gray-900">
            {mode === "view"
              ? "View Advance Request"
              : mode === "edit"
                ? "Edit Advance Request"
                : "Request Employee Advance"}
          </h3>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-500 focus:outline-none"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-6">
          {/* Own / Employee Tab Toggle — shown only for Reporting Head and not when editing/viewing */}
          {mode === "create" && isReportingHead && (
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-2">Request For</label>
              <div className="flex rounded-lg bg-gray-100 p-1 gap-1">
                <button
                  type="button"
                  onClick={() => handleTargetChange('own')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-semibold transition-all ${requestTarget === 'own'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-gray-600 hover:text-gray-800'
                    }`}
                >
                  <User className="h-4 w-4" />
                  Own
                </button>
                <button
                  type="button"
                  onClick={() => handleTargetChange('employee')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-semibold transition-all ${requestTarget === 'employee'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-gray-600 hover:text-gray-800'
                    }`}
                >
                  <Users className="h-4 w-4" />
                  Employee
                </button>
              </div>
            </div>
          )}

          {!employeeId && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Employee
              </label>
              {/* DISPLAY LOGIC: 
                 If mode is view/edit OR user is Employee OR (Reporting Head and requestTarget is own), show Read-Only Input.
                 Otherwise, show Select Dropdown.
              */}
              {mode === "edit" || mode === "view" || isEmployee || (isReportingHead && requestTarget === 'own') ? (
                <input
                  type="text"
                  value={
                    employees?.find((e) => e.id === formData.employee_id)
                      ? `${employees.find((e) => e.id === formData.employee_id)?.name} (${
                          employees.find((e) => e.id === formData.employee_id)
                            ?.employee_code ||
                          employees.find((e) => e.id === formData.employee_id)
                            ?.email
                        })`
                      : "Loading..."
                  }
                  readOnly
                  className="w-full px-3 py-2 border rounded-md bg-gray-100 cursor-not-allowed"
                />
              ) : (
                <select
                  value={formData.employee_id}
                  onChange={(e) =>
                    setFormData({ ...formData, employee_id: e.target.value })
                  }
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.employee_id ? "border-red-300" : "border-gray-300"
                  }`}
                >
                  <option value="">Select Employee</option>
                  {(isReportingHead ? subordinates : (employees ?? []))
                    .filter((emp) => emp.status === "Active")
                    .map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name} ({emp.employee_code || emp.email})
                      </option>
                    ))}
                </select>
              )}

              {errors.employee_id && (
                <p className="mt-1 text-sm text-red-600">
                  {errors.employee_id}
                </p>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <IndianRupee className="inline h-4 w-4 mr-1" />
              Advance Amount
            </label>
            <input
              type="number"
              step="0.01"
              value={formData.requested_amount || ""}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  requested_amount: parseFloat(e.target.value) || 0,
                })
              }
              disabled={mode === "view"}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.requested_amount ? "border-red-300" : "border-gray-300"
              } ${mode === "view" ? "bg-gray-100 cursor-not-allowed" : ""}`}
              placeholder="Enter amount"
            />
            {errors.requested_amount && (
              <p className="mt-1 text-sm text-red-600">
                {errors.requested_amount}
              </p>
            )}
            {settings?.max_advance_amount && (
              <p className="mt-1 text-sm text-gray-500">
                Maximum allowed: ₹{settings.max_advance_amount.toLocaleString()}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Calendar className="inline h-4 w-4 mr-1" />
              Number of Installments
            </label>
            <select
              value={formData.requested_installments}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  requested_installments: parseInt(e.target.value),
                })
              }
              disabled={mode === "view"}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.requested_installments
                  ? "border-red-300"
                  : "border-gray-300"
              } ${mode === "view" ? "bg-gray-100 cursor-not-allowed" : ""}`}
            >
              {Array.from(
                { length: settings?.max_installments || 24 },
                (_, i) => i + 1,
              )
                .filter((i) => i >= (settings?.min_installments || 1))
                .map((num) => (
                  <option key={num} value={num}>
                    {num} {num === 1 ? "month" : "months"}
                  </option>
                ))}
            </select>
            {errors.requested_installments && (
              <p className="mt-1 text-sm text-red-600">
                {errors.requested_installments}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Percent className="inline h-4 w-4 mr-1" />
              Interest Rate (%)
            </label>
            <input
              type="number"
              step="0.01"
              value={formData.requested_interest_rate}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  requested_interest_rate: parseFloat(e.target.value) || 0,
                })
              }
              // Interest rate is usually read-only for employees unless you want them to request a specific rate
              disabled={mode === "view" || (isEmployee && mode === "create")} 
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.requested_interest_rate
                  ? "border-red-300"
                  : "border-gray-300"
              } ${mode === "view" || (isEmployee && mode === "create") ? "bg-gray-100 cursor-not-allowed" : ""}`}
              placeholder="0.00"
            />
            {errors.requested_interest_rate && (
              <p className="mt-1 text-sm text-red-600">
                {errors.requested_interest_rate}
              </p>
            )}
            {settings?.default_interest_rate !== undefined && (
              <p className="mt-1 text-sm text-gray-500">
                Default rate: {settings.default_interest_rate}%
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Calendar className="inline h-4 w-4 mr-1" />
              Deduction Start Month
            </label>
            <input
              type="month"
              value={formData.requested_start_month}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  requested_start_month: e.target.value,
                })
              }
              disabled={mode === "view"}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.requested_start_month
                  ? "border-red-300"
                  : "border-gray-300"
              } ${mode === "view" ? "bg-gray-100 cursor-not-allowed" : ""}`}
            />

            {errors.requested_start_month && (
              <p className="mt-1 text-sm text-red-600">
                {errors.requested_start_month}
              </p>
            )}
            <p className="mt-1 text-sm text-gray-500">
              Deductions will start from your selected month's payroll
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <FileText className="inline h-4 w-4 mr-1" />
              Justification{" "}
              {settings?.require_justification && (
                <span className="text-red-500">*</span>
              )}
            </label>
            <textarea
              value={formData.justification}
              onChange={(e) =>
                setFormData({ ...formData, justification: e.target.value })
              }
              rows={4}
              disabled={mode === "view"}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.justification ? "border-red-300" : "border-gray-300"
              } ${mode === "view" ? "bg-gray-100 cursor-not-allowed" : ""}`}
              placeholder="Provide reason for requesting advance..."
            />
            {errors.justification && (
              <p className="mt-1 text-sm text-red-600">
                {errors.justification}
              </p>
            )}
          </div>

          {calculation && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="text-sm font-medium text-blue-900 mb-3 flex items-center">
                <Calculator className="h-4 w-4 mr-2" />
                Advance Calculation Summary
              </h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-blue-700">Principal Amount:</span>
                  <span className="float-right font-medium text-blue-900">
                    ₹{calculation.requested_amount.toFixed(2)}
                  </span>
                </div>
                <div>
                  <span className="text-blue-700">Interest Rate:</span>
                  <span className="float-right font-medium text-blue-900">
                    {calculation.interest_rate}%
                  </span>
                </div>
                <div>
                  <span className="text-blue-700">Total Amount:</span>
                  <span className="float-right font-medium text-blue-900">
                    ₹{calculation.total_amount.toFixed(2)}
                  </span>
                </div>
                <div>
                  <span className="text-blue-700">Number of Installments:</span>
                  <span className="float-right font-medium text-blue-900">
                    {calculation.installments}
                  </span>
                </div>
                <div className="col-span-2 pt-2 border-t border-blue-300">
                  <span className="text-blue-700">Monthly Deduction:</span>
                  <span className="float-right font-bold text-blue-900 text-lg">
                    ₹{calculation.monthly_installment.toFixed(2)}
                  </span>
                </div>
                <div className="col-span-2 text-xs text-blue-600">
                  Principal: ₹{calculation.principal_per_month.toFixed(2)} +
                  Interest: ₹{calculation.interest_per_month.toFixed(2)}
                </div>
              </div>
            </div>
          )}

          <div className="border-t border-gray-200 pt-4 flex flex-col md:flex-row md:justify-end gap-3">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Close
            </button>
            {mode === "edit" && (
              <button
                type="button"
                onClick={handleCancelRequest}
                disabled={isSubmitting}
                className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
              >
                Cancel Request
              </button>
            )}
            {mode !== "view" && (
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {isSubmitting
                  ? mode === "edit"
                    ? "Updating..."
                    : "Submitting..."
                  : mode === "edit"
                    ? "Update Request"
                    : "Submit Request"}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}