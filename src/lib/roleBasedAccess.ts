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

// ── Module-level memory cache (lives for the entire browser session) ─────────
let _roleCache: {
  userId: string;
  data: {
    employeeId: string | null;
    role: UserRole;
    access: RoleAccess;
    tenantId: string | null;
    userEmail: string | null;
  };
} | null = null;

export function clearRoleCache() {
  _roleCache = null;
}

export async function getUserEmployeeData(userId: string): Promise<{
  employeeId: string | null;
  role: UserRole;
  access: RoleAccess;
  tenantId: string | null;
  userEmail: string | null;
}> {
  // Return cached result instantly on re-renders / navigations
  if (_roleCache && _roleCache.userId === userId) {
    return _roleCache.data;
  }

  const fallback = {
    employeeId: null,
    role: 'Employee' as UserRole,
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

  try {
    // Fetch tenant + profile in PARALLEL (was 2 sequential calls before)
    const [tenantId, profileResult] = await Promise.all([
      getTenantId(),
      supabase
        .from('profiles')
        .select('email, user_role')
        .eq('id', userId)
        .maybeSingle(),
    ]);

    if (profileResult.error || !profileResult.data) {
      return { ...fallback, tenantId };
    }

    const profile = profileResult.data;
    const rawRole = (profile.user_role || '').toLowerCase();
    const role: UserRole =
      rawRole === 'admin' || rawRole === 'administrator' ? 'Admin'
      : rawRole === 'hr team' || rawRole === 'hr' ? 'HR Team'
      : rawRole === 'reporting head' ? 'Reporting Head'
      : 'Employee';

    // Derive access from the already-known role (no extra DB call)
    const access: RoleAccess = role === 'Admin' || role === 'HR Team' || role === 'Reporting Head'
      ? { canViewAllEmployees: true, canViewAllAttendance: true, canViewAllReports: true,
          canManageRequests: true, canProcessPayroll: true, restrictedToOwnData: false }
      : { canViewAllEmployees: false, canViewAllAttendance: false, canViewAllReports: false,
          canManageRequests: false, canProcessPayroll: false, restrictedToOwnData: true };

    // Fetch employeeId only if we have the required data (runs in parallel with nothing else to wait for)
    let employeeId: string | null = null;
    if (profile.email && tenantId) {
      const empResult = await supabase
        .from('employees')
        .select('id')
        .ilike('email', profile.email)
        .eq('tenant_id', tenantId)
        .maybeSingle();
      employeeId = empResult.data?.id ?? null;
    }

    const result = { employeeId, role, access, tenantId, userEmail: profile.email };

    // Cache result for this session
    _roleCache = { userId, data: result };

    return result;
  } catch (error) {
    console.error('Failed to get user employee data:', error);
    return fallback;
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
