import { supabase } from './supabase';
import { getTenantId } from './tenantDb';

export type UserRole = 'Admin' | 'HR Team' | 'Employee' | 'Reporting Head';

export interface RoleAccess {
  canViewAllEmployees: boolean;
  canViewAllAttendance: boolean;
  canViewAllReports: boolean;
  canManageRequests: boolean;
  canProcessPayroll: boolean;
  restrictedToOwnData: boolean;
}

export async function getUserRole(userId: string): Promise<UserRole> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('user_role')
      .eq('id', userId)
      .maybeSingle();

    if (error || !data) {
      return 'Employee';
    }

    const role = data.user_role as string;
    const normalizedRole = role.toLowerCase();

    if (normalizedRole === 'admin' || normalizedRole === 'administrator') return 'Admin';
    if (normalizedRole === 'hr team' || normalizedRole === 'hr') return 'HR Team';
    if (normalizedRole === 'reporting head') return 'Reporting Head';
    return 'Employee';
  } catch (error) {
    return 'Employee';
  }
}

export async function getRoleAccess(userId: string): Promise<RoleAccess> {
  const role = await getUserRole(userId);

  switch (role) {
    case 'Admin':
    case 'HR Team':
    case 'Reporting Head':
      return {
        canViewAllEmployees: true,
        canViewAllAttendance: true,
        canViewAllReports: true,
        canManageRequests: true,
        canProcessPayroll: true,
        restrictedToOwnData: false,
      };

    case 'Employee':
    default:
      return {
        canViewAllEmployees: false,
        canViewAllAttendance: false,
        canViewAllReports: false,
        canManageRequests: false,
        canProcessPayroll: false,
        restrictedToOwnData: true,
      };
  }
}

export async function getCurrentEmployeeId(userEmail: string, tenantId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('employees')
      .select('id')
      .ilike('email', userEmail)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return data.id;
  } catch (error) {
    return null;
  }
}

export async function getUserEmployeeData(userId: string): Promise<{
  employeeId: string | null;
  role: UserRole;
  access: RoleAccess;
  tenantId: string | null;
  userEmail: string | null;
}> {
  try {
    const tenantId = await getTenantId();

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('email, user_role')
      .eq('id', userId)
      .maybeSingle();

    if (profileError || !profile) {
      return {
        employeeId: null,
        role: 'Employee',
        access: {
          canViewAllEmployees: false,
          canViewAllAttendance: false,
          canViewAllReports: false,
          canManageRequests: false,
          canProcessPayroll: false,
          restrictedToOwnData: true,
        },
        tenantId,
        userEmail: null,
      };
    }

    const rawRole = (profile.user_role || '').toLowerCase();
    const role = (rawRole === 'admin' || rawRole === 'administrator')
      ? 'Admin' as UserRole
      : (rawRole === 'hr team' || rawRole === 'hr')
        ? 'HR Team' as UserRole
        : rawRole === 'reporting head'
          ? 'Reporting Head' as UserRole
          : 'Employee';

    const access = await getRoleAccess(userId);

    let employeeId: string | null = null;
    if (profile.email && tenantId) {
      employeeId = await getCurrentEmployeeId(profile.email, tenantId);
    }

    return {
      employeeId,
      role,
      access,
      tenantId,
      userEmail: profile.email,
    };
  } catch (error) {
    console.error('Failed to get user employee data:', error);
    return {
      employeeId: null,
      role: 'Employee',
      access: {
        canViewAllEmployees: false,
        canViewAllAttendance: false,
        canViewAllReports: false,
        canManageRequests: false,
        canProcessPayroll: false,
        restrictedToOwnData: true,
      },
      tenantId: null,
      userEmail: null,
    };
  }
}

export function isAdminOrHR(role: UserRole): boolean {
  return role === 'Admin' || role === 'HR Team' || role === 'Reporting Head';
}

export function isEmployee(role: UserRole): boolean {
  return role === 'Employee';
}

export function canAccessEmployeeData(
  userRole: UserRole,
  targetEmployeeId: string,
  currentEmployeeId: string | null
): boolean {
  if (isAdminOrHR(userRole)) {
    return true;
  }

  if (currentEmployeeId && targetEmployeeId === currentEmployeeId) {
    return true;
  }

  return false;
}
