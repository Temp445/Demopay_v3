import React, { useState, useEffect, useCallback } from 'react';
import { X, Plus, AlertCircle, Info } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useEmployeesStore, type Employee } from '../../../stores/employeesStore';
import { usePayrollStore } from '../../../stores/payrollStore';
import { useSalaryStructuresStore, type ComponentType } from '../../../stores/salaryStructuresStore';
import { validatePayrollPeriod, calculateFinalPayrollAmount, PayrollCalculationResult } from '../../../lib/payrollCalculation';
import { format } from 'date-fns';

interface AddPayrollModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPayrollAdded: () => void;
}

interface SalaryComponent {
  key: string;
  name: string;
  amount: string;
  isCustom?: boolean;
  calculationMethod: 'direct' | 'percentage';
  percentageValue?: string;
  referenceComponents?: string[];
}

interface DeductionComponent {
  key: string;
  name: string;
  amount: string;
  isCustom?: boolean;
  calculationMethod: 'direct' | 'percentage';
  percentageValue?: string;
  referenceComponents?: string[];
}

interface FormData {
  employee_id: string;
  period_start: string;
  period_end: string;
  base_salary: string;
  overtime_hours: string;
  overtime_rate: string;
  deductions: string;
  bonus: string;
}

export default function AddPayrollModal({ isOpen, onClose, onPayrollAdded }: AddPayrollModalProps) {
  const { items: employees, fetchEmployees } = useEmployeesStore();
  const { createPayrollEntry } = usePayrollStore();
  const {
    salaryComponentTypes,
    deductionComponentTypes,
    fetchSalaryComponentTypes,
    fetchDeductionComponentTypes,
  } = useSalaryStructuresStore();

  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [salaryComponents, setSalaryComponents] = useState<SalaryComponent[]>([
    { key: 'E1', name: '', amount: '', isCustom: false, calculationMethod: 'direct' }
  ]);
  const [deductionComponents, setDeductionComponents] = useState<DeductionComponent[]>([
    { key: 'D1', name: '', amount: '', isCustom: false, calculationMethod: 'direct' }
  ]);
  const [employeeCode, setEmployeeCode] = useState('');
  const [calculationResult, setCalculationResult] = useState<PayrollCalculationResult | null>(null);
  const [showValidationDetails, setShowValidationDetails] = useState(false);

  const [formData, setFormData] = useState<FormData>({
    employee_id: '',
    period_start: '',
    period_end: '',
    base_salary: '',
    overtime_hours: '',
    overtime_rate: '',
    deductions: '',
    bonus: '',
  });

  const { user } = useAuth();

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        await Promise.all([
          fetchEmployees(),
          fetchSalaryComponentTypes(),
          fetchDeductionComponentTypes(),
        ]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  useEffect(() => {
    if (formData.employee_id) {
      const selectedEmployee = employees.find(emp => emp.id === formData.employee_id);
      if (selectedEmployee?.employee_code) {
        setEmployeeCode(selectedEmployee.employee_code);
      }
    }
  }, [formData.employee_id, employees]);

  const validatePayrollData = useCallback(async () => {
    if (!formData.employee_id || !formData.period_start || !formData.period_end) {
      return;
    }

    try {
      setValidating(true);
      setError(null);

      const result = await validatePayrollPeriod({
        employeeId: formData.employee_id,
        startDate: formData.period_start,
        endDate: formData.period_end
      });

      setCalculationResult(result);

      if (result.payableDaysFactor < 1 && result.payableDaysFactor > 0) {
        const updatedSalaryComponents = salaryComponents.map(component => {
          if (component.calculationMethod === 'direct' && component.amount) {
            const originalAmount = parseFloat(component.amount);
            const adjustedAmount = originalAmount * result.payableDaysFactor;
            return {
              ...component,
              amount: adjustedAmount.toFixed(2)
            };
          }
          return component;
        });

        // Only update state if values have changed
        if (JSON.stringify(updatedSalaryComponents) !== JSON.stringify(salaryComponents)) {
          setSalaryComponents(updatedSalaryComponents);
        }
      }

      if (result.validationErrors.length > 0) {
        setError(`Validation errors: ${result.validationErrors.join(', ')}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to validate payroll data');
    } finally {
      setValidating(false);
    }
  }, [formData.employee_id, formData.period_start, formData.period_end, salaryComponents]);

  useEffect(() => {
    if (formData.employee_id && formData.period_start && formData.period_end) {
      validatePayrollData();
    }
  }, [formData.employee_id, formData.period_start, formData.period_end]);


  const calculateComponentAmount = useCallback((
    component: SalaryComponent | DeductionComponent,
    allComponents: (SalaryComponent | DeductionComponent)[],
    isSalaryComponent: boolean
  ): number => {
    if (component.calculationMethod === 'direct') {
      return parseFloat(component.amount) || 0;
    }

    if (component.calculationMethod === 'percentage' &&
      component.percentageValue &&
      component.referenceComponents?.length) {
      let baseAmount = 0;

      // For deductions, allow referencing salary components
      if (!isSalaryComponent) {
        baseAmount = component.referenceComponents.reduce((total, refName) => {
          const referenceComponent = [...salaryComponents, ...deductionComponents].find(c => c.name === refName);
          return total + (referenceComponent ? parseFloat(referenceComponent.amount) || 0 : 0);
        }, 0);
      } else {
        // For salary components, only reference other salary components
        baseAmount = component.referenceComponents.reduce((total, refName) => {
          const referenceComponent = salaryComponents.find(c => c.name === refName);
          return total + (referenceComponent ? parseFloat(referenceComponent.amount) || 0 : 0);
        }, 0);
      }

      const percentage = parseFloat(component.percentageValue) || 0;
      return (baseAmount * percentage) / 100;
    }

    return 0;
  }, [salaryComponents, deductionComponents]);

  // Update salary component calculations
  useEffect(() => {
    const updatedComponents = [...salaryComponents];
    let hasUpdates = false;

    updatedComponents.forEach((component, index) => {
      if (component.calculationMethod === 'percentage' &&
        component.percentageValue &&
        component.referenceComponents?.length) {
        const amount = calculateComponentAmount(component, updatedComponents, true);
        if (amount.toFixed(2) !== parseFloat(component.amount).toFixed(2)) {
          updatedComponents[index] = { ...component, amount: amount.toFixed(2) };
          hasUpdates = true;
        }
      }
    });

    if (hasUpdates) {
      setSalaryComponents(updatedComponents);
    }
  }, [salaryComponents.map(comp =>
    comp.calculationMethod === 'percentage' ?
      `${comp.percentageValue}-${comp.referenceComponents?.join(',')}` :
      comp.amount
  ).join('-'), calculateComponentAmount]);

  // Update deduction component calculations
  useEffect(() => {
    const updatedComponents = [...deductionComponents];
    let hasUpdates = false;

    updatedComponents.forEach((component, index) => {
      if (component.calculationMethod === 'percentage' &&
        component.percentageValue &&
        component.referenceComponents?.length) {
        const amount = calculateComponentAmount(component, updatedComponents, false);
        if (amount !== parseFloat(component.amount)) {
          updatedComponents[index] = { ...component, amount: amount.toFixed(2) };
          hasUpdates = true;
        }
      }
    });

    if (hasUpdates) {
      setDeductionComponents(updatedComponents);
    }
  }, [deductionComponents.map(comp =>
    comp.calculationMethod === 'percentage' ?
      `${comp.percentageValue}-${comp.referenceComponents?.join(',')}` :
      comp.amount
  ).join('-'), calculateComponentAmount, salaryComponents]);

  const addSalaryComponent = () => {
    setSalaryComponents([...salaryComponents, {
      key: 'E' + (salaryComponents.length + 1),
      name: '',
      amount: '',
      isCustom: false,
      calculationMethod: 'direct'
    }]);
  };

  const addDeductionComponent = () => {
    setDeductionComponents([...deductionComponents, {
      key: 'D' + (deductionComponents.length + 1),
      name: '',
      amount: '',
      isCustom: false,
      calculationMethod: 'direct'
    }]);
  };

  const updateSalaryComponent = (key: string, updates: Partial<SalaryComponent>) => {
    const updated = [...salaryComponents];
    const keyIndex = updated.findIndex(comp => comp.key === key);
    updated[keyIndex] = { ...updated[keyIndex], ...updates };

    if (updates.calculationMethod === 'direct') {
      updated[keyIndex].percentageValue = undefined;
      updated[keyIndex].referenceComponents = undefined;
    }

    setSalaryComponents(updated);
  };

  const updateDeductionComponent = (key: string, updates: Partial<DeductionComponent>) => {
    const updated = [...deductionComponents];
    const keyIndex = updated.findIndex(comp => comp.key === key);
    updated[keyIndex] = { ...updated[keyIndex], ...updates };

    if (updates.calculationMethod === 'direct') {
      updated[keyIndex].percentageValue = undefined;
      updated[keyIndex].referenceComponents = undefined;
    }

    setDeductionComponents(updated);
  };

  const removeSalaryComponent = (index: number) => {
    if (salaryComponents.length > 1) {
      setSalaryComponents(salaryComponents.filter((_, i) => i !== index));
    }
  };

  const removeDeductionComponent = (index: number) => {
    if (deductionComponents.length > 1) {
      setDeductionComponents(deductionComponents.filter((_, i) => i !== index));
    }
  };

  const calculateTotalAmount = () => {
    const baseSalary = salaryComponents.reduce((sum, comp) => sum + (parseFloat(comp.amount) || 0), 0);
    const overtimeAmount = (parseFloat(formData.overtime_hours) || 0) * (parseFloat(formData.overtime_rate) || 0);
    const totalDeductions = deductionComponents.reduce((sum, comp) => sum + (parseFloat(comp.amount) || 0), 0);
    const bonus = parseFloat(formData.bonus) || 0;

    // If we have calculation results, use the payable days factor
    if (calculationResult) {
      return calculateFinalPayrollAmount(
        baseSalary,
        calculationResult.payableDaysFactor,
        overtimeAmount,
        totalDeductions,
        bonus
      );
    }

    // Otherwise use the standard calculation
    return baseSalary + overtimeAmount - totalDeductions + bonus;
  };

  const validateForm = (): boolean => {
    if (!formData.employee_id) {
      setError('Please select an employee');
      return false;
    }

    if (!formData.period_start || !formData.period_end) {
      setError('Please set the payroll period');
      return false;
    }

    if (new Date(formData.period_start) > new Date(formData.period_end)) {
      setError('Period start date cannot be after end date');
      return false;
    }

    const hasInvalidSalaryComponent = salaryComponents.some(comp => !comp.name || !comp.amount);
    if (hasInvalidSalaryComponent) {
      setError('Please fill in all salary component details');
      return false;
    }

    const hasInvalidDeductionComponent = deductionComponents.some(comp =>
      comp.name && !comp.amount || !comp.name && comp.amount
    );
    if (hasInvalidDeductionComponent) {
      setError('Please fill in all deduction component details');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!validateForm()) {
      return;
    }

    try {
      setLoading(true);
      const totalAmount = calculateTotalAmount();

      // Ensure we have at least one salary component
      if (salaryComponents.length === 0) {
        throw new Error('At least one salary component is required');
      }

      // Transform salary components
      const transformedSalaryComponents = salaryComponents
        .filter(comp => comp.name && parseFloat(comp.amount) > 0)
        .map(comp => ({
          name: comp.name,
          amount: parseFloat(comp.amount) || 0,
          calculation_method: comp.calculationMethod,
          percentage_value: comp.calculationMethod === 'percentage' ? parseFloat(comp.percentageValue || '0') : undefined,
          reference_components: comp.calculationMethod === 'percentage' ? comp.referenceComponents : undefined
        }));

      // Transform deduction components - only include if there are valid deductions
      const validDeductionComponents = deductionComponents
        .filter(comp => comp.name && parseFloat(comp.amount) > 0);

      const transformedDeductionComponents = validDeductionComponents.map(comp => ({
        name: comp.name,
        amount: parseFloat(comp.amount) || 0,
        calculation_method: comp.calculationMethod,
        percentage_value: comp.calculationMethod === 'percentage' ? parseFloat(comp.percentageValue || '0') : undefined,
        reference_components: comp.calculationMethod === 'percentage' ? comp.referenceComponents : undefined
      }));

      const baseSalary = transformedSalaryComponents.reduce((sum, comp) => sum + comp.amount, 0);
      const totalDeductions = transformedDeductionComponents.reduce((sum, comp) => sum + comp.amount, 0);

      // Include attendance validation data if available
      const attendanceData = calculationResult ? {
        attendance_summary: {
          total_working_days: calculationResult.totalWorkingDays,
          total_present_days: calculationResult.totalPresentDays,
          total_absent_days: calculationResult.totalAbsentDays,
          total_leave_days: calculationResult.totalLeaveDays,
          total_paid_leave_days: calculationResult.totalPaidLeaveDays,
          payable_days_factor: calculationResult.payableDaysFactor
        }
      } : {};

      await createPayrollEntry({
        employee_id: formData.employee_id,
        employee_code: employeeCode || undefined,
        period_start: formData.period_start,
        period_end: formData.period_end,
        base_salary: baseSalary,
        salary_components: transformedSalaryComponents,
        overtime_hours: parseFloat(formData.overtime_hours || '0'),
        overtime_rate: parseFloat(formData.overtime_rate || '0'),
        deductions: validDeductionComponents.length > 0 ? totalDeductions : 0,
        deduction_components: validDeductionComponents.length > 0 ? transformedDeductionComponents : [],
        bonus: parseFloat(formData.bonus || '0'),
        total_amount: totalAmount,
        status: 'Draft',
        payment_date: null,
        ...attendanceData
      });

      onPayrollAdded();
      onClose();

      // Reset form
      setFormData({
        employee_id: '',
        period_start: '',
        period_end: '',
        base_salary: '',
        overtime_hours: '',
        overtime_rate: '',
        deductions: '',
        bonus: '',
      });
      setSalaryComponents([{ key: 'E1', name: '', amount: '', isCustom: false, calculationMethod: 'direct' }]);
      setDeductionComponents([{ key: 'D1', name: '', amount: '', isCustom: false, calculationMethod: 'direct' }]);
      setEmployeeCode('');
      setCalculationResult(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create payroll entry');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity" aria-hidden="true">
          <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
        </div>

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">
          &#8203;
        </span>

        <div className="inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
          <div className="absolute top-0 right-0 pt-4 pr-4">
            <button
              type="button"
              className="bg-white rounded-md text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              onClick={onClose}
            >
              <span className="sr-only">Close</span>
              <X className="h-6 w-6" aria-hidden="true" />
            </button>
          </div>

          <div className="sm:flex sm:items-start">
            <div className="mt-3 text-center sm:mt-0 sm:text-left w-full">
              <h3 className="text-lg leading-6 font-medium text-gray-900">Add Payroll Entry</h3>
              {error && (
                <div className="mt-2 rounded-md bg-red-50 p-4">
                  <div className="text-sm text-red-700">{error}</div>
                </div>
              )}
              <form onSubmit={handleSubmit} className="mt-6 space-y-6">
                {/* Employee Selection */}
                <div>
                  <label htmlFor="employee" className="block text-sm font-medium text-gray-700">
                    Employee
                  </label>
                  <select
                    id="employee"
                    required
                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                    value={formData.employee_id}
                    onChange={(e) => setFormData({ ...formData, employee_id: e.target.value })}
                  >
                    <option value="">Select Employee</option>
                    {employees.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.name} - {employee.department}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Employee Code */}
                <div>
                  <label htmlFor="employee_code" className="block text-sm font-medium text-gray-700">
                    Employee Code (Optional)
                  </label>
                  <input
                    type="text"
                    id="employee_code"
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    value={employeeCode}
                    onChange={(e) => setEmployeeCode(e.target.value)}
                    placeholder="Enter employee code"
                  />
                </div>

                {/* Pay Period */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="period_start" className="block text-sm font-medium text-gray-700">
                      Period Start
                    </label>
                    <input
                      type="date"
                      id="period_start"
                      required
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      value={formData.period_start}
                      onChange={(e) => setFormData({ ...formData, period_start: e.target.value })}
                    />
                  </div>

                  <div>
                    <label htmlFor="period_end" className="block text-sm font-medium text-gray-700">
                      Period End
                    </label>
                    <input
                      type="date"
                      id="period_end"
                      required
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      value={formData.period_end}
                      onChange={(e) => setFormData({ ...formData, period_end: e.target.value })}
                    />
                  </div>
                </div>

                {/* Attendance Validation Results */}
                {calculationResult && (
                  <div className="bg-blue-50 p-4 rounded-md">
                    <div className="flex">
                      <Info className="h-5 w-5 text-blue-400" />
                      <div className="ml-3 flex-1">
                        <h3 className="text-sm font-medium text-blue-800 flex justify-between">
                          <span>Attendance Validation</span>
                          <button 
                            type="button" 
                            className="text-blue-600 hover:text-blue-800 text-xs underline"
                            onClick={() => setShowValidationDetails(!showValidationDetails)}
                          >
                            {showValidationDetails ? 'Hide Details' : 'Show Details'}
                          </button>
                        </h3>
                        
                        <div className="mt-2 text-sm text-blue-700 space-y-1">
                          <p>Working Days: {calculationResult.totalWorkingDays}</p>
                          <p>Present Days: {calculationResult.totalPresentDays}</p>
                          <p>Paid Leave Days: {calculationResult.totalPaidLeaveDays}</p>
                          <p>Payable Days: {calculationResult.totalPayableDays.toFixed(1)}</p>
                          <p>Payable Factor: {(calculationResult.payableDaysFactor * 100).toFixed(1)}%</p>
                          
                          {calculationResult.validationWarnings.length > 0 && (
                            <div className="mt-2 text-yellow-700">
                              <p className="font-medium">Warnings:</p>
                              <ul className="list-disc pl-5 space-y-1">
                                {calculationResult.validationWarnings.map((warning, index) => (
                                  <li key={index}>{warning}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                        
                        {showValidationDetails && (
                          <div className="mt-3 border-t border-blue-200 pt-3">
                            <h4 className="text-sm font-medium text-blue-800 mb-2">Daily Breakdown</h4>
                            <div className="max-h-40 overflow-y-auto">
                              <table className="min-w-full divide-y divide-blue-200">
                                <thead className="bg-blue-50">
                                  <tr>
                                    <th className="px-2 py-1 text-left text-xs font-medium text-blue-800">Date</th>
                                    <th className="px-2 py-1 text-left text-xs font-medium text-blue-800">Type</th>
                                    <th className="px-2 py-1 text-left text-xs font-medium text-blue-800">Status</th>
                                    <th className="px-2 py-1 text-left text-xs font-medium text-blue-800">Pay</th>
                                  </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-blue-100">
                                  {calculationResult.payableDaysBreakdown.map((day, index) => (
                                    <tr key={index} className="text-xs">
                                      <td className="px-2 py-1 whitespace-nowrap">{format(new Date(day.date), 'MMM dd')}</td>
                                      <td className="px-2 py-1 whitespace-nowrap">
                                        {day.isHoliday ? 'Holiday' : day.isWeekend ? 'Weekend' : 'Work Day'}
                                      </td>
                                      <td className="px-2 py-1 whitespace-nowrap">
                                        {day.isLeave ? `Leave (${day.leaveType})` : 
                                         day.attendanceStatus || (day.isWorkingDay ? 'Absent' : '-')}
                                      </td>
                                      <td className="px-2 py-1 whitespace-nowrap">
                                        {day.payFactor === 1 ? 'Full' : 
                                         day.payFactor === 0.5 ? 'Half' : 'None'}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Salary Components */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Salary Components
                    </label>
                    <button
                      type="button"
                      onClick={addSalaryComponent}
                      className="inline-flex items-center px-2 py-1 border border-transparent text-xs font-medium rounded text-indigo-600 bg-indigo-100 hover:bg-indigo-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                    >
                      Add Component
                    </button>
                  </div>
                  {salaryComponents.map((component, index) => (
                    <div key={component.key} className="mb-4 p-4 border rounded-lg bg-gray-50">
                      <div className="grid grid-cols-1 gap-4">
                        {/* Component Name Selection */}
                        <div className="flex gap-2">
                          <select
                            className="w-24 border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                            value={component.isCustom ? 'custom' : 'predefined'}
                            onChange={(e) => updateSalaryComponent(component.key, {
                              isCustom: e.target.value === 'custom',
                              name: ''
                            })}
                            aria-label='Salary Component Type'
                          >
                            <option value="predefined">Select</option>
                            <option value="custom">Custom</option>
                          </select>
                          {component.isCustom ? (
                            <input
                              type="text"
                              placeholder="Enter component name"
                              className="flex-1 border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                              value={component.name}
                              onChange={(e) => updateSalaryComponent(component.key, { name: e.target.value })}
                              required
                            />
                          ) : (
                            <select
                              className="flex-1 border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                              value={component.name}
                              onChange={(e) => updateSalaryComponent(component.key, { name: e.target.value })}
                              aria-label='Salary Component Type'
                              required
                            >
                              <option value="">Select Component</option>
                              {salaryComponentTypes.map((type) => (
                                <option key={type.id} value={type.name}>
                                  {type.name}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>

                        {/* Calculation Method Toggle */}
                        <div className="flex items-center gap-4">
                          <label className="flex items-center">
                            <input
                              type="radio"
                              className="form-radio h-4 w-4 text-indigo-600"
                              checked={component.calculationMethod === 'direct'}
                              onChange={() => updateSalaryComponent(component.key, { calculationMethod: 'direct' })}
                            />
                            <span className="ml-2 text-sm text-gray-700">Direct Amount</span>
                          </label>
                          <label className="flex items-center">
                            <input
                              type="radio"
                              className="form-radio h-4 w-4 text-indigo-600"
                              checked={component.calculationMethod === 'percentage'}
                              onChange={() => updateSalaryComponent(component.key, { calculationMethod: 'percentage' })}
                            />
                            <span className="ml-2 text-sm text-gray-700">Percentage Based</span>
                          </label>
                        </div>

                        {/* Amount Input or Percentage Configuration */}
                        {component.calculationMethod === 'direct' ? (
                          <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                              <span className="text-gray-500 sm:text-sm">$</span>
                            </div>
                            <input
                              type="number"
                              placeholder="Amount"
                              className="block w-full pl-7 border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                              value={component.amount}
                              onChange={(e) => updateSalaryComponent(component.key, { amount: e.target.value })}
                              required
                              min="0"
                              step="0.01"
                            />
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <select
                                multiple
                                className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                value={component.referenceComponents || []}
                                onChange={(e) => {
                                  const selectedOptions = Array.from(e.target.selectedOptions).map(opt => opt.value);
                                  updateSalaryComponent(component.key, {
                                    ...component,
                                    referenceComponents: selectedOptions
                                  });
                                }}
                                size={4}
                                aria-label='Reference Salary Components'
                              >
                                {salaryComponents
                                  .filter((_, i) => i < index)
                                  .map((comp, i) => (
                                    <option
                                      key={comp.key}
                                      value={comp.name}
                                      disabled={!comp.name}
                                    >
                                      {comp.name || `Component ${i + 1}`}
                                      {comp.amount ? ` ($${parseFloat(comp.amount).toFixed(2)})` : ''}
                                    </option>
                                  ))}
                              </select>
                              <p className="mt-1 text-xs text-gray-500">
                                Hold Ctrl/Cmd to select multiple components
                              </p>
                            </div>
                            <div className="relative">
                              <input
                                type="number"
                                placeholder="Percentage"
                                className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 pr-8 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                value={component.percentageValue || ''}
                                onChange={(e) => updateSalaryComponent(component.key, {
                                  ...component,
                                  percentageValue: e.target.value
                                })}
                                required
                                min="0"
                                max="100"
                                step="0.01"
                              />
                              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                                <span className="text-gray-500 sm:text-sm">%</span>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Calculated Amount Display for Percentage */}
                        {component.calculationMethod === 'percentage' && (
                          <div className="text-sm text-gray-500">
                            Calculated Amount: ${parseFloat(component.amount || '0').toFixed(2)}
                          </div>
                        )}

                        {/* Remove Button */}
                        {salaryComponents.length > 1 && (
                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={() => removeSalaryComponent(index)}
                              className="inline-flex items-center px-2 py-1 border border-transparent rounded-md text-sm font-medium text-red-600 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                            >
                              Remove
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Overtime */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="overtime_hours" className="block text-sm font-medium text-gray-700">
                      Overtime Hours
                    </label>
                     <div className="relative">
                      <input
                        type="number"
                        id="overtime_hours"
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        value={formData.overtime_hours}
                        onChange={(e) => setFormData({ ...formData, overtime_hours: e.target.value })}
                        min="0"
                        step="0.5"
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="overtime_rate" className="block text-sm font-medium text-gray-700">
                      Overtime Rate (per hour)
                    </label>
                    <div className="relative mt-1">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <span className="text-gray-500 sm:text-sm">$</span>
                      </div>
                      <input
                        type="number"
                        id="overtime_rate"
                        className="block w-full pl-7 border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        value={formData.overtime_rate}
                        onChange={(e) => setFormData({ ...formData, overtime_rate: e.target.value })}
                        min="0"
                        step="0.01"
                      />
                    </div>
                  </div>
                </div>

                {/* Deduction Components */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Deduction Components
                    </label>
                    <button
                      type="button"
                      onClick={addDeductionComponent}
                      className="inline-flex items-center px-2 py-1 border border-transparent text-xs font-medium rounded text-indigo-600 bg-indigo-100 hover:bg-indigo-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                    >
                      Add Deduction
                    </button>
                  </div>
                  {deductionComponents.map((component, index) => (
                    <div key={component.key} className="mb-4 p-4 border rounded-lg bg-gray-50">
                      <div className="grid grid-cols-1 gap-4">
                        {/* Component Name Selection */}
                        <div className="flex gap-2">
                          <select
                            className="w-24 border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                            value={component.isCustom ? 'custom' : 'predefined'}
                            onChange={(e) => updateDeductionComponent(component.key, {
                              isCustom: e.target.value === 'custom',
                              name: ''
                            })}
                            aria-label="Deduction Component Type"
                          >
                            <option value="predefined">Select</option>
                            <option value="custom">Custom</option>
                          </select>
                          {component.isCustom ? (
                            <input
                              type="text"
                              placeholder="Enter deduction name"
                              className="flex-1 border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                              value={component.name}
                              onChange={(e) => updateDeductionComponent(component.key, { name: e.target.value })}
                              required
                            />
                          ) : (
                            <select
                              className="flex-1 border border-gray-300 rounded-m d shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                              value={component.name}
                              onChange={(e) => updateDeductionComponent(component.key, { name: e.target.value })}
                              aria-label='Deduction Component Type'
                              required
                            >
                              <option value="">Select Deduction</option>
                              {deductionComponentTypes.map((type) => (
                                <option key={type.id} value={type.name}>
                                  {type.name}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>

                        {/* Calculation Method Toggle */}
                        <div className="flex items-center gap-4">
                          <label className="flex items-center">
                            <input
                              type="radio"
                              className="form-radio h-4 w-4 text-indigo-600"
                              checked={component.calculationMethod === 'direct'}
                              onChange={() => updateDeductionComponent(component.key, { calculationMethod: 'direct' })}
                            />
                            <span className="ml-2 text-sm text-gray-700">Direct Amount</span>
                          </label>
                          <label className="flex items-center">
                            <input
                              type="radio"
                              className="form-radio h-4 w-4 text-indigo-600"
                              checked={component.calculationMethod === 'percentage'}
                              onChange={() => updateDeductionComponent(component.key, { calculationMethod: 'percentage' })}
                            />
                            <span className="ml-2 text-sm text-gray-700">Percentage Based</span>
                          </label>
                        </div>

                        {/* Amount Input or Percentage Configuration */}
                        {component.calculationMethod === 'direct' ? (
                          <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                              <span className="text-gray-500 sm:text-sm">$</span>
                            </div>
                            <input
                              type="number"
                              placeholder="Amount"
                              className="block w-full pl-7 border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                              value={component.amount}
                              onChange={(e) => updateDeductionComponent(component.key, { amount: e.target.value })}
                              required
                              min="0"
                              step="0.01"
                            />
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <select
                                multiple
                                className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                value={component.referenceComponents || []}
                                onChange={(e) => {
                                  const selectedOptions = Array.from(e.target.selectedOptions).map(opt => opt.value);
                                  updateDeductionComponent(component.key, {
                                    ...component,
                                    referenceComponents: selectedOptions
                                  });
                                }}
                                size={4}
                                aria-label='Reference Salary Components'
                              >
                                {[...salaryComponents, ...deductionComponents]
                                  .filter((cmp, i) => cmp.key.startsWith('E') || (cmp.key.startsWith('D')  && parseInt(cmp.key.substring(1)) < (index + 1)))
                                  .map((comp, i) => (
                                    <option
                                      key={comp.key}
                                      value={comp.name}
                                      disabled={!comp.name}
                                    >
                                      {comp.name || `Component ${i + 1}`}
                                      {comp.amount ? ` ($${parseFloat(comp.amount).toFixed(2)})` : ''}
                                    </option>
                                  ))}
                              </select>
                              <p className="mt-1 text-xs text-gray-500">
                                Hold Ctrl/Cmd to select multiple components
                              </p>
                            </div>


                            <div className="relative">
                              <input
                                type="number"
                                placeholder="Percentage"
                                className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 pr-8 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                value={component.percentageValue || ''}
                                onChange={(e) => updateDeductionComponent(component.key, {
                                  ...component,
                                  percentageValue: e.target.value
                                })}
                                min="0"
                                max="100"
                                step="0.01"
                              />
                              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                                <span className="text-gray-500 sm:text-sm">%</span>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Calculated Amount Display for Percentage */}
                        {component.calculationMethod === 'percentage' && (
                          <div className="text-sm text-gray-500">
                            Calculated Amount: ${parseFloat(component.amount || '0').toFixed(2)}
                          </div>
                        )}

                        {/* Remove Button */}
                        {deductionComponents.length > 1 && (
                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={() => removeDeductionComponent(index)}
                              className="inline-flex items-center px-2 py-1 border border-transparent rounded-md text-sm font-medium text-red-600 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                            >
                              Remove
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Bonus */}
                <div>
                  <label htmlFor="bonus" className="block text-sm font-medium text-gray-700">
                    Bonus
                  </label>
                  <div className="relative mt-1">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <span className="text-gray-500 sm:text-sm">$</span>
                    </div>
                    <input
                      type="number"
                      id="bonus"
                      className="block w-full pl-7 border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      value={formData.bonus}
                      onChange={(e) => setFormData({ ...formData, bonus: e.target.value })}
                      min="0"
                      step="0.01"
                    />
                  </div>
                </div>

                {/* Total Amount Display */}
                <div className="border-t pt-4">
                  <div className="flex justify-between items-center text-lg font-medium">
                    <span>Total Amount:</span>
                    <span>${calculateTotalAmount().toFixed(2)}</span>
                  </div>
                  
                  {calculationResult && calculationResult.payableDaysFactor < 1 && (
                    <div className="mt-2 text-sm text-gray-500">
                      <p>
                        * Salary components adjusted based on attendance ({(calculationResult.payableDaysFactor * 100).toFixed(1)}% of full period)
                      </p>
                    </div>
                  )}
                </div>

                <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
                  <button
                    type="submit"
                    disabled={loading || validating}
                    className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
                  >
                    {loading ? 'Adding...' : validating ? 'Validating...' : 'Add Payroll Entry'}
                  </button>
                  <button
                    type="button"
                    className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:w-auto sm:text-sm"
                    onClick={onClose}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}