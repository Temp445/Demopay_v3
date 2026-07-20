import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../../lib/supabase';
import LiveAttendancePanel from './LiveAttendancePanel';

// ─── Types ───────────────────────────────────────────────────────────────────────

interface Employee {
  id: string;
  name: string;
  employee_code: string;
  status: string;
}

interface DeviceEmployee {
  employee_id: string;
  upload_status: 'uploaded' | 'not_uploaded' | 'failed';
  has_face: boolean;
  device_employee_no: string;
  uploaded_at: string | null;
}

interface MergedEmployee extends Employee {
  upload_status: 'uploaded' | 'not_uploaded' | 'failed';
  has_face: boolean;
  device_employee_no: string | null;
  uploaded_at: string | null;
}

interface UploadResult {
  employee_id: string;
  employee_code: string;
  normalized_code: string;
  status: string; // 'uploaded' | 'failed'
  message: string; // 'Success' | 'Already on device' | error string
}

interface Props {
  tenantId: string | null;
  settingsId: string | null;
  isMasterEnabled: boolean;
  deviceName?: string;
}

// ─── Toast System ────────────────────────────────────────────────────────────────

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: number;
  type: ToastType;
  title: string;
  body?: string;
}

let _toastId = 0;

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="fixed top-5 right-5 z-[150] flex flex-col gap-2 min-w-[300px] max-w-sm pointer-events-none">
      {toasts.map((t) => {
        const styles: Record<ToastType, { bg: string; border: string; icon: string; titleColor: string; bodyColor: string }> = {
          success: { bg: 'bg-white', border: 'border-l-4 border-emerald-500', icon: '✅', titleColor: 'text-emerald-800', bodyColor: 'text-emerald-700' },
          error:   { bg: 'bg-white', border: 'border-l-4 border-red-500',     icon: '❌', titleColor: 'text-red-800',     bodyColor: 'text-red-700'     },
          warning: { bg: 'bg-white', border: 'border-l-4 border-amber-500',   icon: '⚠️', titleColor: 'text-amber-800',   bodyColor: 'text-amber-700'   },
          info:    { bg: 'bg-white', border: 'border-l-4 border-blue-500',    icon: 'ℹ️', titleColor: 'text-blue-800',    bodyColor: 'text-blue-700'    },
        };
        const s = styles[t.type];
        return (
          <div
            key={t.id}
            onClick={() => onDismiss(t.id)}
            className={`pointer-events-auto ${s.bg} ${s.border} rounded-lg shadow-xl px-4 py-3 cursor-pointer animate-[slideInRight_0.25s_ease-out] hover:shadow-2xl transition-shadow`}
          >
            <div className={`font-bold text-sm ${s.titleColor} flex items-center gap-2`}>
              <span>{s.icon}</span> {t.title}
            </div>
            {t.body && <div className={`text-xs mt-1 ${s.bodyColor} leading-relaxed`}>{t.body}</div>}
          </div>
        );
      })}
    </div>
  );
}

function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = (id: number) => setToasts((p) => p.filter((t) => t.id !== id));
  const push = useCallback((type: ToastType, title: string, body?: string, duration = 5000) => {
    const id = ++_toastId;
    setToasts((p) => [...p, { id, type, title, body }]);
    setTimeout(() => dismiss(id), duration);
  }, []);
  return { toasts, push, dismiss };
}

// ─── Status Badge ────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === 'uploaded') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
        Uploaded
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
        Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-500">
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
      Not Uploaded
    </span>
  );
}

function ResultTag({ message }: { message: string }) {
  const isAlready = message.includes('Already on device');
  const isSuccess = message === 'Success';
  const isUpdated = message === 'Updated';
  if (isSuccess) return <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">Success</span>;
  if (isUpdated) return <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">Updated</span>;
  if (isAlready) return <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">Already on device</span>;
  return <span className="text-xs font-semibold text-red-700 bg-red-50 px-2 py-0.5 rounded-full">{message}</span>;
}

// ─── Main Component ──────────────────────────────────────────────────────────────

function formatDeviceError(msg: string): string {
  const lower = msg.toLowerCase();
  if (lower.includes('no route to host') || lower.includes('tcp connect error') || lower.includes('timeout') || lower.includes('connection refused')) {
    return 'Device is currently offline or unreachable. Please check the device network connection and IP address.';
  }
  if (lower.includes('error sending request for url') || lower.includes('failed to fetch')) {
    return 'Failed to communicate with the Master Device. It may be powered off or offline.';
  }
  if (lower.includes('unauthorized') || lower.includes('401')) {
    return 'Authentication failed. Please check the admin username and password in Device Settings.';
  }
  return msg;
}

