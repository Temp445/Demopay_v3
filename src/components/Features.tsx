import React from 'react';
import {
  Users, Clock, Calendar, Shield, CreditCard, TrendingUp,
  FileText, MapPin, Camera, UserPlus, Sliders, Zap,
  CheckCircle2, AlertCircle, Map as MapIcon, Settings, Timer, Send, Mail
} from 'lucide-react';

/* ── MODULE DEFINITION ── */
const modules = [
  {
    title: 'Precision Payroll Engine',
    category: 'Payroll',
    icon: CreditCard,
    color: 'indigo',
    desc: 'Take full control of your payroll with a dynamic component master and custom expression-based salary structures.',
    features: [
      'Component Master for custom earnings & deductions',
      'Build structures with custom algebraic expressions',
      'One-click bulk payroll processing',
      'Automated statutory compliance checks',
    ],
    mockup: 'payroll'
  },
  {
    title: 'Smart Attendance',
    category: 'Presence',
    icon: Camera,
    color: 'violet',
    desc: 'Verify presence with face recognition or manual marking. Manage every second of work with advanced timestamping.',
    features: [
      'Face Recognition & Manual Attendance',
      'Timestamp Management for presence & late-ins',
      'Identify employee clock in & clock out',
    ],
    mockup: 'attendance'
  },
  {
    title: 'Workforce & Leave Management',
    category: 'Operations',
    icon: Calendar,
    color: 'blue',
    desc: 'Streamline employee leave requests and permissions with a unified approval dashboard.',
    features: [
      'Configurable Leave Management policies',
      'Multi-level leave approval workflows',
      'Real-time leave balance tracking',
    ],
    mockup: 'workforce'
  },
  {
    title: 'Automated Overtime Engine',
    category: 'Overtime',
    icon: Timer,
    color: 'orange',
    desc: 'Calculate precise overtime payouts with custom OT structures, multi-level approvals, and direct payroll sync.',
    features: [
      'Create custom OT structures with dynamic formulas',
      'Multi-level approval workflows with review limits',
      'Bulk attendance sync for eligible overtime shifts',
      'Direct integration with the final payroll ledger',
    ],
    mockup: 'overtime'
  },
  {
    title: 'Smart Gate Pass',
    category: 'Security',
    icon: MapPin,
    color: 'emerald',
    desc: 'Next-gen security with Normal and Paid gate passes. Monitor live locations for paid field assignments.',
    features: [
      'Normal vs Paid Gate Pass generation',
      'Real-time employee location tracking (Paid Gate)',
      'Field-staff monitoring dashboard',
    ],
    mockup: 'gatepass'
  },
  {
    title: 'Secure Access & Onboarding',
    category: 'Access Control',
    icon: UserPlus,
    color: 'rose',
    desc: 'Seamlessly onboard employees and delegate HR access with secure, role-based invitation workflows.',
    features: [
      'Bulk employee login invitation system',
      'Dedicated HR Team member onboarding',
      'Automated role assignment (Employee vs. HR)',
      'Pre-requisite SMTP configuration checks',
    ],
    mockup: 'invite'
  }
];

/* ── MOCKUP COMPONENTS ── */

