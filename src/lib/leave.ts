import { supabase } from './supabase';
import { getTenantId } from './tenantDb';

export interface LeaveType {
  id: string;
  name: string;
  description: string | null;
  default_days: number;
  requires_approval: boolean;
  is_active: boolean;
  is_paid: boolean;
  tenant_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface LeaveBalance {
  id: string;
  employee_id: string;
  employee_name: string;
  leave_type_id: string;
  year: number;
  total_days: number;
  used_days: number;
  tenant_id?: string;
  created_at?: string;
  updated_at?: string;
  leave_types: {
    name: string;
  };
}

export interface LeaveRequest {
  id: string;
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
  document_url: string | null;
  approved_by: string | null;
  approved_at: string | null;
  is_half_day_start?: boolean;
  is_half_day_end?: boolean;
  half_day_period_start?: '1st half' | '2nd half' | null;
  half_day_period_end?: '1st half' | '2nd half' | null;
  total_days?: number;
  tenant_id?: string;
  created_at?: string;
  updated_at?: string;
  leave_type: {
    name: string;
  };
  approved_by_user?: {
    email: string;
  };
}

export async function getLeaveTypes(): Promise<LeaveType[]> {
  const tenantId = await getTenantId();
  const { data, error } = await supabase
    .from('leave_types')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('name');

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function createLeaveType(
  leaveType: Omit<LeaveType, 'id' | 'created_at' | 'updated_at' | 'tenant_id'>
): Promise<LeaveType> {
  // Get user's tenant_id
  const tenant_id = await getTenantId();

  const { data, error } = await supabase
    .from('leave_types')
    .insert([{ ...leaveType, tenant_id }])
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error('A leave type with this name already exists');
    }
    throw new Error(error.message);
  }

  return data;
}

export async function updateLeaveType(
  id: string,
  updates: Partial<LeaveType>
): Promise<LeaveType> {
  const tenantId = await getTenantId();
  const { data, error } = await supabase
    .from('leave_types')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error('A leave type with this name already exists');
    }
    throw new Error(error.message);
  }

  return data;
}

export async function getLeaveBalances(
  employee_id: string,
  year: number
): Promise<LeaveBalance[]> {
  if (!employee_id) return [];

  const tenantId = await getTenantId();
  const { data, error } = await supabase.rpc('get_leave_balances', {
    p_employee_id: employee_id || '',
    p_year: year,
    p_tenant_id:tenantId
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function getLeaveRequests(
  employee_id: string,
  start_date?: string,
  end_date?: string
): Promise<LeaveRequest[]> {
  const tenantId = await getTenantId();
  const { data, error } = await supabase.rpc('get_leave_request_details', {
    p_employee_id: employee_id === '' ? null : employee_id,
    p_start_date: start_date || null,
    p_end_date: end_date || null,
    p_tenant_id:tenantId
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function submitLeaveRequest(request: {
  created_by: string;
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  reason: string;
  document_url?: string;
  is_half_day_start?: boolean;
  is_half_day_end?: boolean;
  half_day_period_start?: '1st half' | '2nd half' | null;
  half_day_period_end?: '1st half' | '2nd half' | null;
}): Promise<LeaveRequest> {
  // Get user's tenant_id
  const tenantId = await getTenantId();

  // Calculate number of days including fractional days
  const start = new Date(request.start_date);
  const end = new Date(request.end_date);
  let days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  // Adjust for half days
  if (request.is_half_day_start) {
    days -= 0.5;
  }
  if (request.is_half_day_end && request.start_date !== request.end_date) {
    days -= 0.5;
  }
  // Handle single day half-day leave
  if (request.start_date === request.end_date && request.is_half_day_start) {
    days = 0.5;
  }

  // Ensure leave balance exists and get it
  await supabase.rpc('ensure_leave_balance', {
    p_employee_id: request.employee_id,
    p_leave_type_id: request.leave_type_id,
    p_year: start.getFullYear(),
    p_tenant_id:tenantId
  });

  // Get leave balance
  const { data: balances, error: balanceError } = await supabase
    .from('leave_balances')
    .select('*')
    .eq('employee_id', request.employee_id)
    .eq('leave_type_id', request.leave_type_id)
    .eq('tenant_id', tenantId)
    .eq('year', start.getFullYear());

  if (balanceError) {
    throw new Error('Failed to check leave balance');
  }

  const balance = balances[0];
  if (!balance || balance.total_days - balance.used_days < days) {
    throw new Error('Insufficient leave balance');
  }

  // Submit request
  const { data, error } = await supabase
    .from('leave_requests')
    .insert([
      {
        employee_id: request.employee_id,
        leave_type_id: request.leave_type_id,
        start_date: request.start_date,
        end_date: request.end_date,
        reason: request.reason,
        document_url: request.document_url || null,
        approved_by: null,
        approved_at: null,
        status: 'Pending',
        created_by: request.created_by,
        is_half_day_start: request.is_half_day_start || false,
        is_half_day_end: request.is_half_day_end || false,
        half_day_period_start: request.half_day_period_start || null,
        half_day_period_end: request.half_day_period_end || null,
        total_days: days,
        tenant_id: tenantId,
      },
    ])
    .select(
      `
      *,
      leave_type:leave_types (
        name
      )
    `
    )
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function updateLeaveRequestStatus(
  request_id: string,
  status: LeaveRequest['status'],
  approved_by?: string | null
): Promise<LeaveRequest> {
  const tenantId = await getTenantId();
  const updates: Record<string, any> = { status };

  if (status === 'Approved' && approved_by) {
    updates.approved_by = approved_by;
    updates.approved_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from('leave_requests')
    .update(updates)
    .eq('id', request_id)
    .eq('tenant_id', tenantId)
    .select(
      `
      *,
      leave_type:leave_types (
        name
      ),
      approved_by_user:user_profiles (
        email
      )
    `
    )
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function cancelLeaveRequest(request_id: string): Promise<void> {
  const tenantId = await getTenantId();
  const { error } = await supabase
    .from('leave_requests')
    .update({ status: 'Cancelled' })
    .eq('id', request_id)
    .eq('tenant_id', tenantId);

  if (error) {
    throw new Error(error.message);
  }
}