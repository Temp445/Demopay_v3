import { useState, useEffect, useMemo } from 'react';
import { Users, Plus, Trash2, Edit2, AlertCircle, Save, XCircle, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { useSalaryStructuresStore } from '../../../stores/salaryStructuresStore';
import { useStructureAssignmentsStore } from '../../../stores/structureAssignmentsStore';
import AddEmployeesModal from './AddEmployeesModal';
import EditIndividualValuesModal from './EditIndividualValuesModal';
import ReassignmentConfirmationModal from './ReassignmentConfirmationModal';
import { supabase } from '../../../lib/supabase';
import { validateAuth } from '../../../stores/utils/storeUtils';

export default function StructureAssignmentPage() {
  const {
    items: salaryStructures,
    fetchSalaryStructures,
    fetchSalaryStructureDetails,
  } = useSalaryStructuresStore();

  const {
    assignments,
    loading,
    fetchAssignmentsByStructure,
    removeAssignment,
    assignStructure, // Assuming this action exists in your store to save new assignments
  } = useStructureAssignmentsStore();

  const [selectedStructureId, setSelectedStructureId] = useState<string>('');

  // Components that require manual input (Individual type)
  const [individualComponents, setIndividualComponents] = useState<any[]>([]);

  // NEW: Common Components with master_entry value_set (structure-level defaults)
  const [commonMasterEntryComponents, setCommonMasterEntryComponents] = useState<any[]>([]);
  const [commonComponentValues, setCommonComponentValues] = useState<Record<string, number>>({});
  const [savingCommonComponents, setSavingCommonComponents] = useState(false);

  // NEW: PAY Days Configuration
  const [payDaysType, setPayDaysType] = useState<'calendar_days' | 'custom'>('calendar_days');
  const [customPayDays, setCustomPayDays] = useState<number>(30);
  
  // Modal States
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<any>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isReassignmentModalOpen, setIsReassignmentModalOpen] = useState(false);
  const [reassignmentEmployees, setReassignmentEmployees] = useState<any[]>([]);

  // STAGING STATE: Employees selected but not yet saved to DB
  const [stagedEmployees, setStagedEmployees] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  
  // --- Search & Pagination States ---
   const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);

  useEffect(() => {
    fetchSalaryStructures();
  }, []);

  useEffect(() => {
    if (selectedStructureId) {
      loadStructureDetails();
      fetchAssignmentsByStructure(selectedStructureId);
      loadCommonMasterEntryComponents(); // NEW: Load common components
      loadExistingCommonComponentValues(); // NEW: Load saved values if any
      setStagedEmployees([]); // Clear staging when structure changes
      setSearchTerm('');
      setCurrentPage(1);
      setStagedEmployees([]);
    }
  }, [selectedStructureId]);

   // Reset pagination when searching
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const loadStructureDetails = async () => {
    try {
      const details = await fetchSalaryStructureDetails(selectedStructureId);
      const structureData = Array.isArray(details) ? details[0] : details;

      if (structureData) {
        const components = structureData.components || [];
        const individualComps = components.filter(
          (comp: any) => comp.type_selection === 'individual'
        );
        setIndividualComponents(individualComps);
      }
    } catch (error) {
      console.error('Error loading structure details:', error);
    }
  };

  /**
   * NEW: Load Common Components with master_entry value_set
   * These are structure-level default values for common components
   * Filters: type_selection = 'common' AND value_set = 'master_entry'
   */
