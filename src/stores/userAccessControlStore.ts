import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import {
  validateAuth,
  createAuthError,
  createTenantError,
  initialStoreState,
  setLoading,
  setError,
  setSuccess,
  type StoreState,
} from './utils/storeUtils';

export interface ApplicationScreen {
  id: string;
  tenant_id: string;
  screen_name: string;
  screen_route: string;
  screen_group: string | null;
  description: string | null;
  display_order: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface UserScreenPermission {
  id: string;
  tenant_id: string;
  user_id: string;
  screen_id: string;
  is_enabled: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface UserWithPermissions {
  user_id: string;
  email: string;
  name: string;
  role_name: string;
  is_admin: boolean;
  screens: Array<{
    screen_id: string;
    screen_name: string;
    screen_route: string;
    screen_group: string | null;
    is_enabled: boolean;
  }>;
}

interface UserAccessControlStore extends StoreState<ApplicationScreen> {
  users: UserWithPermissions[];
  usersLoading: boolean;
  selectedUser: UserWithPermissions | null;

  fetchApplicationScreens: () => Promise<void>;
  fetchUsersWithPermissions: () => Promise<void>;
  selectUser: (userId: string) => void;
  updateUserScreenPermission: (userId: string, screenId: string, isEnabled: boolean) => Promise<void>;
  checkUserScreenAccess: (userId: string, screenRoute: string) => Promise<boolean>;
  getUserAccessibleScreens: (userId: string) => Promise<any[]>;
  reset: () => void;
}

// 💡 SHARED CONSTANT: The routes restricted from standard Employees
export const restrictedEmployeeRoutes = [
  '/dashboard/attendance/face-enrollment',
  '/dashboard/attendance-face-verify',
  '/dashboard/time-stamp-management',
  '/dashboard/leave/settings',
  '/dashboard/shifts',
  '/dashboard/holidays',
  '/dashboard/advances/approval',
  '/dashboard/advances/settings',
  '/dashboard/component-master',
  '/dashboard/salary-structures',
  '/dashboard/formula-builder',
  '/dashboard/structure-assignments',
  '/dashboard/payroll-process',
  '/dashboard/payroll',
  '/dashboard/overtime/structures',
  '/dashboard/overtime/approvals',
  '/dashboard/overtime/processing',
  '/dashboard/overtime/settings',
  '/dashboard/overtime/employees',
  // '/dashboard/visitor-records',
  '/dashboard/statutory',
  '/dashboard/employee-invite',
  '/dashboard/access-control',
  '/dashboard/reporting',
  '/dashboard/work-location-assignment',
  '/dashboard/location-tracking',
  '/dashboard/work-location-approval',
  '/dashboard/location-settings',
  '/dashboard/settings/user-management',
  '/dashboard/settings/smtp-configuration',
  '/dashboard/settings/master-data-import',
  '/dashboard/settings/company-settings',
  '/dashboard/settings/attendance-settings',
  '/dashboard/permissions/approval',
  '/dashboard/attendance/hik-device-employees',
  '/dashboard/settings/hik-device-controller',
  '/dashboard/billing',
  '/dashboard/formula-tester',
  '/dashboard/settings/shift-attendance-notifier',
  '/dashboard/payslip-sender',
  '/dashboard/employees'
];

export const restrictedReportingHeadRoutes = [
  '/dashboard/attendance/hik-device-employees',
  '/dashboard/settings/hik-device-controller',
  '/dashboard/billing',
  '/dashboard/formula-tester',
  '/dashboard/settings/shift-attendance-notifier',
  '/dashboard/payslip-sender',
  '/dashboard/advances/settings',
  '/dashboard/component-master',
  '/dashboard/salary-structures',
  '/dashboard/formula-builder',
  '/dashboard/structure-assignments',
  '/dashboard/payroll-process',
  '/dashboard/payroll',
  '/dashboard/overtime/structures',
  '/dashboard/overtime/approvals',
  '/dashboard/overtime/processing',
  '/dashboard/overtime/settings',
  '/dashboard/overtime/employees',
  '/dashboard/leave/settings',
  '/dashboard/shifts',
  '/dashboard/holidays',
  '/dashboard/advances/settings',
  '/dashboard/location-settings',
  '/dashboard/settings/user-management',
  '/dashboard/settings/smtp-configuration',
  '/dashboard/settings/master-data-import',
  '/dashboard/settings/company-settings',
  '/dashboard/settings/attendance-settings',
  '/dashboard/attendance/face-enrollment',
  '/dashboard/attendance-face-verify',
  '/dashboard/time-stamp-management',
  '/dashboard/statutory',
  '/dashboard/employee-invite',
  '/dashboard/access-control',
  '/dashboard/employees',
  '/dashboard/location-tracking',
  '/dashboard/reporting',
  '/dashboard/work-location-approval',
  '/dashboard/work-location-assignment'
];

export const useUserAccessControlStore = create<UserAccessControlStore>((set, get) => ({
  ...initialStoreState<ApplicationScreen>(),
  users: [],
  usersLoading: false,
  selectedUser: null,

  fetchApplicationScreens: async () => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated) {
      set(state => setError(state, createAuthError().message));
      return;
    }

    if (!auth.tenantId) {
      set(state => setError(state, createTenantError().message));
      return;
    }

    set(state => setLoading(state));

    try {
      const { data, error } = await supabase
        .from('application_screens')
        .select('*')
        .eq('tenant_id', auth.tenantId)
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (error) throw error;

      set(state => setSuccess(state, data || []));
    } catch (error) {
      set(state => setError(state, error instanceof Error ? error.message : 'Failed to fetch screens'));
    }
  },

  fetchUsersWithPermissions: async () => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated) {
      set({ usersLoading: false, error: createAuthError().message });
      return;
    }

    if (!auth.tenantId) {
      set({ usersLoading: false, error: createTenantError().message });
      return;
    }

    set({ usersLoading: true, error: null });

    try {
      const { data: dbProfiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email, full_name, user_role')
        .eq('tenant_id', auth.tenantId)
        .neq('user_role', 'Admin');

      if (profilesError) throw profilesError;

      const { data: dbEmployees, error: employeesError } = await supabase
        .from('employees')
        .select('id, name, email')
        .eq('tenant_id', auth.tenantId)
        .eq('status', 'Active');

      if (employeesError) throw employeesError;

      const users: {
        user_id: string;
        user_email: string;
        user_name: string;
        role: string;
        is_admin: boolean;
      }[] = [];

      for (const profile of dbProfiles || []) {
        const matchingEmployee = (dbEmployees || []).find(
          emp => emp.email.toLowerCase() === profile.email.toLowerCase()
        );

        if (!matchingEmployee) continue;

        users.push({
          user_id: profile.id,
          user_email: profile.email,
          user_name: matchingEmployee.name,
          role: profile.user_role || 'Employee',
          is_admin: false
        });
      }

      const { data: screens, error: screensError } = await supabase
        .from('application_screens')
        .select('*')
        .eq('tenant_id', auth.tenantId)
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (screensError) throw screensError;

      const { data: permissions, error: permError } = await supabase
        .from('user_screen_permissions')
        .select('*')
        .eq('tenant_id', auth.tenantId);

      if (permError) throw permError;

      const usersWithPermissions: UserWithPermissions[] = [];
      const missingPermissionsToSync: any[] = []; 

      for (const user of users) {
        const resolvedRole = user.role;
        const isEmployee = resolvedRole === 'Employee';
        const isReportingHead = resolvedRole === 'Reporting Head';

        const userScreens = (screens || []).map(screen => {
          const permission = (permissions || []).find(
            p => p.user_id === user.user_id && p.screen_id === screen.id
          );

          let is_enabled = true;
          const isRestrictedRoute = restrictedEmployeeRoutes.includes(screen.screen_route);
          const isRestrictedReportingHeadRoute = restrictedReportingHeadRoutes.includes(screen.screen_route);

          if (permission) {
            // Keep explicit permissions exactly as they are in DB
            is_enabled = permission.is_enabled;
          } else {
            if (isEmployee && isRestrictedRoute) {
              is_enabled = false;
              missingPermissionsToSync.push({
                tenant_id: auth.tenantId,
                user_id: user.user_id,
                screen_id: screen.id,
                is_enabled: false,
                created_by: auth.userId || null 
              });
            } else if (isReportingHead && isRestrictedReportingHeadRoute) {
              is_enabled = false;
              missingPermissionsToSync.push({
                tenant_id: auth.tenantId,
                user_id: user.user_id,
                screen_id: screen.id,
                is_enabled: false,
                created_by: auth.userId || null 
              });
            }
          }

          return {
            screen_id: screen.id,
            screen_name: screen.screen_name,
            screen_route: screen.screen_route,
            screen_group: screen.screen_group,
            is_enabled,
          };
        });

        usersWithPermissions.push({
          user_id: user.user_id,
          email: user.user_email,
          name: user.user_name,
          role_name: resolvedRole, 
          is_admin: user.is_admin,
          screens: userScreens,
        });
      }

      const uniquePermissionsToSync = Array.from(
        new Map(
          missingPermissionsToSync.map(item => [
            `${item.tenant_id}-${item.user_id}-${item.screen_id}`, 
            item
          ])
        ).values()
      );

      if (uniquePermissionsToSync.length > 0) {
        const { data: syncData, error: syncError } = await supabase
          .from('user_screen_permissions')
          .upsert(uniquePermissionsToSync, {
            onConflict: 'tenant_id,user_id,screen_id' 
          })
          .select(); 
          
        if (syncError) {
          console.error('❌ Supabase Upsert Error:', syncError.message, syncError.details);
        } else {
          console.log(`✅ Successfully auto-corrected ${syncData?.length} role permissions.`);
        }
      }

      set({ users: usersWithPermissions, usersLoading: false });
    } catch (error) {
      set({
        usersLoading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch users',
      });
    }
  },

  selectUser: (userId: string) => {
    const users = get().users;
    const user = users.find(u => u.user_id === userId);
    set({ selectedUser: user || null });
  },

  updateUserScreenPermission: async (userId: string, screenId: string, isEnabled: boolean) => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated) throw createAuthError();
    if (!auth.tenantId) throw createTenantError();

