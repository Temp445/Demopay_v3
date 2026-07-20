import { SalaryStructureComponent } from './salaryStructures';
import { supabase } from './supabase';
import { getTenantId } from './tenantDb';

export interface SalaryComponent {
  name: string;
  amount: number;
  calculation_method?: 'fixed' | 'entry' | 'percentage';
  percentage_value?: number;
  reference_components?: string[];
}

export interface DeductionComponent {
  name: string;
  amount: number;
  calculation_method?: 'fixed' | 'entry' | 'percentage';
  percentage_value?: number;
  reference_components?: string[];
  type?: string;
  advance_installment_id?: string;
}

export interface PayrollEntry {
  id: string;
  employee_id: string;
  employee_code?: string;
  period_start: string;
  period_end: string;
  base_salary: number;
  salary_components: SalaryComponent[];
  overtime_hours: number;
  overtime_rate: number;
  deductions: number;
  deduction_components: DeductionComponent[];
  bonus: number;
  total_amount: number;
  status: 'Draft' | 'Pending' | 'Approved' | 'Paid';
  payment_date: string | null;
  attendance_summary?: {
    total_working_days: number;
    total_present_days: number;
    total_absent_days: number;
    total_leave_days: number;
    total_paid_leave_days: number;
    payable_days_factor: number;
  };
  calculation_components?: Record<string, number>;
  created_at?: string;
  updated_at?: string;
  employee?: {
    name: string;
    email: string;
    department_id?: string;
    role_id?: string;
  };
}

export interface PayrollProcessEntry {
  id: string;
  employee_id: string;
  employee_code?: string;
  period_start: string;
  period_end: string;
  salary_components: SalaryComponent[];
  deduction_components: DeductionComponent[];
  total_amount: number;
  status: 'Draft' | 'Pending' | 'Approved' | 'Paid';
  payment_date: string | null;
  attendance_summary?: {
    total_working_days: number;
    total_present_days: number;
    total_absent_days: number;
    total_leave_days: number;
    total_paid_leave_days: number;
    payable_days_factor: number;
  };
  calculation_components?: Record<string, number>;
  created_at?: string;
  updated_at?: string;
  employee?: {
    name: string;
    email: string;
    department_id?: string;
    role_id?: string;
  };
}

export interface PayrollSummary {
  total_payroll: number;
  total_employees: number;
  total_overtime: number;
  total_bonus: number;
  total_salary_components: number;
  total_deduction_components: number;
}

