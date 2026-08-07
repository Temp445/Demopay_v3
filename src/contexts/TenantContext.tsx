import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import {
  Tenant,
  TenantUser,
  getPrimaryTenant,
  getCurrentUserTenants,
  setPrimaryTenant as setUserPrimaryTenant,
} from '../lib/tenants';
import { setCurrentTenantId } from '../lib/tenantDb';
import { supabase } from '../lib/supabase';

interface TenantContextType {
  currentTenant: Tenant | null;
  userTenants: TenantUser[];
  loading: boolean;
  error: string | null;
  switchTenant: (tenantId: string) => Promise<void>;
  refreshTenants: () => Promise<void>;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [currentTenant, setCurrentTenant] = useState<Tenant | null>(null);
  const [userTenants, setUserTenants] = useState<TenantUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTenantData = async () => {
    if (!user) {
      setCurrentTenant(null);
      setUserTenants([]);
      setCurrentTenantId(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const [primaryTenantFallback, allTenants] = await Promise.all([
        getPrimaryTenant(),
        getCurrentUserTenants(),
      ]);

      const hostname = window.location.hostname;
      let activeTenant = primaryTenantFallback;

      try {
        const { data: domainConfigs } = await supabase
          .from('domain_configurations')
          .select('tenant_id')
          .eq('domain_name', hostname)
          .eq('is_active', true);

        if (domainConfigs && domainConfigs.length > 0) {
          // If the user's current primary tenant is already mapped to this domain, prefer it.
          const isPrimaryMapped = activeTenant && domainConfigs.some(dc => dc.tenant_id === activeTenant?.id);
          
          if (!isPrimaryMapped) {
            // Find the first mapped tenant that the user actually has access to
            for (const config of domainConfigs) {
              const matchedTenantUser = allTenants.find(t => t.tenant_id === config.tenant_id);
              if (matchedTenantUser && matchedTenantUser.tenant) {
                activeTenant = matchedTenantUser.tenant;
                break;
              }
            }
          }
        }
      } catch (err) {
        console.error('Failed to resolve domain configuration:', err);
      }

      setCurrentTenant(activeTenant);
      setUserTenants(allTenants);

      if (activeTenant) {
        setCurrentTenantId(activeTenant.id);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load tenant data';

      // Check if this is an authentication error
      if (errorMessage.includes('JWT') || errorMessage.includes('session') || errorMessage.includes('expired')) {
        console.error('Session expired while loading tenant data:', err);
        // Clear tenant data and let AuthContext handle the redirect
        setCurrentTenant(null);
        setUserTenants([]);
        setCurrentTenantId(null);
      } else {
        setError(errorMessage);
        console.error('Error loading tenant data:', err);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTenantData();
  // Use user?.id instead of user to avoid reloading on auth token refresh
  // (Supabase creates a new user object on tab-restore but id stays the same)
  }, [user?.id]);

  const switchTenant = async (tenantId: string) => {
    if (!user) {
      throw new Error('User must be authenticated to switch tenants');
    }

    try {
      setLoading(true);
      setError(null);

      await setUserPrimaryTenant(user.id, tenantId);

      await loadTenantData();

      window.location.reload();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to switch tenant';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const refreshTenants = async () => {
    await loadTenantData();
  };

  return (
    <TenantContext.Provider
      value={{
        currentTenant,
        userTenants,
        loading,
        error,
        switchTenant,
        refreshTenants,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (context === undefined) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
}
