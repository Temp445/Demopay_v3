import { supabase } from './supabase';
import { SalaryComponent, DeductionComponent } from './payroll';

export interface PayrollCalculationMethod {
  id: string;
  name: string;
  description: string | null;
  salary_components: SalaryComponent[];
  deduction_components: DeductionComponent[];
  is_active: boolean;
  created_by: string | null;
  created_at?: string;
  updated_at?: string;
}

export async function getPayrollCalculationMethods(): Promise<PayrollCalculationMethod[]> {
  const { data, error } = await supabase
    .from('payroll_calculation_methods')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function createPayrollCalculationMethod(
  method: Omit<PayrollCalculationMethod, 'id' | 'created_at' | 'updated_at'>,
  user_id: string
): Promise<PayrollCalculationMethod> {
  const { data, error } = await supabase
    .from('payroll_calculation_methods')
    .insert([{
      ...method,
      created_by: user_id
    }])
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error('A calculation method with this name already exists');
    }
    throw new Error(error.message);
  }

  return data;
}

export async function updatePayrollCalculationMethod(
  id: string,
  updates: Partial<PayrollCalculationMethod>
): Promise<PayrollCalculationMethod> {
  const { data, error } = await supabase
    .from('payroll_calculation_methods')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function deletePayrollCalculationMethod(id: string): Promise<void> {
  const { error } = await supabase
    .from('payroll_calculation_methods')
    .delete()
    .eq('id', id);

  if (error) {
    throw new Error(error.message);
  }
}