export async function getPayrollEntries(
  period_start?: string,
  period_end?: string
) {

  const tenantId = await getTenantId();

  let query = supabase
    .from('payroll')
    .select(
      `
      *,
      employee:employees (
        name,
        email,
        employee_code,
        department:departments(name),
        role:roles(name),
        cadre:cadres(name)
      )
    `
    )
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (period_start && period_end) {
    query = query
      .gte('period_start', period_start)
      .lte('period_end', period_end);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function getPayrollSummary(
  period_start: string,
  period_end: string
): Promise<PayrollSummary> {
  const tenantId = await getTenantId();
  const { data, error } = await supabase.rpc('get_payroll_summary', {
    p_start: period_start,
    p_end: period_end,
    p_tenant_id:tenantId
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function createPayProcessEntry(
  entry: Omit<PayrollEntry, 'id' | 'created_at' | 'updated_at'>
) {
  // Ensure salary_components and deduction_components are initialized
  const salary_components =
    entry.salary_components?.length > 0
      ? entry.salary_components
      : [{ name: 'Base Salary', amount: entry.base_salary }];

  const deduction_components =
    entry.deduction_components?.length > 0
      ? entry.deduction_components
      : entry.deductions > 0
      ? [{ name: 'Standard Deduction', amount: entry.deductions }]
      : [];

  // Include attendance data if provided
  const attendanceData = entry.attendance_summary
    ? { attendance_summary: entry.attendance_summary }
    : {};

  const tenantId = await getTenantId();

  const { data, error } = await supabase
    .from('payroll')
    .insert([
      {
        ...entry,
        salary_components,
        deduction_components,
        // Ensure base_salary matches total of salary components
        base_salary: salary_components.reduce(
          (sum, comp) => sum + comp.amount,
          0
        ),
        // Ensure deductions matches total of deduction components
        deductions: deduction_components.reduce(
          (sum, comp) => sum + comp.amount,
          0
        ),
        ...attendanceData,
        tenant_id:tenantId
      },
    ])
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function updatePayProcessEntry(
  id: string,
  updates: Partial<PayrollEntry>
) {
  const finalUpdates: Partial<PayrollEntry> = { ...updates };

  // If updating status to Paid, set payment date
  if (updates.status === 'Paid') {
    finalUpdates.payment_date = new Date().toISOString();
  }

  // Handle salary components updates
  if ('salary_components' in updates || 'base_salary' in updates) {
    if (!updates.salary_components || updates.salary_components.length === 0) {
      finalUpdates.salary_components = [];
      finalUpdates.base_salary = 0;
    } else {
      finalUpdates.salary_components = updates.salary_components;
      finalUpdates.base_salary = updates.salary_components.reduce(
        (sum, comp) => sum + comp.amount,
        0
      );
    }
  }

  // Handle deduction components updates
  if ('deduction_components' in updates || 'deductions' in updates) {
    if (
      !updates.deduction_components ||
      updates.deduction_components.length === 0
    ) {
      finalUpdates.deduction_components = [];
      finalUpdates.deductions = 0;
    } else {
      finalUpdates.deduction_components = updates.deduction_components;
      finalUpdates.deductions = updates.deduction_components.reduce(
        (sum, comp) => sum + comp.amount,
        0
      );
    }
  }

  const tenantId = await getTenantId();
  const { data, error } = await supabase
    .from('payroll')
    .update(finalUpdates)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function deletePayProcessEntry(id: string) {
  const tenantId = await getTenantId();
  const { error } = await supabase.from('payroll').delete().eq('id', id).eq('tenant_id', tenantId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function createPayrollEntry(
  entry: Omit<PayrollEntry, 'id' | 'created_at' | 'updated_at'>
) {
  // Ensure salary_components and deduction_components are initialized
  const salary_components =
    entry.salary_components?.length > 0
      ? entry.salary_components
      : [{ name: 'Base Salary', amount: entry.base_salary }];

  const deduction_components =
    entry.deduction_components?.length > 0
      ? entry.deduction_components
      : entry.deductions > 0
      ? [{ name: 'Standard Deduction', amount: entry.deductions }]
      : [];

  // Include attendance data if provided
  const attendanceData = entry.attendance_summary
    ? { attendance_summary: entry.attendance_summary }
    : {};

  const { data, error } = await supabase
    .from('payroll')
    .insert([
      {
        ...entry,
        salary_components,
        deduction_components,
        // Ensure base_salary matches total of salary components
        base_salary: salary_components.reduce(
          (sum, comp) => sum + comp.amount,
          0
        ),
        // Ensure deductions matches total of deduction components
        deductions: deduction_components.reduce(
          (sum, comp) => sum + comp.amount,
          0
        ),
        ...attendanceData,
      },
    ])
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function updatePayrollEntry(
  id: string,
  updates: Partial<PayrollEntry>
) {
  const finalUpdates: Partial<PayrollEntry> = { ...updates };

  // If updating status to Paid, set payment date
  if (updates.status === 'Paid') {
    finalUpdates.payment_date = new Date().toISOString();
  }

  // Handle salary components updates
  if ('salary_components' in updates || 'base_salary' in updates) {
    if (!updates.salary_components || updates.salary_components.length === 0) {
      finalUpdates.salary_components = [];
      finalUpdates.base_salary = 0;
    } else {
      finalUpdates.salary_components = updates.salary_components;
      finalUpdates.base_salary = updates.salary_components.reduce(
        (sum, comp) => sum + comp.amount,
        0
      );
    }
  }

  // Handle deduction components updates
  if ('deduction_components' in updates || 'deductions' in updates) {
    if (
      !updates.deduction_components ||
      updates.deduction_components.length === 0
    ) {
      finalUpdates.deduction_components = [];
      finalUpdates.deductions = 0;
    } else {
      finalUpdates.deduction_components = updates.deduction_components;
      finalUpdates.deductions = updates.deduction_components.reduce(
        (sum, comp) => sum + comp.amount,
        0
      );
    }
  }

  const { data, error } = await supabase
    .from('payroll')
    .update(finalUpdates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function deletePayrollEntry(id: string) {
  const { error } = await supabase.from('payroll').delete().eq('id', id);

  if (error) {
    throw new Error(error.message);
  }
}

// Helper function to calculate total amount from reference components
export function calculateReferenceAmount(
  referenceComponents: string[],
  allComponents: (SalaryComponent | DeductionComponent)[]
): number {
  return referenceComponents.reduce((total, refName) => {
    const component = allComponents.find((c) => c.name === refName);
    return total + (component?.amount || 0);
  }, 0);
}
