import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { usePermissions } from '../hooks/usePermissions';
import { useDomainConfigStore } from '../stores/domainConfigStore';
import GlobalLoader from './GlobalLoader';

export default function ScreenGuard({ children }: { children: React.ReactNode }) {
  const { hasAccess, loading: permissionsLoading } = usePermissions();
  const { loading: domainLoading, initialized: domainInitialized } = useDomainConfigStore();
  const location = useLocation();
  const [loadingTimeout, setLoadingTimeout] = useState(false);

  const isLoading = permissionsLoading || (domainLoading && !domainInitialized);

  // Set a timeout to detect if loading is stuck
  useEffect(() => {
    if (isLoading) {
      const timer = setTimeout(() => {
        console.error('ScreenGuard loading timeout');
        setLoadingTimeout(true);
      }, 5000); // 5 second timeout for permissions

      return () => clearTimeout(timer);
    } else {
      setLoadingTimeout(false);
    }
  }, [isLoading]);

  if (isLoading && !loadingTimeout) {
    return <GlobalLoader />;
  }

  // Bypass checks for the base dashboard route itself
  if (location.pathname === '/dashboard' || location.pathname === '/dashboard/') {
    return <>{children}</>;
  }

  // Check if user has access to the current route
  if (!hasAccess(location.pathname)) {
    // If they don't have access, redirect them to a safe default page (overview or dashboard)
    // Wait, since we are returning a Navigate, we should replace to avoid broken history
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
