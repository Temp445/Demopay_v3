import React, { useEffect, useState } from 'react';
import Pricing from '../../Pricing';
import { useRoleAccess } from '../../../hooks/useRoleAccess';
import {
  ShieldAlert, Loader2, Calendar, History,
  Zap, BadgeCheck, Clock, User, Mail, Phone,
  Building, Download, AlertTriangle, RefreshCw, ReceiptIndianRupee,
  TrendingUp, Shield, Star, ChevronRight, ChevronLeft, Info
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { useTenant } from '../../../contexts/TenantContext';
import toast from 'react-hot-toast';
import logo from '../../../assets/AceLogo.png';

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType; label: string; value: string; sub?: string; color: string;
}) {
  const parts = color.split(' ');
  const bgClass = parts[0] || '';
  const textClass = parts[1] || '';
  const accentBgClass = textClass.replace('text-', 'bg-');

  return (
    <div className="relative overflow-hidden bg-white rounded-2xl border border-slate-100 p-5 shadow-sm hover:shadow-md hover:border-slate-200 transition-all duration-300 group">
      {/* Decorative gradient overlay */}
      <div className={`absolute -right-8 -top-8 h-32 w-32 rounded-full opacity-[0.04] group-hover:opacity-[0.08] group-hover:scale-110 transition-all duration-500 ${accentBgClass}`} />

      <div className="flex flex-col gap-4 relative z-10">
        <div className="flex items-center justify-between">
          <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${bgClass} ${textClass} border border-white/60 shadow-sm`}>
            <Icon className="h-5 w-5" />
          </div>
          {sub && (
            <div className={`px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide flex items-center gap-1.5 ${bgClass} ${textClass}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${accentBgClass}`} />
              {sub}
            </div>
          )}
        </div>

        <div>
          <p className="text-lg font-bold text-slate-900 tracking-tight">{value}</p>
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mt-1">{label}</p>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; dot: string; label: string }> = {
    active: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', label: 'Active' },
    expired: { bg: 'bg-red-50', text: 'text-red-600', dot: 'bg-red-500', label: 'Expired' },
    pending: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500', label: 'Pending' },
  };
  const s = map[status] ?? { bg: 'bg-slate-50', text: 'text-slate-600', dot: 'bg-slate-400', label: status };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${s.bg} ${s.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

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
  const [currentPage, setCurrentPage] = useState(1);
  const [dateFilter, setDateFilter] = useState({ start: '', end: '' });
  const itemsPerPage = 5;

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

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return 'N/A';
    return date.toLocaleDateString('en-IN', {
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
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <title>Invoice - ${invoiceNum}</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
        <style>
          * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; color-adjust: exact !important; print-color-adjust: exact !important; }
          body { font-family: 'Inter', sans-serif; padding: 0; margin: 0; color: #000; background: #f1f5f9; font-size: 11px; }
          .page { background: white; width: 210mm; min-height: 297mm; margin: 40px auto; padding: 0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); border: 1px solid #ccc; display: flex; flex-direction: column; }
          
          .border-container { margin: 20px; border: 1px solid #999; flex: 1; display: flex; flex-direction: column; }

          /* Header */
          .header { display: flex; justify-content: space-between; padding: 20px; border-bottom: 1px solid #999; }
          .brand-logo { width: 120px; height: auto; object-fit: contain; margin-right: 20px; }
          .company-info { flex: 1; line-height: 1.4; }
          .company-name { font-size: 16px; font-weight: 700; margin-bottom: 4px; }
          .tax-invoice-title { font-size: 24px; font-weight: 400; text-align: right; align-self: flex-end; }
          
          .meta-grid { display: flex; border-bottom: 1px solid #999; }
          .meta-col { flex: 1; padding: 10px 20px; display: grid; grid-template-columns: 100px auto; gap: 4px 10px; }
          .meta-col:first-child { border-right: 1px solid #999; }
          .meta-label { text-transform: uppercase; }
          .meta-val { font-weight: 600; }
          
          /* Bill To */
          .bill-to-grid { display: flex; border-bottom: 1px solid #999; }
          .bill-to-col { flex: 1; padding: 10px 20px; }
          .bill-to-col:first-child { border-right: 1px solid #999; }
          .bill-to-header { font-weight: 700; background: #f0f0f0; margin: -10px -20px 10px -20px; padding: 5px 20px; border-bottom: 1px solid #999; }
          .customer-name { font-weight: 700; font-size: 12px; margin-bottom: 4px; }
          
          /* Table */
          .table { width: 100%; border-collapse: collapse; }
          .table th { background: #f0f0f0; padding: 8px 10px; font-weight: 700; text-align: right; border-bottom: 1px solid #999; }
          .table th:first-child { text-align: left; }
          .table td { padding: 10px; vertical-align: top; text-align: right; border-right: 1px solid #999; }
          .table td:first-child { text-align: left; }
          .table td:last-child { border-right: none; }
          .table tr.item-row td { border-bottom: 1px solid #999; height: 150px; } /* minimum height for the item area */
          
          .item-desc { font-weight: 600; margin-bottom: 4px; }
          .item-sub { color: #555; }
          
          /* Bottom Section */
          .bottom-section { display: flex; border-bottom: 1px solid #999; flex: 1; }
          .bottom-left { flex: 1; padding: 10px 20px; border-right: 1px solid #999; display: flex; flex-direction: column; justify-content: space-between; }
          .bottom-right { width: 300px; padding: 0; }
          
          .totals-grid { display: grid; grid-template-columns: 1fr 100px; }
          .totals-row { padding: 5px 10px; text-align: right; }
          .totals-row.total-row { font-weight: 700; border-top: 1px solid #999; border-bottom: 1px solid #999; }
          .totals-row.balance { font-weight: 700; }
          
          .words-label { margin-bottom: 4px; }
          .words-value { font-weight: 700; font-style: italic; }
          
          .signature-box { padding: 20px; text-align: center; }
          .signature-box img { max-width: 150px; margin: 10px auto; display: block; opacity: 0.8; }
          .signature-name { font-weight: 600; margin-top: 50px; }
          
          .qr-box { padding: 0; }
          .qr-placeholder { width: 100px; height: 100px; border: 1px dashed #999; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #999; margin-bottom: 10px; }
          
          .declaration { padding: 10px 20px; font-size: 10px; line-height: 1.4; text-align: justify; }
          
          .no-print-bar { background: #0f172a; padding: 16px; display: flex; justify-content: center; gap: 16px; position: sticky; top: 0; z-index: 1000; }
          .btn { background: white; color: #0f172a; border: 1px solid #cbd5e1; padding: 10px 20px; border-radius: 6px; font-weight: 600; font-size: 13px; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 8px; font-family: 'Inter', sans-serif; }
          .btn:hover { background: #f8fafc; }
          .btn-primary { background: #4f46e5; color: white; border-color: #4f46e5; }
          .btn-primary:hover { background: #4338ca; }

          @media print { 
            @page { size: A4; margin: 0; }
            body { background: white; margin: 0; }
            .page { margin: 0; box-shadow: none; border: none; width: 210mm; min-height: 297mm; }
            .border-container { margin: 10mm; border: 1px solid #999 !important; }
            .no-print-bar { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="no-print-bar">
          <button class="btn btn-primary" onclick="window.print()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"></path><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
            Print / Save as PDF
          </button>
          <button class="btn" onclick="window.close()">Close Preview</button>
        </div>

        <div class="page">
          <div class="border-container">
            <div class="header">
              <div style="display: flex;">
                <img src="${logo}" class="brand-logo" alt="Logo">
                <div class="company-info">
                  <div class="company-name">Ace Software Solutions Pvt. Ltd.</div>
                  #306, 2nd Floor, NSIC-Software Technology Business Park,<br>
                  B-24, Guindy Industrial Estate, Ekkatuthangal, Chennai-600032, India<br>
                  Phone: 9840137210<br>
                  GSTIN: 33AAACZ5230C1ZU
                </div>
              </div>
              <div class="tax-invoice-title">TAX INVOICE</div>
            </div>
            
            <div class="meta-grid">
              <div class="meta-col">
                <span class="meta-label">INVOICE#</span> <span class="meta-val">: ${invoiceNum}</span>
                <span class="meta-label">DATE</span> <span class="meta-val">: ${date}</span>
              </div>
              <div class="meta-col">
                <span class="meta-label">Name Of State</span> <span class="meta-val">: Tamil Nadu (33)</span>
                <span class="meta-label">License Sent to</span> <span class="meta-val">: ${legalName}</span>
                <span class="meta-label">Place Of Supply</span> <span class="meta-val">: Remote</span>
              </div>
            </div>

            <div class="bill-to-grid">
              <div class="bill-to-col">
                <div class="bill-to-header">Bill To</div>
                <div class="customer-name">${legalName}</div>
                Attn: ${user?.email}<br>
                GSTIN: ${gst}
              </div>
              <div class="bill-to-col">
                <div class="bill-to-header">Ship To</div>
                <div class="customer-name">${legalName}</div>
              </div>
            </div>

            <table class="table">
              <thead>
                <tr>
                  <th style="width: 50%;">Item & Description</th>
                  <th style="width: 10%; text-align: center;">Qty</th>
                  <th style="width: 15%;">Rate</th>
                  <th style="width: 10%; text-align: center;">IGST %</th>
                  <th style="width: 15%;">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr class="item-row">
                  <td>
                    <div class="item-desc">Ace Payroll - ${item.plan_name} Plan</div>
                    <div class="item-sub">Service : Ace Payroll Software</div>
                    <div class="item-sub">Payment Duration : ${item.billing_cycle}</div>
                    <div class="item-sub">Start ${date} <br> End ${expiresAt}</div>
                  </td>
                  <td style="text-align: center;">1.00</td>
                  <td>${amount}</td>
                  <td style="text-align: center;">18%</td>
                  <td>${amount}</td>
                </tr>
              </tbody>
            </table>

            <div class="bottom-section">
              <div class="bottom-left">
                <div>
                  <div class="words-label">Total In Words</div>
                  <div class="words-value">Rupees (See Total Amount) Only</div>
                </div>
                
                
              </div>
              
              <div class="bottom-right">
                <div class="totals-grid">
                  <div class="totals-row">Sub Total</div>
                  <div class="totals-row">${amount}</div>
                  
                  <div class="totals-row">IGST (18%)</div>
                  <div class="totals-row">Included</div>
                  
                  <div class="totals-row total-row">Total</div>
                  <div class="totals-row total-row">₹${item.amount_paid}</div>
                  
                  <div class="totals-row">Payment Made</div>
                  <div class="totals-row" style="color: red;">(-) ₹${item.amount_paid}</div>
                  
                  <div class="totals-row balance">Balance Due</div>
                  <div class="totals-row balance">₹0.00</div>
                </div>
                
                <div class="signature-box">
                  <div style="font-size: 10px;">Ace Software Solutions Pvt Ltd</div>
                  <div class="signature-name">Authorized Signatory</div>
                </div>
              </div>
            </div>

            <div class="declaration">
              <b>Declaration:</b>The software supplied under this invoice is transferred without any modification, and all applicable tax obligations have already been fulfilled during the previous transfer. Therefore, no further tax deduction is applicable on this invoice.
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
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
        <div className="h-12 w-12 rounded-2xl bg-indigo-50 flex items-center justify-center">
          <Loader2 className="h-6 w-6 text-indigo-600 animate-spin" />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-slate-700">Loading billing information</p>
          <p className="text-xs text-slate-400 mt-1">Fetching your subscription details...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-6 max-w-md mx-auto text-center">
        <div className="h-16 w-16 rounded-2xl bg-amber-50 flex items-center justify-center">
          <ShieldAlert className="h-8 w-8 text-amber-500" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Admin Access Required</h2>
          <p className="text-sm text-slate-500 leading-relaxed">
            Billing management is restricted to organization administrators. Contact your admin for access.
          </p>
        </div>
        <div className="px-4 py-3 bg-amber-50 rounded-xl border border-amber-100 w-full">
          <p className="text-xs text-amber-700 font-medium">For assistance, contact <span className="font-bold">sales@acesoft.in</span></p>
        </div>
      </div>
    );
  }

  if (showPricing) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowPricing(false)}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-600 font-medium transition-colors"
          >
            <ChevronRight className="h-4 w-4 rotate-180" />
            Back to Billing
          </button>
          <span className="text-slate-200">|</span>
          <h1 className="text-sm font-semibold text-slate-700">Choose a Plan</h1>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-8 py-6 border-b border-slate-100">
            <h2 className="text-xl font-bold text-slate-900">Subscription Plans</h2>
            <p className="text-sm text-slate-500 mt-1">Select the right plan for your organization</p>
          </div>
          <div className="pb-10"><Pricing /></div>
        </div>
      </div>
    );
  }

  const displaySub = currentSub || history[0];
  const isExpired = !currentSub && history.length > 0;
  const hasNoSub = history.length === 0;
  const daysRemaining = currentSub ? Math.max(0, Math.ceil((new Date(currentSub.expires_at).getTime() - Date.now()) / 86400000)) : 0;
  const totalSpend = history.filter(s => s.plan_name !== 'Elite Trial').reduce((acc, s) => acc + s.amount_paid, 0);

  const filteredHistory = history.filter(item => {
    if (dateFilter.start && new Date(item.created_at) < new Date(dateFilter.start)) return false;
    if (dateFilter.end && new Date(item.created_at) > new Date(dateFilter.end + 'T23:59:59')) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredHistory.length / itemsPerPage));
  const paginatedHistory = filteredHistory.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  if (hasNoSub) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Billing &amp; Subscriptions</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage your plan, invoices, and billing details</p>
        </div>
        <div className="bg-white rounded-2xl border border-dashed border-indigo-200 p-12 flex flex-col items-center text-center gap-5">
          <div className="h-16 w-16 rounded-2xl bg-indigo-50 flex items-center justify-center">
            <Star className="h-8 w-8 text-indigo-500" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 mb-2">No Active Subscription</h2>
            <p className="text-sm text-slate-500 max-w-sm">Unlock full payroll capabilities with a plan that fits your team size and needs.</p>
          </div>
          <button
            onClick={() => setShowPricing(true)}
            className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm shadow-indigo-600/20"
          >
            <Zap className="h-4 w-4" /> View Plans &amp; Pricing
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 ">

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Billing &amp; Subscriptions</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage your plan, invoices, and organization billing details</p>
        </div>
        <button
          onClick={() => setShowPricing(true)}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm shadow-indigo-600/20 whitespace-nowrap"
        >
          <TrendingUp className="h-4 w-4" />
          {isExpired ? 'Renew Subscription' : 'View Plans & Pricing'}
        </button>
      </div>

      {/* Expired Banner */}
      {isExpired && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-red-50 border border-red-200 rounded-2xl">
          <div className="flex items-start gap-3 flex-1">
            <div className="h-9 w-9 rounded-lg bg-red-100 flex items-center justify-center shrink-0 mt-0.5">
              <AlertTriangle className="h-4 w-4 text-red-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-red-800">Your subscription has expired</p>
              <p className="text-xs text-red-600 mt-0.5">
                Expired on {formatDate(displaySub?.expires_at)}. Renew now to restore full access to all payroll features.
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowPricing(true)}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl transition-colors whitespace-nowrap shrink-0"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Renew Now
          </button>
        </div>
      )}

      {/* Subscription Card + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <div className={`relative overflow-hidden rounded-2xl p-7 text-white ${isExpired ? 'bg-gradient-to-br from-slate-600 via-slate-700 to-slate-800' : 'bg-yellow-600'}`}>
            <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-white/20 blur-2xl" />
            {/* <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-white/20 blur-xl" /> */}
            <div className="relative">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
                <div>
                  <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold mb-3 border ${isExpired ? 'bg-red-500/20 border-red-400/30 text-red-200' : 'bg-white/15 border-white/20 text-white'}`}>
                    {isExpired ? <AlertTriangle className="h-3 w-3" /> : <BadgeCheck className="h-3 w-3" />}
                    {isExpired ? 'Subscription Expired' : displaySub?.plan_name === 'Elite Trial' ? 'Free Trial' : 'Active Plan'}
                  </div>
                  <h2 className="text-3xl font-bold tracking-tight">{displaySub?.plan_name}</h2>
                  <p className="text-white/60 text-xs font-medium mt-1 capitalize">{displaySub?.billing_cycle} billing cycle</p>
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-2xl font-bold">{formatCurrency(displaySub?.amount_paid || 0)}</p>
                  <p className="text-white/50 text-xs mt-0.5">Last payment</p>
                  {!isExpired && (
                    <div className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 bg-white/10 rounded-full border border-white/10">
                      <Clock className="h-3 w-3 text-amber-300" />
                      <span className="text-xs text-white/80 font-medium">{daysRemaining} days left</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10">
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar className="h-3.5 w-3.5 text-white/50" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-white/50">Start Date</span>
                  </div>
                  <p className="text-sm font-bold">{formatDate(periodStart || displaySub?.created_at)}</p>
                </div>
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className={`h-3.5 w-3.5 ${isExpired ? 'text-red-300' : 'text-white/50'}`} />
                    <span className={`text-[10px] font-bold uppercase tracking-widest ${isExpired ? 'text-red-300' : 'text-white/50'}`}>
                      {isExpired ? 'Expired On' : 'Next Renewal'}
                    </span>
                  </div>
                  <p className="text-sm font-bold">{formatDate(displaySub?.expires_at)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm flex-1">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">Quick Actions</h3>
            </div>
            <div className="p-4 space-y-2">
              {!isExpired && displaySub?.plan_name !== 'Elite Trial' && (
                <button
                  onClick={() => setShowPricing(true)}
                  className="w-full group flex items-center justify-between p-3.5 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition-colors border border-emerald-100"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-white border border-emerald-200 flex items-center justify-center text-emerald-600">
                      <RefreshCw className="h-4 w-4" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-semibold text-slate-900">Extend Plan</p>
                      <p className="text-[11px] text-slate-500">Renew subscription</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-emerald-500 transition-colors" />
                </button>
              )}
              <button
                onClick={() => setShowPricing(true)}
                className="w-full group flex items-center justify-between p-3.5 bg-slate-50 hover:bg-indigo-50 rounded-xl transition-colors border border-slate-100 hover:border-indigo-100"
              >
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-white border border-slate-200 group-hover:border-indigo-200 flex items-center justify-center text-indigo-600">
                    <TrendingUp className="h-4 w-4" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-slate-900">Change Plan</p>
                    <p className="text-[11px] text-slate-500">Upgrade / downgrade</p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-indigo-500 transition-colors" />
              </button>
            </div>
          </div>
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
            <div className="flex items-start gap-2.5">
              <Info className="h-4 w-4 text-indigo-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-indigo-700 mb-1">Organization Billing</p>
                <p className="text-[11px] text-indigo-600 leading-relaxed">
                  Subscription is managed at the organization level and applies to all workspace members.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Shield} label="Current Status"
          value={isExpired ? 'Expired' : 'Active'}
          sub={isExpired ? `Since ${formatDate(displaySub.expires_at)}` : `${daysRemaining} days remaining`}
          color={isExpired ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}
        />
        <StatCard icon={ReceiptIndianRupee} label={isExpired ? 'Last Plan' : 'Active Plan'} value={displaySub?.plan_name || '-'} sub={`${displaySub?.billing_cycle || ''} cycle`} color="bg-indigo-50 text-indigo-600" />
        <StatCard icon={History} label="Total Payments" value={history.filter(s => s.plan_name !== 'Elite Trial').length.toString()} sub="Transactions" color="bg-violet-50 text-violet-600" />
        <StatCard icon={TrendingUp} label="Total Spend" value={formatCurrency(totalSpend)} sub="All time" color="bg-amber-50 text-amber-600" />
      </div>

      {/* Billing Profile */}
      <div className="relative overflow-hidden bg-white rounded-2xl border border-slate-200 shadow-sm transition-shadow hover:shadow-md">
        {/* Background Decorative Elements */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-full blur-3xl opacity-60 pointer-events-none -mr-32 -mt-32"></div>
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-blue-50 to-emerald-50 rounded-full blur-2xl opacity-50 pointer-events-none -ml-24 -mb-24"></div>

        <div className="relative px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <div className="w-1.5 h-6 bg-gradient-to-b from-indigo-500 to-purple-600 rounded-full"></div>
              Billing Profile
            </h3>
            <p className="text-xs text-slate-500 mt-1 ml-3.5">Organization and contact information for billing</p>
          </div>
          <div className="hidden sm:block">
            <div className="h-10 w-10 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 shadow-sm">
              <Building className="h-5 w-5" />
            </div>
          </div>
        </div>

        <div className="relative p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[
              { icon: User, label: 'Account Owner', value: userProfile?.full_name || 'Administrator', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100/50' },
              { icon: Mail, label: 'Billing Email', value: companySettings?.email || user?.email || '-', color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-100/50' },
              { icon: Building, label: 'Organization', value: companySettings?.company_name || 'Not configured', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100/50' },
              { icon: Phone, label: 'Contact Number', value: userProfile?.phone || 'Not provided', color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100/50' },
            ].map(({ icon: Icon, label, value, color, bg, border }) => (
              <div key={label} className="group relative overflow-hidden bg-white rounded-xl border border-slate-200 p-4 transition-all duration-300 hover:shadow-md hover:-translate-y-1 hover:border-slate-300">
                <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 ${bg}`}></div>
                <div className="relative flex flex-col gap-3">
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 border transition-transform duration-300 group-hover:scale-110 ${bg} ${color} ${border}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">{label}</p>
                    <p className="text-sm font-semibold text-slate-800 truncate group-hover:text-slate-900 transition-colors">{value}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-6 border-t border-slate-100">
            <div className="bg-slate-50/50 rounded-2xl p-5 border border-slate-100">
              <div className="flex flex-col md:flex-row md:items-center gap-6">
                <div className="flex-1 space-y-1.5">
                  <label className="flex items-center gap-2 text-sm font-bold text-slate-800">
                    <ReceiptIndianRupee className="h-4 w-4 text-indigo-500" />
                    GST Registration Number
                  </label>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    This GST number will be printed on all your tax invoices and receipts for compliance.
                  </p>
                </div>

                <div className="flex-1 w-full max-w-md">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1 group">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                        <BadgeCheck className="h-4 w-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                      </div>
                      <input
                        type="text"
                        placeholder="e.g. 22AAAAA0000A1Z5"
                        value={gstNumber}
                        onChange={e => setGstNumber(e.target.value.toUpperCase())}
                        className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all shadow-sm"
                      />
                    </div>
                    <button
                      onClick={handleSaveGst}
                      disabled={isSavingGst}
                      className="relative px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-xl transition-all shadow-md hover:shadow-lg disabled:opacity-70 disabled:cursor-not-allowed whitespace-nowrap overflow-hidden group"
                    >
                      <span className="relative z-10 flex items-center gap-2">
                        {isSavingGst ? (
                          <>
                            <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Saving...
                          </>
                        ) : (
                          'Save Details'
                        )}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Payment History */}
      <div className="relative overflow-hidden bg-white rounded-2xl border border-slate-200 shadow-sm transition-shadow hover:shadow-md">
        {/* Background Decorative Elements */}
        <div className="absolute top-0 left-0 w-64 h-64 bg-gradient-to-br from-slate-50 to-indigo-50/50 rounded-full blur-3xl opacity-60 pointer-events-none -ml-32 -mt-32"></div>

        <div className="relative px-6 py-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <div className="w-1.5 h-6 bg-gradient-to-b from-slate-400 to-slate-600 rounded-full"></div>
              Payment History
            </h3>
            <p className="text-xs text-slate-500 mt-1 ml-3.5">{filteredHistory.length} transaction{filteredHistory.length !== 1 ? 's' : ''} found</p>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dateFilter.start}
                onChange={(e) => { setDateFilter(prev => ({ ...prev, start: e.target.value })); setCurrentPage(1); }}
                className="pl-2 pr-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
              <span className="text-slate-400 text-xs">to</span>
              <input
                type="date"
                value={dateFilter.end}
                onChange={(e) => { setDateFilter(prev => ({ ...prev, end: e.target.value })); setCurrentPage(1); }}
                className="pl-2 pr-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
              {(dateFilter.start || dateFilter.end) && (
                <button
                  onClick={() => { setDateFilter({ start: '', end: '' }); setCurrentPage(1); }}
                  className="text-xs text-indigo-600 hover:text-indigo-700 font-medium px-2"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="hidden sm:flex h-10 w-10 rounded-full bg-slate-50 border border-slate-100 items-center justify-center text-slate-400 shadow-sm shrink-0">
              <History className="h-5 w-5" />
            </div>
          </div>
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto relative">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                {['Plan & Date', 'Period', 'Amount', 'Status', 'Invoice'].map((h, i) => (
                  <th key={h} className={`px-6 py-3.5 text-[10px] font-bold text-slate-800 uppercase tracking-widest ${i === 4 ? 'text-right' : ''}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedHistory.map(item => {
                const exp = new Date(item.expires_at) < new Date();
                const status = exp && item.status === 'active' ? 'expired' : item.status;
                return (
                  <tr key={item.id} className="hover:bg-indigo-50/30 transition-all duration-300 group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-slate-900 group-hover:text-indigo-900 transition-colors">{item.plan_name}</span>
                        {item.invoice_number && (
                          <span className="text-[9px] font-bold bg-indigo-100/50 text-indigo-700 px-2 py-0.5 rounded uppercase border border-indigo-200/50 shadow-sm">{item.invoice_number}</span>
                        )}
                      </div>
                      <p className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
                        <Calendar className="h-3 w-3" />
                        Purchased {formatDate(item.created_at)}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-xs font-semibold text-slate-700">{formatDate(item.created_at)}</p>
                      <p className="text-[11px] text-slate-700 flex items-center gap-1 mt-0.5">
                        <span className="text-slate-500">to</span> {formatDate(item.expires_at)}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-bold text-slate-900">{formatCurrency(item.amount_paid)}</span>
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mt-0.5">{item.billing_cycle}</p>
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={status} />
                    </td>
                    <td className="px-6 py-4 text-right">
                      {item.plan_name !== 'Elite Trial' ? (
                        <button
                          onClick={() => handleDownloadInvoice(item)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-900 text-slate-600 hover:text-white rounded-lg transition-all duration-300 text-xs font-bold border border-slate-200 hover:border-slate-800 shadow-sm hover:shadow-md group/btn"
                        >
                          <Download className="h-3.5 w-3.5 text-slate-400 group-hover/btn:text-white transition-colors" />
                          <span>Receipt</span>
                        </button>
                      ) : (
                        <span className="text-xs text-slate-300 font-medium px-4">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredHistory.length === 0 && (
            <div className="py-12 text-center">
              <div className="h-12 w-12 rounded-full bg-slate-50 flex items-center justify-center mx-auto mb-3">
                <ReceiptIndianRupee className="h-6 w-6 text-slate-300" />
              </div>
              <p className="text-sm font-medium text-slate-600">No transactions found</p>
              <p className="text-xs text-slate-400 mt-1">Your payment history will appear here.</p>
            </div>
          )}
          {filteredHistory.length > itemsPerPage && (
            <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between">
              <p className="text-xs text-slate-500">
                Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredHistory.length)} of {filteredHistory.length} entries
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Mobile cards */}
        <div className="md:hidden divide-y divide-slate-100 bg-slate-50/30">
          {paginatedHistory.map(item => {
            const exp = new Date(item.expires_at) < new Date();
            const status = exp && item.status === 'active' ? 'expired' : item.status;
            return (
              <div key={item.id} className="p-5 space-y-4 hover:bg-white transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-bold text-slate-900">{item.plan_name}</p>
                      {item.invoice_number && (
                        <span className="text-[9px] font-bold bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded uppercase">{item.invoice_number}</span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 font-medium">Purchased {formatDate(item.created_at)}</p>
                  </div>
                  <StatusBadge status={status} />
                </div>

                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Amount</p>
                    <span className="text-sm font-bold text-slate-900">{formatCurrency(item.amount_paid)}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Valid Until</p>
                    <p className="text-xs font-semibold text-slate-700">{formatDate(item.expires_at)}</p>
                  </div>
                </div>

                {item.plan_name !== 'Elite Trial' && (
                  <button
                    onClick={() => handleDownloadInvoice(item)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white text-slate-700 hover:bg-slate-900 hover:text-white rounded-xl text-sm font-semibold border border-slate-200 transition-all shadow-sm"
                  >
                    <Download className="h-4 w-4" /> Download Receipt
                  </button>
                )}
              </div>
            );
          })}
          {filteredHistory.length === 0 && (
            <div className="py-10 text-center px-4">
              <p className="text-sm font-medium text-slate-600">No transactions found</p>
            </div>
          )}
          {filteredHistory.length > itemsPerPage && (
            <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-white">
              <p className="text-xs text-slate-500">
                {((currentPage - 1) * itemsPerPage) + 1}-{Math.min(currentPage * itemsPerPage, filteredHistory.length)} of {filteredHistory.length}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Support Footer */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-1">
        <p className="text-xs text-slate-400">
          Need help? Contact <a href="mailto:sales@acesoft.in" className="text-indigo-600 hover:underline font-medium">sales@acesoft.in</a>
        </p>
        <p className="text-xs text-slate-300">Ace Payroll &middot; Billing</p>
      </div>
    </div>
  );
}


