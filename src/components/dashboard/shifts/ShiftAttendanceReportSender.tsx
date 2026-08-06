import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Users,
  Plus,
  Mail,
  Clock,
  Send,
  StopCircle,
  Play,
  Trash2,
  Search,
  Loader2,
  Bell,
  Save,
  History,
  CheckCircle2,
  XCircle,
  AlertCircle,
  AlertTriangle,
  NotepadText
} from 'lucide-react';
import { useEmployeesStore } from '../../../stores/employeesStore';
import { useShiftsStore } from '../../../stores/shiftsStore';
import { supabase } from '../../../lib/supabase';
import { useTenant } from '../../../contexts/TenantContext';
import { EmailSenderService } from '../../../services/email-sender.service';
import { format, parse, addMinutes, startOfDay, endOfDay } from 'date-fns';
import toast from 'react-hot-toast';

function getInitials(name: string): string {
  if (!name) return "U";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function buildReportHtml(
  shiftName: string,
  shiftStart: string,
  shiftEnd: string,
  totalAssigned: number,
  present: Array<{ name: string; code?: string; clockInTime?: string }>,
  absent: Array<{ name: string; code?: string }>,
  unscheduled: Array<{ name: string; code?: string; clockInTime?: string }>,
  sentAt: string,
  isManualTest?: boolean
): string {
  const totalClockedIn = present.length + unscheduled.length;
  const fmtTime = (t: string) => (t && t.length >= 5 ? t.slice(0, 5) : "--:--");

  const badgeHtml = isManualTest
    ? `<span style="background:#fee2e2;color:#991b1b;border:1px solid #fecdd3;padding:3px 8px;border-radius:5px;font-size:11px;font-weight:800;letter-spacing:0.5px;text-transform:uppercase;margin-left:10px;vertical-align:middle;display:inline-block;">TESTING SAMPLE</span>`
    : "";

  const absentRows = absent.length === 0
    ? `<tr><td colspan="2" style="padding:20px 16px;text-align:center;color:#f1f5f9;font-size:13px;font-style:italic;">Zero Absentees!</td></tr>`
    : absent.map(emp => `
        <tr style="border-top:1px solid #f1f5f9;">
          <td style="padding:12px 16px;font-size:13px;color:#64748b;font-family:monospace;vertical-align:middle;width:30%;border-top:1px solid #f1f5f9;">${emp.code || "N/A"}</td>
          <td style="padding:12px 16px;vertical-align:middle;border-top:1px solid #f1f5f9;">
            <span style="background:#fecdd3;color:#e11d48;border-radius:50%;width:34px;height:34px;line-height:34px;text-align:center;display:inline-block;font-size:12px;font-weight:700;vertical-align:middle;margin-right:10px;">${getInitials(emp.name)}</span>
            <span style="font-size:13px;font-weight:500;color:#1e293b;vertical-align:middle;">${emp.name}</span>
          </td>
        </tr>`).join("");

  const presentRows = present.length === 0
    ? `<tr><td colspan="3" style="padding:20px 16px;text-align:center;color:#94a3b8;font-size:13px;font-style:italic;">No assigned employees clocked in yet</td></tr>`
    : present.map(emp => `
        <tr style="border-top:1px solid #f1f5f9;">
          <td style="padding:12px 16px;font-size:13px;color:#64748b;font-family:monospace;vertical-align:middle;width:30%;border-top:1px solid #f1f5f9;">${emp.code || "N/A"}</td>
          <td style="padding:12px 16px;vertical-align:middle;border-top:1px solid #f1f5f9;">
            <span style="background:#bbf7d0;color:#059669;border-radius:50%;width:34px;height:34px;line-height:34px;text-align:center;display:inline-block;font-size:12px;font-weight:700;vertical-align:middle;margin-right:10px;">${getInitials(emp.name)}</span>
            <span style="font-size:13px;font-weight:500;color:#1e293b;vertical-align:middle;">${emp.name}</span>
          </td>
          <td style="padding:12px 16px;vertical-align:middle;text-align:right;border-top:1px solid #f1f5f9;">
            <span style="background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;padding:4px 10px;border-radius:6px;font-size:12px;font-family:monospace;font-weight:600;display:inline-block;">⏱ ${emp.clockInTime || "--:--"}</span>
          </td>
        </tr>`).join("");

  const unscheduledRows = unscheduled.length === 0
    ? `<tr><td colspan="3" style="padding:20px 16px;text-align:center;color:#94a3b8;font-size:13px;font-style:italic;">No unassigned employees</td></tr>`
    : unscheduled.map(emp => `
        <tr style="border-top:1px solid #f1f5f9;">
          <td style="padding:12px 16px;font-size:13px;color:#64748b;font-family:monospace;vertical-align:middle;width:30%;border-top:1px solid #f1f5f9;">${emp.code || "N/A"}</td>
          <td style="padding:12px 16px;vertical-align:middle;border-top:1px solid #f1f5f9;">
            <span style="background:#fef08a;color:#ca8a04;border-radius:50%;width:34px;height:34px;line-height:34px;text-align:center;display:inline-block;font-size:12px;font-weight:700;vertical-align:middle;margin-right:10px;">${getInitials(emp.name)}</span>
            <span style="font-size:13px;font-weight:500;color:#1e293b;vertical-align:middle;">${emp.name}</span>
          </td>
          <td style="padding:12px 16px;vertical-align:middle;text-align:right;border-top:1px solid #f1f5f9;">
            <span style="background:#fefce8;color:#ca8a04;border:1px solid #fef08a;padding:4px 10px;border-radius:6px;font-size:12px;font-family:monospace;font-weight:600;display:inline-block;">⏱ ${emp.clockInTime || "--:--"}</span>
          </td>
        </tr>`).join("");

  const footerText = isManualTest
    ? `Sent via Ace Payroll System &bull; ${sentAt} (Sample Purpose)`
    : `Sent via Ace Payroll System &bull; ${sentAt} (Auto Scheduled)`;

  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:640px;margin:32px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background:#3730a3;padding:28px 32px 24px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;line-height:1.2;vertical-align:middle;">Attendance Report based on shift${badgeHtml}</td>
        </tr>
      </table>
      <div style="margin-top:14px;">
        <span style="display:inline-block;background:#4338ca;border:1px solid #4f46e5;padding:6px 14px;border-radius:999px;font-size:13px;color:#e0e7ff;font-weight:500;">
          Shift: <strong style="color:#ffffff;">${shiftName}</strong> &nbsp;&middot;&nbsp; ${fmtTime(shiftStart)} &ndash; ${fmtTime(shiftEnd)}
        </span>
      </div>
    </div>

    <!-- Metric Cards -->
    <div style="padding: 24px 20px 0;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%; border-collapse:separate; border-spacing:12px 12px;">
        <tr>
          <td width="33.33%" style="background:#eef2ff; border:1px solid #c7d2fe; border-radius:12px; padding:16px 8px; text-align:center; vertical-align:middle;">
            <div style="font-size:28px; font-weight:800; color:#3730a3; line-height:1;">${totalAssigned}</div>
            <div style="font-size:10px; font-weight:700; color:#6366f1; text-transform:uppercase; letter-spacing:0.8px; margin-top:6px;">Total Employees Assigned to This Shift</div>
          </td>
          <td width="33.33%" style="background:#f0fdf4; border:1px solid #86efac; border-radius:12px; padding:16px 8px; text-align:center; vertical-align:middle;">
            <div style="font-size:28px; font-weight:800; color:#16a34a; line-height:1;">${present.length}</div>
            <div style="font-size:10px; font-weight:700; color:#22c55e; text-transform:uppercase; letter-spacing:0.8px; margin-top:6px;">Present "Clock In" Employees</div>
          </td>
          <td width="33.33%" style="background:#fef2f2; border:1px solid #fca5a5; border-radius:12px; padding:16px 8px; text-align:center; vertical-align:middle;">
            <div style="font-size:28px; font-weight:800; color:#dc2626; line-height:1;">${absent.length}</div>
            <div style="font-size:10px; font-weight:700; color:#ef4444; text-transform:uppercase; letter-spacing:0.8px; margin-top:6px;">Absent "Not Clock In" Employees</div>
          </td>
        </tr>
        <tr>
          <td colspan="1" style="background:#fefce8; border:1px solid #fde047; border-radius:12px; padding:16px 8px; text-align:center; vertical-align:middle;">
            <div style="font-size:28px; font-weight:800; color:#ca8a04; line-height:1;">${unscheduled.length}</div>
            <div style="font-size:10px; font-weight:700; color:#eab308; text-transform:uppercase; letter-spacing:0.8px; margin-top:6px;">Unassigned Employees "Clocked In"</div>
          </td>

          <td colspan="1" style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:16px 8px; text-align:center; vertical-align:middle;">
            <div style="font-size:28px; font-weight:800; color:#334155; line-height:1;">${totalClockedIn}</div>
            <div style="font-size:10px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.8px; margin-top:6px;">Total Employees <br/> "Clocked In" this shift</div>
          </td>
        </tr>
      </table>
    </div>

    <!-- Main Content Container (No Flex!) -->
    <div style="padding:24px 32px 32px;">

      <!-- Absent Section -->
      <div style="border:1px solid #fca5a5;border-radius:12px;overflow:hidden;margin-bottom:24px;background:#ffffff;">
        <table style="width:100%;border-collapse:collapse;background:#fff1f2;border-bottom:1px solid #fca5a5;">
          <tr>
            <td style="padding:14px 18px;text-align:left;vertical-align:middle;">
              <span style="background:#fecdd3;color:#dc2626;width:26px;height:26px;line-height:26px;text-align:center;border-radius:6px;display:inline-block;font-size:13px;font-weight:700;vertical-align:middle;margin-right:8px;">!</span>
              <span style="font-size:14px;font-weight:600;color:#dc2626;vertical-align:middle;">Absent employees</span>
              <span style="font-size:13px;color:#f87171;font-weight:400;vertical-align:middle;margin-left:4px;">(assigned)</span>
            </td>
            <td style="padding:14px 18px;text-align:right;vertical-align:middle;">
              <span style="background:#fecdd3;color:#dc2626;border-radius:999px;padding:3px 10px;font-size:13px;font-weight:700;display:inline-block;">${absent.length}</span>
            </td>
          </tr>
        </table>
        <table style="width:100%;border-collapse:collapse;background:#ffffff;">
          <thead>
            <tr style="border-bottom:1px solid #f1f5f9;background:#ffffff;">
              <th style="padding:10px 16px;text-align:left;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.8px;width:30%;">CODE</th>
              <th style="padding:10px 16px;text-align:left;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.8px;">EMPLOYEE NAME</th>
            </tr>
          </thead>
          <tbody>${absentRows}</tbody>
        </table>
      </div>

      <!-- Unscheduled Section -->
      <div style="border:1px solid #fde047;border-radius:12px;overflow:hidden;margin-bottom:24px;background:#ffffff;">
        <table style="width:100%;border-collapse:collapse;background:#fefce8;border-bottom:1px solid #fde047;">
          <tr>
            <td style="padding:14px 18px;text-align:left;vertical-align:middle;">
              <span style="background:#fef08a;color:#ca8a04;width:26px;height:26px;line-height:26px;text-align:center;border-radius:6px;display:inline-block;font-size:13px;font-weight:700;vertical-align:middle;margin-right:8px;">+</span>
              <span style="font-size:14px;font-weight:600;color:#ca8a04;vertical-align:middle;">Unassigned employees "Clocked In"</span>
            </td>
            <td style="padding:14px 18px;text-align:right;vertical-align:middle;">
              <span style="background:#fef08a;color:#ca8a04;border-radius:999px;padding:3px 10px;font-size:13px;font-weight:700;display:inline-block;">${unscheduled.length}</span>
            </td>
          </tr>
        </table>
        <table style="width:100%;border-collapse:collapse;background:#ffffff;">
          <thead>
            <tr style="border-bottom:1px solid #f1f5f9;background:#ffffff;">
              <th style="padding:10px 16px;text-align:left;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.8px;width:30%;">CODE</th>
              <th style="padding:10px 16px;text-align:left;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.8px;">EMPLOYEE NAME</th>
              <th style="padding:10px 16px;text-align:right;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.8px;">CLOCK IN</th>
            </tr>
          </thead>
          <tbody>${unscheduledRows}</tbody>
        </table>
      </div>

      <!-- Present Section -->
      <div style="border:1px solid #86efac;border-radius:12px;overflow:hidden;margin-bottom:24px;background:#ffffff;">
        <table style="width:100%;border-collapse:collapse;background:#f0fdf4;border-bottom:1px solid #86efac;">
          <tr>
            <td style="padding:14px 18px;text-align:left;vertical-align:middle;">
              <span style="background:#bbf7d0;color:#16a34a;width:26px;height:26px;line-height:26px;text-align:center;border-radius:6px;display:inline-block;font-size:13px;font-weight:700;vertical-align:middle;margin-right:8px;">✓</span>
              <span style="font-size:14px;font-weight:600;color:#16a34a;vertical-align:middle;">Present employees</span>
              <span style="font-size:13px;color:#4ade80;font-weight:400;vertical-align:middle;margin-left:4px;">(assigned)</span>
            </td>
            <td style="padding:14px 18px;text-align:right;vertical-align:middle;">
              <span style="background:#bbf7d0;color:#16a34a;border-radius:999px;padding:3px 10px;font-size:13px;font-weight:700;display:inline-block;">${present.length}</span>
            </td>
          </tr>
        </table>
        <table style="width:100%;border-collapse:collapse;background:#ffffff;">
          <thead>
            <tr style="border-bottom:1px solid #f1f5f9;background:#ffffff;">
              <th style="padding:10px 16px;text-align:left;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.8px;width:30%;">CODE</th>
              <th style="padding:10px 16px;text-align:left;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.8px;">EMPLOYEE NAME</th>
              <th style="padding:10px 16px;text-align:right;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.8px;">CLOCK IN</th>
            </tr>
          </thead>
          <tbody>${presentRows}</tbody>
        </table>
      </div>

      <!-- Footer -->
      <div style="text-align:center;padding-top:16px;">
        <p style="margin:0;font-size:11px;color:#94a3b8;font-weight:500;">${footerText}</p>
      </div>

    </div>
  </div>
</body>
</html>`;
}

interface Recipient {
  id: string;
  name: string;
  email: string;
  code?: string;
  isSelected: boolean;
  isCustom?: boolean;
}

interface ShiftReportLog {
  id: string;
  shift_name: string;
  sent_at: string;
  recipients_count: number;
  present_count: number;
  absent_count: number;
  total_count: number;
  status: 'success' | 'error';
  error_message?: string;
  triggered_by: 'cron' | 'manual';
  recipient_emails?: string[];
}

function cleanErrorMessage(msg: string | undefined | null): string {
  if (!msg) return '';
  
  if (msg.includes('<') && msg.includes('>')) {
    // Try to extract content inside <pre> tag
    const preMatch = msg.match(/<pre>([\s\S]*?)<\/pre>/i);
    if (preMatch && preMatch[1]) {
      const prefix = msg.split('<')[0].trim();
      return `${prefix ? prefix + ' ' : ''}${preMatch[1].trim()}`;
    }
    
    // Try to extract content inside <title> tag
    const titleMatch = msg.match(/<title>([\s\S]*?)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      const prefix = msg.split('<')[0].trim();
      return `${prefix ? prefix + ' ' : ''}${titleMatch[1].trim()}`;
    }

    // fallback: strip all HTML tags
    const prefix = msg.split('<')[0].trim();
    const stripped = msg.replace(/<\/?[^>]+(>|$)/g, " ").replace(/\s+/g, " ").trim();
    return stripped.length > 100 ? stripped.slice(0, 100) + '...' : stripped;
  }
  
  return msg;
}

export default function ShiftAttendanceReportSender() {
  const { currentTenant } = useTenant();
  const { items: employees, fetchEmployees, loading: employeesLoading, initialized: empInitialized } = useEmployeesStore();
  const { items: shifts, fetchShifts, loading: shiftsLoading, initialized: shiftsInitialized } = useShiftsStore();

  const [selectedShiftId, setSelectedShiftId] = useState<string>('all');
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [customName, setCustomName] = useState('');
  const [customEmail, setCustomEmail] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const [delayMinutes, setDelayMinutes] = useState<number>(10);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [logs, setLogs] = useState<ShiftReportLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [isRefreshingLogs, setIsRefreshingLogs] = useState(false);
  const [showStopWarning, setShowStopWarning] = useState(false);
  const [logsPage, setLogsPage] = useState(1);
  const logsPerPage = 10;

  const [isSyncing, setIsSyncing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const [dbSelectedEmpIds, setDbSelectedEmpIds] = useState<string[]>([]);
  const [isSettingsLoaded, setIsSettingsLoaded] = useState(false);

  // Bulk Delete State
  const [selectedLogIds, setSelectedLogIds] = useState<string[]>([]);
  const [isDeletingLogs, setIsDeletingLogs] = useState<boolean>(false);

  const fetchLogs = useCallback(async (isBackground = false) => {
    if (!currentTenant?.id) return;
    if (!isBackground && logs.length === 0) {
      setIsLoadingLogs(true);
    } else {
      setIsRefreshingLogs(true);
    }

    try {
      const { data, error } = await supabase
        .from('shift_report_logs')
        .select('*')
        .eq('tenant_id', currentTenant.id)
        .order('sent_at', { ascending: false })
        .limit(100);

      if (error) {
        console.error('Error fetching logs:', error);
      } else {
        setLogs(data || []);
        setSelectedLogIds([]); // Reset selection when logs are reloaded
      }
    } catch (err) {
      console.error('Unexpected error fetching logs:', err);
    } finally {
      setIsLoadingLogs(false);
      setIsRefreshingLogs(false);
    }
  }, [currentTenant, logs.length, setSelectedLogIds]);

  const handleSelectAllLogs = () => {
    if (selectedLogIds.length === filteredLogs.length && filteredLogs.length > 0) {
      setSelectedLogIds([]);
    } else {
      setSelectedLogIds(filteredLogs.map(l => l.id));
    }
  };

  const handleSelectOneLog = (id: string) => {
    setSelectedLogIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleBulkDeleteLogs = async () => {
    if (selectedLogIds.length === 0 || !currentTenant?.id) return;

    const confirmDelete = window.confirm(`Are you sure you want to delete ${selectedLogIds.length} selected log(s)?`);
    if (!confirmDelete) return;

    setIsDeletingLogs(true);
    try {
      const { error } = await supabase
        .from('shift_report_logs')
        .delete()
        .in('id', selectedLogIds)
        .eq('tenant_id', currentTenant.id);

      if (error) {
        toast.error('Failed to delete selected logs');
        console.error('Delete error:', error);
      } else {
        toast.success(`Successfully deleted ${selectedLogIds.length} log(s)`);
        setSelectedLogIds([]);
        fetchLogs(true);
      }
    } catch (e) {
      toast.error('Error deleting logs');
      console.error('Unexpected delete error:', e);
    } finally {
      setIsDeletingLogs(false);
    }
  };

  const loadSettings = useCallback(async () => {
    if (!currentTenant?.id) return;

    try {
      const { data, error } = await supabase
        .from('shift_report_settings')
        .select('*')
        .eq('tenant_id', currentTenant.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading settings:', error);
      } else if (data) {
        setSelectedShiftId('all');
        setDelayMinutes(data.delay_minutes);
        setIsMonitoring(data.is_monitoring);
        setDbSelectedEmpIds(data.selected_employee_ids || []);

        let customArray: any[] = [];
        if (typeof data.custom_recipients === 'string') {
          try { customArray = JSON.parse(data.custom_recipients); } catch (e) {}
        } else if (Array.isArray(data.custom_recipients)) {
          customArray = data.custom_recipients;
        }

        if (customArray.length > 0) {
          const loadedCustoms = customArray.map((r: any, i: number) => ({
            id: `custom-db-${r.email ? r.email.toLowerCase() : i}`,
            name: r.name,
            email: r.email,
            isSelected: r.isSelected !== false,
            isCustom: true
          }));
          setRecipients(prev => {
            const currentEmployees = prev.filter(p => !p.isCustom);
            return [...currentEmployees, ...loadedCustoms];
          });
        }
      }
    } catch (err) {
      console.error('Unexpected error during loadSettings:', err);
    } finally {
      setIsSettingsLoaded(true);
      setIsDirty(false);
    }
  }, [currentTenant]);

  useEffect(() => {
    if (!empInitialized) fetchEmployees();
    if (!shiftsInitialized) fetchShifts();
    loadSettings();
    fetchLogs();
  }, [fetchEmployees, fetchShifts, loadSettings, fetchLogs, empInitialized, shiftsInitialized]);

  // Poll for logs every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => fetchLogs(true), 30000);
    return () => clearInterval(interval);
  }, [fetchLogs]);

  useEffect(() => {
    if (employees.length > 0 && isSettingsLoaded) {
      setRecipients(prev => {
        const customOnes = prev.filter(r => r.isCustom);
        const employeeRecipients = employees.map(emp => ({
          id: emp.id,
          name: emp.name,
          email: emp.email,
          code: (emp as any).employee_code || (emp as any).code || '',
          isSelected: dbSelectedEmpIds.includes(emp.id) || prev.find(p => p.id === emp.id)?.isSelected || false,
          isCustom: false
        }));
        return [...employeeRecipients, ...customOnes];
      });
    }
  }, [employees, dbSelectedEmpIds, isSettingsLoaded]);

  const saveSettings = async (monitoringState?: boolean, customRecsToSave?: Recipient[]) => {
    if (!currentTenant?.id) return;
    setIsSaving(true);

    const mState = monitoringState !== undefined ? monitoringState : isMonitoring;
    const currentRecs = customRecsToSave || recipients;

    const customList = currentRecs
      .filter(r => r.isCustom)
      .map(r => ({ name: r.name, email: r.email, isSelected: r.isSelected }));

    const selectedEmployeeIds = currentRecs
      .filter(r => !r.isCustom && r.isSelected)
      .map(r => r.id);

    try {
      const { error } = await supabase
        .from('shift_report_settings')
        .upsert({
          tenant_id: currentTenant.id,
          shift_id: selectedShiftId || 'all',
          delay_minutes: delayMinutes,
          is_monitoring: mState,
          selected_employee_ids: selectedEmployeeIds,
          custom_recipients: customList,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'tenant_id'
        });

      if (error) {
        toast.error(`Failed to save settings: ${error.message}`);
        console.error('Save error details:', error);
      } else {
        toast.success('Settings saved successfully');
        setDbSelectedEmpIds(selectedEmployeeIds);
        setIsDirty(false);
      }
    } catch (err) {
      console.error('Save settings error:', err);
      toast.error('An error occurred while saving');
    } finally {
      setIsSaving(false);
    }
  };

  const handleMonitoringToggle = async () => {
    if (isDirty) {
      toast.error('Please save changes before starting the engine');
      return;
    }

    if (!hasSelectedRecipients) {
      toast.error('Please select at least one recipient');
      return;
    }

    const newState = !isMonitoring;
    if (newState && (!selectedShiftId || !recipients.some(r => r.isSelected))) {
      toast.error('Please select a shift and at least one recipient first');
      return;
    }

    if (!newState) {
      setShowStopWarning(true);
      return;
    }

    setIsMonitoring(true);
    await saveSettings(true);
  };

  const confirmStopMonitoring = async () => {
    setShowStopWarning(false);
    setIsMonitoring(false);
    await saveSettings(false);
  };

  const activeShifts = useMemo(() => {
    if (selectedShiftId === 'all') return shifts;
    return shifts.filter(s => s.id === selectedShiftId);
  }, [shifts, selectedShiftId]);

  const hasSelectedRecipients = useMemo(() =>
    recipients.some(r => r.isSelected),
    [recipients]
  );

  const filteredLogs = useMemo(() => {
    return logs.filter(log => log.triggered_by !== 'manual');
  }, [logs]);

  const totalLogsPages = Math.ceil(filteredLogs.length / logsPerPage) || 1;
  const currentLogs = useMemo(() => {
    const startIndex = (logsPage - 1) * logsPerPage;
    return filteredLogs.slice(startIndex, startIndex + logsPerPage);
  }, [filteredLogs, logsPage]);

  const filteredRecipients = useMemo(() =>
    recipients.filter(r => {
      const searchLower = searchTerm.toLowerCase();
      return (
        r.name.toLowerCase().includes(searchLower) ||
        r.email.toLowerCase().includes(searchLower) ||
        (r.code && r.code.toLowerCase().includes(searchLower))
      );
    }),
    [recipients, searchTerm]
  );

  const employeeRecipients = useMemo(() =>
    filteredRecipients.filter(r => !r.isCustom),
    [filteredRecipients]
  );

  const customRecipients = useMemo(() =>
    filteredRecipients.filter(r => r.isCustom),
    [filteredRecipients]
  );

  const addCustomRecipient = () => {
    if (!customName || !customEmail) {
      toast.error('Please enter both name and email');
      return;
    }

    const emailExists = recipients.some(
      r => r.email.toLowerCase() === customEmail.toLowerCase()
    );

    if (emailExists) {
      toast.error('This email already exists in the recipient list');
      return;
    }

    const newRecipient: Recipient = {
      id: `custom-${Date.now()}`,
      name: customName,
      email: customEmail,
      isSelected: true,
      isCustom: true
    };

    const updatedRecs = [...recipients, newRecipient];
    setRecipients(updatedRecs);
    setCustomName('');
    setCustomEmail('');
    saveSettings(undefined, updatedRecs);
  };

  const removeRecipient = (id: string) => {
    const updatedRecs = recipients.filter(r => r.id !== id);
    setRecipients(updatedRecs);
    saveSettings(undefined, updatedRecs);
  };

  const toggleRecipient = (id: string) => {
    const updatedRecs = recipients.map(r =>
      r.id === id ? { ...r, isSelected: !r.isSelected } : r
    );
    setRecipients(updatedRecs);
    saveSettings(undefined, updatedRecs);
  };

  const getAttendanceData = async (shiftId: string, isManualTest?: boolean) => {
    if (!currentTenant) return null;

    if (isManualTest) {
      return {
        totalAssigned: 10,
        present: [
          { name: "Johnathan Davis", code: "EMP-2041", clockInTime: "09:55 AM" },
          { name: "Sarah Jenkins", code: "EMP-2042", clockInTime: "09:58 AM" },
          { name: "Michael Chen", code: "EMP-2045", clockInTime: "10:00 AM" },
          { name: "Emily Rodriguez", code: "EMP-2048", clockInTime: "10:02 AM" },
          { name: "David Kim", code: "EMP-2049", clockInTime: "10:05 AM" },
          { name: "Jessica Taylor", code: "EMP-2051", clockInTime: "10:10 AM" },
          { name: "Robert Wilson", code: "EMP-2052", clockInTime: "10:08 AM" },
          { name: "Amanda Martinez", code: "EMP-2055", clockInTime: "10:05 AM" }
        ],
        absent: [
          { name: "William Thomas", code: "EMP-2043", codeOnly: "EMP-2043" },
          { name: "Olivia Brown", code: "EMP-2047", codeOnly: "EMP-2047" }
        ],
        unscheduled: [
          { name: "Alexander Wright", code: "EMP-9011", clockInTime: "09:50 AM" },
          { name: "Victoria Green", code: "EMP-9014", clockInTime: "10:05 AM" },
          { name: "Daniel Martinez", code: "EMP-9018", clockInTime: "10:00 AM" },
          { name: "Rachel Adams", code: "EMP-9022", clockInTime: "10:10 AM" }
        ],
        totalClockedIn: 12
      };
    }

    const today = new Date();
    const start = startOfDay(today).toISOString();
    const end = endOfDay(today).toISOString();

    const { data: assignments, error: assignError } = await supabase
      .from('shift_assignments')
      .select('employee_id, employee:employees(id, name, employee_code)')
      .eq('shift_id', shiftId)
      .eq('tenant_id', currentTenant.id)
      .eq('schedule_date', format(today, 'yyyy-MM-dd'));

    if (assignError) {
      console.error('Error fetching assignments:', assignError);
      return null;
    }

    const { data: allAssignmentsToday } = await supabase
      .from('shift_assignments')
      .select('employee_id')
      .eq('tenant_id', currentTenant.id)
      .eq('schedule_date', format(today, 'yyyy-MM-dd'));

    const { data: timestamps, error: timeError } = await supabase
      .from('attendance_timestamp')
      .select('employee_id, timestamp, employee:employees(id, name, employee_code)')
      .eq('tenant_id', currentTenant.id)
      .eq('entry', 'IN')
      .gte('timestamp', start)
      .lte('timestamp', end);

    if (timeError) {
      console.error('Error fetching timestamps:', timeError);
      return null;
    }

    const assignedList = assignments?.map(a => ({
      id: a.employee_id,
      name: (a.employee as any)?.name || '',
      code: (a.employee as any)?.employee_code || ''
    })) || [];

    const allAssignedIdsToday = new Set(allAssignmentsToday?.map(a => a.employee_id) || []);
    
    const clockedInMap = new Map<string, string>();
    timestamps?.forEach(t => {
      if (t.employee_id && t.timestamp) {
        if (!clockedInMap.has(t.employee_id) || t.timestamp < clockedInMap.get(t.employee_id)!) {
          clockedInMap.set(t.employee_id, t.timestamp);
        }
      }
    });

    const formatTimeStr = (iso?: string) => {
      if (!iso) return '--:--';
      return format(new Date(iso), 'hh:mm a');
    };

    const present = assignedList
      .filter(a => clockedInMap.has(a.id))
      .map(a => ({
        ...a,
        clockInTime: formatTimeStr(clockedInMap.get(a.id))
      }));

    const absent = assignedList.filter(a => !clockedInMap.has(a.id));

    const isNearestShift = (isoTimestamp: string, currentShiftId: string, allShifts: any[]): boolean => {
      if (!allShifts || allShifts.length <= 1) return true;
      const date = new Date(isoTimestamp);
      const clockInMinutes = date.getHours() * 60 + date.getMinutes();

      let minDiff = Infinity;
      let nearestShiftId = currentShiftId;

      for (const s of allShifts) {
        if (!s.start_time) continue;
        const [hh, mm] = s.start_time.split(":").map(Number);
        const shiftMinutes = hh * 60 + mm;
        let diff = Math.abs(clockInMinutes - shiftMinutes);
        if (diff > 720) {
          diff = 1440 - diff;
        }
        if (diff < minDiff) {
          minDiff = diff;
          nearestShiftId = s.id;
        }
      }

      return nearestShiftId === currentShiftId;
    };

    const unscheduledMap = new Map();
    timestamps?.forEach(t => {
      if (t.employee_id && !allAssignedIdsToday.has(t.employee_id) && t.employee && t.timestamp) {
        if (isNearestShift(t.timestamp, shiftId, shifts)) {
          const current = unscheduledMap.get(t.employee_id);
          if (!current || t.timestamp < current.rawTimestamp) {
            unscheduledMap.set(t.employee_id, {
              id: t.employee_id,
              name: (t.employee as any)?.name || '',
              code: (t.employee as any)?.employee_code || '',
              clockInTime: formatTimeStr(t.timestamp),
              rawTimestamp: t.timestamp
            });
          }
        }
      }
    });
    const unscheduled = Array.from(unscheduledMap.values());

    return {
      totalAssigned: assignedList.length,
      present,
      absent,
      unscheduled,
      totalClockedIn: present.length + unscheduled.length
    };
  };

  const sendNotificationManual = async (targetShifts: any[], isManualTest = false) => {
    if (targetShifts.length === 0 || !currentTenant) {
      toast.error('Please select a valid shift configuration first');
      return;
    }

    const allSelected = recipients.filter(r => r.isSelected);
    if (allSelected.length === 0) {
      toast.error('Please select at least one recipient');
      return;
    }

    const selectedRecipients = allSelected;

    const loadingToast = toast.loading(isManualTest ? 'Sending test report...' : 'Sending attendance report(s)...');

    let successCount = 0;
    let lastError = null;

    try {
      for (const shift of targetShifts) {
        const data = await getAttendanceData(shift.id, isManualTest);
        if (!data) continue;

        const shiftName = isManualTest ? "Demo Shift" : shift.name;
        const shiftStart = isManualTest ? "10:00:00" : shift.start_time;
        const shiftEnd = isManualTest ? "18:30:00" : shift.end_time;
        const reportHtml = buildReportHtml(
          shiftName,
          shiftStart,
          shiftEnd,
          data.totalAssigned,
          data.present,
          data.absent,
          data.unscheduled,
          format(new Date(), 'PPpp'),
          isManualTest
        );

        const sendPromises = selectedRecipients.map(async (recipient) => {
          try {
            await EmailSenderService.sendEmail({
              tenant_id: currentTenant.id,
              user_id: '',
              to: recipient.email,
              subject: `[TESTING SAMPLE] Attendance Report: ${shiftName} - ${format(new Date(), 'dd MMM yyyy')}`,
              html: reportHtml
            });
            return { success: true };
          } catch (e: any) {
            lastError = e.message;
            return { success: false };
          }
        });

        const results = await Promise.all(sendPromises);
        const shiftSuccessCount = results.filter(r => r.success).length;
        successCount += shiftSuccessCount;

        // Log manual send
        await supabase.from('shift_report_logs').insert({
          tenant_id: currentTenant.id,
          shift_id: shift.id,
          shift_name: shift.name,
          sent_at: new Date().toISOString(),
          recipients_count: selectedRecipients.length,
          present_count: data.present.length,
          absent_count: data.absent.length,
          total_count: data.totalAssigned,
          triggered_by: 'manual',
          status: shiftSuccessCount > 0 ? 'success' : 'error',
          error_message: lastError,
          recipient_emails: selectedRecipients.map(r => r.email)
        });
      }

      if (successCount === 0) {
        toast.error(`Dispatch failed: ${lastError || 'No emails sent'}`, { id: loadingToast });
      } else if (successCount < selectedRecipients.length) {
        toast.success(`Partial success: ${successCount}/${selectedRecipients.length} sent`, { id: loadingToast });
      } else {
        toast.success('Report(s) sent successfully!', { id: loadingToast });
      }

      fetchLogs();
    } catch (error: any) {
      toast.error('Fatal error: ' + error.message, { id: loadingToast });
    }
  };

  const handleManualSync = async () => {
    if (!currentTenant) return;
    const shiftsToUse = activeShifts.length > 0 ? [activeShifts[0]] : [];
    if (shiftsToUse.length === 0) {
      toast.error('No active shift configured. Please save a shift first.');
      return;
    }
    const selectedRecipients = recipients.filter(r => r.isSelected);
    if (selectedRecipients.length === 0) {
      toast.error('Please select at least one recipient.');
      return;
    }
    setIsSyncing(true);
    await sendNotificationManual(shiftsToUse, true);
    setIsSyncing(false);
  };

  const lastSentDisplay = useMemo(() => {
    const lastSuccess = logs.find(l => l.status === 'success');
    if (!lastSuccess) return 'Never';
    return format(new Date(lastSuccess.sent_at), 'HH:mm:ss');
  }, [logs]);

  return (
    <div className="max-w-[1600px] mx-auto py-4 sm:py-6 px-3 sm:px-6 lg:px-4 bg-gray-50/30 min-h-screen">
      {/* Header Section - Refactored for better fit */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between mb-6 sm:mb-8 gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-600 rounded-lg shadow-md">
              <NotepadText className="h-5 w-5 text-white shrink-0" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">
              Shift Attendance Notifier Settings
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-gray-400 font-medium max-w-3xl leading-relaxed">
            Send employee Clock-In attendance status reports based on the shift and a configurable delay after the shift start time. Once configured, the system will automatically send these reports to the specified recipients at the scheduled interval.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => saveSettings()}
            disabled={isSaving || !isSettingsLoaded || !selectedShiftId || isMonitoring}
            className={`flex-1 sm:flex-none inline-flex items-center justify-center px-4 py-2 border rounded-lg transition-all font-bold text-xs shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${isDirty && selectedShiftId && !isMonitoring
                ? 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700'
                : 'bg-white text-indigo-600 border-indigo-100 hover:bg-indigo-50'
              }`}
            title={isMonitoring ? "Locked while active" : (!selectedShiftId ? "Select a shift to save" : "")}
          >
            {isSaving ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : <Save className="h-3 w-3 mr-1.5" />}
            {isDirty ? 'Save Changes' : 'Save'}
          </button>

          <button
            onClick={handleManualSync}
            disabled={isSyncing || !currentTenant}
            className="flex-1 sm:flex-none inline-flex items-center justify-center px-4 py-2 border border-indigo-100 text-indigo-600 bg-white rounded-lg hover:bg-indigo-50 transition-all font-bold text-xs shadow-sm disabled:opacity-50"
            title="Dispatch a premium sample report template with mock attendance data"
          >
            {isSyncing ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : <Send className="h-3 w-3 mr-1.5" />}
           Testing
          </button>

          <button
            onClick={handleMonitoringToggle}
            className={`flex-1 sm:flex-none inline-flex items-center justify-center px-6 py-2 rounded-lg font-black text-xs transition-all shadow-md active:scale-95 ${isMonitoring
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-green-600 text-white hover:bg-green-700'
              } ${(isDirty || !hasSelectedRecipients || !selectedShiftId) ? 'opacity-50 grayscale cursor-not-allowed' : ''}`}
            disabled={!isSettingsLoaded || isDirty || !hasSelectedRecipients || !selectedShiftId}
            title={!selectedShiftId ? "Select a shift to start" : (!hasSelectedRecipients ? "Select at least one recipient to start" : (isDirty ? "Save changes before starting" : ""))}
          >
            {isMonitoring ? (
              <><StopCircle className="h-4 w-4 mr-1.5" /> Stop Auto Send </>
            ) : (
              <><Play className="h-4 w-4 mr-1.5" /> Start Auto Send</>
            )}
          </button>
        </div>
      </div>

      {/* {isDirty && (
        <div className="mb-6 animate-in fade-in slide-in-from-top-2">
          <div className="bg-indigo-50 border border-indigo-100 px-4 py-2 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-indigo-500" />
              <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider">Unsaved configuration detected</span>
            </div>
            <button 
              onClick={() => saveSettings()}
              className="text-[10px] font-black text-indigo-600 hover:underline"
            >
              Save Now
            </button>
          </div>
        </div>
      )} */}

      <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-12 gap-5 sm:gap-6">

        {/* Left Column - Configuration & Status */}
        <div className="lg:col-span-1 2xl:col-span-3 space-y-5">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="bg-gray-50/50 px-5 py-4 border-b border-gray-100 flex justify-between items-center">
              <h3 className="font-bold text-sm text-gray-900 flex items-center gap-2">
                <Clock className="h-4 w-4 text-indigo-500" />
                Shift Parameters
              </h3>
            </div>
            <div className="p-5 space-y-6">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider mb-2">Shift Target</label>
                <div className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-100 flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-indigo-900 uppercase tracking-wider">All Active Shifts</span>
                  </div>
                  <span className="text-[10px] font-bold text-indigo-600 bg-white px-2 py-0.5 rounded-full border border-indigo-100 shadow-2xs">
                    {shifts.length} {shifts.length === 1 ? 'Shift' : 'Shifts'}
                  </span>
                </div>

                <div className="space-y-2 max-h-36 overflow-y-auto custom-scrollbar pr-1">
                  {shifts.map(s => (
                    <div key={s.id} className="flex items-center justify-between p-2 rounded-lg bg-gray-50 border border-gray-100 text-xs hover:border-indigo-200 transition-all">
                      <span className="font-bold text-gray-800 truncate max-w-[140px]">{s.name}</span>
                      <span className="font-mono text-[10px] font-semibold text-gray-500 bg-white px-2 py-0.5 rounded border border-gray-200 shadow-2xs">
                        {s.start_time.slice(0, 5)} - {s.end_time.slice(0, 5)}
                      </span>
                    </div>
                  ))}
                  {shifts.length === 0 && (
                    <p className="text-[10px] text-gray-400 text-center py-2 italic font-medium">No shifts configured</p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider mb-3">Sending gap after shift start (Minutes)</label>
                <div className="space-y-3">
                  <input
                    type="range"
                    min="1"
                    max="60"
                    step="1"
                    value={delayMinutes}
                    disabled={isMonitoring}
                    onChange={(e) => {
                      setDelayMinutes(parseInt(e.target.value));
                      setIsDirty(true);
                    }}
                    className="w-full h-1.5 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <div className="flex justify-between items-center bg-indigo-50/30 p-2 rounded-lg border border-indigo-50">
                    <span className="text-[10px] font-bold text-indigo-700">Offset:</span>
                    <span className="font-black text-indigo-600 text-sm">{delayMinutes}m</span>
                  </div>
                </div>
              </div>

              <div className="bg-amber-50/50 p-3 rounded-lg border border-amber-100 flex gap-3">
                <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                <p className="text-[10px] text-amber-800 font-bold leading-normal">
                  Reports generate {delayMinutes}m post-start.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-slate-900 rounded-xl shadow-lg p-5 text-white relative overflow-hidden">
            <h4 className="font-black text-sm mb-5 flex items-center gap-2 uppercase tracking-tight">
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
              Engine Status
            </h4>
            <div className="space-y-4">
              <div className="flex justify-between items-center pb-3 border-b border-white/5">
                <span className="text-slate-400 text-[10px] font-bold uppercase">State</span>
                <span className={`px-3 py-1 rounded-full text-[9px] font-black tracking-widest uppercase ${isMonitoring ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-500'
                  }`}>
                  {isMonitoring ? 'Active' : 'Standby'}
                </span>
              </div>
              <div className="flex justify-between items-center pb-3 border-b border-white/5">
                <span className="text-slate-400 text-[10px] font-bold uppercase">Last Send</span>
                <span className="font-mono text-indigo-300 font-black text-sm">{lastSentDisplay}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-[10px] font-bold uppercase">Target</span>
                <span className="text-[10px] font-black truncate max-w-[100px] text-indigo-100">
                  {selectedShiftId === 'all' ? 'All' : activeShifts[0]?.name || '--'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Middle Column - Recipients List (Flexible span) */}
        <div className="lg:col-span-1 2xl:col-span-9">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col h-full 2xl:h-[750px] min-h-[500px]">
            <div className="bg-gray-50/50 px-5 py-4 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-0.5">
                <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
                  <Users className="h-5 w-5 text-indigo-500" />
                  Broadcast Group {isMonitoring && <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 ml-2">(Locked while active)</span>}
                </h3>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                  {recipients.filter(r => r.isSelected).length} Recipients
                </p>
              </div>
              <div className="relative w-full md:w-56">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search ..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border-gray-200 focus:ring-2 focus:ring-indigo-500/20 font-semibold"
                />
              </div>
            </div>

            <div className={`p-4 border-b border-gray-100 bg-indigo-50/10 ${isMonitoring ? 'opacity-50 pointer-events-none' : ''}`}>
              <div className="flex flex-col sm:flex-row items-end gap-3">
                <div className="flex-1 space-y-1.5">
                  <label className="text-[9px] font-black text-indigo-400 uppercase tracking-widest ml-1">Name</label>
                  <input
                    type="text"
                    placeholder="[User Name]"
                    value={customName}
                    disabled={isMonitoring}
                    onChange={(e) => setCustomName(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-gray-200 focus:ring-2 focus:ring-indigo-500/10 font-semibold bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                  />
                </div>
                <div className="flex-1 space-y-1.5">
                  <label className="text-[9px] font-black text-indigo-400 uppercase tracking-widest ml-1">Email</label>
                  <input
                    type="email"
                    placeholder="[EMAIL_ADDRESS]"
                    value={customEmail}
                    disabled={isMonitoring}
                    onChange={(e) => setCustomEmail(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-gray-200 focus:ring-2 focus:ring-indigo-500/10 font-semibold bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                  />
                </div>
                <button
                  onClick={addCustomRecipient}
                  disabled={isMonitoring}
                  className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-sm transition-all flex items-center justify-center font-bold text-xs h-[34px] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus className="h-4 w-4 mr-1" /> Add
                </button>
              </div>
            </div>

            <div className={`flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar ${isMonitoring ? 'opacity-70 pointer-events-none' : ''}`}>
              {(employeesLoading && employees.length === 0) ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-indigo-600 mb-3" />
                  <p className="text-[10px] font-bold text-gray-400 uppercase">Loading Recipients...</p>
                </div>
              ) : (
                <>
                  {customRecipients.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest whitespace-nowrap">External Recipients</span>
                        <div className="h-px w-full bg-indigo-50" />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {customRecipients.map(r => (
                          <div key={r.id} className="flex items-center justify-between p-3 rounded-xl bg-indigo-50/30 border border-transparent hover:border-indigo-100 transition-all">
                            <div className="flex items-center gap-3 min-w-0">
                              <input
                                type="checkbox"
                                checked={r.isSelected}
                                disabled={isMonitoring}
                                onChange={() => toggleRecipient(r.id)}
                                className="h-4 w-4 text-indigo-600 rounded border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                              />
                              <div className="min-w-0">
                                <p className="text-xs font-black text-gray-800 truncate">{r.name}</p>
                                <p className="text-[10px] text-indigo-500/70 font-bold truncate">{r.email}</p>
                              </div>
                            </div>
                            <button disabled={isMonitoring} onClick={() => removeRecipient(r.id)} className="p-1.5 text-gray-300 hover:text-red-500 transition-all disabled:opacity-30 disabled:cursor-not-allowed">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">Employees</span>
                      <div className="h-px w-full bg-gray-50" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {employeeRecipients.map(r => (
                        <div
                          key={r.id}
                          onClick={() => { if (!isMonitoring) toggleRecipient(r.id); }}
                          className={`cursor-pointer flex items-center gap-3 p-3 rounded-xl border transition-all ${r.isSelected
                              ? 'border-indigo-500 bg-indigo-50/40 shadow-sm'
                              : 'border-gray-50 hover:bg-gray-50'
                            } ${isMonitoring ? 'cursor-not-allowed opacity-80' : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={r.isSelected}
                            disabled={isMonitoring}
                            readOnly
                            className="h-4 w-4 text-indigo-600 rounded border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-black text-gray-800 truncate">
                              {r.name}
                              {r.code && <span className="text-gray-400 font-bold text-[9px] ml-1.5 opacity-60">#{r.code}</span>}
                            </p>
                            <p className={`text-[10px] font-bold truncate ${r.isSelected ? 'text-indigo-500' : 'text-gray-400'}`}>
                              {r.email || 'No Email'}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Audit Trail - Activity Log */}
        <div className="lg:col-span-1 2xl:col-span-12">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="bg-gray-50/50 px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-gray-400" />
                <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest">Recent Activity Log</h3>
                {isRefreshingLogs && <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500 ml-2" />}
              </div>
              <div className="flex items-center gap-3">
                {selectedLogIds.length > 0 && (
                  <button
                    onClick={handleBulkDeleteLogs}
                    disabled={isDeletingLogs}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-red-50 hover:bg-red-100 text-red-600 font-bold text-[10px] uppercase border border-red-200 transition-colors shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed animate-in fade-in slide-in-from-right-2"
                  >
                    {isDeletingLogs ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Trash2 className="w-3 h-3" />
                    )}
                    Delete Selected ({selectedLogIds.length})
                  </button>
                )}
                <button
                  onClick={() => fetchLogs(true)}
                  disabled={isLoadingLogs || isRefreshingLogs || isDeletingLogs}
                  className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 uppercase tracking-tighter disabled:opacity-50"
                >
                  Refresh Logs
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-white border-b border-gray-50">
                    <th className="px-6 py-3 w-12 text-center">
                      <input
                        type="checkbox"
                        checked={selectedLogIds.length === filteredLogs.length && filteredLogs.length > 0}
                        onChange={handleSelectAllLogs}
                        disabled={isDeletingLogs || filteredLogs.length === 0}
                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer disabled:opacity-40"
                      />
                    </th>
                    <th className="px-6 py-3 text-[10px] font-black text-gray-400 uppercase tracking-wider">Time</th>
                    <th className="px-6 py-3 text-[10px] font-black text-gray-400 uppercase tracking-wider">Shift</th>
                    <th className="px-6 py-3 text-[10px] font-black text-gray-400 uppercase tracking-wider">Recipients</th>
                    <th className="px-6 py-3 text-[10px] font-black text-gray-400 uppercase tracking-wider">Stats</th>
                    <th className="px-6 py-3 text-[10px] font-black text-gray-400 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {isLoadingLogs && logs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-10 text-center">
                        <Loader2 className="w-5 h-5 animate-spin text-gray-300 mx-auto" />
                      </td>
                    </tr>
                  ) : filteredLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-10 text-center text-xs text-gray-400 font-medium">
                        No recent activity recorded
                      </td>
                    </tr>
                  ) : currentLogs.map((log) => (
                    <tr 
                      key={log.id} 
                      className={`hover:bg-gray-50/50 transition-colors ${selectedLogIds.includes(log.id) ? 'bg-indigo-50/35' : ''}`}
                    >
                      <td className="px-6 py-4 text-center w-12">
                        <input
                          type="checkbox"
                          checked={selectedLogIds.includes(log.id)}
                          onChange={() => handleSelectOneLog(log.id)}
                          disabled={isDeletingLogs}
                          className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer disabled:opacity-40"
                        />
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-[11px] font-bold text-gray-900">
                          {format(new Date(log.sent_at), 'HH:mm')}
                        </div>
                        <div className="text-[9px] text-gray-400 font-medium">
                          {format(new Date(log.sent_at), 'dd MMM')}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-[11px] font-bold text-gray-900">{log.shift_name}</div>
                      </td>
                      <td className="px-6 py-4 max-w-xs">
                        <div className="flex flex-wrap gap-1">
                          {log.recipient_emails && log.recipient_emails.length > 0 ? (
                            log.recipient_emails.map((email, idx) => (
                              <span key={idx} className="text-[9px] font-bold px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-md border border-indigo-100 truncate max-w-[150px]">
                                {email}
                              </span>
                            ))
                          ) : (
                            <span className="text-[10px] text-gray-400 font-bold">{log.recipients_count} Recipients</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold px-1.5 py-0.5 bg-green-50 text-green-600 rounded">P:{log.present_count}</span>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 bg-red-50 text-red-600 rounded">A:{log.absent_count}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase w-fit ${log.status === 'success'
                              ? 'bg-green-50 text-green-600'
                              : 'bg-red-50 text-red-600'
                            }`}>
                            {log.status === 'success' ? <CheckCircle2 className="w-2.5 h-2.5" /> : <XCircle className="w-2.5 h-2.5" />}
                            {log.status}
                          </span>
                          {log.error_message && (
                            <span className="text-[9px] text-red-500 font-semibold max-w-[200px] break-words leading-tight" title={cleanErrorMessage(log.error_message)}>
                              {cleanErrorMessage(log.error_message)}
                            </span>
                          )}
                        </div>
                      </td>
                      
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalLogsPages > 1 && (
              <div className="bg-gray-50/30 px-5 py-3 border-t border-gray-100 flex items-center justify-between">
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                  Showing {(logsPage - 1) * logsPerPage + 1} - {Math.min(logsPage * logsPerPage, filteredLogs.length)} of {filteredLogs.length}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setLogsPage(prev => Math.max(prev - 1, 1))}
                    disabled={logsPage === 1}
                    className="px-2.5 py-1 text-xs font-bold rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed text-gray-700 shadow-2xs"
                  >
                    Prev
                  </button>
                  <span className="text-xs font-black text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-100">
                    {logsPage} / {totalLogsPages}
                  </span>
                  <button
                    onClick={() => setLogsPage(prev => Math.min(prev + 1, totalLogsPages))}
                    disabled={logsPage === totalLogsPages}
                    className="px-2.5 py-1 text-xs font-bold rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed text-gray-700 shadow-2xs"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {showStopWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in zoom-in-95 duration-150">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-red-100">
            <div className="bg-red-50/80 px-6 py-5 border-b border-red-100 flex items-start gap-4">
              <div className="p-3 bg-red-100 text-red-600 rounded-2xl shrink-0 mt-0.5">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-black text-red-950 tracking-tight mb-1">
                  Stop Auto Sending Reports?
                </h3>
                <p className="text-xs text-red-800 font-medium leading-relaxed">
                  If you stop this auto send , shift attendance reports will no longer be sent to your selected recipients.
                </p>
              </div>
            </div>
            <div className="p-6 bg-white space-y-4">
              <div className="p-3 rounded-xl bg-gray-50 border border-gray-100 text-[11px] text-gray-600 font-semibold flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span>Selected recipients will immediately stop receiving daily emails.</span>
              </div>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowStopWarning(false)}
                  className="px-4 py-2 text-xs font-bold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all"
                >
                  Keep Running
                </button>
                <button
                  type="button"
                  onClick={confirmStopMonitoring}
                  className="px-4 py-2 text-xs font-black text-white bg-red-600 border border-red-600 rounded-xl hover:bg-red-700 shadow-md shadow-red-500/20 transition-all"
                >
                  Yes, Stop Sending
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
