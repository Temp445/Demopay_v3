import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import { Globe, Plus, Trash2, Save, ToggleLeft, ToggleRight, RefreshCw, ChevronDown, ChevronUp, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

// ─── All available application screens ────────────────────────────────────────
const ALL_SCREENS = [
  { group: 'Core', route: '/dashboard/employees', label: 'Employees' },
  { group: 'Core', route: '/dashboard/reporting', label: 'Employee Reporting' },
  { group: 'Core', route: '/dashboard/employee-invite', label: 'Employee Invite' },
  { group: 'Attendance', route: '/dashboard/attendance', label: 'Attendance' },
  { group: 'Attendance', route: '/dashboard/attendance/face-enrollment', label: 'Face Enrollment' },
  { group: 'Attendance', route: '/dashboard/attendance-face-verify', label: 'Attendance Face Verify' },
  { group: 'Attendance', route: '/dashboard/attendance-logs', label: 'Attendance Logs' },
  { group: 'Attendance', route: '/dashboard/attendance/device-employees', label: 'Device Employees' },
  { group: 'Attendance', route: '/dashboard/clockin-clockout', label: 'Clock In/Out' },
  { group: 'Attendance', route: '/dashboard/time-stamp-management', label: 'Time Stamp Management' },
  { group: 'Leave', route: '/dashboard/leave', label: 'Leave' },
  { group: 'Leave', route: '/dashboard/leave/types', label: 'Leave Types' },
  { group: 'Leave', route: '/dashboard/leave/settings', label: 'Leave Settings' },
  { group: 'Shifts', route: '/dashboard/shifts', label: 'Shifts' },
  { group: 'Shifts', route: '/dashboard/holidays', label: 'Holidays' },
  { group: 'Permissions', route: '/dashboard/permissions/request', label: 'Permission Request' },
  { group: 'Permissions', route: '/dashboard/permissions/approval', label: 'Permission Approval' },
  { group: 'Advances', route: '/dashboard/advances/request', label: 'Advance Request' },
  { group: 'Advances', route: '/dashboard/advances/approval', label: 'Advance Approval' },
  { group: 'Advances', route: '/dashboard/advances/settings', label: 'Advance Settings' },
  { group: 'Payroll', route: '/dashboard/component-master', label: 'Component Master' },
  { group: 'Payroll', route: '/dashboard/salary-structures', label: 'Salary Structures' },
  { group: 'Payroll', route: '/dashboard/structure-assignments', label: 'Structure Assignments' },
  { group: 'Payroll', route: '/dashboard/payroll-process', label: 'Payroll Process' },
  { group: 'Payroll', route: '/dashboard/payroll', label: 'Payroll' },
  { group: 'Payroll', route: '/dashboard/payslip-sender', label: 'Payslip Sender' },
  { group: 'Payroll', route: '/dashboard/formula-builder', label: 'Formula Builder' },
  { group: 'Payroll', route: '/dashboard/formula-tester', label: 'Formula Tester' },
  { group: 'Overtime', route: '/dashboard/overtime/employees', label: 'OT Employees' },
  { group: 'Overtime', route: '/dashboard/overtime/structures', label: 'OT Structures' },
  { group: 'Overtime', route: '/dashboard/overtime/approvals', label: 'OT Time Stamp' },
  { group: 'Overtime', route: '/dashboard/overtime/processing', label: 'OT Processing' },
  { group: 'Overtime', route: '/dashboard/overtime/settings', label: 'OT Settings' },
  { group: 'Statutory & Reports', route: '/dashboard/statutory', label: 'Statutory' },
  { group: 'Statutory & Reports', route: '/dashboard/reports', label: 'Reports' },
  { group: 'Visitors', route: '/dashboard/visitor-records', label: 'Visitor Log' },
  { group: 'Gate Pass & Location', route: '/dashboard/gate-passes', label: 'Gate Pass' },
  { group: 'Gate Pass & Location', route: '/dashboard/work-location-assignment', label: 'Work Location Assignment' },
  { group: 'Gate Pass & Location', route: '/dashboard/travel-allowance-approvals', label: 'Travel Allowance Approvals' },
  { group: 'Gate Pass & Location', route: '/dashboard/location-tracking', label: 'Location Tracking' },
  { group: 'Gate Pass & Location', route: '/dashboard/work-location', label: 'Work Location' },
  { group: 'Gate Pass & Location', route: '/dashboard/location-settings', label: 'Location Settings' },
  { group: 'Settings', route: '/dashboard/settings/company-settings', label: 'Company Settings' },
  { group: 'Settings', route: '/dashboard/settings/user-settings', label: 'Profile Settings' },
  { group: 'Settings', route: '/dashboard/settings/user-management', label: 'User Management' },
  { group: 'Settings', route: '/dashboard/settings/master-data-import', label: 'Master Data Import' },
  { group: 'Settings', route: '/dashboard/settings/smtp-configuration', label: 'SMTP Configuration' },
  { group: 'Settings', route: '/dashboard/settings/attendance-settings', label: 'Attendance Settings' },
  { group: 'Settings', route: '/dashboard/settings/biometric-device-manager', label: 'Biometric Device Manager' },
  { group: 'Settings', route: '/dashboard/settings/hik-device-controller', label: 'Hik Device Controller' },
  { group: 'Settings', route: '/dashboard/settings/shift-attendance-notifier', label: 'Shift Attendance Notifier' },
  { group: 'Settings', route: '/dashboard/notifications', label: 'Notifications' },
  { group: 'Access Control', route: '/dashboard/access-control', label: 'Screen Access Control' },
  { group: 'Access Control', route: '/dashboard/global-tenant-management', label: 'Tenant Screen Management' },
];

const GROUPS = [...new Set(ALL_SCREENS.map(s => s.group))];

// ─── Types ─────────────────────────────────────────────────────────────────────
interface DomainConfig {
  id?: string;
  domain_name: string;
  config: { screens: Record<string, boolean>; features?: Record<string, boolean> };
  is_active: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function buildDefaultConfig(): DomainConfig['config'] {
  const screens: Record<string, boolean> = {};
  ALL_SCREENS.forEach(s => { screens[s.route] = true; });
  return { screens, features: { live_tracking: true, face_enrollment: true } };
}

// ─── Domain Row Component ─────────────────────────────────────────────────────
function DomainRow({
  domain,
  onSave,
  onDelete,
}: {
  domain: DomainConfig;
  onSave: (d: DomainConfig) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [local, setLocal] = useState<DomainConfig>(domain);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [dirty, setDirty] = useState(false);

  const toggleScreen = (route: string) => {
    setLocal(prev => ({
      ...prev,
      config: {
        ...prev.config,
        screens: { ...prev.config.screens, [route]: !prev.config.screens[route] },
      },
    }));
    setDirty(true);
  };

  const toggleAll = (group: string, value: boolean) => {
    const groupRoutes = ALL_SCREENS.filter(s => s.group === group).map(s => s.route);
    setLocal(prev => ({
      ...prev,
      config: {
        ...prev.config,
        screens: {
          ...prev.config.screens,
          ...Object.fromEntries(groupRoutes.map(r => [r, value])),
        },
      },
    }));
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    await onSave(local);
    setSaving(false);
    setDirty(false);
  };

  const handleDelete = async () => {
    if (!local.id) return;
    if (!window.confirm(`Delete domain "${local.domain_name}"? This cannot be undone.`)) return;
    setDeleting(true);
    await onDelete(local.id);
    setDeleting(false);
  };

  const enabledCount = ALL_SCREENS.filter(s => local.config.screens[s.route] !== false).length;

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      {/* Header row */}
      <div className="flex items-center justify-between px-5 py-4 gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
            <Globe className="h-5 w-5 text-indigo-600" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 truncate">{local.domain_name}</p>
            <p className="text-xs text-gray-500">{enabledCount} / {ALL_SCREENS.length} screens enabled</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {dirty && (
            <span className="text-xs text-amber-600 font-medium bg-amber-50 px-2 py-1 rounded-full">Unsaved changes</span>
          )}
          {dirty && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </button>
          )}
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 text-sm font-medium rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors"
          >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          </button>
          <button
            onClick={() => setExpanded(e => !e)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {expanded ? 'Collapse' : 'Configure'}
          </button>
        </div>
      </div>

      {/* Expandable screen configurator */}
      {expanded && (
        <div className="border-t border-gray-100 px-5 py-5 bg-gray-50">
          <div className="space-y-5">
            {GROUPS.map(group => {
              const groupScreens = ALL_SCREENS.filter(s => s.group === group);
              const allEnabled = groupScreens.every(s => local.config.screens[s.route] !== false);
              const anyEnabled = groupScreens.some(s => local.config.screens[s.route] !== false);

              return (
                <div key={group}>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold text-gray-700">{group}</h4>
                    <div className="flex gap-2">
                      <button
                        onClick={() => toggleAll(group, true)}
                        className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded hover:bg-green-100 transition-colors"
                      >
                        Enable All
                      </button>
                      <button
                        onClick={() => toggleAll(group, false)}
                        className="text-xs px-2 py-1 bg-red-50 text-red-700 rounded hover:bg-red-100 transition-colors"
                      >
                        Disable All
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                    {groupScreens.map(screen => {
                      const enabled = local.config.screens[screen.route] !== false;
                      return (
                        <button
                          key={screen.route}
                          onClick={() => toggleScreen(screen.route)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all text-left ${
                            enabled
                              ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                              : 'bg-white border-gray-200 text-gray-400'
                          }`}
                        >
                          {enabled
                            ? <ToggleRight className="h-4 w-4 text-indigo-500 flex-shrink-0" />
                            : <ToggleLeft className="h-4 w-4 text-gray-300 flex-shrink-0" />
                          }
                          <span className="truncate">{screen.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DomainConfigManagerPage() {
  const [domains, setDomains] = useState<DomainConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [newDomain, setNewDomain] = useState('');
  const [adding, setAdding] = useState(false);

  const fetchDomains = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('domain_configurations')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      toast.error('Failed to load domain configurations.');
    } else {
      setDomains((data || []).map(d => ({
        id: d.id,
        domain_name: d.domain_name,
        config: d.config,
        is_active: d.is_active,
      })));
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchDomains(); }, [fetchDomains]);

  const handleAdd = async () => {
    const trimmed = newDomain.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
    if (!trimmed) { toast.error('Please enter a valid domain name.'); return; }
    if (domains.some(d => d.domain_name === trimmed)) { toast.error('This domain already exists.'); return; }

    setAdding(true);
    const { data, error } = await supabase
      .from('domain_configurations')
      .insert({ domain_name: trimmed, config: buildDefaultConfig(), is_active: true })
      .select()
      .single();

    if (error) {
      toast.error('Failed to add domain.');
    } else {
      setDomains(prev => [...prev, { id: data.id, domain_name: data.domain_name, config: data.config, is_active: data.is_active }]);
      setNewDomain('');
      toast.success(`Domain "${trimmed}" added. All screens enabled by default.`);
    }
    setAdding(false);
  };

  const handleSave = async (domain: DomainConfig) => {
    const { error } = await supabase
      .from('domain_configurations')
      .update({ config: domain.config, is_active: domain.is_active })
      .eq('id', domain.id!);

    if (error) {
      toast.error('Failed to save changes.');
    } else {
      toast.success(`"${domain.domain_name}" configuration saved.`);
      setDomains(prev => prev.map(d => d.id === domain.id ? domain : d));
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('domain_configurations').delete().eq('id', id);
    if (error) {
      toast.error('Failed to delete domain.');
    } else {
      setDomains(prev => prev.filter(d => d.id !== id));
      toast.success('Domain removed.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Domain Configuration</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage which screens are accessible per domain. Changes take effect immediately.
          </p>
        </div>
        <button
          onClick={fetchDomains}
          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Info Banner */}
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-xl p-4">
        <AlertCircle className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800">
          <strong>How it works:</strong> Add a domain (e.g., <code className="bg-blue-100 px-1 rounded">client1.acepayroll.in</code>), then toggle which screens are visible for users on that domain. The app automatically detects the current domain when it loads.
        </div>
      </div>

      {/* Add New Domain */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Add New Domain</h2>
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={newDomain}
              onChange={e => setNewDomain(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              placeholder="e.g., client1.acepayroll.in or localhost"
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button
            onClick={handleAdd}
            disabled={adding || !newDomain.trim()}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add Domain
          </button>
        </div>
      </div>

      {/* Domains List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 text-indigo-500 animate-spin" />
        </div>
      ) : domains.length === 0 ? (
        <div className="text-center py-16 bg-white border border-dashed border-gray-200 rounded-xl">
          <Globe className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No domains configured yet.</p>
          <p className="text-gray-400 text-sm mt-1">Add your first domain above to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {domains.map(domain => (
            <DomainRow
              key={domain.id}
              domain={domain}
              onSave={handleSave}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
