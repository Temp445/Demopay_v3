import React, { useState } from 'react';
import {
  ArrowRight, Shield, LayoutDashboard, Users, Clock, Calendar,
  CreditCard, TrendingUp, FileText, MapPin, Bell,
  ChevronRight, Download, CheckCircle2, Trash2, BarChart3, Star, X, Play
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

const Hero = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [showDemo, setShowDemo] = useState(false);

  const handleGetStarted = async () => {
    if (!user) {
      navigate('/login', { state: { from: '/dashboard' } });
    } else {
      const { data } = await supabase
        .from('tenant_users')
        .select('role')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();
      if (data?.role === 'manager') {
        navigate('/dashboard/global-tenant-management');
      } else {
        navigate('/dashboard');
      }
    }
  };

  const sidebarItems = [
    { icon: LayoutDashboard, label: 'Dashboard' },
    { icon: Users,           label: 'Employees' },
    { icon: Clock,           label: 'Attendance',  chevron: true },
    { icon: Calendar,        label: 'Shifts' },
    { icon: Star,            label: 'Holidays' },
    { icon: Shield,          label: 'Permissions', chevron: true },
    { icon: TrendingUp,      label: 'Advances',    chevron: true },
    {
      icon: CreditCard, label: 'Salary Payroll Process', chevron: true, active: true,
      children: [
        { label: 'Component Master' },
        { label: 'Salary Structures' },
        { label: 'Structure Assignments' },
        { label: 'Payroll Process' },
        { label: 'Payroll', highlight: true },
      ],
    },
    { icon: FileText, label: 'Statutory' },
    { icon: FileText, label: 'Reports' },
  ];

  return (
    <div className="relative bg-white overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-indigo-50/60 via-white to-white pointer-events-none" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1200px] h-[600px] bg-gradient-to-r from-indigo-100/40 via-violet-100/30 to-indigo-100/40 rounded-full blur-[140px] pointer-events-none -translate-y-1/2" />
      <div
        className="absolute inset-0 opacity-[0.025] pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle, #4f46e5 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-0">

        <div className="flex justify-center mb-8">
          <div className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-white border border-indigo-200 text-indigo-700 text-[11px] font-black uppercase tracking-[0.18em] shadow-[0_2px_12px_rgba(99,102,241,0.15)]">
            <div className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
            Ace Payroll — Enterprise Payroll Platform
          </div>
        </div>

        {/* ── HEADLINE ── */}
        <div className="text-center mb-8 max-w-5xl mx-auto">
          <h1 className="text-[58px] sm:text-[66px] lg:text-[82px] font-semibold text-[#0F172A] leading-[1.05] tracking-[-0.03em] mb-6">
            Smart Payroll Software <br />
            <span className="relative inline-block">
              <span className="bg-gradient-to-r from-indigo-600 via-violet-500 to-indigo-500 bg-clip-text text-transparent">
                with Built-In Compliance.
              </span>
              <span className="absolute -bottom-1.5 left-0 right-0 h-[3px] bg-gradient-to-r from-indigo-400 via-violet-400 to-indigo-300 rounded-full opacity-40" />
            </span>
          </h1>
          <p className="text-[17px] text-slate-500 max-w-2xl mx-auto leading-relaxed font-medium">
            Everything your payroll team needs —
            {' '}<span className="font-bold text-slate-700">Attendance Management</span>,
            {' '}<span className="font-bold text-slate-700">Role-Based Access</span>,
            {' '}<span className="font-bold text-slate-700">Payroll Processing</span> &
            {' '}<span className="font-bold text-slate-700">Reports</span>{' '}
            — automated, accurate, and always compliant.
          </p>
        </div>

        {/* ── CTAs ── */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-10">
          <button
            onClick={handleGetStarted}
            className="group relative flex items-center gap-3 px-8 py-4 bg-indigo-600 text-white font-bold text-[15px] rounded-full shadow-[0_8px_32px_rgba(99,102,241,0.5)] hover:bg-indigo-700 hover:shadow-[0_14px_44px_rgba(99,102,241,0.65)] transition-all duration-200 hover:-translate-y-0.5 overflow-hidden"
          >
            <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-in-out" />
            Get Started
            <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
          </button>
          <button 
            onClick={() => setShowDemo(true)}
            className="flex items-center gap-2.5 px-8 py-4 bg-transparent text-slate-700 font-bold text-[15px] rounded-full border border-gray-300 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50/50 transition-all duration-200 hover:-translate-y-0.5"
          >
            Live Demo
            <Play className="h-4 w-4 opacity-60 fill-current" />
          </button>
        </div>

        <div className="relative">

          {/* ── FLOATING CARD: Payroll Processed (top-left) ── */}
          <div className="absolute -left-6 top-14 z-20 hidden lg:block">
            <div className="bg-white rounded-2xl border border-gray-100 p-5 w-56 shadow-[0_20px_60px_rgba(0,0,0,0.14),0_0_0_1px_rgba(0,0,0,0.04)]">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 bg-green-50 border border-green-100 rounded-xl flex items-center justify-center shadow-sm">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Payroll Processed</p>
                  <p className="text-base font-black text-[#0F172A] mt-0.5">₹2,01,037.83</p>
                </div>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-1.5">
                <div className="h-full bg-gradient-to-r from-green-500 to-emerald-400 rounded-full w-[97%]" />
              </div>
              <div className="flex items-center justify-between">
                <p className="text-[9px] text-gray-400 font-bold">March 2026</p>
              </div>
            </div>
          </div>

          {/* ── FLOATING CARD: Payroll Summary (bottom-left) ── */}
          <div className="absolute -left-6 bottom-20 z-20 hidden lg:block">
            <div className="bg-white rounded-2xl border border-gray-100 p-5 w-56 shadow-[0_20px_60px_rgba(0,0,0,0.14),0_0_0_1px_rgba(0,0,0,0.04)]">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-center shadow-sm">
                  <Users className="h-5 w-5 text-indigo-600" />
                </div>
                <div>
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Pay Run Info</p>
                  <p className="text-xs font-black text-[#0F172A] mt-0.5">March 2026</p>
                </div>
              </div>
              <div className="space-y-2.5">
                {[
                  { label: 'Employees', val: '10', highlight: false },
                  { label: 'Period',    val: '01 Mar – 31 Mar', highlight: false }
                ].map((r, i) => (
                  <div key={i} className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 ${r.highlight ? 'bg-indigo-50 border border-indigo-100' : ''}`}>
                    <span className="text-[9px] font-bold text-slate-400">{r.label}</span>
                    <span className={`text-[10px] font-black ${r.highlight ? 'text-indigo-600' : 'text-[#0F172A]'}`}>{r.val}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── FLOATING CARD: Latest Payroll (bottom-right) ── */}
          <div className="absolute -right-6 bottom-20 z-20 hidden lg:block">
            <div className="bg-white rounded-2xl border border-gray-100 p-5 w-56 shadow-[0_20px_60px_rgba(0,0,0,0.14),0_0_0_1px_rgba(0,0,0,0.04)]">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Latest Payroll</p>
                <span className="text-[8px] font-black px-2.5 py-1 bg-green-50 text-green-700 border border-green-200 rounded-full">Mar 2026</span>
              </div>
              <div className="space-y-2.5">
                {[
                  { name: 'Ravi G',   amount: '₹20,950', status: 'Paid',  paid: true },
                  { name: 'Arun T',   amount: '₹17,106', status: 'Draft', paid: false },
                  { name: 'Kumar P',  amount: '₹32,980', status: 'Draft', paid: false },
                ].map((row, i) => (
                  <div key={i} className="flex items-center justify-between py-0.5">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-[9px] font-black flex-shrink-0 shadow-sm">
                        {row.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-[#0F172A]">{row.name}</p>
                        <p className="text-[9px] font-black text-[#0F172A]">{row.amount}</p>
                      </div>
                    </div>
                    <span className={`text-[8px] font-black px-2 py-0.5 rounded-full border ${row.paid ? 'bg-green-50 text-green-700 border-green-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                      {row.status}
                    </span>
                  </div>
                ))}
              </div>
           
            </div>
          </div>

          {/* ── MAIN DASHBOARD FRAME ── */}
          <div className="mx-6 lg:mx-16 rounded-2xl overflow-hidden border border-gray-300/60 shadow-[0_50px_120px_-20px_rgba(0,0,0,0.28),0_0_0_1px_rgba(99,102,241,0.06)] relative">

            {/* Browser chrome */}
            <div className="bg-[#ECEEF1] border-b border-gray-300/70 px-4 py-2.5 flex items-center gap-3">
              <div className="flex gap-1.5">
                <div className="h-3 w-3 rounded-full bg-[#FF5F57] shadow-sm" />
                <div className="h-3 w-3 rounded-full bg-[#FEBC2E] shadow-sm" />
                <div className="h-3 w-3 rounded-full bg-[#28C840] shadow-sm" />
              </div>
              <div className="flex-1 bg-white border border-gray-300/80 rounded-md px-3 py-1.5 text-[10px] text-gray-400 font-mono flex items-center gap-2 max-w-sm mx-auto shadow-inner">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                https://payroll.acesoftcloud.in/dashboard/payroll
              </div>
              <div className="w-16" />
            </div>

            {/* App shell */}
            <div className="flex bg-white" style={{ height: 580 }}>

              {/* SIDEBAR */}
              <div className="w-48 bg-[#3730a3] flex-shrink-0 flex flex-col overflow-hidden">
                <div className="px-4 py-4 border-b border-white/10">
                  <div className="flex items-center gap-2.5">
                    <div>
                      <p className="text-white font-black text-[11px] leading-none tracking-tight">ACE PAYROLL</p>
                      <p className="text-indigo-300/60 text-[8px] font-bold tracking-wider mt-0.5">SYSTEM</p>
                    </div>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
                  {sidebarItems.map((item, idx) => (
                    <div key={idx}>
                      <div className={`flex items-center justify-between px-2.5 py-2 rounded-lg cursor-pointer transition-all ${
                        item.active ? 'bg-white/15 text-white' : 'text-indigo-200/75 hover:text-white hover:bg-white/8'
                      }`}>
                        <div className="flex items-center gap-2">
                          <item.icon className="h-3.5 w-3.5 flex-shrink-0" />
                          <span className="text-[9.5px] font-semibold truncate">{item.label}</span>
                        </div>
                        {item.chevron && (
                          <ChevronRight className={`h-3 w-3 opacity-40 flex-shrink-0 ${item.active ? 'rotate-90' : ''}`} />
                        )}
                      </div>
                      {item.children && (
                        <div className="ml-5 mt-0.5 mb-1 space-y-0.5 border-l border-white/10 pl-2.5">
                          {item.children.map((child, ci) => (
                            <div key={ci} className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[9px] font-semibold cursor-pointer transition-all ${
                              child.highlight
                                ? 'bg-white text-[#3730a3] font-black shadow-sm'
                                : 'text-indigo-200/60 hover:text-white hover:bg-white/5'
                            }`}>
                              {child.highlight && <CreditCard className="h-2.5 w-2.5" />}
                              {child.label}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* MAIN */}
              <div className="flex-1 flex flex-col overflow-hidden">

                {/* Topbar */}
                <div className="bg-[#3730a3] px-5 py-3 flex items-center justify-between border-b border-white/10">
                  <div />
                  <p className="text-[10px] font-black text-white/90 tracking-[0.2em] uppercase">Ace Payroll</p>
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className="h-8 w-8 bg-white/15 rounded-full flex items-center justify-center">
                        <Bell className="h-4 w-4 text-white" />
                      </div>
                      <div className="absolute -top-1 -right-1 h-4 w-4 bg-red-500 rounded-full border-2 border-[#3730a3] flex items-center justify-center">
                        <span className="text-[7px] text-white font-black">4</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 bg-white/10 rounded-full px-3 py-1.5">
                      <div className="h-6 w-6 bg-white/25 rounded-full flex items-center justify-center">
                        <span className="text-white text-[9px] font-black">S</span>
                      </div>
                      <span className="text-[10px] font-black text-white">Sam</span>
                    </div>
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 bg-[#F7F8FA] overflow-y-auto">
                  <div className="p-5 space-y-4">

                    {/* Header */}
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-lg font-black text-[#0F172A]">Payroll</h2>
                        <p className="text-[10px] text-slate-400 mt-0.5">Manage payroll entries, process payments, and generate reports.</p>
                      </div>
                      <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-[10px] font-black text-slate-600 shadow-sm">
                        <Download className="h-3 w-3" />
                        Export
                      </button>
                    </div>

                    {/* Filters */}
                    <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                      <div className="grid grid-cols-3 gap-4">
                        {[
                          { label: 'Period Start', value: '01-03-2026' },
                          { label: 'Period End',   value: '31-03-2026' },
                          { label: 'Status',       value: 'All Statuses', select: true },
                        ].map((f, i) => (
                          <div key={i}>
                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5">{f.label}</p>
                            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                              <Calendar className="h-3 w-3 text-gray-400 flex-shrink-0" />
                              <span className="text-[10px] font-bold text-[#0F172A] flex-1 truncate">{f.value}</span>
                              {f.select && <ChevronRight className="h-3 w-3 text-gray-400 rotate-90" />}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* KPI Cards */}
                    <div className="grid grid-cols-4 gap-3">
                      {[
                        { label: 'Total Payroll',   value: '₹2,01,037.83', icon: CreditCard, bg: 'bg-indigo-600', light: 'bg-indigo-50' },
                        { label: 'Total Employees', value: '10',            icon: Users,      bg: 'bg-blue-500',   light: 'bg-blue-50' },
                        { label: 'Total Overtime',  value: '₹0.00',        icon: Clock,      bg: 'bg-orange-400', light: 'bg-orange-50' },
                        { label: 'Total Bonus',     value: '₹0.00',        icon: BarChart3,  bg: 'bg-violet-500', light: 'bg-violet-50' },
                      ].map((kpi, i) => (
                        <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
                          <div className={`h-11 w-11 ${kpi.bg} rounded-xl flex items-center justify-center flex-shrink-0 shadow-[0_4px_12px_rgba(0,0,0,0.15)]`}>
                            <kpi.icon className="h-5 w-5 text-white" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-tight truncate">{kpi.label}</p>
                            <p className="text-[13px] font-black text-[#0F172A] mt-1 truncate">{kpi.value}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Table */}
                    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                      <div className="grid grid-cols-5 px-5 py-3 border-b border-gray-100 bg-gray-50">
                        {['Employee', 'Period', 'Total Earnings', 'Total Amount', 'Status'].map((h) => (
                          <div key={h} className="text-[8.5px] font-black text-slate-400 uppercase tracking-widest">{h}</div>
                        ))}
                      </div>
                      {[
                        { name: 'Ravi G',   code: 'EMP 001', role: 'Software Engineer', from: '01/03/2026', to: '31/03/2026', earnings: '₹20,950.72', amount: '₹20,950.72', status: 'Paid',  paid: true },
                        { name: 'Arun T',   code: 'EMP 002', role: 'Team Lead',         from: '01/03/2026', to: '31/03/2026', earnings: '₹17,106.45', amount: '₹17,106.45', status: 'Draft', paid: false },
                        { name: 'Kumar P',  code: 'EMP 003', role: 'Team Leader',       from: '01/03/2026', to: '31/03/2026', earnings: '₹32,980.66', amount: '₹32,980.66', status: 'Draft', paid: false },
                      ].map((row, i) => (
                        <div key={i} className="grid grid-cols-5 px-5 py-3.5 border-b border-gray-50 last:border-0 hover:bg-indigo-50/25 transition-colors items-center group">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] font-black text-indigo-600">{row.name}</span>
                              <span className="text-[7.5px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-mono">{row.code}</span>
                            </div>
                            <p className="text-[9px] text-slate-400 mt-0.5">{row.role}</p>
                          </div>
                          <div>
                            <p className="text-[9.5px] font-semibold text-slate-600">{row.from}</p>
                            <p className="text-[9.5px] font-semibold text-slate-600">{row.to}</p>
                          </div>
                          <div className="text-[11px] font-black text-[#0F172A]">{row.earnings}</div>
                          <div className="text-[11px] font-black text-[#0F172A]">{row.amount}</div>
                          <div className="flex items-center gap-2">
                            <span className={`text-[9px] font-black px-2.5 py-1 rounded-full border ${
                              row.paid ? 'bg-green-50 text-green-700 border-green-200' : 'bg-slate-50 text-slate-500 border-slate-200'
                            }`}>{row.status}</span>
                            <div className="ml-auto flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              {!row.paid && <CheckCircle2 className="h-3.5 w-3.5 text-green-400 hover:text-green-600 cursor-pointer" />}
                              <Trash2 className="h-3.5 w-3.5 text-red-300 hover:text-red-500 cursor-pointer" />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── PERFORMANCE STRIP ── */}
        <div className="mt-20 py-12 border-t border-gray-100">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 text-center">
            {[
              { value: '5x Faster', label: 'Payroll Processing', sub: 'than traditional methods' },
              { value: '100%',      label: 'Calculation Accuracy', sub: 'zero manual errors' },
              { value: 'Instant',    label: 'Report Generation',   sub: 'comprehensive insights' },
              { value: 'End-to-End', label: 'Security ',   sub: 'enterprise-grade safety' },
            ].map((s, i) => (
              <div key={i} className="group">
                <div className="text-3xl lg:text-4xl font-semibold tracking-tight group-hover:scale-105 transition-transform duration-300">{s.value}</div>
                <div className="text-sm font-bold text-[#0F172A] mt-2 uppercase tracking-wider">{s.label}</div>
                <div className="text-xs text-slate-400 font-medium mt-1">{s.sub}</div>
              </div>
            ))}
          </div>
        </div>

      </div>
      {/* ── VIDEO DEMO MODAL ── */}
      {showDemo && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm transition-opacity"
            onClick={() => setShowDemo(false)}
          />
          
          {/* Modal Content */}
          <div className="relative w-full max-w-5xl bg-white rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <div className="flex items-center gap-3 px-2">
                <div className="h-8 w-8 bg-indigo-50 rounded-lg flex items-center justify-center">
                  <Play className="h-4 w-4 text-indigo-600 fill-current" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 leading-none">Ace Payroll Demo</h3>
                  <p className="text-xs text-gray-500 mt-1">Platform Overview</p>
                </div>
              </div>
              <button 
                onClick={() => setShowDemo(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            {/* Video Container (16:9 Aspect Ratio) */}
            <div className="relative w-full pb-[56.25%] bg-slate-900">
              <iframe 
                src="" 
                title="Ace Payroll Demo Video"
                className="absolute inset-0 w-full h-full"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              ></iframe>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Hero;