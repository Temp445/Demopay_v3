import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { Shield, Save, AlertCircle, Check, X } from 'lucide-react';
import { useSettingsStore, type StatutoryConfiguration, type EmployeeStatutoryValue } from '../../../stores/settingsStore';
import { useEmployeesStore } from '../../../stores/employeesStore';
import { supabase } from '../../../lib/supabase';
import { getTenantId } from '../../../lib/tenantDb';

type TabType = 'employee' | 'employer';

// Mapping for Statutory Element to DB Column and Label
const STATUTORY_ID_MAPPING: Record<string, { column: string; label: string }> = {
  provident_fund: { column: 'pf_number', label: 'PF ID' },
  employee_state_insurance: { column: 'esi_number', label: 'ESI ID' },
  professional_tax: { column: 'professional_tax_id', label: 'Professional Tax ID' },
  tax_deducted_at_source: { column: 'tds_id', label: 'TDS ID' },
};

// const STATUTORY_COMPONENT_NAME_MAP: Record<
//   string,
//   { employee?: string; employer?: string; single?: string }
// > = {
//   provident_fund: {
//     employee: 'Provident Fund (PF) - Employee',
//     employer: 'Provident Fund (PF) - Employer',
//   },
//   employee_state_insurance: {
//     employee: 'Employee State Insurance (ESI) - Employee',
//     employer: 'Employee State Insurance (ESI) - Employer',
//   },
//   professional_tax: {
//     single: 'Professional Tax',
//   },
//   tax_deducted_at_source: {
//     single: 'Tax Deducted At Source (TDS)',
//   },
// };

const STATUTORY_COMPONENT_NAME_MAP: Record<
  string,
  {
    employee?: string
    employer?: string
    eps?: string
    single?: string
  }
> = {
  provident_fund: {
    employee: 'Provident Fund (PF) - Employee',
    employer: 'Provident Fund (PF) - Employer',
    eps: 'Provident Fund (PF) - EPS'
  },
  employee_state_insurance: {
    employee: 'Employee State Insurance (ESI) - Employee',
    employer: 'Employee State Insurance (ESI) - Employer'
  },
  professional_tax: {
    single: 'Professional Tax'
  },
  tax_deducted_at_source: {
    single: 'Tax Deducted At Source (TDS)'
  }
}

interface EmployeeStatutoryIdRecord {
  id?: string;
  employee_id: string;
  tenant_id: string;
  pf_number?: string | null;
  esi_number?: string | null;
  tds_id?: string | null;
  professional_tax_id?: string | null;
  [key: string]: any;
}

interface PayrollComponent {
  id: string;
  name: string;
  description?: string;
  component_type: string;
  component_category?: string;
  is_active: boolean;
  rounding_type?: 'none' | 'round' | 'floor' | 'ceil' | 'decimal2';
}