const PayrollMockup = () => (
  <div className="bg-white rounded-2xl border border-gray-100 shadow-xl overflow-hidden">
    {/* Page Header */}
    <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
      
      <button className="text-gray-400 hover:text-gray-600"><Settings className="h-4 w-4" /></button>
    </div>
    
    <div className="p-5">
      {/* Expression Editor Modal Simulation */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-lg relative overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center bg-white z-10 relative">
          <span className="text-xs font-black text-[#0F172A]">Build Expression for Earning Component</span>
        </div>
        
        <div className="flex border-b border-gray-100">
          <div className="px-4 py-2 border-b-2 border-indigo-600 text-[9px] font-black text-indigo-600">Variables</div>
          <div className="px-4 py-2 text-[9px] font-bold text-gray-400">Operators</div>
          <div className="px-4 py-2 text-[9px] font-bold text-gray-400">Functions</div>
        </div>

        <div className="flex h-40">
          {/* Variables List */}
          <div className="w-1/3 border-r border-gray-100 p-3 overflow-y-auto bg-gray-50/50">
            <p className="text-[9px] font-black text-slate-400 uppercase mb-2 flex items-center gap-1.5">
               <Sliders className="h-3 w-3" /> Salary Components
            </p>
            <div className="space-y-2 pl-1">
              {['Conveyance', 'HRA', 'Washing Allowance', 'Attendance Bonus', 'Basic'].map(v => (
                <p key={v} className="text-[9px] font-bold text-indigo-600 cursor-pointer">{v}</p>
              ))}
            </div>
          </div>
          
          {/* Editor Area */}
          <div className="w-2/3 p-3 flex flex-col">
            <div className="flex-1 bg-white border border-gray-200 rounded-lg p-2.5 font-mono text-[10px] text-slate-700 leading-relaxed">
              IF (( UnpaidLeaveDays &gt; 0 ) || ( PaidLeaveDays &gt;1)) THEN 0 ELSE Attendance Bonus
            </div>
            
            <div className="mt-3 bg-green-50 border border-green-100 rounded-lg p-2.5">
              <div className="flex items-center gap-1.5 mb-1">
                <CheckCircle2 className="h-3 w-3 text-green-600" />
                <span className="text-[9px] font-black text-green-700">Expression is valid</span>
              </div>
              <p className="text-[8px] text-green-600 font-medium pl-4.5">
                Variables: UNPAIDLEAVEDAYS, PAIDLEAVEDAYS, ATTENDANCE BONUS
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

const AttendanceMockup = () => (
  <div className="bg-white rounded-2xl border border-gray-100 shadow-xl overflow-hidden flex flex-col h-full">
    {/* Clock In Panel */}
    <div className="p-5 border-b border-gray-100">
       <div className="flex items-center justify-between mb-4">
         <div className="flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-indigo-600" />
            <span className="text-[11px] font-black text-[#0F172A]">6:50:48 PM</span>
         </div>
         <div className="flex items-center gap-3">
           <span className="text-[9px] font-bold text-indigo-600">Manual Mode</span>
           <label className="flex items-center gap-1.5 cursor-pointer">
             <div className="w-3.5 h-3.5 bg-indigo-600 rounded flex items-center justify-center">
                 <CheckCircle2 className="h-2.5 w-2.5 text-white" />
             </div>
             <span className="text-[9px] font-medium text-slate-600">Use Face Recognition</span>
           </label>
        
         </div>
       </div>
       <div className="grid grid-cols-2 gap-2">
          <button className="bg-indigo-600 text-white font-bold text-[10px] py-2 rounded-lg flex items-center justify-center gap-1.5">
             <Clock className="h-3 w-3" /> Clock In
          </button>
          <button className="bg-indigo-200 text-indigo-50 font-bold text-[10px] py-2 rounded-lg flex items-center justify-center gap-1.5">
             <Clock className="h-3 w-3" /> Clock Out
          </button>
       </div>
    </div>

    {/* Logs Table */}
    <div className="p-5 bg-gray-50/30 flex-1">
      <div className="flex items-center justify-between mb-3">
         <div>
           <h4 className="text-[11px] font-black text-[#0F172A]">Timestamp Entries</h4>
           <p className="text-[8px] text-slate-500">View all clock in/out entries for the selected date</p>
         </div>
         <div className="flex items-center gap-2">
            <div className="px-2 py-1 bg-white border border-gray-200 rounded flex items-center gap-1.5">
               <Calendar className="h-2.5 w-2.5 text-slate-400" />
               <span className="text-[9px] font-bold text-slate-600">27-03-2026</span>
            </div>
         </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-lg overflow-hidden">
         <div className="grid grid-cols-4 px-3 py-2 border-b border-gray-100 bg-gray-50">
            <span className="text-[8px] font-black text-slate-400 uppercase">Entry Type</span>
            <span className="text-[8px] font-black text-slate-400 uppercase">Timestamp</span>
            <span className="text-[8px] font-black text-slate-400 uppercase">Assigned Shift</span>
            <span className="text-[8px] font-black text-slate-400 uppercase">Timing Status</span>
         </div>
         
         {[
           { type: 'Clock In', time: '11:23:23 AM', date: 'March 27, 2026', shift: 'GS', status: 'Ok', iconColor: 'text-green-500' },
           { type: 'Clock Out', time: '06:42:15 PM', date: 'March 27, 2026', shift: 'GS', status: 'Ok', iconColor: 'text-gray-400' }
         ].map((log, i) => (
            <div key={i} className="grid grid-cols-4 px-3 py-2.5 border-b border-gray-50 items-center">
               <div className="flex items-center gap-1.5">
                  <Clock className={`h-3 w-3 ${log.iconColor}`} />
                  <span className="text-[9px] font-black text-[#0F172A]">{log.type}</span>
               </div>
               <div>
                  <p className="text-[9px] font-medium text-[#0F172A]">{log.time}</p>
                  <p className="text-[7.5px] text-slate-400">{log.date}</p>
               </div>
               <span className="text-[10px] font-black text-slate-600">{log.shift}</span>
               <div>
                   <span className="text-[9px] font-black text-green-600">{log.status}</span>
               </div>
            </div>
         ))}
      </div>
    </div>
  </div>
);

const GatePassMockup = () => (
  <div className="bg-white rounded-2xl border border-gray-100 shadow-xl p-0 overflow-hidden">
    <div className="bg-emerald-600 p-4 text-white">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[9px] font-black text-emerald-200 uppercase tracking-widest">Employee Location Monitor</p>
        <MapIcon className="h-4 w-4" />
      </div>
    </div>
    <div className="h-40 bg-emerald-50 relative flex items-center justify-center">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.1)_0%,transparent_100%)] opacity-50" />
      <div className="h-24 w-24 border border-emerald-200 rounded-full animate-[ping_3s_ease-out_infinite] opacity-30 absolute" />
      <div className="h-12 w-12 bg-emerald-500/20 rounded-full border border-emerald-500 absolute" />
      <div className="h-3.5 w-3.5 bg-emerald-600 rounded-full border-2 border-white shadow-md relative z-10" />
      
      {/* Location card overlay */}
      <div className="absolute bottom-3 inset-x-3 bg-white/95 backdrop-blur-sm rounded-xl p-2.5 border border-emerald-100 shadow-lg z-20">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-[10px] font-black text-slate-700">Ravi G</span>
          <span className="text-[8px] font-black text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded uppercase">Paid Gate Pass</span>
        </div>
        <div className="flex items-center gap-1 text-[8px] text-slate-500">
           <MapPin className="h-2.5 w-2.5" />
           Field Visit · Meeting Client at Site
        </div>
      </div>
    </div>
  </div>
);

