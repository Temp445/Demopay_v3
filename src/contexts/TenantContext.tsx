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

      const [primaryTenant, allTenants] = await Promise.all([
        getPrimaryTenant(),
        getCurrentUserTenants(),
      ]);

      setCurrentTenant(primaryTenant);
      setUserTenants(allTenants);

      if (primaryTenant) {
        setCurrentTenantId(primaryTenant.id);
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
  }, [user]);

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
