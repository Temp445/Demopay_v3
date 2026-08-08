import React, { useEffect, useRef, useState } from 'react';
import { Menu, LogOut, User as UserIcon, KeyRound, Eye, EyeOff, AlertCircle, Download, Calendar, Zap, ShieldCheck, Clock, CreditCard, BadgeCheck, ShieldAlert, X, ExternalLink } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useRoleAccess } from '../../hooks/useRoleAccess';
import { useTenant } from '../../contexts/TenantContext';
import { useNavigate } from 'react-router-dom';
import NotificationDropdown from '../NotificationDropdown';
import TenantSwitcher from '../TenantSwitcher';
import { useUserProfileStore } from '../../stores/userProfileStore';
import { supabase } from '../../lib/supabase';
import AceLogo from '../../assets/AceLogo.png';
import toast from 'react-hot-toast';

interface DashboardHeaderProps {
  onMenuClick: () => void;
}

interface SubscriptionData {
  plan_name: string;
  created_at: string;
  expires_at: string;
  amount?: number;
}

// ── Subscription Details Modal ────────────────────────────────────────────────
function SubscriptionDetailsModal({ sub, onClose, onUpgrade }: { sub: SubscriptionData; onClose: () => void; onUpgrade: () => void }) {
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const isEnterprise = sub.plan_name.toLowerCase().includes('enterprise');
  const isTrial = sub.plan_name.toLowerCase().includes('trial');

  const now = new Date().getTime();
  const created = new Date(sub.created_at).getTime();
  const end = new Date(sub.expires_at).getTime();
  
  const daysRemaining = Math.max(0, Math.ceil((end - now) / (1000 * 60 * 60 * 24)));
  const totalDays = Math.max(1, Math.ceil((end - created) / (1000 * 60 * 60 * 24)));
  const progressPercent = Math.max(0, Math.min(100, ((totalDays - daysRemaining) / totalDays) * 100));

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="bg-white border border-indigo-500 rounded-2xl shadow-xl w-full max-w-[400px] relative overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Close button top right */}
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors p-1">
          <X className="h-4 w-4" />
        </button>

        <div className="p-7">
          {/* Header */}
          <div className="mb-7">
            <h3 className="text-lg font-bold text-slate-900 mb-0.5">Your subscription</h3>
            <p className="text-[13px] text-slate-500">Manage your Ace Payroll access</p>
          </div>

          {/* Current Plan */}
          <div className="mb-6">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Current Plan</p>
            <div className="flex items-center justify-between">
              <p className="text-base font-bold text-slate-900">{sub.plan_name}</p>
              <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-600 px-2.5 py-0.5 rounded-full border border-emerald-100">
                 <div className="h-1.5 w-1.5 rounded-full bg-emerald-500"></div>
                 <span className="text-[11px] font-semibold tracking-wide">Active</span>
              </div>
            </div>
          </div>

          {/* Trial Progress */}
          {isTrial && (
            <div className="mb-7">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-[12px] font-medium text-slate-500">Trial progress</span>
                <span className="text-[12px] font-medium text-slate-700">{daysRemaining} days remaining</span>
              </div>
              <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                 <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${progressPercent}%` }}></div>
              </div>
            </div>
          )}

          {/* Table */}
          <div className="border border-slate-200 rounded-lg overflow-hidden mb-6">
            <div className="flex items-center justify-between p-3.5 border-b border-slate-100 bg-white">
              <span className="text-[13px] text-slate-500">Started</span>
              <span className="text-[13px] text-slate-900 font-semibold">{formatDate(sub.created_at)}</span>
            </div>
            <div className="flex items-center justify-between p-3.5 bg-white">
              <span className="text-[13px] text-slate-500">Renews on</span>
              <span className="text-[13px] text-slate-900 font-semibold">{formatDate(sub.expires_at)}</span>
            </div>
          </div>

          {/* Buttons */}
          <div className="space-y-3">
            {!isEnterprise && (
              <button
                onClick={onUpgrade}
                className="w-full bg-[#0F172A] text-white text-[13px] font-medium py-3 rounded-lg hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
              >
                View plan details
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={onClose}
              className="w-full bg-white text-slate-700 text-[13px] font-medium py-3 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors shadow-sm"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DashboardHeader({ onMenuClick }: DashboardHeaderProps) {
  const { signOut, user, updatePassword, tenantId } = useAuth();
  const { isAdmin, loading: roleLoading } = useRoleAccess();
  const { currentTenant } = useTenant();
  const { profile, fetchProfile } = useUserProfileStore();
  const navigate = useNavigate();
  const [companyName, setCompanyName] = useState<string>('');
  
  // Subscription state
  const [subInfo, setSubInfo] = useState<SubscriptionData | null>(null);
  const [showSubModal, setShowSubModal] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState<boolean | null>(null);
  const [hasExpired, setHasExpired] = useState(false);

  useEffect(() => {
    async function checkSub() {
      if (!tenantId || !isAdmin) {
        if (!roleLoading) {
          setIsSubscribed(false);
          setHasExpired(false);
        }
        return;
      }
      const now = new Date().toISOString();
      const { data: activeData } = await supabase
        .from('subscriptions')
        .select('plan_name, created_at, expires_at')
        .eq('tenant_id', tenantId)
        .eq('status', 'active')
        .gt('expires_at', now)
        .limit(1)
        .maybeSingle();
      
      if (activeData) {
        setIsSubscribed(true);
        setSubInfo(activeData);
        setHasExpired(false);
      } else {
        setIsSubscribed(false);
        setSubInfo(null);
        
        // Check if there are any previous subscriptions (which must be expired if none are active)
        const { count } = await supabase
          .from('subscriptions')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId);
        
        setHasExpired(count !== null && count > 0);
      }
    }
    
    if (!roleLoading) {
      checkSub();
    }

    const handleUpdate = () => checkSub();
    window.addEventListener('subscription_updated', handleUpdate);
    return () => window.removeEventListener('subscription_updated', handleUpdate);
  }, [tenantId, isAdmin, roleLoading]);

  // Dropdown
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Change Password Modal
  const [showModal, setShowModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwLoading, setPwLoading] = useState(false);

  useEffect(() => {
    if (user) fetchProfile(user.id);
  }, [user, fetchProfile]);

  useEffect(() => {
    const fetchCompany = async () => {
      const tenantId = (profile as any)?.tenant_id;
      if (!tenantId) return;
      try {
        const { data, error } = await supabase
          .from('company_settings')
          .select('company_name')
          .eq('tenant_id', tenantId)
          .single();
        if (error) throw error;
        if (data?.company_name) setCompanyName(data.company_name);
      } catch (error) {
        console.error('Error fetching company name:', error);
      }
    };
    fetchCompany();
  }, [profile]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const openChangePassword = () => {
    setDropdownOpen(false);
    setNewPassword('');
    setConfirmPassword('');
    setPwError('');
    setShowModal(true);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      setPwError('Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError('Passwords do not match');
      return;
    }
    try {
      setPwError('');
      setPwLoading(true);
      await updatePassword(newPassword);
      toast.success('Password updated successfully');
      setShowModal(false);
    } catch (err: any) {
      setPwError(err?.message || 'Failed to update password');
    } finally {
      setPwLoading(false);
    }
  };

  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'User';

  let daysRemaining: number | null = null;
  if (subInfo?.expires_at) {
    const end = new Date(subInfo.expires_at).getTime();
    const now = new Date().getTime();
    daysRemaining = Math.max(0, Math.ceil((end - now) / (1000 * 60 * 60 * 24)));
  }

  const isTrial = subInfo?.plan_name?.toLowerCase().includes('trial');
  let subStatusBadge = null;
  const isSubscriptionRequired = currentTenant?.subscription_enabled !== false;

  if (isAdmin && isSubscriptionRequired) {
    if (hasExpired) {
      subStatusBadge = (
        <button onClick={() => navigate('/dashboard/billing')} className="group flex items-center gap-1.5 px-3 py-1 md:py-1.5 bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white rounded-full border border-red-400/50 shadow-sm transition-all cursor-pointer">
          <AlertCircle className="h-3.5 w-3.5 group-hover:animate-pulse" />
          <span className="hidden sm:inline text-[10px] md:text-xs font-bold tracking-wide uppercase">Plan Expired</span>
          <span className="sm:hidden text-[10px] font-bold tracking-wide uppercase">Expired</span>
        </button>
      );
    } else if (subInfo && daysRemaining !== null) {
      if (isTrial) {
        subStatusBadge = (
          <button onClick={() => navigate('/dashboard/billing')} className="group flex items-center gap-1.5 px-3 py-1 md:py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-full border border-white/20 shadow-sm transition-all cursor-pointer backdrop-blur-sm">
            {/* <Zap className="h-3.5 w-3.5 text-amber-300 group-hover:scale-110 transition-transform" /> */}
            <span className="hidden sm:inline text-[10px] md:text-xs font-semibold tracking-wide">Trial: <span className="font-bold text-amber-400">{daysRemaining} Days Left</span></span>
            <span className="sm:hidden text-[10px] font-bold tracking-wide">{daysRemaining}d Left</span>
          </button>
        );
      } else if (daysRemaining <= 10) {
        subStatusBadge = (
          <button onClick={() => navigate('/dashboard/billing')} className="group flex items-center gap-1.5 px-3 py-1 md:py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-full border border-amber-400/50 shadow-sm transition-all cursor-pointer">
            <Clock className="h-3.5 w-3.5 text-white/90 group-hover:scale-110 transition-transform" />
            <span className="hidden sm:inline text-[10px] md:text-xs font-semibold tracking-wide">Expires in <span className="font-bold">{daysRemaining} Days</span></span>
            <span className="sm:hidden text-[10px] font-bold tracking-wide">{daysRemaining}d Left</span>
          </button>
        );
      }
    }
  }

  return (
    <>
      <header className="bg-[#6366F1] fixed inset-x-0 top-0 z-20">
        <div className="h-14">
          <div className="mx-auto h-full px-2 flex justify-between items-center relative">

            {/* LEFT */}
            <div className="flex items-center min-w-0">
              <div className="flex items-center min-w-0">
                <button
                  type="button"
                  className="px-2 sm:px-4 text-white hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white lg:hidden flex-shrink-0"
                  onClick={onMenuClick}
                >
                  <span className="sr-only">Open sidebar</span>
                  <Menu className="h-6 w-6" />
                </button>

                <img
                  src={AceLogo}
                  alt="ACE PAYROLL Logo"
                  className="h-8 w-8 sm:h-9 sm:w-9 bg-white rounded-full pl-0.5 object-contain flex-shrink-0"
                />

                <span className="ml-2 text-white font-semibold text-lg tracking-wide whitespace-nowrap truncate">
                  <span className="hidden sm:inline">ACE PAYROLL SYSTEM</span>
                  <span className="sm:hidden">ACE PAYROLL</span>
                </span>
              </div>
            </div>

            <div className="pl-20 transform hidden lg:flex items-center justify-center pointer-events-none">
              <span className="text-white font-semibold text-lg">{companyName}</span>
            </div>

            <div className="flex items-center space-x-1 sm:space-x-2 md:space-x-5 flex-shrink-0">
              
              {subStatusBadge}

              <div className="relative group">
                <a
                  href="/ace-payroll.apk"
                  download="AcePayroll.apk"
                  className="flex items-center justify-center h-9 w-9 rounded-full bg-white/10 border border-white/5 text-white hover:bg-white hover:text-indigo-600 transition-all duration-300 shadow-sm"
                  title="Download Mobile App"
                >
                   <div className="p-1.5 bg-indigo-50 rounded-full text-indigo-500 absolute ">
                      <Download className="h-3 w-3" strokeWidth={3} />
                    </div>
                </a>

                {/* Asymmetric "Pill" Hover Popup - Refined Spacing */}
                <div className="absolute right-full top-1/2 -translate-y-1/2 mr-3 opacity-0 translate-x-3 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300 pointer-events-none z-50">
                  <div className="bg-white py-1.5 pl-4 pr-3.5 rounded-l-full rounded-r-[20px] shadow-2xl border border-indigo-50 flex items-center gap-3 min-w-[120px]">
                   
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black text-indigo-900 uppercase tracking-tighter leading-tight">Get Mobile App</span>
                      <span className="text-[8px] font-bold text-slate-400 uppercase leading-none">Android APK File</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center">
                <TenantSwitcher />
                <NotificationDropdown />
              </div>

              {/* User Dropdown */}
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setDropdownOpen((v) => !v)}
                  className="flex items-center space-x-2 text-indigo-100 border border-white/20 bg-white/10 hover:bg-white/20 transition-colors rounded-full pl-0.5 pr-1 md:pr-3 py-1 focus:outline-none"
                >
                  <div className="h-6 w-6 rounded-full bg-white flex items-center justify-center shadow-sm shrink-0 ml-1">
                    <span className="text-indigo-600 font-bold text-xs md:text-sm">
                      {displayName?.charAt(0)?.toUpperCase() || 'U'}
                    </span>
                  </div>
                  <div className="hidden flex-col items-start md:flex">
                    <span className="text-xs md:text-sm font-semibold text-white leading-none">
                      {displayName?.split(' ')[0] || ''}
                    </span>
                    {profile?.position && (
                      <span className="text-[9px] md:text-[10px] text-indigo-200 mt-0.5 leading-none">{profile.position}</span>
                    )}
                  </div>
                </button>

                {dropdownOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg py-1 z-50 border border-gray-100">
                    {/* User name header */}
                    <div className="px-4 py-2 border-b border-gray-100">
                      <p className="text-sm font-semibold text-gray-800 truncate">{displayName}</p>
                      <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                    </div>

                    {/* Subscription Link (Admin Only, non-AMC tenants only) */}
                    {isAdmin && isSubscriptionRequired && (
                      isSubscribed ? (
                        <button
                          onClick={() => {
                            setDropdownOpen(false);
                            setShowSubModal(true);
                          }}
                          className="w-full flex items-center px-4 py-2 text-sm text-indigo-600 font-bold hover:bg-indigo-50 transition-colors"
                        >
                          <ShieldCheck className="h-4 w-4 mr-3" />
                          View Subscription
                        </button>
                      ) : hasExpired ? (
                        <button
                          onClick={() => {
                            setDropdownOpen(false);
                            navigate('/dashboard/billing');
                          }}
                          className="w-full flex items-center px-4 py-2 text-sm text-rose-600 font-bold hover:bg-rose-50 transition-colors"
                        >
                          <ShieldAlert className="h-4 w-4 mr-3" />
                          Plan Expired
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setDropdownOpen(false);
                            navigate('/dashboard/billing');
                          }}
                          className="w-full flex items-center px-4 py-2 text-sm text-amber-600 font-bold hover:bg-amber-50 transition-colors"
                        >
                          <CreditCard className="h-4 w-4 mr-3" />
                          Upgrade Plan
                        </button>
                      )
                    )}

                    {/* Change Password */}
                    <button
                      onClick={openChangePassword}
                      className="w-full flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
                    >
                      <KeyRound className="h-4 w-4 mr-3 text-gray-400" />
                      Change Password
                    </button>

                    {/* Logout */}
                    <button
                      onClick={handleSignOut}
                      className="w-full flex items-center px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <LogOut className="h-4 w-4 mr-3" />
                      Logout
                    </button>
                  </div>
                )}
              </div>

              {/* Mobile logout (only visible on small screens where dropdown is hidden) */}
              <button
                onClick={handleSignOut}
                className="hidden p-2 rounded-full text-indigo-100 hover:text-white hover:bg-indigo-600 focus:outline-none"
                title="Sign Out"
              >
                <span className="sr-only">Sign out</span>
                <LogOut className="h-6 w-6" />
              </button>
            </div>

          </div>
        </div>
      </header>

      {/* Change Password Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Change Password</h2>
            <p className="text-sm text-gray-500 mb-5">Enter your new password below.</p>

            <form onSubmit={handleChangePassword} className="space-y-4">
              {pwError && (
                <div className="flex items-start gap-2 bg-red-50 text-red-700 rounded-lg px-3 py-2 text-sm">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{pwError}</span>
                </div>
              )}

              {/* New Password */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                <div className="relative">
                  <input
                    type={showNew ? 'text' : 'password'}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="New password"
                    className="w-full pr-10 pl-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew((v) => !v)}
                    className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                    tabIndex={-1}
                  >
                    {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
                <div className="relative">
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className="w-full pr-10 pl-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm((v) => !v)}
                    className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                    tabIndex={-1}
                  >
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pwLoading}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {pwLoading ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Subscription Details Modal */}
      {showSubModal && subInfo && (
        <SubscriptionDetailsModal 
          sub={subInfo} 
          onClose={() => setShowSubModal(false)} 
          onUpgrade={() => {
            setShowSubModal(false);
            navigate('/dashboard/billing');
          }}
        />
      )}
    </>
  );
}