export default function EmployeeUploadPanel({ tenantId, settingsId, isMasterEnabled, deviceName }: Props) {
  // Data & Selection State
  const [employees, setEmployees] = useState<MergedEmployee[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  // Loading & Result State
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSyncingDevice, setIsSyncingDevice] = useState(false);
  const [isSyncingNames, setIsSyncingNames] = useState(false);
  const [lastResults, setLastResults] = useState<UploadResult[] | null>(null);
  const [showResults, setShowResults] = useState(false);
  
  // Navigation & Filtering
  const [activeTab, setActiveTab] = useState<'device' | 'list'>('device');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'uploaded' | 'not_uploaded' | 'failed'>('all');
  const [faceFilter, setFaceFilter] = useState<'all' | 'added' | 'not_added'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 15;

  // Modals & Panels
  const [deleteModalEmp, setDeleteModalEmp] = useState<MergedEmployee | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLivePanelOpen, setIsLivePanelOpen] = useState(false);

  // Dynamic Device Name State
  const [fetchedDeviceName, setFetchedDeviceName] = useState<string>(deviceName || 'Main Device');

  const { toasts, push: pushToast, dismiss: dismissToast } = useToast();
  const activeSettingsIdRef = useRef<string | null>(null);

  // ─── Fetch Data ───
  const fetchData = useCallback(async (targetSettingsId: string) => {
    if (!tenantId || !targetSettingsId) return;
    
    setIsLoading(true);
    try {
      const [
        { data: empData, error: empErr }, 
        { data: deviceData, error: devErr },
        { data: settingsData }
      ] = await Promise.all([
        supabase
          .from('employees')
          .select('id, name, employee_code, status')
          .eq('tenant_id', tenantId)
          .order('employee_code', { ascending: true }),
        supabase
          .from('hik_device_employees')
          .select('employee_id, upload_status, has_face, device_employee_no, uploaded_at')
          .eq('tenant_id', tenantId)
          .eq('settings_id', targetSettingsId),
        supabase
          .from('hik_device_settings')
          .select('device_name')
          .eq('id', targetSettingsId)
          .single()
      ]);

      if (activeSettingsIdRef.current !== targetSettingsId) return;

      if (empErr) throw new Error(empErr.message);
      if (devErr) throw new Error(devErr.message);

      // Update the dynamic device name
      if (settingsData && settingsData.device_name) {
        setFetchedDeviceName(settingsData.device_name);
      }

      const deviceMap = new Map<string, DeviceEmployee>();
      (deviceData || []).forEach((d: DeviceEmployee) => deviceMap.set(d.employee_id, d));

      const merged: MergedEmployee[] = (empData || []).map((emp: Employee) => {
        const dev = deviceMap.get(emp.id);
        return {
          ...emp,
          upload_status: dev?.upload_status ?? 'not_uploaded',
          has_face: dev?.has_face ?? false,
          device_employee_no: dev?.device_employee_no ?? null,
          uploaded_at: dev?.uploaded_at ?? null,
        };
      });
      
      setEmployees(merged);
    } catch (err: unknown) {
      if (activeSettingsIdRef.current === targetSettingsId) {
        pushToast('error', 'Failed to load data', err instanceof Error ? err.message : undefined);
      }
    } finally {
      if (activeSettingsIdRef.current === targetSettingsId) {
        setIsLoading(false);
      }
    }
  }, [tenantId, pushToast]);

  useEffect(() => {
    activeSettingsIdRef.current = settingsId;
    
    if (tenantId && settingsId) {
      setEmployees([]); 
      setSelectedIds(new Set());
      setSearchQuery('');
      setCurrentPage(1);
      setShowResults(false);
      setLastResults(null);
      
      fetchData(settingsId);
    }
  }, [tenantId, settingsId, fetchData]);

  // ─── Actions ───
  const applyResultsToState = (results: UploadResult[]) => {
    const resultMap = new Map<string, UploadResult>();
    results.forEach((r) => resultMap.set(r.employee_id, r));

    setEmployees((prev) =>
      prev.map((emp) => {
        const result = resultMap.get(emp.id);
        if (!result) return emp;
        return {
          ...emp,
          upload_status: result.status === 'uploaded' ? 'uploaded' : 'failed',
          device_employee_no: result.normalized_code || emp.device_employee_no,
          uploaded_at: result.status === 'uploaded' ? new Date().toISOString() : emp.uploaded_at,
        };
      })
    );
  };

  const handleUpload = async () => {
    if (!tenantId || selectedIds.size === 0) return;
    if (!settingsId) {
      pushToast('error', 'Device not configured', 'Please save the device configuration first.');
      return;
    }

    setIsUploading(true);
    setLastResults(null);
    setShowResults(false);

    try {
      const { data, error } = await supabase.functions.invoke('upload-employees-to-device', {
        body: { tenantId, settingsId, employeeIds: Array.from(selectedIds) },
        headers: { 'x-hikvision-token': import.meta.env.VITE_HIKVISION_API_TOKEN },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      const results: UploadResult[] = data.results || [];
      const uploaded = results.filter((r) => r.status === 'uploaded');
      const failed   = results.filter((r) => r.status === 'failed');
      const alreadyOnDevice = uploaded.filter((r) => r.message.includes('Already on device'));
      const newlyUploaded   = uploaded.filter((r) => r.message === 'Success');
      const updated         = uploaded.filter((r) => r.message === 'Updated');

      applyResultsToState(results);
      setLastResults(results);
      setShowResults(true);
      setSelectedIds(new Set());

      if (failed.length === 0) {
        let msg = `${newlyUploaded.length} added`;
        if (updated.length) msg += `, ${updated.length} updated`;
        if (alreadyOnDevice.length) msg += `, ${alreadyOnDevice.length} already on device`;
        pushToast('success', `Upload complete — ${msg}`, undefined, 6000);
      } else if (newlyUploaded.length > 0 || alreadyOnDevice.length > 0 || updated.length > 0) {
        pushToast('warning', `Partial success — ${uploaded.length} uploaded/updated, ${failed.length} failed`, failed.map((r) => `${r.employee_code}: ${r.message}`).join(' · '), 8000);
      } else {
        pushToast('error', `Upload failed for all ${failed.length} employee${failed.length > 1 ? 's' : ''}`, failed.map((r) => `${r.employee_code}: ${r.message}`).join(' · '), 8000);
      }

      if (settingsId) fetchData(settingsId);
    } catch (err: unknown) {
      const rawMsg = err instanceof Error ? err.message : 'Unknown error';
      pushToast('error', 'Upload failed', formatDeviceError(rawMsg), 8000);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSyncNamesToDevice = async () => {
    if (!tenantId || !settingsId) {
      pushToast('error', 'Device not configured', 'Please save the device configuration first.');
      return;
    }
    const uploadedIds = employees.filter(e => e.upload_status === 'uploaded').map(e => e.id);
    if (uploadedIds.length === 0) {
      pushToast('info', 'No uploaded employees', 'No employees are currently on the device.');
      return;
    }
    
    setIsSyncingNames(true);
    try {
      const { data, error } = await supabase.functions.invoke('upload-employees-to-device', {
        body: { tenantId, settingsId, employeeIds: uploadedIds },
        headers: { 'x-hikvision-token': import.meta.env.VITE_HIKVISION_API_TOKEN },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      
      const results: UploadResult[] = data.results || [];
      const updated = results.filter(r => r.status === 'uploaded').length;
      const failed  = results.filter(r => r.status === 'failed').length;
      if (failed === 0) {
        pushToast('success', `Names synced — ${updated} employee${updated !== 1 ? 's' : ''} updated on device`, undefined, 5000);
      } else {
        pushToast('warning', `Partial sync — ${updated} updated, ${failed} failed`, results.filter(r => r.status === 'failed').map(r => r.employee_code).join(', '), 7000);
      }
    } catch (err: unknown) {
      const rawMsg = err instanceof Error ? err.message : 'Unknown error';
      pushToast('error', 'Name sync failed', formatDeviceError(rawMsg), 8000);
    } finally {
      setIsSyncingNames(false);
    }
  };

  const handleSyncDevice = async (silent = false) => {
    if (!tenantId) return;
    if (!settingsId) {
      if (!silent) pushToast('error', 'Device not configured', 'Please save the device configuration first.');
      return;
    }

    setIsSyncingDevice(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-device-employees', {
        body: { tenantId, settingsId },
        headers: { 'x-hikvision-token': import.meta.env.VITE_HIKVISION_API_TOKEN },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      if (!silent) pushToast('success', 'Device Sync Complete', `Synced ${data.synced_count || 0} employees from device.`);
      
      if (settingsId) fetchData(settingsId);
    } catch (err: unknown) {
      const rawMsg = err instanceof Error ? err.message : 'Unknown error occurred.';
      if (!silent) pushToast('error', 'Device Sync Failed', formatDeviceError(rawMsg), 8000);
    } finally {
      setIsSyncingDevice(false);
    }
  };

  const handleDeleteDeviceEmployee = async () => {
    if (!deleteModalEmp || !tenantId || !settingsId) return;
    setIsDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke('delete-device-employee', {
        body: { tenantId, settingsId, employeeId: deleteModalEmp.id },
        headers: { 'x-hikvision-token': import.meta.env.VITE_HIKVISION_API_TOKEN },
      });

      if (error) throw new Error(error.message);
      if (data && data.success === false) throw new Error(data.error || "Failed to remove employee from the device.");

      pushToast('success', 'Deleted from Device', `${deleteModalEmp.name} was removed from the physical device.`);
      
      setEmployees(prev => prev.map(e => e.id === deleteModalEmp.id ? { 
        ...e, upload_status: 'not_uploaded', device_employee_no: null, uploaded_at: null, has_face: false
      } : e));
      setSelectedIds(s => { const ns = new Set(s); ns.delete(deleteModalEmp.id); return ns; });
      setDeleteModalEmp(null);
      setDeleteConfirmText('');

      setTimeout(() => { if (settingsId) fetchData(settingsId); }, 500);

    } catch (err: unknown) {
      const rawMsg = err instanceof Error ? err.message : 'Unknown error';
      pushToast('error', 'Delete Failed', formatDeviceError(rawMsg), 8000);
    } finally {
      setIsDeleting(false);
    }
  };

  // ─── Filtering & Selection ───
  const filteredEmployees = employees.filter((e) => {
    // Tab filtering: 'device' tab only shows uploaded employees
    if (activeTab === 'device' && e.upload_status !== 'uploaded') return false;
    
    // Status filtering: only relevant for 'list' tab
    if (activeTab === 'list' && filterStatus !== 'all' && e.upload_status !== filterStatus) return false;
    
    // Face filtering: works for both tabs
    if (faceFilter !== 'all') {
      if (faceFilter === 'added' && !e.has_face) return false;
      if (faceFilter === 'not_added' && e.has_face) return false;
    }
    
    const q = searchQuery.toLowerCase();
    if (q) return e.name.toLowerCase().includes(q) || (e.employee_code || '').toLowerCase().includes(q);
    
    return true;
  });

  const totalPages = Math.ceil(filteredEmployees.length / rowsPerPage) || 1;
  const paginatedEmployees = filteredEmployees.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  const allFilteredSelected = filteredEmployees.length > 0 && filteredEmployees.every((e) => selectedIds.has(e.id));

  const toggleSelectAll = () => {
    const s = new Set(selectedIds);
    if (allFilteredSelected) {
      filteredEmployees.forEach((e) => s.delete(e.id));
    } else {
      filteredEmployees.forEach((e) => s.add(e.id));
    }
    setSelectedIds(s);
  };

  const toggleEmployee = (id: string) => {
    const s = new Set(selectedIds);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelectedIds(s);
  };

  const uploadedCount = employees.filter((e) => e.upload_status === 'uploaded').length;
  const faceCount     = employees.filter((e) => e.has_face).length;

  return (
    <>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* --- LIVE LOGS SIDE PANEL --- */}
      <LiveAttendancePanel 
        isOpen={isLivePanelOpen} 
        onClose={() => setIsLivePanelOpen(false)} 
        tenantId={tenantId} 
        settingsId={settingsId}
        deviceName={fetchedDeviceName} 
      />

      {/* --- DELETE CONFIRMATION MODAL --- */}
      {deleteModalEmp && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 animate-[slideInRight_0.15s_ease-out]">
            <h3 className="text-lg font-bold text-slate-900 mb-2">Delete from Device</h3>
            <p className="text-sm text-slate-500 mb-6 flex-wrap">
              This will permanently delete <strong className="text-slate-800">{deleteModalEmp.name}</strong> from the physical HikVision device. Their data will remain in your database.
            </p>
            
            {(() => {
              const originalCode = deleteModalEmp.employee_code || "";
              const normalizedCode = originalCode.replace(/\s+/g, "");
              const isConfirmValid = deleteConfirmText.trim() === originalCode || deleteConfirmText.trim() === normalizedCode;

              return (
                <>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Type <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 text-slate-800 tracking-wider select-all">{originalCode}</span> to confirm:
                  </label>
                  <input 
                    type="text" 
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-all placeholder:text-slate-300"
                    placeholder={originalCode}
                  />

                  <div className="flex gap-3 justify-end mt-8">
                    <button 
                      onClick={() => { setDeleteModalEmp(null); setDeleteConfirmText(''); }}
                      className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                      disabled={isDeleting}
                    >
                      Cancel
                    </button>
                    <button 
                      disabled={!isConfirmValid || isDeleting}
                      onClick={handleDeleteDeviceEmployee}
                      className="px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all"
                    >
                      {isDeleting ? 'Deleting...' : 'Delete from Device'}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(60px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>

      {/* --- MAIN DASHBOARD PANEL --- */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden transition-all duration-300">
        
        {/* Panel Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div>
            <h2 className="text-base font-bold text-slate-800">Employee Upload Panel</h2>
            {fetchedDeviceName && (
              <p className="text-xs text-slate-500 mt-0.5">
                Targeting device: <span className="font-semibold text-indigo-600">{fetchedDeviceName}</span>
              </p>
            )}
          </div>
          
          {/* LIVE LOGS BUTTON */}
          <button 
            onClick={() => setIsLivePanelOpen(true)}
            disabled={!isMasterEnabled}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-bold hover:bg-slate-900 transition-all shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
            </svg>
            Device Logs
          </button>
        </div>

        {!isMasterEnabled ? (
          <div className="flex flex-col items-center justify-center py-20 px-8 text-center bg-slate-50/50">
            <div className="w-16 h-16 bg-slate-200 text-slate-400 rounded-full flex items-center justify-center mb-5">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-slate-700 mb-2">Device is Disabled</h3>
            <p className="text-sm text-slate-500 max-w-sm">
              This device is currently disabled. Please turn on the <strong>Enabled</strong> toggle in the Device Settings panel to view and manage employees.
            </p>
          </div>
        ) : (
          <div className="p-6 space-y-5">
            {/* Stats Row */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 text-center">
                <div className="text-2xl font-extrabold text-slate-900">{employees.length}</div>
                <div className="text-xs text-slate-500 mt-0.5 font-medium">Total</div>
              </div>
              <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-200 text-center">
                <div className="text-2xl font-extrabold text-emerald-700">{uploadedCount}</div>
                <div className="text-xs text-emerald-600 mt-0.5 font-medium">On Device</div>
              </div>
              <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-200 text-center">
                <div className="text-2xl font-extrabold text-indigo-700">{faceCount}</div>
                <div className="text-xs text-indigo-600 mt-0.5 font-medium">Face Enrolled</div>
              </div>
            </div>

            {/* Upload Results Drawer */}
            {showResults && lastResults && (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200">
                  <h4 className="text-sm font-bold text-slate-700">Last Upload Results</h4>
                  <button onClick={() => setShowResults(false)} className="text-slate-400 hover:text-slate-600 transition-colors text-lg leading-none">&times;</button>
                </div>
                <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto">
                  {lastResults.map((r) => (
                    <div key={r.employee_id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                      <div>
                        <span className="font-semibold text-slate-800">{r.employee_code}</span>
                        {r.normalized_code !== r.employee_code && (
                          <span className="ml-2 font-mono text-xs text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">→ {r.normalized_code}</span>
                        )}
                      </div>
                      <ResultTag message={r.message} />
                    </div>
                  ))}
                </div>
                <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 flex flex-wrap gap-4 text-xs text-slate-500 font-medium">
                  <span className="text-emerald-700">✓ {lastResults.filter((r) => r.status === 'uploaded' && r.message === 'Success').length} new</span>
                  <span className="text-amber-600">✎ {lastResults.filter((r) => r.message === 'Updated').length} updated</span>
                  {/* <span className="text-blue-600">◈ {lastResults.filter((r) => r.message.includes('Already on device')).length} already existed</span> */}
                  <span className="text-red-600">✗ {lastResults.filter((r) => r.status === 'failed').length} failed</span>
                </div>
              </div>
            )}

            {/* Tabs */}
            <div className="flex border-b border-slate-200 mb-4">
              <button
                onClick={() => { setActiveTab('device'); setSearchQuery(''); setCurrentPage(1); }}
                className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
                  activeTab === 'device'
                    ? 'border-emerald-500 text-emerald-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2h-4M9 3a2 2 0 002 2h2a2 2 0 002-2M9 3a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                Employees in Device
                <span className="ml-1 px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700 font-bold">
                  {uploadedCount}
                </span>
              </button>
              <button
                onClick={() => { setActiveTab('list'); setSearchQuery(''); setCurrentPage(1); }}
                className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
                  activeTab === 'list'
                    ? 'border-indigo-500 text-indigo-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Employee List
                <span className="ml-1 px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-600 font-bold">
                  {employees.length}
                </span>
              </button>
            </div>

            {/* Toolbar (Search & Actions) */}
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-200 mb-4">
              <div className="flex flex-1 max-w-lg gap-2">
                <div className="relative flex-1">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    placeholder={activeTab === 'device' ? 'Search device employees…' : 'Search employees…'}
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                    className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-slate-200 shadow-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-medium"
                  />
                </div>
                {activeTab === 'list' && (
                  <div className="relative min-w-[140px]">
                    <select
                      value={filterStatus}
                      onChange={(e) => { setFilterStatus(e.target.value as any); setCurrentPage(1); }}
                      className="w-full pl-3 pr-8 py-2 text-sm bg-white border border-slate-200 shadow-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium appearance-none text-slate-700"
                    >
                      <option value="all">All Status</option>
                      <option value="uploaded">Uploaded</option>
                      <option value="not_uploaded">Not Uploaded</option>
                      <option value="failed">Failed</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                    </div>
                  </div>
                )}

                {/* Face Filter - Shown only for 'device' tab */}
                {activeTab === 'device' && (
                  <div className="relative min-w-[140px]">
                    <select
                      value={faceFilter}
                      onChange={(e) => { setFaceFilter(e.target.value as any); setCurrentPage(1); }}
                      className="w-full pl-3 pr-8 py-2 text-sm bg-white border border-slate-200 shadow-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium appearance-none text-slate-700"
                    >
                      <option value="all">All Face Status</option>
                      <option value="added">Face Added</option>
                      <option value="not_added">Not Added</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {activeTab === 'device' && (
                  <button
                    onClick={handleSyncNamesToDevice}
                    disabled={isSyncingNames || isLoading || uploadedCount === 0}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 shadow-sm rounded-lg hover:bg-amber-100 transition-colors font-medium disabled:opacity-50 whitespace-nowrap"
                    title="Push updated names to device"
                  >
                    {isSyncingNames ? (
                      <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                    )}
                    {isSyncingNames ? 'Syncing…' : 'Sync Names to Device'}
                  </button>
                )}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleSyncDevice(false)}
                    disabled={isSyncingDevice || isLoading}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 bg-white border border-slate-200 shadow-sm rounded-lg hover:bg-slate-50 transition-colors font-medium disabled:opacity-50"
                    title="Pull employees from device"
                  >
                    {isSyncingDevice ? (
                      <svg className="w-3.5 h-3.5 animate-spin text-slate-500" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    ) : (
                      <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    )}
                    {isSyncingDevice ? 'Syncing...' : 'Check Employee in Device'}
                  </button>
                  <button onClick={() => settingsId && fetchData(settingsId)} disabled={isLoading} className="p-2 text-slate-500 bg-white border border-slate-200 shadow-sm rounded-lg hover:bg-slate-50 hover:text-indigo-600 transition-colors disabled:opacity-50" title="Refresh">
                    <svg className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                  </button>
                </div>
                {activeTab === 'list' && (
                  <button
                    onClick={handleUpload}
                    disabled={selectedIds.size === 0 || isUploading}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg font-semibold text-sm shadow-sm hover:bg-indigo-700 active:scale-[0.99] disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed transition-all whitespace-nowrap"
                  >
                    {isUploading ? (
                      <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Uploading…</>
                    ) : (
                      <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>Upload ({selectedIds.size})</>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Tables */}
            {isLoading ? (
              <div className="flex items-center justify-center py-14 text-slate-400 text-sm gap-3">
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                Loading employees…
              </div>
            ) : activeTab === 'device' ? (
              (() => {
                const deviceEmps = paginatedEmployees;
                return (
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-emerald-50 border-b border-slate-200">
                          <th className="px-4 py-3 text-left font-semibold text-slate-500 text-xs uppercase tracking-wide">Employee</th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-500 text-xs uppercase tracking-wide hidden sm:table-cell">Device ID</th>
                          <th className="px-4 py-3 text-center font-semibold text-slate-500 text-xs uppercase tracking-wide hidden md:table-cell">Face Status</th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-500 text-xs uppercase tracking-wide hidden lg:table-cell">Uploaded At</th>
                          <th className="w-12 px-4 py-3"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {deviceEmps.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-4 py-12 text-center text-slate-400 text-sm">
                              {searchQuery ? 'No device employees match your search.' : 'No employees have been uploaded to this device yet.'}
                            </td>
                          </tr>
                        ) : deviceEmps.map(emp => (
                          <tr key={emp.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3.5">
                              <div className="font-semibold text-slate-800">{emp.name}</div>
                              <div className="text-xs text-slate-400 mt-0.5">{emp.employee_code}</div>
                            </td>
                            <td className="px-4 py-3.5 hidden sm:table-cell">
                              <span className="font-mono text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">{emp.device_employee_no || '—'}</span>
                            </td>
                            <td className="px-4 py-3.5 text-center hidden md:table-cell">
                              {emp.has_face ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-semibold">
                                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                                  Added
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 text-xs font-semibold">
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                  Not Added
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3.5 hidden lg:table-cell">
                              <span className="text-xs text-slate-500">{emp.uploaded_at ? new Date(emp.uploaded_at).toLocaleDateString() : '—'}</span>
                            </td>
                            <td className="px-4 py-3.5 text-center">
                              <button onClick={() => setDeleteModalEmp(emp)} className="p-1.5 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-lg transition-colors" title={`Remove ${emp.name} from device`}>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()
            ) : (
              (() => {
                return (
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="w-10 px-4 py-3 text-left">
                            <input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAll} className="w-4 h-4 rounded accent-indigo-600 cursor-pointer" />
                          </th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-500 text-xs uppercase tracking-wide">Employee</th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-500 text-xs uppercase tracking-wide hidden sm:table-cell">Code</th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-500 text-xs uppercase tracking-wide">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {paginatedEmployees.length === 0 ? (
                          <tr><td colSpan={4} className="px-4 py-12 text-center text-slate-400 text-sm">No employees found.</td></tr>
                        ) : paginatedEmployees.map(emp => (
                          <tr key={emp.id} onClick={() => toggleEmployee(emp.id)} className={`cursor-pointer transition-colors duration-100 ${selectedIds.has(emp.id) ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}>
                            <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                              <input type="checkbox" checked={selectedIds.has(emp.id)} onChange={() => toggleEmployee(emp.id)} className="w-4 h-4 rounded accent-indigo-600 cursor-pointer" />
                            </td>
                            <td className="px-4 py-3.5">
                              <div className="font-semibold text-slate-800">{emp.name}</div>
                            </td>
                            <td className="px-4 py-3.5 hidden sm:table-cell">
                              <span className="font-mono text-xs text-slate-600 bg-slate-100 px-2 py-0.5 rounded">{emp.employee_code || '—'}</span>
                            </td>
                            <td className="px-4 py-3.5"><StatusBadge status={emp.upload_status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()
            )}
            
            {/* Footer Pagination */}
            {!isLoading && filteredEmployees.length > 0 && (
              <div className="flex items-center justify-between text-xs text-slate-500 pt-2">
                <div>
                  {filteredEmployees.length} employees 
                  {selectedIds.size > 0 && activeTab === 'list' && (
                    <span className="ml-2 font-medium text-indigo-600 px-2 py-0.5 rounded-full bg-indigo-50">
                      ({selectedIds.size} selected)
                    </span>
                  )}
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center gap-1">
                    <button 
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
                      disabled={currentPage === 1} 
                      className="px-3 py-1.5 border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50 transition-colors font-medium text-slate-600"
                    >
                      Prev
                    </button>
                    <div className="px-4 font-semibold text-slate-700 bg-slate-50 border border-slate-100 py-1.5 rounded">
                      {currentPage} / {totalPages}
                    </div>
                    <button 
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} 
                      disabled={currentPage === totalPages} 
                      className="px-3 py-1.5 border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50 transition-colors font-medium text-slate-600"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            )}

          </div>
        )}
      </div>
    </>
  );
}