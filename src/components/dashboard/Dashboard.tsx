import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import DashboardHeader from './DashboardHeader';
import DashboardSidebar from './DashboardSidebar';
import StatisticsOverview from './StatisticsOverview';
import ActivityFeed from './ActivityFeed';
import DataTable from './DataTable';
import UserProfile from './UserProfile';
import { useLocation, Navigate, useNavigate } from 'react-router-dom';
import { useRoleAccess } from '../../hooks/useRoleAccess';
import { usePermissions } from '../../hooks/usePermissions';
import FloatingHelpButton from '../help/FloatingHelpButton';
import HelpSidebar from '../help/HelpSidebar';
import { useHelpStore } from '../../stores/useHelpStore';
import { supabase } from '../../lib/supabase';
import { ShieldAlert, Zap, Clock, ArrowRight, AlertTriangle } from 'lucide-react';

// ── Subscription status type ──────────────────────────────────────────────────
type SubStatus =
  | 'loading'       // still fetching
  | 'active'        // valid paid or trial subscription
  | 'trial_expired' // Elite Trial expired, no paid plan
  | 'none';         // no subscription at all

interface SubInfo {
  status: SubStatus;
  expiredAt?: string;  // ISO string when trial expired
  daysSinceExpiry?: number;
  daysUntilDataDelete?: number; // positive = days remaining before auto-delete
  planName?: string;
}

