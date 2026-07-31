import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { validateAuth } from './utils/storeUtils';
import type {
  OTProcessing,
  OTProcessWithDetails,
  OTProcessedData,
  CreateOTProcessInput,
  OTEligibleEmployee,
  OTComponent,
  OTProcessedComponent,
  EmployeeComponentValue,
} from '../types/overtime';
import {
  getOTProcesses,
  getOTProcess,
  createOTProcess,
  updateOTProcess,
  getEligibleEmployeesForOT,
  getOTStructureWithComponents,
  getOTProcessedData,
  saveOTProcessedData,
  bulkSaveOTProcessedData,
  finalizeOTProcess,
  calculateTotalOTAmount,
  getOTApprovals,
  getStandardMonthlyHours,
} from '../lib/otManagement';
import { getOvertimePolicies } from '../lib/overtime';

interface ProcessingEmployee extends OTEligibleEmployee {
  componentValues: Map<string, number>;
  masterValues: Record<string, number> | undefined; // Added to store resolved salary components
  totalAmount: number | undefined;
  processedComponents: OTProcessedComponent[] | undefined;
}

interface OTProcessingStore {
  processes: OTProcessing[];
  currentProcess: OTProcessWithDetails | null;
  eligibleEmployees: ProcessingEmployee[];
  processedData: OTProcessedData[];
  loading: boolean;
  modalLoading: boolean;
  error: string | null;
  componentNameToId: Record<string, string>; // Global mapping of cleaned name -> component UUID
  componentIdToName: Record<string, string>; // Global mapping of component UUID -> original name

  fetchProcesses: (status?: string) => Promise<void>;
  fetchProcess: (processId: string) => Promise<void>;
  createProcess: (input: CreateOTProcessInput) => Promise<string>;
  updateProcess: (processId: string, updates: Partial<OTProcessing>) => Promise<void>;
  cancelProcess: (processId: string) => Promise<void>;

  loadEligibleEmployees: (processId: string) => Promise<void>;
  fetchEligibleEmployees: (tenantId: string, startDate: string, endDate: string) => Promise<void>;
  updateComponentValue: (employeeId: string, componentId: string, value: number) => void;
  calculateProcess: (processId: string, employeeIds?: string[]) => Promise<void>;
  finalizeProcess: (processId: string) => Promise<void>;

  reset: () => void;
}

