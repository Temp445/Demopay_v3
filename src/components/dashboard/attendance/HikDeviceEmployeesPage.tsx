import React, { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useTenant } from '../../../contexts/TenantContext';
import EmployeeUploadPanel from '../HikVision/EmployeeUploadPanel';
import ManualSyncPanel from '../HikVision/ManualSyncPanel';

interface DeviceOption {
  id: string;
  device_name: string;
  is_enabled: boolean;
}

export default function HikDeviceEmployeesPage() {
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.id;
  
  const [devices, setDevices] = useState<DeviceOption[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // ─── Manual Sync State ───
  const getInitialStartDate = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}T00:00`;
  };

  const getInitialEndDate = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}T23:59`;
  };

  const [manualStartDate, setManualStartDate] = useState(getInitialStartDate());
  const [manualEndDate, setManualEndDate] = useState(getInitialEndDate());
  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const [manualSyncMessage, setManualSyncMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    const fetchDevices = async () => {
      setIsLoading(true);
      const { data } = await supabase
        .from('hik_device_settings')
        .select('id, device_name, is_enabled')
        .eq('tenant_id', tenantId)
        .order('device_name', { ascending: true });
      
      if (data && data.length > 0) {
        setDevices(data);
        setSelectedDeviceId(data[0].id);
      }
      setIsLoading(false);
    };
    fetchDevices();
  }, [tenantId]);

  // ─── Manual Sync Handler ───
  // Sends ALL selected device IDs in a single request so the edge function
  // can fetch from all devices, merge events globally, sort by
  // (employee_id, event_time), and insert one-at-a-time.
  //
  // Previously: looped per device → events from different devices were
  // processed in separate batches → cross-device timeline ordering was wrong
  // → all punches saved as Clock In.
  //
  // Now: one call with all devices → merged & sorted globally → correct IN/OUT.
  const handleManualSync = async (selectedIds: string[]) => {
    if (!manualStartDate || !manualEndDate) {
      alert('Please select both start and end dates.');
      return;
    }
    if (selectedIds.length === 0) {
      alert('Please select at least one device.');
      return;
    }

    setIsManualSyncing(true);
    setManualSyncMessage('Fetching from all devices...');

    const payloadBody = {
      startDate:   new Date(manualStartDate).toISOString(),
      endDate:     new Date(manualEndDate).toISOString(),
      tenantId,
      settingsIds: selectedIds, // ← all device IDs at once
    };

    const { data, error } = await supabase.functions.invoke('sync-events', {
      body:    payloadBody,
      headers: { 'x-hikvision-token': import.meta.env.VITE_HIKVISION_API_TOKEN },
    });

    setIsManualSyncing(false);

    if (error) {
      setManualSyncMessage(`Error: ${error.message}`);
    } else if (data && data.error) {
      setManualSyncMessage(`Error: ${data.error}`);
    } else {
      const deviceErrs: string[] = data.device_errors || [];
      const added: number = data.added_to_db || 0;
      if (deviceErrs.length > 0) {
        setManualSyncMessage(`Added ${added} records. Device errors: ${deviceErrs.join(' | ')}`);
      } else {
        setManualSyncMessage(`Success: Added ${added} new records from ${selectedIds.length} device(s).`);
      }
    }

    setTimeout(() => setManualSyncMessage(null), 6000);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (devices.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col items-center justify-center py-20 px-8 text-center m-6">
        <h3 className="text-xl font-bold text-slate-700 mb-2">No Devices Found</h3>
        <p className="text-slate-500 mb-6">Please configure a HikVision device in the integration settings first.</p>
      </div>
    );
  }

  const selectedDevice = devices.find(d => d.id === selectedDeviceId);
  const enabledDevices = devices.filter(d => d.is_enabled);

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto w-full pb-12">
       {/* --- MANUAL SYNC COMPONENT --- */}
      <ManualSyncPanel 
        startDate={manualStartDate}
        setStartDate={setManualStartDate}
        endDate={manualEndDate}
        setEndDate={setManualEndDate}
        isSyncing={isManualSyncing}
        handleManualSync={handleManualSync}
        syncMessage={manualSyncMessage}
        enabledDevices={enabledDevices}
      />
      
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Device Employee Management</h1>
          <p className="text-sm text-slate-500 mt-1">Manage which employees are synced to physical biometric devices.</p>
        </div>
        
        {devices.length > 1 && (
          <div className="w-full sm:w-auto">
            <label className="block text-xs font-semibold text-slate-600 mb-1">Select Device</label>
            <select
              title="Select Device"
              value={selectedDeviceId || ''}
              onChange={(e) => setSelectedDeviceId(e.target.value)}
              className="w-full text-sm sm:w-64 px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-700"
            >
              {devices.map(d => (
                <option key={d.id} value={d.id}>{d.device_name} {d.is_enabled ? '' : '(Disabled)'}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* --- UPLOAD PANEL --- */}
      {selectedDeviceId && selectedDevice ? (
        <EmployeeUploadPanel
          tenantId={tenantId!}
          settingsId={selectedDeviceId}
          isMasterEnabled={selectedDevice.is_enabled}
          deviceName={selectedDevice.device_name}
        />
      ) : null}
    </div>
  );
}