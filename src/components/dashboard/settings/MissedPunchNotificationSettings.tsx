import React, { useEffect, useState } from 'react';
import {
  Bell,
  Play,
  Save,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Mail,
  Users,
  Shield,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  User,
  Loader2,
  CalendarCheck,
  Info,
  Smartphone,
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import {
  useMissedPunchNotificationStore,
  type NotificationRunResult,
} from '../../../stores/missedPunchNotificationStore';

// ─── Toggle Switch ─────────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  id,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  id: string;
  disabled?: boolean;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={[
        'relative shrink-0 inline-flex items-center',
        'h-6 w-11 rounded-full border-2 border-transparent',
        'transition-colors duration-200 ease-in-out',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2',
        checked ? 'bg-indigo-600' : 'bg-gray-300',
        disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
      ].join(' ')}
    >
      <span
        className={[
          'pointer-events-none inline-block',
          'h-5 w-5 rounded-full bg-white shadow-md',
          'ring-0 transition-transform duration-200 ease-in-out',
          checked ? 'translate-x-5' : 'translate-x-0',
        ].join(' ')}
      />
    </button>
  );
}

// ─── Badges ───────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: NotificationRunResult['status'] }) {
  if (status === 'sent')
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
        <CheckCircle2 className="h-3 w-3" /> Sent
      </span>
    );
  if (status === 'failed')
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
        <XCircle className="h-3 w-3" /> Failed
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-500 border border-gray-200">
      <Mail className="h-3 w-3" /> No Email
    </span>
  );
}

function PunchTypeBadge({ type }: { type: 'MISSING_IN' | 'MISSING_OUT' }) {
  if (type === 'MISSING_IN')
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
        <Clock className="h-3 w-3" /> Missing Clock-In
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
      <Clock className="h-3 w-3" /> Missing Clock-Out
    </span>
  );
}

// ─── Recipient Card ───────────────────────────────────────────────────────────

