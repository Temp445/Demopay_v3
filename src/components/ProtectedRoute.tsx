import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import GlobalLoader from './GlobalLoader';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [loadingTimeout, setLoadingTimeout] = useState(false);

  // Set a timeout to detect if loading is stuck
  useEffect(() => {
    if (loading) {
      const timer = setTimeout(() => {
        console.error('Loading timeout - possible session issue');
        setLoadingTimeout(true);
      }, 10000); // 10 second timeout

      return () => clearTimeout(timer);
    } else {
      setLoadingTimeout(false);
    }
  }, [loading]);

  if (loading && !loadingTimeout) {
    return <GlobalLoader />;
  }

  // If loading timed out or there's no user, redirect to login
  if (loadingTimeout || !user) {
    // Save the attempted URL for redirecting after login
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}