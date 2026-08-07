import React, { useState, useEffect } from 'react';
import { Check, Loader2, ShieldCheck, Zap, X, ArrowRight, Phone, Database, Sparkles, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useRoleAccess } from '../hooks/useRoleAccess';

// Ensure TypeScript knows about window.Razorpay loaded via script tag in index.html
declare global { interface Window { Razorpay: any; } }


// ── Plan Data ──────────────────────────────────────────────────────────────────
const tiers = [
  {
    name: 'Standard',
    monthlyPrice: 1999,
    annualPrice: 1599,
    description: 'Perfect for small teams moving away from spreadsheets.',
    features: [
      'Up to 50 employees',
      'Attendance & Timestamp Management',
      'Basic Leave Management',
      'Core Payroll Process',
      'Standard Payslip Generation',
      'Employee Self-Service Portal',
      'Mobile App Access',
    ],
    highlighted: false,
  },
  {
    name: 'Professional',
    monthlyPrice: 4999,
    annualPrice: 3999,
    description: 'For organizations automating their entire workforce.',
    features: [
      'Up to 250 employees',
      'Everything in Growth',
      'Employee Advance Tracking',
      'Gate Pass Management',
      'Bulk Employee Invite System',
      'Standard Statutory Compliance',
      'Priority Email & Chat Support',
    ],
    highlighted: false,
  },
  {
    name: 'Enterprise',
    monthlyPrice: 14999,
    annualPrice: 11999,
    description: 'Dedicated infrastructure with limitless boundaries.',
    features: [
      'Unlimited employees',
      'Everything in Professional',
      'Advanced Statutory Reporting',
      'Granular screen-level access control',
      'Custom Salary Structure Builder',
      'Automated Overtime Calculation',
      '24/7 Phone Support',
    ],
    highlighted: true,
  },
];

// ── Pre-Checkout Modal ─────────────────────────────────────────────────────────
interface CheckoutInfo { name: string; email: string; phone: string; company: string; gst: string; }
type DataHandling = 'continue' | 'fresh';

interface PreCheckoutModalProps {
  tier: typeof tiers[0];
  isAnnual: boolean;
  initialInfo?: CheckoutInfo;
  hasActivePaidPlan: boolean;
  isGracePeriodExpired: boolean;
  isProcessing?: boolean;
  onConfirm: (info: CheckoutInfo, dataHandling: DataHandling) => void;
  onClose: () => void;
}

