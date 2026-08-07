import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getUserEmployeeData, type UserRole, type RoleAccess } from '../lib/roleBasedAccess';

interface RoleAccessState {
  loading: boolean;
  role: UserRole;
  access: RoleAccess;
  employeeId: string | null;
  tenantId: string | null;
  userEmail: string | null;
  isAdmin: boolean;
  isHR: boolean;
  isEmployee: boolean;
  canViewAllData: boolean;
}

export function useRoleAccess(): RoleAccessState {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<RoleAccessState>({
    loading: true,
    role: 'Employee',
    access: {
      canViewAllEmployees: false,
      canViewAllAttendance: false,
      canViewAllReports: false,
      canManageRequests: false,
      canProcessPayroll: false,
      restrictedToOwnData: true,
    },
    employeeId: null,
    tenantId: null,
    userEmail: null,
    isAdmin: false,
    isHR: false,
    isEmployee: true,
    canViewAllData: false,
  });

  useEffect(() => {
    const loadRoleAccess = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        const data = await getUserEmployeeData(user.id);

        setState({
          loading: false,
          role: data.role,
          access: data.access,
          employeeId: data.employeeId,
          tenantId: data.tenantId,
          userEmail: data.userEmail,
          isAdmin: data.role === 'Admin',
          isHR: data.role === 'HR Team' || data.role === 'Reporting Head',
          isEmployee: data.role === 'Employee',
          canViewAllData: data.role === 'Admin' || data.role === 'HR Team' || data.role === 'Reporting Head',
        });
      } catch (error) {
        console.error('Failed to load role access:', error);
        setState(prev => ({ ...prev, loading: false }));
      } finally {
        setLoading(false);
      }
    };

    loadRoleAccess();
  // Use user?.id instead of user to avoid re-triggering on token refresh
  // (Supabase creates a new user object on tab-restore but id stays the same)
  }, [user?.id]);

  return state;
}
