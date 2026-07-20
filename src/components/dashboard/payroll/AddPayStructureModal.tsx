import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Plus, Trash2, Percent, DollarSign, Lock, Code } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import {
  useSalaryStructuresStore,
  type SalaryStructureHeader,
  type SalaryStructure,
  type SalaryStructureComponent,
  type ComponentType,
} from '../../../stores/salaryStructuresStore';
import { useSettingsStore } from '../../../stores/settingsStore';
import { supabase } from '../../../lib/supabase';
import { getTenantId } from '../../../lib/tenantDb';
import FormulaBuilderPage from '../formula-builder/FormulaBuilderPage';

interface AddSalaryStructureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStructureCreated: () => void;
  selectedStructure?: SalaryStructureHeader | null; // ✅ Accept selected structure
}

export default function AddPayStructureModal({
  isOpen,
  onClose,
  onStructureCreated,
  selectedStructure,
}: AddSalaryStructureModalProps) {
  const { user } = useAuth();
  const {
    salaryComponentTypes,
    deductionComponentTypes,
    componentTypesLoading,
    fetchSalaryComponentTypes,
    fetchDeductionComponentTypes,
    fetchSalaryStructureDetails,
    createSalaryStructure,
    updateSalaryStructure,
  } = useSalaryStructuresStore();
  const {
    companyStatutorySettings,
    fetchCompanyStatutorySettings,
    statutoryConfigurations,
    fetchStatutoryConfigurations,
  } = useSettingsStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const componentRefs = useRef<
    Record<string, HTMLInputElement | HTMLSelectElement | null>
  >({});
  const [lastKeyNumber, setLastKeyNumber] = useState(0);
  const [validationError, setValidationError] = useState<string | null>(null);
  // Track which statutory buttons are disabled
  const [disabledStatutoryButtons, setDisabledStatutoryButtons] = useState<Set<string>>(new Set());
  // Track available statutory deductions
  const [availableStatutoryDeductions, setAvailableStatutoryDeductions] =
    useState<SalaryStructureComponent[]>([]);

  // NEW: Expression Builder Modal State
  const [showExpressionBuilder, setShowExpressionBuilder] = useState(false);
  const [expressionContext, setExpressionContext] = useState<{
    type: 'earning' | 'deduction';
    index: number;
    currentExpression?: string;
    currentAst?: any;
  } | null>(null);

  // Helper to get statutory deductions from settings
  const getStatutoryDeductions = async (): Promise<
    SalaryStructureComponent[]
  > => {
    if (!companyStatutorySettings || !statutoryConfigurations) return [];

    const tenantId = await getTenantId();
    const components: SalaryStructureComponent[] = [];

    // Map of statutory elements
    const statutoryMap = {
      provident_fund: 'Provident Fund (PF)',
      employee_state_insurance: 'Employee State Insurance (ESI)',
      professional_tax: 'Professional Tax',
      tax_deducted_at_source: 'Tax Deducted At Source (TDS)',
    };

    // UPDATED: Check each statutory element and load ALL applicable ones
    for (const [key, displayName] of Object.entries(statutoryMap)) {
      if (
        companyStatutorySettings[key as keyof typeof companyStatutorySettings]
      ) {
        // For PF and ESI, we need to fetch BOTH employee and employer components
        const isPFOrESI = key === 'provident_fund' || key === 'employee_state_insurance';

        if (isPFOrESI) {
          // Fetch all configurations for this statutory element (employee + employer)
          const configs = statutoryConfigurations.filter(
            (c) => c.statutory_element === key && c.is_active
          );

          for (const config of configs) {
            // Get component ID using payroll_component_id from the configuration
            const { data: payrollComponent } = await supabase
              .from('payroll_components')
              .select('id, name')
              .eq('tenant_id', tenantId)
              .eq('id', config.payroll_component_id)
              .eq('component_type', 'deduction')
              .maybeSingle();

            if (payrollComponent) {
              // Use the name from the database
              const componentName = payrollComponent.name;

              // Set editability based on application_type
              const editability =
                config.application_type === 'same_to_all' ? 'fixed' : 'enter_later';

              let amount: number | undefined;
              let percentage_value: number | undefined;

              if (config.application_type === 'same_to_all') {
                amount =
                  config.calculation_method === 'value'
                    ? config.global_value
                    : undefined;
                percentage_value =
                  config.calculation_method === 'percentage'
                    ? config.global_value
                    : undefined;
              } else {
                amount = config.calculation_method === 'value' ? 0 : undefined;
                percentage_value =
                  config.calculation_method === 'percentage' ? 0 : undefined;
              }

              components.push({
                key: `SD${components.length + 1}`,
                id: payrollComponent.id,
                name: componentName,
                component_type: 'deduction',
                isCustom: false,
                isStatutory: true,
                amount_type:
                  config.calculation_method === 'percentage'
                    ? 'percentage'
                    : 'value',
                editability: editability,
                amount: amount,
                percentage_value: percentage_value,
                reference_components: [],
                is_taxable: false,
                description: `Statutory ${componentName}`,
                display_order: components.length,
                is_applied_in_calculation: true,
              });
            }
          }
        } else {
          // For Professional Tax and TDS, use the old logic (single component)
          const config = statutoryConfigurations.find(
            (c) => c.statutory_element === key && c.is_active
          );

          if (config) {
            const { data: payrollComponent } = await supabase
              .from('payroll_components')
              .select('id, name')
              .eq('tenant_id', tenantId)
              .eq('statutory_component_id', config.id)
              .eq('component_type', 'deduction')
              .maybeSingle();

            const componentName = payrollComponent?.name || displayName;

            const editability =
              config.application_type === 'same_to_all' ? 'fixed' : 'enter_later';

            let amount: number | undefined;
            let percentage_value: number | undefined;

            if (config.application_type === 'same_to_all') {
              amount =
                config.calculation_method === 'value'
                  ? config.global_value
                  : undefined;
              percentage_value =
                config.calculation_method === 'percentage'
                  ? config.global_value
                  : undefined;
            } else {
              amount = config.calculation_method === 'value' ? 0 : undefined;
              percentage_value =
                config.calculation_method === 'percentage' ? 0 : undefined;
            }

            components.push({
              key: `SD${components.length + 1}`,
              id: payrollComponent?.id || '',
              name: componentName,
              component_type: 'deduction',
              isCustom: false,
              isStatutory: true,
              amount_type:
                config.calculation_method === 'percentage'
                  ? 'percentage'
                  : 'value',
              editability: editability,
              amount: amount,
              percentage_value: percentage_value,
              reference_components: [],
              is_taxable: false,
              description: `Statutory ${componentName}`,
              display_order: components.length,
              is_applied_in_calculation: true,
            });
          }
        }
      }
    }

    return components;
  };

  const [formData, setFormData] = useState<{
    name: string;
    description: string;
    is_active: boolean;
    earnings: SalaryStructureComponent[];
    deductions: SalaryStructureComponent[];
  }>({
    name: '',
    description: '',
    is_active: true,
    earnings: [],
    deductions: [],
  });

  useEffect(() => {
    if (isOpen) {
      fetchSalaryComponentTypes();
      fetchDeductionComponentTypes();
      fetchCompanyStatutorySettings();
      fetchStatutoryConfigurations();

      if (!selectedStructure) {
        setFormData({
          name: '',
          description: '',
          is_active: true,
          earnings: [],
          deductions: [],
        });
        setLastKeyNumber(0);
        setValidationError(null);
        setError(null);
        setDisabledStatutoryButtons(new Set()); // Clear disabled buttons
      }
    }
  }, [
    isOpen,
    selectedStructure,
    fetchSalaryComponentTypes,
    fetchDeductionComponentTypes,
    fetchCompanyStatutorySettings,
    fetchStatutoryConfigurations,
  ]);

  // Load available statutory deductions (don't auto-add them)
  useEffect(() => {
    const loadAvailableStatutoryDeductions = async () => {
      if (!isOpen) return;

      const statutoryDeductions = await getStatutoryDeductions();
      setAvailableStatutoryDeductions(statutoryDeductions);

      // Disable buttons for statutory deductions already in the form
      const existingStatutory = formData.deductions
        .filter((d) => d.isStatutory)
        .map((d) => d.name);
      setDisabledStatutoryButtons(new Set(existingStatutory));
    };

    loadAvailableStatutoryDeductions();
  }, [
    isOpen,
    companyStatutorySettings,
    statutoryConfigurations,
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
            const tenantId = await getTenantId();

            // UPDATED: Fetch statutory components to identify which components are statutory
            const { data: statutoryComponents } = await supabase
              .from('payroll_components')
              .select('id, name, statutory_component_id')
              .eq('tenant_id', tenantId)
              .eq('component_type', 'deduction')
              .not('statutory_component_id', 'is', null);

            const statutoryComponentIds = new Set(
              statutoryComponents?.map((c) => c.id) || []
            );

            let maxKeyNumber = 0;

            const updatedEarnings = fetchedStructureDetails[0].components
              .filter((c) => c.component_type === 'earning')
              .map((comp) => {
                return {
                  ...comp,
                  key: `E${++maxKeyNumber}`,
                  // UPDATED: Ensure amount_type and editability are set
                  amount_type:
                    comp.amount_type ||
                    (comp.calculation_method === 'percentage'
                      ? 'percentage'
                      : 'value'),
                  editability: comp.editability || 'fixed',
                  // FIX: Explicitly preserve expression fields when editing
                  expression: comp.expression || '',
                  expression_ast: comp.expression_ast || null,
                };
              });

            // UPDATED: Identify statutory deductions and set isStatutory flag
            const updatedDeductions = fetchedStructureDetails[0].components
              .filter((c) => c.component_type === 'deduction')
              .map((comp) => {
                // Check if this component is statutory
                const isStatutory = comp.id
                  ? statutoryComponentIds.has(comp.id)
                  : false;

                return {
                  ...comp,
                  key: isStatutory
                    ? `SD${++maxKeyNumber}`
                    : `D${++maxKeyNumber}`,
                  isStatutory: isStatutory,
                  // UPDATED: Ensure amount_type and editability are set
                  amount_type:
                    comp.amount_type ||
                    (comp.calculation_method === 'percentage'
                      ? 'percentage'
                      : 'value'),
                  editability: comp.editability || 'fixed',
                  is_applied_in_calculation: comp.is_applied_in_calculation ?? true,
                  // FIX: Explicitly preserve expression fields when editing
                  expression: comp.expression || '',
                  expression_ast: comp.expression_ast || null,
                };
              });

            setLastKeyNumber(maxKeyNumber); // ✅ Ensure state maintains the last used number

            setFormData({
              name: fetchedStructureDetails[0].name,
              description: fetchedStructureDetails[0].description || '',
              is_active: fetchedStructureDetails[0].is_active,
              earnings: updatedEarnings,
              deductions: updatedDeductions,
            });

            // UPDATED: Update disabled buttons based on existing statutory deductions
            const existingStatutoryNames = updatedDeductions
              .filter((d) => d.isStatutory)
              .map((d) => d.name);
            setDisabledStatutoryButtons(new Set(existingStatutoryNames));
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

  // NEW: Function to add a statutory deduction
  const addStatutoryDeduction = (statutoryType: string) => {
    const isPFOrESI = statutoryType === 'provident_fund' || statutoryType === 'employee_state_insurance';

    if (isPFOrESI) {
      const relatedComponents = availableStatutoryDeductions.filter((d) => {
        const lowerName = d.name.toLowerCase();
        if (statutoryType === 'provident_fund') {
          return lowerName.includes('provident fund') || lowerName.includes('pf');
        } else {
          return lowerName.includes('employee state insurance') || lowerName.includes('esi');
        }
      });

      if (relatedComponents.length === 0) return;

      const newComponents: SalaryStructureComponent[] = [];
      let keyCounter = lastKeyNumber;

      for (const config of relatedComponents) {
        const newKey = `SD${keyCounter + 1}`;
        keyCounter += 1;

        newComponents.push({
          ...config,
          key: newKey,
          display_order: formData.earnings.length + formData.deductions.length + newComponents.length,
          is_applied_in_calculation: true,
        });
        // REMOVED: setDisabledStatutoryButtons...
      }

      setLastKeyNumber(keyCounter);
      // REMOVED: setDisabledStatutoryButtons...

      setFormData((prev) => ({
        ...prev,
        deductions: [...prev.deductions, ...newComponents],
      }));
    } else {
      // Professional Tax and TDS
      const statutoryConfig = availableStatutoryDeductions.find(
        (d) => d.name.toLowerCase().includes(statutoryType.replace(/_/g, ' '))
      );
      if (!statutoryConfig) return;

      // REMOVED: setDisabledStatutoryButtons...

      const newKey = `SD${lastKeyNumber + 1}`;
      setLastKeyNumber((prevKey) => prevKey + 1);

      const newStatutoryDeduction: SalaryStructureComponent = {
        ...statutoryConfig,
        key: newKey,
        display_order: formData.earnings.length + formData.deductions.length,
        is_applied_in_calculation: true,
      };

      setFormData((prev) => ({
        ...prev,
        deductions: [...prev.deductions, newStatutoryDeduction],
      }));
    }
  };

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
        // NEW: Default to value type with fixed editability
        amount_type: 'value' as 'value' | 'percentage',
        editability: 'fixed' as 'fixed' | 'editable' | 'enter_later',
        is_taxable: type === 'earning',
        reference_components: [],
        display_order: prev.earnings.length + prev.deductions.length,
        // REMOVED: is_attendance_linked and always_treat_as_full_day fields
        // NEW: Default is_locked value
        is_locked: false,
        is_applied_in_calculation: true,
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
    const componentToRemove =
      formData[type === 'earning' ? 'earnings' : 'deductions'][index];

    // If removing a statutory component, re-enable its button
    if (componentToRemove.isStatutory && type === 'deduction') {
      setDisabledStatutoryButtons((prev) => {
        const newSet = new Set(prev);
        newSet.delete(componentToRemove.name);
        return newSet;
      });
    }

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

  // NEW: Handle Expression Save from Formula Builder
  const handleExpressionSave = (expression: string, ast: any) => {
    if (!expressionContext) return;

    updateComponent(expressionContext.type, expressionContext.index, {
      expression: expression,
      expression_ast: ast,
    });

    setShowExpressionBuilder(false);
    setExpressionContext(null);
  };

  // NEW: Open Expression Builder
  const openExpressionBuilder = (
    type: 'earning' | 'deduction',
    index: number,
    currentExpression?: string,
    currentAst?: any
  ) => {
    setExpressionContext({
      type,
      index,
      currentExpression,
      currentAst,
    });
    setShowExpressionBuilder(true);
  };

  const calculateComponentAmount = useCallback(
    (
      component: SalaryStructureComponent,
      allComponents: SalaryStructureComponent[]
    ) => {
      // FIXED: Use amount_type instead of calculation_method
      if (component.amount_type !== 'percentage') {
        return component.amount || 0; // Correctly returning value-based amount
      }

      // FIXED: Calculate percentage-based components
      if (
        component.amount_type === 'percentage' &&
        component.percentage_value &&
        component.reference_components?.length
      ) {
        const baseAmount = component.reference_components.reduce(
          (total, ref) => {
            const refComponent = allComponents.find((c) => c.name === ref);
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
      setValidationError(null);

      // Validate that all statutory components are included
      const statutoryDeductions = await getStatutoryDeductions();
      const missingStatutory = statutoryDeductions.filter(
        (statutory) =>
          !formData.deductions.some((d) => d.name === statutory.name)
      );

      if (missingStatutory.length > 0) {
        const missingNames = missingStatutory.map((d) => d.name).join(', ');
        setValidationError(
          `Missing required statutory deductions: ${missingNames}`
        );
        setLoading(false);
        return;
      }

      const structureData = {
        id: selectedStructure?.id, // Only include id if editing
        ...formData,
        components: [...formData.earnings, ...formData.deductions],
      };

      if (selectedStructure) {
        if (structureData.id) {
          await updateSalaryStructure(structureData.id, structureData);
        } else {
          throw new Error('Structure ID is undefined');
        }
      } else {
        await createSalaryStructure(structureData);
      }

      onStructureCreated();
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

        <div className="inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-6xl sm:w-full sm:p-6 max-h-[90vh] overflow-y-auto">

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
              {selectedStructure ? 'Edit Salary Structure' : 'Create Salary Structure'}
            </h3>

            {error && <div className="mt-2 text-red-600">{error}</div>}
            {validationError && (
              <div className="mt-2 text-red-600 bg-red-50 border border-red-200 rounded p-3">
                {validationError}
              </div>
            )}

            {/* <form onSubmit={handleSubmit} className="mt-6 space-y-6"> */}
            <form onSubmit={handleSubmit} className="mt-6 flex flex-col">
              <input
                type="text"
                placeholder="Structure Name"
                required
                className="w-full border p-2"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
              <textarea
                placeholder="Description"
                className="w-full border p-2"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
              />

              {/* <div className="max-h-[50vh] overflow-y-auto"> */}
              {/* <div className="grid grid-cols-1 lg:grid-cols-2 gap-8"> */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-h-[60vh]">


                {/* LEFT SIDE */}
                {/* <div className="flex flex-col h-full"> */}
                <div className="flex flex-col max-h-[60vh]">


                  <h4 className="font-medium mb-4">Earnings</h4>
                  {/* <div className="flex-1 overflow-y-auto pr-2"> */}
                  <div className="overflow-y-auto pr-2 max-h-[50vh]">


                    {formData.earnings.map((component, index) => (
                      <div
                        key={component.key}
                        className="mb-4 p-4 border rounded-lg bg-gray-50"
                      >
                        <div className="grid grid-cols-1 gap-4">
                          {/* Component Name Selection - CUSTOM OPTION REMOVED */}
                          <div className="flex gap-2">
                            <select
                              className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                              value={JSON.stringify({
                                id: component.id,
                                name: component.name,
                              })}
                              onChange={(e) => {
                                if (!e.target.value) return;
                                const { id, name } = JSON.parse(e.target.value);

                                // Get component details to apply configuration rules
                                const selectedComponent = salaryComponentTypes.find(c => c.id === id);

                                // Apply configuration based on component attributes
                                const updates: Partial<SalaryStructureComponent> = {
                                  name,
                                  id,
                                };

                                if (selectedComponent?.amount_type) {
                                  updates.amount_type = selectedComponent.amount_type as 'value' | 'percentage';

                                  // Reset irrelevant fields based on type
                                  if (selectedComponent.amount_type === 'value') {
                                    updates.percentage_value = undefined;
                                    updates.reference_components = [];
                                  } else {
                                    updates.amount = undefined;
                                  }
                                }

                                // Rule B: Individual components - Set Enter Later as default
                                if (selectedComponent?.type_selection === 'individual') {
                                  updates.editability = 'enter_later';
                                  updates.amount = undefined; // Clear amount for individual components
                                }

                                updateComponent('earning', index, updates);
                              }}
                              aria-label="Salary Component Type"
                              ref={(el) =>
                                (componentRefs.current[component.key] = el)
                              }
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
                          </div>

                          {/* NEW: First Set - Amount Type */}
                          <div className="border-b pb-3 mb-3">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Amount Type
                            </label>
                            <div className="flex items-center gap-4">
                              {(() => {
                                // 1. Find the selected component details to check restriction
                                const selectedComponent = salaryComponentTypes.find(
                                  (c) => c.id === component.id
                                );
                                const restrictedType = selectedComponent?.amount_type;

                                return (
                                  <>
                                    {/* Option 1: Value (Fixed Amount) */}
                                    {/* Display if NO restriction exists OR restriction is explicitly 'value' */}
                                    {(!restrictedType || restrictedType === 'value') && (
                                      <label className="flex items-center">
                                        <input
                                          type="radio"
                                          className="form-radio h-4 w-4 text-indigo-600"
                                          checked={component.amount_type === 'value'}
                                          onChange={() =>
                                            updateComponent('earning', index, {
                                              amount_type: 'value',
                                              percentage_value: undefined,
                                              reference_components: [],
                                            })
                                          }
                                        />
                                        <span className="ml-2 text-sm text-gray-700">
                                          Value (Fixed Amount)
                                        </span>
                                      </label>
                                    )}

                                    {/* Option 2: Percentage */}
                                    {/* Display if NO restriction exists OR restriction is explicitly 'percentage' */}
                                    {(!restrictedType || restrictedType === 'percentage') && (
                                      <label className="flex items-center">
                                        <input
                                          type="radio"
                                          className="form-radio h-4 w-4 text-indigo-600"
                                          checked={component.amount_type === 'percentage'}
                                          onChange={() =>
                                            updateComponent('earning', index, {
                                              amount_type: 'percentage',
                                              amount: undefined,
                                            })
                                          }
                                        />
                                        <span className="ml-2 text-sm text-gray-700">
                                          Percentage (% of other components)
                                        </span>
                                      </label>
                                    )}

                                    {/* Option 3: Expression - NEW */}
                                    {/* Display only if restriction is 'expression' */}
                                    {restrictedType === 'expression' && (
                                      <label className="flex items-center">
                                        <input
                                          type="radio"
                                          className="form-radio h-4 w-4 text-indigo-600"
                                          checked={true}
                                          disabled
                                        />
                                        <span className="ml-2 text-sm text-gray-700">
                                          Expression (Formula-based)
                                        </span>
                                      </label>
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                          </div>
 
                          {/* Amount Input or Percentage Configuration with Conditional Display */}
                          {/* MODIFIED: Hide amount/percentage inputs for Expression-type components */}
                          {(() => {
                            // Check if component is Expression type
                            const selectedComponent = salaryComponentTypes.find(
                              (c) => c.id === component.id
                            );
                            // CHANGED: Use calculation_type instead of amount_type to determine expression visibility
                            const isExpressionType = selectedComponent?.calculation_type === 'expression';

                            // // Hide amount/percentage inputs for Expression types
                            // if (isExpressionType) return null;

                            // Render amount/percentage inputs for non-Expression types
                            return component.amount_type !== 'percentage' ? (
                              <>
                                {(() => {
                                  // Get selected component details
                                  const selectedComponent = salaryComponentTypes.find(c => c.id === component.id);
                                  const isIndividual = selectedComponent?.type_selection === 'individual';
                                  const valueSet = selectedComponent?.value_set;

                                  // Rule B: HIDE amount field for Individual components
                                  if (isIndividual) {
                                    return (
                                      <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                                        <p className="text-sm text-blue-800">
                                          <strong>Individual Component:</strong> Amount entry is disabled.
                                          Values will be set per employee.
                                        </p>
                                      </div>
                                    );
                                  }

                                  // NEW RULE: Show amount field ONLY for at_structure components
                                  if (valueSet === 'at_structure') {
                                    return (
                                      <div>
                                        <div className="flex items-center gap-3">
                                          <div className="relative flex-1">
                                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                              <span className="text-gray-500 sm:text-sm">₹</span>
                                            </div>
                                            <input
                                              type="number"
                                              placeholder="Amount"
                                              className="block w-full pl-7 border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                              value={component.amount || ''}
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
                                          {/* Is Locked checkbox for at_structure components */}
                                          <label className="flex items-center whitespace-nowrap">
                                            <input
                                              type="checkbox"
                                              className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                                              checked={component.is_locked === true}
                                              onChange={(e) =>
                                                updateComponent('earning', index, {
                                                  is_locked: e.target.checked,
                                                })
                                              }
                                            />
                                            <Lock className="ml-2 h-4 w-4 text-gray-500" />
                                            <span className="ml-1 text-sm text-gray-700">
                                              Is Locked
                                            </span>
                                          </label>
                                        </div>
                                        {component.is_locked && (
                                          <p className="mt-1 text-xs text-gray-500">
                                            This value is locked and cannot be changed during payroll processing.
                                          </p>
                                        )}
                                      </div>
                                    );
                                  }

                                  // For all other value_set types, hide the amount input
                                  return null;
                                })()}
                              </>
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
                                {/* NEW: Show percentage input ONLY for at_structure components */}
                                {(() => {
                                  const selectedComponent = salaryComponentTypes.find(c => c.id === component.id);
                                  const valueSet = selectedComponent?.value_set;

                                  if (valueSet === 'at_structure') {
                                    return (
                                      <div>
                                        <div className="flex items-center gap-3">
                                          <div className="relative flex-1">
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
                                          {/* Is Locked checkbox for at_structure components with percentage */}
                                          <label className="flex items-center whitespace-nowrap">
                                            <input
                                              type="checkbox"
                                              className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                                              checked={component.is_locked === true}
                                              onChange={(e) =>
                                                updateComponent('earning', index, {
                                                  is_locked: e.target.checked,
                                                })
                                              }
                                            />
                                            <Lock className="ml-2 h-4 w-4 text-gray-500" />
                                            <span className="ml-1 text-sm text-gray-700">
                                              Is Locked
                                            </span>
                                          </label>
                                        </div>
                                        {component.is_locked && (
                                          <p className="mt-1 text-xs text-gray-500">
                                            This value is locked and cannot be changed during payroll processing.
                                          </p>
                                        )}
                                      </div>
                                    );
                                  }

                                  // For other value_set types, hide the percentage input
                                  return null;
                                })()}
                              </div>
                            );
                          })()}


                          {/* NEW: Expression Builder UI - Only for Expression-type components */}
                          {(() => {
                            const selectedComponent = salaryComponentTypes.find(
                              (c) => c.id === component.id
                            );
                            // CHANGED: Use calculation_type instead of amount_type to determine expression visibility
                            const isExpressionType = selectedComponent?.calculation_type === 'expression';

                            if (!isExpressionType) return null;

                            return (
                              <div className="border border-blue-200 rounded-md p-4 bg-blue-50">
                                <div className="flex items-start gap-3">
                                  <div className="flex-1">
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                      Expression Output
                                    </label>
                                    <textarea
                                      value={component.expression || ''}
                                      readOnly
                                      placeholder="No expression defined. Click 'fx' to create one."
                                      className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white h-20 resize-none"
                                    />
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      openExpressionBuilder(
                                        'earning',
                                        index,
                                        component.expression,
                                        component.expression_ast
                                      )
                                    }
                                    className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-lg font-bold rounded-md text-white bg-blue-600 hover:bg-blue-700 mt-7"
                                    title="Build Expression"
                                  >
                                    fx
                                  </button>
                                </div>
                                <p className="text-xs text-gray-500 mt-2">
                                  Create a formula expression to calculate this component value
                                </p>
                              </div>
                            );
                          })()}


                          {/* NEW: Attendance Linking Checkbox */}
                          {(() => {
                            const selectedComponent = salaryComponentTypes.find(c => c.id === component.id);
                            const isPercentage = component.amount_type === 'percentage';
                            const hasReferences = component.reference_components && component.reference_components.length > 0;

                            if (isPercentage || hasReferences) return null;

                            return (
                              <div className="flex items-center mt-2 border-t pt-3">
                                <label className="flex items-center cursor-pointer">
                                  <input
                                    type="checkbox"
                                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                                    checked={component.is_attendance_linked !== false}
                                    onChange={(e) =>
                                      updateComponent('earning', index, {
                                        is_attendance_linked: e.target.checked,
                                      })
                                    }
                                  />
                                  <span className="ml-2 text-sm text-gray-700 font-medium">
                                    Attendance Linked
                                  </span>
                                </label>
                              </div>
                            );
                          })()}

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
                  </div>

                  <button
                    type="button"
                    onClick={() => addComponent('earning')}
                    className="text-indigo-600 border rounded p-1 border-indigo-600"
                  >
                    <Plus className="h-4 w-4 inline" /> Add Earning
                  </button>
                </div>

                {/* RIGHT SIDE */}
                {/* <div className="flex flex-col h-full"> */}
                <div className="flex flex-col max-h-[60vh]">

                  <h4 className="font-medium">Deductions</h4>
                  {/* <div className="flex-1 overflow-y-auto pr-2"> */}
                  <div className="overflow-y-auto pr-2 max-h-[50vh]">





                    {/* NEW: Individual statutory element buttons */}
                    {availableStatutoryDeductions.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="text-sm text-gray-600 mr-2">
                          Add Statutory:
                        </span>
                        {(() => {
                          const statutoryTypes = [
                            {
                              key: 'provident_fund',
                              label: 'Provident Fund (PF)',
                              keywords: ['provident fund', 'pf'],
                            },
                            {
                              key: 'employee_state_insurance',
                              label: 'Employee State Insurance (ESI)',
                              keywords: ['employee state insurance', 'esi'],
                            },
                            {
                              key: 'professional_tax',
                              label: 'Professional Tax',
                              keywords: ['professional tax'],
                            },
                            {
                              key: 'tax_deducted_at_source',
                              label: 'Tax Deducted At Source (TDS)',
                              keywords: ['tax deducted at source', 'tds'],
                            },
                          ];

                          return statutoryTypes.map((type) => {
                            // 1. Check if components exist in settings (Availability)
                            const hasComponents = availableStatutoryDeductions.some((d) => {
                              const lowerName = d.name.toLowerCase();
                              return type.keywords.some((keyword) => lowerName.includes(keyword));
                            });

                            if (!hasComponents) return null;

                            // 2. THE FIX: Check if already added to formData (Disable Logic)
                            const isAlreadyAdded = formData.deductions.some((d) => {
                              const lowerName = d.name.toLowerCase();
                              return type.keywords.some((keyword) => lowerName.includes(keyword));
                            });

                            return (
                              <button
                                key={type.key}
                                type="button"
                                onClick={() => addStatutoryDeduction(type.key)}
                                disabled={isAlreadyAdded} // Use the derived boolean
                                className={`inline-flex items-center px-3 py-1 border rounded-md text-sm font-medium ${isAlreadyAdded
                                  ? 'border-gray-200 text-gray-400 bg-gray-100 cursor-not-allowed'
                                  : 'border-indigo-300 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500'
                                  }`}
                              >
                                <Plus className="h-3 w-3 mr-1" />
                                {type.label}
                              </button>
                            );
                          });
                        })()}
                      </div>
                    )}

                    {formData.deductions.map((component, index) => (
                      <div
                        key={component.key}
                        className={`mb-4 p-4 border rounded-lg ${component.isStatutory
                          ? 'bg-indigo-50 border-indigo-200'
                          : 'bg-gray-50'
                          }`}
                      >

                        {component.isStatutory && (
                          <div className="mb-3 flex items-center justify-between">

                            {/* Left Side - Lock Text */}
                            <div className="flex items-center text-indigo-700 text-sm font-medium">
                              <Lock className="h-4 w-4 mr-1" />
                              Statutory Deduction (Locked)
                            </div>

                            {/* Right Side - Checkbox */}
                            <label className="flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                                checked={component.is_applied_in_calculation !== false}
                                onChange={(e) =>
                                  updateComponent('deduction', index, {
                                    is_applied_in_calculation: e.target.checked,
                                  })
                                }
                              />
                              <span className="ml-2 text-sm text-gray-700">
                                Including in Pay Total
                              </span>
                            </label>

                          </div>
                        )}

                        <div className="grid grid-cols-1 gap-4">
                          {/* Component Name Selection */}
                          <div className="flex gap-2">
                            {component.isStatutory ? (
                              <input
                                type="text"
                                className="flex-1 border border-gray-300 rounded-md shadow-sm py-2 px-3 bg-gray-100 text-gray-600 cursor-not-allowed sm:text-sm"
                                value={component.name}
                                disabled
                                readOnly
                              />
                            ) : (
                              <select
                                className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                value={JSON.stringify({
                                  id: component.id,
                                  name: component.name,
                                })}
                                onChange={(e) => {
                                  if (!e.target.value) return;
                                  const { id, name } = JSON.parse(e.target.value);

                                  // Get component details to apply configuration rules
                                  const selectedComponent = deductionComponentTypes.find(c => c.id === id);

                                  // Apply configuration based on component attributes
                                  const updates: Partial<SalaryStructureComponent> = {
                                    name,
                                    id,
                                  };

                                  // Rule B: Individual components - Set Enter Later as default
                                  if (selectedComponent?.type_selection === 'individual') {
                                    updates.editability = 'enter_later';
                                    updates.amount = undefined; // Clear amount for individual components
                                  }

                                  updateComponent('deduction', index, updates);
                                }}
                                aria-label="Deduction Component Type"
                                ref={(el) =>
                                  (componentRefs.current[component.key] = el)
                                }
                                required
                              >
                                <option value="">Select Deduction</option>
                                {deductionComponentTypes
                                  .filter((type) => !type.statutory_component_id)
                                  .map((type) => (
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

                          {/* NEW: First Set - Amount Type */}
                          <div className="border-b pb-3 mb-3">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Amount Type
                            </label>
                            <div className="flex items-center gap-4">
                              {(() => {
                                // 1. Find the selected deduction component details
                                const selectedComponent = deductionComponentTypes.find(
                                  (c) => c.id === component.id
                                );
                                const restrictedType = selectedComponent?.amount_type;

                                return (
                                  <>
                                    {/* Option 1: Value (Fixed Amount) */}
                                    {/* Display if NO restriction exists OR restriction is explicitly 'value' */}
                                    {(!restrictedType || restrictedType === 'value') && (
                                      <label className="flex items-center">
                                        <input
                                          type="radio"
                                          className="form-radio h-4 w-4 text-indigo-600"
                                          checked={component.amount_type === 'value'}
                                          onChange={() =>
                                            updateComponent('deduction', index, {
                                              amount_type: 'value',
                                              percentage_value: undefined,
                                              reference_components: [],
                                            })
                                          }
                                          disabled={component.isStatutory}
                                        />
                                        <span
                                          className={`ml-2 text-sm ${component.isStatutory
                                            ? 'text-gray-500'
                                            : 'text-gray-700'
                                            }`}
                                        >
                                          Value (Fixed Amount)
                                        </span>
                                      </label>
                                    )}

                                    {/* Option 2: Percentage */}
                                    {/* MODIFIED: Show percentage radio control for statutory deductions (remove disabled state) */}
                                    {/* Display if NO restriction exists OR restriction is explicitly 'percentage' */}
                                    {(!restrictedType || restrictedType === 'percentage') && (
                                      <label className="flex items-center">
                                        <input
                                          type="radio"
                                          className="form-radio h-4 w-4 text-indigo-600"
                                          checked={component.amount_type === 'percentage'}
                                          onChange={() =>
                                            updateComponent('deduction', index, {
                                              amount_type: 'percentage',
                                              amount: undefined,
                                            })
                                          }
                                        // REMOVED: disabled={component.isStatutory} - Now functional for statutory deductions
                                        />
                                        <span className="ml-2 text-sm text-gray-700">
                                          Percentage (% of other components)
                                        </span>
                                      </label>
                                    )}

                                    {/* Option 3: Expression - NEW */}
                                    {/* Display only if restriction is 'expression' */}
                                    {restrictedType === 'expression' && (
                                      <label className="flex items-center">
                                        <input
                                          type="radio"
                                          className="form-radio h-4 w-4 text-indigo-600"
                                          checked={true}
                                          disabled
                                        />
                                        <span className="ml-2 text-sm text-gray-700">
                                          Expression (Formula-based)
                                        </span>
                                      </label>
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                          </div>

                          {/* NEW: Expression Builder UI - Only for Expression-type components */}
                          {(() => {
                            const selectedComponent = deductionComponentTypes.find(
                              (c) => c.id === component.id
                            );
                            // CHANGED: Use calculation_type instead of amount_type to determine expression visibility
                            const isExpressionType = selectedComponent?.calculation_type === 'expression';

                            if (!isExpressionType) return null;

                            return (
                              <div className="border border-blue-200 rounded-md p-4 bg-blue-50">
                                <div className="flex items-start gap-3">
                                  <div className="flex-1">
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                      Expression Output
                                    </label>
                                    <textarea
                                      value={component.expression || ''}
                                      readOnly
                                      placeholder="No expression defined. Click 'fx' to create one."
                                      className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white h-20 resize-none"
                                    />
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      openExpressionBuilder(
                                        'deduction',
                                        index,
                                        component.expression,
                                        component.expression_ast
                                      )
                                    }
                                    className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-lg font-bold rounded-md text-white bg-blue-600 hover:bg-blue-700 mt-7"
                                    title="Build Expression"
                                  >
                                    fx
                                  </button>
                                </div>
                                <p className="text-xs text-gray-500 mt-2">
                                  Create a formula expression to calculate this component value
                                </p>
                              </div>
                            );
                          })()}

                          {/* Amount Input or Percentage Configuration with Conditional Display */}
                          {/* MODIFIED: Hide amount/percentage inputs for Expression-type components */}
                          {(() => {
                            // Check if component is Expression type
                            const selectedComponent = deductionComponentTypes.find(
                              (c) => c.id === component.id
                            );
                            // CHANGED: Use calculation_type instead of amount_type to determine expression visibility
                            const isExpressionType = selectedComponent?.calculation_type === 'expression';

                            // // Hide amount/percentage inputs for Expression types
                            // if (isExpressionType) return null;

                            // Render amount/percentage inputs for non-Expression types
                            return component.amount_type !== 'percentage' ? (
                              <>
                                {(() => {
                                  // Get selected component details
                                  const selectedComponent = deductionComponentTypes.find(c => c.id === component.id);
                                  const isIndividual = selectedComponent?.type_selection === 'individual';
                                  const valueSet = selectedComponent?.value_set;

                                  // Rule B: HIDE amount field for Individual components
                                  if (isIndividual) {
                                    return (
                                      <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                                        <p className="text-sm text-blue-800">
                                          <strong>Individual Component:</strong> Amount entry is disabled.
                                          Values will be set per employee.
                                        </p>
                                      </div>
                                    );
                                  }

                                  // NEW RULE: Show amount field ONLY for at_structure components
                                  if (valueSet === 'at_structure') {
                                    return (
                                      <div>
                                        <div className="flex items-center gap-3">
                                          <div className="relative flex-1">
                                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                              <span className="text-gray-500 sm:text-sm">₹</span>
                                            </div>
                                            <input
                                              type="number"
                                              placeholder="Amount"
                                              className={`block w-full pl-7 border border-gray-300 rounded-md shadow-sm py-2 px-3 sm:text-sm ${component.isStatutory &&
                                                component.editability !== 'editable'
                                                ? 'bg-gray-100 text-gray-600 cursor-not-allowed'
                                                : 'focus:outline-none focus:ring-indigo-500 focus:border-indigo-500'
                                                }`}
                                              value={component.amount || ''}
                                              onChange={(e) =>
                                                updateComponent('deduction', index, {
                                                  amount: parseFloat(e.target.value),
                                                })
                                              }
                                              required
                                              min="0"
                                              step="0.01"
                                              disabled={
                                                component.isStatutory &&
                                                component.editability !== 'editable'
                                              }
                                              readOnly={
                                                component.isStatutory &&
                                                component.editability !== 'editable'
                                              }
                                            />
                                          </div>
                                          {/* Is Locked checkbox for at_structure components */}
                                          <label className="flex items-center whitespace-nowrap">
                                            <input
                                              type="checkbox"
                                              className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                                              checked={component.is_locked === true}
                                              onChange={(e) =>
                                                updateComponent('deduction', index, {
                                                  is_locked: e.target.checked,
                                                })
                                              }
                                            />
                                            <Lock className="ml-2 h-4 w-4 text-gray-500" />
                                            <span className="ml-1 text-sm text-gray-700">
                                              Is Locked
                                            </span>
                                          </label>
                                        </div>
                                        {component.is_locked && (
                                          <p className="mt-1 text-xs text-gray-500">
                                            This value is locked and cannot be changed during payroll processing.
                                          </p>
                                        )}
                                      </div>
                                    );
                                  }

                                  // For all other value_set types, hide the amount input
                                  return null;
                                })()}
                              </>
                            ) : (
                              <div className="grid grid-cols-2 gap-4">
                                {/* MODIFIED: Hide reference components list box for statutory deductions */}
                                {!component.isStatutory && (
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
                                )}

                                {/* NEW: Show percentage input ONLY for at_structure components */}
                                {/* MODIFIED: Adjust grid layout for statutory deductions (full width when no list box) */}
                                {(() => {
                                  const selectedComponent = deductionComponentTypes.find(c => c.id === component.id);
                                  const valueSet = selectedComponent?.value_set;

                                  if (valueSet === 'at_structure') {
                                    return (
                                      <div className={component.isStatutory ? 'col-span-2' : ''}>
                                        <div className="flex items-center gap-3">
                                          <div className="relative flex-1">
                                            <input
                                              type="number"
                                              placeholder="Percentage"
                                              className={`block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 pr-8 sm:text-sm ${component.isStatutory &&
                                                component.editability !== 'editable'
                                                ? 'bg-gray-100 text-gray-600 cursor-not-allowed'
                                                : 'focus:outline-none focus:ring-indigo-500 focus:border-indigo-500'
                                                }`}
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
                                              disabled={
                                                component.isStatutory &&
                                                component.editability !== 'editable'
                                              }
                                              readOnly={
                                                component.isStatutory &&
                                                component.editability !== 'editable'
                                              }
                                            />
                                            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                                              <span className="text-gray-500 sm:text-sm">%</span>
                                            </div>
                                          </div>
                                          {/* Is Locked checkbox for at_structure components with percentage */}
                                          <label className="flex items-center whitespace-nowrap">
                                            <input
                                              type="checkbox"
                                              className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                                              checked={component.is_locked === true}
                                              onChange={(e) =>
                                                updateComponent('deduction', index, {
                                                  is_locked: e.target.checked,
                                                })
                                              }
                                            />
                                            <Lock className="ml-2 h-4 w-4 text-gray-500" />
                                            <span className="ml-1 text-sm text-gray-700">
                                              Is Locked
                                            </span>
                                          </label>
                                        </div>
                                        {component.is_locked && (
                                          <p className="mt-1 text-xs text-gray-500">
                                            This value is locked and cannot be changed during payroll processing.
                                          </p>
                                        )}
                                      </div>
                                    );
                                  }

                                  // For other value_set types, hide the percentage input
                                  return null;
                                })()}
                              </div>
                            );
                          })()}

                          {/* NEW: Attendance Linking Checkbox */}
                          {/* {(() => {
                            const isPercentage = component.amount_type === 'percentage';
                            const hasReferences = component.reference_components && component.reference_components.length > 0;
                            
                            if (isPercentage || hasReferences) return null;

                            return (
                              <div className="flex items-center mt-2 border-t pt-3">
                                <label className="flex items-center cursor-pointer">
                                  <input
                                    type="checkbox"
                                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                                    checked={component.is_attendance_linked !== false}
                                    onChange={(e) =>
                                      updateComponent('deduction', index, {
                                        is_attendance_linked: e.target.checked,
                                      })
                                    }
                                  />
                                  <span className="ml-2 text-sm text-gray-700 font-medium">
                                    Attendance Linked
                                  </span>
                                </label>
                              </div>
                            );
                          })()} */}

                          {/* Calculated Amount Display for Percentage */}
                          {component.calculation_method === 'percentage' && (
                            <div className="text-sm text-gray-500">
                              Calculated Amount: ₹{component.amount || '0'}
                            </div>
                          )}

                          {/* Remove Button - UPDATED: Allow removing statutory deductions */}
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

                  </div>
                  {/* EXISTING: Add Deduction button - functionality unchanged */}
                  <button
                    type="button"
                    onClick={() => addComponent('deduction')}
                    className="text-red-600 border-red-600 mr-2 border p-1 rounded"
                  >
                    <Plus className="h-4 w-4 inline" /> Add Deduction
                  </button>

                </div>

              </div>

              {/* </div> */}











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
                {loading
                  ? (selectedStructure ? 'Updating...' : 'Creating...')
                  : (selectedStructure ? 'Update Structure' : 'Create Structure')}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* NEW: Expression Builder Modal */}
      {showExpressionBuilder && expressionContext && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-lg w-full max-w-4xl max-h-[95vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                Build Expression for {' '}
                {expressionContext.type === 'earning' ? 'Earning' : 'Deduction'} Component
              </h3>
              <button
                onClick={() => {
                  setShowExpressionBuilder(false);
                  setExpressionContext(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <FormulaBuilderPage
                isModal={true}
                onSave={handleExpressionSave}
                onCancel={() => {
                  setShowExpressionBuilder(false);
                  setExpressionContext(null);
                }}
                initialExpression={expressionContext.currentExpression}
                initialAst={expressionContext.currentAst}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
