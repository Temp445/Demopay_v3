import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useUserAccessControlStore } from '../stores/userAccessControlStore';
import { useDomainConfigStore } from '../stores/domainConfigStore';

interface PermissionsState {
  loading: boolean;
  accessibleScreens: string[];
  isManager: boolean;
  hasAccess: (route: string) => boolean;
}

let cachedUserId: string | null = null;
let cachedScreens: string[] = [];
let cachedIsManager: boolean = false;

export function usePermissions(): PermissionsState {
  const { user } = useAuth();
  const { getUserAccessibleScreens } = useUserAccessControlStore();
  const { isScreenEnabled } = useDomainConfigStore();

  const [loading, setLoading] = useState(user ? (cachedUserId !== user.id) : false);
  const [accessibleScreens, setAccessibleScreens] = useState<string[]>(cachedUserId === user?.id ? cachedScreens : []);
  const [isManager, setIsManager] = useState(cachedUserId === user?.id ? cachedIsManager : false);

  useEffect(() => {
    const loadPermissions = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        const [screens, roleData] = await Promise.all([
          getUserAccessibleScreens(user.id),
          supabase.from('tenant_users').select('role').eq('user_id', user.id).limit(1).maybeSingle()
        ]);

        // The store now accurately resolves defaults vs explicit overrides
        const enabledRoutes = screens
          .filter((s: any) => s.is_enabled)
          .map((s: any) => s.screen_route);

        const userIsManager = roleData.data?.role === 'manager';

        cachedUserId = user.id;
        cachedScreens = userIsManager ? ['/dashboard/global-tenant-management'] : enabledRoutes;
        cachedIsManager = userIsManager;

        setAccessibleScreens(cachedScreens);
        setIsManager(userIsManager);
      } catch (error) {
        console.error('Failed to load user permissions:', error);
        setAccessibleScreens([]);
      } finally {
        setLoading(false);
      }
    };

    if (user && cachedUserId !== user.id) {
      loadPermissions();
    } else {
      setLoading(false);
    }

    // Set up Realtime listener for instant permission updates
    if (!user) return;

    const channel = supabase
      .channel(`permissions-${user.id}`)
      // 1. Listen to broadcast events from the admin page
      .on(
        'broadcast',
        { event: 'permissions-updated' },
        () => {
          loadPermissions();
        }
      )
      // 2. Listen to direct DB row changes for this user as a fallback
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_screen_permissions',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          loadPermissions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  // Use user?.id to avoid re-running on token refresh (tab switch/restore)
  }, [user?.id]);

  const hasAccess = (route: string): boolean => {
    if (loading) {
      return true;
    }

    if (isManager) {
      const allowed = ['/dashboard/global-tenant-management', '/dashboard/global-tenant-management/'].includes(route);
      return allowed && isScreenEnabled(route);
    }

    if (accessibleScreens.length === 0) {
      return true;
    }

    // Check for exact match
    if (accessibleScreens.includes(route)) {
      return isScreenEnabled(route);
    }

    // Fallback for renamed routes (backward compatibility with DB)
    if (route === '/dashboard/attendance/device-employees') {
      return accessibleScreens.includes('/dashboard/attendance/device-employees') && isScreenEnabled(route);
    }

    return false;
  };

  return { loading, accessibleScreens, isManager, hasAccess };
}
