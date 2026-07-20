import { supabase } from './supabase';
import { getTenantId } from './tenantDb';

export interface Shift {
  id: string;
  name: string;
  description: string | null;
  start_time: string;
  end_time: string;
  break_start_time: string;
  break_end_time: string;
  shift_type: 'morning' | 'afternoon' | 'night';
  is_active: boolean;
  overtime_enabled: boolean;
  tenant_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ShiftAssignment {
  id: string;
  shift_id: string;
  employee_id: string;
  schedule_date: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  clock_in: string | null;
  clock_out: string | null;
  actual_break_start: string | null;
  actual_break_end: string | null;
  overtime_minutes: number;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
  shift?: Shift;
  employee?: {
    name: string;
    email: string;
    employee_code: string;
    department: string;
  };
}

export interface RotationPattern {
  type: 'none' | 'daily' | 'weekly' | 'monthly';
  interval?: number;
  startDate: string;
  endDate?: string;
}

export interface BulkAssignmentRequest {
  shift_id: string;
  employee_ids: string[];
  rotation: RotationPattern;
  department?: string;
}

interface ValidationError {
  code: string;
  message: string;
  details?: Record<string, any>;
}

export async function createBulkAssignments(
  request: BulkAssignmentRequest
): Promise<{
  success: boolean;
  assignments?: ShiftAssignment[];
  errors?: ValidationError[];
}> {
  try {
    const tenantId = await getTenantId();
    const { data, error } = await supabase.rpc('create_bulk_assignments', {
      p_shift_id: request.shift_id,
      p_employee_ids: request.employee_ids,
      p_start_date: request.rotation.startDate,
      p_end_date: request.rotation.endDate || request.rotation.startDate,
      p_department: request.department,
      p_tenant_id: tenantId,
    });

    if (error) {
      console.error('Bulk assignment error:', error);
      return {
        success: false,
        errors: [
          {
            code: error.code,
            message: error.message,
            details: { hint: error.hint, details: error.details },
          },
        ],
      };
    }

    if (!data[0].success) {
      return {
        success: false,
        errors: data.errors,
      };
    }

    return {
      success: true,
      assignments: data.assignments,
    };
  } catch (error) {
    console.error('Bulk assignment failed:', error);
    return {
      success: false,
      errors: [
        {
          code: 'UNEXPECTED_ERROR',
          message:
            error instanceof Error
              ? error.message
              : 'An unexpected error occurred',
        },
      ],
    };
  }
}

export async function getShifts() {
  const tenantId = await getTenantId();
  const { data, error } = await supabase
    .from('shifts')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function createShift(
  shift: Omit<Shift, 'id' | 'created_at' | 'updated_at'>
) {
  const tenantId = await getTenantId();
  const { data, error } = await supabase
    .from('shifts')
    .insert([
      {
        ...shift,
        tenant_id: shift.tenant_id || tenantId,
      },
    ])
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function getShiftAssignments(
  start_date: string,
  end_date: string,
  employee_id?: string
): Promise<ShiftAssignment[]> {
  const tenantId = await getTenantId();
  
  const query = supabase
    .from('shift_assignments')
    .select(`
      *,
      employee:employees!shift_assignments_employee_id_fkey1 (
        name,
        email,
        employee_code,
        department:departments!employees_department_id_fkey (name)
      )
    `)
    .eq('tenant_id', tenantId)
    .gte('schedule_date', start_date)
    .lte('schedule_date', end_date);

  if (employee_id) {
    query.eq('employee_id', employee_id);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching shift assignments:', error);
    throw new Error(error.message);
  }

  // Map the nested department name and ensure the structure matches ShiftAssignment interface
  return (data || []).map(item => ({
    ...item,
    employee: item.employee ? {
      name: item.employee.name,
      email: item.employee.email,
      employee_code: item.employee.employee_code,
      department: (item.employee as any).department?.name || 'Unknown'
    } : undefined
  })) as ShiftAssignment[];
}

export async function createShiftAssignment(
  assignment: Omit<ShiftAssignment, 'id' | 'created_at' | 'updated_at'>
) {
  const { data, error } = await supabase
    .from('shift_assignments')
    .insert([
      {
        ...assignment,
        status: assignment.status || 'scheduled',
      },
    ])
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function updateShiftAssignment(
  id: string,
  updates: Partial<ShiftAssignment>
) {
  const { data, error } = await supabase
    .from('shift_assignments')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function deleteShiftAssignment(id: string) {
  const { error } = await supabase
    .from('shift_assignments')
    .delete()
    .eq('id', id);

  if (error) {
    throw new Error(error.message);
  }
}
