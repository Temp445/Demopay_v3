/**
 * PayrollProcessPage Component
 *
 * This component handles payroll processing with sophisticated component value management
 * based on the `value_set` property of each payroll component.
 *
 * ============================================================================
 * COMPONENT VALUE FETCHING LOGIC
 * ============================================================================
 *
 * Each payroll component has a `value_set` property that determines when and
 * where its value is entered/fetched. The system handles three types:
 *
 * 1. at_executing (Enter at Payroll Processing):
 *    - UI Display: Show component with editable input fields
 *    - Data Source: Fetch from payroll.salary_components or payroll.deduction_components
 *    - Fetch Logic:
 *      * Primary: Find records where current_date falls within period_start and period_end
 *      * Fallback: If no exact match, use the record with the maximum period_start
 *    - Processing: Use the values entered in the UI controls
 *    - Use Case: Variable allowances, bonuses, or deductions that change monthly
 *
 * 2. at_structure (Enter at Salary Structure):
 *    Behavior depends on `is_locked` flag:
 *
 *    a) When is_locked = false:
 *       - UI Display: Show component with editable input fields
 *       - Data Source: Fetch from payroll_structure_components table
 *       - Processing: Use values from UI controls (can be modified before processing)
 *       - Use Case: Standard components that may need occasional adjustments
 *
 *    b) When is_locked = true:
 *       - UI Display: HIDE from UI (not shown in table)
 *       - Data Source: Fetch from payroll_structure_components table
 *       - Processing: Use fetched values directly (no UI modification allowed)
 *       - Use Case: Fixed components that should never be modified during payroll
 *
 * 3. master_entry (Employee Values):
 *    Behavior depends on `type_selection` flag:
 *
 *    a) When type_selection = 'common':
 *       - UI Display: HIDE from UI (not shown in table)
 *       - Data Source: Fetch from employee_salary_structure_assignments where employee_id IS NULL
 *       - Processing: Apply structure-level default values to ALL employees
 *       - Use Case: Common allowances/deductions that apply uniformly (e.g., uniform allowance)
 *
 *    b) When type_selection = 'individual':
 *       - UI Display: HIDE from UI (not shown in table)
 *       - Data Source: Fetch from employee_salary_structure_assignments for specific employee_id
 *       - Processing: Use employee-specific values (override common values if both exist)
 *       - Use Case: Employee-specific components like individual allowances or special deductions
 *
 * ============================================================================
 * DATA FLOW DURING PAYROLL PROCESSING
 * ============================================================================
 *
 * 1. Load Structure Components:
 *    - Fetch all components from selected salary structure
 *    - Filter for UI display:
 *      * Show: at_executing components
 *      * Show: at_structure components with is_locked=false
 *      * Hide: at_structure components with is_locked=true
 *      * Hide: master_entry components
 *
 * 2. Load Employee Data:
 *    - Fetch common component values once (employee_id IS NULL) for the entire structure
 *    - For each employee assigned to the structure:
 *      * Load draft values (if user was editing)
 *      * Fetch at_executing values from payroll tables
 *      * Fetch at_structure values from structure components table
 *      * Apply common master_entry values (type_selection='common', employee_id=NULL)
 *      * Fetch individual master_entry values (type_selection='individual', specific employee_id)
 *      * Individual values override common values if both exist
 *      * Populate editable component fields in UI
 *
 * 3. Process Payroll:
 *    - For visible components: Use values from UI (may be edited by user)
 *    - For hidden components: Fetch and use values directly
 *    - Apply attendance factors if applicable
 *    - Calculate percentage-based components
 *    - Include advance deductions
 *    - Store all processed component values in payroll table
 *
 * ============================================================================
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Play, Calendar, FileText, Users, Save, CheckCircle, Lock, RefreshCcw, AlertTriangle, Search, AlertCircle, Loader2, Info } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { validateAuth } from '../../../stores/utils/storeUtils';
import { useSalaryStructuresStore, type SalaryStructureComponent } from '../../../stores/salaryStructuresStore';
import { useEmployeesStore, type Employee } from '../../../stores/employeesStore';
import { usePayrollStore } from '../../../stores/payrollStore';
import { useAbsenteeStore } from '../../../stores/absenteeStore';
import { useLeaveStore } from '../../../stores/leaveStore';
import { useOTStructuresStore } from '../../../stores/otStructuresStore';
import { validatePayrollPeriod, type PayrollCalculationResult, getTimeEvaluationComponents } from '../../../lib/payrollCalculation';
import { getEmployeeAdvanceDeductions } from '../../../lib/advancePayrollIntegration';
import { evaluateTimeData, storeTimeEvaluation, type AttendanceData, type AttendanceEntry } from '../../../lib/timeEvaluation';
import { FormulaEngine, type ExecutionContext } from '../../../lib/formula-engine';
import {
  getOTStructureWithComponents,
  calculateTotalOTAmount,
  getStandardMonthlyHours,
  createOTProcess,
  bulkSaveOTProcessedData,
  updateOTProcess
} from '../../../lib/otManagement';
import { getGlobalOvertimeConfig } from '../../../lib/overtime';

// ... [Keep getDefaultPeriod helper as is] ...
const getDefaultPeriod = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);

  const toLocalISOString = (date: Date) => {
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().split('T')[0];
  };

  return {
    start: toLocalISOString(start),
    end: toLocalISOString(end)
  };
};

// ... [Keep Interfaces as is] ...
interface EditableComponent {
  id: string;
  name: string;
  component_type: 'earning' | 'deduction';
  amount_type?: string;
  editability?: string;
  type_selection?: string;
  value_set?: 'master_entry' | 'at_structure' | 'at_executing';
  is_locked?: boolean;
  amount?: number;
  percentage_value?: number;
}

interface EmployeePayrollData {
  employeeSalaryStructureId: string;
  employee_id: string;
  employee_code: string;
  employee_name: string;
  designation: string;
  selected: boolean;
  editableComponents: Record<string, number>;
  calculationResult?: PayrollCalculationResult;
  processedComponents?: {
    earnings: SalaryStructureComponent[];
    deductions: SalaryStructureComponent[];
  };
  payrollStatus: 'Draft' | 'Paid' | 'Pending';
  existingPayrollId?: string;
  netSalary?: number;
  paymentDate?: string;
  blockingReason?: string | null;
}

interface EmployeeProgressTask {
  id: string;
  name: string;
  progress: number;
  status: 'pending' | 'processing' | 'completed' | 'error';
  detail?: string;
}

export default function PayrollProcessPage() {
  const { items: structures, fetchSalaryStructures, fetchSalaryStructureDetails } = useSalaryStructuresStore();
  const { items: allEmployees, fetchEmployees } = useEmployeesStore();
  const { createPayProcessEntry, reprocessPayroll } = usePayrollStore();
  const { syncAllLeaveBalances } = useLeaveStore();

  const { items: absenteeRecords, fetchAbsentees, loading: loadingAbsentees } = useAbsenteeStore();

  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [processingTasks, setProcessingTasks] = useState<EmployeeProgressTask[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const { start: defaultStart, end: defaultEnd } = getDefaultPeriod();
  const [periodStart, setPeriodStart] = useState(defaultStart);
  const [periodEnd, setPeriodEnd] = useState(defaultEnd);

  const [selectedStructureId, setSelectedStructureId] = useState('');
  const [structureComponents, setStructureComponents] = useState<SalaryStructureComponent[]>([]);
  const [editableComponents, setEditableComponents] = useState<EditableComponent[]>([]);

  const [employeePayrollData, setEmployeePayrollData] = useState<EmployeePayrollData[]>([]);
  const [selectAll, setSelectAll] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // ❌ REMOVED: showAddEmployeeModal state
  // ❌ REMOVED: availableEmployees state
  const [savingDraft, setSavingDraft] = useState(false);
  const [otLinked, setOtLinked] = useState(true);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [viewMode, setViewMode] = useState<'process' | 'paid_history'>('process');
  const [userRole, setUserRole] = useState<string>('');
  const [reprocessingId, setReprocessingId] = useState<string | null>(null);
  const [showReprocessModal, setShowReprocessModal] = useState(false);
  const [itemsToReprocess, setItemsToReprocess] = useState<{ id: string; name: string }[]>([]);
  const [otConfig, setOtConfig] = useState<any>(null);

  useEffect(() => {
    fetchSalaryStructures();
    fetchEmployees();
    checkUserRole();
    loadOTConfig();
  }, []);

  const loadOTConfig = async () => {
    const config = await getGlobalOvertimeConfig();
    setOtConfig(config);
    if (!config?.enabled || !config?.link_with_payroll) {
      setOtLinked(false);
    } else {
      setOtLinked(true);
    }
  };

  const checkUserRole = async () => {
    const auth = await validateAuth();
    if (auth.isAuthenticated) {
      setUserRole('admin');
    }
  };

  useEffect(() => {
    if (periodStart && periodEnd) {
      fetchAbsentees(periodStart, periodEnd);
    }
  }, [periodStart, periodEnd]);

  useEffect(() => {
    if (selectedStructureId && periodStart && periodEnd) {
      loadEmployeesForStructure();
      loadStructureComponents();
    } else if (selectedStructureId) {
      setEmployeePayrollData([]);
      loadStructureComponents();
    } else {
      setEmployeePayrollData([]);
      setStructureComponents([]);
      setEditableComponents([]);
    }
  }, [selectedStructureId, periodStart, periodEnd, absenteeRecords]);

  /**
   * Fetch component values from payroll.salary_components or payroll.deduction_components
   * for at_executing type components
   *
   * Logic:
   * 1. Primary: Find records where current_date falls within period_start and period_end
   * 2. Fallback: If no exact match, use the record with the maximum period_start
   */
  const fetchAtExecutingValues = async (
    employeeId: string,
    componentIds: string[],
    currentDate: string
  ): Promise<Record<string, number>> => {
    try {
      if (componentIds.length === 0) return {};

      const auth = await validateAuth();
      if (!auth.isAuthenticated || !auth.tenantId) return {};

      const values: Record<string, number> = {};

      // Fetch from both salary_components and deduction_components tables
      const { data: salaryComponents } = await supabase
        .from('salary_components')
        .select('component_id, amount, period_start, period_end')
        .eq('employee_id', employeeId)
        .in('component_id', componentIds)
        .eq('tenant_id', auth.tenantId)
        .order('period_start', { ascending: false });

      const { data: deductionComponents } = await supabase
        .from('deduction_components')
        .select('component_id, amount, period_start, period_end')
        .eq('employee_id', employeeId)
        .in('component_id', componentIds)
        .eq('tenant_id', auth.tenantId)
        .order('period_start', { ascending: false });

      const allComponents = [...(salaryComponents || []), ...(deductionComponents || [])];

      // Process each component to find the appropriate value
      componentIds.forEach(componentId => {
        const componentRecords = allComponents.filter(c => c.component_id === componentId);

        if (componentRecords.length === 0) return;

        // Try to find record where currentDate falls within period
        const exactMatch = componentRecords.find(
          c => c.period_start <= currentDate && c.period_end >= currentDate
        );

        if (exactMatch) {
          values[componentId] = exactMatch.amount;
        } else {
          // Fallback: use record with maximum period_start
          const latestRecord = componentRecords[0]; // Already sorted by period_start desc
          values[componentId] = latestRecord.amount;
        }
      });

      return values;
    } catch (err) {
      console.error('Error fetching at_executing values:', err);
      return {};
    }
  };

  /**
   * Fetch component values from payroll_structure_components table
   * for at_structure type components
   */
  const fetchAtStructureValues = async (
    structureId: string,
    componentIds: string[]
  ): Promise<Record<string, number>> => {
    try {
      if (componentIds.length === 0) return {};

      const auth = await validateAuth();
      if (!auth.isAuthenticated || !auth.tenantId) return {};

      const { data: structureComponents } = await supabase
        .from('payroll_structure_components')
        .select('component_id, amount, percentage')
        .eq('structure_id', structureId)
        .in('component_id', componentIds)
        .eq('tenant_id', auth.tenantId);

      const values: Record<string, number> = {};

      (structureComponents || []).forEach(comp => {
        // Use amount if available, otherwise percentage
        values[comp.component_id] = comp.amount || comp.percentage || 0;
      });

      return values;
    } catch (err) {
      console.error('Error fetching at_structure values:', err);
      return {};
    }
  };

  /**
   * NEW: Fetch common component values (structure-level defaults)
   * These are stored in employee_salary_structure_assignments with employee_id = NULL
   * Common components apply to all employees in the structure
   */
  const fetchCommonComponentValues = async (
    structureId: string,
    componentIds: string[]
  ): Promise<Record<string, number>> => {
    try {
      if (componentIds.length === 0) return {};

      const auth = await validateAuth();
      if (!auth.isAuthenticated || !auth.tenantId) return {};

      // Fetch common component values where employee_id IS NULL
      const { data: assignment } = await supabase
        .from('employee_salary_structure_assignments')
        .select('individual_component_values')
        .eq('salary_structure_id', structureId)
        .eq('tenant_id', auth.tenantId)
        .is('employee_id', null) // Critical: NULL indicates common/structure-level values
        .maybeSingle();

      if (!assignment || !assignment.individual_component_values) return {};

      const commonValues = assignment.individual_component_values as Record<string, number>;
      const values: Record<string, number> = {};

      // Extract values for the requested component IDs
      componentIds.forEach(id => {
        if (commonValues[id] !== undefined) {
          values[id] = commonValues[id];
        }
      });

      return values;
    } catch (err) {
      console.error('Error fetching common component values:', err);
      return {};
    }
  };

  /**
   * Fetch component values from employee_salary_structure_assignments.individual_component_values
   * for master_entry type components
   *
   * UPDATED: Now uses component IDs instead of names
   * Returns a map of component IDs to their values
   */
  const fetchMasterEntryValues = async (
    employeeSalaryStructureId: string,
    componentIds: string[]
  ): Promise<Record<string, number>> => {
    try {
      if (componentIds.length === 0) return {};

      const auth = await validateAuth();
      if (!auth.isAuthenticated || !auth.tenantId) return {};

      const { data: assignment } = await supabase
        .from('employee_salary_structure_assignments')
        .select('individual_component_values')
        .eq('id', employeeSalaryStructureId)
        .eq('tenant_id', auth.tenantId)
        .maybeSingle();

      if (!assignment || !assignment.individual_component_values) return {};

      const individualValues = assignment.individual_component_values as Record<string, number>;
      const values: Record<string, number> = {};

      // UPDATED: Use component IDs instead of names
      componentIds.forEach(id => {
        if (individualValues[id] !== undefined) {
          values[id] = individualValues[id];
        }
      });

      return values;
    } catch (err) {
      console.error('Error fetching master_entry values:', err);
      return {};
    }
  };

  const fetchTravelAllowanceForEmployee = async (employeeId: string, startDate: string, endDate: string): Promise<number> => {
    try {
      if (!startDate || !endDate) return 0;
      const auth = await validateAuth();
      if (!auth.isAuthenticated || !auth.tenantId) return 0;

      const { data, error } = await supabase
        .from('work_locations')
        .select('work_amount')
        .eq('employee_id', employeeId)
        .eq('tenant_id', auth.tenantId)
        .eq('status', 'approved')
        .gte('assignment_date', startDate)
        .lte('assignment_date', endDate)
        .not('work_amount', 'is', null);

      if (error) return 0;
      return data?.reduce((sum, row) => sum + (Number(row.work_amount) || 0), 0) || 0;
    } catch {
      return 0;
    }
  };

  /**
   * Load structure components and filter for UI display based on value_set and is_locked
   *
   * Display Rules:
   * - at_executing: Show in UI (editable)
   * - at_structure with is_locked=false: Show in UI (editable)
   * - at_structure with is_locked=true: HIDE from UI
   * - master_entry: HIDE from UI
   */
  const loadStructureComponents = async () => {
    try {
      if (!selectedStructureId) return;
      const details = await fetchSalaryStructureDetails(selectedStructureId);
      if (details && details.length > 0) {
        let components = details[0].components || [];

        // NEW: Dynamically inject Travel Allowance component if not present
        // if (!components.some((c: any) => c.name.toLowerCase() === 'travel allowance')) {
        //   components = [
        //     ...components,
        //     {
        //        id: 'dynamic_ta_component',
        //        name: 'Travel Allowance',
        //        component_type: 'earning',
        //        amount_type: 'value',
        //        value_set: 'at_executing',
        //        is_locked: false,
        //        calculation_type: 'flat',
        //        is_applied_in_calculation: true,
        //        is_attendance_linked: false,
        //     } as any
        //   ];
        // }

        setStructureComponents(components);

        // Filter components for UI display based on value_set and is_locked
        const editable = components.filter(c => {
          // Rule 1: at_executing components are always shown
          if (c.value_set === 'at_executing') return true;

          // Rule 2: at_structure components shown only if not locked
          if (c.value_set === 'at_structure' && !c.is_locked) return true;

          // Rule 3: master_entry components are never shown (handled via individual_component_values)
          // Rule 4: at_structure with is_locked=true are never shown
          return false;
        });

        setEditableComponents(editable);
      }
    } catch (err) {
      console.error('Error loading structure components:', err);
    }
  };

  /**
   * ✅ CHANGE #2: Load employees from employee_salary_structure_assignments table
   * Filters employees by selected salary structure using the assignments table
   *
   * ✅ CHANGE #4: Retrieve individual component values from assignments table
   * For components where type_selection = 'individual', values come from
   * employee_salary_structure_assignments.individual_component_values
   */
  const loadEmployeesForStructure = async () => {
    try {
      setLoading(true);
      setError(null);

      const auth = await validateAuth();
      if (!auth.isAuthenticated || !auth.tenantId) {
        setError('Authentication required');
        return;
      }

      // Fetch dynamic Travel Allowance configuration to avoid React state race conditions
      const { data: locSettings } = await supabase
        .from('location_settings')
        .select('field_work_integration_enabled, field_work_component_id')
        .eq('tenant_id', auth.tenantId)
        .maybeSingle();

      let activeTravelAllowanceComponentName = 'Travel Allowance';
      let activeIsTravelAllowanceEnabled = false;

      if (locSettings?.field_work_integration_enabled && locSettings?.field_work_component_id) {
        const { data: compData } = await supabase
          .from('payroll_components')
          .select('name')
          .eq('id', locSettings.field_work_component_id)
          .eq('tenant_id', auth.tenantId)
          .maybeSingle();

        if (compData?.name) {
          activeTravelAllowanceComponentName = compData.name;
          activeIsTravelAllowanceEnabled = true;
        }
      }

      // Sync leave balances for the selected year before processing
      const syncYear = periodStart ? new Date(periodStart).getFullYear() : new Date().getFullYear();
      try {
        await syncAllLeaveBalances(syncYear);
      } catch (e) {
        console.error('Leave sync failed before payroll:', e);
      }

      // ✅ NEW: Use employee_salary_structure_assignments table instead of employee_salary_structures
      // This table stores the current salary structure assignment for each employee
      // along with individual component values
      // const { data: assignmentsData, error: fetchError } = await supabase
      //   .from('employee_salary_structure_assignments')
      //   .select(`
      //     id,
      //     employee_id,
      //     salary_structure_id,
      //     individual_component_values,
      //     employees:employee_id (
      //       employee_code,
      //       name,
      //       email,
      //       department,
      //       role
      //     )
      //   `)
      //   .eq('salary_structure_id', selectedStructureId)
      //   .eq('tenant_id', auth.tenantId)
      //   .order('employees(employee_code)', { ascending: true });

      const { data: assignmentsData, error: fetchError } = await supabase.rpc('get_salary_structure_assignments',
        {
          p_tenant_id: auth.tenantId,
          p_salary_structure_id: selectedStructureId
        }
      );

      if (fetchError) throw fetchError;

      // FETCH OT STATUS IF LINKED
      let pendingOTMap: Record<string, boolean> = {};
      if (otLinked && periodStart && periodEnd) {
        const { data: otData } = await supabase
          .from('ot_approvals')
          .select('employee_id, approval_status')
          .eq('tenant_id', auth.tenantId)
          .gte('attendance_date', periodStart)
          .lte('attendance_date', periodEnd);

        if (otData) {
          otData.forEach(ot => {
            if (ot.approval_status === 'pending') {
              pendingOTMap[ot.employee_id] = true;
            }
          });
        }
      }

      // Fetch employee status information for filtering
      const employeeIdsFromAssignments = (assignmentsData || [])
        .map(item => item.employee_id)
        .filter(Boolean);

      let employeeStatusMap: Record<string, { status: string; status_date?: string }> = {};

      if (employeeIdsFromAssignments.length > 0) {
        const { data: employeeData } = await supabase
          .from('employees')
          .select('id, status, status_date')
          .in('id', employeeIdsFromAssignments)
          .eq('tenant_id', auth.tenantId);

        if (employeeData) {
          employeeData.forEach(emp => {
            employeeStatusMap[emp.id] = {
              status: emp.status,
              status_date: emp.status_date
            };
          });
        }
      }

      // Format the assignments data
      const formattedAssignments = (assignmentsData || []).map(item => ({
        id: item.id,
        employee_id: item.employee_id,
        salary_structure_id: item.salary_structure_id,
        individual_component_values: item.individual_component_values || {},
        // employee: Array.isArray(item.employees) ? item.employees[0] : item.employees

        employee: item.employee_id
          ? {
            employee_code: item.employee_code,
            name: item.employee_name,
            email: item.employee_email,
            department: item.department,
            role: item.role,
          }
          : null

      }));

      // Filter employees based on status and period end date
      const filteredAssignments = formattedAssignments.filter(assignment => {
        if (!assignment.employee_id) return true; // Keep null employee_id assignments

        const employeeStatus = employeeStatusMap[assignment.employee_id];
        if (!employeeStatus) return true; // Include if status info not found (failsafe)

        // Check for restricted statuses
        const restrictedStatuses = ['relieved', 'suspended', 'terminated'];
        const status = employeeStatus.status?.toLowerCase();

        // If employee doesn't have a restricted status, they're eligible
        if (!restrictedStatuses.includes(status)) {
          return true;
        }

        // If employee has restricted status but no status_date, include them (failsafe)
        if (!employeeStatus.status_date || !periodEnd) {
          return true;
        }

        const statusDate = new Date(employeeStatus.status_date);
        statusDate.setHours(0, 0, 0, 0);

        const periodStartDate = new Date(periodStart);
        periodStartDate.setHours(0, 0, 0, 0);

        // Employee is eligible if their status date is after the period start date
        return statusDate > periodStartDate;
      });

      const employeeIds = filteredAssignments.map(e => e.employee_id);
      let payrollMap: Record<string, any> = {};

      // 1. Fetch Existing Payrolls
      if (periodStart && periodEnd && employeeIds.length > 0) {
        const { data: payrollData } = await supabase
          .from('payroll')
          .select('id, employee_id, status, total_amount, payment_date, salary_components')
          .in('employee_id', employeeIds)
          .eq('period_start', periodStart)
          .eq('period_end', periodEnd);

        if (payrollData) {
          payrollData.forEach(p => payrollMap[p.employee_id] = p);
        }
      }

      // 2. Fetch Pending Leave Requests for these employees in this period
      let pendingLeavesMap: Record<string, string[]> = {};
      if (periodStart && periodEnd && employeeIds.length > 0) {
        const { data: leaves } = await supabase
          .from('leave_requests')
          .select('employee_id, start_date, end_date')
          .in('employee_id', employeeIds)
          .eq('tenant_id', auth.tenantId)
          .in('status', ['Pending', 'pending']) // Handle case sensitivity
          .lte('start_date', periodEnd)  // Overlap check: Start <= PeriodEnd
          .gte('end_date', periodStart); // Overlap check: End >= PeriodStart

        if (leaves) {
          leaves.forEach(leave => {
            if (!pendingLeavesMap[leave.employee_id]) {
              pendingLeavesMap[leave.employee_id] = [];
            }
            const dateStr = leave.start_date === leave.end_date
              ? leave.start_date
              : `${leave.start_date} to ${leave.end_date}`;
            pendingLeavesMap[leave.employee_id].push(dateStr);
          });
        }
      }

      // NEW: Fetch common component values once for the entire structure
      // These values apply to all employees and are stored with employee_id = NULL
      // Common components are those with type_selection='common' and value_set='master_entry'
      const commonMasterEntryComponents = structureComponents.filter(
        c => c.type_selection === 'common' && c.value_set === 'master_entry'
      );

      let commonComponentValues: Record<string, number> = {};

      if (commonMasterEntryComponents.length > 0) {
        const commonComponentIds = commonMasterEntryComponents.map(c => c.id).filter(Boolean) as string[];
        commonComponentValues = await fetchCommonComponentValues(
          selectedStructureId,
          commonComponentIds
        );
      }

      const payrollData: EmployeePayrollData[] = await Promise.all(
        filteredAssignments.map(async (assignment) => {
          let editableComponentsData: Record<string, number> = {};

          const existingPayroll = payrollMap[assignment.employee_id];
          const status = existingPayroll?.status || 'Pending';

          let blockingReason: string | null = null;

          if (status !== 'Paid') {
            // Priority 1: Check Unauthorized Absences
            const employeeAbsences = absenteeRecords.filter(r => r.employee_id === assignment.employee_id);

            if (employeeAbsences.length > 0) {
              const dates = employeeAbsences.map(a => a.absent_date.slice(8)).join(', '); // MM-DD
              blockingReason = `Unauthorized Absences: ${employeeAbsences.length} days (${dates})`;
            }
            // Priority 2: Check Pending OT (if no unauthorized absences & OT is linked)
            else if (otLinked && pendingOTMap[assignment.employee_id]) {
              blockingReason = 'Select employee OT pending, please approve it.';
            }
            // Priority 3: Check Pending Leaves (if no other blocks)
            else if (pendingLeavesMap[assignment.employee_id]) {
              const dates = pendingLeavesMap[assignment.employee_id].join(', ');
              blockingReason = `Pending Leave Request: (${dates})`;
            }

            // Load component values with priority order:
            // 1. Draft values (highest priority - user is actively editing)
            // 2. Values fetched based on value_set property:
            //    - at_executing: From payroll.salary_components/deduction_components
            //    - at_structure: From payroll_structure_components
            //    - master_entry: From employee_salary_structure_assignments.individual_component_values
            //      * Common components (type_selection='common'): From structure-level assignment (employee_id=NULL)
            //      * Individual components (type_selection='individual'): From employee-specific assignment
            // 3. Existing payroll values (for re-editing)

            // First, load draft values
            const draftData = await loadDraftFromDatabase(assignment.employee_id);

            if (draftData && Object.keys(draftData).length > 0) {
              // User has draft data - use it as base
              editableComponentsData = draftData;
            } else {
              // No draft - fetch values based on value_set property

              // Group editable components by value_set
              const atExecutingComponents = editableComponents.filter(c => c.value_set === 'at_executing');
              const atStructureComponents = editableComponents.filter(
                c => c.value_set === 'at_structure' && !c.is_locked
              );
              const masterEntryComponents = editableComponents.filter(c => c.value_set === 'master_entry');

              // Fetch at_executing values
              if (atExecutingComponents.length > 0) {
                const componentIds = atExecutingComponents.map(c => c.id).filter(Boolean) as string[];
                const atExecutingValues = await fetchAtExecutingValues(
                  assignment.employee_id,
                  componentIds,
                  periodStart
                );

                // Map component IDs to names
                atExecutingComponents.forEach(comp => {
                  if (comp.id && atExecutingValues[comp.id] !== undefined) {
                    editableComponentsData[comp.name] = atExecutingValues[comp.id];
                  }
                });
              }

              // Fetch at_structure values
              if (atStructureComponents.length > 0) {
                const componentIds = atStructureComponents.map(c => c.id).filter(Boolean) as string[];
                const atStructureValues = await fetchAtStructureValues(
                  selectedStructureId,
                  componentIds
                );

                // Map component IDs to names
                atStructureComponents.forEach(comp => {
                  if (comp.id && atStructureValues[comp.id] !== undefined) {
                    editableComponentsData[comp.name] = atStructureValues[comp.id];
                  }
                });
              }

              // NEW: Apply common component values first (structure-level defaults)
              // These are applied to ALL employees in the structure
              if (commonMasterEntryComponents.length > 0) {
                commonMasterEntryComponents.forEach(comp => {
                  if (comp.id && commonComponentValues[comp.id] !== undefined) {
                    editableComponentsData[comp.name] = commonComponentValues[comp.id];
                  }
                });
              }

              // Fetch master_entry values for individual components
              // UPDATED: Filter to only get 'individual' type components
              // Individual values override common values if both exist
              const individualMasterEntryComponents = masterEntryComponents.filter(
                c => c.type_selection === 'individual'
              );

              if (individualMasterEntryComponents.length > 0) {
                const componentIds = individualMasterEntryComponents.map(c => c.id).filter(Boolean) as string[];
                const masterEntryValues = await fetchMasterEntryValues(
                  assignment.id,
                  componentIds
                );

                // Map component IDs to names for UI display
                // These individual values will override any common values set above
                individualMasterEntryComponents.forEach(comp => {
                  if (comp.id && masterEntryValues[comp.id] !== undefined) {
                    editableComponentsData[comp.name] = masterEntryValues[comp.id];
                  }
                });
              }

              // Also check existing payroll for any missing values
              if (existingPayroll?.salary_components) {
                try {
                  const components = existingPayroll.salary_components;
                  components.forEach((comp: any) => {
                    // Only use if not already set
                    if (comp.amount !== undefined && editableComponentsData[comp.name] === undefined) {
                      editableComponentsData[comp.name] = comp.amount;
                    }
                  });
                } catch (e) { console.error(e); }
              }
            }

            // ALWAYS apply travel allowance AFTER draft/fresh data.
            // This ensures that even if a draft was loaded with a stale component name key
            // (e.g. 'Travel Allowance' when component is now named 'Petrol Allowance'),
            // the value is always correctly stored under the CURRENT component name (by ID).
            if (activeIsTravelAllowanceEnabled) {
              const travelAllowanceSum = await fetchTravelAllowanceForEmployee(
                assignment.employee_id,
                periodStart,
                periodEnd
              );
              if (travelAllowanceSum > 0) {
                editableComponentsData[activeTravelAllowanceComponentName] = travelAllowanceSum;
              }
            }
          }

          return {
            employeeSalaryStructureId: assignment.id,
            employee_id: assignment.employee_id,
            employee_code: assignment.employee?.employee_code || '',
            employee_name: `${assignment.employee?.name || assignment.employee?.name || ''}`.trim(),
            designation: assignment.employee?.role || assignment.employee?.department || '',
            selected: false,
            editableComponents: editableComponentsData,
            payrollStatus: status,
            existingPayrollId: existingPayroll?.id,
            netSalary: existingPayroll?.total_amount,
            paymentDate: existingPayroll?.payment_date,
            blockingReason: blockingReason
          };
        })
      );

      setEmployeePayrollData(payrollData);
    } catch (err) {
      console.error('Error loading employees:', err);
      setError(err instanceof Error ? err.message : 'Failed to load employees');
    } finally {
      setLoading(false);
    }
  };

  // --- FILTERS ---
  const employeesToProcess = employeePayrollData.filter(e => e.payrollStatus !== 'Paid');
  const paidEmployees = employeePayrollData.filter(e => e.payrollStatus === 'Paid');

  const filteredEmployeesToProcess = employeesToProcess.filter(e =>
    e.employee_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.employee_code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredPaidEmployees = paidEmployees.filter(e =>
    e.employee_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.employee_code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // --- Select All Logic (Respects Blocking) ---
  const handleSelectAll = () => {
    const newSelectAll = !selectAll;
    setSelectAll(newSelectAll);

    const visibleIds = (viewMode === 'process' ? filteredEmployeesToProcess : filteredPaidEmployees).map(e => e.employee_id);

    setEmployeePayrollData(prev =>
      prev.map(emp => {
        if (visibleIds.includes(emp.employee_id)) {
          // Prevent selection if there is a blocking reason
          if (emp.blockingReason && viewMode === 'process') {
            return { ...emp, selected: false };
          }
          return { ...emp, selected: newSelectAll };
        }
        return emp;
      })
    );
  };

  const handleSelectEmployee = (employeeId: string) => {
    setEmployeePayrollData(prev =>
      prev.map(emp =>
        emp.employee_id === employeeId ? { ...emp, selected: !emp.selected } : emp
      )
    );
  };

  // ... [Rest of the file remains exactly the same: SaveDraft, Process, Reprocess, Modals] ...

  const saveDraftToDatabase = useCallback(async (employeeId: string, componentValues: Record<string, number>) => {
    try {
      if (!periodStart || !periodEnd || !selectedStructureId) return;
      const auth = await validateAuth();
      if (!auth.isAuthenticated || !auth.userId || !auth.tenantId) return;
      setSavingDraft(true);
      const { error } = await supabase.from('payroll_drafts').upsert({
        employee_id: employeeId,
        structure_id: selectedStructureId,
        period_start: periodStart,
        period_end: periodEnd,
        component_values: componentValues,
        tenant_id: auth.tenantId,
        created_by: auth.userId,
        last_modified_by: auth.userId
      }, { onConflict: 'employee_id,structure_id,period_start,period_end,tenant_id' });
      if (error) console.error('Error saving draft:', error);
      else setLastSaved(new Date());
    } catch (err) { console.error('Failed to save draft:', err); }
    finally { setSavingDraft(false); }
  }, [periodStart, periodEnd, selectedStructureId]);

  const debouncedSaveDraft = useCallback((employeeId: string, componentValues: Record<string, number>) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveDraftToDatabase(employeeId, componentValues);
    }, 1000);
  }, [saveDraftToDatabase]);

  const loadDraftFromDatabase = useCallback(async (employeeId: string): Promise<Record<string, number>> => {
    try {
      if (!periodStart || !periodEnd || !selectedStructureId) return {};
      const auth = await validateAuth();
      if (!auth.isAuthenticated || !auth.tenantId) return {};
      const { data } = await supabase.from('payroll_drafts')
        .select('component_values')
        .eq('employee_id', employeeId)
        .eq('structure_id', selectedStructureId)
        .eq('period_start', periodStart)
        .eq('period_end', periodEnd)
        .eq('tenant_id', auth.tenantId)
        .maybeSingle();
      return data?.component_values || {};
    } catch (err) { return {}; }
  }, [periodStart, periodEnd, selectedStructureId]);

  const handleComponentValueChange = (employeeId: string, componentName: string, value: number) => {
    setEmployeePayrollData(prev =>
      prev.map(emp => {
        if (emp.employee_id === employeeId) {
          const updatedComponents = { ...emp.editableComponents, [componentName]: value };
          debouncedSaveDraft(employeeId, updatedComponents);
          return { ...emp, editableComponents: updatedComponents };
        }
        return emp;
      })
    );
  };

  /**
   * Collects attendance data and performs time evaluation for an employee
   * Integrates with the time evaluation system to generate comprehensive metrics
   */
  const performTimeEvaluation = async (
    employeeId: string,
    startDate: string,
    endDate: string,
    period: string,
    tenantId: string
  ): Promise<void> => {
    try {
      // Step 1: Collect attendance data from attendance_logs table
      const { data: attendanceData, error: attendanceError } = await supabase
        .from('attendance_logs')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('employee_id', employeeId)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true });

      if (attendanceError) {
        console.error('Error fetching attendance data:', attendanceError);
        return;
      }

      // Step 2: Collect leave data from leave_requests table
      const { data: leaveData, error: leaveError } = await supabase
        .from('leave_requests')
        .select(`
          *,
          leave_type:leave_types(name, is_paid)
        `)
        .eq('employee_id', employeeId)
        .eq('tenant_id', tenantId)
        .eq('status', 'Approved')
        .lte('start_date', endDate)
        .gte('end_date', startDate);

      if (leaveError) {
        console.error('Error fetching leave data:', leaveError);
      }

      // Step 3: Collect gate pass data from gate_passes table
      const { data: gatePassData, error: gatePassError } = await supabase
        .from('gate_pass_requests')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('employee_id', employeeId)
        .eq('status', 'Approved')
        .gte('start_date', startDate)
        .lte('end_date', endDate);

      if (gatePassError) {
        console.error('Error fetching gate pass data:', gatePassError);
      }

      // Step 4: Collect weekly off data
      const { data: weeklyOffData, error: weeklyOffError } = await supabase.rpc('get_weekly_off_list', {
        p_start_date: startDate,
        p_end_date: endDate,
        p_tenant_id: tenantId,
      });

      if (weeklyOffError) {
        console.error('Error fetching weekly off data:', weeklyOffError);
      }

      // Step 5: Collect holiday data
      const { data: holidayData, error: holidayError } = await supabase.rpc('get_holiday_list', {
        p_start_date: startDate,
        p_end_date: endDate,
        p_tenant_id: tenantId,
      });

      if (holidayError) {
        console.error('Error fetching holiday data:', holidayError);
      }

      // Step 6: Get employee's pay days configuration
      // const { data: payDaysConfig } = await supabase
      //   .from('employee_salary_structure_assignments')
      //   .select('custom_pay_days')
      //   .eq('employee_id', employeeId)
      //   .maybeSingle();

      const { data: payDaysConfig, error } = await supabase.rpc('get_default_paydays_for_employee', {
        p_tenant_id: tenantId,
        p_employee_id: employeeId
      });
      if (error) console.error(error);

      // Calculate calendar days
      // const start = new Date(startDate);
      // const end = new Date(endDate);

      const refDate = new Date(startDate);

      // Month start (1st), Month end (last day)
      const monthStart = new Date(refDate.getFullYear(), refDate.getMonth(), 1);
      const monthEnd = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0);

      const calendarDays = Math.floor((monthEnd.getTime() - monthStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const payDays = payDaysConfig[0]?.custom_pay_days || calendarDays;

      // Step 7: Format data into AttendanceData JSON structure
      const attendance: AttendanceEntry[] = [];
      const currentDate = new Date(startDate);
      const endDateObj = new Date(endDate);

      while (currentDate <= endDateObj) {
        const dateStr = currentDate.toISOString().split('T')[0];

        // Check if it's a weekly off
        const isWeeklyOff = weeklyOffData?.some((w: any) => w.date === dateStr);

        // Check if it's a holiday
        const isHoliday = holidayData?.some((h: any) => h.date === dateStr);

        if (isWeeklyOff) {
          attendance.push({ date: dateStr, status: 'WeekOff' });
        } else if (isHoliday) {
          attendance.push({ date: dateStr, status: 'PaidHoliday' });
        } else {
          // Check attendance record
          const attendanceRecord = attendanceData?.find((a: any) => a.date === dateStr);

          // Check leave record
          const leaveRecord = leaveData?.find((l: any) => {
            const leaveStart = new Date(l.start_date);
            const leaveEnd = new Date(l.end_date);
            return currentDate >= leaveStart && currentDate <= leaveEnd;
          });

          // Check gate pass
          const gatePass = gatePassData?.find((g: any) => g.date === dateStr);


          if (attendanceRecord) {
            const entry: any = {
              date: dateStr,
              status: attendanceRecord.status === 'Present' ? 'Present' :
                (attendanceRecord.status === 'Half Day' || attendanceRecord.status === 'First Off' || attendanceRecord.status === 'Second Off') ? 'HalfDay' :
                  attendanceRecord.status === 'Late' ? 'Late' : 
                    attendanceRecord.status === 'Early Exit' ? 'Early Exit' :
                      attendanceRecord.status === 'Permission' ? 'Permission' : 'Absent'
            };

            if (attendanceRecord.shift_id) {
              // Get shift name from shift_id
              const { data: shiftData } = await supabase
                .from('shifts')
                .select('name')
                .eq('tenant_id', tenantId)
                .eq('id', attendanceRecord.shift_id)
                .maybeSingle();
              if (shiftData?.name) {
                entry.shift = shiftData.name;
              }
            }

            if (gatePass) {
              entry.gatePass = {
                type: gatePass.pass_type === 'on_duty' ? 'OnDuty' : 'Permission',
                duration: gatePass.duration || '0 mins'
              };
            }

            // Handle half day details
            if (entry.status === 'HalfDay' && leaveRecord) {
              entry.details = {
                firstHalf: 'Absent',
                secondHalf: leaveRecord.leave_type?.name || 'CL',
                shift: entry.shift
              };
            }

            attendance.push(entry);
          } else if (leaveRecord) {
            // Only leave, no attendance record
            attendance.push({
              date: dateStr,
              status: 'Absent',
              leave: leaveRecord.leave_type?.name || 'CL'
            });
          } else {
            // No attendance, no leave - mark as Present (default)
            attendance.push({ date: dateStr, status: 'Present' });
          }
        }

        currentDate.setDate(currentDate.getDate() + 1);
      }

      // Step 8: Build rules based on company settings and leave types
      const { data: leaveTypes } = await supabase
        .from('leave_types')
        .select('name, is_paid')
        .eq('tenant_id', tenantId)
        .eq('is_active', true);

      const paidLeaves = leaveTypes?.filter((lt: any) => lt.is_paid).map((lt: any) => lt.name) || ['CL', 'SL'];
      const unpaidLeaves = leaveTypes?.filter((lt: any) => !lt.is_paid).map((lt: any) => lt.name) || ['LOP'];

      const attendanceDataForEvaluation: AttendanceData = {
        period,
        calendarDays,
        payDays,
        attendance,
        rules: {
          halfDayValue: 0.5,
          paidLeaves,
          unpaidLeaves,
          weekOffPaid: true,
          paidHolidayPaid: true,
          payableDaysFormula: 'Present + PaidLeave + PaidHoliday'
        }
      };

      // Step 9: Call evaluateTimeData() to generate metrics
      const timeWageTypes = evaluateTimeData(attendanceDataForEvaluation);

      // Step 10: Store results using storeTimeEvaluation()
      await storeTimeEvaluation(employeeId, period, timeWageTypes);

    } catch (error) {
      console.error('Error in time evaluation:', error);
    }
  };

  const calculateComponentAmount = useCallback((
    component: SalaryStructureComponent,
    allComponents: SalaryStructureComponent[],
    executionContext?: ExecutionContext
  ): number => {
    let resultValue = 0;

    // Handle expression-based components
    // CHANGED: Use calculation_type instead of amount_type to identify expression components
    if (component.calculation_type === 'expression' && component.expression_ast && executionContext) {
      try {
        const result = FormulaEngine.executeAST(component.expression_ast, executionContext);
        if (result.success && typeof result.value === 'number') {
          resultValue = result.value;
        } else {
          console.error(`Expression evaluation failed for ${component.name}:`, result.error);
          resultValue = 0;
        }
      } catch (error) {
        console.error(`Error evaluating expression for ${component.name}:`, error);
        resultValue = 0;
      }
    } else if (component.amount_type === 'percentage' && component.percentage_value && component.reference_components?.length) {
      // Handle percentage-based components
      const baseAmount = component.reference_components.reduce((total, ref) => {
        const refComponent = allComponents.find((c) => c.name === ref);
        return total + (refComponent ? refComponent.amount || 0 : 0);
      }, 0);
      resultValue = (baseAmount * parseFloat(component.percentage_value.toString())) / 100;
    } else if (component.amount_type !== 'percentage') {
      // Handle value-based components
      resultValue = component.amount || 0;
    }

    // Apply Rounding Logic based on component configuration
    if (!component.rounding_type || component.rounding_type === 'none') return resultValue;

    switch (component.rounding_type) {
      case 'round':
      case 'standard': // Keep for backward compatibility if any rows still have it
        return Math.round(resultValue);
      case 'floor':
        return Math.floor(resultValue);
      case 'ceil':
        return Math.ceil(resultValue);
      case 'decimal2':
        return Math.round(resultValue * 100) / 100;
      default:
        return resultValue;
    }
  }, []);

  const calculateTotal = useCallback((
    components: SalaryStructureComponent[],
    allComponents: SalaryStructureComponent[],
    executionContext?: ExecutionContext
  ): number => {
    return components.reduce((sum, comp) => sum + calculateComponentAmount(comp, allComponents, executionContext), 0);
  }, [calculateComponentAmount]);

  const fetchStatutoryDeductions = async (
    employeeId: string,
    tenantId: string,
    deductionComponents: SalaryStructureComponent[],
    allComponents: SalaryStructureComponent[]
    //basicSalary: number
  ): Promise<SalaryStructureComponent[]> => {
    const statutoryDeductions: SalaryStructureComponent[] = [];

    for (const component of deductionComponents) {
      if (!component.id) continue;

      try {
        const { data: config, error: configError } = await supabase
          .from('statutory_configurations')
          .select('*')
          .eq('payroll_component_id', component.id)
          .eq('tenant_id', tenantId)
          .maybeSingle();

        if (configError || !config) continue;

        let deductionValue: number | null = null;

        if (config.global_value !== null && config.global_value !== undefined) {
          const { data: employeeStatutoryIds, error: idsError } = await supabase
            .from('employee_statutory_ids')
            .select('pf_number, esi_number, tds_id, professional_tax_id')
            .eq('employee_id', employeeId)
            .eq('tenant_id', tenantId)
            .maybeSingle();

          if (idsError || !employeeStatutoryIds) continue;

          let hasRequiredId = false;
          switch (config.statutory_element) {
            case 'provident_fund':
              hasRequiredId = !!employeeStatutoryIds.pf_number;
              break;
            case 'employee_state_insurance':
              hasRequiredId = !!employeeStatutoryIds.esi_number;
              break;
            case 'tax_deducted_at_source':
              hasRequiredId = !!employeeStatutoryIds.tds_id;
              break;
            case 'professional_tax':
              hasRequiredId = !!employeeStatutoryIds.professional_tax_id;
              break;
          }

          if (!hasRequiredId) continue;

          if (config.calculation_method === 'percentage') {
            // deductionValue = (basicSalary * parseFloat(config.global_value.toString())) / 100;

            const referenceIds: string[] = config.referance_component_ids || [];
            const baseAmount = allComponents.filter(comp => referenceIds.includes(comp.id || ''))
              .reduce((sum, comp) => sum + (comp.amount || 0), 0);

            deductionValue = (baseAmount * parseFloat(config.global_value.toString())) / 100;

          } else {
            deductionValue = parseFloat(config.global_value.toString());
          }
        } else {
          const { data: employeeValue, error: valueError } = await supabase
            .from('employee_statutory_values')
            .select('value')
            .eq('employee_id', employeeId)
            .eq('configuration_id', config.id)
            .eq('tenant_id', tenantId)
            .maybeSingle();

          if (valueError || !employeeValue) continue;

          if (config.calculation_method === 'percentage') {
            // deductionValue = (basicSalary * parseFloat(employeeValue.value.toString())) / 100;

            const referenceIds: string[] = config.referance_component_ids || [];
            const baseAmount = allComponents.filter(comp => referenceIds.includes(comp.id || ''))
              .reduce((sum, comp) => sum + (comp.amount || 0), 0);

            deductionValue = (baseAmount * parseFloat(employeeValue.value.toString())) / 100;
          } else {
            deductionValue = parseFloat(employeeValue.value.toString());
          }
        }

        if (deductionValue !== null && deductionValue > 0) {
          statutoryDeductions.push({
            ...component,
            amount: deductionValue,
            component_type: 'deduction',
            amount_type: 'value'
          });
        }
      } catch (err) {
        console.error(`Error processing statutory deduction for component ${component.name}:`, err);
      }
    }

    return statutoryDeductions;
  };


  const processPayroll = async () => {
    try {
      setProcessing(true);
      setError(null);
      setSuccess(null);
      setProgress(0);

      if (!periodStart || !periodEnd) { setError('Please select payroll period'); return; }
      if (!selectedStructureId) { setError('Please select a salary structure'); return; }

      const selectedEmployees = employeesToProcess.filter(emp => emp.selected && !emp.blockingReason);

      if (selectedEmployees.length === 0) {
        setError('Please select at least one eligible employee. Employees with unauthorized absences or pending leaves cannot be processed.');
        return;
      }

      const auth = await validateAuth();
      if (!auth.isAuthenticated || !auth.userId || !auth.tenantId) {
        setError('Authentication required');
        setProcessing(false);
        return;
      }

      // Initialize individual progress tasks
      const initialTasks: EmployeeProgressTask[] = selectedEmployees.map(emp => ({
        id: emp.employee_id,
        name: emp.employee_name,
        progress: 0,
        status: 'pending'
      }));
      setProcessingTasks(initialTasks);

      let processedCount = 0;
      let errorCount = 0;
      const errors: string[] = [];
      const totalToProcess = selectedEmployees.length;
      const allOTBatchData: any[] = [];
      let activeOTStructureId: string | null = null;

      const updateTask = (employeeId: string, progressValue: number, detail: string, status: 'processing' | 'completed' | 'error' = 'processing') => {
        setProcessingTasks(prev => prev.map(t =>
          t.id === employeeId ? { ...t, progress: progressValue, detail, status } : t
        ));
      };

      // ============================================================================
      // BATCH PREFETCH - Fetch ALL data needed BEFORE the per-employee loop
      // This avoids N * 20 DB round-trips and reduces to a fixed set of bulk queries
      // ============================================================================
      const allEmpIds = selectedEmployees.map(e => e.employee_id);

      // --- SHARED DATA (same for every employee) ---
      const [
        weeklyOffData,
        holidayData,
        leaveTypesData,
        defaultOTStructureData,
        payrollComponentsData,
        structureComponentsData,
        statutoryConfigsData,
        calculationComponentsData,
        commonAssignmentData,
        locationSettingsData,
      ] = await Promise.all([
        supabase.rpc('get_weekly_off_list', { p_start_date: periodStart, p_end_date: periodEnd, p_tenant_id: auth.tenantId }).then(r => r.data || []),
        supabase.rpc('get_holiday_list', { p_start_date: periodStart, p_end_date: periodEnd, p_tenant_id: auth.tenantId }).then(r => r.data || []),
        supabase.from('leave_types').select('name, is_paid').eq('tenant_id', auth.tenantId).eq('is_active', true).then(r => r.data || []),
        otLinked ? supabase.from('ot_structures').select('id').eq('tenant_id', auth.tenantId).eq('is_default', true).limit(1).then(r => r.data) : Promise.resolve(null),
        supabase.from('payroll_components').select('id, name, component_type, rounding_type').eq('tenant_id', auth.tenantId).then(r => r.data || []),
        supabase.from('payroll_structure_components').select('*').eq('structure_id', selectedStructureId).eq('tenant_id', auth.tenantId).then(r => r.data || []),
        supabase.from('statutory_configurations').select('*').eq('tenant_id', auth.tenantId).then(r => r.data || []),
        supabase.from('payroll_components').select('id, name').eq('tenant_id', auth.tenantId).eq('component_category', 'calculation').eq('is_active', true).then(r => r.data || []),
        supabase.from('employee_salary_structure_assignments').select('individual_component_values').eq('salary_structure_id', selectedStructureId).is('employee_id', null).eq('tenant_id', auth.tenantId).maybeSingle().then(r => r.data),
        supabase.from('location_settings').select('field_work_integration_enabled, field_work_component_id').eq('tenant_id', auth.tenantId).maybeSingle().then(r => r.data),
      ]);

      const defaultOTStructureId = defaultOTStructureData?.[0]?.id || null;
      const paidLeaves = (leaveTypesData as any[]).filter((lt: any) => lt.is_paid).map((lt: any) => lt.name);
      const unpaidLeaves = (leaveTypesData as any[]).filter((lt: any) => !lt.is_paid).map((lt: any) => lt.name);

      // Resolve Travel Allowance component name dynamically
      let activeTravelAllowanceComponentName = 'Travel Allowance';
      if (locationSettingsData?.field_work_integration_enabled && locationSettingsData?.field_work_component_id) {
        const matchingComp = (payrollComponentsData as any[]).find(c => c.id === locationSettingsData.field_work_component_id);
        if (matchingComp?.name) {
          activeTravelAllowanceComponentName = matchingComp.name;
        }
      }

      // Build payroll component name→id/id→type maps
      const pcNameToId: Record<string, string> = {};
      const pcIdToType: Record<string, string> = {};
      const pcIdToRounding: Record<string, any> = {};
      (payrollComponentsData as any[]).forEach((c: any) => {
        pcNameToId[c.name.toLowerCase().trim()] = c.id;
        pcIdToType[c.id] = c.component_type;
        pcIdToRounding[c.id] = c.rounding_type;
      });

      // Build calculation component id→name map for execution context
      const calcCompIdToName: Record<string, string> = {};
      (calculationComponentsData as any[]).forEach((c: any) => { calcCompIdToName[c.id] = c.name; });

      // Common assignment values (for shared structure components)
      const commonValsShared = (commonAssignmentData?.individual_component_values || {}) as Record<string, number>;

      // --- PER-EMPLOYEE BATCH QUERIES ---
      const [
        allAttendance,
        allLeaves,
        allGatePasses,
        allOTApprovals,
        allSalaryAssignments,
        allStatutoryIds,
        allStatutoryValues,
        allShifts,
      ] = await Promise.all([
        supabase.from('attendance_logs').select('*').eq('tenant_id', auth.tenantId).in('employee_id', allEmpIds).gte('date', periodStart).lte('date', periodEnd).then(r => r.data || []),
        supabase.from('leave_requests').select('*, leave_type:leave_types(name, is_paid, in_between_leave_week_off, in_between_leave_holiday)').in('employee_id', allEmpIds).eq('tenant_id', auth.tenantId).eq('status', 'Approved').lte('start_date', periodEnd).gte('end_date', periodStart).then(r => r.data || []),
        supabase.from('gate_pass_requests').select('*').eq('tenant_id', auth.tenantId).in('employee_id', allEmpIds).eq('status', 'Approved').gte('start_date', periodStart).lte('end_date', periodEnd).then(r => r.data || []),
        otLinked ? supabase.from('ot_approvals').select('id, employee_id, attendance_date, original_ot_hours, corrected_ot_hours').in('employee_id', allEmpIds).eq('tenant_id', auth.tenantId).eq('approval_status', 'approved').gte('attendance_date', periodStart).lte('attendance_date', periodEnd).then(r => r.data || []) : Promise.resolve([]),
        supabase.from('employee_salary_structure_assignments').select('id, employee_id, salary_structure_id, individual_component_values').in('employee_id', allEmpIds).eq('salary_structure_id', selectedStructureId).eq('tenant_id', auth.tenantId).then(r => r.data || []),
        supabase.from('employee_statutory_ids').select('employee_id, pf_number, esi_number, tds_id, professional_tax_id').in('employee_id', allEmpIds).eq('tenant_id', auth.tenantId).then(r => r.data || []),
        supabase.from('employee_statutory_values').select('employee_id, configuration_id, value').in('employee_id', allEmpIds).eq('tenant_id', auth.tenantId).then(r => r.data || []),
        supabase.from('shifts').select('id, name').eq('tenant_id', auth.tenantId).then(r => r.data || []),
      ]);

      // Build per-employee Maps for O(1) lookup in the loop
      const attendanceByEmp: Record<string, any[]> = {};
      (allAttendance as any[]).forEach((a: any) => { (attendanceByEmp[a.employee_id] = attendanceByEmp[a.employee_id] || []).push(a); });

      const leavesByEmp: Record<string, any[]> = {};
      (allLeaves as any[]).forEach((l: any) => { (leavesByEmp[l.employee_id] = leavesByEmp[l.employee_id] || []).push(l); });

      const gatePassByEmp: Record<string, any[]> = {};
      (allGatePasses as any[]).forEach((g: any) => { (gatePassByEmp[g.employee_id] = gatePassByEmp[g.employee_id] || []).push(g); });

      const otApprovalsByEmp: Record<string, any[]> = {};
      (allOTApprovals as any[]).forEach((o: any) => { (otApprovalsByEmp[o.employee_id] = otApprovalsByEmp[o.employee_id] || []).push(o); });

      const assignmentByEmp: Record<string, any> = {};
      (allSalaryAssignments as any[]).forEach((a: any) => { assignmentByEmp[a.employee_id] = a; });

      const statutoryIdsByEmp: Record<string, any> = {};
      (allStatutoryIds as any[]).forEach((s: any) => { statutoryIdsByEmp[s.employee_id] = s; });

      const statutoryValuesByEmp: Record<string, Record<string, any>> = {};
      (allStatutoryValues as any[]).forEach((sv: any) => {
        if (!statutoryValuesByEmp[sv.employee_id]) statutoryValuesByEmp[sv.employee_id] = {};
        statutoryValuesByEmp[sv.employee_id][sv.configuration_id] = sv;
      });

      const shiftById: Record<string, string> = {};
      (allShifts as any[]).forEach((s: any) => { shiftById[s.id] = s.name; });

      // Pre-load OT structure with components (if OT linked and default structure exists)
      let otStructure: any = null;
      if (otLinked && defaultOTStructureId) {
        const { data: otStr } = await supabase.from('ot_structures').select('*, components:ot_structure_components(*)').eq('id', defaultOTStructureId).eq('tenant_id', auth.tenantId).single();
        otStructure = otStr;
      }

      // Pre-build statutory lookup keyed by payroll_component_id
      const statutoryConfigByCompId: Record<string, any> = {};
      (statutoryConfigsData as any[]).forEach((c: any) => {
        if (c.payroll_component_id) statutoryConfigByCompId[c.payroll_component_id] = c;
      });

      // Pre-calculate calendar info once
      const refDate = new Date(periodStart);
      const monthStart = new Date(refDate.getFullYear(), refDate.getMonth(), 1);
      const monthEnd = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0);
      const calendarDays = Math.floor((monthEnd.getTime() - monthStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const periodString = refDate.toLocaleString('en-US', { month: 'short', year: 'numeric' });

      // Global OT config (fetched once)
      const globalOTConfig = otLinked ? await getGlobalOvertimeConfig() : null;
      const standardHours = otLinked ? await getStandardMonthlyHours(periodStart) : 208;
      const otMultiplier = globalOTConfig?.global_multiplier || 1.00;

      // ============================================================================
      // END BATCH PREFETCH
      // ============================================================================

      for (const empData of selectedEmployees) {
        try {
          updateTask(empData.employee_id, 10, 'Time evaluation...');
          // ============================================================================
          // TIME EVALUATION (FAST - using prefetched data, no DB calls)
          // ============================================================================
          const empAttendanceLogs = attendanceByEmp[empData.employee_id] || [];
          const empLeaves = leavesByEmp[empData.employee_id] || [];
          const empGatePasses = gatePassByEmp[empData.employee_id] || [];

          // Use prefetched weekly off and holiday data (shared data)
          const attendance: any[] = [];
          const currentDate = new Date(periodStart);
          const endDateObj = new Date(periodEnd);

          while (currentDate <= endDateObj) {
            const dateStr = currentDate.toISOString().split('T')[0];
            const isWeeklyOff = (weeklyOffData as any[]).some((w: any) => w.date === dateStr);
            const isHoliday = (holidayData as any[]).some((h: any) => h.date === dateStr);
            const leaveRecord = empLeaves.find((l: any) => {
              const ls = new Date(l.start_date);
              const le = new Date(l.end_date);
              return currentDate >= ls && currentDate <= le;
            });

            if (isWeeklyOff) {
              if (leaveRecord && leaveRecord.leave_type?.in_between_leave_week_off) {
                attendance.push({ date: dateStr, status: 'Absent', leave: leaveRecord.leave_type?.name || 'CL' });
              } else {
                attendance.push({ date: dateStr, status: 'WeekOff' });
              }
            } else if (isHoliday) {
              if (leaveRecord && leaveRecord.leave_type?.in_between_leave_holiday) {
                attendance.push({ date: dateStr, status: 'Absent', leave: leaveRecord.leave_type?.name || 'CL' });
              } else {
                attendance.push({ date: dateStr, status: 'PaidHoliday' });
              }
            } else {
              const attendanceRecord = empAttendanceLogs.find((a: any) => a.date === dateStr);
              const gatePass = empGatePasses.find((g: any) => g.date === dateStr);

              if (attendanceRecord) {
                const entry: any = {
                  date: dateStr,
                  status: attendanceRecord.status === 'Present' ? 'Present' :
                    (attendanceRecord.status === 'Half Day' || attendanceRecord.status === 'First Off' || attendanceRecord.status === 'Second Off') ? 'HalfDay' :
                      attendanceRecord.status === 'Late' ? 'Late' : 
                        attendanceRecord.status === 'Early Exit' ? 'Early Exit' :
                          attendanceRecord.status === 'Permission' ? 'Permission' : 'Absent'
                };
                // Use prefetched shift map (no DB call needed)
                if (attendanceRecord.shift_id && shiftById[attendanceRecord.shift_id]) {
                  entry.shift = shiftById[attendanceRecord.shift_id];
                }
                if (gatePass) {
                  entry.gatePass = {
                    type: gatePass.pass_type === 'on_duty' ? 'OnDuty' : 'Permission',
                    duration: gatePass.duration || '0 mins'
                  };
                }
                if (entry.status === 'HalfDay' && leaveRecord) {
                  entry.details = {
                    firstHalf: 'Absent',
                    secondHalf: leaveRecord.leave_type?.name || 'CL',
                    shift: entry.shift
                  };
                } else if (entry.status === 'Absent' && leaveRecord) {
                  // FIX: When attendance is Absent AND a leave record exists, attach the leave
                  // type so evaluateTimeData correctly counts paid/unpaid leave days.
                  entry.leave = leaveRecord.leave_type?.name || 'CL';
                }
                attendance.push(entry);
              } else if (leaveRecord) {
                attendance.push({ date: dateStr, status: 'Absent', leave: leaveRecord.leave_type?.name || 'CL' });
              } else {
                attendance.push({ date: dateStr, status: 'Present' });
              }
            }
            currentDate.setDate(currentDate.getDate() + 1);
          }

          // Get pay days from prefetched assignment or use calendar days
          const empAssignment = assignmentByEmp[empData.employee_id];
          const payDays = (empAssignment as any)?.custom_pay_days || calendarDays;

          const attendanceDataForEvaluation: AttendanceData = {
            period: periodString,
            calendarDays,
            payDays,
            attendance,
            rules: {
              halfDayValue: 0.5,
              paidLeaves,
              unpaidLeaves,
              weekOffPaid: true,
              paidHolidayPaid: true,
              payableDaysFormula: 'Present + PaidLeave + PaidHoliday'
            }
          };

          const timeWageTypes = evaluateTimeData(attendanceDataForEvaluation);
          await storeTimeEvaluation(empData.employee_id, periodString, timeWageTypes);

          updateTask(empData.employee_id, 30, 'Fetching history & components...');

          // Get time evaluation components for formula use
          const timeEvaluationComponents = await getTimeEvaluationComponents(empData.employee_id, periodString);

          // ============================================================================
          // OT CALCULATION (FAST - using prefetched data)
          // ============================================================================
          let otAmount = 0;
          if (otLinked) {
            try {
              const approvedOT = otApprovalsByEmp[empData.employee_id] || [];
              if (approvedOT.length > 0 && otStructure?.components) {
                const totalOTHours = approvedOT.reduce((sum: number, a: any) => sum + (a.corrected_ot_hours || a.original_ot_hours || 0), 0);
                if (totalOTHours > 0) {
                  const activeComponents = otStructure.components.filter((c: any) => c.is_active);

                  // Use prefetched assignment data for salary resolution
                  const individualVals = (empAssignment?.individual_component_values || {}) as Record<string, number>;
                  const resolvedMasterMap: Record<string, number> = {};

                  // Seed with fixed values
                  (structureComponentsData as any[]).forEach((sc: any) => {
                    if (sc.amount_type === 'value') {
                      const val = individualVals[sc.component_id] ?? commonValsShared[sc.component_id] ?? Number(sc.amount) ?? 0;
                      resolvedMasterMap[sc.component_id] = val;
                    }
                  });

                  // Resolve percentages
                  let iterations = 0;
                  let changed = true;
                  while (changed && iterations < 3) {
                    changed = false;
                    iterations++;
                    (structureComponentsData as any[]).forEach((sc: any) => {
                      if (sc.amount_type === 'percentage' && resolvedMasterMap[sc.component_id] === undefined) {
                        const refs = (sc.reference_components || []) as string[];
                        let baseSum = 0;
                        let allRefsResolved = true;
                        refs.forEach((refId: string) => {
                          if (refId && resolvedMasterMap[refId] !== undefined) baseSum += resolvedMasterMap[refId];
                          else if (refId) allRefsResolved = false;
                        });
                        if (allRefsResolved) {
                          const pctVal = Number(sc.percentage || sc.percentage_value) || 0;
                          resolvedMasterMap[sc.component_id] = (baseSum * pctVal) / 100;
                          changed = true;
                        }
                      }
                    });
                  }

                  // Calculate total master gross using prefetched payroll components
                  let totalMasterGross = 0;
                  (payrollComponentsData as any[]).filter((pc: any) => pc.component_type === 'earning').forEach((pc: any) => {
                    totalMasterGross += resolvedMasterMap[pc.id] ?? 0;
                  });

                  const compValues = new Map<string, number>();
                  activeComponents.forEach((comp: any) => {
                    if (comp.calculation_type === 'percentage' && comp.percentage_of) {
                      const ref = comp.percentage_of.toLowerCase().trim();
                      let base = 0;
                      if (ref === 'gross salary' || ref === 'gross') {
                        base = totalMasterGross;
                      } else {
                        const refId = pcNameToId[ref];
                        base = refId ? (resolvedMasterMap[refId] ?? comp.value) : comp.value;
                      }
                      compValues.set(comp.id, base);
                    } else {
                      compValues.set(comp.id, comp.value);
                    }
                  });

                  const { total, components: processedComponents } = calculateTotalOTAmount(
                    activeComponents,
                    totalOTHours,
                    compValues,
                    standardHours,
                    otMultiplier
                  );
                  otAmount = total;

                  if (total > 0) {
                    activeOTStructureId = defaultOTStructureId;
                    allOTBatchData.push({
                      employeeId: empData.employee_id,
                      structureId: defaultOTStructureId,
                      totalOTHours,
                      totalOTAmount: total,
                      components: processedComponents,
                      attendanceRecords: approvedOT.map((a: any) => ({
                        date: a.attendance_date,
                        hours: a.corrected_ot_hours || a.original_ot_hours,
                        approvalId: a.id
                      }))
                    });
                  }
                }
              }
            } catch (otErr) {
              console.error('OT Calculation failed:', otErr);
            }
          }

          let calculationResult: PayrollCalculationResult | null = null;
          try {
            calculationResult = await validatePayrollPeriod({
              employeeId: empData.employee_id,
              startDate: periodStart,
              endDate: periodEnd,
            });
          } catch (validationErr) { console.warn('Attendance validation skipped:', validationErr); }

          // ============================================================================
          // HIDDEN COMPONENT FETCH (FAST - using prefetched maps)
          // ============================================================================
          const hiddenComponents = structureComponents.filter(
            c => (c.value_set === 'at_structure' && c.is_locked) || c.value_set === 'master_entry'
          );

          const hiddenComponentValues: Record<string, number> = {};

          // Locked at_structure (use prefetched structureComponentsData)
          const lockedAtStructureComponents = hiddenComponents.filter(c => c.value_set === 'at_structure' && c.is_locked);
          if (lockedAtStructureComponents.length > 0) {
            lockedAtStructureComponents.forEach(comp => {
              if (!comp.id) return;
              const sc = (structureComponentsData as any[]).find((s: any) => s.component_id === comp.id);
              if (sc) {
                hiddenComponentValues[comp.name] = sc.amount || sc.percentage || 0;
              }
            });
          }

          // Master entry components
          const hiddenMasterEntryComponents = hiddenComponents.filter(c => c.value_set === 'master_entry');
          if (hiddenMasterEntryComponents.length > 0) {
            // Common values first
            hiddenMasterEntryComponents.filter(c => c.type_selection === 'common').forEach(comp => {
              if (comp.id && commonValsShared[comp.id] !== undefined) {
                hiddenComponentValues[comp.name] = commonValsShared[comp.id];
              }
            });
            // Individual values override
            const individualVals = (empAssignment?.individual_component_values || {}) as Record<string, number>;
            hiddenMasterEntryComponents.filter(c => c.type_selection === 'individual').forEach(comp => {
              if (comp.id && individualVals[comp.id] !== undefined) {
                hiddenComponentValues[comp.name] = individualVals[comp.id];
              }
            });
          }

          // Process earnings
          let processedEarnings = structureComponents.filter(c => c.component_type === 'earning').map(c => {
            let component = { ...c };
            // Attach rounding type from the payroll component definition
            if (c.id && pcIdToRounding[c.id]) {
              component.rounding_type = pcIdToRounding[c.id];
            }

            if (hiddenComponentValues[c.name] !== undefined) {
              if (c.amount_type === 'percentage') {
                component.percentage_value = hiddenComponentValues[c.name];
              } else {
                component.amount = hiddenComponentValues[c.name];
              }
            } else if (empData.editableComponents[c.name] !== undefined) {
              if (c.amount_type === 'percentage') {
                component.percentage_value = empData.editableComponents[c.name];
              } else {
                component.amount = empData.editableComponents[c.name];
              }
            }
            return component;
          });

          // Inject OT into processed earnings if detected
          if (otAmount > 0) {
            const otComp = structureComponents.find(c => c.name.toLowerCase() === 'overtime');
            if (otComp) {
              const idx = processedEarnings.findIndex(c => c.name.toLowerCase() === 'overtime');
              if (idx !== -1) {
                processedEarnings[idx] = { ...processedEarnings[idx], amount: otAmount, amount_type: 'value' };
              } else {
                processedEarnings.push({ id: 'dynamic_ot_component', name: 'Overtime', component_type: 'earning', amount: otAmount, amount_type: 'value', is_applied_in_calculation: true, is_attendance_linked: false, is_locked: true, value_set: 'at_executing' } as any);
              }
            } else {
              processedEarnings.push({ id: 'dynamic_ot_component', name: 'Overtime', component_type: 'earning', amount: otAmount, amount_type: 'value', is_applied_in_calculation: true, is_attendance_linked: false, is_locked: true, value_set: 'at_executing' } as any);
            }
          }

          updateTask(empData.employee_id, 50, 'Evaluating formulas...');

          // Process deductions
          let processedDeductions = structureComponents.filter(c => c.component_type === 'deduction' && c.statutory_component_id === null).map(c => {
            let component = { ...c };
            // Attach rounding type from the payroll component definition
            if (c.id && pcIdToRounding[c.id]) {
              component.rounding_type = pcIdToRounding[c.id];
            }

            if (hiddenComponentValues[c.name] !== undefined) {
              if (c.amount_type === 'percentage') {
                component.percentage_value = hiddenComponentValues[c.name];
              } else {
                component.amount = hiddenComponentValues[c.name];
              }
            } else if (empData.editableComponents[c.name] !== undefined) {
              if (c.amount_type === 'percentage') {
                component.percentage_value = empData.editableComponents[c.name];
              } else {
                component.amount = empData.editableComponents[c.name];
              }
            }
            return component;
          });

          // REMOVED: Attendance-based proration logic
          // All components are now prorated by the payableDaysFactor regardless of attendance linking
          if (calculationResult && calculationResult.payableDaysFactor < 1 && calculationResult.payableDaysFactor >= 0) {
            const applyFactor = (comps: any[]) => comps.map(component => {
              if (component.amount_type !== 'percentage' && component.amount) {
                // Apply factor to all non-percentage components (removed is_attendance_linked check)
                // EXCEPT Travel Allowance and Overtime which should not be prorated
                if (component.calculation_type !== 'expression' && component.name !== activeTravelAllowanceComponentName && component.name !== 'Overtime' && component.is_attendance_linked !== false) {
                  const proratedAmount = component.amount * calculationResult!.payableDaysFactor;

                  // Apply rounding rule during proration if defined
                  let roundedAmount = proratedAmount;
                  if (component.rounding_type === 'round' || component.rounding_type === 'standard') roundedAmount = Math.round(proratedAmount);
                  else if (component.rounding_type === 'floor') roundedAmount = Math.floor(proratedAmount);
                  else if (component.rounding_type === 'ceil') roundedAmount = Math.ceil(proratedAmount);
                  else if (component.rounding_type === 'decimal2') roundedAmount = Math.round(proratedAmount * 100) / 100;
                  else if (component.rounding_type === 'none') roundedAmount = proratedAmount;
                  else roundedAmount = parseFloat(proratedAmount.toFixed(2)); // Default to 2 decimals for proration if no specific rule

                  return { ...component, amount: roundedAmount };
                }
              }
              return component;
            });
            processedEarnings = applyFactor(processedEarnings);
            processedDeductions = applyFactor(processedDeductions);
          }

          const allProcessedComponents = [...processedEarnings, ...processedDeductions];

          // ============================================================================
          // TIME EVALUATION INTEGRATION - Step 3: Build Execution Context (FAST - using prefetched calcCompIdToName)
          // ============================================================================
          const executionContext: ExecutionContext = { ...timeEvaluationComponents };

          // Map time evaluation components by name using prefetched calculation components map
          Object.entries(calcCompIdToName).forEach(([id, name]) => {
            if (timeEvaluationComponents[id] !== undefined) {
              executionContext[name] = timeEvaluationComponents[id];
              const normalizedName = name.toUpperCase().replace(/\s+/g, '_');
              executionContext[normalizedName] = timeEvaluationComponents[id];
            }
          });

          // Add component values to execution context.
          // For expression-type components (e.g. "Attendance Bonus"), seed the context
          // with the locked base amount from hiddenComponentValues so that ELSE-branch
          // self-references resolve to the intended fixed value, not the uncomputed 0.
          allProcessedComponents.forEach(comp => {
            const componentName = comp.name.toUpperCase().replace(/\s+/g, '_');
            const seedValue = comp.calculation_type === 'expression'
              ? (hiddenComponentValues[comp.name] ?? comp.amount ?? 0)
              : (comp.amount || 0);
            executionContext[componentName] = seedValue;
            executionContext[comp.name] = seedValue;
          });

          // ============================================================================
          // TIME EVALUATION INTEGRATION - Step 4: Evaluate Component Expressions
          // ============================================================================
          processedEarnings = processedEarnings.map(comp => ({
            ...comp,
            amount: calculateComponentAmount(comp, allProcessedComponents, executionContext)
          }));

          processedDeductions = processedDeductions.map(comp => ({
            ...comp,
            amount: calculateComponentAmount(comp, allProcessedComponents, executionContext)
          }));

          updateTask(empData.employee_id, 70, 'Calculating taxes & deductions...');

          const finalAll = [...processedEarnings, ...processedDeductions];

          const earningsForCalculation = processedEarnings.filter(c => c.is_applied_in_calculation !== false);
          const deductionsForCalculation = processedDeductions.filter(c => c.is_applied_in_calculation !== false);

          const grossSalary = calculateTotal(earningsForCalculation, finalAll, executionContext);
          const standardDeductions = calculateTotal(deductionsForCalculation, finalAll, executionContext);

          const payrollMonth = periodStart.substring(0, 7);
          const advanceDeductions = await getEmployeeAdvanceDeductions(empData.employee_id, payrollMonth, auth.tenantId);

          // ============================================================================
          // STATUTORY DEDUCTIONS (FAST - using prefetched data, minimal DB calls)
          // ============================================================================
          const statutoryComponents = structureComponents.filter(c => c.component_type === 'deduction' && c.statutory_component_id != null);
          const statutoryDeductions: any[] = [];
          const empStatutoryIds = statutoryIdsByEmp[empData.employee_id] || {};
          const empStatutoryValues = statutoryValuesByEmp[empData.employee_id] || {};

          for (const component of statutoryComponents) {
            if (!component.id) continue;
            try {
              const config = statutoryConfigByCompId[component.id];
              if (!config) continue;

              let deductionValue: number | null = null;

              if (config.global_value !== null && config.global_value !== undefined) {
                let hasRequiredId = false;
                switch (config.statutory_element) {
                  case 'provident_fund': hasRequiredId = !!empStatutoryIds.pf_number; break;
                  case 'employee_state_insurance': hasRequiredId = !!empStatutoryIds.esi_number; break;
                  case 'tax_deducted_at_source': hasRequiredId = !!empStatutoryIds.tds_id; break;
                  case 'professional_tax': hasRequiredId = !!empStatutoryIds.professional_tax_id; break;
                }
                if (!hasRequiredId) continue;

                if (config.calculation_method === 'percentage') {
                  const referenceIds: string[] = config.referance_component_ids || [];
                  const baseAmount = finalAll.filter(comp => referenceIds.includes(comp.id || '')).reduce((sum, comp) => sum + (comp.amount || 0), 0);
                  deductionValue = (baseAmount * parseFloat(config.global_value.toString())) / 100;
                } else {
                  deductionValue = parseFloat(config.global_value.toString());
                }
              } else {
                const employeeValue = empStatutoryValues[config.id];
                if (!employeeValue) continue;

                if (config.calculation_method === 'percentage') {
                  const referenceIds: string[] = config.referance_component_ids || [];
                  const baseAmount = finalAll.filter(comp => referenceIds.includes(comp.id || '')).reduce((sum, comp) => sum + (comp.amount || 0), 0);
                  deductionValue = (baseAmount * parseFloat(employeeValue.value.toString())) / 100;
                } else {
                  deductionValue = parseFloat(employeeValue.value.toString());
                }
              }

              if (deductionValue !== null && deductionValue > 0) {
                // Apply rounding rule if defined for this statutory component
                const roundingType = pcIdToRounding[component.id!] || 'decimal2';
                let roundedDeduction = deductionValue;
                if (roundingType === 'round' || roundingType === 'standard') roundedDeduction = Math.round(deductionValue);
                else if (roundingType === 'floor') roundedDeduction = Math.floor(deductionValue);
                else if (roundingType === 'ceil') roundedDeduction = Math.ceil(deductionValue);
                else if (roundingType === 'decimal2') roundedDeduction = Math.round(deductionValue * 100) / 100;
                else if (roundingType === 'none') roundedDeduction = deductionValue;

                statutoryDeductions.push({
                  ...component,
                  amount: roundedDeduction,
                  component_type: 'deduction',
                  amount_type: 'value',
                  rounding_type: roundingType
                });
              }
            } catch (err) {
              console.error(`Error processing statutory deduction for component ${component.name}:`, err);
            }
          }

          const allDeductionComponents = [...processedDeductions, ...advanceDeductions, ...statutoryDeductions];
          const statutoryDeductionsForCalculation = statutoryDeductions.filter(d => d.is_applied_in_calculation !== false);
          const statutoryDeductionsTotal = statutoryDeductionsForCalculation.reduce((sum, d) => sum + (d.amount || 0), 0);
          let totalDeductionsWithAdvances = standardDeductions + advanceDeductions.reduce((sum, d) => sum + (d.amount || 0), 0) + statutoryDeductionsTotal;
          let netSalaryWithAdvances = grossSalary - totalDeductionsWithAdvances;

          let normalizedDeductions = allDeductionComponents.map(d => ({
            ...d,
            component_type: 'deduction',
            amount: Number(d.amount) || 0
          }));

          // ====== ZERO OUT IF ABSENT ENTIRE MONTH ======
          const isAbsentEntireMonth = calculationResult &&
            calculationResult.totalPresentDays === 0 &&
            calculationResult.totalPaidLeaveDays === 0 &&
            calculationResult.totalWorkingDays > 0;

          if (isAbsentEntireMonth) {
            processedEarnings = processedEarnings.map(comp => ({ ...comp, amount: 0 }));
            normalizedDeductions = normalizedDeductions.map(comp => ({ ...comp, amount: 0 }));
            netSalaryWithAdvances = 0;
            totalDeductionsWithAdvances = 0;

            if (calculationResult) {
              calculationResult.totalHolidays = 0;
              calculationResult.totalPayableDays = 0;
              calculationResult.payableDaysFactor = 0;
              if (calculationResult.calculationComponents) {
                calculationResult.calculationComponents['PaidHolidays'] = 0;
                calculationResult.calculationComponents['PayableDays'] = 0;
              }
            }
          }

          const attendanceSummary = calculationResult ? {
            total_working_days: calculationResult.totalWorkingDays,
            total_present_days: calculationResult.totalPresentDays,
            total_absent_days: calculationResult.totalAbsentDays,
            total_leave_days: calculationResult.totalLeaveDays,
            total_paid_leave_days: calculationResult.totalPaidLeaveDays,
            payable_days_factor: calculationResult.payableDaysFactor,
          } : undefined;

          updateTask(empData.employee_id, 90, 'Saving record...');

          await createPayProcessEntry({
            employee_id: empData.employee_id,
            employee_code: empData.employee_code,
            period_start: periodStart,
            period_end: periodEnd,
            salary_components: processedEarnings,
            deduction_components: normalizedDeductions,
            total_amount: netSalaryWithAdvances,
            status: 'Draft',
            payment_date: null,
            attendance_summary: attendanceSummary,
            calculation_components: calculationResult?.calculationComponents
          });

          processedCount++;
          updateTask(empData.employee_id, 100, 'Completed', 'completed');
        } catch (err) {
          console.error(`Error processing ${empData.employee_code}:`, err);
          errorCount++;
          errors.push(`${empData.employee_code}: ${err instanceof Error ? err.message : 'Unknown'}`);
          updateTask(empData.employee_id, 100, 'Error during process', 'error');
        } finally {
          // Update progress after each employee is handled
          setProgress(Math.round(((processedCount + errorCount) / totalToProcess) * 100));
        }
      }

      // ============================================================================
      // OT PERSISTENCE - Step 5: Save all collected OT processing results
      // ============================================================================
      if (otLinked && allOTBatchData.length > 0 && activeOTStructureId) {
        try {
          const payrollMonthStr = new Date(periodStart).toLocaleString('en-US', { month: 'short', year: 'numeric' });
          const processId = await createOTProcess(auth.tenantId, {
            process_name: `Payroll Batch OT (${payrollMonthStr})`,
            processing_period_start: periodStart,
            processing_period_end: periodEnd,
            processing_mode: 'linked',
            ot_structure_id: activeOTStructureId
          });

          await bulkSaveOTProcessedData(auth.tenantId, processId, allOTBatchData);

          // Update process totals
          const totalBatchAmount = allOTBatchData.reduce((sum, d) => sum + d.totalOTAmount, 0);
          await updateOTProcess(processId, auth.tenantId, {
            total_employees: allOTBatchData.length,
            total_ot_amount: totalBatchAmount,
            processing_status: 'completed',
            processed_at: new Date().toISOString()
          });
        } catch (otSaveErr) {
          console.error('Failed to persist OT batch data:', otSaveErr);
        }
      }

      if (errorCount > 0) {
        setError(`Processed ${processedCount}. Failed ${errorCount}:\n${errors.join('\n')}`);
      } else {
        setSuccess(`Successfully processed payroll for ${processedCount} employees`);
        setTimeout(() => setSuccess(null), 5000);
        await loadEmployeesForStructure();
        setSelectAll(false);
      }
    } catch (err) {
      console.error('Error processing payroll:', err);
      setError(err instanceof Error ? err.message : 'Failed to process payroll');
    } finally {
      // Small delay before closing modal to let user see 100% completion
      setTimeout(() => {
        setProcessing(false);
        setProcessingTasks([]);
        setProgress(0);
      }, 1500);
    }
  };

  const initiateSingleReprocess = (payrollId: string, employeeName: string) => {
    setItemsToReprocess([{ id: payrollId, name: employeeName }]);
    setShowReprocessModal(true);
  };

  const initiateBulkReprocess = () => {
    const selectedPaid = paidEmployees.filter(e => e.selected && e.existingPayrollId);
    if (selectedPaid.length === 0) return;

    setItemsToReprocess(selectedPaid.map(e => ({ id: e.existingPayrollId!, name: e.employee_name })));
    setShowReprocessModal(true);
  };

  const handleConfirmReprocess = async () => {
    if (itemsToReprocess.length === 0) return;

    try {
      setShowReprocessModal(false);
      setProcessing(true);
      setError(null);
      setProgress(0);

      const initialTasks: EmployeeProgressTask[] = itemsToReprocess.map(item => ({
        id: item.id,
        name: item.name,
        progress: 0,
        status: 'pending'
      }));
      setProcessingTasks(initialTasks);

      let successCount = 0;
      let failCount = 0;
      const totalToReprocess = itemsToReprocess.length;

      const updateTask = (id: string, progressValue: number, detail: string, status: 'processing' | 'completed' | 'error' = 'processing') => {
        setProcessingTasks(prev => prev.map(t =>
          t.id === id ? { ...t, progress: progressValue, detail, status } : t
        ));
      };

      for (const item of itemsToReprocess) {
        updateTask(item.id, 50, 'Reverting records...');
        try {
          await reprocessPayroll(item.id);
          successCount++;
          updateTask(item.id, 100, 'Completed', 'completed');
        } catch (err) {
          failCount++;
          console.error(`Reprocess failed for ${item.name}:`, err);
          updateTask(item.id, 100, 'Error reverting', 'error');
        } finally {
          setProgress(Math.round(((successCount + failCount) / totalToReprocess) * 100));
        }
      }

      if (failCount > 0) {
        setError(`Successfully reverted ${successCount} payrolls. Failed to revert ${failCount}.`);
      } else {
        setSuccess(`Successfully reverted ${successCount} payroll(s).`);
      }

      setTimeout(() => setSuccess(null), 5000);
      await loadEmployeesForStructure();
      setSelectAll(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Please try again later.');
    } finally {
      setTimeout(() => {
        setProcessing(false);
        setItemsToReprocess([]);
        setProcessingTasks([]);
        setProgress(0);
      }, 1500);
    }
  };

  // ❌ REMOVED: loadAvailableEmployees function
  // ❌ REMOVED: addEmployeeToStructure function

  const canReprocess = ['admin', 'manager', 'hr_head'].includes(userRole);

  const handleTabChange = (mode: 'process' | 'paid_history') => {
    setViewMode(mode);
    setSelectAll(false);
    setSearchTerm('');
    setEmployeePayrollData(prev => prev.map(emp => ({ ...emp, selected: false })));
  };

  // Calculate current progress stats from the processingTasks state
  const totalItems = processingTasks.length;
  const completedItems = processingTasks.filter(t => t.status === 'completed').length;

  return (
    <div className="p-6 relative">
      {processing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900 bg-opacity-60 backdrop-blur-sm transition-opacity">
          <div className="bg-white rounded-xl p-6 max-w-2xl w-full shadow-2xl flex flex-col max-h-[90vh]">
            <div className="mb-6 flex flex-col items-center">
              <Loader2 className="h-8 w-8 text-indigo-600 animate-spin mb-3" />
              <h3 className="text-xl font-semibold text-gray-900 mb-1">Processing Data   <span className='text-lg'>  ({completedItems}/{totalItems})</span></h3>

              <div className="text-center mb-4">
                <p className="text-sm text-gray-500">Overall Progress: {progress}% Complete</p>
              </div>

              <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-indigo-600 h-full rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
            </div>

            {/* Individual Employee Progress List */}
            <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
              {processingTasks.map((task) => (
                <div key={task.id} className="bg-gray-50 p-4 rounded-lg border border-gray-200 shadow-sm">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-medium text-sm text-gray-800">{task.name}</span>
                    <span className="text-xs font-medium">
                      {task.status === 'pending' && <span className="text-gray-500">Waiting...</span>}
                      {task.status === 'processing' && <span className="text-indigo-600 animate-pulse">{task.detail}</span>}
                      {task.status === 'completed' && <span className="text-green-600 flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Done</span>}
                      {task.status === 'error' && <span className="text-red-600 flex items-center gap-1"><AlertCircle className="h-3 w-3" /> Error</span>}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ease-out ${task.status === 'error' ? 'bg-red-500' :
                          task.status === 'completed' ? 'bg-green-500' : 'bg-indigo-500'
                        }`}
                      style={{ width: `${task.progress}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>

          </div>
        </div>
      )}
      <div className="mb-6 flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payroll Process</h1>
          <p className="mt-1 text-sm text-gray-500">Process and manage employee payrolls</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {lastSaved && viewMode === 'process' && (
            <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 px-3 py-1 rounded-md">
              <CheckCircle className="h-4 w-4" />
              <span>Draft saved {lastSaved.toLocaleTimeString()}</span>
            </div>
          )}
          {savingDraft && (
            <div className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50 px-3 py-1 rounded-md">
              <Save className="h-4 w-4 animate-pulse" />
              <span>Saving draft...</span>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2"><Calendar className="inline h-4 w-4 mr-1" /> Period Start</label>
            <input type="date" value={periodStart} max={periodEnd} onChange={(e) => setPeriodStart(e.target.value)} className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 sm:text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2"><Calendar className="inline h-4 w-4 mr-1" /> Period End</label>
            <input type="date" value={periodEnd} min={periodStart} onChange={(e) => setPeriodEnd(e.target.value)} className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 sm:text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2"><FileText className="inline h-4 w-4 mr-1" /> Salary Structure</label>
            <select value={selectedStructureId} onChange={(e) => setSelectedStructureId(e.target.value)} className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 sm:text-sm">
              <option value="">Select Structure</option>
              {structures
                .filter(s => s.is_active)
                .map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
            </select>
          </div>
        </div>
        {otConfig?.enabled && otConfig?.link_with_payroll && (
          <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-6">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="otLinked"
                checked={otLinked}
                onChange={(e) => setOtLinked(e.target.checked)}
                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded cursor-pointer"
              />
              <label htmlFor="otLinked" className="text-sm font-medium text-gray-700 cursor-pointer flex items-center gap-1">
                OT Linked
                <span title="If enabled, overtime amount will be added to the employee payroll process, reports, and payslips.">
                  <Info className="h-3 w-3 text-gray-400" />
                </span>
              </label>
            </div>
          </div>
        )}
      </div>

      {error && <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg whitespace-pre-line">{error}</div>}
      {success && <div className="mb-4 bg-green-50 border border-green-200 text-green-600 px-4 py-3 rounded-lg">{success}</div>}

      {selectedStructureId && periodStart && periodEnd && (
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="border-b border-gray-200 bg-gray-50 px-6">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => handleTabChange('process')}
                className={`${viewMode === 'process' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
              >
                <Users className="h-4 w-4 mr-2" />
                Process Payroll <span className="ml-2 bg-gray-200 text-gray-600 py-0.5 px-2 rounded-full text-xs">{employeesToProcess.length}</span>
              </button>

              {canReprocess && (
                <button
                  onClick={() => handleTabChange('paid_history')}
                  className={`${viewMode === 'paid_history' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
                >
                  <Lock className="h-4 w-4 mr-2" />
                  Paid Payrolls <span className="ml-2 bg-gray-200 text-gray-600 py-0.5 px-2 rounded-full text-xs">{paidEmployees.length}</span>
                </button>
              )}
            </nav>
          </div>

          <div className="p-6">

            <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
              <div className="relative w-full md:w-96">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  placeholder="Search by employee name or code..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                />
              </div>

              {/* ✅ CHANGE #1: Removed "Add Employee" button */}
              {viewMode === 'process' ? (
                <div className="flex gap-2 w-full md:w-auto">
                  {/* ❌ REMOVED: Add Employee button - Employees are now managed through Structure Assignment page */}
                  <button
                    onClick={processPayroll}
                    disabled={processing || employeesToProcess.filter(e => e.selected).length === 0}
                    className="inline-flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    <Play className="h-4 w-4 mr-2" /> {processing ? 'Processing...' : 'Process Selected'}
                  </button>
                </div>
              ) : (
                <div>
                  <button
                    onClick={initiateBulkReprocess}
                    disabled={processing || paidEmployees.filter(e => e.selected).length === 0}
                    className="inline-flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    <RefreshCcw className={`h-4 w-4 mr-2 ${processing ? 'animate-spin' : ''}`} />
                    {processing ? 'Processing...' : 'Reprocess Selected'}
                  </button>
                </div>
              )}
            </div>

            {viewMode === 'process' && (
              <>
                {loading ? <div className="text-center py-8 text-gray-500">Loading...</div> :
                  filteredEmployeesToProcess.length === 0 ? <div className="text-center py-8 text-gray-500">No pending payrolls matching your search.</div> : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left"><input type="checkbox" checked={selectAll} onChange={handleSelectAll} className="h-4 w-4 text-indigo-600 rounded" /></th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Employee Code
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Employee Name
                            </th>
                            {/* ✅ Component columns now only show 'editable' or 'enter_later' components */}
                            {editableComponents.map(c => <th key={c.id} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{c.name}</th>)}
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {filteredEmployeesToProcess.map((employee) => (
                            <tr key={employee.employee_id} className={`${employee.selected ? 'bg-indigo-50' : ''}`}>
                              <td className="px-6 py-4">
                                {employee.blockingReason ? (
                                  <div className="group relative">
                                    <AlertCircle className="h-5 w-5 text-red-500 cursor-not-allowed" />
                                    <div className="absolute z-10 left-6 top-0 w-64 p-2 bg-gray-900 text-white text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                      <p className="font-bold mb-1">Cannot Process:</p>
                                      {employee.blockingReason}
                                      <p className="mt-1 text-gray-300 italic">
                                        {employee.blockingReason.includes('OT') ? 'Please approve pending overtime.' :
                                          employee.blockingReason.includes('Leave') ? 'Please approve pending leave requests.' :
                                            'Please approve leaves or fix logs.'}
                                      </p>
                                    </div>
                                  </div>
                                ) : (
                                  <input
                                    type="checkbox"
                                    checked={employee.selected}
                                    onChange={() => handleSelectEmployee(employee.employee_id)}
                                    className="h-4 w-4 text-indigo-600 rounded"
                                  />
                                )}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                {employee.employee_code}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm font-medium text-gray-900">{employee.employee_name}</div>
                                {employee.blockingReason && (
                                  <div className="text-xs text-red-600 mt-1 flex items-center">
                                    {employee.blockingReason.includes('Unauthorized') ? 'Fix Unauthorized Absence' :
                                      employee.blockingReason.includes('Leave') ? 'Pending Leave Request' :
                                        employee.blockingReason.includes('OT') ? 'OT Pending Approval' :
                                          'Validation Error'}
                                  </div>
                                )}
                              </td>

                              {/* ✅ Component input cells - values come from individual_component_values for 'individual' type */}
                              {editableComponents.map((component) => (
                                <td key={component.id} className="px-6 py-4 whitespace-nowrap min-w-[150px]">
                                  <input
                                    type="number"
                                    disabled={!!employee.blockingReason}
                                    value={employee.editableComponents[component.name] || ''}
                                    onChange={(e) => handleComponentValueChange(employee.employee_id, component.name, parseFloat(e.target.value) || 0)}
                                    className="block w-full border border-gray-300 rounded-md py-1 px-2 text-sm focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:text-gray-400"
                                    placeholder="0.00"
                                  />
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
              </>
            )}

            {viewMode === 'paid_history' && canReprocess && (
              <>
                {filteredPaidEmployees.length === 0 ? <div className="text-center py-8 text-gray-500">No paid payrolls matching your search.</div> : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left"><input type="checkbox" checked={selectAll} onChange={handleSelectAll} className="h-4 w-4 text-orange-600 rounded" /></th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Employee Code</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee Name</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Designation</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Paid Date</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Net Pay</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {filteredPaidEmployees.map((employee) => (
                          <tr key={employee.employee_id} className={employee.selected ? 'bg-orange-50' : ''}>
                            <td className="px-6 py-4">
                              <input type="checkbox" checked={employee.selected} onChange={() => handleSelectEmployee(employee.employee_id)} className="h-4 w-4 text-orange-600 rounded" />
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-medium text-gray-900">{employee.employee_code}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-medium text-gray-900">{employee.employee_name}</div>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-500">{employee.designation}</td>
                            <td className="px-6 py-4 text-sm text-gray-500">
                              {employee.paymentDate
                                ? new Date(employee.paymentDate).toLocaleDateString('en-GB')
                                : '-'}
                            </td>
                            <td className="px-6 py-4 text-sm font-bold text-gray-900">
                              {employee.netSalary?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ❌ REMOVED: Add Employee Modal - No longer needed as employees are managed through Structure Assignment page */}

      {showReprocessModal && itemsToReprocess.length > 0 && (
        <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" onClick={() => setShowReprocessModal(false)}></div>
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="sm:flex sm:items-start">
                  <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                    <AlertTriangle className="h-6 w-6 text-red-600" aria-hidden="true" />
                  </div>
                  <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                    <h3 className="text-lg leading-6 font-medium text-gray-900" id="modal-title">Revert Payroll Process</h3>
                    <div className="mt-2">
                      <p className="text-sm text-gray-500">
                        Are you sure you want to revert the payroll for <span className="font-bold text-gray-700">{itemsToReprocess.length === 1 ? itemsToReprocess[0].name : `${itemsToReprocess.length} selected employees`}</span>?
                      </p>
                      <ul className="list-disc pl-5 mt-3 text-sm text-gray-500 space-y-1">
                        <li>This will reverse the previous payroll entries.</li>
                        <li>Any deducted advances will be returned automatically.</li>
                        <li className="text-red-600 font-medium">This action cannot be undone.</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse gap-2">
                <button type="button" onClick={handleConfirmReprocess} disabled={processing} className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50">
                  {processing ? 'Reverting...' : 'Yes, Revert'}
                </button>
                <button type="button" onClick={() => setShowReprocessModal(false)} disabled={processing} className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:w-auto sm:text-sm">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
