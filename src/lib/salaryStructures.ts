import { supabase } from './supabase';
import { getTenantId } from './tenantDb';

export interface SalaryStructureComponent {
  id?: string;
  key: string;
  name: string;
  component_type: 'earning' | 'deduction';
  isCustom?: boolean;
  calculation_method: 'fixed' | 'direct' | 'percentage';
  amount?: number;
  percentage_value?: number;
  reference_components?: string[];
  is_taxable: boolean;
  description?: string;
  display_order?: number;
}

export interface SalaryStructure {
  id?: string;
  name: string;
  description?: string;
  is_active: boolean;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
  components: SalaryStructureComponent[];
}

export interface SalaryStructureHeader {
  id?: string;
  name: string;
  description?: string;
  is_active: boolean;
}

export interface EmployeeSalaryStructure {
  id?: string;
  employee_id: string;
  structure_id: string;
  effective_from: string;
  effective_to?: string;
  created_by?: string;
  created_at?: string;
  structure_name?: string;
  components?: SalaryStructureComponent[];
}

export async function createSalaryStructure(
  structure: Omit<SalaryStructure, 'id' | 'created_at' | 'updated_at'>,
  user_id: string
): Promise<SalaryStructure> {
  // Create the salary structure
  const { data: structureData, error: structureError } = await supabase
    .from('payroll_structures')
    .insert([{
      name: structure.name,
      description: structure.description,
      is_active: structure.is_active,
      created_by: user_id
    }])
    .select()
    .single();

  if (structureError) {
    throw new Error(structureError.message);
  }

  // Create the components
  if (structure.components.length > 0) {
    let componentsError: Error | null = null;

    const tenantId = await getTenantId();
    for (const component of structure.components) {
      const { error } = await supabase
        .rpc('insert_pay_structure_component', {
          p_amount: component.amount,
          p_calculation_method: component.calculation_method,
          p_component_id: component.id==''?null:component.id,
          p_component_name: component.name,
          p_component_type: component.component_type,
          p_iscustom: component.isCustom,
          p_percentage: component.percentage_value || 0,
          p_reference_components: (component.reference_components ?? []), //.map(item => (item as unknown as { id: string, key: string }).id),
          p_structure_id: structureData.id,
          p_tenant_id: tenantId,
        })
        .single();

      if (error) {
        componentsError = error;
        break;
      }
    }

    if (componentsError) {
      throw new Error(componentsError.message);
    }
  }

  // Get the complete structure with components
  const { data, error } = await supabase
    .rpc('get_salary_structure_details', {
      p_structure_id: structureData.id,
      p_tenant_id: tenantId,
    })
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function updateSalaryStructure(
  id: string,
  updates: Partial<SalaryStructure>
): Promise<SalaryStructure> {
  const { components, ...structureUpdates } = updates;

  // Update the structure
  if (Object.keys(structureUpdates).length > 0) {
    const { error: structureError } = await supabase
      .from('payroll_structures')
      .update({
        name: structureUpdates.name,
        description: structureUpdates.description,
        is_active: structureUpdates.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (structureError) {
      throw new Error(structureError.message);
    }
  }

  // Update components if provided
  if (components) {
    // Delete existing components
    const { error: deleteError } = await supabase
      .from('payroll_structure_components')
      .delete()
      .eq('structure_id', id);

    if (deleteError) {
      throw new Error(deleteError.message);
    }

    // Create the components
    if (components.length > 0) {
      let componentsError: Error | null = null;
      const tenantId = await getTenantId();

      for (const component of components) {
        const { error } = await supabase
          .rpc('insert_pay_structure_component', {
            p_amount: component.amount,
            p_calculation_method: component.calculation_method,
            p_component_id: component.id,
            p_component_name: component.name,
            p_component_type: component.component_type,
            p_iscustom: component.isCustom,
            p_percentage: component.percentage_value || 0,
            p_reference_components: (component.reference_components ?? []), //.map(item => (item as unknown as { id: string, key: string }).id),
            p_structure_id: id,
            p_tenant_id: tenantId,
          })
          .single();

        if (error) {
          componentsError = error;
          break;
        }
      }

      if (componentsError) {
        throw new Error(componentsError.message);
      }
    }

    // // Insert new components
    // if (components.length > 0) {
    //   const { error: componentsError } = await supabase
    //     .from('paryoll_structure_components')
    //     .insert(
    //       components.map(component => ({
    //         ...component,
    //         structure_id: id
    //       }))
    //     );

    //   if (componentsError) {
    //     throw new Error(componentsError.message);
    //   }
    // }
  }

  // Get updated structure
  const tenantId = await getTenantId();
  const { data, error } = await supabase
    .rpc('get_payroll_structure_details', {
      p_structure_id: id,
      p_tenant_id: tenantId,
    })
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function getSalaryStructures(): Promise<SalaryStructureHeader[]> {
  const { data, error } = await supabase
    .from('payroll_structures')
    .select('id, name, description, is_active')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function getSalaryStructureDetails(id: string): Promise<SalaryStructure> {
  const tenantId = await getTenantId();
  const { data, error } = await supabase
    .rpc('get_payroll_structure_details', {
      p_structure_id: id,
      p_tenant_id: tenantId,
    })
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function assignSalaryStructure(
  assignment: Omit<EmployeeSalaryStructure, 'id' | 'created_at'>,
  user_id: string
): Promise<EmployeeSalaryStructure> {
  // End any current active assignments
  const { error: updateError } = await supabase
    .from('employee_salary_structures')
    .update({ effective_to: assignment.effective_from })
    .eq('employee_id', assignment.employee_id)
    .is('effective_to', null);

  if (updateError) {
    throw new Error(updateError.message);
  }

  // Create new assignment
  const { data, error } = await supabase
    .from('employee_salary_structures')
    .insert([{
      ...assignment,
      created_by: user_id
    }])
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function getEmployeeSalaryStructureHistory(
  employee_id: string
): Promise<EmployeeSalaryStructure[]> {
  const tenantId = await getTenantId();
  const { data, error } = await supabase
    .rpc('get_employee_salary_structure_history', {
      p_employee_id: employee_id,
      p_tenant_id: tenantId,
    });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}