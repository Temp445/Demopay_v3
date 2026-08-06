import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { useSettingsStore } from '../../../stores/settingsStore';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DeviceSetting {
  id: string;
  device_name: string;
  device_ip: string;
  admin_user: string;
  admin_password: string;
  is_enabled: boolean;
  enable_auto_sync: boolean;
  auto_employee_upload: boolean;
  branch_location_id?: string;
}

const emptyDevice = (): Omit<DeviceSetting, 'id'> => ({
  device_name: '',
  device_ip: '',
  admin_user: '',
  admin_password: '',
  is_enabled: false,
  enable_auto_sync: false,
  auto_employee_upload: false,
  branch_location_id: '',
});

// ─── Device Card ─────────────────────────────────────────────────────────────

function DeviceCard({
  device,
  isSelected,
  status,
  onClick,
  onDelete,
}: {
  device: DeviceSetting;
  isSelected: boolean;
  status?: 'testing' | 'online' | 'offline' | 'unauthorized';
  onClick: () => void;
  onDelete: (id: string) => void;
}) {

  const getStatusBadge = () => {
    if (!device.is_enabled) return <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full text-[10px] font-bold">Disabled</span>;
    if (status === 'testing') return <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full text-[10px] font-bold animate-pulse">Connecting...</span>;
    if (status === 'online') return <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full text-[10px] font-bold">Online</span>;
    if (status === 'unauthorized') return <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full text-[10px] font-bold" title="Invalid Username or Password">Auth Error</span>;
    if (status === 'offline') return <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-[10px] font-bold" title="Invalid IP or Device Unreachable">Offline</span>;
    return <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full text-[10px] font-bold">Enabled</span>;
  };

  return (
    <div
      onClick={onClick}
      className={`relative p-4 rounded-xl border cursor-pointer transition-all duration-200 group
        ${isSelected
          ? 'bg-blue-50 border-blue-400 ring-1 ring-blue-400 shadow-sm'
          : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'
        }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-sm text-slate-800 truncate">{device.device_name || 'Unnamed Device'}</h3>
            {getStatusBadge()}
          </div>
          <p className="text-xs text-slate-500 mt-0.5 font-mono truncate">{device.device_ip || '—'}</p>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(device.id); }}
          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-all shrink-0"
          title="Delete device"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DeviceController() {
  const navigate = useNavigate();
  const { tenantId } = useAuth();
  const { companySettings, fetchCompanySettings } = useSettingsStore();

  const [devices, setDevices] = useState<DeviceSetting[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [isLoadingDevices, setIsLoadingDevices] = useState(false);
  const [deviceStatuses, setDeviceStatuses] = useState<Record<string, 'testing' | 'online' | 'offline' | 'unauthorized'>>({});
  const [form, setForm] = useState<Omit<DeviceSetting, 'id'>>(emptyDevice());
  const [isSaving, setIsSaving] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'online' | 'offline' | 'unauthorized'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const checkDeviceStatus = async (device: DeviceSetting) => {
    if (!device.is_enabled) return;
    setDeviceStatuses(prev => ({ ...prev, [device.id]: 'testing' }));
    try {
      const { data, error } = await supabase.functions.invoke('test-hik-connection', {
        body: { device_ip: device.device_ip, admin_user: device.admin_user, admin_password: device.admin_password },
        headers: { 'x-hikvision-token': import.meta.env.VITE_HIKVISION_API_TOKEN },
      });
      if (error) throw error;
      setDeviceStatuses(prev => ({ ...prev, [device.id]: data.status }));
    } catch {
      setDeviceStatuses(prev => ({ ...prev, [device.id]: 'offline' }));
    }
  };

  const fetchDevices = useCallback(async () => {
    if (!tenantId) return;
    setIsLoadingDevices(true);
    const { data, error } = await supabase
      .from('hik_device_settings')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('device_name', { ascending: true });

    setIsLoadingDevices(false);
    if (error) { console.error(error); return; }

    const list: DeviceSetting[] = (data || []).map((d: any) => ({
      id: d.id,
      device_name: d.device_name || 'Main Device',
      device_ip: d.device_ip,
      admin_user: d.admin_user,
      admin_password: d.admin_password,
      is_enabled: d.is_enabled ?? false,
      enable_auto_sync: d.enable_auto_sync ?? false,
      auto_employee_upload: d.auto_employee_upload ?? false,
      branch_location_id: d.branch_location_id || '',
    }));
    setDevices(list);

    list.forEach(dev => checkDeviceStatus(dev));

    if (list.length > 0 && !selectedDeviceId && !isAddingNew) {
      selectDevice(list[0]);
    }
  }, [tenantId]);

  useEffect(() => {
    if (tenantId) {
      fetchDevices();
      fetchCompanySettings();
    }
  }, [tenantId]);

  const selectDevice = (device: DeviceSetting) => {
    setSelectedDeviceId(device.id);
    setIsAddingNew(false);
    setForm({
      device_name: device.device_name,
      device_ip: device.device_ip,
      admin_user: device.admin_user,
      admin_password: device.admin_password,
      is_enabled: device.is_enabled,
      enable_auto_sync: device.enable_auto_sync,
      auto_employee_upload: device.auto_employee_upload,
      branch_location_id: device.branch_location_id || '',
    });
    setTestStatus('idle');
    setTestMessage('');
  };

  const startAddNew = () => {
    setIsAddingNew(true);
    setSelectedDeviceId(null);
    setForm(emptyDevice());
    setTestStatus('idle');
    setTestMessage('');
  };

  const handleTestConnection = async () => {
    if (!form.device_ip || !form.admin_user || !form.admin_password) {
      return alert("Please fill in the Device IP, Admin Username, and Admin Password first.");
    }

    setTestStatus('testing');
    setTestMessage('Pinging device...');

    try {
      const { data, error } = await supabase.functions.invoke('test-hik-connection', {
        body: {
          device_ip: form.device_ip.trim(),
          admin_user: form.admin_user.trim(),
          admin_password: form.admin_password
        },
        headers: { 'x-hikvision-token': import.meta.env.VITE_HIKVISION_API_TOKEN },
      });

      if (error) throw new Error(error.message);

      setTestStatus(data.status || 'offline');
      setTestMessage(data.message || 'Unknown response');
    } catch (err: any) {
      setTestStatus('offline');
      setTestMessage(err.message || 'Network timeout or invalid IP address.');
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId) return alert('Error: No active tenant ID found.');
    if (!form.device_name.trim()) return alert('Please enter a device name.');
    if (!form.device_ip.trim()) return alert('Please enter the device IP.');

    setIsSaving(true);
    const cleanedIp = form.device_ip.trim();

    const ipExists = devices.some((d) => d.device_ip === cleanedIp && d.id !== selectedDeviceId);
    if (ipExists) {
      setIsSaving(false);
      return alert('A device with this IP address already exists. Please use a unique IP.');
    }

    const payload = {
      device_name: form.device_name.trim(),
      device_ip: cleanedIp,
      admin_user: form.admin_user,
      admin_password: form.admin_password,
      is_enabled: form.is_enabled,
      enable_auto_sync: form.enable_auto_sync,
      auto_employee_upload: form.auto_employee_upload,
      branch_location_id: form.branch_location_id || null,
      tenant_id: tenantId,
    };

    let savedId = selectedDeviceId;

    if (selectedDeviceId) {
      const { error } = await supabase.from('hik_device_settings').update(payload).eq('id', selectedDeviceId);
      if (error) { setIsSaving(false); return alert('Error updating settings: ' + error.message); }
    } else {
      const { data, error } = await supabase.from('hik_device_settings').insert([payload]).select().single();
      if (error) { setIsSaving(false); return alert('Error saving settings: ' + error.message); }
      if (data) savedId = data.id;
    }

    alert(selectedDeviceId ? 'Configuration saved successfully!' : 'Device added successfully!');
    window.dispatchEvent(new Event('hik-devices-updated'));

    setIsSaving(false);
    setIsAddingNew(false);

    if (savedId && !selectedDeviceId) setSelectedDeviceId(savedId);
    await fetchDevices();
  };

  const handleDeleteDevice = async () => {
    if (!deleteTargetId) return;
    setIsDeleting(true);
    const { error } = await supabase.from('hik_device_settings').delete().eq('id', deleteTargetId);

    setIsDeleting(false);
    setDeleteTargetId(null);

    if (error) return alert('Error deleting device: ' + error.message);
    window.dispatchEvent(new Event('hik-devices-updated'));

    setDevices(prev => prev.filter(d => d.id !== deleteTargetId));
    if (selectedDeviceId === deleteTargetId) {
      setSelectedDeviceId(null);
      setIsAddingNew(false);
      setForm(emptyDevice());
    }
    await fetchDevices();
  };

  const selectedDevice = devices.find(d => d.id === selectedDeviceId) ?? null;
  const panelTitle = isAddingNew ? 'Add New Device' : selectedDevice ? selectedDevice.device_name || 'Device Settings' : 'Device Settings';
  const isMasterEnabled = form.is_enabled;

  return (
    <div className="min-h-screen  font-sans text-slate-800">
      <div className="mx-auto">

        <div className="mb-8">
          <button
            onClick={() => navigate('/dashboard/settings/biometric-device-manager')}
            className="flex items-center text-sm font-medium text-slate-500 hover:text-blue-600 transition-colors mb-4 group"
          >
            <ArrowLeft className="w-4 h-4 mr-1.5 transition-transform group-hover:-translate-x-1" />
            Back
          </button>
          <h1 className="text-xl font-extrabold tracking-tight text-slate-900">Hikvision Controller</h1>
          <p className="text-slate-500 mt-2 text-base">Manage biometric device connections and synchronize attendance data.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* Sidebar */}
          <div className="lg:col-span-4">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Devices</h2>
                <button onClick={startAddNew} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${isAddingNew ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-700'}`}>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                  Add
                </button>
              </div>

              <div className="p-3 space-y-2 min-h-[120px]">
                {isLoadingDevices ? (
                  <div className="flex items-center justify-center py-8 text-slate-400 text-sm">Loading…</div>
                ) : devices.length === 0 && !isAddingNew ? (
                  <div className="py-8 text-center text-slate-400"><p className="text-xs font-medium">No devices yet.</p></div>
                ) : (
                  devices.map(device => (
                    <DeviceCard
                      key={device.id}
                      device={device}
                      status={deviceStatuses[device.id]}
                      isSelected={selectedDeviceId === device.id && !isAddingNew}
                      onClick={() => selectDevice(device)}
                      onDelete={(id) => setDeleteTargetId(id)}
                    />
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Main Settings Panel */}
          <div className="lg:col-span-8">
            {(selectedDevice || isAddingNew) ? (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">

                <div className={`p-5 border-b border-slate-100 flex items-center justify-between relative overflow-hidden transition-colors duration-300 ${!isMasterEnabled ? 'bg-slate-100 grayscale' : 'bg-slate-50/50'}`}>
                  <div className="relative z-10">
                    <h2 className="text-lg font-bold text-slate-800">{panelTitle}</h2>
                  </div>
                  <label className="relative z-10 flex items-center cursor-pointer bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-sm hover:bg-slate-50 transition group">
                    <div className="relative">
                      <input type="checkbox" className="sr-only" checked={form.is_enabled} onChange={() => setForm(f => ({ ...f, is_enabled: !f.is_enabled }))} />
                      <div className={`block w-10 h-6 rounded-full transition-colors duration-300 ${form.is_enabled ? 'bg-blue-600' : 'bg-slate-300'}`} />
                      <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full shadow-sm transition-transform duration-300 ${form.is_enabled ? 'translate-x-4' : ''}`} />
                    </div>
                    <span className={`ml-2.5 text-xs font-bold tracking-wide ${form.is_enabled ? 'text-blue-700' : 'text-slate-500'}`}>
                      {form.is_enabled ? 'ENABLED' : 'DISABLED'}
                    </span>
                  </label>
                </div>

                <div className="p-5 flex-grow">
                  <form onSubmit={handleSaveSettings} className="space-y-6">
                    <div className={`space-y-6 transition-opacity duration-300 ${!isMasterEnabled ? 'opacity-60 pointer-events-none' : ''}`}>

                      {/* Connection Details */}
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Connection Details</h3>
                          <button type="button" onClick={handleTestConnection} disabled={testStatus === 'testing'} className="flex items-center gap-1.5 px-3 py-1 bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-blue-700 text-xs font-bold rounded-lg transition-colors">
                            Test Connection
                          </button>
                        </div>

                        {testStatus !== 'idle' && testStatus !== 'testing' && (
                          <div className={`p-3 rounded-lg mb-4 text-xs font-semibold flex items-start gap-2 ${testStatus === 'online' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : testStatus === 'unauthorized' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                            <span>{testStatus === 'online' ? '✅' : testStatus === 'unauthorized' ? '⚠️' : '❌'}</span>
                            <span>{testMessage}</span>
                          </div>
                        )}

                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Device Name</label>
                            <input type="text" value={form.device_name} onChange={e => setForm(f => ({ ...f, device_name: e.target.value }))} required className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                          </div>
                          <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Device (IP:PORT)</label>
                            <input type="text" value={form.device_ip} onChange={e => setForm(f => ({ ...f, device_ip: e.target.value }))} required className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Device Username</label>
                              <input type="text" value={form.admin_user} onChange={e => setForm(f => ({ ...f, admin_user: e.target.value }))} required className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                            </div>
                            <div>
                              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Device Password</label>
                              <input type="password" value={form.admin_password} onChange={e => setForm(f => ({ ...f, admin_password: e.target.value }))} required className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                            </div>
                          </div>
                          <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Branch Location</label>
                            <select
                              value={form.branch_location_id || ''}
                              onChange={e => setForm(f => ({ ...f, branch_location_id: e.target.value }))}
                              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="">None (Standalone)</option>
                              {companySettings?.branch_locations?.map((branch: any) => (
                                <option key={branch.id} value={branch.id}>
                                  {branch.name}
                                </option>
                              ))}
                            </select>
                            <p className="text-xs text-slate-500 mt-1">If linked, punches from this device will record this branch's GPS coordinates.</p>
                          </div>
                        </div>
                      </div>

                      {/* Automation Settings (Simplified) */}
                      <div>
                        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Automation</h3>
                        <div className={`p-4 rounded-xl border ${form.enable_auto_sync ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200'}`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="relative flex items-center justify-center w-3 h-3">
                                {form.enable_auto_sync && <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75 animate-ping" />}
                                <span className={`relative inline-flex rounded-full h-3 w-3 ${form.enable_auto_sync ? 'bg-green-500' : 'bg-slate-300'}`} />
                              </div>
                              <div>
                                <h4 className={`font-bold text-sm ${form.enable_auto_sync ? 'text-green-800' : 'text-slate-700'}`}>Background Auto-Sync</h4>
                                <p className={`text-xs ${form.enable_auto_sync ? 'text-green-600' : 'text-slate-500'}`}>
                                  {form.enable_auto_sync ? 'Server is fetching records automatically' : 'Syncing is currently paused'}
                                </p>
                              </div>
                            </div>
                            <label className="relative flex items-center cursor-pointer shrink-0">
                              <input type="checkbox" className="sr-only" checked={form.enable_auto_sync} onChange={() => setForm(f => ({ ...f, enable_auto_sync: !f.enable_auto_sync }))} />
                              <div className={`block w-10 h-6 rounded-full transition-colors duration-300 ${form.enable_auto_sync ? 'bg-green-500' : 'bg-slate-300'}`} />
                              <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full shadow-sm transition-transform duration-300 ${form.enable_auto_sync ? 'translate-x-4' : ''}`} />
                            </label>
                          </div>
                        </div>
                      </div>

                    </div>

                    <div>
                      <button type="submit" disabled={isSaving} className="w-full bg-slate-900 text-white py-3 px-4 rounded-xl hover:bg-slate-800 transition-all font-semibold shadow-sm flex justify-center items-center gap-2 disabled:bg-slate-300 disabled:cursor-not-allowed">
                        {isSaving ? 'Saving...' : isAddingNew ? 'Add Device' : 'Save Configuration & Update Device'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col items-center justify-center py-20 px-8 text-center">
                <h3 className="text-base font-bold text-slate-700 mb-1">No Device Selected</h3>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteTargetId && (() => {
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
              <h3 className="text-lg font-bold text-slate-900 mb-2">Delete Device</h3>
              <div className="flex gap-3 justify-end mt-6">
                <button onClick={() => setDeleteTargetId(null)} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
                <button onClick={handleDeleteDevice} className="px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg">Delete</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}