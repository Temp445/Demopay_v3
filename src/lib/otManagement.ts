import { supabase } from './supabase';
import { getOvertimePolicies } from './overtime';
import type {
  EmployeeOTEligibility,
  OTStructure,
  OTComponent,
  OTApproval,
  OTProcessing,
  OTProcessedData,
  CreateOTStructureInput,
  CreateOTComponentInput,
  CreateOTProcessInput,
  UpdateOTApprovalInput,
  OTEligibleEmployee,
  OTProcessedComponent,
} from '../types/overtime';

// ============================================================================
// OT Sync: Scan attendance logs and generate OT approval records
// ============================================================================

export interface OTSyncStats {
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  removed: number;
  errors: number;
}

export interface OTSyncProgress {
  current: number;
  total: number;
  employeeName: string;
}

/**
 * Extracts HH:MM:SS time string in LOCAL timezone from a timestamptz string.
 * IMPORTANT: Must use local time (not UTC) because shift start/end times in
 * the DB are stored as local time values (e.g., '10:00:00' = 10 AM local).
 * Using .toISOString() (UTC) causes a timezone offset bug — e.g., 10:00 AM IST
 * becomes 04:30 UTC, making the system think the employee arrived 5.5 hours early.
 */
function toLocalTimeString(timestamp: string): string {
  const d = new Date(timestamp);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

/**
 * Scans attendance logs for a date range, calculates overtime for each
 * employee using the existing calculate_overtime DB function, and upserts
 * records into ot_approvals (pending). Already approved/rejected records
 * are never overwritten.
 */
export async function syncOTFromAttendanceLogs(
  tenantId: string,
  startDate: string,
  endDate: string,
  onProgress?: (progress: OTSyncProgress) => void,
  filterShiftIds?: string[],
  filterEmployeeIds?: string[]
): Promise<OTSyncStats> {
  onProgress?.({ current: 0, total: 100, employeeName: 'Preparing bulk sync...' });

  const { data, error } = await supabase.rpc('sync_ot_from_attendance_bulk', {
    p_start_date: startDate,
    p_end_date: endDate,
    p_shift_ids: (filterShiftIds && filterShiftIds.length > 0) ? filterShiftIds : null,
    p_employee_ids: (filterEmployeeIds && filterEmployeeIds.length > 0) ? filterEmployeeIds : null,
    p_tenant_id: tenantId
  });

  if (error) {
    console.error('Bulk sync OT error:', error);
    throw new Error(error.message);
  }

  onProgress?.({ current: 100, total: 100, employeeName: 'Sync complete' });
  return data as OTSyncStats;
}



// Helper function to safely get the local date string (YYYY-MM-DD)
// This prevents bugs where UTC conversion pushes the date backward by 1 day
function getLocalDateString(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function getTenantId(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const { data } = await supabase
    .from('tenant_users')
    .select('tenant_id')
    .eq('user_id', session.user.id)
    .single();

  return data?.tenant_id || null;
}

// Employee OT Eligibility
export async function getEmployeeOTEligibility(tenantId: string): Promise<EmployeeOTEligibility[]> {
  const { data, error } = await supabase
    .from('employee_ot_eligibility')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function upsertEmployeeOTEligibility(
  tenantId: string,
  employeeId: string,
  isEligible: boolean,
  effectiveFrom?: string,
  notes?: string
): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;

  const { error } = await supabase
    .from('employee_ot_eligibility')
    .upsert({
      tenant_id: tenantId,
      employee_id: employeeId,
      is_ot_eligible: isEligible,
      effective_from: effectiveFrom || getLocalDateString(), // Using safe local date
      notes,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'tenant_id,employee_id'
    });

  if (error) throw error;
}

export async function bulkUpdateOTEligibility(
  tenantId: string,
  employeeIds: string[],
  isEligible: boolean
): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;

  const updates = employeeIds.map(employeeId => ({
    tenant_id: tenantId,
    employee_id: employeeId,
    is_ot_eligible: isEligible,
    effective_from: getLocalDateString(), // Using safe local date
    updated_by: userId,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('employee_ot_eligibility')
    .upsert(updates, { onConflict: 'tenant_id,employee_id' });

  if (error) throw error;
}

// OT Structures
export async function getOTStructures(tenantId: string): Promise<OTStructure[]> {
  const { data, error } = await supabase
    .from('ot_structures')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getOTStructureWithComponents(structureId: string, tenantId: string): Promise<OTStructure | null> {
  const { data, error } = await supabase
    .from('ot_structures')
    .select(`
      *,
      components:ot_structure_components(*)
    `)
    .eq('id', structureId)
    .eq('tenant_id', tenantId)
    .single();

  if (error) throw error;
  return data;
}

export async function createOTStructure(
  tenantId: string,
  input: CreateOTStructureInput
): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;

  const { data, error } = await supabase
    .from('ot_structures')
    .insert({
      tenant_id: tenantId,
      ...input,
      created_by: userId,
      updated_by: userId,
    })
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}

export async function updateOTStructure(
  structureId: string,
  tenantId: string,
  updates: Partial<CreateOTStructureInput>
): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;

  const { error } = await supabase
    .from('ot_structures')
    .update({
      ...updates,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', structureId)
    .eq('tenant_id', tenantId);

  if (error) throw error;
}

export async function deleteOTStructure(structureId: string, tenantId: string): Promise<void> {
  // 0. Check if structure is in use by any active overtime policy
  const { data: policies, error: policyError } = await supabase
    .from('overtime_policies')
    .select('name')
    .eq('ot_structure_id', structureId)
    .eq('tenant_id', tenantId)
    .limit(1);

  if (policyError) throw policyError;

  if (policies && policies.length > 0) {
    throw new Error(`Cannot delete this structure because it is currently assigned to the overtime policy: ${policies[0].name}`);
  }

  // 1. Disconnect from historical records to preserve audit trail
  // Nullify structure reference in individual processed records
  const { error: dataError } = await supabase
    .from('ot_processed_data')
    .update({ ot_structure_id: null })
    .eq('ot_structure_id', structureId)
    .eq('tenant_id', tenantId);

  if (dataError) throw dataError;

  // Nullify structure reference in processing batches
  const { error: processingError } = await supabase
    .from('ot_processing')
    .update({ ot_structure_id: null })
    .eq('ot_structure_id', structureId)
    .eq('tenant_id', tenantId);

  if (processingError) throw processingError;

  // 2. Delete child components (these are specific to this structure)
  const { error: componentsError } = await supabase
    .from('ot_structure_components')
    .delete()
    .eq('ot_structure_id', structureId)
    .eq('tenant_id', tenantId);

  if (componentsError) throw componentsError;

  // 3. Delete the structure record itself
  const { error: structureError } = await supabase
    .from('ot_structures')
    .delete()
    .eq('id', structureId)
    .eq('tenant_id', tenantId);

  if (structureError) throw structureError;
}

export async function cloneOTStructure(
  sourceStructureId: string,
  newName: string,
  tenantId: string
): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;

  const { data, error } = await supabase.rpc('clone_ot_structure', {
    p_source_structure_id: sourceStructureId,
    p_new_structure_name: newName,
    p_tenant_id: tenantId,
    p_user_id: userId,
  });

  if (error) throw error;
  return data;
}

// OT Components
export async function getOTComponents(structureId: string, tenantId: string): Promise<OTComponent[]> {
  const { data, error } = await supabase
    .from('ot_structure_components')
    .select('*')
    .eq('ot_structure_id', structureId)
    .eq('tenant_id', tenantId)
    .order('display_order', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function addOTComponent(
  tenantId: string,
  structureId: string,
  component: CreateOTComponentInput
): Promise<string> {
  const { data, error } = await supabase
    .from('ot_structure_components')
    .insert({
      tenant_id: tenantId,
      ot_structure_id: structureId,
      ...component,
    })
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}

export async function updateOTComponent(
  componentId: string,
  tenantId: string,
  updates: Partial<CreateOTComponentInput>
): Promise<void> {
  const { error } = await supabase
    .from('ot_structure_components')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', componentId)
    .eq('tenant_id', tenantId);

  if (error) throw error;
}

export async function deleteOTComponent(componentId: string, tenantId: string): Promise<void> {
  const { error } = await supabase
    .from('ot_structure_components')
    .delete()
    .eq('id', componentId)
    .eq('tenant_id', tenantId);

  if (error) throw error;
}

export async function reorderOTComponents(
  tenantId: string,
  componentOrders: { id: string; display_order: number }[]
): Promise<void> {
  // Uses Promise.all to run updates in parallel rather than sequentially blocking the thread
  const updatePromises = componentOrders.map(({ id, display_order }) => 
    supabase
      .from('ot_structure_components')
      .update({ display_order, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', tenantId)
  );

  const results = await Promise.all(updatePromises);
  
  // Check if any of the parallel requests failed
  const errors = results.filter(r => r.error).map(r => r.error);
  if (errors.length > 0) {
    throw new Error(`Failed to reorder components: ${errors[0]?.message}`);
  }
}

// OT Approvals
export async function getOTApprovals(
  tenantId: string,
  startDate?: string,
  endDate?: string,
  status?: string
): Promise<OTApproval[]> {
  let query = supabase
    .from('ot_approvals')
    .select('*')
    .eq('tenant_id', tenantId);

  if (startDate) {
    query = query.gte('attendance_date', startDate);
  }
  if (endDate) {
    query = query.lte('attendance_date', endDate);
  }
  if (status) {
    query = query.eq('approval_status', status);
  }

  query = query.order('attendance_date', { ascending: false });

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function updateOTApproval(
  approvalId: string,
  tenantId: string,
  updates: UpdateOTApprovalInput
): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;

  const updateData: any = {
    ...updates,
    updated_at: new Date().toISOString(),
  };

  if (updates.approval_status === 'approved') {
    updateData.approved_by = userId;
    updateData.approved_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from('ot_approvals')
    .update(updateData)
    .eq('id', approvalId)
    .eq('tenant_id', tenantId);

  if (error) throw error;
}

export async function bulkApproveOT(
  tenantId: string,
  approvalIds: string[]
): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;

  const { error } = await supabase
    .from('ot_approvals')
    .update({
      approval_status: 'approved',
      approved_by: userId,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .in('id', approvalIds)
    .eq('tenant_id', tenantId);

  if (error) throw error;
}

export async function createOTApprovalFromAttendance(
  tenantId: string,
  employeeId: string,
  attendanceLogId: string,
  attendanceDate: string,
  otHours: number
): Promise<void> {
  const { error } = await supabase
    .from('ot_approvals')
    .insert({
      tenant_id: tenantId,
      employee_id: employeeId,
      attendance_log_id: attendanceLogId,
      attendance_date: attendanceDate,
      original_ot_hours: otHours,
      approval_status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(), // Fixed: Added updated_at
    });

  if (error) throw error;
}

export async function deleteOTApproval(
  approvalId: string,
  tenantId: string
): Promise<void> {
  const { error } = await supabase
    .from('ot_approvals')
    .delete()
    .eq('id', approvalId)
    .eq('tenant_id', tenantId);

  if (error) throw error;
}

// OT Processing
export async function getOTProcesses(
  tenantId: string,
  status?: string
): Promise<OTProcessing[]> {
  let query = supabase
    .from('ot_processing')
    .select('*')
    .eq('tenant_id', tenantId);

  if (status) {
    query = query.eq('processing_status', status);
  }

  query = query.order('created_at', { ascending: false });

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function getOTProcess(processId: string, tenantId: string): Promise<OTProcessing | null> {
  const { data, error } = await supabase
    .from('ot_processing')
    .select('*')
    .eq('id', processId)
    .eq('tenant_id', tenantId)
    .single();

  if (error) throw error;
  return data;
}

export async function createOTProcess(
  tenantId: string,
  input: CreateOTProcessInput
): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;

  // Check if a process already exists for these dates
  const { data: existing } = await supabase
    .from('ot_processing')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('processing_period_start', input.processing_period_start)
    .eq('processing_period_end', input.processing_period_end)
    .neq('processing_status', 'cancelled')
    .limit(1)
    .maybeSingle();

  if (existing) {
    // Update existing process with new input data
    await supabase
      .from('ot_processing')
      .update({
        ...input,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
    return existing.id;
  }

  const { data, error } = await supabase
    .from('ot_processing')
    .insert({
      tenant_id: tenantId,
      ...input,
      processing_status: 'draft',
      total_employees: 0,
      total_ot_amount: 0,
      created_by: userId,
      updated_by: userId,
    })
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}

export async function updateOTProcess(
  processId: string,
  tenantId: string,
  updates: Partial<OTProcessing>
): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;

  const { error } = await supabase
    .from('ot_processing')
    .update({
      ...updates,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', processId)
    .eq('tenant_id', tenantId);

  if (error) throw error;
}

export async function getEligibleEmployeesForOT(
  tenantId: string,
  periodStart: string,
  periodEnd: string
): Promise<OTEligibleEmployee[]> {
  // We'll use a standard query instead of RPC to avoid dependency on database function updates
  const { data, error } = await supabase
    .from('ot_approvals')
    .select(`
      employee_id,
      original_ot_hours,
      corrected_ot_hours,
      employee:employee_id (
        id,
        name,
        employee_code,
        department:department_id (
          name
        )
      ),
      applied_policy_id,
      applied_policy_name,
      policy:overtime_policies!applied_policy_id (
        id,
        name,
        ot_structure_id
      )
    `)
    .eq('tenant_id', tenantId)
    .eq('approval_status', 'approved')
    .gte('attendance_date', periodStart)
    .lte('attendance_date', periodEnd);

  if (error) throw error;
  if (!data) return [];

  // Group by employee and applied_policy_id to aggregate hours per policy
  const grouped = data.reduce((acc, curr: any) => {
    const empId = curr.employee_id;
    const policyId = curr.applied_policy_id || 'default';
    const groupKey = `${empId}_${policyId}`;
    
    const hours = Number(curr.corrected_ot_hours || curr.original_ot_hours || 0);

    if (!acc[groupKey]) {
      acc[groupKey] = {
        employee_id: empId,
        employee_name: curr.employee?.name || 'Unknown',
        employee_code: curr.employee?.employee_code || '-',
        department: curr.employee?.department?.name || 'General',
        total_ot_hours: 0,
        applied_policy_id: curr.applied_policy_id,
        applied_policy_name: curr.applied_policy_name || curr.policy?.name || 'Default Policy',
        ot_structure_id: curr.policy?.ot_structure_id || null
      };
    }
    // Precision: Ensure we treat numeric hours correctly
    // If the input is like 5.50 (meaning 5h 30m), it's 5.5.
    // If the user meant 5h 50m, it should have been 5.83 in the DB.
    acc[groupKey].total_ot_hours += hours;
    return acc;
  }, {} as Record<string, OTEligibleEmployee>);

  // Return only those with > 0 hours
  return Object.values(grouped).filter(emp => emp.total_ot_hours > 0);
}

export async function getOTProcessedData(
  processId: string,
  tenantId: string
): Promise<OTProcessedData[]> {
  const { data, error } = await supabase
    .from('ot_processed_data')
    .select('*')
    .eq('ot_processing_id', processId)
    .eq('tenant_id', tenantId);

  if (error) throw error;
  return data || [];
}

export async function saveOTProcessedData(
  tenantId: string,
  processId: string,
  employeeData: {
    employeeId: string;
    structureId: string;
    totalOTHours: number;
    totalOTAmount: number;
    components: OTProcessedComponent[];
    attendanceRecords: any[];
  }
): Promise<void> {
  // Use upsert to prevent duplicates for the same employee in the same process
  // Note: This requires a unique constraint on (ot_processing_id, employee_id)
  // which we handle via onConflict if not natively present in DDL
  const { error } = await supabase
    .from('ot_processed_data')
    .upsert({
      tenant_id: tenantId,
      ot_processing_id: processId,
      employee_id: employeeData.employeeId,
      ot_structure_id: employeeData.structureId,
      total_ot_hours: employeeData.totalOTHours,
      total_ot_amount: employeeData.totalOTAmount,
      components: employeeData.components,
      attendance_records: employeeData.attendanceRecords,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'ot_processing_id,employee_id'
    });

  if (error) throw error;
}

export async function bulkSaveOTProcessedData(
  tenantId: string,
  processId: string,
  employeesData: Array<{
    employeeId: string;
    structureId: string;
    totalOTHours: number;
    totalOTAmount: number;
    components: OTProcessedComponent[];
    attendanceRecords: any[];
  }>
): Promise<void> {
  if (employeesData.length === 0) return;

  const insertPayload = employeesData.map(data => ({
    tenant_id: tenantId,
    ot_processing_id: processId,
    employee_id: data.employeeId,
    ot_structure_id: data.structureId,
    total_ot_hours: data.totalOTHours,
    total_ot_amount: data.totalOTAmount,
    components: data.components,
    attendance_records: data.attendanceRecords,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('ot_processed_data')
    .upsert(insertPayload, {
      onConflict: 'ot_processing_id,employee_id'
    });

  if (error) throw error;
}

export async function finalizeOTProcess(
  processId: string,
  tenantId: string
): Promise<void> {
  const { error } = await supabase
    .from('ot_processing')
    .update({
      processing_status: 'finalized',
      finalized_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', processId)
    .eq('tenant_id', tenantId);

  if (error) throw error;
}



/**
 * Get the standard working hours divisor for a given month/year
 * Aligned with functional spec: Total Working Days × Working Hours per Day
 */
export async function getStandardMonthlyHours(dateStr?: string): Promise<number> {
  const policies = await getOvertimePolicies();
  const config = policies.find(p => p.is_default) || policies[0];
  if (!config) return 208; // Fallback: 26 days * 8 hours

  // Total Working Days calculation
  let workingDays = config.fixed_days;
  
  if (config.monthly_hours_type === 'calendar_days') {
    const date = dateStr ? new Date(dateStr) : new Date();
    const year = date.getFullYear();
    const month = date.getMonth();
    workingDays = new Date(year, month + 1, 0).getDate();
  }

  // Formula: (Total Working Days × Working Hours per Day)
  return workingDays * config.working_hours_per_day;
}

// Calculation utilities
export function calculateOTComponentAmount(
  component: OTComponent,
  otHours: number,
  baseAmount: number,
  standardHours: number,
  globalMultiplier: number = 1.00
): number {
  switch (component.calculation_type) {
    case 'flat':
      return component.value;
    case 'hourly_rate':
      return component.value * otHours;
    case 'percentage':
      // Formula: (Base Amount * Percentage / 100 / Standard Hours) * OT Hours * Global Multiplier
      // This handles multipliers like 150% (1.5x) or 200% (2.0x) naturally
      return (baseAmount * (component.value / 100) / standardHours) * otHours * globalMultiplier;
    default:
      return 0;
  }
}

export function calculateTotalOTAmount(
  components: OTComponent[],
  otHours: number,
  componentValues: Map<string, number>,
  standardHours: number,
  globalMultiplier: number = 1.00
): { components: OTProcessedComponent[]; total: number } {
  const processedComponents: OTProcessedComponent[] = [];
  let total = 0;

  for (const component of components) {
    if (!component.is_active) continue;

    let amount = 0;
    let displayValue = component.value;

    if (component.calculation_type === 'percentage') {
      const baseAmount = componentValues.get(component.id) || 0;
      amount = calculateOTComponentAmount(component, otHours, baseAmount, standardHours, globalMultiplier);
      displayValue = component.value;
    } else if (component.calculation_type === 'hourly_rate') {
      const rate = componentValues.has(component.id) ? componentValues.get(component.id)! : component.value;
      amount = rate * otHours;
      displayValue = rate;
    } else {
      // flat
      amount = componentValues.has(component.id) ? componentValues.get(component.id)! : component.value;
      displayValue = amount;
    }

    processedComponents.push({
      componentId: component.id,
      componentName: component.component_name,
      componentType: component.component_type,
      calculationType: component.calculation_type,
      value: displayValue,
      amount: Number(amount.toFixed(2)),
    });

    total += amount;
  }

  return { components: processedComponents, total: Number(total.toFixed(2)) };
}