export default function StatutorySettings() {
  const {
    companyStatutorySettings,
    fetchCompanyStatutorySettings,
    statutoryConfigurations,
    fetchStatutoryConfigurations,
    saveStatutoryConfiguration,
    fetchEmployeeStatutoryValues,
    saveEmployeeStatutoryValues,
    loading,
    error,
  } = useSettingsStore();

  const { items: employees, fetchEmployees } = useEmployeesStore();

  const [selectedElement, setSelectedElement] = useState<string>('');

  // Tab management for PF and ESI
  const [activeTab, setActiveTab] = useState<TabType>('employee');

  // Separate state for employee and employer configurations
  const [employeeConfig, setEmployeeConfig] = useState({
    calculationMethod: 'percentage' as 'percentage' | 'value',
    applicationType: 'same_to_all' as 'same_to_all' | 'vary_employeewise',
    globalValue: '',
    selectedComponentIds: [] as string[],
    percentageValue: '',
    employeeValues: new Map<string, string>(),
    selectedEmployees: new Set<string>(),
    selectAll: false,
    payrollComponentId: null as string | null,
    roundingType: 'none' as 'none' | 'round' | 'floor' | 'ceil' | 'decimal2',
  });

  const [employerConfig, setEmployerConfig] = useState({
    calculationMethod: 'percentage' as 'percentage' | 'value',
    applicationType: 'same_to_all' as 'same_to_all' | 'vary_employeewise',
    globalValue: '',
    selectedComponentIds: [] as string[],
    percentageValue: '',
    epsValue: '', // EPS (Employee Pension Scheme) value for PF employer contribution
    employeeValues: new Map<string, string>(),

    epsEmployeeValues: new Map<string, string>(),   //  ADD THIS

    selectedEmployees: new Set<string>(),
    selectAll: false,
    payrollComponentId: null as string | null,
    roundingType: 'none' as 'none' | 'round' | 'floor' | 'ceil' | 'decimal2',
  });

  // Statutory IDs (only for employee tab)
  const [fullStatutoryIdRecords, setFullStatutoryIdRecords] = useState<Record<string, EmployeeStatutoryIdRecord>>({});
  const [employeeStatutoryIds, setEmployeeStatutoryIds] = useState<Map<string, string>>(new Map());

  // Payroll components and UI state
  const [payrollComponents, setPayrollComponents] = useState<PayrollComponent[]>([]);
  const [showComponentDropdown, setShowComponentDropdown] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const dropdownRef = React.useRef<HTMLDivElement>(null);
  const isSavingRef = useRef(false);
  const [reloadTrigger, setReloadTrigger] = useState(0);

  // Helper function to get current config based on active tab
  const getCurrentConfig = () => activeTab === 'employee' ? employeeConfig : employerConfig;
  const setCurrentConfig = (updates: Partial<typeof employeeConfig>) => {
    if (activeTab === 'employee') {
      setEmployeeConfig(prev => ({ ...prev, ...updates }));
    } else {
      setEmployerConfig(prev => ({ ...prev, ...updates }));
    }
  };

  // Check if selected element requires tabs (PF or ESI)
  const requiresTabs = selectedElement === 'provident_fund' || selectedElement === 'employee_state_insurance';

  // Get list of applicable statutory elements
  const applicableElements = React.useMemo(() => {
    if (!companyStatutorySettings) return [];
    const elements: Array<{ value: string; label: string }> = [];
    if (companyStatutorySettings.provident_fund) elements.push({ value: 'provident_fund', label: 'Provident Fund (PF)' });
    if (companyStatutorySettings.employee_state_insurance) elements.push({ value: 'employee_state_insurance', label: 'Employee State Insurance (ESI)' });
    if (companyStatutorySettings.professional_tax) elements.push({ value: 'professional_tax', label: 'Professional Tax' });
    if (companyStatutorySettings.tax_deducted_at_source) elements.push({ value: 'tax_deducted_at_source', label: 'Tax Deducted At Source (TDS)' });
    return elements;
  }, [companyStatutorySettings]);

  // Fetch payroll components (excluding calculation category)
  const fetchPayrollComponents = async () => {
    try {
      const tenantId = await getTenantId();
      const { data, error } = await supabase
        .from('payroll_components')
        .select('id, name, description, component_type, component_category, is_active, rounding_type')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .neq('component_category', 'calculation')
        .order('name');

      if (error) throw error;

      setPayrollComponents(data || []);
    } catch (err) {
      console.error('Error fetching payroll components:', err);
    }
  };

//=====================================================================================
const findPayrollComponentId = (
  element: string,
  key: 'employee' | 'employer' | 'eps' | 'single' = 'single'
): string | null => {

  const config = STATUTORY_COMPONENT_NAME_MAP[element]

  if (!config) return null

  const expectedName = config[key] || config.single

  if (!expectedName) return null

  const component = payrollComponents.find(
    c =>
      c.is_active &&
      c.component_type === 'deduction' &&
      c.name === expectedName
  )

  return component?.id ?? null
}

//=====================================================================================




  // const getPayrollComponentId = async (element: string, tab: TabType): Promise<string> => {

  //   const config = STATUTORY_COMPONENT_NAME_MAP[element];

  //   if (!config) {
  //     throw new Error(`No payroll mapping found for statutory: ${element}`);
  //   }

  //   let expectedName: string | undefined;

  //   if (config.single) {
  //     expectedName = config.single;
  //   } else {
  //     expectedName = tab === 'employee' ? config.employee : config.employer;
  //   }

  //   if (!expectedName) {
  //     throw new Error(
  //       `Payroll component mapping missing for ${element} (${tab})`
  //     );
  //   }

  //   // 🔥 1. Try to find in already loaded components
  //   let component = payrollComponents.find(
  //     c =>
  //       c.is_active &&
  //       c.component_type === 'deduction' &&
  //       c.name === expectedName
  //   );

  //   // 🔥 2. If NOT found → create it
  //   if (!component) {

  //     const tenantId = await getTenantId();

  //     const { data: newComponent, error } = await supabase
  //       .from('payroll_components')
  //       .insert({
  //         tenant_id: tenantId,
  //         name: expectedName,
  //         component_type: 'deduction',
  //         is_active: true
  //       })
  //       .select()
  //       .single();

  //     if (error || !newComponent) {
  //       throw new Error(
  //         `Failed to create payroll component "${expectedName}"`
  //       );
  //     }

  //     component = newComponent;

  //     // 👉 Optional: update local state so next calls don't recreate
  //     setPayrollComponents(prev => [...prev, newComponent]);
  //   }

  //   return component.id;
  // };


  const getPayrollComponentId = async (
    element: string,
    key: 'employee' | 'employer' | 'eps' | 'single' = 'single'
  ): Promise<string> => {

    const config = STATUTORY_COMPONENT_NAME_MAP[element]

    if (!config) {
      throw new Error(`No payroll mapping found for ${element}`)
    }

    const expectedName = config[key] || config.single;

    if (!expectedName) {
      throw new Error(`Component mapping missing for ${element} (${key})`)
    }

    let component = payrollComponents.find(
      c =>
        c.is_active &&
        c.component_type === 'deduction' &&
        c.name === expectedName
    )

    if (!component) {

      const tenantId = await getTenantId()

      const { data: newComponent, error } = await supabase
        .from('payroll_components')
        .insert({
          tenant_id: tenantId,
          name: expectedName,
          component_type: 'deduction',
          is_active: true
        })
        .select()
        .single()

      if (error || !newComponent) {
        throw new Error(`Failed to create payroll component "${expectedName}"`)
      }

      component = newComponent
      setPayrollComponents(prev => [...prev, newComponent])
    }

    return component.id
  }

  // Load data on mount
  useEffect(() => {
    fetchCompanyStatutorySettings();
    fetchStatutoryConfigurations();
    fetchEmployees();
    fetchPayrollComponents();
  }, [fetchCompanyStatutorySettings, fetchStatutoryConfigurations, fetchEmployees]);

  // Fetch Employee Statutory IDs
  const fetchStatutoryIds = async () => {
    try {
      const tenantId = await getTenantId();
      const { data, error } = await supabase
        .from('employee_statutory_ids')
        .select('*')
        .eq('tenant_id', tenantId);

      if (error) throw error;

      if (data) {
        const recordsMap: Record<string, EmployeeStatutoryIdRecord> = {};
        data.forEach((record: EmployeeStatutoryIdRecord) => {
          recordsMap[record.employee_id] = record;
        });
        setFullStatutoryIdRecords(recordsMap);
      }
    } catch (err) {
      console.error('Error fetching statutory IDs:', err);
    }
  };

  // Load saved configuration
  useEffect(() => {
    if (isSavingRef.current) return;
    
    const loadSavedConfiguration = async () => {
      if (!selectedElement) return;
      await fetchStatutoryIds();

      try {
        if (requiresTabs) {
          // Load both employee and employer configurations for PF/ESI
          const employeeComponentId = await findPayrollComponentId(selectedElement, 'employee');
          const employerComponentId = await findPayrollComponentId(selectedElement, 'employer');

          // Load employee configuration
          const employeeConfigData = statutoryConfigurations.find(
            c => c.statutory_element === selectedElement && c.payroll_component_id === employeeComponentId
          );

          if (employeeConfigData) {
            const empValues = await loadConfigData(employeeConfigData, 'employee');
            setEmployeeConfig(prev => ({ ...prev, ...empValues, payrollComponentId: employeeComponentId }));
          }

          // Load employer configuration
          const employerConfigData = statutoryConfigurations.find(
            c => c.statutory_element === selectedElement && c.payroll_component_id === employerComponentId
          );

          //////////////////////

          // Find EPS configuration separately
          const epsComponent = payrollComponents.find(
            c =>
              c.is_active &&
              c.component_type === 'deduction' &&
              c.name === 'Provident Fund (PF) - EPS'
          );

          const epsConfigData = epsComponent
            ? statutoryConfigurations.find(
              c =>
                c.statutory_element === selectedElement &&
                c.payroll_component_id === epsComponent.id
            )
            : undefined;

          //////////////////////

          if (employerConfigData) {
            const empValues = await loadConfigData(employerConfigData, 'employer');

            // Load individual EPS vary_employeewise values if applicable
            const epsEmpValuesMap = new Map<string, string>();
            if (epsConfigData?.id && employerConfigData.application_type === 'vary_employeewise') {
              const epsVals = await fetchEmployeeStatutoryValues(epsConfigData.id);
              epsVals.forEach(ev => epsEmpValuesMap.set(ev.employee_id, ev.value.toString()));
            }

            setEmployerConfig(prev => ({
              ...prev, ...empValues,
              payrollComponentId: employerComponentId,
              // EPS value from separate config
              epsValue: epsConfigData?.global_value
                ? epsConfigData.global_value.toString()
                : '',
              epsEmployeeValues: epsEmpValuesMap, // Load mapped individual EPS values
            }));
          }
        } else {
          const payrollComponentId = await findPayrollComponentId(selectedElement, 'single');

          const existingConfig = statutoryConfigurations.find(
            c =>
              c.statutory_element === selectedElement &&
              c.payroll_component_id === payrollComponentId
          );

          if (existingConfig) {
            const values = await loadConfigData(existingConfig, 'employee');
            setEmployeeConfig({
              ...values,
              payrollComponentId,
            });
          } else {
            // Reset clean if no config
            setEmployeeConfig({
              calculationMethod: 'percentage',
              applicationType: 'same_to_all',
              globalValue: '',
              selectedComponentIds: [],
              percentageValue: '',
              employeeValues: new Map(),
              selectedEmployees: new Set(),
              selectAll: false,
              payrollComponentId,
            });
          }
        }
      } catch (err) {
        console.error('Error loading saved configuration:', err);
      }
    };
    loadSavedConfiguration();
  }, [selectedElement, employees.length, fetchEmployeeStatutoryValues, statutoryConfigurations, reloadTrigger]);

  // Helper function to load configuration data
  const loadConfigData = async (config: StatutoryConfiguration, tab: TabType) => {
    const result: any = {
      calculationMethod: config.calculation_method,
      applicationType: config.application_type,
      globalValue: '',
      selectedComponentIds: [] as string[],
      percentageValue: '',
      epsValue: '', // EPS value for PF employer contribution
      employeeValues: new Map<string, string>(),
      selectedEmployees: new Set<string>(),
      selectAll: false,
    };

    // Load reference component IDs and percentage value for percentage method
    if (config.calculation_method === 'percentage') {
      if (config.referance_component_ids) {
        result.selectedComponentIds = config.referance_component_ids;
      }
      if (config.global_value) {
        result.percentageValue = config.global_value.toString();
      }
    }

    if (config.application_type === 'same_to_all' && config.global_value) {
      result.globalValue = config.global_value.toString();
    }

    if (config.id) {
      const savedEmployeeValues = await fetchEmployeeStatutoryValues(config.id);
      if (savedEmployeeValues && savedEmployeeValues.length > 0) {
        const employeeIds = new Set<string>();
        const valueMap = new Map<string, string>();
        savedEmployeeValues.forEach(ev => {
          employeeIds.add(ev.employee_id);
          //  ONLY populate the individual values grid if the saved config was 'vary_employeewise'
          if (config.application_type === 'vary_employeewise') {
            valueMap.set(ev.employee_id, ev.value.toString());
          }
        });
        result.selectedEmployees = employeeIds;
        result.employeeValues = valueMap;
        result.selectAll = employeeIds.size === employees.length && employees.length > 0;
      }
    }

    // Load rounding type from the linked payroll component
    if (config.payroll_component_id) {
      const pc = payrollComponents.find(c => c.id === config.payroll_component_id);
      if (pc?.rounding_type) {
        result.roundingType = pc.rounding_type;
      }
    }

    return result;
  };

  // Sync specific column values to UI
  useEffect(() => {
    if (!selectedElement || !STATUTORY_ID_MAPPING[selectedElement]) {
      setEmployeeStatutoryIds(new Map());
      return;
    }
    const mapping = STATUTORY_ID_MAPPING[selectedElement];
    const newIdMap = new Map<string, string>();
    Object.values(fullStatutoryIdRecords).forEach(record => {
      const val = record[mapping.column];
      if (val) newIdMap.set(record.employee_id, val.toString());
    });
    setEmployeeStatutoryIds(newIdMap);
  }, [selectedElement, fullStatutoryIdRecords]);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowComponentDropdown(false);
      }
    };

    if (showComponentDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showComponentDropdown]);

  // Selection Handlers
  const handleSelectAll = () => {
    const currentConfig = getCurrentConfig();
    if (currentConfig.selectAll) {
      setCurrentConfig({ selectedEmployees: new Set(), selectAll: false });
    } else {
      setCurrentConfig({ selectedEmployees: new Set(employees.map(emp => emp.id)), selectAll: true });
    }
  };

  const handleEmployeeSelect = (employeeId: string) => {
    const currentConfig = getCurrentConfig();
    const newSelected = new Set(currentConfig.selectedEmployees);
    if (newSelected.has(employeeId)) {
      newSelected.delete(employeeId);
    } else {
      newSelected.add(employeeId);
    }
    setCurrentConfig({
      selectedEmployees: newSelected,
      selectAll: newSelected.size === employees.length,
    });
  };

  const handleEmployeeValueChange = (employeeId: string, value: string) => {
    const currentConfig = getCurrentConfig();
    const newValues = new Map(currentConfig.employeeValues);
    newValues.set(employeeId, value);
    setCurrentConfig({ employeeValues: newValues });
  };

  const handleEpsEmployeeValueChange = (employeeId: string, value: string) => {
    const newValues = new Map(employerConfig.epsEmployeeValues);
    newValues.set(employeeId, value);
    setEmployerConfig(prev => ({
      ...prev,
      epsEmployeeValues: newValues,
    }));
  };


  const handleStatutoryIdChange = (employeeId: string, value: string) => {
    const newIds = new Map(employeeStatutoryIds);
    newIds.set(employeeId, value);
    setEmployeeStatutoryIds(newIds);
  };

  // Handle component selection toggle
  const toggleComponentSelection = (componentId: string) => {
    const currentConfig = getCurrentConfig();
    const newSelection = currentConfig.selectedComponentIds.includes(componentId)
      ? currentConfig.selectedComponentIds.filter(id => id !== componentId)
      : [...currentConfig.selectedComponentIds, componentId];
    setCurrentConfig({ selectedComponentIds: newSelection });
  };

  // Remove selected component
  const removeComponent = (componentId: string) => {
    const currentConfig = getCurrentConfig();
    setCurrentConfig({
      selectedComponentIds: currentConfig.selectedComponentIds.filter(id => id !== componentId),
    });
  };

  const resetForm = () => {
    setSelectedElement('');
    setActiveTab('employee');
    setEmployeeConfig({
      calculationMethod: 'percentage',
      applicationType: 'same_to_all',
      globalValue: '',
      selectedComponentIds: [],
      percentageValue: '',
      employeeValues: new Map(),
      selectedEmployees: new Set(),
      selectAll: false,
      payrollComponentId: null,
      roundingType: 'none',
    });
    setEmployerConfig({
      calculationMethod: 'percentage',
      applicationType: 'same_to_all',
      globalValue: '',
      selectedComponentIds: [],
      percentageValue: '',
      epsValue: '', // Reset EPS value
      employeeValues: new Map(),
      epsEmployeeValues: new Map(),
      selectedEmployees: new Set(),
      selectAll: false,
      payrollComponentId: null,
      roundingType: 'none',
    });
    setEmployeeStatutoryIds(new Map());
    setSaveError(null);
  };

  // --- COMBINED CONFIGURATION SAVE (IDs, Values & Selections) ---
  const handleSaveConfiguration = async () => {
    try {
      isSavingRef.current = true;
      setSaveError(null);
      setSaveSuccess(false);

      if (!selectedElement) {
        setSaveError('Please select a statutory element');
        isSavingRef.current = false;
        return;
      }

      const currentConfig = getCurrentConfig();

      // Validation for percentage method
      if (currentConfig.calculationMethod === 'percentage') {
        if (currentConfig.selectedComponentIds.length === 0) {
          setSaveError('Please select at least one payroll component');
          return;
        }
        // ONLY validate global percentage if application type is same_to_all
        if (currentConfig.applicationType === 'same_to_all' && (!currentConfig.percentageValue || parseFloat(currentConfig.percentageValue) <= 0 || parseFloat(currentConfig.percentageValue) > 100)) {
          setSaveError('Please enter a valid percentage value (0-100)');
          return;
        }
      }

      if (currentConfig.applicationType === 'same_to_all' && !currentConfig.globalValue && currentConfig.calculationMethod === 'value') {
        setSaveError('Please enter a value');
        return;
      }
      if (currentConfig.selectedEmployees.size === 0) {
        setSaveError('Please select at least one employee');
        return;
      }

      const tenantId = await getTenantId();

      // 1. Save Statutory IDs (only for employee tab)
      if (activeTab === 'employee') {
        const mapping = STATUTORY_ID_MAPPING[selectedElement];
        if (mapping) {
          const idUpdates: any[] = [];
          for (const employee of employees) {
            const newIdValue = employeeStatutoryIds.get(employee.id);
            const existingRecord = fullStatutoryIdRecords[employee.id];

            const baseRecord = existingRecord || {
              employee_id: employee.id,
              tenant_id: tenantId
            };

            idUpdates.push({
              ...baseRecord,
              tenant_id: tenantId,
              employee_id: employee.id,
              [mapping.column]: newIdValue || null
            });
          }

          if (idUpdates.length > 0) {
            const { error: upsertError } = await supabase
              .from('employee_statutory_ids')
              .upsert(idUpdates, { onConflict: 'employee_id' });
            if (upsertError) throw upsertError;
            await fetchStatutoryIds();
          }
        }
      }

      // 2. Get payroll component ID for current tab (if tabs are required)
      let payrollComponentId: string | null = null;
      // if (requiresTabs) {
      payrollComponentId = await getPayrollComponentId(selectedElement, activeTab);
      if (!payrollComponentId) {
        setSaveError(`Could not find ${activeTab} payroll component for ${selectedElement}`);
        return;
      }
      //}

      // 3. Save Config Header with payroll_component_id
      const config: Omit<StatutoryConfiguration, 'id' | 'tenant_id' | 'created_at' | 'updated_at'> = {
        statutory_element: selectedElement as any,
        calculation_method: currentConfig.calculationMethod,
        application_type: currentConfig.applicationType,
        // SET explicitly to null if vary_employeewise to clear global column
        global_value: currentConfig.applicationType === 'same_to_all'
          ? (currentConfig.calculationMethod === 'percentage' ? parseFloat(currentConfig.percentageValue) : parseFloat(currentConfig.globalValue))
          : null as any,
        referance_component_ids: currentConfig.calculationMethod === 'percentage' ? currentConfig.selectedComponentIds : undefined,
        payroll_component_id: payrollComponentId,
        is_active: true,
      };

      const savedConfig = await saveStatutoryConfiguration(config);

      // 3.5 Update rounding_type in payroll_components table
      if (payrollComponentId) {
        const { error: roundingError } = await supabase
          .from('payroll_components')
          .update({ rounding_type: currentConfig.roundingType })
          .eq('id', payrollComponentId);
        
        if (roundingError) throw roundingError;
        
        // Update local state for payroll components
        setPayrollComponents(prev => prev.map(pc => 
          pc.id === payrollComponentId ? { ...pc, rounding_type: currentConfig.roundingType } : pc
        ));
      }

      // 4. Save EPS as separate configuration row (same structure)
      let epsSavedConfig: StatutoryConfiguration | null = null;
      if (selectedElement === 'provident_fund' && activeTab === 'employer' && (currentConfig.applicationType === 'same_to_all' ? currentConfig.epsValue : true)) {

        // let  epsComponent = payrollComponents.find(c => c.is_active && c.component_type === 'deduction'
        //   && c.name === 'Provident Fund (PF) - EPS');

        // if (!epsComponent) {
        //   throw new Error('EPS payroll component not found');
        // }


        const epsComponentId = await getPayrollComponentId(selectedElement, 'eps');

        const epsConfig = {
          ...config,
          // SET explicitly to null if vary_employeewise to clear global column
          global_value: currentConfig.applicationType === 'same_to_all' && currentConfig.epsValue ? parseFloat(currentConfig.epsValue) : null as any,
          payroll_component_id: epsComponentId,
        };

        epsSavedConfig = await saveStatutoryConfiguration(epsConfig);

        // Update rounding_type for EPS component
        if (epsComponentId) {
          const { error: epsRoundingError } = await supabase
            .from('payroll_components')
            .update({ rounding_type: currentConfig.roundingType })
            .eq('id', epsComponentId);
          
          if (epsRoundingError) throw epsRoundingError;
          
          setPayrollComponents(prev => prev.map(pc => 
            pc.id === epsComponentId ? { ...pc, rounding_type: currentConfig.roundingType } : pc
          ));
        }
      }

      // 5. Save Employee Values
      if (savedConfig.id) {
        const values: Omit<EmployeeStatutoryValue, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>[] = [];
        currentConfig.selectedEmployees.forEach(employeeId => {
          let valueToSave: number;
          if (currentConfig.applicationType === 'vary_employeewise') {
            const value = currentConfig.employeeValues.get(employeeId);
            valueToSave = value ? parseFloat(value) : 0;
          } else {
            valueToSave = currentConfig.calculationMethod === 'percentage'
              ? parseFloat(currentConfig.percentageValue)
              : parseFloat(currentConfig.globalValue);
          }
          if (valueToSave > 0) {
            values.push({
              employee_id: employeeId,
              configuration_id: savedConfig.id!,
              value: valueToSave,
            });
          }
        });
        if (values.length > 0) {
          await saveEmployeeStatutoryValues(values);
        } else if (values.length === 0) {
          await saveEmployeeStatutoryValues([]); // Send empty array to trigger deletion in store
        }
      }

      // 6. Save Employee Values for EPS (NEW)
      if (epsSavedConfig?.id) {
        const epsValues: Omit<EmployeeStatutoryValue, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>[] = [];

        currentConfig.selectedEmployees.forEach(employeeId => {
          let valueToSave: number;

          if (currentConfig.applicationType === 'vary_employeewise') {
            const val = employerConfig.epsEmployeeValues.get(employeeId);
            valueToSave = val ? parseFloat(val) : 0;
          } else {
            valueToSave = parseFloat(currentConfig.epsValue);
          }

          if (valueToSave > 0) {
            epsValues.push({
              employee_id: employeeId,
              configuration_id: epsSavedConfig.id!,
              value: valueToSave,
            });
          }
        });

        if (epsValues.length > 0) {
          await saveEmployeeStatutoryValues(epsValues);
        } else if (epsValues.length === 0) {
          await saveEmployeeStatutoryValues([]); // Send empty array to trigger deletion in store
        }
      }


      setSaveSuccess(true);
      toast.success('Statutory settings saved successfully');
      setTimeout(() => {
        setSaveSuccess(false);
      }, 3000);
      
      // Force reload of UI state with new DB data
      isSavingRef.current = false;
      setReloadTrigger(prev => prev + 1);
    } catch (err) {
      console.error(err);
      setSaveError(err instanceof Error ? err.message : 'Failed to save configuration');
      isSavingRef.current = false;
    }
  };

  // Get selected component details for display
  const currentConfig = getCurrentConfig();
  const selectedComponents = payrollComponents.filter(c => currentConfig.selectedComponentIds.includes(c.id));

  return (
    <div>
      <h2 className="text-lg font-medium text-gray-900 flex items-center">
        <Shield className="h-5 w-5 mr-2 text-blue-500" />
        Statutory Settings
      </h2>
      <p className="mt-1 text-sm text-gray-500">
        Configure statutory element settings and employee ID numbers.
      </p>

      {saveSuccess && (
        <div className="mt-4 rounded-md bg-green-50 p-4">
          <div className="flex">
            <Check className="h-5 w-5 text-green-400" />
            <div className="ml-3"><p className="text-sm font-medium text-green-800">Saved successfully</p></div>
          </div>
        </div>
      )}

      {(saveError || error) && (
        <div className="mt-4 rounded-md bg-red-50 p-4">
          <div className="flex">
            <AlertCircle className="h-5 w-5 text-red-400" />
            <div className="ml-3"><p className="text-sm font-medium text-red-800">{saveError || error}</p></div>
          </div>
        </div>
      )}

      <div className="mt-6 space-y-6">
        <div>
          <label htmlFor="statutory-element" className="block text-sm font-medium text-gray-700">
            Statutory Elements Applicable
          </label>
          <select
            id="statutory-element"
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
            value={selectedElement}
            onChange={(e) => setSelectedElement(e.target.value)}
          >
            <option value="">Select Statutory Element</option>
            {applicableElements.map((element) => (
              <option key={element.value} value={element.value}>{element.label}</option>
            ))}
          </select>
        </div>

        {selectedElement && (
          <>
            {requiresTabs && (
              <div className="border-b border-gray-200">
                <nav className="-mb-px flex space-x-8">
                  <button
                    onClick={() => setActiveTab('employee')}
                    className={`${activeTab === 'employee'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
                  >
                    Employee Contribution
                  </button>
                  <button
                    onClick={() => setActiveTab('employer')}
                    className={`${activeTab === 'employer'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
                  >
                    Employer Contribution
                  </button>
                </nav>
              </div>
            )}

            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <h3 className="text-sm font-medium text-gray-900 mb-4">Calculation Logic</h3>
              <div className="grid grid-cols-1 gap-y-6 gap-x-4 ">
                <div className="sm:col-span-3">
                  <label className="block text-sm font-medium text-gray-700">Percentage / Value</label>
                  <select
                    className="mt-2 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                    value={currentConfig.calculationMethod}
                    // onChange={(e) => setCurrentConfig({ calculationMethod: e.target.value as 'percentage' | 'value' })}

                    onChange={async (e) => {
                      const newMethod = e.target.value as 'percentage' | 'value';

                      // Update method first
                      setCurrentConfig({
                        calculationMethod: newMethod,
                      });

                      // Immediately reload saved configuration
                      if (!selectedElement) return;

                      try {
                        const payrollComponentId = await findPayrollComponentId(selectedElement, activeTab);

                        const existingConfig = statutoryConfigurations.find(
                          c =>
                            c.statutory_element === selectedElement &&
                            c.payroll_component_id === payrollComponentId &&
                            c.calculation_method === newMethod
                        );

                        if (existingConfig) {
                          const values = await loadConfigData(existingConfig, activeTab);

                          if (activeTab === 'employee') {
                            setEmployeeConfig(prev => ({
                              ...prev,
                              ...values,
                              payrollComponentId,
                            }));
                          } else {
                            setEmployerConfig(prev => ({
                              ...prev,
                              ...values,
                              payrollComponentId,
                            }));
                          }
                        } else {
                          // If no saved config exists → reset clean
                          setCurrentConfig({
                            calculationMethod: newMethod,
                            globalValue: '',
                            percentageValue: '',
                            epsValue: '', // Reset EPS value
                            selectedComponentIds: [],
                            employeeValues: new Map(),
                            selectedEmployees: new Set(),
                            selectAll: false,
                          });
                        }
                      } catch (err) {
                        console.error('Error reloading configuration:', err);
                      }
                    }}


                  >
                    <option value="percentage">Percentage</option>
                    <option value="value">Fixed Value</option>
                  </select>
                </div>

                {currentConfig.calculationMethod === 'percentage' && (
                  <div className="sm:col-span-3 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Select Payroll Components <span className="text-red-500">*</span>
                      </label>
                      <div className="relative" ref={dropdownRef}>
                        <button
                          type="button"
                          onClick={() => setShowComponentDropdown(!showComponentDropdown)}
                          className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-left focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        >
                          {currentConfig.selectedComponentIds.length > 0
                            ? `${currentConfig.selectedComponentIds.length} component${currentConfig.selectedComponentIds.length > 1 ? 's' : ''} selected`
                            : 'Select components'}
                        </button>

                        {showComponentDropdown && (
                          <div className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
                            {payrollComponents.length === 0 ? (
                              <div className="px-3 py-2 text-sm text-gray-500">No components available</div>
                            ) : (
                              payrollComponents.map((component) => (
                                <div
                                  key={component.id}
                                  className="px-3 py-2 hover:bg-gray-100 cursor-pointer flex items-center"
                                  onClick={() => toggleComponentSelection(component.id)}
                                >
                                  <input
                                    type="checkbox"
                                    checked={currentConfig.selectedComponentIds.includes(component.id)}
                                    onChange={() => { }}
                                    className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 mr-2"
                                  />
                                  <div className="flex-1">
                                    <div className="text-sm font-medium text-gray-900">{component.name}</div>
                                    {component.description && (
                                      <div className="text-xs text-gray-500">{component.description}</div>
                                    )}
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>

                      {selectedComponents.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {selectedComponents.map((component) => (
                            <span
                              key={component.id}
                              className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-800"
                            >
                              {component.name}
                              <button
                                type="button"
                                onClick={() => removeComponent(component.id)}
                                className="ml-2 inline-flex items-center"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="sm:col-span-3">
                  <label className="block text-sm font-medium text-gray-700">Application Type</label>
                  <div className="mt-2 space-y-2">
                    <div className="flex items-center">
                      <input
                        id="same-to-all"
                        type="radio"
                        className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300"
                        checked={currentConfig.applicationType === 'same_to_all'}
                        onChange={() => setCurrentConfig({ applicationType: 'same_to_all' })}
                      />
                      <label htmlFor="same-to-all" className="ml-2 text-sm text-gray-700">Same to All</label>
                    </div>
                    <div className="flex items-center">
                      <input
                        id="vary-employeewise"
                        type="radio"
                        className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300"
                        checked={currentConfig.applicationType === 'vary_employeewise'}
                        onChange={() => setCurrentConfig({ applicationType: 'vary_employeewise' })}
                      />
                      <label htmlFor="vary-employeewise" className="ml-2 text-sm text-gray-700">Vary Employeewise</label>
                    </div>
                  </div>
                </div>

                <div className="sm:col-span-3">
                  <label htmlFor="rounding-type" className="block text-sm font-medium text-gray-700">
                    Rounding Type
                  </label>
                  <select
                    id="rounding-type"
                    className="mt-2 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                    value={currentConfig.roundingType || 'none'}
                    onChange={(e) => setCurrentConfig({ roundingType: e.target.value as any })}
                  >
                    <option value="none">None (No Rounding)</option>
                    <option value="round">Standard Rounding (Normal Rounding)</option>
                    <option value="floor">Round Down (Floor)</option>
                    <option value="ceil">Round Up (Ceil)</option>
                    {/* <option value="decimal2">Fixed Decimal Rounding (2 Decimal Places)</option> */}
                  </select>
                  <div className="mt-1 bg-gray-50 p-2 rounded border border-gray-100">
                    <p className="text-xs text-gray-600 font-medium">
                      {currentConfig.roundingType === 'round' && 'Standard Rounding: 100.49 → 100, 100.50 → 101'}
                      {currentConfig.roundingType === 'floor' && 'Round Down: 2.9 → 2'}
                      {currentConfig.roundingType === 'ceil' && 'Round Up: 2.1 → 3'}
                      {currentConfig.roundingType === 'decimal2' && 'Fixed Decimal: 1250.456 → 1250.46'}
                      {(currentConfig.roundingType === 'none' || !currentConfig.roundingType) && 'Values will be kept exactly as calculated.'}
                    </p>
                  </div>
                </div>
              </div>

              {currentConfig.applicationType === 'same_to_all' && currentConfig.calculationMethod === 'value' && (
                <div className="mt-4">
                  <label htmlFor="global-value" className="block text-sm font-medium text-gray-700">
                    Fixed Value
                  </label>
                  <div className="mt-1 relative rounded-md shadow-sm w-full sm:w-1/2">
                    <span className='flex  gap-2 text-center items-center'>
                      <span className="text-gray-500 sm:text-sm">₹</span>
                      <input
                        type="number"
                        id="global-value"
                        className="focus:ring-blue-500 focus:border-blue-500 block w-full p-1 pr-12 sm:text-sm border-gray-300 rounded-md"
                        placeholder="0.00"
                        value={currentConfig.globalValue}
                        onChange={(e) => setCurrentConfig({ globalValue: e.target.value })}
                        step="0.01"
                        min="0"
                      />
                    </span>
                  </div>
                </div>
              )}

              {currentConfig.applicationType === 'same_to_all' && currentConfig.calculationMethod === 'percentage' && (
                <div className="mt-4">
                  <label htmlFor="percentage-value" className="block text-sm font-medium text-gray-700">
                    Percentage Value <span className="text-red-500">*</span>
                  </label>
                  <div className="mt-1 relative rounded-md shadow-sm w-full sm:w-1/2">
                    <input
                      type="number"
                      id="percentage-value"
                      className="focus:ring-blue-500 focus:border-blue-500 block w-full pr-12 p-2 sm:text-sm border-gray-300 rounded-md"
                      placeholder="0.00"
                      value={currentConfig.percentageValue}
                      onChange={(e) => setCurrentConfig({ percentageValue: e.target.value })}
                      step="0.01"
                      min="0"
                      max="100"
                    />
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                      <span className="text-gray-500 sm:text-sm">%</span>
                    </div>
                  </div>
                </div>
              )}

              {/* EPS Input Field - Only for Provident Fund Employer Contribution */}
              {selectedElement === 'provident_fund' && activeTab === 'employer' && currentConfig.applicationType === 'same_to_all' && (
                <div className="mt-4">
                  <label htmlFor="eps-value" className="block text-sm font-medium text-gray-700">
                    EPS (Employee Pension Scheme) {currentConfig.calculationMethod === 'percentage' ? 'Percentage' : 'Value'}
                  </label>
                  <div className="mt-1 relative rounded-md shadow-sm w-full sm:w-1/2">
                    {currentConfig.calculationMethod === 'value' ? (
                      <span className="flex gap-2 text-center items-center">
                        <span className="text-gray-500 sm:text-sm">₹</span>
                        <input
                          type="number"
                          id="eps-value"
                          className="focus:ring-blue-500 focus:border-blue-500 block w-full p-1 pr-12 sm:text-sm border-gray-300 rounded-md"
                          placeholder="0.00"
                          value={currentConfig.epsValue}
                          onChange={(e) => setCurrentConfig({ epsValue: e.target.value })}
                          step="0.01"
                          min="0"
                        />
                      </span>
                    ) : (
                      <>
                        <input
                          type="number"
                          id="eps-value"
                          className="focus:ring-blue-500 focus:border-blue-500 block w-full pr-12 p-2 sm:text-sm border-gray-300 rounded-md"
                          placeholder="0.00"
                          value={currentConfig.epsValue}
                          onChange={(e) => setCurrentConfig({ epsValue: e.target.value })}
                          step="0.01"
                          min="0"
                          max="100"
                        />
                        <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                          <span className="text-gray-500 sm:text-sm">%</span>
                        </div>
                      </>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    {currentConfig.calculationMethod === 'percentage'
                      ? 'Percentage of selected components that goes to EPS'
                      : 'Fixed amount that goes to EPS'}
                  </p>
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  Employee Details
                </label>
              </div>

              <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
                <table className="min-w-full divide-y divide-gray-300">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 w-10">
                        <input
                          type="checkbox"
                          className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 rounded"
                          checked={currentConfig.selectAll}
                          onChange={handleSelectAll}
                        />
                      </th>
                      <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Code</th>
                      <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Name</th>

                      {selectedElement && STATUTORY_ID_MAPPING[selectedElement] && activeTab === 'employee' && (
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                          {STATUTORY_ID_MAPPING[selectedElement].label}
                        </th>
                      )}

                      {/* {currentConfig.applicationType === 'vary_employeewise' && (
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                          {currentConfig.calculationMethod === 'percentage' ? 'Percentage' : 'Value'}
                        </th>
                      )} */}

                      {currentConfig.applicationType === 'vary_employeewise' && (
                        <>
                          <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                            {currentConfig.calculationMethod === 'percentage' ? 'PF %' : 'PF Value'}
                          </th>

                          {selectedElement === 'provident_fund' && activeTab === 'employer' && (
                            <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                              EPS {currentConfig.calculationMethod === 'percentage' ? '%' : 'Value'}
                            </th>
                          )}
                        </>
                      )}


                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {employees.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-4 text-sm text-gray-500 text-center">No employees found</td>
                      </tr>
                    ) : (
                      employees.map((employee) => (
                        <tr key={employee.id} className={!currentConfig.selectedEmployees.has(employee.id) ? "bg-gray-50" : ""}>
                          <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm">
                            <input
                              type="checkbox"
                              className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 rounded"
                              checked={currentConfig.selectedEmployees.has(employee.id)}
                              onChange={() => handleEmployeeSelect(employee.id)}
                            />
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-900">{employee.employee_code || '-'}</td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-900">{employee.name}</td>

                          {selectedElement && STATUTORY_ID_MAPPING[selectedElement] && activeTab === 'employee' && (
                            <td className="whitespace-nowrap px-3 py-2 text-sm">
                              <input
                                type="text"
                                className="focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md py-1.5"
                                placeholder={`Enter ${STATUTORY_ID_MAPPING[selectedElement].label}`}
                                value={employeeStatutoryIds.get(employee.id) || ''}
                                onChange={(e) => handleStatutoryIdChange(employee.id, e.target.value)}
                              />
                            </td>
                          )}

                          {/* {currentConfig.applicationType === 'vary_employeewise' && (
                            <td className="whitespace-nowrap px-3 py-2 text-sm text-gray-500">
                              <div className="relative rounded-md shadow-sm max-w-xs flex items-center gap-2">
                                <div className=" flex items-center pointer-events-none">
                                  <span className="text-gray-500 sm:text-sm">{currentConfig.calculationMethod === 'percentage' ? '' : '₹'}</span>
                                </div>
                                <input
                                  type="number"
                                  className="focus:ring-blue-500 focus:border-blue-500 block w-full pr-12 sm:text-sm border-gray-300 rounded-md py-1.5 disabled:bg-gray-100"
                                  value={currentConfig.employeeValues.get(employee.id) || ''}
                                  onChange={(e) => handleEmployeeValueChange(employee.id, e.target.value)}
                                  disabled={!currentConfig.selectedEmployees.has(employee.id)}
                                  step="0.01"
                                  min="0"
                                />
                                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                                  <span className="text-gray-500 sm:text-sm">{currentConfig.calculationMethod === 'percentage' ? '%' : ''}</span>
                                </div>
                              </div>
                            </td>
                          )} */}


                          {currentConfig.applicationType === 'vary_employeewise' && (
                            <>
                              {/* PF Employer Value */}
                              <td className="whitespace-nowrap px-3 py-2 text-sm text-gray-500">
                                <div className="relative rounded-md shadow-sm max-w-xs flex items-center gap-2">
                                  <span className="text-gray-500 sm:text-sm">
                                    {currentConfig.calculationMethod === 'percentage' ? '' : '₹'}
                                  </span>

                                  <input
                                    type="number"
                                    className="focus:ring-blue-500 focus:border-blue-500 block w-full pr-12 sm:text-sm border-gray-300 rounded-md py-1.5 disabled:bg-gray-100"
                                    value={currentConfig.employeeValues.get(employee.id) || ''}
                                    onChange={(e) => handleEmployeeValueChange(employee.id, e.target.value)}
                                    disabled={!currentConfig.selectedEmployees.has(employee.id)}
                                    step="0.01"
                                    min="0"
                                  />

                                  <span className="text-gray-500 sm:text-sm">
                                    {currentConfig.calculationMethod === 'percentage' ? '%' : ''}
                                  </span>
                                </div>
                              </td>

                              {/* EPS Per Employee Value */}
                              {selectedElement === 'provident_fund' && activeTab === 'employer' && (
                                <td className="whitespace-nowrap px-3 py-2 text-sm text-gray-500">
                                  <div className="relative rounded-md shadow-sm max-w-xs flex items-center gap-2">
                                    <span className="text-gray-500 sm:text-sm">
                                      {currentConfig.calculationMethod === 'percentage' ? '' : '₹'}
                                    </span>

                                    <input
                                      type="number"
                                      className="focus:ring-blue-500 focus:border-blue-500 block w-full pr-12 sm:text-sm border-gray-300 rounded-md py-1.5 disabled:bg-gray-100"
                                      value={employerConfig.epsEmployeeValues.get(employee.id) || ''}
                                      onChange={(e) =>
                                        handleEpsEmployeeValueChange(employee.id, e.target.value)
                                      }
                                      disabled={!currentConfig.selectedEmployees.has(employee.id)}
                                      step="0.01"
                                      min="0"
                                    />

                                    <span className="text-gray-500 sm:text-sm">
                                      {currentConfig.calculationMethod === 'percentage' ? '%' : ''}
                                    </span>
                                  </div>
                                </td>
                              )}
                            </>
                          )}


                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="pt-5 border-t border-gray-200">
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50"
                  onClick={resetForm}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveConfiguration}
                  disabled={loading}
                  className="inline-flex items-center justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                >
                  <Save className="h-4 w-4 mr-2" />
                  {loading ? 'Saving Config...' : 'Save Configuration'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}