const WorkforceMockup = () => (
  <div className="bg-white rounded-2xl border border-gray-100 shadow-xl overflow-hidden flex flex-col">
    {/* Page Header */}
    <div className="px-5 py-4 border-b border-gray-100 bg-white">
      <div className="flex items-center justify-between mb-4">
        <div>
           <h4 className="text-sm font-black text-[#0F172A]">Leave Management</h4>
        </div>
        <div className="flex items-center gap-2">
           <button className="bg-indigo-600 text-white font-bold text-[9px] px-2.5 py-1.5 rounded flex items-center justify-center shadow-sm">
              + Request Leave
           </button>
        </div>
      </div>
      
      {/* Balances */}
      <div className="flex gap-3 mb-4">
         {/* CL Card */}
         <div className="flex-1 border border-gray-100 rounded-lg overflow-hidden shadow-sm">
            <div className="bg-indigo-500 px-2.5 py-1.5 flex justify-between items-center">
               <div className="flex items-center gap-1 text-white">
                  <Calendar className="h-3 w-3" />
                  <span className="text-[9px] font-black">CL</span>
               </div>
               <div className="flex gap-1">
                  <span className="px-1 py-0.5 bg-white text-[7.5px] font-black text-indigo-600 rounded shadow-sm leading-none">Fixed</span>
                  <span className="px-1 py-0.5 bg-amber-100 text-[7.5px] font-black text-amber-700 rounded shadow-sm leading-none">Elapsed</span>
               </div>
            </div>
            <div className="p-3 bg-white">
               <p className="text-lg font-black text-[#0F172A] leading-none mb-1">11 <span className="text-[9px] font-bold text-slate-400">/ 12 days</span></p>
               <p className="text-[8px] font-medium text-slate-400 mb-2">Used: 1 days</p>
               <div className="h-1 bg-indigo-50 rounded-full mb-1.5 overflow-hidden">
                  <div className="h-full bg-indigo-500 rounded-full" style={{ width: '92%' }}></div>
               </div>
               <p className="text-[8px] font-bold text-indigo-500">→ 12 days / yearly</p>
            </div>
         </div>
         {/* ML Card Placeholder */}
         <div className="flex-1 border border-gray-100 rounded-lg overflow-hidden shadow-sm opacity-60">
            <div className="bg-indigo-500 px-2.5 py-1.5 flex justify-between items-center">
               <div className="flex items-center gap-1 text-white">
                  <Calendar className="h-3 w-3" />
                  <span className="text-[9px] font-black">ML</span>
               </div>
               <div className="flex gap-1">
                  <span className="px-1 py-0.5 bg-white text-[7.5px] font-black text-indigo-600 rounded shadow-sm leading-none">Fixed</span>
               </div>
            </div>
            <div className="p-3 bg-white">
               <p className="text-lg font-black text-[#0F172A] leading-none mb-1">10 <span className="text-[9px] font-bold text-slate-400">/ 0 days</span></p>
               <p className="text-[8px] font-medium text-slate-400 mb-2">Used: 10 days</p>
               <div className="h-1 bg-gray-100 rounded-full mb-1.5"></div>
               <p className="text-[8px] font-bold text-slate-400">→ 10 days / yearly</p>
            </div>
         </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-4">
         <span className="text-[10px] font-bold text-indigo-600 border-b-2 border-indigo-600 pb-1.5">Leave Requests</span>
         <span className="text-[10px] font-bold text-slate-400 pb-1.5">Absentee List</span>
      </div>
    </div>
    
    <div className="p-4 space-y-3 flex-1 bg-gray-50/30">
      {/* Approved Leave */}
      <div className="flex items-start justify-between bg-white p-3.5 rounded-xl border border-gray-100 shadow-sm">
         <div className="flex gap-2.5">
            <div className="mt-0.5">
               <Calendar className="h-3.5 w-3.5 text-slate-400" />
            </div>
            <div>
               <p className="text-[10px] font-black text-[#0F172A]">Arun D <span className="font-medium text-slate-400">: CL</span></p>
               <p className="text-[9px] text-slate-500 my-0.5">From: 4/13/2026<span className="mx-2 text-transparent">~</span>To: 4/13/2026</p>
               <p className="text-[9px] text-slate-500">Reason: <span className="text-slate-600">Personal Reason</span></p>
            </div>
         </div>
         <div className="flex flex-col items-end gap-1.5">
            <span className="text-[9px] font-black px-2.5 py-1 rounded-full bg-green-50 text-green-700">Approved</span>
            <div className="flex items-center gap-1.5 mt-0.5">
            </div>
         </div>
      </div>
    </div>
  </div>
);

