import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Plus, Trash2, Percent, DollarSign, Info } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';
import { validateAuth } from '../../../stores/utils/storeUtils';
import { useEmployeesStore, type Employee } from '../../../stores/employeesStore';
import {
  useSalaryStructuresStore,
  type SalaryStructureHeader,
  type SalaryStructure,
  type SalaryStructureComponent,
  type ComponentType,
} from '../../../stores/salaryStructuresStore';
import {
  usePayrollStore,
  type PayrollProcessEntry,
} from '../../../stores/payrollStore';
import {
  validatePayrollPeriod,
  calculateFinalPayrollAmount,
  PayrollCalculationResult,
} from '../../../lib/payrollCalculation';
import { format } from 'date-fns';

interface AddPayProcessModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPayrollAdded: () => void;
  selectedProcessId?: string | null; // ✅ Accept selected structure
}

export default function AddPayProcessModal({
  isOpen,
  onClose,
  onPayrollAdded,
  selectedProcessId,
}: AddPayProcessModalProps) {
  const { user } = useAuth();
  const { items: employees, fetchEmployees } = useEmployeesStore();
  const {
    items: structures,
    salaryComponentTypes,
    deductionComponentTypes,
    fetchSalaryStructures,
    fetchSalaryStructureDetails,
    fetchSalaryComponentTypes,
    fetchDeductionComponentTypes,
    createSalaryStructure,
    updateSalaryStructure,
  } = useSalaryStructuresStore();
  const { createPayProcessEntry, updatePayProcessEntry } = usePayrollStore();

  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [employeeCode, setEmployeeCode] = useState('');
  const [selectedStructure, setSelectedStructure] =
    useState<SalaryStructureHeader | null>(null);

  // ✅ NEW: Track initial salary structure for change detection
  const [initialStructureId, setInitialStructureId] = useState<string>('');
  const [hasStructureChanged, setHasStructureChanged] = useState(false);
  const componentRefs = useRef<
    Record<string, HTMLInputElement | HTMLSelectElement | null>
  >({});
  const [calculationResult, setCalculationResult] =
    useState<PayrollCalculationResult | null>(null);
  const [showValidationDetails, setShowValidationDetails] = useState(false);
  const [lastKeyNumber, setLastKeyNumber] = useState(0);

  // const [formData, setFormData] = useState<FormData>({
  //   employee_id: '',
  //   period_start: '',
  //   period_end: '',
  //   base_salary: '',
  //   overtime_hours: '',
  //   overtime_rate: '',
  //   deductions: '',
  //   bonus: '',
  // });

  const [formData, setFormData] = useState<{
    employee_id: string;
    period_start: string;
    period_end: string;
    structure_id: string;
    earnings: SalaryStructureComponent[];
    deductions: SalaryStructureComponent[];
  }>({
    employee_id: '',
    period_start: '',
    period_end: '',
    structure_id: '',
    earnings: [],
    deductions: [],
  });

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        await Promise.all([
          fetchEmployees(),
          fetchSalaryStructures(),
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

  // ✅ NEW: Auto-populate salary structure when employee is selected
  useEffect(() => {
    const fetchEmployeeSalaryStructure = async () => {
      if (!formData.employee_id) return;

      const selectedEmployee = employees.find(
        (emp) => emp.id === formData.employee_id
      );
      if (selectedEmployee?.employee_code) {
        setEmployeeCode(selectedEmployee.employee_code);
      }

      try {
        const auth = await validateAuth();
        if (!auth.isAuthenticated || !auth.tenantId) return;

        // Fetch current salary structure for the employee
        const { data: employeeSalaryStructures, error: fetchError } = await supabase
          .from('employee_salary_structures')
          .select('structure_id, effective_from, effective_to')
          .eq('employee_id', formData.employee_id)
          .eq('tenant_id', auth.tenantId)
          .order('effective_from', { ascending: false })
          .limit(1);

        if (fetchError) {
          console.error('Error fetching employee salary structure:', fetchError);
          return;
        }

        // If employee has a current salary structure, auto-populate it
        if (employeeSalaryStructures && employeeSalaryStructures.length > 0) {
          const currentStructure = employeeSalaryStructures[0];
          const structureId = currentStructure.structure_id;

          // Set the initial structure ID for change tracking
          setInitialStructureId(structureId);
          setHasStructureChanged(false);

          // Auto-populate the structure dropdown
          setFormData(prev => ({ ...prev, structure_id: structureId }));

          // Set the selected structure object
          const structure = structures.find(s => s.id === structureId);
          if (structure) {
            setSelectedStructure(structure);
          }
        } else {
          // No existing structure - reset tracking
          setInitialStructureId('');
          setHasStructureChanged(false);
        }
      } catch (err) {
        console.error('Error in fetchEmployeeSalaryStructure:', err);
      }
    };

    fetchEmployeeSalaryStructure();
  }, [formData.employee_id, employees, structures]);

  const validatePayrollData = useCallback(async () => {
    if (
      !formData.employee_id ||
      !formData.period_start ||
      !formData.period_end
    ) {
      return;
    }

    try {
      setValidating(true);
      setError(null);

      const result = await validatePayrollPeriod({
        employeeId: formData.employee_id,
        startDate: formData.period_start,
        endDate: formData.period_end,
      });

      setCalculationResult(result);

      if (result.payableDaysFactor < 1 && result.payableDaysFactor > 0) {
        const updatedSalaryComponents = [
          ...formData.earnings,
          ...formData.deductions,
        ].map((component) => {
          if (
            component.calculation_method !== 'percentage' &&
            component.amount
          ) {
            const originalAmount = component.amount;
            const adjustedAmount = originalAmount * result.payableDaysFactor;
            return {
              ...component,
              amount: adjustedAmount.toFixed(2),
            };
          }
          return component;
        });

        // // Only update state if values have changed
        // if (JSON.stringify(updatedSalaryComponents) !== JSON.stringify([...formData.earnings, ...formData.deductions])) {
        //   setSalaryComponents(updatedSalaryComponents);
        // }
      }

      if (result.validationErrors.length > 0) {
        setError(`Validation errors: ${result.validationErrors.join(', ')}`);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to validate payroll data'
      );
    } finally {
      setValidating(false);
    }
  }, [
    formData.employee_id,
    formData.period_start,
    formData.period_end,
    formData.earnings,
    formData.deductions,
  ]);

  useEffect(() => {
    if (selectedStructure) {
      const loadStructureComponents = async () => {
        try {
          setLoading(true);
          if (selectedStructure.id) {
            const fetchedStructureDetails = await fetchSalaryStructureDetails(
              selectedStructure.id
            );

            let maxKeyNumber = 0;

            const updatedEarnings = fetchedStructureDetails[0].components
              .filter((c) => c.component_type === 'earning')
              .map((comp) => {
                return {
                  ...comp,
                  key: `E${++maxKeyNumber}`,
                  // reference_components: (comp.reference_components || []).map(ref => ({
                  //   id: ref.id,
                  //   name: '', // ✅ Assign empty name
                  // })),
                };
              });

            const updatedDeductions = fetchedStructureDetails[0].components
              .filter((c) => c.component_type === 'deduction')
              .map((comp) => {
                return {
                  ...comp,
                  key: `D${++maxKeyNumber}`,
                  // reference_components: (comp.reference_components || []).map(ref => ({
                  //   id: ref.id,
                  //   name: '', // ✅ Assign empty name
                  // })),
                };
              });

            setLastKeyNumber(maxKeyNumber); // ✅ Ensure state maintains the last used number

            // setSelectedStructureDetails(fetchedStructureDetails);

            setFormData({
              ...formData,
              structure_id: fetchedStructureDetails[0].id || '',
              earnings: updatedEarnings,
              deductions: updatedDeductions,
            });
          }
        } catch (err) {
          setError(
            err instanceof Error ? err.message : 'Failed to load structures'
          );
        } finally {
          setLoading(false);
        }
      };

      loadStructureComponents();
    }
  }, [selectedStructure]);

  const addComponent = (type: 'earning' | 'deduction') => {
    setFormData((prev) => {
      // Get all existing components
      const allComponents = [...prev.earnings, ...prev.deductions];

      // Find the first component with an empty name
      const emptyComponent = allComponents.find(
        (comp) => comp.name.trim() === ''
      );

      if (emptyComponent) {
        // Focus on the input field of the empty component
        if (componentRefs.current[emptyComponent.key]) {
          componentRefs.current[emptyComponent.key]?.focus();
        }
        alert(
          'Please fill in the name for the existing component before adding a new one.'
        );
        return prev; // ❌ Prevent adding a new component
      }

      const newKey = `${type === 'earning' ? 'E' : 'D'}${lastKeyNumber + 1}`;
      setLastKeyNumber((prevKey) => prevKey + 1); // ✅ Increment key counter

      let newComponent = {
        key: newKey,
        id: '',
        name: '',
        component_type: type,
        isCustom: false,
        calculation_method: 'fixed',
        is_taxable: type === 'earning',
        reference_components: [],
        display_order: prev.earnings.length + prev.deductions.length,
      };

      return {
        ...prev,
        [type === 'earning' ? 'earnings' : 'deductions']: [
          ...prev[type === 'earning' ? 'earnings' : 'deductions'],
          newComponent,
        ],
      };
    });
  };

  const removeComponent = (type: 'earning' | 'deduction', index: number) => {
    setFormData((prev) => ({
      ...prev,
      [type === 'earning' ? 'earnings' : 'deductions']: prev[
        type === 'earning' ? 'earnings' : 'deductions'
      ].filter((_, i) => i !== index),
    }));
  };

  const updateComponent = (
    type: 'earning' | 'deduction',
    index: number,
    updates: Partial<SalaryStructureComponent>
  ) => {
    setFormData((prev) => {
      const existingNames = [...prev.earnings, ...prev.deductions]
        .filter((comp, i) => comp.key !== updates.key) // ✅ Exclude current component to allow renaming
        .map((c) => c.name.toLowerCase());

      if (updates.name && existingNames.includes(updates.name.toLowerCase())) {
        // Find the duplicate component
        const duplicateComp = [...prev.earnings, ...prev.deductions].find(
          (c) => c.name.toLowerCase() === updates.name?.toLowerCase()
        );
        if (duplicateComp && componentRefs.current[duplicateComp.key]) {
          componentRefs.current[duplicateComp.key]?.focus(); // ✅ Focus on the duplicate component
        }

        alert('Component name already exists! Please use a different name.');
        return prev; // ❌ Prevent updating to a duplicate name
      }

      return {
        ...prev,
        [type === 'earning' ? 'earnings' : 'deductions']: prev[
          type === 'earning' ? 'earnings' : 'deductions'
        ].map((comp, i) => (i === index ? { ...comp, ...updates } : comp)),
      };
    });
  };

  const calculateComponentAmount = useCallback(
    (
      component: SalaryStructureComponent,
      allComponents: SalaryStructureComponent[]
    ) => {
      if (component.calculation_method !== 'percentage') {
        return component.amount || 0; // Correctly returning fixed/direct amount
      }

      if (
        component.calculation_method === 'percentage' &&
        component.percentage_value &&
        component.reference_components?.length
      ) {
        const baseAmount = component.reference_components.reduce(
          (total, ref) => {
            const refComponent = allComponents.find((c) => c.name === ref); // JSON.parse(ref).key);
            return total + (refComponent ? refComponent.amount || 0 : 0);
          },
          0
        );

        return (
          (baseAmount * parseFloat(component.percentage_value.toString())) / 100
        );
      }

      return 0;
    },
    []
  );

  const calculateTotal = (type: 'earning' | 'deduction') => {
    return formData[type === 'earning' ? 'earnings' : 'deductions'].reduce(
      (sum, comp) =>
        sum +
        calculateComponentAmount(comp, [
          ...formData.earnings,
          ...formData.deductions,
        ]),
      0
    );
  };

  // Update component calculations
  useEffect(() => {
    setFormData((prevData) => {
      const updatedComponents = [...prevData.earnings, ...prevData.deductions];
      let hasUpdates = false;

      updatedComponents.forEach((component, index) => {
        const newAmount = calculateComponentAmount(
          component,
          updatedComponents
        );
        if (
          newAmount.toFixed(2) !==
          (component.amount ? component.amount.toFixed(2) : '0.00')
        ) {
          updatedComponents[index] = {
            ...component,
            amount: parseFloat(newAmount.toFixed(2)),
          };
          hasUpdates = true;
        }
      });

      if (hasUpdates) {
        return {
          ...prevData,
          earnings: updatedComponents.filter(
            (c) => c.component_type === 'earning'
          ),
          deductions: updatedComponents.filter(
            (c) => c.component_type === 'deduction'
          ),
        };
      }

      return prevData;
    });
  }, [formData.earnings, formData.deductions, calculateComponentAmount]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      setLoading(true);
      setError(null);

      // ✅ NEW: Update employee_salary_structures if structure has changed
      if (hasStructureChanged && formData.structure_id) {
        const auth = await validateAuth();
        if (auth.isAuthenticated && auth.tenantId) {
          // Close any existing active salary structure assignments
          if (initialStructureId) {
            const { error: updateError } = await supabase
              .from('employee_salary_structures')
              .update({ effective_to: new Date().toISOString().split('T')[0] })
              .eq('employee_id', formData.employee_id)
              .eq('structure_id', initialStructureId)
              .eq('tenant_id', auth.tenantId)
              .is('effective_to', null);

            if (updateError) {
              console.error('Error closing previous salary structure:', updateError);
            }
          }

          // Create new salary structure assignment
          const { error: insertError } = await supabase
            .from('employee_salary_structures')
            .insert({
              employee_id: formData.employee_id,
              structure_id: formData.structure_id,
              effective_from: formData.period_start,
              effective_to: null,
              created_by: user.id,
              tenant_id: auth.tenantId,
            });

          if (insertError) {
            console.error('Error creating new salary structure assignment:', insertError);
            throw new Error('Failed to update employee salary structure');
          }
        }
      }

      await createPayProcessEntry({
        employee_id: formData.employee_id,
        employee_code: employeeCode || undefined,
        period_start: formData.period_start,
        period_end: formData.period_end,
        salary_components: [...formData.earnings, ...formData.deductions],
        deduction_components: formData.deductions,
        total_amount: calculateTotal('earning') - calculateTotal('deduction'),
        status: 'Draft',
        payment_date: null,
      });

      // const structureData = {
      //   id: selectedStructure?.id, // Only include id if editing
      //   ...formData,
      //   components: [...formData.earnings, ...formData.deductions],
      // };

      // if (selectedStructure) {
      //   if (structureData.id) {
      //     await updatePayProcessEntry(structureData.id, structureData); // Call update API
      //   } else {
      //     throw new Error('Structure ID is undefined');
      //   }
      // } else {
      //   await createPayProcessEntry({
      //     employee_id: formData.employee_id,
      //     employee_code: employeeCode || undefined,
      //     period_start: formData.period_start,
      //     period_end: formData.period_end,
      //     salary_components: formData.earnings,
      //     deduction_components: formData.deductions,
      //     total_amount: totalAmount,
      //     status: 'Draft',
      //     payment_date: null,
      //     ...attendanceData
      //   });

      // }

      onPayrollAdded();
      onClose();
      setFormData({
        name: '',
        description: '',
        is_active: true,
        earnings: [],
        deductions: [],
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to save salary structure'
      );
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

        <span
          className="hidden sm:inline-block sm:align-middle sm:h-screen"
          aria-hidden="true"
        >
          &#8203;
        </span>

        <div className="inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
          <div className="absolute top-0 right-0 pt-4 pr-4">
            <button
              onClick={onClose}
              className="bg-white rounded-md text-gray-400 hover:text-gray-500"
              aria-label="Close Modal"
            >
              <X className="h-6 w-6" aria-hidden="true" />
            </button>
          </div>

          <div className="mt-3 text-center sm:mt-0 sm:text-left w-full">
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              Create Payroll Entry
            </h3>

            {error && <div className="mt-2 text-red-600">{error}</div>}

            <form onSubmit={handleSubmit} className="mt-6 space-y-6">
              {/* Employee Selection */}
              <div>
                <label
                  htmlFor="employee"
                  className="block text-sm font-medium text-gray-700"
                >
                  Employee
                </label>
                <select
                  id="employee"
                  required
                  className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                  value={formData.employee_id}
                  onChange={(e) =>
                    setFormData({ ...formData, employee_id: e.target.value })
                  }
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
                <label
                  htmlFor="employee_code"
                  className="block text-sm font-medium text-gray-700"
                >
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

              {/* Structure Selection */}
              <div>
                <label
                  htmlFor="structure"
                  className="block text-sm font-medium text-gray-700"
                >
                  Salary Structure
                </label>
                <select
                  id="structure"
                  required
                  className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                  value={formData.structure_id}
                  onChange={(e) => {
                    const newStructureId = e.target.value;
                    setFormData({ ...formData, structure_id: newStructureId });
                    setSelectedStructure(
                      structures.find((s) => s.id === newStructureId) || null
                    );
                    // ✅ NEW: Track if structure has changed from initial value
                    setHasStructureChanged(initialStructureId !== newStructureId);
                  }}
                >
                  <option value="">Select Structure</option>
                  {structures.map((structure) => (
                    <option key={structure.id} value={structure.id}>
                      {structure.name}
                    </option>
                  ))}
                </select>
                {/* ✅ NEW: Show indicator when structure has been changed */}
                {hasStructureChanged && initialStructureId && (
                  <p className="mt-1 text-sm text-blue-600">
                    Structure changed - will be updated on save
                  </p>
                )}
              </div>

              {/* Pay Period */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="period_start"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Period Start
                  </label>
                  <input
                    type="date"
                    id="period_start"
                    required
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    value={formData.period_start}
                    onChange={(e) =>
                      setFormData({ ...formData, period_start: e.target.value })
                    }
                  />
                </div>

                <div>
                  <label
                    htmlFor="period_end"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Period End
                  </label>
                  <input
                    type="date"
                    id="period_end"
                    required
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    value={formData.period_end}
                    onChange={(e) =>
                      setFormData({ ...formData, period_end: e.target.value })
                    }
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
                          onClick={() =>
                            setShowValidationDetails(!showValidationDetails)
                          }
                        >
                          {showValidationDetails
                            ? 'Hide Details'
                            : 'Show Details'}
                        </button>
                      </h3>

                      <div className="mt-2 text-sm text-blue-700 space-y-1">
                        <p>
                          Working Days: {calculationResult.totalWorkingDays}
                        </p>
                        <p>
                          Present Days: {calculationResult.totalPresentDays}
                        </p>
                        <p>
                          Paid Leave Days:{' '}
                          {calculationResult.totalPaidLeaveDays}
                        </p>
                        <p>
                          Payable Days:{' '}
                          {calculationResult.totalPayableDays.toFixed(1)}
                        </p>
                        <p>
                          Payable Factor:{' '}
                          {(calculationResult.payableDaysFactor * 100).toFixed(
                            1
                          )}
                          %
                        </p>

                        {calculationResult.validationWarnings.length > 0 && (
                          <div className="mt-2 text-yellow-700">
                            <p className="font-medium">Warnings:</p>
                            <ul className="list-disc pl-5 space-y-1">
                              {calculationResult.validationWarnings.map(
                                (warning, index) => (
                                  <li key={index}>{warning}</li>
                                )
                              )}
                            </ul>
                          </div>
                        )}
                      </div>

                      {showValidationDetails && (
                        <div className="mt-3 border-t border-blue-200 pt-3">
                          <h4 className="text-sm font-medium text-blue-800 mb-2">
                            Daily Breakdown
                          </h4>
                          <div className="max-h-40 overflow-y-auto">
                            <table className="min-w-full divide-y divide-blue-200">
                              <thead className="bg-blue-50">
                                <tr>
                                  <th className="px-2 py-1 text-left text-xs font-medium text-blue-800">
                                    Date
                                  </th>
                                  <th className="px-2 py-1 text-left text-xs font-medium text-blue-800">
                                    Type
                                  </th>
                                  <th className="px-2 py-1 text-left text-xs font-medium text-blue-800">
                                    Status
                                  </th>
                                  <th className="px-2 py-1 text-left text-xs font-medium text-blue-800">
                                    Pay
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-blue-100">
                                {calculationResult.payableDaysBreakdown.map(
                                  (day, index) => (
                                    <tr key={index} className="text-xs">
                                      <td className="px-2 py-1 whitespace-nowrap">
                                        {format(new Date(day.date), 'MMM dd')}
                                      </td>
                                      <td className="px-2 py-1 whitespace-nowrap">
                                        {day.isHoliday
                                          ? 'Holiday'
                                          : day.isWeekend
                                          ? 'Weekend'
                                          : 'Work Day'}
                                      </td>
                                      <td className="px-2 py-1 whitespace-nowrap">
                                        {day.isLeave
                                          ? `Leave (${day.leaveType})`
                                          : day.attendanceStatus ||
                                            (day.isWorkingDay ? 'Absent' : '-')}
                                      </td>
                                      <td className="px-2 py-1 whitespace-nowrap">
                                        {day.payFactor === 1
                                          ? 'Full'
                                          : day.payFactor === 0.5
                                          ? 'Half'
                                          : 'None'}
                                      </td>
                                    </tr>
                                  )
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div>
                <h4 className="font-medium">Earnings</h4>
                <button
                  type="button"
                  onClick={() => addComponent('earning')}
                  className="text-indigo-600"
                >
                  <Plus className="h-4 w-4 inline" /> Add Earning
                </button>
              </div>
              {formData.earnings.map((component, index) => (
                <div
                  key={component.key}
                  className="mb-4 p-4 border rounded-lg bg-gray-50"
                >
                  <div className="grid grid-cols-1 gap-4">
                    {/* Component Name Selection */}
                    <div className="flex gap-2">
                      <select
                        className="w-24 border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        value={component.isCustom ? 'custom' : 'predefined'}
                        onChange={(e) =>
                          updateComponent('earning', index, {
                            isCustom: e.target.value === 'custom',
                            name: '',
                          })
                        }
                        aria-label="Salary Component Type"
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
                          onChange={(e) =>
                            updateComponent('earning', index, {
                              name: e.target.value,
                            })
                          }
                          ref={(el) =>
                            (componentRefs.current[component.key] = el)
                          } // ✅ Store ref for focus
                          required
                        />
                      ) : (
                        <select
                          className="flex-1 border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                          value={JSON.stringify({
                            id: component.id,
                            name: component.name,
                          })}
                          // onChange={(e) => updateComponent('earning', index, { name: e.target.value })}
                          onChange={(e) => {
                            const { id, name } = JSON.parse(e.target.value);
                            updateComponent('earning', index, { name, id });
                          }}
                          aria-label="Salary Component Type"
                          ref={(el) =>
                            (componentRefs.current[component.key] = el)
                          } // ✅ Store ref for focus
                          required
                        >
                          <option value="">Select Component</option>
                          {salaryComponentTypes.map((type) => (
                            <option
                              key={type.id}
                              value={JSON.stringify({
                                id: type.id,
                                name: type.name,
                              })}
                            >
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
                          checked={component.calculation_method === 'fixed'}
                          onChange={() =>
                            updateComponent('earning', index, {
                              calculation_method: 'fixed',
                            })
                          }
                        />
                        <span className="ml-2 text-sm text-gray-700">
                          Fixed Amount
                        </span>
                      </label>
                      <label className="flex items-center">
                        <input
                          type="radio"
                          className="form-radio h-4 w-4 text-indigo-600"
                          checked={component.calculation_method === 'direct'}
                          onChange={() =>
                            updateComponent('earning', index, {
                              calculation_method: 'direct',
                            })
                          }
                        />
                        <span className="ml-2 text-sm text-gray-700">
                          Direct Amount
                        </span>
                      </label>
                      <label className="flex items-center">
                        <input
                          type="radio"
                          className="form-radio h-4 w-4 text-indigo-600"
                          checked={
                            component.calculation_method === 'percentage'
                          }
                          onChange={() =>
                            updateComponent('earning', index, {
                              calculation_method: 'percentage',
                            })
                          }
                        />
                        <span className="ml-2 text-sm text-gray-700">
                          Percentage Based
                        </span>
                      </label>
                    </div>

                    {/* Amount Input or Percentage Configuration */}
                    {component.calculation_method !== 'percentage' ? (
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <span className="text-gray-500 sm:text-sm">₹</span>
                        </div>
                        <input
                          type="number"
                          placeholder="Amount"
                          className="block w-full pl-7 border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                          value={component.amount}
                          onChange={(e) =>
                            updateComponent('earning', index, {
                              amount: parseFloat(e.target.value),
                            })
                          }
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
                            value={(component.reference_components || [])
                              .map((ref) => {
                                const matchedComponent = formData.earnings
                                  .concat(formData.deductions)
                                  .find((c) => c.name === ref);
                                return matchedComponent
                                  ? matchedComponent.name
                                  : undefined;
                              })
                              .filter(
                                (name): name is string => name !== undefined
                              )}
                            onChange={(e) => {
                              const selectedOptions = Array.from(
                                e.target.selectedOptions
                              ).map((opt) => opt.value);
                              updateComponent(component.component_type, index, {
                                reference_components: selectedOptions,
                              }); // ✅ Store only 'id'
                            }}
                            size={4}
                            aria-label="Reference Salary Components"
                          >
                            {formData.earnings
                              .concat(formData.deductions) // ✅ Ensure all previous components are selectable
                              .filter((comp) => {
                                const allComponents = [
                                  ...formData.earnings,
                                  ...formData.deductions,
                                ];
                                const currentIndex = allComponents.findIndex(
                                  (c) => c.name === component.name
                                );
                                return (
                                  allComponents.findIndex(
                                    (c) => c.name === comp.name
                                  ) < currentIndex
                                );
                              })
                              .map((comp) => (
                                <option key={comp.key} value={comp.name}>
                                  {comp.name}{' '}
                                  {comp.amount
                                    ? `($${comp.amount.toFixed(2)})`
                                    : ''}
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
                            value={component.percentage_value || ''}
                            onChange={(e) =>
                              updateComponent('earning', index, {
                                ...component,
                                percentage_value: parseFloat(e.target.value),
                              })
                            }
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
                    {component.calculation_method === 'percentage' && (
                      <div className="text-sm text-gray-500">
                        Calculated Amount: ₹{component.amount || '0'}
                      </div>
                    )}

                    {/* Remove Button */}
                    {formData.earnings.length > 1 && (
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => removeComponent('earning', index)}
                          className="inline-flex items-center px-2 py-1 border border-transparent rounded-md text-sm font-medium text-red-600 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              <div>
                <h4 className="font-medium">Deductions</h4>
                <button
                  type="button"
                  onClick={() => addComponent('deduction')}
                  className="text-red-600"
                >
                  <Plus className="h-4 w-4 inline" /> Add Deduction
                </button>
              </div>
              {formData.deductions.map((component, index) => (
                <div
                  key={component.key}
                  className="mb-4 p-4 border rounded-lg bg-gray-50"
                >
                  <div className="grid grid-cols-1 gap-4">
                    {/* Component Name Selection */}
                    <div className="flex gap-2">
                      <select
                        className="w-24 border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        value={component.isCustom ? 'custom' : 'predefined'}
                        onChange={(e) =>
                          updateComponent('deduction', index, {
                            isCustom: e.target.value === 'custom',
                            name: '',
                          })
                        }
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
                          onChange={(e) =>
                            updateComponent('deduction', index, {
                              name: e.target.value,
                            })
                          }
                          ref={(el) =>
                            (componentRefs.current[component.key] = el)
                          } // ✅ Store ref for focus
                          required
                        />
                      ) : (
                        <select
                          className="flex-1 border border-gray-300 rounded-m d shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                          value={JSON.stringify({
                            id: component.id,
                            name: component.name,
                          })}
                          // onChange={(e) => updateComponent('deduction', index, { name: e.target.value })}
                          onChange={(e) => {
                            const { id, name } = JSON.parse(e.target.value);
                            updateComponent('deduction', index, { name, id });
                          }}
                          aria-label="Deduction Component Type"
                          ref={(el) =>
                            (componentRefs.current[component.key] = el)
                          } // ✅ Store ref for focus
                          required
                        >
                          <option value="">Select Deduction</option>
                          {deductionComponentTypes.map((type) => (
                            <option
                              key={type.id}
                              value={JSON.stringify({
                                id: type.id,
                                name: type.name,
                              })}
                            >
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
                          checked={component.calculation_method === 'fixed'}
                          onChange={() =>
                            updateComponent('deduction', index, {
                              calculation_method: 'fixed',
                            })
                          }
                        />
                        <span className="ml-2 text-sm text-gray-700">
                          Fixed Amount
                        </span>
                      </label>
                      <label className="flex items-center">
                        <input
                          type="radio"
                          className="form-radio h-4 w-4 text-indigo-600"
                          checked={component.calculation_method === 'direct'}
                          onChange={() =>
                            updateComponent('deduction', index, {
                              calculation_method: 'direct',
                            })
                          }
                        />
                        <span className="ml-2 text-sm text-gray-700">
                          Direct Amount
                        </span>
                      </label>
                      <label className="flex items-center">
                        <input
                          type="radio"
                          className="form-radio h-4 w-4 text-indigo-600"
                          checked={
                            component.calculation_method === 'percentage'
                          }
                          onChange={() =>
                            updateComponent('deduction', index, {
                              calculation_method: 'percentage',
                            })
                          }
                        />
                        <span className="ml-2 text-sm text-gray-700">
                          Percentage Based
                        </span>
                      </label>
                    </div>

                    {/* Amount Input or Percentage Configuration */}
                    {component.calculation_method !== 'percentage' ? (
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <span className="text-gray-500 sm:text-sm">₹</span>
                        </div>
                        <input
                          type="number"
                          placeholder="Amount"
                          className="block w-full pl-7 border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                          value={component.amount}
                          onChange={(e) =>
                            updateComponent('deduction', index, {
                              amount: parseFloat(e.target.value),
                            })
                          }
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
                            value={(component.reference_components || [])
                              .map((ref) => {
                                const matchedComponent = formData.earnings
                                  .concat(formData.deductions)
                                  .find((c) => c.name === ref);
                                return matchedComponent
                                  ? matchedComponent.name
                                  : undefined;
                              })
                              .filter(
                                (name): name is string => name !== undefined
                              )}
                            onChange={(e) => {
                              const selectedOptions = Array.from(
                                e.target.selectedOptions
                              ).map((opt) => opt.value);
                              updateComponent(component.component_type, index, {
                                reference_components: selectedOptions,
                              }); // ✅ Store only 'id'
                            }}
                            size={4}
                            aria-label="Reference Salary Components"
                          >
                            {formData.earnings
                              .concat(formData.deductions) // ✅ Ensure all previous components are selectable
                              .filter((comp) => {
                                const allComponents = [
                                  ...formData.earnings,
                                  ...formData.deductions,
                                ];
                                const currentIndex = allComponents.findIndex(
                                  (c) => c.name === component.name
                                );
                                return (
                                  allComponents.findIndex(
                                    (c) => c.name === comp.name
                                  ) < currentIndex
                                );
                              })
                              .map((comp) => (
                                <option key={comp.key} value={comp.name}>
                                  {comp.name}{' '}
                                  {comp.amount
                                    ? `($${comp.amount.toFixed(2)})`
                                    : ''}
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
                            value={component.percentage_value || ''}
                            onChange={(e) =>
                              updateComponent('deduction', index, {
                                ...component,
                                percentage_value: parseFloat(e.target.value),
                              })
                            }
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
                    {component.calculation_method === 'percentage' && (
                      <div className="text-sm text-gray-500">
                        Calculated Amount: ₹{component.amount || '0'}
                      </div>
                    )}

                    {/* Remove Button */}
                    {formData.deductions.length > 1 && (
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => removeComponent('deduction', index)}
                          className="inline-flex items-center px-2 py-1 border border-transparent rounded-md text-sm font-medium text-red-600 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div className="border-t pt-4">
                <div className="flex justify-between text-lg">
                  <span>Total Earnings:</span>
                  <span>₹{calculateTotal('earning').toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-lg">
                  <span>Total Deductions:</span>
                  <span>₹{calculateTotal('deduction').toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-lg font-bold">
                  <span>Net Salary:</span>
                  <span>
                    ₹
                    {(
                      calculateTotal('earning') - calculateTotal('deduction')
                    ).toFixed(2)}
                  </span>
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-indigo-600 text-white p-2 rounded-md"
              >
                {loading ? 'Creating...' : 'Create Structure'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
