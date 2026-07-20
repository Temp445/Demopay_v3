import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, RefreshCw } from 'lucide-react';

interface DeviceSetting {
  id: string;
  device_name: string;
}

interface ManualSyncPanelProps {
  startDate: string;
  setStartDate: (date: string) => void;
  endDate: string;
  setEndDate: (date: string) => void;
  isSyncing: boolean;
  handleManualSync: (selectedIds: string[]) => void;
  syncMessage: string | null;
  enabledDevices: DeviceSetting[];
}

export default function ManualSyncPanel({ 
  startDate, 
  setStartDate, 
  endDate, 
  setEndDate, 
  isSyncing, 
  handleManualSync, 
  syncMessage,
  enabledDevices
}: ManualSyncPanelProps) {

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(enabledDevices.map(d => d.id)));
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelectedIds(new Set(enabledDevices.map(d => d.id)));
  }, [enabledDevices]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleToggleAll = () => {
    if (selectedIds.size === enabledDevices.length) {
      setSelectedIds(new Set()); 
    } else {
      setSelectedIds(new Set(enabledDevices.map(d => d.id))); 
    }
  };

  const handleToggleDevice = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const nextSet = new Set(selectedIds);
    if (nextSet.has(id)) {
      nextSet.delete(id);
    } else {
      nextSet.add(id);
    }
    setSelectedIds(nextSet);
  };

  return (
    <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex flex-col justify-center">
      
      <div className="flex flex-col sm:flex-row items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Manual Device Fetch</h2>
          <p className="text-xs text-slate-500">
            Pull historical attendance records manually from the devices.
          </p>
        </div>
        
        {syncMessage && (
          <div className={`mt-2 sm:mt-0 px-3 py-1.5 rounded-md text-xs font-medium border flex items-center ${syncMessage.includes('Success') ? 'bg-green-50 text-green-800 border-green-200' : 'bg-amber-50 text-amber-800 border-amber-200'}`}>
            {syncMessage}
          </div>
        )}
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
        
        {/* Device Selection Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">Target Devices</label>
          <div 
            onClick={() => !isSyncing && setIsDropdownOpen(!isDropdownOpen)}
            className={`w-full px-3 py-2.5 bg-slate-50 border rounded-lg flex justify-between items-center transition-colors ${isSyncing ? 'opacity-60 cursor-not-allowed border-slate-200' : 'cursor-pointer hover:bg-slate-100 border-slate-300'}`}
          >
            <span className="text-sm font-medium text-slate-700 select-none">
              {selectedIds.size === 0 
                ? 'No devices selected' 
                : selectedIds.size === enabledDevices.length 
                  ? 'All Devices' 
                  : `${selectedIds.size} Device${selectedIds.size > 1 ? 's' : ''} Selected`}
            </span>
            <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
          </div>

          {isDropdownOpen && !isSyncing && (
            <div className="absolute z-20 top-full left-0 mt-2 w-full min-w-[240px] bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
              <div className="px-3 py-2 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Select Devices</span>
                <button 
                  type="button" 
                  onClick={handleToggleAll}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors"
                >
                  {selectedIds.size === enabledDevices.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>
              <div className="max-h-60 overflow-y-auto p-1.5 space-y-0.5">
                {enabledDevices.map(device => (
                  <label 
                    key={device.id} 
                    className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors ${selectedIds.has(device.id) ? 'bg-blue-50/70 hover:bg-blue-50' : 'hover:bg-slate-50'}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(device.id)}
                      onChange={(e) => handleToggleDevice(device.id)}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                    />
                    <span className={`text-sm select-none truncate ${selectedIds.has(device.id) ? 'font-semibold text-blue-900' : 'font-medium text-slate-700'}`}>
                      {device.device_name || 'Unnamed Device'}
                    </span>
                  </label>
                ))}
                {enabledDevices.length === 0 && (
                  <div className="p-3 text-center text-sm text-slate-500 italic">
                    No devices available
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Start Date */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">Start Time</label>
          <input 
            type="datetime-local" 
            value={startDate} 
            onChange={(e) => setStartDate(e.target.value)} 
            disabled={isSyncing}
            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 text-sm font-medium text-slate-800 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-sm" 
          />
        </div>

        {/* End Date */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">End Time</label>
          <input 
            type="datetime-local" 
            value={endDate} 
            onChange={(e) => setEndDate(e.target.value)} 
            disabled={isSyncing}
            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 text-sm font-medium text-slate-800 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-sm" 
          />
        </div>

        {/* Sync Button */}
        <div>
          <button 
            onClick={() => handleManualSync(Array.from(selectedIds))} 
            disabled={isSyncing || selectedIds.size === 0}
            className="w-full flex items-center justify-center space-x-2 bg-indigo-600 text-white py-2.5 px-4 rounded-lg hover:bg-indigo-700 font-semibold shadow-sm transition-all disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed active:scale-[0.98]"
          >
            {isSyncing ? (
              <span className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin" />
                Fetching...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4" />
                Fetch Selected
              </span>
            )}
          </button>
        </div>
        
      </div>
    </div>
  );
}