    try {
      const { data: existing, error: checkError } = await supabase
        .from('user_screen_permissions')
        .select('id')
        .eq('tenant_id', auth.tenantId)
        .eq('user_id', userId)
        .eq('screen_id', screenId)
        .maybeSingle();

      if (checkError && checkError.code !== 'PGRST116') throw checkError;

      if (existing) {
        const { error: updateError } = await supabase
          .from('user_screen_permissions')
          .update({
            is_enabled: isEnabled,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('user_screen_permissions')
          .insert({
            tenant_id: auth.tenantId,
            user_id: userId,
            screen_id: screenId,
            is_enabled: isEnabled,
            created_by: auth.userId,
          });

        if (insertError) throw insertError;
      }

      const users = get().users.map(user => {
        if (user.user_id === userId) {
          return {
            ...user,
            screens: user.screens.map(screen =>
              screen.screen_id === screenId
                ? { ...screen, is_enabled: isEnabled }
                : screen
            ),
          };
        }
        return user;
      });

      const selectedUser = get().selectedUser;
      if (selectedUser && selectedUser.user_id === userId) {
        set({
          users,
          selectedUser: {
            ...selectedUser,
            screens: selectedUser.screens.map(screen =>
              screen.screen_id === screenId
                ? { ...screen, is_enabled: isEnabled }
                : screen
            ),
          },
        });
      } else {
        set({ users });
      }

      // Notify the target user that their permissions have changed so they reload them instantly
      await supabase.channel(`permissions-${userId}`).send({
        type: 'broadcast',
        event: 'permissions-updated',
        payload: { screen_id: screenId, is_enabled: isEnabled }
      });

    } catch (error) {
      throw error;
    }
  },

  checkUserScreenAccess: async (userId: string, screenRoute: string) => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated) return false;
    if (!auth.tenantId) return false;