const loadCommonMasterEntryComponents = async () => {
    try {
      const auth = await validateAuth();
      if (!auth.isAuthenticated || !auth.tenantId) return;

      if (!selectedStructureId) return;
      const { data: components, error } = await supabase
        .from('payroll_structure_components')
        .select(`
          id,
          payroll_components!inner (
            id,
            name,
            component_type,
            amount_type,
            description,
            type_selection,
            value_set
          )
        `)
        .eq('structure_id', selectedStructureId) 
        .eq('tenant_id', auth.tenantId)
        .eq('payroll_components.type_selection', 'common')
        .eq('payroll_components.value_set', 'master_entry')
        .eq('payroll_components.is_active', true)
        .order('display_order', { ascending: true });

      if (error) throw error;

      const formattedComponents = (components || []).map((item: any) => ({
        id: item.payroll_components.id, 
        structure_component_id: item.id,
        name: item.payroll_components.name,
        component_type: item.payroll_components.component_type,
        amount_type: item.payroll_components.amount_type,
        description: item.payroll_components.description,
      }));

      setCommonMasterEntryComponents(formattedComponents);
    } catch (error) {
      console.error('Error loading common master entry components:', error);
      toast.error('Failed to load common components');
    }
  };

  /**
   * NEW: Load existing common component values for the selected structure
   * These are stored in employee_salary_structure_assignments with employee_id = NULL
   * Also loads PAY Days configuration
   */
  const loadExistingCommonComponentValues = async () => {
    try {
      const auth = await validateAuth();
      if (!auth.isAuthenticated || !auth.tenantId) return;

      // Fetch existing common component values and PAY Days config for this structure
      const { data: assignment, error } = await supabase
        .from('employee_salary_structure_assignments')
        .select('individual_component_values, pay_days_type, custom_pay_days')
        .eq('tenant_id', auth.tenantId)
        .eq('salary_structure_id', selectedStructureId)
        .is('employee_id', null) // Critical: employee_id must be NULL for common values
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error; // Ignore "no rows" error

      if (assignment) {
        // Load common component values
        if (assignment.individual_component_values) {
          setCommonComponentValues(assignment.individual_component_values as Record<string, number>);
        } else {
          setCommonComponentValues({});
        }

        // Load PAY Days configuration
        if (assignment.pay_days_type) {
          setPayDaysType(assignment.pay_days_type as 'calendar_days' | 'custom');
        } else {
          setPayDaysType('calendar_days');
        }

        if (assignment.custom_pay_days) {
          setCustomPayDays(Number(assignment.custom_pay_days));
        } else {
          setCustomPayDays(30);
        }
      } else {
        // No existing assignment, set defaults
        setCommonComponentValues({});
        setPayDaysType('calendar_days');
        setCustomPayDays(30);
      }
    } catch (error) {
      console.error('Error loading existing common component values:', error);
    }
  };

  /**
   * NEW: Save common component values and PAY Days configuration to database
   * Saves to employee_salary_structure_assignments with employee_id = NULL
   */
  const saveCommonComponentValues = async () => {
    try {
      setSavingCommonComponents(true);
      const auth = await validateAuth();
      if (!auth.isAuthenticated || !auth.tenantId || !auth.userId) {
        toast.error('Authentication required');
        return;
      }

      // Validate custom pay days if type is custom
      if (payDaysType === 'custom') {
        if (!customPayDays || customPayDays <= 0) {
          toast.error('Please enter a valid number of custom pay days (must be greater than 0)');
          return;
        }
      }

      // Upsert the common component values and PAY Days configuration
      const { error } = await supabase.rpc('upsert_common_salary_structure_assignment', {
        p_tenant_id: auth.tenantId,
        p_salary_structure_id: selectedStructureId,
        p_component_values: commonComponentValues,
        p_pay_days_type: payDaysType,
        p_custom_pay_days: payDaysType === 'custom' ? customPayDays : null,
      });

      if (error) throw error;

      toast.success('Structure configuration saved successfully');
    } catch (error: any) {
      console.error('Error saving structure configuration:', error);
      toast.error(error.message || 'Failed to save structure configuration');
    } finally {
      setSavingCommonComponents(false);
    }
  };

  /**
   * NEW: Handle value change for common components
   */
  const handleCommonComponentValueChange = (componentId: string, value: string) => {
    const numericValue = parseFloat(value) || 0;
    setCommonComponentValues(prev => ({
      ...prev,
      [componentId]: numericValue,
    }));
  };


  // --- HANDLERS FOR STAGING AREA ---

  // 1. Receive employees from Modal
  const handleStageEmployees = (selectedEmployees: any[]) => {
    // Filter out employees already in the staging list to prevent duplicates
    const newEmployees = selectedEmployees.filter(
      (emp) => !stagedEmployees.some((staged) => staged.id === emp.id)
    );

    // Initialize with values for individual components
    const initializedEmployees = newEmployees.map((emp) => {
      // Initialize individual values
      // If employee has existing individual_component_values from another structure, preserve them
      // Otherwise, initialize with 0 for all components
      const initialValues: Record<string, number> = {};

      individualComponents.forEach((comp) => {
        if (comp.id) {
          // Check if employee has existing value for this component ID
          if (emp.individual_component_values && emp.individual_component_values[comp.id] != null) {
            // Preserve existing value from their current structure
            initialValues[comp.id] = emp.individual_component_values[comp.id];
          } else {
            // Initialize to 0 if no existing value
            initialValues[comp.id] = 0;
          }
        }
      });

      return {
        ...emp,
        name: emp.name || emp.full_name,
        individual_values: initialValues,
      };
    });

    setStagedEmployees((prev) => [...prev, ...initializedEmployees]);
    setIsAddModalOpen(false);
  };

  // 2. Handle Input Change for Salary Components
  // UPDATED: Use componentId instead of componentName
  const handleStagedValueChange = (employeeId: string, componentId: string, value: string) => {
    const numericValue = parseFloat(value) || 0;

    setStagedEmployees((prev) =>
      prev.map((emp) => {
        if (emp.id === employeeId) {
          return {
            ...emp,
            individual_values: {
              ...emp.individual_values,
              [componentId]: numericValue,
            },
          };
        }
        return emp;
      })
    );
  };

  // 3. Remove from Staging
  const removeFromStaging = (employeeId: string) => {
    setStagedEmployees((prev) => prev.filter((e) => e.id !== employeeId));
  };

  // 4. Check for conflicts and show warning if needed
  const handleSaveAssignments = async () => {
    if (stagedEmployees.length === 0) return;

    // Check for conflicts (employees already assigned to other structures)
    const employeesWithConflicts = stagedEmployees.filter(
      (emp) => emp.current_structure_id && emp.current_structure_id !== selectedStructureId
    );

    if (employeesWithConflicts.length > 0) {
      // Show reassignment warning modal
      setReassignmentEmployees(employeesWithConflicts);
      setIsReassignmentModalOpen(true);
      return;
    }

    // No conflicts, proceed with validation and save
    await proceedWithSave();
  };

  // 5. Proceed with save after validation/confirmation
  const proceedWithSave = async () => {
    // Check if there are any components that need values
    if (individualComponents.length > 0) {
      // Count employees with all zero or empty values
      // UPDATED: Use component IDs instead of names
      const employeesWithAllZeros = stagedEmployees.filter((emp) =>
        individualComponents.every((comp) => {
          if (!comp.id) return true;
          const value = emp.individual_values[comp.id];
          return !value || value === 0;
        })
      );

      if (employeesWithAllZeros.length > 0 && individualComponents.length > 0) {
        if (!confirm(`${employeesWithAllZeros.length} employee(s) have all zero or empty component values. Continue?`)) {
          return;
        }
      }
    }

    setIsSaving(true);
    try {
      // Prepare payload for API
      const payload = stagedEmployees.map(emp => ({
        employee_id: emp.id,
        structure_id: selectedStructureId,
        individual_component_values: emp.individual_values
      }));

      // Call store action and get result
      const result = await assignStructure(payload);

      // Check actual results
      if (result.errorCount > 0 && result.successCount === 0) {
        // All failed
        toast.error(`Failed to assign all ${payload.length} employee(s). Please check the data and try again.`);
      } else if (result.errorCount > 0 && result.successCount > 0) {
        // Partial success - show warning-style message
        toast(`Assigned ${result.successCount} employee(s) successfully, but ${result.errorCount} failed. Please review and retry failed assignments.`, {
          icon: '⚠️',
          style: {
            background: '#FEF3C7',
            color: '#92400E',
            border: '1px solid #FCD34D',
          },
          duration: 5000,
        });
        // Clear only successful ones from staging (optional - or clear all)
        setStagedEmployees([]);
        // Refresh to show what was saved
        await fetchAssignmentsByStructure(selectedStructureId);
      } else if (result.successCount > 0) {
        // All succeeded
        toast.success(`Successfully assigned ${result.successCount} employee(s) to salary structure`);
        // Clear staging and refresh
        setStagedEmployees([]);
        await fetchAssignmentsByStructure(selectedStructureId);
      } else {
        // No operations performed
        toast.error("No assignments were processed. Please try again.");
      }
    } catch (error: any) {
      console.error("Failed to save assignments", error);
      toast.error(error.message || "Failed to save assignments. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  // 6. Handle reassignment confirmation
  const handleReassignmentConfirm = async () => {
    setIsReassignmentModalOpen(false);
    setReassignmentEmployees([]);
    await proceedWithSave();
  };

  // 7. Handle reassignment cancel
  const handleReassignmentCancel = () => {
    setIsReassignmentModalOpen(false);
    setReassignmentEmployees([]);
  };

  // --- EXISTING HANDLERS ---

  const handleRemoveAssignment = async (employeeId: string, employeeName: string) => {
    if (confirm(`Are you sure you want to remove ${employeeName} from this salary structure?`)) {
      try {
        await removeAssignment(employeeId);
      } catch (error) {
        console.error('Error removing assignment:', error);
      }
    }
  };

  const handleEditIndividualValues = (assignment: any) => {
    setEditingAssignment(assignment);
    setIsEditModalOpen(true);
  };

    // --- Search & Pagination Logic ---
  const filteredAssignments = useMemo(() => {
    if (!searchTerm) return assignments;
    const lowerSearch = searchTerm.toLowerCase();
    return assignments.filter(
      (a) =>
        (a.employee_name || '').toLowerCase().includes(lowerSearch) ||
        (a.employee_code || '').toLowerCase().includes(lowerSearch) ||
        (a.department || '').toLowerCase().includes(lowerSearch) ||
        (a.position || '').toLowerCase().includes(lowerSearch)
    );
  }, [assignments, searchTerm]);

  const totalPages = Math.ceil(filteredAssignments.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentAssignments = filteredAssignments.slice(indexOfFirstItem, indexOfLastItem);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Salary Structure Assignments</h1>
          <p className="mt-1 text-sm text-gray-500">
            Assign salary structures to employees and manage individual component values
          </p>
        </div>
      </div>

      {/* Structure Selector */}
      <div className="bg-white shadow-md rounded-lg p-6">
        <div className="max-w-2xl">
          <label htmlFor="structure-select" className="block text-sm font-medium text-gray-700 mb-2">
            Select Salary Structure
          </label>
          <select
            id="structure-select"
            className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            value={selectedStructureId}
            onChange={(e) => setSelectedStructureId(e.target.value)}
          >
            <option value="">-- Choose a Salary Structure --</option>
            {(salaryStructures || [])
              .filter((s) => s.is_active)
              .map((structure) => (
                <option key={structure.id} value={structure.id}>
                  {structure.name}
                </option>
              ))}
          </select>

          {/* Show Individual Components Info */}
          {/* {selectedStructureId && individualComponents.length > 0 && (
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-sm font-medium text-blue-900 mb-1">
                Individual Components Required:
              </p>
              <div className="flex flex-wrap gap-2">
                {individualComponents.map((comp) => (
                  <span
                    key={comp.name}
                    className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800"
                  >
                    {comp.name}
                  </span>
                ))}
              </div>
              <p className="text-xs text-blue-700 mt-2">
                You will need to enter values for these components when assigning employees.
              </p>
            </div>
          )} */}

          {selectedStructureId && individualComponents.length === 0 && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md">
              <p className="text-sm text-green-800">
                This structure has no individual components. You can assign employees directly.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ------------------------------------------------ */}
      {/* NEW SECTION: PAY Days Configuration */}
      {/* Configure how many days to use for payroll calculation */}
      {/* ------------------------------------------------ */}
      {selectedStructureId && (
        <div className="bg-white shadow-md rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-medium text-gray-900">
                PAY Days Configuration
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Configure how many days to use for salary calculations in this structure
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* PAY Days Type Dropdown */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                PAY Days Type <span className="text-red-500">*</span>
              </label>
              <select
                value={payDaysType}
                onChange={(e) => setPayDaysType(e.target.value as 'calendar_days' | 'custom')}
                className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              >
                <option value="calendar_days">Calendar Days</option>
                <option value="custom">Custom</option>
              </select>
              <p className="mt-1 text-xs text-gray-500">
                {payDaysType === 'calendar_days'
                  ? 'Use actual calendar days of the month (28-31 days)'
                  : 'Use a fixed custom number of days'}
              </p>
            </div>

            {/* Custom Days Input - Only shown when Custom is selected */}
            {payDaysType === 'custom' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Custom Days <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  max="365"
                  step="0.01"
                  value={customPayDays}
                  onChange={(e) => setCustomPayDays(parseFloat(e.target.value) || 0)}
                  className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  placeholder="Enter number of days (e.g., 26, 30)"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Enter the fixed number of days to use for calculations (must be greater than 0)
                </p>
              </div>
            )}
          </div>

          {/* Information Box */}
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
            <div className="flex">
              <div className="flex-shrink-0">
                <AlertCircle className="h-5 w-5 text-blue-400" />
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-blue-800">
                  How PAY Days Affect Calculations
                </h3>
                <div className="mt-2 text-sm text-blue-700">
                  <ul className="list-disc list-inside space-y-1">
                    <li><strong>Calendar Days:</strong> Salary calculations will use the actual number of days in each month</li>
                    <li><strong>Custom Days:</strong> Salary calculations will use your specified fixed number of days</li>
                    <li>This affects per-day salary calculations for attendance-based components</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------ */}
      {/* NEW SECTION: Common Components (Master Entry) */}
      {/* Display structure-level default values for common components */}
      {/* ------------------------------------------------ */}
      {selectedStructureId && (
        <div className="bg-white shadow-md rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-medium text-gray-900">
                Common Component Default Values
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Set default values for common components that apply to all employees in this structure
              </p>
            </div>
            <button
              onClick={saveCommonComponentValues}
              disabled={savingCommonComponents}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {savingCommonComponents ? (
                <>
                  <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Configuration
                </>
              )}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {commonMasterEntryComponents.map((component) => (
              <div key={component.id} className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                    {component.name}
                  </label>

                  <div className="mt-1 flex items-center">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                    component.component_type === 'earning'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {component.component_type === 'earning' ? 'Earning' : 'Deduction'}
                  </span>
                </div>
                  {/* {component.amount_type === 'percentage' ? (
                    <Percent className="h-4 w-4 text-gray-400" />
                  ) : (
                    <DollarSign className="h-4 w-4 text-gray-400" />
                  )} */}
                </div>

                {/* {component.description && (
                  <p className="text-xs text-gray-500 mb-2">{component.description}</p>
                )} */}

                <div className="relative rounded-md shadow-sm">
                  {component.amount_type === 'value' ? (
                    <>
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                        <span className="text-gray-500 sm:text-sm">₹</span>
                      </div>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={commonComponentValues[component.id] || ''}
                        onChange={(e) => handleCommonComponentValueChange(component.id, e.target.value)}
                        className="block w-full rounded-md border-gray-300 pl-7 pr-3 py-2 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                      />
                    </>
                  ) : (
                    <>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        placeholder="0.00"
                        value={commonComponentValues[component.id] || ''}
                        onChange={(e) => handleCommonComponentValueChange(component.id, e.target.value)}
                        className="block w-full rounded-md border-gray-300 pl-3 pr-8 py-2 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                      />
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                        <span className="text-gray-500 sm:text-sm">%</span>
                      </div>
                    </>
                  )}
                </div>

                
              </div>
            ))}
          </div>

          {commonMasterEntryComponents.length === 0 && (
            <div className="text-center py-8">
              <p className="text-sm text-gray-500">
                No common components with master entry found for this structure.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------ */}
      {/* NEW SECTION: Pending / Staged Assignments List */}
      {/* ------------------------------------------------ */}
      {stagedEmployees.length > 0 && selectedStructureId && (
        <div className="bg-orange-50 border border-orange-200 shadow-md rounded-lg overflow-hidden animate-in fade-in slide-in-from-bottom-4">
          <div className="px-6 py-4 border-b border-orange-200 flex items-center justify-between bg-orange-100">
            <div className="flex items-center">
              <AlertCircle className="h-5 w-5 text-orange-600 mr-2" />
              <h2 className="text-lg font-bold text-orange-900">
                Pending Assignments <span className="text-sm font-normal text-orange-800">(Set values and Save)</span>
              </h2>
            </div>
            <div className="flex gap-2">
                <button
                    onClick={() => setStagedEmployees([])}
                    className="px-3 py-1 text-sm text-red-600 bg-white border border-red-200 rounded hover:bg-red-50"
                >
                    Cancel All
                </button>
                <button
                    onClick={handleSaveAssignments}
                    disabled={isSaving}
                    className="flex items-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isSaving ? (
                      <>
                        <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        Save Assignments
                      </>
                    )}
                </button>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[500px]">
            <table className="min-w-full divide-y divide-orange-200">
              <thead className="bg-orange-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-orange-800 uppercase tracking-wider">Employee</th>
                  {individualComponents.map((comp) => (
                    <th key={comp.name} className="px-6 py-3 text-left text-xs font-medium text-indigo-800 uppercase tracking-wider bg-indigo-50/50">
                      {comp.name} <span className="lowercase font-normal">(enter amount)</span>
                    </th>
                  ))}
                  <th className="px-6 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-orange-100">
                {stagedEmployees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-orange-50/30 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{emp.name || emp.full_name}</div>
                      <div className="text-xs text-gray-500">{emp.employee_code} | {emp.department}</div>
                    </td>
                    
                    {/* Dynamic Input Fields for Individual Components */}
                    {/* UPDATED: Use component IDs for data storage while displaying component names */}
                    {individualComponents.map((comp) => (
                      <td key={`${emp.id}-${comp.id || comp.name}`} className="px-6 py-4 whitespace-nowrap bg-indigo-50/10">
                        <div className="relative rounded-md shadow-sm">
                          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2">
                            <span className="text-gray-500 sm:text-sm">₹</span>
                          </div>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            value={comp.id ? (emp.individual_values[comp.id] || '') : ''}
                            onChange={(e) => comp.id && handleStagedValueChange(emp.id, comp.id, e.target.value)}
                            className="block w-full rounded-md border-gray-300 pl-6 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm py-1"
                          />
                        </div>
                      </td>
                    ))}

                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <button
                        onClick={() => removeFromStaging(emp.id)}
                        className="text-red-500 hover:text-red-700"
                        title="Remove from list"
                      >
                        <XCircle className="h-5 w-5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ------------------------------------------------ */}
      {/* Existing Assigned Employees Table */}
      {/* ------------------------------------------------ */}
      {selectedStructureId && (
        <div className="bg-white shadow-md rounded-lg overflow-hidden">
           <div className="px-6 py-4 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center">
              <Users className="h-5 w-5 text-gray-400 mr-2" />
              <h2 className="text-lg font-medium text-gray-900">
                Assigned Employees (Individual Components)
              </h2>
              {/* <span className="ml-2 px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded-full">
                {assignments.length}
              </span> */}
            </div>

            <div className="flex items-center gap-3">
              {/* --- NEW: Search Input --- */}
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  type="text"
                  placeholder="Search employees..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors"
                />
              </div>

            <button
              onClick={() => setIsAddModalOpen(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Employees
            </button>
             </div>
          </div>

          {loading ? (
            <div className="px-6 py-12 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
              <p className="mt-2 text-sm text-gray-500">Loading assignments...</p>
            </div>
          ) : assignments.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <Users className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No employees assigned</h3>
              <p className="mt-1 text-sm text-gray-500">
                Get started by assigning employees to this salary structure.
              </p>
            </div>
          ) : (
             <div className="flex flex-col">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Employee Code</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Department</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Position</th>
                    {individualComponents.map((comp) => (
                      <th key={comp.name} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-blue-50">
                        {comp.name}
                      </th>
                    ))}
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Assigned At</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {/* --- NEW: Use currentAssignments instead of assignments --- */}
                    {currentAssignments.length > 0 ? (
                      currentAssignments.map((assignment) => {
                    const hasIndividualComponents = individualComponents.length > 0;
                    // UPDATED: Use component IDs instead of names to check if all values are entered

                    return (
                      <tr key={assignment.assignment_id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{assignment.employee_code}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{assignment.employee_name}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{assignment.department || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{assignment.position || '-'}</td>
                        {/* UPDATED: Use component IDs instead of names to retrieve values */}
                        {individualComponents.map((comp) => {
                          const value = comp.id ? assignment.individual_component_values?.[comp.id] : undefined;
                          return (
                            <td key={comp.id || comp.name} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 bg-blue-50">
                              {value != null ? (
                                <span className="font-medium">₹{value.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                              ) : (
                                <span className="text-orange-600 flex items-center"><AlertCircle className="h-4 w-4 mr-1" /> Not set</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(assignment.assigned_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex items-center justify-end space-x-2">
                             {/* ... (Existing Edit/Remove Buttons) ... */}
                             {hasIndividualComponents && (
                              <button onClick={() => handleEditIndividualValues(assignment)} className="text-indigo-600 hover:text-indigo-900"><Edit2 className="h-4 w-4" /></button>
                             )}
                             <button onClick={() => handleRemoveAssignment(assignment.employee_id, assignment.employee_name)} className="text-red-600 hover:text-red-900"><Trash2 className="h-4 w-4" /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                    ) : (
                      <tr>
                        <td colSpan={100} className="px-6 py-8 text-center text-sm text-gray-500">
                          No employees found matching your search.
                        </td>
                      </tr>
                    )}
                </tbody>
              </table>
              </div>

              {/* --- NEW: Pagination Controls --- */}
              {filteredAssignments.length > 0 && (
                <div className="px-6 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
                  <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm text-gray-700">
                        Showing <span className="font-medium">{indexOfFirstItem + 1}</span> to{' '}
                        <span className="font-medium">
                          {Math.min(indexOfLastItem, filteredAssignments.length)}
                        </span>{' '}
                        of <span className="font-medium">{filteredAssignments.length}</span> results
                      </p>
                    </div>
                    <div>
                      <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                        <button
                          onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                          disabled={currentPage === 1}
                          className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
                        >
                          <span className="sr-only">Previous</span>
                          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                        </button>
                        
                        {/* Page Numbers display */}
                        <span className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">
                          Page {currentPage} of {totalPages}
                        </span>

                        <button
                          onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                          disabled={currentPage === totalPages || totalPages === 0}
                          className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
                        >
                          <span className="sr-only">Next</span>
                          <ChevronRight className="h-5 w-5" aria-hidden="true" />
                        </button>
                      </nav>
                    </div>
                  </div>
                  
                  {/* Mobile Pagination View */}
                  <div className="flex items-center justify-between sm:hidden w-full">
                    <button
                      onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                      disabled={currentPage === 1}
                      className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:bg-gray-100"
                    >
                      Previous
                    </button>
                    <span className="text-sm text-gray-700">
                       {currentPage} / {totalPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                      disabled={currentPage === totalPages || totalPages === 0}
                      className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:bg-gray-100"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Add Employees Modal - Connected to Staging Handler */}
      {isAddModalOpen && (
        <AddEmployeesModal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          structureId={selectedStructureId}
          structureName={(salaryStructures || []).find((s) => s.id === selectedStructureId)?.name || ''}
          onAddEmployees={handleStageEmployees} // Connect to staging handler
        />
      )}

      {/* Edit Modal (Existing) */}
      {isEditModalOpen && editingAssignment && (
        <EditIndividualValuesModal
          isOpen={isEditModalOpen}
          onClose={() => {
            setIsEditModalOpen(false);
            setEditingAssignment(null);
          }}
          assignment={editingAssignment}
          individualComponents={individualComponents}
        />
      )}

      {/* Reassignment Warning Modal */}
      {isReassignmentModalOpen && (
        <ReassignmentConfirmationModal
          isOpen={isReassignmentModalOpen}
          onConfirm={handleReassignmentConfirm}
          onCancel={handleReassignmentCancel}
          employees={reassignmentEmployees.map(emp => ({
            id: emp.id,
            employee_code: emp.employee_code,
            full_name: emp.name,
            current_structure_name: emp.current_structure_name || 'Unknown',
          }))}
          newStructureName={
            (salaryStructures || []).find((s) => s.id === selectedStructureId)?.name || ''
          }
        />
      )}
    </div>
  );
}