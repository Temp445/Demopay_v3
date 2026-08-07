import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, AuthError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { useUserProfileStore } from '../stores/userProfileStore';
import { clearRoleCache } from '../lib/roleBasedAccess';

interface AuthContextType {
  user: User | null;
  tenantId: string | null;
  loading: boolean;
  error: string | null;
  isPasswordRecovery: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, organizationName: string, fullName?: string, mobileNumber?: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log('Auth state change:', _event);
      if (_event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true);
        setUser(session?.user ?? null);
      } else {
        setUser(session?.user ?? null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);


  useEffect(() => {
    if (user) {
      (async () => {
        const tenant_id = await loadUserTenantId(user.id);
        setTenantId(tenant_id);
        if (tenant_id) {
          await loadUserProfile(user.id, tenant_id);
          
          if (user.email) {
            const { data: employeeData } = await supabase
              .from('employees')
              .select('status')
              .eq('email', user.email)
              .eq('tenant_id', tenant_id)
              .limit(1)
              .maybeSingle();

            if (employeeData && ['Relieved', 'Suspended', 'Terminated'].includes(employeeData.status)) {
              await supabase.auth.signOut();
              setError(`Your account is currently inactive (Status: ${employeeData.status}). Please contact your administrator for access.`);
              return;
            }
          }
        }
      })();
    } else {
      setTenantId(null);
      useUserProfileStore.getState().clearUserProfile();
    }
  }, [user]);

  const loadUserTenantId = async (userId: string) => {
    try {
      const { data, error } = await supabase.rpc('get_user_tenant_id');
      if (error) {
        console.error('Error loading tenant_id:', error);
        return null;
      }
      return data;
    } catch (err) {
      console.error('Failed to load tenant_id:', err);
      return null;
    }
  };

  const loadUserProfile = async (userId: string, tenantId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        console.error('Error loading profile:', error);
      }

      useUserProfileStore.getState().setUserProfile(userId, tenantId, data);
    } catch (err) {
      console.error('Failed to load profile:', err);
      useUserProfileStore.getState().setUserProfile(userId, tenantId, null);
    }
  };

  // useEffect(() => {
  //   // Check active sessions and sets the user
  //   supabase.auth.getSession().then(async ({ data: { session }, error }) => {
  //     if (error) {
  //       console.error('Session error:', error);
  //       setUser(null);
  //       setTenantId(null);
  //       useUserProfileStore.getState().clearUserProfile();
  //       setLoading(false);
  //       return;
  //     }

  //     setUser(session?.user ?? null);
  //     if (session?.user) {
  //       const tenant_id = await loadUserTenantId(session.user.id);
  //       setTenantId(tenant_id);
  //       if (tenant_id) {
  //         await loadUserProfile(session.user.id, tenant_id);
  //       }
  //     } else {
  //       setTenantId(null);
  //       useUserProfileStore.getState().clearUserProfile();
  //     }
  //     setLoading(false);
  //   }).catch((err) => {
  //     console.error('Failed to get session:', err);
  //     setUser(null);
  //     setTenantId(null);
  //     useUserProfileStore.getState().clearUserProfile();
  //     setLoading(false);
  //   });

  //   // Listen for changes on auth state
  //   const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
  //     console.log('Auth state change:', event);

  //     // Handle explicit sign out
  //     if (event === 'SIGNED_OUT') {
  //       setUser(null);
  //       setTenantId(null);
  //       useUserProfileStore.getState().clearUserProfile();
  //       setLoading(false);
  //       return;
  //     }

  //     // Update user state based on session
  //     setUser(session?.user ?? null);
  //     if (session?.user) {
  //       const tenant_id = await loadUserTenantId(session.user.id);
  //       setTenantId(tenant_id);
  //       if (tenant_id) {
  //         await loadUserProfile(session.user.id, tenant_id);
  //       }
  //     } else {
  //       setTenantId(null);
  //       useUserProfileStore.getState().clearUserProfile();
  //     }
  //     setLoading(false);
  //   });

  //   return () => subscription.unsubscribe();
  // }, []);

  const handleAuthError = (error: AuthError) => {
    switch (error.message) {
      case 'Invalid login credentials':
        setError('Invalid email or password');
        break;
      case 'User already registered':
        setError('An account with this email already exists');
        break;
      default:
        setError(error.message);
    }
  };

  const clearError = () => setError(null);

  const signIn = async (email: string, password: string) => {
    try {
      clearError();
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      
      if (data?.session?.user) {
        const tenant_id = await loadUserTenantId(data.session.user.id);
        
        let query = supabase.from('employees').select('status').eq('email', email);
        if (tenant_id) {
          query = query.eq('tenant_id', tenant_id);
        }
        
        const { data: employeeData } = await query.limit(1).maybeSingle();

        if (employeeData && ['Relieved', 'Suspended', 'Terminated'].includes(employeeData.status)) {
          await supabase.auth.signOut();
          throw new Error(`Your account is currently inactive (Status: ${employeeData.status}). Please contact your administrator for access.`);
        }
      }
    } catch (error: any) {
      handleAuthError(error as AuthError);
      throw error;
    }
  };

  const signUp = async (email: string, password: string,  organizationName: string, fullName: string = '', mobileNumber: string = '') => {
    try {
      clearError();
      const { error } = await supabase.auth.signUp({ 
        email, 
        password,
        options: {
          emailRedirectTo: window.location.origin + '/dashboard',
          data: {
            name: fullName,
            company_name: organizationName,
            mobile_number: mobileNumber,
          },
        }
      });
      if (error) throw error;
    } catch (error) {
      handleAuthError(error as AuthError);
      throw error;
    }
  };

  const signOut = async () => {
    try {
      clearError();
      // Clear all session caches so re-login always loads fresh data
      try { sessionStorage.removeItem('ace_sub_cache'); } catch { /* ignore */ }
      clearRoleCache();
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (error) {
      handleAuthError(error as AuthError);
      throw error;
    }
  };

  const resetPassword = async (email: string) => {
    try {
      clearError();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/reset-password'
      });
      if (error) throw error;
    } catch (error) {
      handleAuthError(error as AuthError);
      throw error;
    }
  };

  const updatePassword = async (newPassword: string) => {
    try {
      clearError();
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setIsPasswordRecovery(false);
    } catch (error) {
      handleAuthError(error as AuthError);
      throw error;
    }
  };

  const value = {
    user,
    tenantId,
    loading,
    error,
    isPasswordRecovery,
    signIn,
    signUp,
    signOut,
    resetPassword,
    updatePassword,
    clearError
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}