function RecipientCard({
  id,
  icon,
  iconBg,
  iconColor,
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between p-4 rounded-xl border transition-all duration-200 ${
        checked && !disabled
          ? 'border-indigo-200 bg-indigo-50/40'
          : 'border-gray-200 bg-white'
      } ${disabled ? 'opacity-60' : ''}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className={`shrink-0 h-9 w-9 rounded-lg ${iconBg} flex items-center justify-center`}>
          <span className={iconColor}>{icon}</span>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 leading-tight">{label}</p>
          <p className="text-xs text-gray-500 mt-0.5 leading-tight">{description}</p>
        </div>
      </div>
      <Toggle id={id} checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MissedPunchNotificationSettings() {
  const {
    settings,
    loading,
    saving,
    running,
    lastRunAt,
    lastResults,
    error,
    fetchSettings,
    saveSettings,
    runNotificationCheck,
  } = useMissedPunchNotificationStore();

  const [checkDate, setCheckDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [showResults, setShowResults] = useState(false);
  const [localSettings, setLocalSettings] = useState(settings);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);
  useEffect(() => { setLocalSettings(settings); }, [settings]);

  const handleSave = async () => {
    try {
      await saveSettings(localSettings);
      toast.success('Notification settings saved!');
    } catch {
      toast.error('Failed to save settings');
    }
  };

  const handleRunCheck = async () => {
    try {
      const result = await runNotificationCheck(checkDate);
      setShowResults(true);
      if (result.sent === 0 && result.failed === 0 && result.noEmail === 0) {
        toast.success('✅ No missing punches found for the selected date!');
      } else {
        const parts: string[] = [];
        if (result.sent > 0) parts.push(`${result.sent} sent`);
        if (result.failed > 0) parts.push(`${result.failed} failed`);
        if (result.noEmail > 0) parts.push(`${result.noEmail} no email`);
        toast.success(`Check complete: ${parts.join(', ')}.`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Check failed');
    }
  };

  const sentCount = lastResults.filter(r => r.status === 'sent').length;
  const failedCount = lastResults.filter(r => r.status === 'failed').length;
  const noEmailCount = lastResults.filter(r => r.status === 'no_email').length;

  if (loading) {
    return (
      <div className="flex justify-center items-center py-24">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500 mx-auto mb-3" />
          <p className="text-sm text-gray-400">Loading settings…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full">

      {/* ── Description banner ── */}
      <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
        <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
        <p className="text-sm text-blue-800 leading-relaxed">
          Automatically alert employees and managers when a clock-in or clock-out is missing at the end of their shift.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ── Top row: Enable + Grace Buffer ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Enable card */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex flex-col justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Bell className="h-4 w-4 text-indigo-500" />
              <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">General</h3>
            </div>
            <p className="text-xs text-gray-400">Master on/off for missing punch notifications.</p>
          </div>
          <div className="flex items-center justify-between p-4 rounded-xl border border-gray-100 bg-gray-50">
            <div>
              <p className="text-sm font-semibold text-gray-900">Enable Notifications</p>
              <p className="text-xs text-gray-500 mt-0.5">System will flag and notify for missing punches</p>
            </div>
            <Toggle
              id="toggle-enabled"
              checked={localSettings.is_enabled}
              onChange={v => setLocalSettings(s => ({ ...s, is_enabled: v }))}
            />
          </div>
        </div>

        {/* Grace buffer card */}
        <div className={`bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex flex-col justify-between gap-4 ${!localSettings.is_enabled ? 'opacity-60' : ''}`}>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-indigo-500" />
              <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Detection Settings</h3>
            </div>
            <p className="text-xs text-gray-400">Wait buffer before flagging a missing clock-out.</p>
          </div>
          <div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="grace-buffer-start" className="block text-xs font-semibold text-gray-900 mb-1">
                  Shift Start Grace
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="grace-buffer-start"
                    type="number"
                    min={0}
                    max={240}
                    value={localSettings.grace_buffer_start_minutes ?? 30}
                    onChange={e =>
                      setLocalSettings(s => ({
                        ...s,
                        grace_buffer_start_minutes: Math.max(0, Math.min(240, Number(e.target.value))),
                      }))
                    }
                    disabled={!localSettings.is_enabled}
                    className="w-16 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400"
                  />
                  <span className="text-xs text-gray-500">min</span>
                </div>
              </div>
              
              <div>
                <label htmlFor="grace-buffer-end" className="block text-xs font-semibold text-gray-900 mb-1">
                  Shift End Grace
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="grace-buffer-end"
                    type="number"
                    min={0}
                    max={240}
                    value={localSettings.grace_buffer_end_minutes ?? 30}
                    onChange={e =>
                      setLocalSettings(s => ({
                        ...s,
                        grace_buffer_end_minutes: Math.max(0, Math.min(240, Number(e.target.value))),
                      }))
                    }
                    disabled={!localSettings.is_enabled}
                    className="w-16 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400"
                  />
                  <span className="text-xs text-gray-500">min</span>
                </div>
              </div>
            </div>
            
            <p className="text-xs text-gray-400 mt-3">
              Wait time after shift boundaries before flagging a missing punch.
            </p>
          </div>
        </div>
      </div>

      {/* ── Delivery Methods ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
          <Mail className="h-4 w-4 text-indigo-500" />
          <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Delivery Methods</h3>
        </div>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <RecipientCard
            id="toggle-via-email"
            icon={<Mail className="h-4 w-4" />}
            iconBg="bg-blue-50"
            iconColor="text-blue-600"
            label="Email Notification"
            description="Send standard email alerts"
            checked={localSettings.notify_via_email}
            onChange={v => setLocalSettings(s => ({ ...s, notify_via_email: v }))}
            disabled={!localSettings.is_enabled}
          />
          <RecipientCard
            id="toggle-via-app"
            icon={<Smartphone className="h-4 w-4" />}
            iconBg="bg-emerald-50"
            iconColor="text-emerald-600"
            label="In-App Notification"
            description="Send push alerts within the app"
            checked={localSettings.notify_via_app}
            onChange={v => setLocalSettings(s => ({ ...s, notify_via_app: v }))}
            disabled={!localSettings.is_enabled}
          />
        </div>
      </div>

      {/* ── Who Gets Notified ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
          <Users className="h-4 w-4 text-indigo-500" />
          <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Who Gets Notified</h3>
        </div>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <RecipientCard
            id="toggle-employee"
            icon={<User className="h-4 w-4" />}
            iconBg="bg-blue-50"
            iconColor="text-blue-600"
            label="Notify Employee"
            description="Send alert to employee's email"
            checked={localSettings.notify_employee}
            onChange={v => setLocalSettings(s => ({ ...s, notify_employee: v }))}
            disabled={!localSettings.is_enabled}
          />
          <RecipientCard
            id="toggle-reporting-head"
            icon={<Users className="h-4 w-4" />}
            iconBg="bg-violet-50"
            iconColor="text-violet-600"
            label="Notify Reporting Head"
            description="Alert the employee's manager"
            checked={localSettings.notify_reporting_head}
            onChange={v => setLocalSettings(s => ({ ...s, notify_reporting_head: v }))}
            disabled={!localSettings.is_enabled}
          />
          <RecipientCard
            id="toggle-hr-admin"
            icon={<Shield className="h-4 w-4" />}
            iconBg="bg-emerald-50"
            iconColor="text-emerald-600"
            label="Notify HR Admin"
            description="CC all Admin / HR role users"
            checked={localSettings.notify_hr_admin}
            onChange={v => setLocalSettings(s => ({ ...s, notify_hr_admin: v }))}
            disabled={!localSettings.is_enabled}
          />
        </div>
      </div>

      {/* ── Save Button ── */}
      <div className="flex justify-end">
        <button
          id="save-notification-settings"
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl shadow hover:bg-indigo-700 active:scale-95 transition-all focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
      </div>

      {/* ── Manual Run Check ── */}
      <div className="bg-gradient-to-r from-indigo-600 to-indigo-500 rounded-xl overflow-hidden shadow-md">
        <div className="px-6 py-5">
          <div className="flex items-center gap-2 mb-1">
            <Play className="h-4 w-4 text-indigo-100" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wide">Run Manual Check</h3>
          </div>
          <p className="text-sm text-indigo-100 mb-4">
            Select a date and trigger the missing-punch check immediately.
          </p>
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1">
              <label htmlFor="check-date" className="block text-xs font-bold text-indigo-200 mb-1.5 uppercase tracking-wide">
                Date to Check
              </label>
              <input
                id="check-date"
                type="date"
                value={checkDate}
                max={format(new Date(), 'yyyy-MM-dd')}
                onChange={e => setCheckDate(e.target.value)}
                className="w-full sm:w-auto border border-indigo-400/50 rounded-lg px-3 py-2 text-sm bg-white/10 text-white placeholder-indigo-300 focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-white/50 [color-scheme:dark]"
              />
            </div>
            <button
              id="run-missing-punch-check"
              type="button"
              onClick={handleRunCheck}
              disabled={running || !localSettings.is_enabled}
              className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-white text-indigo-700 text-sm font-bold rounded-xl shadow-sm hover:bg-indigo-50 active:scale-95 transition-all focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {running ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Running…</>
              ) : (
                <><CalendarCheck className="h-4 w-4" /> Run Check</>
              )}
            </button>
          </div>
          {!localSettings.is_enabled && (
            <p className="mt-3 text-xs text-indigo-200 flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              Enable notifications above before running the check.
            </p>
          )}
        </div>
      </div>

      {/* ── Results Panel ── */}
      {lastRunAt && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setShowResults(v => !v)}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-gray-100 flex items-center justify-center">
                <RefreshCw className="h-4 w-4 text-gray-500" />
              </div>
              <div className="text-left">
                <p className="text-sm font-bold text-gray-900">Last Run Results</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {format(new Date(lastRunAt), 'MMMM d, yyyy — h:mm a')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {lastResults.length === 0 ? (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <CheckCircle2 className="h-3 w-3" /> All Clear
                </span>
              ) : (
                <div className="flex items-center gap-1.5">
                  {sentCount > 0 && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <CheckCircle2 className="h-3 w-3" /> {sentCount} Sent
                    </span>
                  )}
                  {failedCount > 0 && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-50 text-red-700 border border-red-200">
                      <XCircle className="h-3 w-3" /> {failedCount} Failed
                    </span>
                  )}
                  {noEmailCount > 0 && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-600 border border-gray-200">
                      <Mail className="h-3 w-3" /> {noEmailCount} No Email
                    </span>
                  )}
                </div>
              )}
              {showResults
                ? <ChevronUp className="h-4 w-4 text-gray-400 ml-1" />
                : <ChevronDown className="h-4 w-4 text-gray-400 ml-1" />}
            </div>
          </button>

          {showResults && (
            <div className="border-t border-gray-100">
              {lastResults.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <div className="h-12 w-12 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-3">
                    <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                  </div>
                  <p className="text-sm font-semibold text-gray-700">No missing punches detected</p>
                  <p className="text-xs text-gray-400 mt-1">All employees have complete clock-in/out records.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-100">
                    <thead className="bg-gray-50">
                      <tr>
                        {['Employee', 'Shift', 'Issue', 'Status'].map(h => (
                          <th key={h} className="px-5 py-3 text-left text-[10px] font-extrabold text-gray-400 uppercase tracking-widest">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-50">
                      {lastResults.map((r, idx) => (
                        <tr key={idx} className="hover:bg-gray-50/60 transition-colors">
                          <td className="px-5 py-3.5">
                            <p className="text-sm font-semibold text-gray-900">{r.record.employee_name}</p>
                            <p className="text-xs text-gray-400">{r.record.employee_email}</p>
                            {r.record.employee_code && (
                              <p className="text-[10px] text-gray-400 font-mono">{r.record.employee_code}</p>
                            )}
                          </td>
                          <td className="px-5 py-3.5">
                            <p className="text-sm text-gray-800 font-medium">{r.record.shift_name}</p>
                            <p className="text-xs text-gray-400">
                              {r.record.shift_start_time} – {r.record.shift_end_time}
                            </p>
                          </td>
                          <td className="px-5 py-3.5">
                            <PunchTypeBadge type={r.record.missingType} />
                            {r.record.clock_in_time && (
                              <p className="text-[10px] text-gray-400 mt-1">
                                In: {format(new Date(r.record.clock_in_time), 'h:mm a')}
                              </p>
                            )}
                          </td>
                          <td className="px-5 py-3.5">
                            <StatusBadge status={r.status} />
                            {r.error && (
                              <p className="text-[10px] text-red-500 mt-1 max-w-[160px] truncate" title={r.error}>
                                {r.error}
                              </p>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
