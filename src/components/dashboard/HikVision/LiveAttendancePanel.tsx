import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../../lib/supabase'; // Adjust path as needed

interface LiveAttendancePanelProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string | null;
  settingsId?: string | null; // Added to help match the exact device
  deviceName?: string;
}

export default function LiveAttendancePanel({ isOpen, onClose, tenantId, settingsId, deviceName }: LiveAttendancePanelProps) {
  const [attendanceLogs, setAttendanceLogs] = useState<any[]>([]);
  const [deviceMap, setDeviceMap] = useState<Record<string, string>>({}); // Holds IP -> Name mapping
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [isFetching, setIsFetching] = useState(false);
  const logsPerPage = 15;

  // We use a Ref so the realtime listener always knows the exact IP to listen for
  const selectedDeviceIpRef = useRef<string | null>(null);

  const fetchLogs = useCallback(async () => {
    if (!tenantId) return;
    setIsFetching(true);

    // 1. Fetch all device settings to map device_ip to device_name
    const { data: devices } = await supabase
      .from('hik_device_settings')
      .select('id, device_ip, device_name')
      .eq('tenant_id', tenantId);

    const mapping: Record<string, string> = {};
    let currentDeviceIp: string | null = null;

    if (devices) {
      devices.forEach(d => {
        mapping[d.device_ip] = d.device_name;
        // Find the IP of the currently selected settingsId in the dropdown
        if (settingsId && d.id === settingsId) {
          currentDeviceIp = d.device_ip;
          selectedDeviceIpRef.current = d.device_ip; // Save to Ref for Realtime Subscription
        }
      });
    }
    setDeviceMap(mapping);

    // 2. Fetch the attendance logs
    let query = supabase
      .from('hik_attendance_events')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('event_time', { ascending: false })
      .limit(100);

    // FIX: Strictly filter logs for the selected device only
    if (currentDeviceIp) {
      query = query.eq('device_ip', currentDeviceIp);
    }

    // Apply date filtering
    if (dateFilter) {
      const startOfDay = new Date(`${dateFilter}T00:00:00+05:30`).toISOString();
      const endOfDay = new Date(`${dateFilter}T23:59:59.999+05:30`).toISOString();
      query = query.gte('event_time', startOfDay).lte('event_time', endOfDay);
    }

    const { data, error } = await query;

    if (!error && data) {
      setAttendanceLogs(data);
    }
    setIsFetching(false);
  }, [tenantId, settingsId, dateFilter]);

  // Handle Real-time Subscription
  useEffect(() => {
    if (!isOpen || !tenantId) return;

    fetchLogs();

    const channel = supabase
      .channel('live-attendance-results')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'hik_attendance_events', filter: `tenant_id=eq.${tenantId}` },
        (payload) => {
          
          // FIX: Ignore the real-time event if it came from a different device!
          if (selectedDeviceIpRef.current && payload.new.device_ip !== selectedDeviceIpRef.current) {
            return; // Exit silently, do not update UI
          }

          if (dateFilter) {
            const payloadDate = new Date(payload.new.event_time).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
            if (payloadDate !== dateFilter) return; 
          }
          
          setAttendanceLogs((prev) => [payload.new, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isOpen, tenantId, dateFilter, fetchLogs]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, dateFilter]);

  if (!isOpen) return null;

  const filteredLogs = attendanceLogs.filter(log => 
    log.employee_id.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  const totalPages = Math.ceil(filteredLogs.length / logsPerPage) || 1;
  const paginatedLogs = filteredLogs.slice((currentPage - 1) * logsPerPage, currentPage * logsPerPage);

  return (
    <div className="fixed inset-0 z-[100] flex justify-end ">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" 
        onClick={onClose} 
      />
      
      {/* Slide-over Panel */}
      <div className="relative w-full max-w-lg bg-white h-full shadow-2xl flex flex-col animate-[slideInRight_0.3s_ease-out]">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div>
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            Device Attendance Logs
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Currently viewing <span className="font-semibold text-indigo-600">{deviceName || 'All Devices'}</span>
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <svg className="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Toolbar: Search Bar & Date Picker */}
        <div className="p-4 border-b border-slate-100 bg-white flex gap-3">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input 
              type="text" 
              placeholder="Search Employee ID..." 
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          <div className="relative flex items-center">
            <input 
              type="date" 
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-slate-700 cursor-pointer"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            />
            {dateFilter && (
              <button 
                onClick={() => setDateFilter('')}
                className="absolute right-2 p-1 bg-slate-200 hover:bg-slate-300 rounded-full text-slate-500 transition-colors"
                title="Clear date filter"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>
        </div>

        {/* Logs List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50">
          {isFetching && attendanceLogs.length === 0 ? (
             <div className="text-center py-20 text-slate-400 text-sm flex flex-col items-center gap-2">
               <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
               Loading logs...
             </div>
          ) : paginatedLogs.length === 0 ? (
            <div className="text-center py-20 text-slate-400 text-sm">
              {searchQuery ? 'No logs match your search.' : dateFilter ? `No logs found for ${new Date(dateFilter).toLocaleDateString()}.` : 'No recent attendance logs found.'}
            </div>
          ) : (
            paginatedLogs.map((log) => {
              
              const actualDeviceName = deviceMap[log.device_ip] || log.device_ip;

              return (
                <div key={log.id} className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm hover:border-indigo-300 transition-all">
                  <div className="flex justify-between items-start">
                    <div className="font-bold text-slate-900 text-base">{log.employee_id}</div>
                    
                    <div className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-1 rounded truncate max-w-[150px]" title={`IP: ${log.device_ip}`}>
                      {actualDeviceName}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-3 text-xs font-medium text-slate-600">
                    <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {new Date(log.event_time).toLocaleString('en-IN', { 
                      timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'medium' 
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Pagination Footer */}
        <div className="p-4 bg-white border-t border-slate-200 flex justify-between items-center">
          <button 
            disabled={currentPage === 1} 
            onClick={() => setCurrentPage(p => p - 1)} 
            className="px-3 py-1.5 text-sm font-bold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 transition-colors"
          >
            Previous
          </button>
          <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg">
            Page {currentPage} of {totalPages}
          </span>
          <button 
            disabled={currentPage === totalPages || totalPages === 0} 
            onClick={() => setCurrentPage(p => p + 1)} 
            className="px-3 py-1.5 text-sm font-bold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 transition-colors"
          >
            Next
          </button>
        </div>
      </div>

      <style>{`
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(100%); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}