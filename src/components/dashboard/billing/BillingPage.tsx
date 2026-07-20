import React, { useEffect, useState } from 'react';
import Pricing from '../../Pricing';
import { useRoleAccess } from '../../../hooks/useRoleAccess';
import { ShieldAlert, Loader2, CreditCard, Calendar, History, CheckCircle2, ArrowRight, Zap, BadgeCheck, Clock, User, Mail, Phone, Building, Download } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { useTenant } from '../../../contexts/TenantContext';
import toast from 'react-hot-toast';
import logo from '../../../assets/AceLogo.png';

interface SubscriptionRecord {
  id: string;
  plan_name: string;
  amount_paid: number;
  status: string;
  created_at: string;
  expires_at: string;
  razorpay_payment_id: string;
  razorpay_order_id: string;
  billing_cycle: string;
  gst_number?: string;
  invoice_number?: string;
}

export default function BillingPage() {
  const { isAdmin, loading: roleLoading } = useRoleAccess();
  const { tenantId, user } = useAuth();
  const { currentTenant } = useTenant();
  const [loading, setLoading] = useState(true);
  const [currentSub, setCurrentSub] = useState<SubscriptionRecord | null>(null);
  const [periodStart, setPeriodStart] = useState<string | null>(null);
  const [history, setHistory] = useState<SubscriptionRecord[]>([]);
  const [showPricing, setShowPricing] = useState(false);
  const [companySettings, setCompanySettings] = useState<any>(null);
  const [gstNumber, setGstNumber] = useState('');
  const [isSavingGst, setIsSavingGst] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);

  useEffect(() => {
      async function fetchBillingData() {
        if (!tenantId || !isAdmin) {
          setLoading(false);
          return;
        }
  
        try {
          // Fetch subscription history
          const { data, error } = await supabase
            .from('subscriptions')
            .select('*')
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: false });
  
          if (error) throw error;
  
          if (data && data.length > 0) {
            setHistory(data);
            const now = new Date();
            const active = data.find(s => {
              const isStatusActive = s.status === 'active';
              const isNotExpired = new Date(s.expires_at) > now;
              return isStatusActive && isNotExpired;
            });
  
            if (active) {
              setCurrentSub(active);
              
              // Find the original start date of this continuous subscription chain
              const samePlanHistory = data.filter(s => s.plan_name === active.plan_name);
              const sortedDesc = [...samePlanHistory].sort((a, b) => 
                new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
              );
  
              let chainStart = active.created_at;
              let current = active;
              
              for (const item of sortedDesc) {
                if (new Date(item.created_at) < new Date(current.created_at)) {
                  if (new Date(item.expires_at) >= new Date(current.created_at)) { 
                    chainStart = item.created_at;
                    current = item;
                  } else {
                    break; 
                  }
                }
              }
              setPeriodStart(chainStart);
            }
          }

          // Fetch company settings for GST and billing info
          const { data: settings, error: settingsError } = await supabase
            .from('company_settings')
            .select('*')
            .eq('tenant_id', tenantId)
            .maybeSingle();

          if (settings) {
            setCompanySettings(settings);
            setGstNumber(settings.gst_number || '');
          }

          // Fetch user profile for personal details
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name, phone')
            .eq('id', user?.id)
            .maybeSingle();
          
          if (profile) {
            setUserProfile(profile);
          }
        } catch (err) {
          console.error('Error fetching billing data:', err);
        } finally {
          setLoading(false);
        }
      }

    if (!roleLoading) {
      fetchBillingData();
    }

    const handleUpdate = () => fetchBillingData();
    window.addEventListener('subscription_updated', handleUpdate);
    return () => window.removeEventListener('subscription_updated', handleUpdate);
  }, [tenantId, isAdmin, roleLoading]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
      minimumFractionDigits: 2
    }).format(amount);
  };

  const handleSaveGst = async () => {
    if (!tenantId) return;

    // GST Validation
    if (gstNumber.trim()) {
      const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
      if (!gstRegex.test(gstNumber.trim().toUpperCase())) {
        toast.error('Invalid GST Number format. Please check and try again.');
        return;
      }
    }

    setIsSavingGst(true);
    try {
      const { error } = await supabase
        .from('company_settings')
        .upsert({ 
          tenant_id: tenantId, 
          gst_number: gstNumber,
          updated_at: new Date().toISOString()
        }, { onConflict: 'tenant_id' });

      if (error) {
        console.error('Supabase error saving GST:', error);
        throw error;
      }
      toast.success('GST number updated successfully');
    } catch (err) {
      console.error('Error saving GST:', err);
      toast.error('Failed to update GST number');
    } finally {
      setIsSavingGst(false);
    }
  };

  const handleDownloadInvoice = (item: SubscriptionRecord) => {
    const invoiceWindow = window.open('', '_blank');
    if (!invoiceWindow) {
      toast.error('Please allow popups to download the invoice');
      return;
    }

    const orgName = companySettings?.company_name || 'Organization Not Set';
    const legalName = companySettings?.legal_name || orgName;
    const gst = item.gst_number || gstNumber || 'Not Provided';
    const invoiceNum = item.invoice_number || `INV-${item.id.slice(0, 8).toUpperCase()}`;
    const date = formatDate(item.created_at);
    const amount = formatCurrency(item.amount_paid);
    const expiresAt = formatDate(item.expires_at);
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Invoice - ${invoiceNum}</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
        <style>
          * { box-sizing: border-box; -webkit-print-color-adjust: exact; }
          body { font-family: 'Inter', sans-serif; padding: 0; margin: 0; color: #1e293b; background: #f8fafc; }
          .page { background: white; width: 210mm; min-height: 297mm; margin: 30px auto; padding: 50px 70px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.1); position: relative; overflow: hidden; }
          
          /* Watermark */
          .watermark { position: absolute; top: -50px; right: -50px; font-size: 150px; font-weight: 900; color: #f8fafc; transform: rotate(-15deg); pointer-events: none; text-transform: uppercase; }

          /* Header */
          .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 60px; border-bottom: 2px solid #f8fafc; padding-bottom: 30px; }
          .brand { display: flex; align-items: center; gap: 14px; }
          .logo-img { height: 44px; width: auto; }
          .brand-name { font-size: 20px; font-weight: 800; color: #0f172a; letter-spacing: -0.02em; }
          
          .invoice-label { text-align: right; }
          .invoice-label h1 { font-size: 11px; font-weight: 900; color: #4f46e5; text-transform: uppercase; letter-spacing: 0.2em; margin-bottom: 6px; }
          .invoice-id { font-size: 22px; font-weight: 900; color: #0f172a; line-height: 1; }
          
          /* Billing Grid */
          .billing-grid { display: flex; justify-content: space-between; gap: 40px; margin-bottom: 50px; }
          .billing-section { flex: 1; }
          .billing-section h3 { font-size: 10px; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 12px; }
          .billing-content { font-size: 14px; line-height: 1.6; color: #475569; }
          .billing-content strong { color: #0f172a; font-size: 16px; font-weight: 800; display: block; margin-bottom: 4px; }
          .billing-content.right { text-align: right; }
          
          /* Highlights */
          .highlights { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 50px; }
          .highlight-card { background: #f8fafc; border: 1px solid #f1f5f9; border-radius: 16px; padding: 18px; text-align: center; }
          .highlight-label { font-size: 10px; font-weight: 800; color: #94a3b8; text-transform: uppercase; margin-bottom: 6px; letter-spacing: 0.05em; }
          .highlight-value { font-size: 14px; font-weight: 700; color: #0f172a; }

          /* Table Styling - Fixed Borders and Background */
          .table { width: 100%; border-collapse: separate; border-spacing: 0; margin-bottom: 50px; border: 1.5px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
          .table th { background: #f8fafc; text-align: left; padding: 20px 25px; font-size: 11px; font-weight: 900; color: #64748b; text-transform: uppercase; letter-spacing: 0.1em; border-bottom: 1.5px solid #e2e8f0; }
          .table td { padding: 30px 25px; font-size: 14px; color: #475569; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
          .table tr:last-child td { border-bottom: none; }
          
          /* Column Alignments */
          .table th:first-child, .table td:first-child { width: 55%; border-right: 1px solid #f1f5f9; }
          .table th:nth-child(2), .table td:nth-child(2) { width: 25%; text-align: center; border-right: 1px solid #f1f5f9; }
          .table th:last-child, .table td:last-child { width: 20%; text-align: right; font-weight: 800; color: #0f172a; }
          
          .item-name { font-weight: 800; color: #0f172a; font-size: 15px; margin-bottom: 6px; }
          .item-desc { font-size: 12px; color: #94a3b8; line-height: 1.5; }
          
          /* Summary */
          .summary-container { display: flex; justify-content: flex-end; }
          .summary-table { width: 300px; }
          .summary-row { display: flex; justify-content: space-between; padding: 10px 0; font-size: 14px; font-weight: 600; color: #64748b; }
          .summary-row.total { background: #0f172a; color: white; border-radius: 14px; padding: 18px 24px; margin-top: 15px; font-size: 20px; font-weight: 900; }
          .summary-row.total span:first-child { font-size: 12px; font-weight: 700; color: #94a3b8; text-transform: uppercase; align-self: center; }

          /* Paid Badge */
          .paid-badge-container { display: flex; justify-content: center; margin-top: -30px; margin-bottom: 30px; }
          .paid-badge { border: 2px solid #10b981; color: #10b981; font-size: 12px; font-weight: 900; text-transform: uppercase; padding: 4px 12px; border-radius: 6px; letter-spacing: 0.1em; transform: rotate(-2deg); opacity: 0.8; }

          /* Footer */
          .footer { margin-top: 80px; padding-top: 40px; border-top: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; }
          .footer-note { font-size: 12px; color: #94a3b8; line-height: 1.6; max-width: 400px; }
          .paid-badge { background: #ecfdf5; color: #059669; border: 2px solid #10b981; padding: 10px 24px; border-radius: 12px; font-weight: 900; font-size: 18px; text-transform: uppercase; letter-spacing: 0.1em; transform: rotate(-5deg); }

          /* UI Controls */
          .no-print-bar { background: #0f172a; padding: 16px; display: flex; justify-content: center; gap: 20px; position: sticky; top: 0; z-index: 1000; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); }
          .btn { background: #4f46e5; color: white; border: none; padding: 12px 30px; border-radius: 12px; font-weight: 800; font-size: 14px; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 10px; }
          .btn:hover { background: #4338ca; transform: translateY(-2px); }
          .btn-secondary { background: rgba(255,255,255,0.1); }

          @media print { 
            @page { size: A4; margin: 0; }
            body { background: white; }
            .page { margin: 0; box-shadow: none; width: 100%; padding: 40mm 20mm; }
            .no-print-bar, .watermark { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="no-print-bar">
          <button class="btn" onclick="window.print()">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"></path><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
            Print / Download PDF
          </button>
          <button class="btn btn-secondary" onclick="window.close()">Close Preview</button>
        </div>

        <div class="page">
          
          <div class="header">
            <div class="brand">
              <img src="${logo}" class="logo-img" alt="Ace Logo">
              <div class="brand-name">ACE PAYROLL</div>
            </div>
            <div class="invoice-label">
              <h1>Invoice Receipt</h1>
              <div class="invoice-id">${invoiceNum}</div>
            </div>
          </div>

          <div class="billing-grid">
            <div class="billing-section">
              <h3>Billed From</h3>
              <div class="billing-content">
                <strong>Ace Software Solutions Pvt Ltd</strong>
              </div>
            </div>
            <div class="billing-section">
              <h3 style="text-align: right;">Billed To</h3>
              <div class="billing-content right">
                <strong>${legalName}</strong>
                <div>${user?.email}</div>
                <div>GSTIN: ${gst}</div>
              </div>
            </div>
          </div>

          <div class="highlights">
            <div class="highlight-card">
              <div class="highlight-label">Date of Issue</div>
              <div class="highlight-value">${date}</div>
            </div>
            <div class="highlight-card">
              <div class="highlight-label">Payment</div>
              <div class="highlight-value">Razorpay Online</div>
            </div>
            <div class="highlight-card">
              <div class="highlight-label">Subscription End</div>
              <div class="highlight-value">${expiresAt}</div>
            </div>
          </div>

          <table class="table">
            <thead>
              <tr>
                <th>Service Description</th>
                <th>Billing Cycle</th>
                <th>Total Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <div class="item-name">Ace Payroll - ${item.plan_name} Plan</div>
                  <div class="item-desc">Active subscription access from ${date} to ${expiresAt}</div>
                </td>
                <td style="text-transform: capitalize;">${item.billing_cycle}</td>
                <td>${amount}</td>
              </tr>
            </tbody>
          </table>

          <div class="summary-container">
            <div class="summary-table">
              <div class="summary-row">
                <span>Subtotal</span>
                <span>${amount}</span>
              </div>
              <div class="summary-row">
                <span>GST (Inclusive)</span>
                <span>Included</span>
              </div>
              <div class="summary-row total">
                <span>Amount Paid</span>
                <span>${amount}</span>
              </div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    invoiceWindow.document.write(html);
    invoiceWindow.document.close();
  };

  if (roleLoading || loading) {
    return (
      <div className="bg-white rounded-3xl shadow-sm p-24 flex flex-col items-center justify-center border border-slate-100">
        <div className="relative">
          <Loader2 className="h-12 w-12 text-indigo-600 animate-spin" />
        </div>
        <p className="text-slate-500 font-bold mt-6 tracking-tight uppercase text-xs">Synchronizing Billing Records...</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="bg-white rounded-3xl shadow-xl p-16 text-center border border-slate-100 max-w-2xl mx-auto mt-10">
        <div className="inline-flex items-center justify-center h-20 w-20 rounded-3xl bg-amber-50 text-amber-500 mb-8 transform rotate-3">
          <ShieldAlert className="h-10 w-10" />
        </div>
        <h2 className="text-3xl font-black text-slate-900 mb-4 tracking-tight">Access Restricted</h2>
        <p className="text-slate-500 font-medium leading-relaxed mb-8">
          Billing and subscription management is a high-security administrative task. 
          Please contact your primary organization administrator for access.
        </p>
        <div className="h-px bg-slate-100 w-full mb-8" />
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Ace Payroll Security Protocol</p>
      </div>
    );
  }

  if ((history.length === 0 && !loading) || showPricing) {
    return (
      <div className="space-y-6">
        {history.length > 0 && (
          <button 
            onClick={() => setShowPricing(false)}
            className="flex items-center gap-2 text-indigo-600 font-bold hover:text-indigo-700 transition-colors"
          >
            <ArrowRight className="h-4 w-4 rotate-180" />
            Back to Billing Dashboard
          </button>
        )}
        <div className="bg-white rounded-3xl shadow-sm overflow-hidden border border-slate-100">
          <div className="p-10 border-b border-slate-50 bg-slate-50/50">
            <h2 className="text-3xl font-black text-slate-900 tracking-tight">Choose Your Plan</h2>
            <p className="text-slate-500 mt-2 font-medium">Select the best payroll solution for your growing team.</p>
          </div>
          <div className="pb-16 bg-white">
            <Pricing />
          </div>
        </div>
      </div>
    );
  }

  const displaySub = currentSub || history[0];
  const isExpired = !currentSub && history.length > 0;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className={`lg:col-span-2 bg-gradient-to-br ${isExpired ? 'from-slate-600 to-slate-800' : 'from-indigo-600 to-indigo-700'} rounded-[2rem] p-10 text-white shadow-2xl relative overflow-hidden`}>
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <Zap className="h-64 w-64 -mr-20 -mt-20" />
          </div>
          
          <div className="relative z-10 flex flex-col h-full">
            <div className="flex justify-between items-start mb-12">
              <div>
                <div className={`inline-flex items-center gap-2 px-3 py-1 ${isExpired ? 'bg-amber-500/20 border-amber-500/30 text-amber-200' : 'bg-white/20 border-white/10 text-white'} rounded-full backdrop-blur-md mb-4 border`}>
                  {isExpired ? <ShieldAlert className="h-4 w-4" /> : <BadgeCheck className="h-4 w-4" />}
                  <span className="text-[10px] font-black uppercase tracking-widest">
                    {isExpired ? 'Subscription Expired' : (displaySub?.plan_name === 'Elite Trial' ? 'Free Trial' : 'Active Subscription')}
                  </span>
                </div>
                <h3 className="text-3xl tracking-tighter mb-2">{displaySub.plan_name}</h3>
                <p className="text-indigo-100 font-medium opacity-80 uppercase text-xs tracking-widest">
                  {displaySub.billing_cycle} Billing Cycle
                </p>
              </div>
              <div className="text-right flex flex-col items-end">
                <p className="text-3xl tracking-tighter">{formatCurrency(displaySub.amount_paid)}</p>
                <p className="text-indigo-100 text-[10px] font-bold uppercase opacity-60 mb-2">Last Amount Paid</p>
                
                {!isExpired && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/10 rounded-full border border-white/10 backdrop-blur-md">
                    <Clock className="h-3 w-3 text-amber-300" />
                    <span className="text-[10px] text-white">
                      {Math.max(0, Math.ceil((new Date(displaySub.expires_at).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)))} Days Remaining
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-auto grid grid-cols-2 gap-8">
              <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10">
                <div className="flex items-center gap-3 mb-1">
                  <Calendar className="h-4 w-4 text-indigo-200" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-indigo-200">Start Date</span>
                </div>
                <p className="text-lg font-bold">{formatDate(periodStart || displaySub.created_at)}</p>
              </div>
              <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10">
                <div className="flex items-center gap-3 mb-1">
                  <Clock className={`h-4 w-4 ${isExpired ? 'text-amber-400' : 'text-amber-200'}`} />
                  <span className={`text-[10px] font-black uppercase tracking-widest ${isExpired ? 'text-amber-400' : 'text-amber-200'}`}>{isExpired ? 'Expired On' : 'Next Renewal'}</span>
                </div>
                <p className="text-lg font-bold">{formatDate(displaySub.expires_at)}</p>
              </div>
            </div>

            {isExpired && (
              <div className="mt-8 pt-8 border-t border-white/10">
                <button
                  onClick={() => setShowPricing(true)}
                  className="w-full bg-white text-slate-900 font-black py-4 rounded-2xl hover:bg-amber-400 transition-all shadow-xl flex items-center justify-center gap-3 group"
                >
                  <Zap className="h-5 w-5 text-indigo-600 group-hover:scale-125 transition-transform" />
                  Renew Subscription Now
                  <ArrowRight className="h-4 w-4 ml-1 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-[2rem] p-8 border border-slate-100 shadow-xl flex flex-col">
          <h4 className="text-xl font-black text-slate-900 mb-6 tracking-tight">Management</h4>
          
          <div className="space-y-4 flex-1">
            {!isExpired && displaySub?.plan_name !== 'Elite Trial' && (
              <button 
                onClick={() => setShowPricing(true)}
                className="w-full group flex items-center justify-between p-4 bg-emerald-50 hover:bg-emerald-100 rounded-2xl transition-all duration-300 border border-emerald-100 hover:border-emerald-200"
              >
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-xl bg-white flex items-center justify-center text-emerald-600 shadow-sm">
                    <Zap className="h-5 w-5" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold text-slate-900">Extend Current Plan</p>
                    <p className="text-[10px] text-slate-400 font-medium uppercase tracking-tight">Renew Your Subscription</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-emerald-500 group-hover:translate-x-1 transition-all" />
              </button>
            )}

            <button 
              onClick={() => setShowPricing(true)}
              className="w-full group flex items-center justify-between p-4 bg-slate-50 hover:bg-indigo-50 rounded-2xl transition-all duration-300 border border-slate-100 hover:border-indigo-100"
            >
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-xl bg-white flex items-center justify-center text-indigo-600 shadow-sm">
                  <BadgeCheck className="h-5 w-5" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-bold text-slate-900">Change Plan</p>
                  <p className="text-[10px] text-slate-500 font-medium uppercase tracking-tight">Upgrade / Switch</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-indigo-500 group-hover:translate-x-1 transition-all" />
            </button>

          </div>

          <div className="mt-8 p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
            <div className="flex items-center gap-3 text-indigo-600 mb-2">
              <ShieldAlert className="h-5 w-5" />
              <span className="text-sm font-black uppercase tracking-tight">Billing Note</span>
            </div>
            <p className="text-[11px] text-indigo-700 font-medium leading-relaxed">
              Your subscription is managed at the organization level. Any changes will affect all {history.length > 0 ? 'connected' : 'tenant'} users.
            </p>
          </div>
        </div>

        {/* Billing Profile */}
        <div className="lg:col-span-3 bg-white rounded-[2rem] p-10 border border-slate-100 shadow-xl flex flex-col">
          <h4 className="text-2xl font-black text-slate-900 mb-8 tracking-tight">Billing Profile</h4>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="flex items-center gap-4 p-5 bg-slate-50 rounded-2xl border border-slate-100 hover:bg-indigo-50 transition-colors">
               <div className="h-12 w-12 rounded-xl bg-white flex items-center justify-center text-indigo-600 shadow-sm">
                  <User className="h-6 w-6" />
               </div>
               <div className="text-left overflow-hidden">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">Authorized User</p>
                  <p className="text-base font-bold text-slate-900 truncate">{userProfile?.full_name || 'Administrator'}</p>
               </div>
            </div>

            <div className="flex items-center gap-4 p-5 bg-slate-50 rounded-2xl border border-slate-100 hover:bg-indigo-50 transition-colors">
               <div className="h-12 w-12 rounded-xl bg-white flex items-center justify-center text-indigo-600 shadow-sm">
                  <Mail className="h-6 w-6" />
               </div>
               <div className="text-left overflow-hidden">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">Billing Email</p>
                  <p className="text-base font-bold text-slate-900 truncate">{companySettings?.email || user?.email}</p>
               </div>
            </div>

            <div className="flex items-center gap-4 p-5 bg-slate-50 rounded-2xl border border-slate-100 hover:bg-indigo-50 transition-colors">
               <div className="h-12 w-12 rounded-xl bg-white flex items-center justify-center text-indigo-600 shadow-sm">
                  <Building className="h-6 w-6" />
               </div>
               <div className="text-left overflow-hidden">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">Organization</p>
                  <p className="text-base font-bold text-slate-900 truncate">{companySettings?.company_name || 'Organization Not Set'}</p>
               </div>
            </div>

            <div className="flex items-center gap-4 p-5 bg-slate-50 rounded-2xl border border-slate-100 hover:bg-indigo-50 transition-colors">
               <div className="h-12 w-12 rounded-xl bg-white flex items-center justify-center text-indigo-600 shadow-sm">
                  <Phone className="h-6 w-6" />
               </div>
               <div className="text-left overflow-hidden">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">Contact Number</p>
                  <p className="text-base font-bold text-slate-900 truncate">{userProfile?.phone || 'Not Provided'}</p>
               </div>
            </div>
          </div>

          <div className="mt-8 pt-8 border-t border-slate-100">
            <div className="max-w-md">
               <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Company GST Number</label>
               <div className="relative flex gap-3">
                  <div className="relative flex-1 group">
                    <input
                      type="text"
                      placeholder="Enter GSTIN"
                      value={gstNumber}
                      onChange={(e) => setGstNumber(e.target.value.toUpperCase())}
                      className="w-full pl-5 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-4 focus:ring-indigo-600/10 focus:border-indigo-600 transition-all placeholder:text-slate-300"
                    />
                  </div>
                  <button
                    onClick={handleSaveGst}
                    disabled={isSavingGst}
                    className="px-8 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/20 disabled:opacity-50 flex items-center gap-2"
                  >
                    {isSavingGst ? 'Saving...' : 'Update GST Number'}
                  </button>
               </div>
               <p className="text-[10px] text-slate-400 font-medium mt-3 ml-1 flex items-center gap-1.5">
                  <ShieldAlert className="h-3 w-3" />
                  Your GST number is required to process the subscription payment and will be included on the invoice.
               </p>
            </div>
          </div>
        </div>
      </div>

      {/* Payment History */}
      <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-8 py-6 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center">
              <History className="h-4 w-4" />
            </div>
            <h3 className="text-lg font-black text-slate-900 tracking-tight uppercase">Payment History</h3>
          </div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{history.length} Transactions Found</span>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Plan & Purchase Date</th>
                <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Expires On</th>
                <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Amount</th>
                <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Invoice</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {history.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/30 transition-colors">
                  <td className="px-8 py-6">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-900">{item.plan_name}</span>
                        {item.invoice_number && (
                          <span className="text-[9px] font-black bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded uppercase tracking-tighter">
                            {item.invoice_number}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 font-medium uppercase tracking-tight">Purchased: {formatDate(item.created_at)}</span>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <span className="text-sm font-medium text-slate-600">{formatDate(item.expires_at)}</span>
                  </td>
                
                  <td className="px-8 py-6 font-bold text-slate-900">
                    {formatCurrency(item.amount_paid)}
                  </td>
                  <td className="px-8 py-6">
                    {(() => {
                      const isExpired = new Date(item.expires_at) < new Date();
                      const status = isExpired && item.status === 'active' ? 'expired' : item.status;
                      return (
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tight ${
                          status === 'active' ? 'bg-emerald-50 text-emerald-600' : 
                          status === 'expired' ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {status === 'active' ? <CheckCircle2 className="h-3 w-3" /> : null}
                          {status}
                        </span>
                      );
                    })()}
                  </td>
                   <td className="px-8 py-6 text-right">
                    {item.plan_name !== 'Elite Trial' && (
                      <button
                        onClick={() => handleDownloadInvoice(item)}
                        className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-600 hover:text-white transition-all shadow-sm group"
                        title="Download Invoice"
                      >
                        <Download className="h-4 w-4 group-hover:scale-110 transition-transform" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
