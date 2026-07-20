import { supabase } from './supabase';
import { getTenantId } from './tenantDb';

async function triggerAutoUpload(tenant_id: string, employeeId: string) {
  try {
    const { data: settings } = await supabase
      .from('hik_device_settings')
      .select('id, auto_employee_upload, is_enabled')
      .eq('tenant_id', tenant_id)
      .eq('is_enabled', true)
      .eq('auto_employee_upload', true);

    if (settings && settings.length > 0) {
      for (const device of settings) {
        supabase.functions.invoke('upload-employees-to-device', {
          body: { tenantId: tenant_id, settingsId: device.id, employeeIds: [employeeId] }
        }).catch(console.error);
      }
    }
  } catch (err) {
    console.error('Failed to trigger background auto upload:', err);
  }
}

// Fire-and-forget: push updated employee name to all registered HikVision devices
async function triggerAutoNameSync(tenant_id: string, employeeId: string, newName: string) {
  try {
    supabase.functions.invoke('auto-sync-employee-name', {
      body: { tenantId: tenant_id, employeeId, newName }
    }).catch(console.error);
  } catch (err) {
    console.error('Failed to trigger auto name sync to device:', err);
  }
}

export interface Employee {
  roles: any;
  departments: any;
  id: string;
  name: string;
  email: string;
  department_id: string;
  role_id: string;
  status: 'Active' | 'On Leave' | 'Terminated';
  start_date: string;
  employee_code?: string;
  address?: string;
  date_of_birth?: string;
  tenant_id?: string;
  created_at?: string;
  updated_at?: string;
}

export async function createEmployee(
  employee: Omit<Employee, 'id' | 'created_at' | 'updated_at'>,
  user_id: string
) {
  if (!user_id) {
    throw new Error('Login User ID is required');
  }

  // Get user's tenant_id
  const tenant_id = await getTenantId();

  // Check for duplicate email within tenant
  const { data: existingEmployeeWithEmail } = await supabase
    .from('employees')
    .select('id')
    .eq('email', employee.email)
    .eq('tenant_id', tenant_id)
    .maybeSingle();

  if (existingEmployeeWithEmail) {
    throw new Error('An employee with this email already exists in your organization');
  }

  // Check for duplicate employee code within tenant if one is provided
  if (employee.employee_code) {
    const { data: existingEmployee } = await supabase
      .from('employees')
      .select('id')
      .eq('employee_code', employee.employee_code)
      .eq('tenant_id', tenant_id)
      .maybeSingle();

    if (existingEmployee) {
      throw new Error('An employee with this employee code already exists in your organization');
    }
  }

  const { data, error } = await supabase
    .from('employees')
    .insert([
      {
        name: employee.name,
        email: employee.email,
        department: employee.departments?.name || null,
        role: employee.roles?.name || null,
        status: employee.status,
        start_date: employee.start_date,
        employee_code: employee.employee_code,
        address: employee.address,
        date_of_birth:
          employee.date_of_birth === '' ? null : employee.date_of_birth,
        created_by: user_id,
        tenant_id: tenant_id,
      },
    ])
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  // Fire background auto upload hook
  triggerAutoUpload(tenant_id, data.id).catch(console.error);

  return data;
}

export async function getEmployees() {
  const tenantId = await getTenantId();
  const { data, error } = await supabase
    .from('employees')
    .select(`*,  
       departments (id,name),
      roles (id, name)`)
    .eq('tenant_id', tenantId)
    .order('employee_code', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function updateEmployee(id: string, updates: Partial<Employee>) {
  // Get user's tenant_id
  const tenant_id = await getTenantId();

  // Check for duplicate email within tenant if email is being updated
  if (updates.email) {
    const { data: existingEmployeeWithEmail } = await supabase
      .from('employees')
      .select('id')
      .eq('email', updates.email)
      .eq('tenant_id', tenant_id)
      .neq('id', id)
      .maybeSingle();

    if (existingEmployeeWithEmail) {
      throw new Error('An employee with this email already exists in your organization');
    }
  }

  // Check for duplicate employee code within tenant if updating
  if (updates.employee_code) {
    const { data: existingEmployee } = await supabase
      .from('employees')
      .select('id')
      .eq('employee_code', updates.employee_code)
      .eq('tenant_id', tenant_id)
      .neq('id', id)
      .maybeSingle();

    if (existingEmployee) {
      throw new Error('An employee with this employee code already exists in your organization');
    }
  }

  const { data, error } = await supabase
    .from('employees')
    .update({
      name: updates.name,
      email: updates.email,
      // Handle both flat string (from EditEmployeeModal) and nested object (from old code)
      department: (updates as any).department ?? updates.departments?.name ?? null,
      role: (updates as any).role ?? updates.roles?.name ?? null,
      cadre: (updates as any).cadre ?? null,
      status: updates.status,
      start_date: updates.start_date,
      employee_code: updates.employee_code,
      address: updates.address,
      date_of_birth: updates.date_of_birth === '' ? null : updates.date_of_birth,
      // New fields from EditEmployeeModal
      father_name: (updates as any).father_name ?? null,
      uan_number: (updates as any).uan_number ?? null,
      contact_number: (updates as any).contact_number ?? null,
      status_date: (updates as any).status_date || null,
      status_reason: (updates as any).status_reason || null,
    })
    .eq('id', id)
    .eq('tenant_id', tenant_id)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  // Auto-sync name to all HikVision devices where this employee is registered
  triggerAutoNameSync(tenant_id, data.id, data.name).catch(console.error);

  return data;
}

export async function deleteEmployee(id: string) {
  const tenantId = await getTenantId();
  const { error } = await supabase
    .from('employees')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId);

  if (error) {
    throw new Error(error.message);
  }
}
