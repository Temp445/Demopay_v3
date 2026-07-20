import { supabase } from './supabase';
import { getTenantId } from './tenantDb';
import type { DeductionComponent } from './payroll';

export interface AdvanceInstallmentDeduction {
  installment_id: string;
  advance_id: string;
  amount: number;
  installment_number: number;
  employee_id: string;
  employee_name: string;
}

/**
 * Fetches advance installments due for a specific payroll month
 * @param payrollMonth Format: 'YYYY-MM'
 * @param tenantId Tenant ID
 * @returns Array of installments due for deduction
 */
export async function getAdvanceInstallmentsForPayroll(
  payrollMonth: string,
  tenantId: string
): Promise<AdvanceInstallmentDeduction[]> {
  try {
    const { data: installments, error } = await supabase
      .from('advance_installments')
      .select(`
        id,
        advance_id,
        amount,
        installment_number,
        due_month,
        status,
        employee_advances!inner (
          id,
          employee_id,
          status,
          tenant_id,
          employees!inner (
            id,
            name
          )
        )
      `)
      .eq('due_month', payrollMonth)
      .eq('status', 'scheduled')
      .eq('employee_advances.tenant_id', tenantId)
      .in('employee_advances.status', ['active', 'approved'])


    if (error) {
      console.error('Error fetching advance installments:', error);
      throw error;
    }

    if (!installments || installments.length === 0) {
      return [];
    }

    return installments.map((inst: any) => ({
      installment_id: inst.id,
      advance_id: inst.advance_id,
      amount: inst.amount,
      installment_number: inst.installment_number,
      employee_id: inst.employee_advances.employee_id,
      employee_name: inst.employee_advances.employees.name,
    }));
  } catch (error) {
    console.error('Failed to fetch advance installments for payroll:', error);
    throw error;
  }
}

/**
 * Fetches advance deductions for a specific employee for the payroll month
 * @param employeeId Employee ID
 * @param payrollMonth Format: 'YYYY-MM'
 * @param tenantId Tenant ID
 * @returns Array of deduction components for the employee
 */
export async function getEmployeeAdvanceDeductions(
  employeeId: string,
  payrollMonth: string,
  tenantId: string
): Promise<DeductionComponent[]> {
  try {
    const allInstallments = await getAdvanceInstallmentsForPayroll(payrollMonth, tenantId);

    const employeeInstallments = allInstallments.filter(
      inst => inst.employee_id === employeeId
    );
return employeeInstallments.map(inst => ({
  id: `advance-${inst.installment_id}`,     // required
  name: `Advance Recovery`,
  component_type: 'deduction',              // REQUIRED
  amount_type: 'fixed',                // SAFE
  amount: Number(inst.amount),               // MUST be number
  metadata: {                                // SAFE place for custom data
    type: 'advance_recovery',
    advance_installment_id: inst.installment_id,
    advance_id: inst.advance_id,
  }
}));

  } catch (error) {
    console.error('Failed to get employee advance deductions:', error);
    return [];
  }
}

/**
 * Marks installments as deducted after successful payroll processing
 * @param payrollId Payroll entry ID
 * @param installmentIds Array of installment IDs that were deducted
 */
export async function markInstallmentsAsDeducted(
  payrollId: string,
  installmentIds: string[]
): Promise<void> {
  if (!installmentIds || installmentIds.length === 0) {
    return;
  }

  console.log('Processing advance deductions for:', installmentIds);

  try {
    // 1. Mark installments as Deducted in DB
    // CORRECTION: Used 'deducted_date' to match your schema (was deducted_at)
    const { error: installmentError } = await supabase
      .from('advance_installments')
      .update({
        status: 'deducted',
        payroll_id: payrollId,
        deducted_date: new Date().toISOString().split('T')[0], // Format: YYYY-MM-DD
      })
      .in('id', installmentIds);
      // .eq('status', 'scheduled');

    if (installmentError) throw installmentError;

    // 2. Fetch the amounts to update the main balance
    const { data: installments, error: fetchError } = await supabase
      .from('advance_installments')
      .select('advance_id, amount')
      .in('id', installmentIds);

    if (fetchError) throw fetchError;
    if (!installments || installments.length === 0) return;

    // 3. Group deduction amounts by Advance ID
    const advanceUpdates = installments.reduce((acc: Record<string, number>, inst) => {
      acc[inst.advance_id] = (acc[inst.advance_id] || 0) + inst.amount;
      return acc;
    }, {});

    // 4. Update the remaining balance for each Advance
    for (const [advanceId, totalDeducted] of Object.entries(advanceUpdates)) {
      // First fetch current balance to be safe
      const { data: advance, error: advanceError } = await supabase
        .from('employee_advances')
        .select('remaining_balance')
        .eq('id', advanceId)
        .single();

      if (advanceError) {
        console.error(`Could not fetch advance ${advanceId}`, advanceError);
        continue;
      }

      const newBalance = Math.max(0, advance.remaining_balance - totalDeducted);
      
      // If balance is effectively zero, mark as completed
      const isCompleted = newBalance <= 0.01; 

      await supabase
        .from('employee_advances')
        .update({
          remaining_balance: newBalance,
          status: isCompleted ? 'completed' : 'active',
          // Only update completed_at if it wasn't completed before
          ...(isCompleted ? { updated_at: new Date().toISOString() } : {}) 
        })
        .eq('id', advanceId);
    }
  } catch (error) {
    console.error('Failed to mark installments as deducted:', error);
    throw error;
  }
}

/**
 * Adds advance deductions to existing deduction components
 * @param existingDeductions Current deduction components
 * @param employeeId Employee ID
 * @param payrollMonth Payroll month in format 'YYYY-MM'
 * @param tenantId Tenant ID
 * @returns Combined deduction components including advances
 */
export async function addAdvanceDeductionsToPayroll(
  existingDeductions: DeductionComponent[],
  employeeId: string,
  payrollMonth: string,
  tenantId: string
): Promise<DeductionComponent[]> {
  try {
    const advanceDeductions = await getEmployeeAdvanceDeductions(
      employeeId,
      payrollMonth,
      tenantId
    );

    return [...existingDeductions, ...advanceDeductions];
  } catch (error) {
    console.error('Failed to add advance deductions to payroll:', error);
    return existingDeductions;
  }
}

/**
 * Extracts advance installment IDs from deduction components
 * @param deductions Array of deduction components
 * @returns Array of advance installment IDs
 */
export function extractAdvanceInstallmentIds(deductions: DeductionComponent[]): string[] {
  if (!deductions || !Array.isArray(deductions)) return [];

  return deductions
    .filter(d => d.metadata?.type === 'advance_recovery') // IMPORTANT: check metadata
    .map(d => d.metadata?.advance_installment_id)
    .filter((id): id is string => !!id);
}