export const useOTProcessingStore = create<OTProcessingStore>((set, get) => ({
  processes: [],
  currentProcess: null,
  eligibleEmployees: [],
  processedData: [],
  loading: false,
  modalLoading: false,
  error: null,
  componentNameToId: {},
  componentIdToName: {},

  fetchProcesses: async (status) => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) {
      set({ error: 'Authentication required' });
      return;
    }

    set({ loading: true, error: null });

    try {
      const processes = await getOTProcesses(auth.tenantId, status);
      set({ processes, loading: false });
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
    }
  },

  fetchProcess: async (processId) => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) {
      set({ error: 'Authentication required' });
      return;
    }

    set({ modalLoading: true, error: null });

    try {
      const process = await getOTProcess(processId, auth.tenantId);
      if (!process) {
        throw new Error('Process not found');
      }

      // Fetch structure if exists
      let structure;
      if (process.ot_structure_id) {
        structure = await getOTStructureWithComponents(process.ot_structure_id, auth.tenantId);
      }

      // Fetch processed data
      const processedData = await getOTProcessedData(processId, auth.tenantId);

      const processWithDetails: OTProcessWithDetails = {
        ...process,
        structure,
        processedData,
      };

      set({ currentProcess: processWithDetails, processedData, modalLoading: false });
    } catch (error) {
      set({ error: (error as Error).message, modalLoading: false });
    }
  },

  createProcess: async (input) => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) {
      throw new Error('Authentication required');
    }

    set({ modalLoading: true });

    try {
      // Clean up input data: convert empty strings to null for UUID fields
      const cleanedInput = {
        ...input,
        linked_payroll_id: input.linked_payroll_id?.trim() || null,
        ot_structure_id: input.ot_structure_id?.trim() || null,
      };

      const processId = await createOTProcess(auth.tenantId, cleanedInput as any);
      
      await get().fetchProcesses();
      set({ modalLoading: false });
      return processId;
    } catch (error) {
      set({ modalLoading: false });
      throw error;
    }
  },

  updateProcess: async (processId, updates) => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) {
      throw new Error('Authentication required');
    }

    try {
      await updateOTProcess(processId, auth.tenantId, updates);
      await get().fetchProcess(processId);
    } catch (error) {
      throw error;
    }
  },

  cancelProcess: async (processId) => {
    const auth = await validateAuth();
    if (auth.isAuthenticated && auth.tenantId) {
      const { data } = await supabase.from('ot_processed_data').select('attendance_records').eq('ot_processing_id', processId);
      await get().updateProcess(processId, { processing_status: 'cancelled' });
      
      if (data && data.length > 0) {
        const approvalIdsToRevert = data.flatMap((p: any) => p.attendance_records?.map((a: any) => a.approvalId).filter(Boolean) || []);
        if (approvalIdsToRevert.length > 0) {
          await supabase
            .from('ot_approvals')
            .update({ is_processed: false })
            .in('id', approvalIdsToRevert)
            .eq('tenant_id', auth.tenantId);
        }
      }
    } else {
      await get().updateProcess(processId, { processing_status: 'cancelled' });
    }
    await get().fetchProcesses();
  },

  loadEligibleEmployees: async (processId) => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) {
      set({ error: 'Authentication required' });
      return;
    }

    try {
      const process = await getOTProcess(processId, auth.tenantId);
      if (!process) throw new Error('Process not found');

      // Get eligible employees with OT hours
      const employees = await getEligibleEmployeesForOT(
        auth.tenantId,
        process.processing_period_start,
        process.processing_period_end
      );

      // Get structure components
      let components: OTComponent[] = [];
      if (process.ot_structure_id) {
        const structure = await getOTStructureWithComponents(process.ot_structure_id, auth.tenantId);
        components = structure?.components || [];
      }

      // --- RESOLVE MASTER SALARY VALUES FOR WORKSHEET DISPLAY ---
      
      const employeeIds = employees.map(e => e.employee_id);
      
      // 1. Fetch employee structure assignments
      const { data: assignments } = await supabase
        .from('employee_salary_structure_assignments')
        .select('employee_id, salary_structure_id, individual_component_values')
        .or(`employee_id.in.(${employeeIds.join(',')}),employee_id.is.null`)
        .eq('tenant_id', auth.tenantId);

      // 2. Fetch all salary components for these structures
      const structureIds = Array.from(new Set(assignments?.map(s => s.salary_structure_id).filter(Boolean) || [])) as string[];

      const { data: structComponents } = await supabase
        .from('payroll_structure_components')
        .select('*')
        .in('structure_id', structureIds)
        .eq('tenant_id', auth.tenantId);

      // 3. Prepare value maps
      const individualOverrides: Record<string, Record<string, number>> = {};
      const structureDefaults: Record<string, Record<string, number>> = {};
      
      assignments?.forEach(a => {
        const values = (a.individual_component_values || {}) as Record<string, number>;
        if (a.employee_id) individualOverrides[a.employee_id] = values;
        else if (a.salary_structure_id) structureDefaults[a.salary_structure_id] = values;
      });

      const componentsByStructure: Record<string, any[]> = {};
      structComponents?.forEach(sc => {
        if (!componentsByStructure[sc.structure_id]) componentsByStructure[sc.structure_id] = [];
        componentsByStructure[sc.structure_id].push(sc);
      });

      // 4. Initialize employee data with component values and resolved master values
      const processingEmployees: ProcessingEmployee[] = employees.map(emp => {
        const assignment = assignments?.find(s => s.employee_id === emp.employee_id);
        const structureId = assignment?.salary_structure_id;
        const resolved: Record<string, number> = {};
        
        if (structureId) {
          const sComponents = componentsByStructure[structureId] || [];
          const sDefaults = structureDefaults[structureId] || {};
          const eOverrides = individualOverrides[emp.employee_id] || {};
          
          // First pass: Fill in fixed values
          sComponents.forEach(sc => {
            if (sc.amount_type === 'value') {
              if (eOverrides[sc.component_id] !== undefined) resolved[sc.component_id] = Number(eOverrides[sc.component_id]);
              else if (sDefaults[sc.component_id] !== undefined) resolved[sc.component_id] = Number(sDefaults[sc.component_id]);
              else resolved[sc.component_id] = Number(sc.amount) || 0;
            }
          });

          // Second pass: Resolve percentage components (Basic logic, can be refined if nested)
          let changed = true;
          let iterations = 0;
          while (changed && iterations < 3) {
            changed = false;
            iterations++;
            sComponents.forEach(sc => {
              if (sc.amount_type === 'percentage' && resolved[sc.component_id] === undefined) {
                const refs = (sc.reference_components || []) as string[];
                let baseSum = 0;
                let allRefsResolved = true;
                refs.forEach((refId: string) => {
                  if (refId && resolved[refId] !== undefined) baseSum += resolved[refId];
                  else if (refId) allRefsResolved = false;
                });
                if (allRefsResolved) {
                  const percentageValue = Number(sc.percentage || sc.percentage_value) || 0;
                  resolved[sc.component_id] = (baseSum * percentageValue) / 100;
                  changed = true;
                }
              }
            });
          }
        }

        return {
          ...emp,
          masterValues: resolved,
          componentValues: new Map(
            components
              .filter(c => c.component_type !== 'enter_later')
              .map(c => [c.id, c.value])
          ),
          totalAmount: undefined,
          processedComponents: undefined,
        };
      });

      // 5. Populate Name Mapping in state with FUZZY SUPPORT
      const { data: allComponents } = await supabase
        .from('payroll_components')
        .select('id, name')
        .eq('tenant_id', auth.tenantId);
      
      const nameMapping: Record<string, string> = {};
      const idMapping: Record<string, string> = {};
      const cleanName = (name: string) => name.replace(/[\[\]]/g, '').trim().toLowerCase();
      
      const registeredComponents = allComponents || [];
      
      // Pass 1: Exact cleaned match
      registeredComponents.forEach(c => {
        nameMapping[cleanName(c.name)] = c.id;
        idMapping[c.id] = c.name;
      });

      // Pass 2: Map shorthands to fuzzy matches (e.g. "basic" -> "basic salary")
      const commonTerms = ['basic', 'hra', 'conveyance', 'transport', 'medical', 'allowance'];
      commonTerms.forEach(term => {
        if (!nameMapping[term]) {
          const match = registeredComponents.find(c => cleanName(c.name).includes(term));
          if (match) nameMapping[term] = match.id;
        }
      });

      set({ 
        eligibleEmployees: processingEmployees, 
        componentNameToId: nameMapping,
        componentIdToName: idMapping,
        loading: false 
      });
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
    }
  },

  fetchEligibleEmployees: async (tenantId, startDate, endDate) => {
    set({ loading: true, error: null });
    try {
      const employees = await getEligibleEmployeesForOT(tenantId, startDate, endDate);

      // --- EXCLUDE EMPLOYEES ALREADY FINALIZED FOR THIS PERIOD ---
      const { data: finalizedData } = await supabase
        .from('ot_processed_data')
        .select(`
          employee_id,
          processing_status,
          ot_processing:ot_processing_id (
            processing_period_start,
            processing_period_end
          )
        `)
        .eq('tenant_id', tenantId);

      const finalizedEmployeeIds = new Set<string>();
      (finalizedData || []).forEach((row: any) => {
        const proc = row.ot_processing;
        const status = row.processing_status || proc?.processing_status;
        if (
          status === 'finalized' &&
          proc?.processing_period_start <= endDate &&
          proc?.processing_period_end >= startDate
        ) {
          finalizedEmployeeIds.add(row.employee_id);
        }
      });

      const unfinalizedEmployees = employees.filter(
        e => !finalizedEmployeeIds.has(e.employee_id)
      );

      const employeeIds = unfinalizedEmployees.map(e => e.employee_id);

      // --- RESOLVE MASTER SALARY VALUES ---
      
      // 1. Fetch employee structure assignments
      const { data: assignments } = await supabase
        .from('employee_salary_structure_assignments')
        .select('employee_id, salary_structure_id, individual_component_values')
        .or(`employee_id.in.(${employeeIds.join(',')}),employee_id.is.null`)
        .eq('tenant_id', tenantId);

      // 2. Fetch all salary components for these structures
      const structureIds = Array.from(new Set(assignments?.map(s => s.salary_structure_id).filter(Boolean) || [])) as string[];

      const { data: structComponents } = await supabase
        .from('payroll_structure_components')
        .select('*')
        .in('structure_id', structureIds)
        .eq('tenant_id', tenantId);

      // 3. Prepare maps
      const individualOverrides: Record<string, Record<string, number>> = {};
      const structureDefaults: Record<string, Record<string, number>> = {};
      
      assignments?.forEach(a => {
        const values = (a.individual_component_values || {}) as Record<string, number>;
        if (a.employee_id) individualOverrides[a.employee_id] = values;
        else if (a.salary_structure_id) structureDefaults[a.salary_structure_id] = values;
      });

      const componentsByStructure: Record<string, any[]> = {};
      structComponents?.forEach(sc => {
        if (!componentsByStructure[sc.structure_id]) componentsByStructure[sc.structure_id] = [];
        componentsByStructure[sc.structure_id].push(sc);
      });

      const processingEmployees: ProcessingEmployee[] = unfinalizedEmployees.map(emp => {
        const assignment = assignments?.find(s => s.employee_id === emp.employee_id);
        const structureId = assignment?.salary_structure_id;
        const resolved: Record<string, number> = {};
        
        if (structureId) {
          const sComponents = componentsByStructure[structureId] || [];
          const sDefaults = structureDefaults[structureId] || {};
          const eOverrides = individualOverrides[emp.employee_id] || {};
          
          sComponents.forEach(sc => {
            if (sc.amount_type === 'value') {
              if (eOverrides[sc.component_id] !== undefined) resolved[sc.component_id] = Number(eOverrides[sc.component_id]);
              else if (sDefaults[sc.component_id] !== undefined) resolved[sc.component_id] = Number(sDefaults[sc.component_id]);
              else resolved[sc.component_id] = Number(sc.amount) || 0;
            }
          });

          let changed = true;
          let iterations = 0;
          while (changed && iterations < 3) {
            changed = false;
            iterations++;
            sComponents.forEach(sc => {
              if (sc.amount_type === 'percentage' && resolved[sc.component_id] === undefined) {
                const refs = (sc.reference_components || []) as string[];
                let baseSum = 0;
                let allRefsResolved = true;
                refs.forEach((refId: string) => {
                  if (refId && resolved[refId] !== undefined) baseSum += resolved[refId];
                  else if (refId) allRefsResolved = false;
                });
                if (allRefsResolved) {
                  const percentageValue = Number(sc.percentage || sc.percentage_value) || 0;
                  resolved[sc.component_id] = (baseSum * percentageValue) / 100;
                  changed = true;
                }
              }
            });
          }
        }

        return {
          ...emp,
          masterValues: resolved,
          componentValues: new Map(),
          totalAmount: 0,
          processedComponents: [],
        };
      });

      // 5. Populate Name Mapping in state with FUZZY SUPPORT
      const { data: allComponents } = await supabase
        .from('payroll_components')
        .select('id, name')
        .eq('tenant_id', tenantId);
      
      const nameMapping: Record<string, string> = {};
      const idMapping: Record<string, string> = {};
      const cleanName = (name: string) => name.replace(/[\[\]]/g, '').trim().toLowerCase();
      
      const registeredComponents = allComponents || [];
      
      // Pass 1: Exact cleaned match
      registeredComponents.forEach(c => {
        nameMapping[cleanName(c.name)] = c.id;
        idMapping[c.id] = c.name;
      });

      // Pass 2: Map shorthands to fuzzy matches (e.g. "basic" -> "basic salary")
      // We only do this for targets that aren't already mapped
      const commonTerms = ['basic', 'hra', 'conveyance', 'transport', 'medical', 'allowance'];
      commonTerms.forEach(term => {
        if (!nameMapping[term]) {
          const match = registeredComponents.find(c => cleanName(c.name).includes(term));
          if (match) nameMapping[term] = match.id;
        }
      });

      set({ 
        eligibleEmployees: processingEmployees, 
        componentNameToId: nameMapping,
        componentIdToName: idMapping,
        loading: false 
      });
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
    }
  },

  updateComponentValue: (employeeId, componentId, value) => {
    set(state => ({
      eligibleEmployees: state.eligibleEmployees.map(emp =>
        emp.employee_id === employeeId
          ? {
              ...emp,
              componentValues: new Map(emp.componentValues).set(componentId, value),
            }
          : emp
      ),
    }));
  },

  calculateProcess: async (processId, employeeIds) => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) {
      throw new Error('Authentication required');
    }

    set({ loading: true });

    try {
      const process = await getOTProcess(processId, auth.tenantId);
      if (!process) {
        throw new Error('Process not found.');
      }

      const allEligible = get().eligibleEmployees;
      // Filter employees if specific IDs were provided
      const employeesToProcess = employeeIds 
        ? allEligible.filter(emp => employeeIds.includes(emp.employee_id))
        : allEligible;

      if (employeesToProcess.length === 0) {
        set({ loading: false });
        return;
      }

      // Fetch all unique structures needed
      const uniqueStructureIds = Array.from(new Set(employeesToProcess.map(e => e.ot_structure_id).filter(Boolean))) as string[];
      const structuresMap: Record<string, OTComponent[]> = {};
      
      await Promise.all(uniqueStructureIds.map(async (id) => {
        const struct = await getOTStructureWithComponents(id, auth.tenantId!);
        structuresMap[id] = struct?.components || [];
      }));

      // Fetch all approvals and master values once to avoid N+1 queries in the loop
      const approvals = await getOTApprovals(
        auth.tenantId,
        process.processing_period_start,
        process.processing_period_end,
        'approved'
      );

      // Get standard monthly hours divisor and global multiplier
      const policies = await getOvertimePolicies();
      const globalConfig = policies.find(p => p.is_default) || policies[0] || null;
      const globalMultiplier = globalConfig?.global_multiplier || 1.00;
      const standardMonthlyHours = await getStandardMonthlyHours(process.processing_period_start);

      // FETCH SALARY STRUCTURES AND RESOLVE PERCENTAGE COMPONENTS (like HRA)
      
      // 1. Fetch employee structure assignments to know which salary structure they use
      // 1. Fetch employee structure assignments
      const { data: assignments, error: assignmentsError } = await supabase
        .from('employee_salary_structure_assignments')
        .select('employee_id, salary_structure_id, individual_component_values')
        .or(`employee_id.in.(${employeesToProcess.map(e => e.employee_id).join(',')}),employee_id.is.null`)
        .eq('tenant_id', auth.tenantId);

      if (assignmentsError) throw assignmentsError;

      // 2. Fetch all salary components for these structures
      const structureIds = Array.from(new Set(assignments?.map(s => s.salary_structure_id).filter(Boolean) || [])) as string[];

      const { data: structComponents, error: structCompError } = await supabase
        .from('payroll_structure_components')
        .select('*')
        .in('structure_id', structureIds)
        .eq('tenant_id', auth.tenantId);

      if (structCompError) throw structCompError;

      // 3. (Already fetched above)

      // 4. Fetch salary components metadata once
      const { data: components, error: componentsError } = await supabase
        .from('payroll_components')
        .select('id, name, component_type')
        .eq('tenant_id', auth.tenantId);
      
      if (componentsError) throw componentsError;

      // --- HELPER MAPS ---
      const cleanName = (name: string) => name.replace(/[\[\]]/g, '').trim().toLowerCase();
      const componentNameToId: Record<string, string> = {};
      const componentIdToName: Record<string, string> = {};
      const earningComponentIds = new Set<string>();

      const registeredComponents = components || [];
      
      // Pass 1: Exact cleaned match
      registeredComponents.forEach(c => { 
        const cleaned = cleanName(c.name);
        componentNameToId[cleaned] = c.id;
        componentIdToName[c.id] = c.name;
        if (c.component_type?.toLowerCase() === 'earning') earningComponentIds.add(c.id);
      });

      // Pass 2: Fuzzy matching for common shorthands
      const commonTerms = ['basic', 'hra', 'conveyance', 'transport', 'medical', 'allowance'];
      commonTerms.forEach(term => {
        if (!componentNameToId[term]) {
          const match = registeredComponents.find(c => cleanName(c.name).includes(term));
          if (match) componentNameToId[term] = match.id;
        }
      });

      // Split assignments into individual overrides and structure-level defaults
      const individualOverrides: Record<string, Record<string, number>> = {};
      const structureDefaults: Record<string, Record<string, number>> = {};
      
      assignments?.forEach(a => {
        const values = (a.individual_component_values || {}) as Record<string, number>;
        if (a.employee_id) individualOverrides[a.employee_id] = values;
        else if (a.salary_structure_id) structureDefaults[a.salary_structure_id] = values;
      });

      // Group structure components by structureId (from payroll_structure_components)
      const componentsByStructure: Record<string, any[]> = {};
      structComponents?.forEach(sc => {
        if (!componentsByStructure[sc.structure_id]) componentsByStructure[sc.structure_id] = [];
        componentsByStructure[sc.structure_id].push(sc);
      });

      // 5. RESOLVE MASTER VALUES FOR EACH EMPLOYEE
      const masterValuesByEmployee: Record<string, Record<string, number>> = {};
      
      for (const employee of employeesToProcess) {
        const assignment = assignments?.find(s => s.employee_id === employee.employee_id);
        const structureId = assignment?.salary_structure_id;
        
        // Merge order: Structure Definition Defaults -> Structure Master Defaults (employee_id=null) -> Employee Individual Overrides
        const resolved: Record<string, number> = {};
        
        if (structureId) {
          const sComponents = componentsByStructure[structureId] || [];
          const sDefaults = structureDefaults[structureId] || {};
          const eOverrides = individualOverrides[employee.employee_id] || {};
          
          // First pass: Fill in fixed values from structure definition or defaults
          sComponents.forEach(sc => {
            if (sc.amount_type === 'value') {
              // Priority: 1. Employee Override, 2. Structure-level Master Default, 3. Component Definition Amount
              if (eOverrides[sc.component_id] !== undefined) {
                resolved[sc.component_id] = Number(eOverrides[sc.component_id]);
              } else if (sDefaults[sc.component_id] !== undefined) {
                resolved[sc.component_id] = Number(sDefaults[sc.component_id]);
              } else {
                resolved[sc.component_id] = Number(sc.amount) || 0;
              }
            }
          });

          // Second pass: Resolve percentage components (like HRA)
          let changed = true;
          let iterations = 0;
          while (changed && iterations < 3) {
            changed = false;
            iterations++;
            sComponents.forEach(sc => {
              if (sc.amount_type === 'percentage' && resolved[sc.component_id] === undefined) {
                // reference_components is uuid[] as per DDL
                const refs = (sc.reference_components || []) as string[];
                let baseSum = 0;
                let allRefsResolved = true;

                refs.forEach((refId: string) => {
                  // Since refs are already UUID strings, use them directly
                  if (refId && resolved[refId] !== undefined) {
                    baseSum += resolved[refId];
                  } else if (refId) {
                    allRefsResolved = false;
                  }
                });

                if (allRefsResolved) {
                  // Direct column name 'percentage' from DDL
                  const percentageValue = Number(sc.percentage || sc.percentage_value) || 0;
                  resolved[sc.component_id] = (baseSum * percentageValue) / 100;
                  changed = true;
                }
              }
            });
          }
        }
        masterValuesByEmployee[employee.employee_id] = resolved;
      }

      let totalSaved = 0;
      const bulkSavePayload: Array<any> = [];
      const updatedEmployees: ProcessingEmployee[] = [];

      // Calculate for each selected employee
      for (const employee of employeesToProcess) {
        // Build the effective component values for this employee
        const effectiveComponentValues = new Map<string, number>();
        const empMasters = masterValuesByEmployee[employee.employee_id] || {};

        const empStructureComps = employee.ot_structure_id ? (structuresMap[employee.ot_structure_id] || []) : [];
        for (const comp of empStructureComps) {
          if (comp.calculation_type === 'percentage' && comp.percentage_of) {
            let baseAmount = 0;
            const ref = comp.percentage_of.toLowerCase().trim();

            if (
              ref === 'gross salary' || 
              ref === 'gross pay' || 
              ref === 'gross' || 
              ref === 'total earnings' || 
              ref === 'total monthly salary'
            ) {
              // Sum ONLY earnings for the Gross Salary base
              baseAmount = Object.entries(empMasters).reduce((sum, [id, val]) => {
                return earningComponentIds.has(id) ? sum + val : sum;
              }, 0);
            } else {
              const cleanedRef = cleanName(comp.percentage_of);
              const refId = componentNameToId[cleanedRef];
              baseAmount = refId ? (empMasters[refId] || 0) : comp.value;
            }
            effectiveComponentValues.set(comp.id, baseAmount);
          } else {
            // Check if user entered a custom value in the store state first
            const userValue = employee.componentValues?.get(comp.id);
            effectiveComponentValues.set(comp.id, userValue !== undefined ? userValue : comp.value);
          }
        }

        const { components: processedComponents, total } = calculateTotalOTAmount(
          empStructureComps,
          employee.total_ot_hours,
          effectiveComponentValues,
          standardMonthlyHours,
          globalMultiplier
        );

        const employeeApprovals = approvals.filter(a => a.employee_id === employee.employee_id);
        const attendanceRecords = employeeApprovals.map(a => ({
          date: a.attendance_date,
          hours: a.corrected_ot_hours || a.original_ot_hours,
          approvalId: a.id,
        }));

        // Bundle processed data for bulk saving
        bulkSavePayload.push({
          employeeId: employee.employee_id,
          structureId: employee.ot_structure_id,
          totalOTHours: employee.total_ot_hours,
          totalOTAmount: total,
          components: processedComponents,
          attendanceRecords,
        });

        totalSaved += total;

        updatedEmployees.push({
          ...employee,
          totalAmount: total,
          processedComponents
        });
      }

      // Execute bulk save to Supabase
      if (bulkSavePayload.length > 0) {
        await bulkSaveOTProcessedData(auth.tenantId, processId, bulkSavePayload);
        
        const approvalIdsToMark = bulkSavePayload.flatMap(p => p.attendanceRecords.map(a => a.approvalId).filter(Boolean)) as string[];
        if (approvalIdsToMark.length > 0) {
          await supabase
            .from('ot_approvals')
            .update({ is_processed: true })
            .in('id', approvalIdsToMark)
            .eq('tenant_id', auth.tenantId);
        }
      }

      // Construct a lookup to map updated values efficiently without N updates to the store
      const mappedUpdates = new Map(updatedEmployees.map(emp => [emp.employee_id, emp]));

      // Update employee in local state synchronously once
      set(state => ({
        eligibleEmployees: state.eligibleEmployees.map(emp => {
          const updated = mappedUpdates.get(emp.employee_id);
          return updated ? updated : emp;
        }),
      }));

      // processedEmployees = only those we just processed (not all eligible)
      const processedCount = employeesToProcess.length;

      // Update process totals in DB
      await updateOTProcess(processId, auth.tenantId, {
        total_employees: processedCount,
        total_ot_amount: totalSaved,
        processing_status: 'completed',
        processed_at: new Date().toISOString(),
      });

      await get().fetchProcess(processId);
      await get().fetchProcesses();
      set({ loading: false });
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
      throw error;
    }
  },

  finalizeProcess: async (processId) => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated || !auth.tenantId) {
      throw new Error('Authentication required');
    }

    set({ loading: true });

    try {
      const process = await getOTProcess(processId, auth.tenantId);
      if (!process) throw new Error('Process not found');

      if (process.processing_status !== 'completed') {
        throw new Error('Process must be completed before finalization');
      }

      // If linked mode, integrate with payroll
      if (process.processing_mode === 'linked' && process.linked_payroll_id) {
        const processedData = await getOTProcessedData(processId, auth.tenantId);

        // Add OT components to payroll for each employee
        for (const empData of processedData) {
          for (const component of empData.components) {
            // Insert into payroll components or salary structures as earnings
            // This would integrate with your existing payroll system
            // For now, just log the integration point
            console.log('Integrating with payroll:', {
              employeeId: empData.employee_id,
              component: component.componentName,
              amount: component.amount,
              payrollId: process.linked_payroll_id,
            });
          }
        }
      }

      await finalizeOTProcess(processId, auth.tenantId);
      await get().fetchProcess(processId);
      await get().fetchProcesses();
      set({ loading: false });
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
      throw error;
    }
  },

  reset: () => set({
    processes: [],
    currentProcess: null,
    eligibleEmployees: [],
    processedData: [],
    loading: false,
    modalLoading: false,
    error: null,
  }),
}));