// ── Trial Expired Wall ────────────────────────────────────────────────────────
function TrialExpiredWall({ info, onUpgrade }: { info: SubInfo; onUpgrade: () => void }) {
  const daysLeft = info.daysUntilDataDelete ?? 3;
  const isUrgent = daysLeft <= 1;

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="relative z-10 max-w-lg w-full">
        {/* Card */}
        <div className="bg-white border border-slate-200 rounded-3xl p-10 shadow-2xl text-center">

          {/* Icon */}
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-6 bg-red-50 ring-8 ring-red-50/50">
            <Clock className="h-10 w-10 text-red-500" />
          </div>

          {/* Heading */}
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mb-2">
            Your {info.planName || 'Free Trial'} Has Ended
          </h1>
          <p className="text-slate-500 text-sm font-medium mb-6 leading-relaxed">
            Your {info.planName || '7-day Elite Trial'} expired on <span className="text-slate-900 font-bold">
              {info.expiredAt ? new Date(info.expiredAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
            </span>. Upgrade to continue using Ace Payroll.
          </p>

          {/* Data deletion warning (Only for Free Trial) */}
          {info.planName === 'Free Trial' ? (
            <div className="bg-red-50 border border-red-100 p-5 rounded-2xl mb-8 text-left relative overflow-hidden">
              <div className="absolute -right-4 -top-4 w-24 h-24 bg-red-100 rounded-full blur-2xl opacity-50"></div>
              <div className="flex items-start gap-4 relative z-10">
                <AlertTriangle className="h-6 w-6 flex-shrink-0 mt-0.5 text-red-600" />
                <div>
                  <p className="text-sm font-black uppercase tracking-wide mb-1 text-red-700">
                    {daysLeft <= 0 ? 'Trial & Grace Period Expired' : `Trial Expired — Data Deletion in ${daysLeft} Day${daysLeft !== 1 ? 's' : ''}`}
                  </p>
                  <p className="text-red-900 text-sm leading-relaxed mb-4 font-medium">
                    {daysLeft <= 0
                      ? 'Your trial limit and grace period have both expired. Your operational data has been removed from the workspace and cannot be retrieved.'
                      : `Your trial has ended. Your workspace will be completely reset if you don't upgrade within ${daysLeft} day${daysLeft !== 1 ? 's' : ''}.`
                    }
                  </p>
                  <div className="bg-white/80 p-3 rounded-xl border border-red-200/60 flex gap-2.5 items-start shadow-sm">
                    <ShieldAlert className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <p className="text-xs font-bold text-red-800 leading-relaxed">
                      {daysLeft <= 0
                        ? 'You can no longer retrieve the deleted data, but you can still upgrade to any of our paid plans to continue using the system with a fresh setup.'
                        : 'CRITICAL WARNING: Once your data is deleted, it is permanently erased from our servers and cannot be retrieved.'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-100 p-5 rounded-2xl mb-8 text-left relative overflow-hidden">
              <div className="absolute -right-4 -top-4 w-24 h-24 bg-amber-100 rounded-full blur-2xl opacity-50"></div>
              <div className="flex items-start gap-4 relative z-10">
                <Clock className="h-6 w-6 flex-shrink-0 mt-0.5 text-amber-600" />
                <div>
                  <p className="text-sm font-black uppercase tracking-wide mb-1 text-amber-700">
                    Plan Access Restricted
                  </p>
                  <p className="text-amber-900 text-sm leading-relaxed font-medium">
                    Your {info.planName} has expired. All your data is safely preserved, but you need to renew your subscription to regain full access to the platform.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Upgrade CTA */}
          <button
            onClick={onUpgrade}
            className="w-full bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-black py-4 rounded-2xl transition-all shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-3 group mb-4"
          >
            <Zap className="h-5 w-5" />
            Upgrade Plan Now
            <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
          </button>

          <p className="text-slate-500 text-sm font-medium">
            Contact us at{' '}
            <a href="mailto:sales@acesoft.in" className="text-indigo-600 hover:text-indigo-700 transition-colors">
              sales@acesoft.in
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user } = useAuth();
  const { currentTenant, loading: tenantLoading } = useTenant();
  const location = useLocation();
  const navigate = useNavigate();
  const { isEmployee, isAdmin, loading, tenantId, role } = useRoleAccess();
  const { isManager, hasAccess, loading: permsLoading } = usePermissions();
  const { setCurrentPageContext } = useHelpStore();
  const hideSidebarPaths = ['/dashboard/attendance-face-verify'];
  const showSidebar = !hideSidebarPaths.includes(location.pathname);
  const showEmployeeDashboard = isEmployee || role === 'Reporting Head';

  // Sync the current page context into the help store for contextual article loading
  useEffect(() => {
    setCurrentPageContext(location.pathname);
  }, [location.pathname, setCurrentPageContext]);

  // Auto-close sidebar on route change for mobile only (< lg breakpoint)
  useEffect(() => {
    if (window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  }, [location.pathname]);

  const isOverviewPage = location.pathname === '/dashboard' || location.pathname === '/dashboard/' || location.pathname === '/dashboard/overview' || location.pathname === '/dashboard/overview/';

  // ── Unified Full-Page Loader ───────────────────────────────────────────────
  if (loading || permsLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
        <p className="text-gray-500 text-sm font-medium animate-pulse">Loading Ace Payroll...</p>
      </div>
    );
  }

  // ── Route Authorization Guard ──────────────────────────────────────────────
  if (!isOverviewPage && !permsLoading) {
    const path = location.pathname.endsWith('/') && location.pathname.length > 1
      ? location.pathname.slice(0, -1)
      : location.pathname;

    let hasRouteAccess = hasAccess(path);
    if (path === '/dashboard/billing') {
      hasRouteAccess = isAdmin;
    }

    if (!hasRouteAccess) {
      return <Navigate to="/dashboard" replace />;
    }
  }

  // ── Manager redirect ────────────────────────────────────────────────────────
  if (isManager && isOverviewPage) {
    return <Navigate to="/dashboard/global-tenant-management" replace />;
  }

  // ── Active subscription — render normally ───────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-100">
      {showSidebar && (
        <DashboardHeader onMenuClick={() => setSidebarOpen(true)} />
      )}
      {showSidebar && (
        <DashboardSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      )}

      <div className={showSidebar ? 'lg:pl-64 pt-14' : 'pt-14'}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {isOverviewPage ? (
            <div className="grid grid-cols-1 gap-8">
              <StatisticsOverview />
              {!showEmployeeDashboard && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="lg:col-span-1">
                    <ActivityFeed />
                  </div>
                  <div className="lg:col-span-2">
                    <DataTable />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <Outlet />
          )}
        </div>
      </div>

      {/* ── Help System ── */}
      <FloatingHelpButton />
      <HelpSidebar />
    </div>
  );
}