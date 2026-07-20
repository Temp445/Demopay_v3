import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Search, Calendar, CheckCircle2, AlertCircle, RefreshCw, Send, ShieldCheck, Check, HelpCircle, FileText, ArrowRight, Download, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../../../lib/supabase';
import { useTenant } from '../../../contexts/TenantContext';
import { usePayrollStore } from '../../../stores/payrollStore';
import { useEmployeesStore } from '../../../stores/employeesStore';
import { sendPayslipEmail, generatePayslipHtmlString } from '../../../lib/payslipEmailSender';
import { useSettingsStore } from '../../../stores/settingsStore';

interface EmailLogEntry {
  id: string;
  subject: string;
  body_html: string;
  recipients: any;
  status: 'sent' | 'failed' | 'queued';
  sent_at: string;
  error_message?: string;
}

export default function PayslipSender() {
  const navigate = useNavigate();
  const { currentTenant } = useTenant();
  const { items: payrollEntries, fetchPayrollEntries, loading: payrollLoading } = usePayrollStore();
  const { items: employees, fetchEmployees, loading: employeesLoading } = useEmployeesStore();

  // State
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  });
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedEmpIds, setSelectedEmpIds] = useState<string[]>([]);
  const { companySettings, fetchCompanySettings, updateCompanySettings } = useSettingsStore();
  const autoSendEnabled = (companySettings as any)?.enable_send_payslip_on_mark_paid ?? false;
  const [isSending, setIsSending] = useState<boolean>(false);
  const [sendingProgress, setSendingProgress] = useState<{ total: number; current: number; success: number; failed: number } | null>(null);
  const [emailLogs, setEmailLogs] = useState<EmailLogEntry[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState<boolean>(false);
  const [empDispatchStatus, setEmpDispatchStatus] = useState<{
    [empId: string]: {
      status: 'sending' | 'success' | 'error';
      progress: number;
      message?: string;
    };
  }>({});

  // User ID
  const [currentUserId, setCurrentUserId] = useState<string>('');
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session?.user?.id) {
        setCurrentUserId(data.session.user.id);
      }
    });
  }, []);

  // Fetch Data on Mount & Month Change
  useEffect(() => {
    if (!currentTenant?.id) return;
    fetchEmployees();
    fetchCompanySettings();
  }, [currentTenant?.id, fetchEmployees, fetchCompanySettings]);

  useEffect(() => {
    if (!currentTenant?.id || !selectedMonth) return;
    const [year, month] = selectedMonth.split('-').map(Number);
    const startStr = `${selectedMonth}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endStr = `${selectedMonth}-${String(lastDay).padStart(2, '0')}`;
    
    fetchPayrollEntries(startStr, endStr);
    fetchLogs();
  }, [currentTenant?.id, selectedMonth]);

  // Fetch Recent Email Logs
  const fetchLogs = async (silent = false) => {
    if (!currentTenant?.id) return;
    if (!silent) setIsLoadingLogs(true);
    try {
      const { data, error } = await supabase
        .from('payslip_email_sender_logs')
        .select('id, subject, body_html, recipients, status, sent_at, error_message')
        .eq('tenant_id', currentTenant.id)
        .like('subject', '%Payslip%')
        .order('sent_at', { ascending: false })
        .limit(200);

      if (error) {
        console.error('Error fetching email logs:', error);
      } else {
        setEmailLogs(data || []);
      }
    } catch (err) {
      console.error('Unexpected error fetching logs:', err);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  // Toggle Auto Send
  const handleToggleAutoSend = async (checked: boolean) => {
    try {
      await updateCompanySettings({ enable_send_payslip_on_mark_paid: checked });
      toast.success(checked ? 'Automated payslip dispatch enabled' : 'Automated payslip dispatch disabled');
    } catch (err) {
      toast.error('Failed to update payslip auto-send setting');
    }
  };

  // Process and Filter Employee List
  const activeEmployees = useMemo(() => {
    return employees.filter(emp => emp.status === 'Active' || emp.status === 'Rejoin');
  }, [employees]);

  const employeeRows = useMemo(() => {
    return activeEmployees.map(emp => {
      // Find matching payroll entry
      const entry = payrollEntries.find(p => p.employee_id === emp.id);
      const isEligible = entry && (entry.status === 'Approved' || entry.status === 'Paid');
      
      return {
        employee: emp,
        payrollEntry: entry,
        isEligible: !!isEligible,
        status: entry?.status || 'Not Processed'
      };
    }).filter(row => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      const code = row.employee.employee_code?.toLowerCase() || '';
      const name = row.employee.name.toLowerCase();
      const email = row.employee.email.toLowerCase();
      return code.includes(q) || name.includes(q) || email.includes(q);
    });
  }, [activeEmployees, payrollEntries, searchQuery, statusFilter]);

  // Eligible count
  const eligibleRows = useMemo(() => employeeRows.filter(r => r.isEligible), [employeeRows]);

  // Filtered Email Logs
  const [logStatusFilter, setLogStatusFilter] = useState<'all' | 'sent' | 'failed'>('all');
  const [logSearchQuery, setLogSearchQuery] = useState<string>('');
  const [selectedLogIds, setSelectedLogIds] = useState<string[]>([]);
  const [isDeletingLogs, setIsDeletingLogs] = useState<boolean>(false);
  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);

  const filteredEmailLogs = useMemo(() => {
    return emailLogs.filter(log => {
      if (logStatusFilter !== 'all' && log.status !== logStatusFilter) return false;
      if (!logSearchQuery) return true;
      const q = logSearchQuery.toLowerCase();
      const subject = log.subject?.toLowerCase() || '';
      const email = log.recipients?.to?.toLowerCase() || '';
      const matchingEmp = employees.find(e => e.email?.toLowerCase() === email);
      const name = matchingEmp?.name?.toLowerCase() || '';
      const code = matchingEmp?.employee_code?.toLowerCase() || '';
      return subject.includes(q) || email.includes(q) || name.includes(q) || code.includes(q);
    });
  }, [emailLogs, logStatusFilter, logSearchQuery, employees]);

  // Roster Pagination State
  const [rosterPage, setRosterPage] = useState<number>(1);
  const [rosterPerPage, setRosterPerPage] = useState<number>(15);

  useEffect(() => {
    setRosterPage(1);
  }, [searchQuery, statusFilter]);

  const paginatedEmployeeRows = useMemo(() => {
    const start = (rosterPage - 1) * rosterPerPage;
    return employeeRows.slice(start, start + rosterPerPage);
  }, [employeeRows, rosterPage, rosterPerPage]);

  const totalRosterPages = Math.ceil(employeeRows.length / rosterPerPage) || 1;

  // Logs Pagination State
  const [logPage, setLogPage] = useState<number>(1);
  const logPerPage = 10;

  useEffect(() => {
    setLogPage(1);
  }, [logSearchQuery, logStatusFilter]);

  const paginatedEmailLogs = useMemo(() => {
    const start = (logPage - 1) * logPerPage;
    return filteredEmailLogs.slice(start, start + logPerPage);
  }, [filteredEmailLogs, logPage, logPerPage]);

  const totalLogPages = Math.ceil(filteredEmailLogs.length / logPerPage) || 1;

  const handleSelectAllLogs = () => {
    if (selectedLogIds.length === filteredEmailLogs.length && filteredEmailLogs.length > 0) {
      setSelectedLogIds([]);
    } else {
      setSelectedLogIds(filteredEmailLogs.map(l => l.id));
    }
  };

  const handleBulkDeleteLogs = async () => {
    if (selectedLogIds.length === 0 || !currentTenant?.id) return;
    setIsDeletingLogs(true);
    try {
      const { error } = await supabase
        .from('payslip_email_sender_logs')
        .delete()
        .in('id', selectedLogIds)
        .eq('tenant_id', currentTenant.id);

      if (error) {
        toast.error('Failed to delete selected logs');
      } else {
        toast.success(`Successfully deleted ${selectedLogIds.length} log(s)`);
        setSelectedLogIds([]);
        setShowDeleteModal(false);
        fetchLogs(true);
      }
    } catch (e) {
      toast.error('Error deleting logs');
    } finally {
      setIsDeletingLogs(false);
    }
  };

  // Handle Select All
  const handleSelectAll = () => {
    if (selectedEmpIds.length === eligibleRows.length) {
      setSelectedEmpIds([]);
    } else {
      setSelectedEmpIds(eligibleRows.map(r => r.employee.id));
    }
  };

  // Handle Select Single
  const handleSelectOne = (id: string) => {
    setSelectedEmpIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  // Batch Send Action
  const handleBatchSend = async () => {
    if (!currentTenant?.id) {
      toast.error('Tenant context missing');
      return;
    }
    if (selectedEmpIds.length === 0) {
      toast.error('Please select at least one eligible employee');
      return;
    }

    const targetRows = eligibleRows.filter(r => selectedEmpIds.includes(r.employee.id) && r.payrollEntry);
    if (targetRows.length === 0) return;

    setIsSending(true);
    setSendingProgress({ total: targetRows.length, current: 0, success: 0, failed: 0 });

    let successCount = 0;
    let failCount = 0;

    setEmpDispatchStatus(prev => {
      const next = { ...prev };
      targetRows.forEach(r => {
        next[r.employee.id] = { status: 'sending', progress: 15, message: 'Generating & sending...' };
      });
      return next;
    });

    const progressTimer = setInterval(() => {
      setEmpDispatchStatus(prev => {
        let changed = false;
        const next = { ...prev };
        Object.keys(next).forEach(empId => {
          if (next[empId].status === 'sending' && next[empId].progress < 90) {
            next[empId] = { ...next[empId], progress: next[empId].progress + 15 };
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }, 400);

    // High-speed parallel dispatch in chunks of 15 to process 100-200 employees in 5-10 seconds
    const CHUNK_SIZE = 15;
    for (let i = 0; i < targetRows.length; i += CHUNK_SIZE) {
      const chunk = targetRows.slice(i, i + CHUNK_SIZE);

      const results = await Promise.all(
        chunk.map(async (row) => {
          const empId = row.employee.id;
          if (row.payrollEntry) {
            try {
              const res = await sendPayslipEmail(row.payrollEntry, currentTenant.id, currentUserId);
              setEmpDispatchStatus(prev => ({
                ...prev,
                [empId]: res.success
                  ? { status: 'success', progress: 100, message: 'Sent Successfully' }
                  : { status: 'error', progress: 100, message: res.error || 'Delivery Failed' }
              }));
              if (res.success) {
                setTimeout(() => {
                  setEmpDispatchStatus(prev => {
                    const next = { ...prev };
                    delete next[empId];
                    return next;
                  });
                }, 3000);
              }
              return res;
            } catch (e) {
              setEmpDispatchStatus(prev => ({
                ...prev,
                [empId]: { status: 'error', progress: 100, message: e instanceof Error ? e.message : 'Unknown error' }
              }));
              return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
            }
          }
          return { success: false };
        })
      );

      const successes = results.filter(r => r.success).length;
      const failures = results.length - successes;
      successCount += successes;
      failCount += failures;

      const currentProgress = Math.min(i + CHUNK_SIZE, targetRows.length);
      setSendingProgress({ total: targetRows.length, current: currentProgress, success: successCount, failed: failCount });
    }

    clearInterval(progressTimer);

    setIsSending(false);
    fetchLogs(true);
    setSelectedEmpIds([]);

    if (failCount === 0) {
      toast.success(`Successfully dispatched ${successCount} payslip(s)!`);
    } else if (successCount > 0) {
      toast.success(`Dispatched ${successCount} payslips (${failCount} failed). Check logs for details.`);
    } else {
      toast.error(`Failed to dispatch payslips. Please check recipient email addresses.`);
    }
  };

  // Formatted month title
  const monthTitle = useMemo(() => {
    if (!selectedMonth) return '';
    const [y, m] = selectedMonth.split('-').map(Number);
    const date = new Date(y, m - 1, 1);
    return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  }, [selectedMonth]);

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* Header Section */}
      <div className="relative overflow-hidden  text-slate-900 ">
        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">Payslip Sender</h1>
            <p className="mt-2 text-slate-600 max-w-2xl text-sm sm:text-base leading-relaxed">
              Securely dispatch payslips to employees via email. Enable automated dispatch or batch send manually by pay period.
            </p>
          </div>
        </div>
      </div>

      {/* Auto Send Toggle Banner */}
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200/80 p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-2 h-full bg-indigo-600" />
        <div className="flex items-start sm:items-center gap-4">
          
          <div>
            <h3 className="text-lg font-bold text-slate-900">Automated Payslip Dispatch</h3>
            <p className="text-sm text-slate-500 mt-1 max-w-3xl">
              When enabled, you mark any payroll entry as <span className="font-semibold text-emerald-600">Paid</span> will automatically send the payslip to the employee's email.
            </p>
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-3 self-end sm:self-center">
          <span className={`text-sm font-bold ${autoSendEnabled ? 'text-indigo-600' : 'text-slate-400'}`}>
            {autoSendEnabled ? 'Enabled (Active)' : 'Disabled'}
          </span>
          <button
            onClick={() => handleToggleAutoSend(!autoSendEnabled)}
            className={`relative inline-flex h-7 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none shadow-inner ${
              autoSendEnabled ? 'bg-indigo-600' : 'bg-slate-300'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                autoSendEnabled ? 'translate-x-7' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Filter and Controls Toolbar */}
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200/80 p-6 space-y-6">
        <div className="border-b border-slate-100 pb-4">
          <h2 className="text-xl font-bold text-slate-900">Manually Sending Payslips to Employees</h2>
          <p className="text-sm text-slate-500 mt-1">Select a pay period, filter employees, and batch dispatch payslip emails.</p>
        </div>
        <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-6">
          <div className="grid grid-cols-1 md:grid-cols-3 items-end gap-4 flex-1">
            {/* Pay Period Selector */}
            <div className="w-full">
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Select Pay Period</label>
              <div className="relative flex items-center">
                <Calendar className="absolute left-3.5 h-5 w-5 text-indigo-500 pointer-events-none" />
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => {
                    setSelectedMonth(e.target.value);
                    setSelectedEmpIds([]);
                  }}
                  className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:bg-white transition-all shadow-sm cursor-pointer"
                />
              </div>
            </div>


            {/* Search Bar */}
            <div className="w-full">
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Filter Employees</label>
              <div className="relative flex items-center">
                <Search className="absolute left-3.5 h-5 w-5 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search by name, code or email ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:bg-white transition-all shadow-sm"
                />
              </div>
            </div>
          </div>

          {/* Action Batch Buttons */}
          <div className="flex flex-wrap items-center gap-3 pt-4 xl:pt-0">
            <button
              onClick={handleSelectAll}
              disabled={eligibleRows.length === 0 || isSending}
              className="px-4 py-2.5 rounded-xl border border-slate-300 font-semibold text-sm text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {selectedEmpIds.length === eligibleRows.length && eligibleRows.length > 0 ? (
                <>Deselect All</>
              ) : (
                <>Select All Eligible ({eligibleRows.length})</>
              )}
            </button>

            <button
              onClick={handleBatchSend}
              disabled={selectedEmpIds.length === 0 || isSending}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 text-white font-bold text-sm shadow-xl shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:from-indigo-500 hover:to-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2.5 active:scale-95"
            >
              {isSending ? (
                <RefreshCw className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
              {isSending ? (
                <span>Sending ({sendingProgress?.current || 0}/{sendingProgress?.total || 0})...</span>
              ) : (
                <span>Send Payslips to Selected ({selectedEmpIds.length})</span>
              )}
            </button>
          </div>
        </div>

        {/* Sending Progress Bar if Active */}
        {isSending && sendingProgress && (
          <div className="bg-indigo-50 rounded-2xl p-6 border border-indigo-100 space-y-3 animate-pulse">
            <div className="flex justify-between items-center text-sm font-bold text-indigo-900">
              <span>Dispatching payslip emails for {monthTitle}...</span>
              <span>{Math.round((sendingProgress.current / sendingProgress.total) * 100)}% ({sendingProgress.current}/{sendingProgress.total})</span>
            </div>
            <div className="w-full bg-indigo-200 h-3 rounded-full overflow-hidden">
              <div
                className="bg-indigo-600 h-full transition-all duration-300 rounded-full"
                style={{ width: `${(sendingProgress.current / sendingProgress.total) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Employee List Table */}
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200/80 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
          <h2 className="font-bold text-slate-800 text-base">Employees ({monthTitle})</h2>
          <div className="flex gap-4 items-center">
          {/* Status Filter */}
            <div className="w-fit">
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setSelectedEmpIds([]);
                }}
                className="w-full pl-3 pr-6 py-2 rounded-lg text-sm border border-slate-300 bg-slate-50 text-slate-800  focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:bg-white transition-all shadow-sm cursor-pointer"
              >
                <option value="all">All Statuses</option>
                <option value="Paid">Paid</option>
                {/* <option value="Approved">Approved</option> */}
                {/* <option value="Pending Approval">Pending Approval</option> */}
                <option value="Draft">Draft</option>
                <option value="Not Processed">Not Processed</option>
              </select>
            </div>
          <span className="text-xs font-semibold text-slate-500">
            Showing {employeeRows.length} employee(s) | {eligibleRows.length} eligible
          </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-100/75 border-b border-slate-200 text-xs font-bold uppercase tracking-wider text-slate-600">
                <th className="py-3.5 px-6 w-12 text-center">
                  <input
                    type="checkbox"
                    checked={selectedEmpIds.length === eligibleRows.length && eligibleRows.length > 0}
                    onChange={handleSelectAll}
                    disabled={eligibleRows.length === 0 || isSending}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer disabled:opacity-40"
                  />
                </th>
                <th className="py-3.5 px-6">Employee ID</th>
                <th className="py-3.5 px-6">Name</th>
                <th className="py-3.5 px-6">Email</th>
                <th className="py-3.5 px-6">Department</th>
                <th className="py-3.5 px-6 text-center">Payroll Status</th>
                <th className="py-3.5 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-sm">
              {payrollLoading || employeesLoading ? (
                <tr>
                  <td colSpan={7} className="text-center py-12">
                    <RefreshCw className="h-8 w-8 animate-spin text-indigo-600 mx-auto" />
                    <p className="mt-3 text-slate-500 font-semibold text-sm">Loading employee roster & payroll status...</p>
                  </td>
                </tr>
              ) : employeeRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-500">
                    <FileText className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                    <p className="font-bold text-base text-slate-700">No employees found</p>
                    <p className="text-xs text-slate-400 mt-1">Try adjusting your search criteria or checking employee status.</p>
                  </td>
                </tr>
              ) : (
                paginatedEmployeeRows.map(row => {
                  const isSelected = selectedEmpIds.includes(row.employee.id);

                  return (
                    <tr
                      key={row.employee.id}
                      className={`hover:bg-indigo-50/30 transition-colors ${
                        isSelected ? 'bg-indigo-50/50' : ''
                      } ${!row.isEligible ? 'opacity-85 bg-slate-50/30' : ''}`}
                    >
                      <td className="py-4 px-6 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleSelectOne(row.employee.id)}
                          disabled={!row.isEligible || isSending}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer disabled:opacity-40"
                        />
                      </td>
                      <td className="py-4 px-6 font-bold text-slate-900">{row.employee.employee_code || '-'}</td>
                      <td className="py-4 px-6">
                        <div className="font-bold text-slate-900">{row.employee.name}</div>
                        <div className="text-xs text-slate-500 font-normal">{row.employee.role || 'Employee'}</div>
                        
                        {/* Inline Per-Employee Progress & Status under Name */}
                        {empDispatchStatus[row.employee.id] && (
                          <div className="mt-2.5 pt-2 border-t border-slate-100 max-w-xs animate-fadeIn">
                            <div className="flex items-center justify-between text-[11px] font-bold mb-1.5">
                              <span className={`flex items-center gap-1.5 ${
                                empDispatchStatus[row.employee.id].status === 'success' ? 'text-emerald-600' :
                                empDispatchStatus[row.employee.id].status === 'error' ? 'text-rose-600' : 'text-indigo-600'
                              }`}>
                                {empDispatchStatus[row.employee.id].status === 'sending' && <RefreshCw className="h-3 w-3 animate-spin text-indigo-500 inline" />}
                                {empDispatchStatus[row.employee.id].status === 'success' && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 inline" />}
                                {empDispatchStatus[row.employee.id].status === 'error' && <AlertCircle className="h-3.5 w-3.5 text-rose-500 inline" />}
                                {empDispatchStatus[row.employee.id].message || (empDispatchStatus[row.employee.id].status === 'sending' ? 'Sending Payslip...' : '')}
                              </span>
                              <span className={`font-extrabold ${
                                empDispatchStatus[row.employee.id].status === 'success' ? 'text-emerald-600' :
                                empDispatchStatus[row.employee.id].status === 'error' ? 'text-rose-600' : 'text-indigo-600'
                              }`}>{empDispatchStatus[row.employee.id].progress}%</span>
                            </div>
                            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden shadow-inner">
                              <div 
                                className={`h-full rounded-full transition-all duration-300 ${
                                  empDispatchStatus[row.employee.id].status === 'success' ? 'bg-emerald-500 shadow-emerald-500/50' :
                                  empDispatchStatus[row.employee.id].status === 'error' ? 'bg-rose-500 shadow-rose-500/50' :
                                  'bg-gradient-to-r from-indigo-500 to-violet-600 animate-pulse'
                                }`}
                                style={{ width: `${empDispatchStatus[row.employee.id].progress}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-6 text-slate-600">{row.employee.email || <span className="text-amber-600 text-xs italic font-semibold">No Email Provided</span>}</td>
                      <td className="py-4 px-6">
                        <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-semibold text-xs">
                          {row.employee.department || 'General'}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-center">
                        {row.isEligible ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-xs">
                            <Check className="h-3 w-3" /> {row.status}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-bold text-xs">
                            <AlertCircle className="h-3 w-3" /> {row.status === 'Not Processed' ? 'Payroll Not Processed' : row.status}
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-6 text-right">
                        {row.isEligible ? (
                          <div className="flex items-center justify-end gap-2">
                            {/* <button
                              onClick={async () => {
                                if (!row.payrollEntry || !currentTenant?.id) return;
                                try {
                                  const { html, filename } = await generatePayslipHtmlString(row.payrollEntry, currentTenant.id);
                                  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
                                  const url = URL.createObjectURL(blob);
                                  const a = document.createElement('a');
                                  a.href = url;
                                  a.download = filename;
                                  document.body.appendChild(a);
                                  a.click();
                                  document.body.removeChild(a);
                                  URL.revokeObjectURL(url);
                                  toast.success(`Downloaded ${filename}`);
                                } catch (e) {
                                  toast.error('Failed to generate downloadable payslip');
                                }
                              }}
                              title="Download Form 25-B Payslip HTML File"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors shadow-sm"
                            >
                              <Download className="h-3.5 w-3.5" /> Download
                            </button> */}
                            <button
                              onClick={async () => {
                                if (!row.payrollEntry || !currentTenant?.id) return;
                                const empId = row.employee.id;

                                setEmpDispatchStatus(prev => ({
                                  ...prev,
                                  [empId]: { status: 'sending', progress: 15, message: 'Generating payslip...' }
                                }));

                                const timer = setInterval(() => {
                                  setEmpDispatchStatus(prev => {
                                    const current = prev[empId];
                                    if (current && current.status === 'sending' && current.progress < 90) {
                                      return { ...prev, [empId]: { ...current, progress: current.progress + 20 } };
                                    }
                                    return prev;
                                  });
                                }, 500);

                                try {
                                  const res = await sendPayslipEmail(row.payrollEntry, currentTenant.id, currentUserId);
                                  clearInterval(timer);
                                  if (res.success) {
                                    setEmpDispatchStatus(prev => ({
                                      ...prev,
                                      [empId]: { status: 'success', progress: 100, message: 'Sent Successfully' }
                                    }));
                                    toast.success(`Payslip sent to ${row.employee.name}!`);

                                    setTimeout(() => {
                                      setEmpDispatchStatus(prev => {
                                        const next = { ...prev };
                                        delete next[empId];
                                        return next;
                                      });
                                    }, 3000);
                                  } else {
                                    setEmpDispatchStatus(prev => ({
                                      ...prev,
                                      [empId]: { status: 'error', progress: 100, message: res.error || 'Delivery Failed' }
                                    }));
                                    toast.error(`Failed to send: ${res.error || 'Delivery error'}`);
                                  }
                                } catch (e) {
                                  clearInterval(timer);
                                  setEmpDispatchStatus(prev => ({
                                    ...prev,
                                    [empId]: { status: 'error', progress: 100, message: e instanceof Error ? e.message : 'Delivery Failed' }
                                  }));
                                } finally {
                                  fetchLogs(true);
                                }
                              }}
                              disabled={empDispatchStatus[row.employee.id]?.status === 'sending' || !row.employee.email || !row.employee.email.includes('@')}
                              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <Mail className="h-3.5 w-3.5" /> {empDispatchStatus[row.employee.id]?.status === 'sending' ? 'Sending...' : 'Dispatch Now'}
                            </button>
                          </div>
                        ) : row.status === 'Draft' || row.status === 'Pending Approval' ? (
                          <button
                            onClick={() => navigate('/dashboard/payroll')}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs transition-all shadow-sm"
                          >
                            View Payroll <ArrowRight className="h-3.5 w-3.5" />
                          </button>
                        ) : (
                          <button
                            onClick={() => navigate('/dashboard/payroll-process')}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-indigo-900 text-white font-bold text-xs transition-all shadow-sm"
                          >
                            Calculate Salary <ArrowRight className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Roster Pagination Controls */}
        {employeeRows.length > 0 && (
          <div className="px-6 py-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50/50">
            <div className="flex items-center gap-3 text-xs text-slate-600 font-medium">
              <span>Showing <strong className="text-slate-900 font-bold">{(rosterPage - 1) * rosterPerPage + 1}</strong> to <strong className="text-slate-900 font-bold">{Math.min(rosterPage * rosterPerPage, employeeRows.length)}</strong> of <strong className="text-slate-900 font-bold">{employeeRows.length}</strong> employees</span>
              <span className="text-slate-300">|</span>
              <div className="flex items-center gap-1.5">
                <span>Rows per page:</span>
                <select
                  value={rosterPerPage}
                  onChange={(e) => {
                    setRosterPerPage(Number(e.target.value));
                    setRosterPage(1);
                  }}
                  className="bg-white border border-slate-300 rounded-lg px-2 py-1 font-bold text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 shadow-sm cursor-pointer"
                >
                  <option value={10}>10</option>
                  <option value={15}>15</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setRosterPage(p => Math.max(p - 1, 1))}
                disabled={rosterPage === 1}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-300 font-bold text-xs bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Prev
              </button>
              <span className="text-xs font-bold text-slate-700 px-2.5">Page {rosterPage} of {totalRosterPages}</span>
              <button
                onClick={() => setRosterPage(p => Math.min(p + 1, totalRosterPages))}
                disabled={rosterPage === totalRosterPages}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-300 font-bold text-xs bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
              >
                Next <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Activity Logs Panel */}
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200/80 overflow-hidden">
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <FileText className="h-5 w-5 text-indigo-400" />
            <h2 className="font-bold text-base tracking-wide">Payslip Dispatch & Activity Feed</h2>
          </div>
          <button
            onClick={() => fetchLogs()}
            className="text-indigo-300 hover:text-white p-1 rounded-lg transition-colors"
            title="Refresh Logs"
          >
            <RefreshCw className={`h-4 w-4 ${isLoadingLogs ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Logs Filter Bar */}
          <div className="flex flex-col lg:flex-row gap-4 items-center justify-between pb-4 border-b border-slate-100">
            <div className="relative flex-1 w-full max-w-md">
              <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search logs by employee name, code, email or subject..."
                value={logSearchQuery}
                onChange={(e) => {
                  setLogSearchQuery(e.target.value);
                  setSelectedLogIds([]);
                }}
                className="w-full pl-10 pr-4 py-2 rounded-xl text-sm border border-slate-300 bg-slate-50 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:bg-white transition-all shadow-sm"
              />
            </div>
            <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto justify-end">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider shrink-0">Filter Status:</label>
              <select
                value={logStatusFilter}
                onChange={(e) => {
                  setLogStatusFilter(e.target.value as any);
                  setSelectedLogIds([]);
                }}
                className="pl-3 pr-8 py-2 rounded-xl text-sm font-semibold border border-slate-300 bg-slate-50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:bg-white transition-all shadow-sm cursor-pointer"
              >
                <option value="all">All Dispatches</option>
                <option value="sent">Delivered</option>
                <option value="failed">Failed</option>
              </select>

              {filteredEmailLogs.length > 0 && (
                <button
                  onClick={handleSelectAllLogs}
                  disabled={isDeletingLogs}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition-all shadow-sm disabled:opacity-50"
                >
                  {selectedLogIds.length === filteredEmailLogs.length ? 'Deselect All' : `Select All (${filteredEmailLogs.length})`}
                </button>
              )}

              {selectedLogIds.length > 0 && (
                <button
                  onClick={() => setShowDeleteModal(true)}
                  disabled={isDeletingLogs}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isDeletingLogs ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  <span>{isDeletingLogs ? 'Deleting...' : `Delete Selected (${selectedLogIds.length})`}</span>
                </button>
              )}
            </div>
          </div>

          {isLoadingLogs && emailLogs.length === 0 ? (
            <div className="flex justify-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin text-indigo-600" />
            </div>
          ) : emailLogs.length === 0 ? (
            <div className="text-center py-8 text-slate-500 italic text-sm">
              No payslip dispatch logs recorded yet. Delivered payslips will appear here.
            </div>
          ) : filteredEmailLogs.length === 0 ? (
            <div className="text-center py-8 text-slate-500 italic text-sm">
              No logs match your search criteria.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-3">
                {paginatedEmailLogs.map((log) => {
                const dateStr = new Date(log.sent_at).toLocaleString('en-GB');
                const recipientEmail = log.recipients?.to || 'Unknown';
                const matchingEmp = employees.find(e => e.email?.toLowerCase() === recipientEmail.toLowerCase());
                const empName = matchingEmp ? matchingEmp.name : 'Unknown Employee';
                const empCode = matchingEmp && matchingEmp.employee_code ? matchingEmp.employee_code : 'N/A';

                return (
                  <div
                    key={log.id}
                    className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border transition-colors gap-3 text-sm ${
                      selectedLogIds.includes(log.id) ? 'border-indigo-300 bg-indigo-50/40 shadow-sm' : 'border-slate-100 bg-slate-50/50 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start gap-3.5">
                      <input
                        type="checkbox"
                        checked={selectedLogIds.includes(log.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedLogIds(prev => [...prev, log.id]);
                          } else {
                            setSelectedLogIds(prev => prev.filter(id => id !== log.id));
                          }
                        }}
                        className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer shadow-sm"
                      />
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-900 font-bold text-xs border border-indigo-100 shadow-sm">
                            {empCode} - {empName}
                          </span>
                          <span className="font-bold text-slate-900 text-sm">{log.subject}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 font-medium">
                          <span className="text-slate-600 font-semibold">{recipientEmail}</span>
                          <span>•</span>
                          <span>{dateStr}</span>
                        </div>
                        {log.status === 'failed' && log.error_message && (
                          <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2 mt-1 font-medium">
                            Reason: {log.error_message}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 self-start sm:self-center ml-7 sm:ml-0">
                      {log.status === 'sent' ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-xs shadow-sm">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Delivered
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 font-bold text-xs shadow-sm">
                          <AlertCircle className="h-3.5 w-3.5 text-rose-600" /> Failed
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Logs Pagination Controls */}
            {filteredEmailLogs.length > 0 && (
              <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-xs text-slate-600 font-medium">
                  Showing <strong className="text-slate-900 font-bold">{(logPage - 1) * logPerPage + 1}</strong> to <strong className="text-slate-900 font-bold">{Math.min(logPage * logPerPage, filteredEmailLogs.length)}</strong> of <strong className="text-slate-900 font-bold">{filteredEmailLogs.length}</strong> logs
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setLogPage(p => Math.max(p - 1, 1))}
                    disabled={logPage === 1}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-300 font-bold text-xs bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" /> Prev
                  </button>
                  <span className="text-xs font-bold text-slate-700 px-2.5">Page {logPage} of {totalLogPages}</span>
                  <button
                    onClick={() => setLogPage(p => Math.min(p + 1, totalLogPages))}
                    disabled={logPage === totalLogPages}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-300 font-bold text-xs bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
                  >
                    Next <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-md w-full p-8 space-y-6 transform animate-scaleUp">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl shrink-0 shadow-inner">
                <AlertCircle className="h-6 w-6" />
              </div>
              <div className="space-y-1.5">
                <h3 className="font-extrabold text-slate-900 text-lg tracking-wide">Confirm Permanent Deletion</h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  You are about to permanently delete <strong className="text-slate-900 font-bold">{selectedLogIds.length}</strong> payslip dispatch log(s). Once deleted, these records cannot be retrieved.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeletingLogs}
                className="px-5 py-2.5 rounded-xl border border-slate-300 font-bold text-sm text-slate-700 bg-white hover:bg-slate-50 transition-all shadow-sm disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkDeleteLogs}
                disabled={isDeletingLogs}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white font-bold text-sm shadow-xl shadow-rose-500/25 flex items-center gap-2 transition-all disabled:opacity-50 active:scale-95"
              >
                {isDeletingLogs ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                <span>{isDeletingLogs ? 'Deleting...' : 'Yes, Permanently Delete'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
