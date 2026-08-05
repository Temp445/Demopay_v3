import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { usePermissions } from '../hooks/usePermissions';
import { useDomainConfigStore } from '../stores/domainConfigStore';

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
    return (
      <div className="min-h-screen flex flex-col items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
        <p className="text-gray-500 text-sm font-medium animate-pulse">Loading Screen...</p>
      </div>
    );
  }

  // Bypass checks for the base dashboard route itself
  if (location.pathname === '/dashboard' || location.pathname === '/dashboard/') {
    return <>{children}</>;
  }

  // Check if user has access to the current route
  if (!hasAccess(location.pathname)) {
    // If they don't have access, redirect them to a safe default page (overview or dashboard)
    // Wait, since we are returning a Navigate, we should replace to avoid broken history
    return <Navigate to="/dashboard/overview" replace />;
  }

  return <>{children}</>;
}