const OvertimeMockup = () => (
  <div className="bg-white rounded-2xl border border-gray-100 shadow-xl overflow-hidden flex flex-col h-full">
    <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
      <h4 className="text-sm font-black text-[#0F172A]">Overtime</h4>
      <div className="flex items-center gap-2">
         <span className="text-[9px] font-black text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-1 rounded">Process Payroll</span>
      </div>
    </div>

    <div className="p-5 bg-gray-50/30 flex-1">
      <div className="bg-white border border-gray-100 rounded-lg overflow-hidden">
         <div className="grid grid-cols-[2fr_1fr_1fr_1.5fr] px-3 py-2 border-b border-gray-100 bg-gray-50">
            <span className="text-[8px] font-black text-slate-400 uppercase">Employee</span>
            <span className="text-[8px] font-black text-slate-400 uppercase">Duration</span>
            <span className="text-[8px] font-black text-slate-400 uppercase">Amount</span>
            <span className="text-[8px] font-black text-slate-400 uppercase">Status</span>
         </div>
         
         {[
           { name: 'Arun T', dept: 'Software Project', duration: '2h 30m', amount: '₹450', status: 'Pending' },
           { name: 'Ravi G', dept: 'Operations', duration: '1h 15m', amount: '₹225', status: 'Approved' }
         ].map((row, i) => (
            <div key={i} className="grid grid-cols-[2fr_1fr_1fr_1.5fr] px-3 py-2.5 border-b border-gray-50 items-center">
               <div>
                  <p className="text-[10px] font-black text-[#0F172A]">{row.name}</p>
                  <p className="text-[8px] font-medium text-slate-400">{row.dept}</p>
               </div>
               <span className="text-[9px] font-black text-slate-600">{row.duration}</span>
               <span className="text-[9px] font-black text-indigo-600">{row.amount}</span>
               <div className="flex items-center justify-between">
                   <span className={`text-[8px] font-black px-2 py-0.5 rounded-full border ${row.status === 'Approved' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                     {row.status}
                   </span>
                   {row.status === 'Pending' && (
                     <div className="h-5 w-5 bg-green-50 rounded flex items-center justify-center cursor-pointer border border-green-100">
                        <CheckCircle2 className="h-3 w-3 text-green-600" />
                     </div>
                   )}
               </div>
            </div>
         ))}
      </div>
      <div className="mt-3 bg-indigo-50 border border-indigo-100 rounded-lg p-3 flex items-center gap-2">
         <div className="h-8 w-8 bg-white border border-indigo-100 shadow-sm rounded-lg flex items-center justify-center flex-shrink-0">
            <Timer className="h-4 w-4 text-indigo-600" />
         </div>
         <div>
            <p className="text-[10px] font-black text-indigo-700">Link with OT Process</p>
            <p className="text-[8.5px] font-bold text-indigo-500">Validation ensures all OT is processed before final payroll</p>
         </div>
      </div>
    </div>
  </div>
);

const InviteMockup = () => (
  <div className="bg-white rounded-2xl border border-gray-100 shadow-xl overflow-hidden flex flex-col h-full bg-gray-50/30">
    <div className="px-5 py-4 border-b border-gray-100 bg-white flex items-center gap-3">
      <div className="h-8 w-8 bg-indigo-50 rounded-lg flex items-center justify-center">
        <UserPlus className="h-4 w-4 text-indigo-600" />
      </div>
      <div>
        <h4 className="text-sm font-black text-[#0F172A]">Employee Invite</h4>
        <p className="text-[9px] text-slate-500 font-medium mt-0.5">Send login invitations to employees and HR team members</p>
      </div>
    </div>
    
    <div className="p-4 flex gap-4 h-full">
      {/* Employee Invitations */}
      <div className="w-1/2 border border-gray-100 bg-white rounded-xl p-3.5 flex flex-col shadow-sm">
        <div className="flex items-center gap-1.5 mb-2.5">
          <Users className="h-3.5 w-3.5 text-indigo-600" /> 
          <h5 className="text-[10px] font-black text-[#0F172A]">Employee Invitations</h5>
        </div>
        <div className="border border-indigo-500 rounded-md p-1.5 mb-3 flex items-center shadow-[0_0_0_2px_rgba(99,102,241,0.1)]">
           <span className="text-[9px] text-slate-700 pl-1 font-medium">user|</span>
        </div>
        <div className="flex-1 space-y-3 mb-4">
           <div className="flex items-center gap-2">
              <div className="w-3.5 h-3.5 bg-indigo-600 rounded flex items-center justify-center shadow-sm">
                 <CheckCircle2 className="w-2.5 h-2.5 text-white" />
              </div>
              <div className="leading-tight">
                 <p className="text-[9px] font-black text-[#0F172A]">user-1</p>
                 <p className="text-[7.5px] font-medium text-slate-500 mt-0.5">user@gmail.com</p>
              </div>
           </div>
           <div className="flex items-center gap-2 opacity-50">
              <div className="w-3.5 h-3.5 border border-gray-300 rounded" />
              <div className="leading-tight">
                 <p className="text-[9px] font-black text-[#0F172A]">user-2</p>
                 <p className="text-[7.5px] font-medium text-slate-500 mt-0.5">user2@gmail.com</p>
              </div>
           </div>
        </div>
        <button className="w-full bg-indigo-600 hover:bg-indigo-700 transition-colors text-white font-bold text-[9px] py-2 rounded-lg flex items-center justify-center gap-1.5 mt-auto shadow-sm">
           <Send className="h-3 w-3" /> Send Invites (1)
        </button>
      </div>

      {/* HR Team Invitation */}
      <div className="w-1/2 border border-gray-100 bg-white rounded-xl p-3.5 flex flex-col shadow-sm">
        <div className="flex items-center gap-1.5 mb-3">
          <Mail className="h-3.5 w-3.5 text-indigo-600" /> 
          <h5 className="text-[10px] font-black text-[#0F172A]">HR Team Invitation</h5>
        </div>
        <div className="space-y-3 mb-3">
           <div>
              <p className="text-[8px] font-bold text-slate-600 mb-1">Name <span className="text-red-500">*</span></p>
              <div className="border border-gray-200 rounded-md p-1.5 text-[8px] text-slate-400 font-medium bg-gray-50/50">Enter full name</div>
           </div>
           <div>
              <p className="text-[8px] font-bold text-slate-600 mb-1">Email Address <span className="text-red-500">*</span></p>
              <div className="border border-gray-200 rounded-md p-1.5 text-[8px] text-slate-400 font-medium bg-gray-50/50">Enter email address</div>
           </div>
        </div>
        <div className="bg-blue-50/80 border border-blue-100 rounded-lg p-2.5 mb-4">
           <p className="text-[8px] font-bold text-blue-800 flex items-center gap-1 mb-1.5">
             <AlertCircle className="h-2.5 w-2.5" /> Important:
           </p>
           <ul className="text-[7.5px] text-blue-700 list-disc pl-3.5 space-y-1 font-medium leading-tight">
             <li>Sent to the email address provided</li>
             <li>Recipient has 1 day to accept</li>
             <li>Receives "HR Team" role upon login</li>
           </ul>
        </div>
        <button className="w-full bg-indigo-600 hover:bg-indigo-700 transition-colors text-white font-bold text-[9px] py-2 rounded-lg flex items-center justify-center gap-1.5 mt-auto shadow-sm">
           <Send className="h-3 w-3" /> Send Invite
        </button>
      </div>
    </div>
  </div>
);

const MOCKUP_MAP: Record<string, React.ReactNode> = {
  payroll: <PayrollMockup />,
  attendance: <AttendanceMockup />,
  gatepass: <GatePassMockup />,
  workforce: <WorkforceMockup />,
  overtime: <OvertimeMockup />,
  invite: <InviteMockup />
};

/* ── COLOR MAP ── */
const colorMap: Record<string, { bg: string; text: string; border: string; iconBg: string }> = {
  indigo: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-100', iconBg: 'bg-indigo-600' },
  violet: { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-100', iconBg: 'bg-violet-600' },
  blue:   { bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-100',   iconBg: 'bg-blue-600' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-100', iconBg: 'bg-emerald-600' },
  orange: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-100', iconBg: 'bg-orange-600' },
  rose:   { bg: 'bg-rose-50',   text: 'text-rose-700',   border: 'border-rose-100',   iconBg: 'bg-rose-600' }
};


const Features = () => {
  return (
    <div id="features" className="bg-white py-20 relative overflow-hidden">
      
      {/* ── SECTION HEADER ── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-20 text-center">
        <p className="text-xs font-black text-indigo-600 uppercase tracking-[0.3em] mb-4">Features </p>
        <h2 className="text-4xl lg:text-5xl font-black text-[#0F172A] tracking-tight mb-6">
          Everything You Need to Manage<br />
          <span className="text-indigo-600">Growth-Scale Workforce.</span>
        </h2>
        <div className="h-1.5 w-24 bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full mx-auto" />
      </div>

      {/* ── MODULE LIST ── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-32">
        {modules.map((mod, idx) => {
          const colors = colorMap[mod.color];
          const isReversed = idx % 2 !== 0;

          return (
            <div key={idx} className={`flex flex-col lg:flex-row items-center gap-16 ${isReversed ? 'lg:flex-row-reverse' : ''}`}>
              
              {/* CONTENT SIDE */}
              <div className="w-full lg:w-1/2">
                <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-widest mb-6 ${colors.bg} ${colors.text} ${colors.border}`}>
                  <mod.icon className="h-3.5 w-3.5" />
                  {mod.category}
                </div>
                <h3 className="text-3xl lg:text-4xl font-black text-[#0F172A] mb-5 leading-[1.1] tracking-tight italic">
                  {mod.title}
                </h3>
                <p className="text-base text-slate-500 mb-8 max-w-lg leading-relaxed font-medium">
                  {mod.desc}
                </p>
                <ul className="space-y-4">
                  {mod.features.map((f, fi) => (
                    <li key={fi} className="flex items-start gap-4">
                      <div className={`h-5 w-5 rounded-full flex items-center justify-center flex-shrink-0 bg-white border ${colors.border} shadow-sm`}>
                        <CheckCircle2 className={`h-3 w-3 ${colors.text}`} />
                      </div>
                      <span className="text-sm font-bold text-slate-600 leading-tight">
                        {f}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* MOCKUP SIDE */}
              <div className="w-full lg:w-1/2">
                <div className={`relative p-8 rounded-[40px] bg-gradient-to-br from-slate-50 to-white border border-slate-200/60 shadow-2xl overflow-hidden group`}>
                   {/* Background aura */}
                   <div className={`absolute -top-24 -right-24 w-64 h-64 ${colors.bg} rounded-full blur-[80px] opacity-40 group-hover:opacity-60 transition-opacity`} />
                   <div className="relative z-10 transition-transform duration-500 group-hover:scale-[1.02]">
                     {MOCKUP_MAP[mod.mockup]}
                   </div>
                </div>
              </div>

            </div>
          );
        })}
      </div>

      {/* ── FINAL CTA STRIP ── */}
      <div className="max-w-7xl mx-auto px-4 mt-32 sm:px-6 lg:px-8">
        <div className="bg-[#0F172A] rounded-[32px] p-12 text-center relative overflow-hidden shadow-2xl">
          <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_0%,rgba(99,102,241,0.15),transparent)] pointer-events-none" />
          <h2 className="text-3xl font-black text-white mb-4">Ready to automate your operations?</h2>
          <p className="text-slate-400 text-sm max-w-lg mx-auto mb-8">
            Join the payroll teams using our unified attendance, leaves, and processing engine to save 100+ hours monthly.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a href='#contact' className="px-8 py-3.5 bg-indigo-600 text-white font-bold text-sm rounded-xl hover:bg-indigo-700 transition-colors shadow-lg">Request Custom Demo</a>
            <a href='#pricing' className="px-8 py-3.5 bg-white/5 text-white font-bold text-sm rounded-xl border border-white/10 hover:bg-white/10 transition-colors">View Pricing</a>
          </div>
        </div>
      </div>

    </div>
  );
};

export default Features;
