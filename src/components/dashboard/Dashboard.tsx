import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import DashboardHeader from './DashboardHeader';
import DashboardSidebar from './DashboardSidebar';
import StatisticsOverview from './StatisticsOverview';
import ActivityFeed from './ActivityFeed';
import DataTable from './DataTable';
import LeaveTypesPage from './leave/LeaveTypesPage';
import GlobalLoader from '../GlobalLoader';
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

// ── Session cache helpers ─────────────────────────────────────────────────────
const SUB_CACHE_KEY = 'ace_sub_cache';

function readSubCache(tenantId: string): SubInfo | null {
  try {
    const raw = sessionStorage.getItem(SUB_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Only use cache if it belongs to the same tenant
    if (parsed.tenantId !== tenantId) return null;
    return parsed.info as SubInfo;
  } catch {
    return null;
  }
}

function writeSubCache(tenantId: string, info: SubInfo) {
  try {
    sessionStorage.setItem(SUB_CACHE_KEY, JSON.stringify({ tenantId, info }));
  } catch { /* ignore */ }
}

function clearSubCache() {
  try { sessionStorage.removeItem(SUB_CACHE_KEY); } catch { /* ignore */ }
}

// ── Trial Expired Wall ────────────────────────────────────────────────────────
function TrialExpiredWall({ info, onUpgrade }: { info: SubInfo; onUpgrade: () => void }) {
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  const expiredDate = info.expiredAt
    ? new Date(info.expiredAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';

  return (
    <div id="trial-expired-wall" className="fixed inset-0 z-[9999] flex items-center justify-center p-4 backdrop-blur bg-[#10182894]">
      <div className="w-full max-w-md bg-white border border-indigo-100 rounded-2xl  p-8 relative">
        
        {/* Icon */}
        <div className="h-10 w-10 rounded-xl border border-orange-200 bg-orange-50 flex items-center justify-center mb-5">
          <svg className="h-5 w-5 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>

        {/* Badge */}
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-orange-50 border border-orange-100 mb-4">
          <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
          <span className="text-sm font-semibold text-orange-600">Access restricted</span>
        </div>

        {/* Heading & Description */}
        <h1 className="text-xl font-bold text-slate-900 mb-2">
          {info.status === 'none' 
            ? 'Active Subscription Required' 
            : `Your ${info.planName || 'Professional'} plan has expired`}
        </h1>
        <p className="text-sm text-slate-500 leading-relaxed mb-6">
          {info.status === 'none'
            ? 'This workspace requires an active subscription. Features are temporarily locked until a subscription is purchased. Renewing restores access immediately.'
            : 'This workspace\'s subscription lapsed and features are temporarily locked. All payroll records, employee data, and history remain intact — renewing restores access immediately.'}
        </p>

        {/* Details List */}
        {info.status !== 'none' && (
          <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 mb-6">
            <div className="flex justify-between items-center p-3.5">
              <span className="text-xs font-medium text-slate-500">Plan</span>
              <span className="text-xs font-bold text-slate-900">{info.planName || 'Professional'}</span>
            </div>
            <div className="flex justify-between items-center p-3.5">
              <span className="text-xs font-medium text-slate-500">Expired on</span>
              <span className="text-xs font-bold text-slate-900">{expiredDate}</span>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="space-y-2.5">
          <button
            onClick={onUpgrade}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors"
          >
            Renew subscription <ArrowRight className="h-4 w-4" />
          </button>
          
          <button
            className="w-full py-2.5 rounded-lg bg-white  text-slate-700 text-sm font-medium"
          >
            Contact your workspace admin
          </button>
        </div>

        {/* Footer Links */}
        <div className="flex items-right justify-end mt-6 pt-4 border-t border-slate-100">
          <a href="mailto:sales@acesoft.in" className="text-xs text-slate-600 hover:text-slate-600 transition-colors">
            Contact sales at <span className="text-indigo-600">sales@acesoft.in</span>
          </a>
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

  // Initialise from cache if available — avoids loading state on refresh
  const [subInfo, setSubInfo] = useState<SubInfo>(() => {
    return { status: 'loading' };
  });

  // Use tenantId from TenantContext so this runs in PARALLEL with useRoleAccess,
  // not sequentially after it. This cuts load time significantly.
  const tenantIdForSub = currentTenant?.id ?? null;

  useEffect(() => {
    // Wait for tenant to be resolved
    if (tenantLoading || !tenantIdForSub) {
      setSubInfo({ status: 'loading' });
      return;
    }

    // --- Apply cache immediately to avoid loading flicker ---
    const cached = readSubCache(tenantIdForSub);
    if (cached) {
      setSubInfo(cached); // Show cached status instantly (no loading state)
    } else {
      setSubInfo({ status: 'loading' }); // First ever load: must wait
    }

    // Always re-verify in background regardless of cache
    async function checkSubscription() {
      try {
        const { data, error } = await supabase
          .from('subscriptions')
          .select('id, status, expires_at, plan_name')
          .eq('tenant_id', tenantIdForSub)
          .order('created_at', { ascending: false });
          
        if (error) throw error;
        
        let freshInfo: SubInfo;

        if (!data || data.length === 0) {
          freshInfo = { status: 'none' };
        } else {
          const now = new Date();
          const active = data.find(s => {
            const isStatusActive = s.status === 'active';
            const isNotExpired = new Date(s.expires_at) > now;
            return isStatusActive && isNotExpired;
          });

          if (active) {
            freshInfo = { status: 'active', planName: active.plan_name };
          } else {
            const latest = data[0];
            const expiredAtDate = new Date(latest.expires_at);
            const diffTime = Math.abs(now.getTime() - expiredAtDate.getTime());
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            freshInfo = { 
              status: 'trial_expired', 
              expiredAt: latest.expires_at,
              planName: latest.plan_name,
              daysSinceExpiry: diffDays,
              daysUntilDataDelete: Math.max(0, 3 - diffDays)
            };
          }
        }

        // Write to cache and update state
        writeSubCache(tenantIdForSub, freshInfo);
        setSubInfo(freshInfo);
      } catch (err) {
        console.error('Failed to fetch subscription', err);
        if (!cached) {
          setSubInfo({ status: 'active' });
        }
      }
    }
    
    checkSubscription();

    // Listen for successful payments to instantly unlock the dashboard
    const handleSubscriptionUpdate = () => {
      clearSubCache();
      checkSubscription();
    };
    window.addEventListener('subscription_updated', handleSubscriptionUpdate);

    return () => {
      window.removeEventListener('subscription_updated', handleSubscriptionUpdate);
    };
  // Run as soon as tenant is available (parallel with role/perms loading)
  }, [tenantLoading, tenantIdForSub]);

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

  // ── Block if Expired or No Active Subscription ───────────────────────────────────────────────────────
  const isBillingPage = location.pathname === '/dashboard/billing' || location.pathname === '/dashboard/billing/';
  const isSubscriptionRequired = currentTenant?.subscription_enabled === true;
  const isExpiredBlocked = isSubscriptionRequired && 
    (subInfo.status === 'none' || subInfo.status === 'trial_expired') && 
    !isBillingPage;

  // ── Anti-Tamper Protection ──────────────────────────────────────────────────
  // NOTE: We delay the start of the interval by 800ms to give React time to
  // commit the wall element to the DOM before we start checking for it.
  useEffect(() => {
    if (!isExpiredBlocked) return;

    let checkInterval: ReturnType<typeof setInterval> | null = null;

    const startDelay = setTimeout(() => {
      checkInterval = setInterval(() => {
        const wall = document.getElementById('trial-expired-wall');
        if (
          !wall ||
          window.getComputedStyle(wall).display === 'none' ||
          window.getComputedStyle(wall).visibility === 'hidden' ||
          window.getComputedStyle(wall).opacity === '0'
        ) {
          // User attempted to bypass the wall by deleting/hiding the DOM node
          window.location.replace('/dashboard/billing');
        }
      }, 500);
    }, 800); // Wait for React to paint the wall before we start checking

    return () => {
      clearTimeout(startDelay);
      if (checkInterval) clearInterval(checkInterval);
    };
  }, [isExpiredBlocked]);

  // ── Unified loading flag ──────────────────────────────────────────────────
  const isAppLoading = loading || permsLoading || tenantLoading || subInfo.status === 'loading';

  // ── Route Authorization Guard (only when not loading) ─────────────────────
  if (!isAppLoading && !isOverviewPage) {
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
  if (!isAppLoading && isManager && isOverviewPage) {
    return <Navigate to="/dashboard/global-tenant-management" replace />;
  }

  // ── Active subscription — render normally ───────────────────────────────────
  return (
    <div className="min-h-screen bg-indigo-50">

      {/* ── Full-Page Loading Overlay (React-controlled, no flash) ── */}
      {isAppLoading && (
        <div className="fixed inset-0 z-[99999] bg-gray-50 flex flex-col items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4" />
          <p className="text-gray-500 text-sm font-medium animate-pulse">Loading Ace Payroll...</p>
        </div>
      )}

      {showSidebar && (
        <DashboardHeader onMenuClick={() => setSidebarOpen(true)} />
      )}
      {showSidebar && (
        <DashboardSidebar 
          isOpen={sidebarOpen} 
          onClose={() => setSidebarOpen(false)} 
          isLocked={subInfo.status === 'trial_expired'}
        />
      )}

      <div className={showSidebar ? 'lg:pl-64 pt-14' : 'pt-14'}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Don't render heavy content while loading — prevents cascade DB calls */}
          {!isAppLoading && (isOverviewPage ? (
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
          ))}
        </div>
      </div>

      {/* ── Help System ── */}
      <FloatingHelpButton />
      <HelpSidebar />
      
      {/* ── Expiry Overlay ── */}
      {isExpiredBlocked && (
        <TrialExpiredWall 
          info={subInfo} 
          onUpgrade={() => navigate('/dashboard/billing')} 
        />
      )}
    </div>
  );
}