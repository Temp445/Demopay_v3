import React, { useEffect, useRef, useState } from 'react';
import { Menu, LogOut, User as UserIcon, KeyRound, Eye, EyeOff, AlertCircle, Download, Calendar, Zap, ShieldCheck, Clock, CreditCard, BadgeCheck, ShieldAlert } from 'lucide-react';
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
}

// ── Subscription Details Modal ────────────────────────────────────────────────
function SubscriptionDetailsModal({ sub, onClose, onUpgrade }: { sub: SubscriptionData; onClose: () => void; onUpgrade: () => void }) {
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  const isEnterprise = sub.plan_name.toLowerCase().includes('enterprise');

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#0F172A]/80 backdrop-blur-md p-4">
      <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md relative overflow-hidden animate-in fade-in zoom-in-95 duration-300 border border-white/20">
        <div className="bg-indigo-600 px-8 py-10 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Zap className="h-40 w-40 -mr-10 -mt-10" />
          </div>
          
          <div className="relative z-10 flex flex-col">
          
            <h3 className="text-3xl">Plan Details</h3>
          </div>
        </div>

        {/* Content */}
        <div className="p-8 space-y-5">
          <div className="grid grid-cols-1 gap-4">
            <div className="flex items-center gap-5 p-4 bg-slate-50 rounded-2xl border border-slate-100 transition-all hover:border-indigo-100 group">
              <div className="h-12 w-12 rounded-xl bg-white flex items-center justify-center text-indigo-600 shadow-sm group-hover:scale-110 transition-transform">
                <Zap className="h-6 w-6" />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Current Plan</p>
                <p className="text-lg font-black text-slate-800 tracking-tight">{sub.plan_name}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <div className="flex items-center gap-2 text-emerald-600 mb-2">
                  <Calendar className="h-4 w-4" />
                  <span className="text-[10px] font-black uppercase tracking-widest">Started</span>
                </div>
                <p className="text-sm font-bold text-slate-800">{formatDate(sub.created_at)}</p>
              </div>

              <div className="flex flex-col p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <div className="flex items-center gap-2 text-amber-600 mb-2">
                  <Clock className="h-4 w-4" />
                  <span className="text-[10px] font-black uppercase tracking-widest">Renewal</span>
                </div>
                <p className="text-sm font-bold text-slate-800">{formatDate(sub.expires_at)}</p>
              </div>
            </div>
          </div>

          <div className="pt-4 space-y-3">
            {!isEnterprise && (
              <button
                onClick={onUpgrade}
                className="w-full bg-gradient-to-r from-indigo-600 to-indigo-800 text-white font-black py-4 rounded-2xl  transition-all shadow-xl shadow-indigo-200/50 flex items-center justify-center gap-3 hover:-translate-y-0.5 active:translate-y-0"
              >
                <Zap className="h-5 w-5" />
                View Details
              </button>
            )}
            <button
              onClick={onClose}
              className="w-full bg-slate-100 text-slate-600 font-black py-4 rounded-2xl hover:bg-slate-200 transition-all border border-slate-200"
            >
              Close
            </button>
            <p className="text-center text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-6">
              Secured by Ace Payroll
            </p>
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

            <div className="flex items-center space-x-1 sm:space-x-2 md:space-x-5 pr-1 sm:pr-2 flex-shrink-0">
              
              <div className="relative group">
                <a
                  href="/ace-payroll.apk"
                  download="AcePayroll.apk"
                  className="flex items-center justify-center h-9 w-9 rounded-full bg-white/10 border border-white/5 text-white hover:bg-white hover:text-indigo-600 transition-all duration-300 shadow-sm"
                  title="Download Mobile App"
                >
                   <div className="p-1.5 bg-indigo-50 rounded-full text-indigo-500 absolute ">
                      <Download className="h-3.5 w-3.5" strokeWidth={3} />
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

              <div className="flex items-center space-x-2 md:space-x-5 border-l border-white/10 pl-2 md:pl-5">
                <TenantSwitcher />
                <NotificationDropdown />
              </div>

              {/* User Dropdown */}
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setDropdownOpen((v) => !v)}
                  className="flex items-center space-x-2 text-indigo-100 md:px-2 border-l border-indigo-500/50 md:ml-2 focus:outline-none"
                >
                  <div className="flex flex-col items-end">
                    <span className="hidden md:block text-sm font-medium text-white leading-none">
                      {displayName?.split(' ')[0] || ''}
                    </span>
                    {profile?.position && (
                      <span className="text-xs text-indigo-200 mt-1">{profile.position}</span>
                    )}
                  </div>
                  <div className="h-8 w-8 rounded-full bg-indigo-500 flex items-center justify-center border border-indigo-400">
                    <UserIcon className="h-4 w-4 text-white" />
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
                    {/* {isAdmin && (
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
                    )} */}

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