    try {
      const { data, error } = await supabase.rpc('check_user_screen_access', {
        p_user_id: userId,
        p_screen_route: screenRoute,
        p_tenant_id: auth.tenantId,
      });

      if (error) throw error;

      return data === true;
    } catch (error) {
      console.error('Error checking screen access:', error);
      return true; 
    }
  },

  getUserAccessibleScreens: async (userId: string) => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated) return [];
    if (!auth.tenantId) return [];

    try {
      // 1. Fetch all active screens
      const { data: screens, error: screensError } = await supabase
        .from('application_screens')
        .select('*')
        .eq('tenant_id', auth.tenantId)
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (screensError) throw screensError;

      // 2. Fetch explicit user permissions for these screens
      const { data: permissions, error: permError } = await supabase
        .from('user_screen_permissions')
        .select('screen_id, is_enabled')
        .eq('tenant_id', auth.tenantId)
        .eq('user_id', userId);

      if (permError) throw permError;

      // 3. Determine user role to apply defaults if no explicit permission
      const { data: profile } = await supabase
        .from('profiles')
        .select('user_role')
        .eq('id', userId)
        .eq('tenant_id', auth.tenantId)
        .maybeSingle();

      const isEmployee = !profile || profile.user_role === 'Employee';
      const isReportingHead = profile?.user_role === 'Reporting Head';

      const permMap = new Map();
      permissions?.forEach(p => permMap.set(p.screen_id, p.is_enabled));

      return (screens || []).map(screen => {
        const isAdmin = profile?.user_role === 'Admin';
        const hasExplicitPerm = permMap.has(screen.id);
        const explicitPerm = permMap.get(screen.id);
        const isRestrictedRoute = restrictedEmployeeRoutes.includes(screen.screen_route);
        const isRestrictedReportingHeadRoute = restrictedReportingHeadRoutes.includes(screen.screen_route);

        let final_is_enabled = true;
        
        if (isAdmin) {
          // Rule 0: Admins always get access to everything
          final_is_enabled = true;
        } else if (hasExplicitPerm) {
          // Rule 1: Always respect the explicit grant or deny in the DB for non-admins
          final_is_enabled = explicitPerm;
        } else {

          // Rule 2: If no DB row exists, apply defaults based on role
          if (isEmployee) {
             final_is_enabled = !isRestrictedRoute; // Employees blocked from restricted routes by default
          } else if (isReportingHead) {
             final_is_enabled = !isRestrictedReportingHeadRoute; // Reporting Heads blocked from specified routes by default
          } else {
             final_is_enabled = true; // Admins/HR get all routes by default
          }
        }

        return {
          screen_id: screen.id,
          screen_name: screen.screen_name,
          screen_route: screen.screen_route,
          screen_group: screen.screen_group,
          is_enabled: final_is_enabled,
        };
      });
    } catch (error) {
      console.error('Error fetching accessible screens:', error);
      return [];
    }
  },

  reset: () => {
    set({
      ...initialStoreState<ApplicationScreen>(),
      users: [],
      usersLoading: false,
      selectedUser: null,
    });
  },
}));