const PreCheckoutModal = ({ tier, isAnnual, initialInfo, hasActivePaidPlan, isGracePeriodExpired, isProcessing = false, onConfirm, onClose }: PreCheckoutModalProps) => {
  const [info, setInfo] = useState<CheckoutInfo>(initialInfo || { name: '', email: '', phone: '', company: '', gst: '' });

  // If grace period is expired, we MUST start fresh (data is gone)
  // If has paid plan, we default to continue
  const initialStep = (hasActivePaidPlan || isGracePeriodExpired) ? 'details' : 'data-choice';
  const initialDataHandling = isGracePeriodExpired ? 'fresh' : (hasActivePaidPlan ? 'continue' : null);

  const [step, setStep] = useState<'data-choice' | 'details' | 'confirm-fresh'>(initialStep);
  const [dataHandling, setDataHandling] = useState<DataHandling | null>(initialDataHandling);
  const price = isAnnual ? tier.annualPrice : tier.monthlyPrice;
  const months = isAnnual ? 12 : 1;
  const subtotal = price * months;
  const gstAmount = Math.round(subtotal * 0.18);
  const total = subtotal + gstAmount;

  const handleDataChoice = (choice: DataHandling) => {
    setDataHandling(choice);
    setStep('details');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!info.name.trim() || !info.email.trim()) {
      toast.error('Please enter your name and email.');
      return;
    }
    if (!info.phone || info.phone.replace(/\D/g, '').length < 10) {
      toast.error('Please enter a valid mobile number.');
      return;
    }
    if (!info.gst || info.gst.trim().length !== 15) {
      toast.error('Enter a valid 15-character GSTIN.');
      return;
    }

    if (dataHandling === 'fresh' && !isGracePeriodExpired) {
      setStep('confirm-fresh');
    } else {
      onConfirm(info, dataHandling!);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 md:p-6 overflow-y-auto">
      <div
        className="flex flex-col md:flex-row w-full max-w-[850px] bg-white rounded-2xl overflow-hidden shadow-2xl relative my-auto"
        style={{ animation: 'fadeZoom 0.2s ease-out' }}
      >
        <style>{`@keyframes fadeZoom { from { opacity:0; transform:scale(0.96) translateY(8px) } to { opacity:1; transform:scale(1) translateY(0) } }`}</style>

        {/* ── Left Panel ─ Order Summary ── */}
        <div className="relative bg-indigo-700 text-white md:w-[42%] flex flex-col overflow-hidden">

          {/* Mobile Close Button */}
          <button
            onClick={onClose}
            className="md:hidden absolute top-5 right-5 h-8 w-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors z-10"
          >
            <X className="h-4 w-4" />
          </button>

          {/* Content */}
          <div className="relative z-10 flex flex-col h-full p-8 pt-10">

            {/* Header */}
            <div className="mb-8">
              <span className="inline-block text-sm  font-bold  text-indigo-200 mb-5"> Secure Checkout</span>

              {/* Plan card */}
              <div className="flex items-center gap-4 p-4 rounded-xl bg-white/10 border border-white/20 mb-6">
                <div className="h-11 w-11 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
                  <ShieldCheck className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="font-extrabold text-white text-base leading-none">{tier.name} Plan</p>
                  <p className="text-xs text-indigo-200 mt-1">{isAnnual ? 'Annual subscription' : 'Monthly subscription'}</p>
                </div>
              </div>

              {/* Price hero */}
              <div className="py-5 border-y border-white/20">
                <p className="text-[10px] text-indigo-200 uppercase tracking-widest font-bold mb-2">Monthly rate</p>
                <div className="flex items-end gap-1.5">
                  <span className="text-white/70 text-xl font-semibold mb-1">₹</span>
                  <span className="text-[2rem] font- leading-none text-white tracking-tight">{price.toLocaleString('en-IN')}</span>
                  <span className="text-indigo-200 text-sm ">/month</span>
                </div>
              </div>
            </div>

            {/* Breakdown receipt */}
            <div className="space-y-3 mt-auto">
              <div className="flex justify-between items-center">
                <span className="text-sm text-indigo-200">{months} {months === 1 ? 'month' : 'months'} × ₹{price.toLocaleString('en-IN')}</span>
                <span className="text-sm font-semibold text-white">₹{subtotal.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-indigo-200">GST (18%)</span>
                <span className="text-sm font-semibold text-white">₹{gstAmount.toLocaleString('en-IN')}</span>
              </div>

              {/* Total */}
              <div className="flex justify-between items-center pt-4 mt-2 border-dashed border-t border-white/20">
                <span className="font-bold text-white text-base">Total due today</span>
                <span className="text-2xl font-black text-white">₹{total.toLocaleString('en-IN')}</span>
              </div>

            </div>
          </div>
        </div>

        {/* ── Right Panel ─ Steps ── */}
        <div className="bg-white text-slate-700 p-8 md:p-10  flex flex-col justify-center min-h-[500px] relative">

          <button
            onClick={onClose}
            className="hidden absolute top-6 right-6 h-8 w-8 rounded-full border border-slate-200 md:flex items-center justify-center text-indigo-400 hover:text-indigo-600 hover:border-indigo-300 transition-colors bg-white z-10 shadow-sm"
          >
            <X className="h-4 w-4" />
          </button>

          {/* Step 1: Data Choice */}
          {step === 'data-choice' && (
            <div className="space-y-5 max-w-sm mx-auto w-full pt-4">
              <div className="mb-6">
                <h4 className="text-lg font-bold text-slate-900 mb-2">Data Setup</h4>
                <p className="text-sm text-slate-500">How would you like to handle your existing trial data?</p>
              </div>

              <button
                onClick={() => handleDataChoice('continue')}
                className="w-full text-left p-4 rounded-xl border border-slate-200 bg-white hover:border-emerald-400 hover:shadow-md transition-all flex items-start gap-4 group"
              >
                <div className="h-10 w-10 rounded-full bg-emerald-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Database className="h-4 w-4 text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-800 text-sm mb-1 group-hover:text-emerald-700 transition-colors">Keep Existing Data</p>
                  <p className="text-xs text-slate-500 leading-relaxed">Continue with all your data intact. No data loss.</p>
                </div>
              </button>

              <button
                onClick={() => handleDataChoice('fresh')}
                className="w-full text-left p-4 rounded-xl border border-slate-200 bg-white hover:border-amber-400 hover:shadow-md transition-all flex items-start gap-4 group"
              >
                <div className="h-10 w-10 rounded-full bg-amber-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Sparkles className="h-4 w-4 text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-800 text-sm mb-1 group-hover:text-amber-700 transition-colors">Start Fresh</p>
                  <p className="text-xs text-slate-500 leading-relaxed">Reset workspace and begin clean.</p>
                  <div className="flex items-center gap-1 mt-2">
                    <AlertTriangle className="h-3 w-3 text-amber-500 flex-shrink-0" />
                    <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wide">Irreversible action</span>
                  </div>
                </div>
              </button>
            </div>
          )}

          {/* Step 2: Billing Details */}
          {step === 'details' && (
            <form onSubmit={handleSubmit} className="space-y-5 max-w-md mx-auto w-full pt-2">
              <div className="flex items-center justify-between mb-6">
                <h4 className="text-lg font-bold text-slate-900">Billing details</h4>
                {(!hasActivePaidPlan && !isGracePeriodExpired) && (
                  <button type="button" onClick={() => setStep('data-choice')} className="text-[11px] font-bold text-[#5045e5] hover:text-indigo-700 underline underline-offset-2 pr-8">← BACK</button>
                )}
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-900 uppercase tracking-widest mb-1.5">Full Name</label>
                  <div className="relative">
                    <input readOnly type="text" value={info.name}
                      className="w-full px-3 py-2 bg-white border-b border-slate-400 rounded-lg text-sm text-slate-700 font-semibold focus:outline-none cursor-default shadow-sm"
                    />
                    {/* <Check className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500" /> */}
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-900 uppercase tracking-widest mb-1.5">Organization</label>
                  <input readOnly type="text" value={info.company || 'Not provided'}
                    className="w-full px-3 py-2 bg-slate-50 border-b border-slate-400 rounded-lg text-sm text-slate-700 font-semibold focus:outline-none cursor-default"
                  />
                </div>



                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-900 uppercase tracking-widest mb-1.5">
                      Phone <span className="text-red-500 normal-case font-semibold">(required)</span>
                    </label>
                    <input required type="tel" value={info.phone}
                      onChange={(e) => setInfo({ ...info, phone: e.target.value })}
                      placeholder="Mobile number"
                      className="w-full px-3 py-2 bg-white border-b border-slate-400 rounded-lg font-semibold text-sm text-slate-900 focus:outline-none focus:border-[#5045e5]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-900 uppercase tracking-widest mb-1.5">Email Address</label>
                    <div className="relative">
                      <input readOnly type="email" value={info.email}
                        className="w-full px-3 py-2 bg-white border-b border-slate-400 rounded-lg text-sm text-slate-700 font-semibold focus:outline-none cursor-default shadow-sm"
                      />
                    </div>
                  </div>

                </div>

                {/* GST — editable */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-900 uppercase tracking-widest mb-1.5">
                    Company GST Number <span className="text-red-500 normal-case font-semibold">(required)</span>
                  </label>
                  <input
                    required type="text" placeholder="15-character GSTIN"
                    value={info.gst}
                    onChange={(e) => setInfo({ ...info, gst: e.target.value.toUpperCase() })}
                    className={`w-full px-4 py-3 bg-white border rounded-lg text-sm text-slate-900 font-semibold placeholder:font-normal placeholder:text-slate-300 focus:outline-none shadow-sm transition-colors ${info.gst && info.gst.length !== 15
                      ? 'border-red-300 focus:border-red-500 ring-1 ring-red-100'
                      : 'border-slate-200 focus:border-[#5045e5] focus:ring-1 focus:ring-indigo-100'
                      }`}
                  />
                  {info.gst && info.gst.length !== 15 && (
                    <p className="flex items-center gap-1 mt-2 text-xs font-medium text-red-500">
                      <AlertTriangle className="h-3.5 w-3.5" /> Enter a valid 15-character GSTIN.
                    </p>
                  )}
                </div>
              </div>

              <div className="pt-4">
                <button
                  type="submit"
                  disabled={isProcessing}
                  className={`w-full font-bold py-3.5 rounded-lg transition-all flex items-center justify-center gap-2 shadow-md text-sm ${isProcessing
                      ? 'bg-indigo-400 cursor-not-allowed text-white shadow-none'
                      : 'bg-[#5045e5] hover:bg-indigo-600 text-white shadow-indigo-200'
                    }`}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Initializing Payment...
                    </>
                  ) : (
                    <>
                      Proceed to payment
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* Step 3: Confirm Fresh */}
          {step === 'confirm-fresh' && (
            <div className="space-y-6 max-w-md mx-auto w-full pt-4">
              <div className="text-center">
                <div className="h-16 w-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-5">
                  <AlertTriangle className="h-8 w-8 text-red-500" />
                </div>
                <h4 className="text-2xl font-bold text-slate-900 mb-3">Start Fresh?</h4>
                <p className="text-sm text-slate-500 leading-relaxed">
                  This will permanently erase all your existing data. This action <span className="text-red-600 font-bold">cannot be undone.</span>
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setStep('details')}
                  className="py-3.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors font-bold text-sm shadow-sm"
                >
                  Go Back
                </button>
                <button
                  type="button"
                  onClick={() => onConfirm(info, dataHandling!)}
                  disabled={isProcessing}
                  className={`py-3.5 rounded-lg transition-colors font-bold text-sm shadow-md flex items-center justify-center gap-2 ${isProcessing
                      ? 'bg-red-400 cursor-not-allowed text-white shadow-none'
                      : 'bg-red-600 hover:bg-red-700 text-white shadow-red-100'
                    }`}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    'I Understand, Proceed'
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};


// ── Success Modal ──────────────────────────────────────────────────────────────
const SuccessModal = ({ plan, isFresh, isGraceExpired, onClose }: { plan: string; isFresh: boolean; isGraceExpired: boolean; onClose: () => void }) => (
  <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
    <div className="bg-white rounded-3xl shadow-2xl p-10 max-w-md w-full text-center relative">
      <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-full text-slate-400 hover:bg-slate-100 transition-colors">
        <X className="h-5 w-5" />
      </button>
      <div className="flex items-center justify-center mb-6">
        <div className="h-20 w-20 bg-emerald-50 rounded-full flex items-center justify-center ring-8 ring-emerald-100">
          <ShieldCheck className="h-10 w-10 text-emerald-500" />
        </div>
      </div>
      <h3 className="text-2xl font-black text-[#0F172A] mb-2">Payment Successful!</h3>
      <p className="text-slate-500 font-medium mb-1">
        Welcome to <span className="text-indigo-600 font-bold">Ace Payroll</span>
      </p>
      <p className="text-sm text-slate-400 mb-6">
        Your <strong className="text-slate-600">{plan} Plan</strong> is now active.
      </p>

      {(isFresh && !isGraceExpired) && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6 flex gap-3 text-left">
          <Sparkles className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs font-bold text-amber-800 leading-relaxed">
            Note: The page will reload once you click "Done" because you chose to start fresh. This is to set up your new workspace.
          </p>
        </div>
      )}

      <button
        onClick={onClose}
        className="w-full bg-[#0F172A] text-white font-bold py-3.5 rounded-xl hover:bg-slate-800 transition-all"
      >
        Done
      </button>
    </div>
  </div>
);

// ── Main Component ─────────────────────────────────────────────────────────────
const Pricing = () => {
  const [isAnnual, setIsAnnual] = useState(true);
  const [processingTier, setProcessingTier] = useState<string | null>(null);
  const [checkoutTier, setCheckoutTier] = useState<typeof tiers[0] | null>(null);
  const [initialCheckoutInfo, setInitialCheckoutInfo] = useState<CheckoutInfo | undefined>();
  const [successPlan, setSuccessPlan] = useState<string | null>(null);
  const [isFreshStart, setIsFreshStart] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const { tenantId, user } = useAuth();
  const { isAdmin, loading: roleLoading } = useRoleAccess();
  const [currentPlan, setCurrentPlan] = useState<string | null>(null);
  const [isGracePeriodExpired, setIsGracePeriodExpired] = useState(false);
  const [checkoutWasGraceExpired, setCheckoutWasGraceExpired] = useState(false);

  const handleSuccessClose = () => {
    setSuccessPlan(null);
    // Only perform a hard reload if the user voluntarily chose "Start Fresh" during their trial.
    if (isFreshStart && !checkoutWasGraceExpired) {
      window.location.href = '/dashboard';
    } else {
      navigate('/dashboard');
    }
  };

  // Fetch current active plan to handle upgrade UI
  useEffect(() => {
    async function fetchActivePlan() {
      if (!tenantId) {
        setCurrentPlan(null);
        setIsGracePeriodExpired(false);
        return;
      }

      const { data: subs } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (!subs || subs.length === 0) {
        setCurrentPlan(null);
        setIsGracePeriodExpired(false);
        return;
      }

      const activePaidSub = subs.find(s => s.plan_name !== 'Elite Trial' && s.status === 'active' && new Date(s.expires_at) > new Date());
      const trialSub = subs.find(s => s.plan_name === 'Elite Trial');
      const hasEverPaid = subs.some(s => s.plan_name !== 'Elite Trial');

      if (activePaidSub) {
        setCurrentPlan(activePaidSub.plan_name);
        setIsGracePeriodExpired(false);
      } else if (hasEverPaid) {
        // If they ever had a paid plan, we never force-expire their grace period
        // (Even if their paid plan is expired, we don't delete their data)
        setCurrentPlan(subs.find(s => s.plan_name !== 'Elite Trial')?.plan_name || null);
        setIsGracePeriodExpired(false);
      } else if (trialSub) {
        setCurrentPlan('Elite Trial');
        const expiryDate = new Date(trialSub.expires_at);
        const now = new Date();
        const diffDays = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        const daysUntilDelete = diffDays + 3;
        setIsGracePeriodExpired(daysUntilDelete <= 0);
      } else {
        setCurrentPlan(null);
        setIsGracePeriodExpired(false);
      }
    }
    fetchActivePlan();
  }, [tenantId]);

  // Auto-trigger checkout if returning from registration with a selected plan
  useEffect(() => {
    // Only trigger if role is loaded and we know if user is admin
    if (roleLoading) return;

    const state = location.state as any;
    if (state?.selectedPlan && !checkoutTier && !processingTier) {
      const plan = tiers.find(t => t.name === state.selectedPlan);
      if (plan) {
        if (state.isAnnual !== undefined) setIsAnnual(state.isAnnual);
        // Clear state so it doesn't re-trigger on refresh
        navigate(location.pathname, { replace: true });
        handleGetStarted(plan);
      }
    }
  }, [location, navigate, checkoutTier, processingTier, roleLoading]);

  const handleGetStarted = async (tier: typeof tiers[0]) => {
    if (tier.highlighted) {
      window.location.href = '#contact';
      return;
    }

    // CAPTURE SNAPSHOT: Store the grace period state before checkout begins.
    // This prevents race conditions if the sub state updates during payment verification.
    setCheckoutWasGraceExpired(isGracePeriodExpired);

    if (processingTier) return;

    // If not logged in, go to register
    if (!user) {
      navigate('/register', { state: { selectedPlan: tier.name, isAnnual } });
      return;
    }

    if (roleLoading) {
      toast.loading('Verifying permissions...', { duration: 1000 });
      return;
    }

    if (!isAdmin) {
      toast.error('Only administrators can manage subscriptions.');
      return;
    }

    /* 
    if (tier.name === currentPlan) {
      toast.error('You are already subscribed to this plan.');
      return;
    }
    */

    try {
      setProcessingTier(tier.name);

      // Check if user is logged in
      const { data: { user }, error: authError } = await supabase.auth.getUser();

      if (authError || !user || !tenantId) {
        navigate('/register', { state: { selectedPlan: tier.name, isAnnual } });
        return;
      }

      // Pre-fill user data & fetch company settings for GST
      const meta = user.user_metadata || {};
      const { data: settings } = await supabase
        .from('company_settings')
        .select('gst_number, company_name, phone')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      setInitialCheckoutInfo({
        email: user.email || '',
        name: meta.name || meta.full_name || '',
        company: settings?.company_name || meta.company_name || meta.organization_name || '',
        phone: settings?.phone || meta.mobile_number || meta.phone || '',
        gst: settings?.gst_number || ''
      });

      // If logged in, proceed to checkout (Upgrade/Switch is allowed)
      setCheckoutTier(tier);

    } catch (error) {
      console.error('Error checking subscription:', error);
      toast.error('Could not verify account status. Please try again.');
    } finally {
      setProcessingTier(null);
    }
  };

  // Step 2: User confirms details → create order → open Razorpay
  const handleCheckoutConfirm = async (info: CheckoutInfo, dataHandling: DataHandling) => {
    if (!checkoutTier) return;
    const tier = checkoutTier;
    // Do NOT close modal yet — keep it visible with a loading state
    setCheckoutLoading(true);

    const keyId = import.meta.env.VITE_RAZORPAY_KEY_ID;
    if (!keyId) {
      toast.error('Payment gateway not configured. Contact support@acesoft.in');
      return;
    }

    try {
      setProcessingTier(tier.name);


      // 1. Sync GST number to company settings if provided
      if (info.gst) {
        await supabase
          .from('company_settings')
          .upsert({
            tenant_id: tenantId,
            gst_number: info.gst,
            updated_at: new Date().toISOString()
          }, { onConflict: 'tenant_id' });
      }

      const basePrice = isAnnual ? tier.annualPrice * 12 : tier.monthlyPrice;
      const gstAmount = Math.round(basePrice * 0.18);
      const amount = basePrice + gstAmount;

      // Create order via Edge Function
      const { data: orderData, error } = await supabase.functions.invoke('razorpay', {
        body: {
          action: 'create_order',
          amount,
          plan: tier.name,
          billing: isAnnual ? 'annual' : 'monthly',
        }
      });

      if (error) {
        // Extract real error message from edge function
        let msg = error.message || 'Could not create payment order.';
        try {
          const body = await error.context?.json?.();
          if (body?.error) msg = body.error;
        } catch { /* ignore */ }
        throw new Error(msg);
      }

      if (orderData?.error) throw new Error(orderData.error);

      // Open Razorpay with user details pre-filled
      const options = {
        key: keyId,
        amount: orderData.amount,
        currency: orderData.currency || 'INR',
        name: 'Ace Payroll',
        description: `${tier.name} Plan — ${isAnnual ? 'Annual' : 'Monthly'} Subscription`,
        order_id: orderData.id,
        prefill: { name: info.name, email: info.email, contact: info.phone },
        notes: { plan: tier.name, company: info.company, billing: isAnnual ? 'annual' : 'monthly' },
        theme: { color: '#4f46e5' },
        modal: {
          backdropclose: false,
          escape: false,
          animation: true,
          ondismiss: () => {
            // User closed Razorpay without paying
            setCheckoutLoading(false);
          }
        },
        handler: async (response: any) => {
          try {
            const { data: verifyData, error: verifyError } = await supabase.functions.invoke('razorpay', {
              body: {
                action: 'verify_payment',
                ...response,
                email: info.email,
                name: info.name,
                company: info.company,
                mobile_number: info.phone,
                plan: tier.name,
                billing: isAnnual ? 'annual' : 'monthly',
                amount_paise: amount * 100,
                tenant_id: tenantId,
                data_handling: dataHandling
              }
            });
            if (verifyError || verifyData?.error) {
              toast.error('Payment received but verification failed. Contact support@acesoft.in');
              return;
            }

            // ── Start Fresh: clear all operational data client-side ────────────
            // ONLY if the user manually chose it. If grace period was already expired, 
            // the background job handles it and we shouldn't wipe data again.
            if (dataHandling === 'fresh' && !checkoutWasGraceExpired) {
              const clearToast = toast.loading('Setting up your fresh workspace...');
              try {
                const { error: clearError } = await supabase.rpc('clear_tenant_data', {
                  p_tenant_id: tenantId
                });
                if (clearError) {
                  console.error('[Pricing] clear_tenant_data error:', clearError.message);
                  toast.error('Subscription activated, but data reset failed. Contact support@acesoft.in', { id: clearToast });
                } else {
                  toast.success('Fresh workspace ready!', { id: clearToast });
                }
              } catch (clearErr) {
                console.error('[Pricing] clear_tenant_data exception:', clearErr);
                toast.dismiss(clearToast);
              }
            }

            if (dataHandling === 'fresh') {
              setIsFreshStart(true);
            }

            // Close the checkout modal now that payment succeeded
            setCheckoutTier(null);
            setCheckoutLoading(false);
            setSuccessPlan(tier.name);
            // Dispatch event to refresh sub data across the app
            window.dispatchEvent(new CustomEvent('subscription_updated'));
          } catch {
            toast.error('Verification error. Contact support@acesoft.in');
          }
        },
      };

      // Guard: ensure Razorpay script has loaded from index.html
      if (!window.Razorpay) {
        throw new Error('Razorpay checkout script not loaded. Please refresh the page and try again.');
      }

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', (res: any) => {
        toast.error(res.error?.description || 'Payment failed. Please try again.');
        setCheckoutLoading(false);
      });
      // We do NOT setCheckoutTier(null) here anymore.
      // This keeps our modal open in the background, providing the backdrop blur effect
      // while Razorpay sits on top.
      rzp.open();


    } catch (err: any) {
      console.error('[Pricing] Error:', err);
      toast.error(err.message || 'Payment initialization failed. Please try again.');
      // On error, keep modal open so user can retry
      setCheckoutLoading(false);
    } finally {
      setProcessingTier(null);
    }
  };

  return (
    <>
      {/* Pre-Checkout Modal */}
      {checkoutTier && (
        <PreCheckoutModal
          tier={checkoutTier}
          isAnnual={isAnnual}
          initialInfo={initialCheckoutInfo}
          hasActivePaidPlan={currentPlan !== null && currentPlan !== 'Elite Trial'}
          isGracePeriodExpired={isGracePeriodExpired}
          isProcessing={checkoutLoading}
          onConfirm={handleCheckoutConfirm}
          onClose={() => { if (!checkoutLoading) { setCheckoutTier(null); } }}
        />
      )}

      {/* Success Modal */}
      {successPlan && <SuccessModal plan={successPlan} isFresh={isFreshStart} isGraceExpired={isGracePeriodExpired} onClose={handleSuccessClose} />}

      {/* Pricing Section */}
      <div id="pricing" className="relative py-10 z-10 w-full bg-[#F9FAFB] overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-20">

          {/* Header */}
          <div className="text-center max-w-3xl mx-auto mb-16">
            {/* 
            <h2 className="text-2xl font-black tracking-widest uppercase text-indigo-700 mb-4">
              PRICING Plans
            </h2>
            <p className="text-xl text-[#425466] font-medium leading-relaxed mb-10">
              Choose a plan that fits your business needs. No hidden charges per-employee. Unlock the full power of Ace Payroll.
            </p> 
            */}
            {/* Billing Toggle */}
            <div className="flex items-center justify-center gap-4">
              <span className={`text-sm font-bold ${!isAnnual ? 'text-[#1F2A44]' : 'text-gray-500'}`}>Monthly</span>
              <button
                onClick={() => setIsAnnual(!isAnnual)}
                className="relative inline-flex h-8 w-16 items-center rounded-full bg-blue-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
              >
                <span className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${isAnnual ? 'translate-x-9' : 'translate-x-1'}`} />
              </button>
              <span className={`text-sm font-bold flex items-center gap-2 ${isAnnual ? 'text-[#1F2A44]' : 'text-gray-500'}`}>
                Yearly <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] uppercase tracking-wider font-black">Save 20%</span>
              </span>
            </div>
          </div>

          {/* Pricing Cards */}
          <div className="grid lg:grid-cols-3 gap-8 items-center">
            {tiers.map((tier) => (
              <div
                key={tier.name}
                className={`relative flex flex-col rounded-3xl p-10 transition-all duration-300 ${tier.highlighted
                  ? 'bg-white border-2 border-[#0F172A] shadow-[0_20px_50px_rgba(15,23,42,0.1)] lg:scale-105 z-10'
                  : 'bg-white border border-gray-200 hover:border-gray-300 hover:shadow-xl hover:-translate-y-1'
                  }`}
              >
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-bold text-[#0F172A] tracking-wide">{tier.name}</h3>
                    {tier.highlighted && (
                      <span className="px-3 py-1 bg-indigo-50 text-indigo-700 text-xs font-bold rounded-full">Most Popular</span>
                    )}
                  </div>
                  <p className="text-slate-500 text-sm leading-relaxed min-h-[40px]">{tier.description}</p>
                  <div className="mt-8 flex items-baseline">
                    <span className="text-4xl font-extrabold text-[#0F172A] tracking-tight">
                      ₹{(isAnnual ? tier.annualPrice : tier.monthlyPrice).toLocaleString('en-IN')}
                    </span>
                    <span className="ml-2 text-lg font-medium text-slate-400">/month</span>
                  </div>
                  {isAnnual ? (
                    <p className="mt-2 text-sm font-medium text-emerald-600">
                      Billed annually
                    </p>
                  ) : (
                    <p className="mt-2 text-sm text-transparent select-none font-medium">Billed annually</p>
                  )}

                  <div className="mt-10 pt-8 border-t border-gray-100 space-y-4">
                    {tier.features.map((feature) => (
                      <div key={feature} className="flex items-start">
                        <div className="flex-shrink-0 mt-1">
                          <Check className={`h-4 w-4 ${tier.highlighted ? 'text-indigo-600' : 'text-slate-400'}`} />
                        </div>
                        <p className="ml-3 text-sm font-medium text-slate-600">{feature}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-10 space-y-3">
                  <button
                    onClick={() => handleGetStarted(tier)}
                    disabled={processingTier === tier.name}
                    className={`flex items-center justify-center w-full py-4 px-6 rounded-xl font-black text-sm uppercase tracking-widest transition-all duration-300 gap-2 ${tier.name === currentPlan
                      ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-md shadow-emerald-600/30'
                      : tier.highlighted
                        ? 'bg-[#0F172A] text-white hover:bg-slate-800 shadow-xl'
                        : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md shadow-indigo-600/30'
                      }`}
                  >
                    {processingTier === tier.name ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Processing...</>
                    ) : tier.name === currentPlan ? (
                      <><Zap className="h-4 w-4" /> Extend Current Plan</>
                    ) : tier.highlighted ? (
                      <><Phone className="h-4 w-4" /> Request Demo</>
                    ) : currentPlan ? (
                      (() => {
                        const currentIndex = tiers.findIndex(t => t.name === currentPlan);
                        const cardIndex = tiers.findIndex(t => t.name === tier.name);
                        return cardIndex > currentIndex
                          ? <>Upgrade Plan <ArrowRight className="h-4 w-4" /></>
                          : <>Downgrade Plan <ArrowRight className="h-4 w-4" /></>;
                      })()
                    ) : (
                      <>Get Started <ArrowRight className="h-4 w-4" /></>
                    )}
                  </button>
                  {!tier.highlighted && (
                    <p className="text-center text-xs text-slate-400 font-medium">No credit card setup</p>
                  )}
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>
    </>
  );
};

export default Pricing;