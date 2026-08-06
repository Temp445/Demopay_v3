import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Wifi, Plus, ArrowRight, Lock, ScanFace, CheckCircle2, Server, Zap, RotateCcw, Database } from 'lucide-react';
import { useSettingsStore } from '../../../stores/settingsStore';

export default function BiometricControllers() {
  const navigate = useNavigate();
  const { companySettings, updateCompanySettings } = useSettingsStore();
  const isHikvisionEnabled = companySettings?.is_hikvision_enabled ?? false;

  const toggleHikvision = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await updateCompanySettings({ is_hikvision_enabled: !isHikvisionEnabled });
    } catch (err) {
      console.error('Failed to update hikvision enabled status:', err);
    }
  };

  const controllers = [
    {
      id: 'hikvision',
      name: 'Hikvision',
      subtitle: 'Biometric Device Controller',
      vendor: 'Hikvision Co., Ltd.',
      description: 'Manage biometric device connections, sync attendance data in real-time, and configure auto-sync schedules.',
      icon: Wifi,
      specs: [
        { icon: Zap, label: 'Real-time Sync' },
        { icon: Database, label: 'Device Employees' },
        { icon: RotateCcw, label: 'Auto Sync' },
      ],
      path: '/dashboard/settings/hik-device-controller',
    },
  ];

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-indigo-600 flex items-center justify-center">
            <ScanFace className="h-4 w-4 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 leading-tight">Biometric Device Manager</h1>
            <p className="text-xs text-gray-400 font-medium">Manage hardware integrations</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-indigo-500 bg-indigo-50 border border-indigo-100 px-3 py-1.5 rounded-full font-medium">
          <Server className="h-3 w-3" />
          {controllers.length} integration{controllers.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {controllers.map((controller) => {
          const isHikvision = controller.id === 'hikvision';
          const isDisabled = isHikvision && !isHikvisionEnabled;
          const Icon = controller.icon;

          return (
            <div
              key={controller.id}
              className={`group relative rounded-2xl overflow-hidden border transition-all duration-300 flex flex-col ${
                isDisabled
                  ? 'border-gray-200 bg-white cursor-default'
                  : 'border-gray-200 bg-white hover:border-indigo-300 hover:shadow-[0_8px_32px_rgba(99,102,241,0.1)] cursor-pointer'
              }`}
              onClick={() => { if (!isDisabled) navigate(controller.path); }}
            >
              {/* Colored top stripe */}
              <div className={`h-1 w-full ${isDisabled ? 'bg-gray-200' : 'bg-gradient-to-r from-indigo-500 via-blue-500 to-indigo-400'}`} />

              {/* Card body */}
              <div className="p-5 flex-1 flex flex-col">

                {/* Top row: icon + toggle */}
                <div className="flex items-center justify-between mb-5">
                  {/* Logo-style icon block */}
                  <div className="flex items-center gap-3">
                    <div className={`relative h-11 w-11 rounded-xl flex items-center justify-center ${
                      isDisabled ? 'bg-gray-100' : 'bg-indigo-600'
                    }`}>
                      <Icon className={`h-5 w-5 ${isDisabled ? 'text-gray-400' : 'text-white'}`} strokeWidth={1.8} />
                      {/* Active dot */}
                      {!isDisabled && (
                        <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-emerald-400 border-2 border-white" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900 leading-tight">{controller.name}</p>
                      <p className="text-[10px] text-gray-400 font-medium">{controller.vendor}</p>
                    </div>
                  </div>

                  {/* Toggle pill */}
                  <button
                    onClick={toggleHikvision}
                    title={isHikvisionEnabled ? 'Disable' : 'Enable'}
                    className={`relative flex items-center h-6 w-11 rounded-full transition-all duration-300 focus:outline-none flex-shrink-0 ${
                      isHikvisionEnabled ? 'bg-indigo-600' : 'bg-gray-200 hover:bg-gray-300'
                    }`}
                  >
                    <span className={`absolute h-4 w-4 rounded-full bg-white shadow transition-transform duration-300 ${
                      isHikvisionEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </div>

               

                {/* Description */}
                <p className={`text-xs leading-relaxed flex-1 ${isDisabled ? 'text-gray-400' : 'text-gray-500'}`}>
                  {controller.description}
                </p>

                {/* Spec chips */}
                <div className="flex flex-wrap gap-1.5 mt-4">
                  {controller.specs.map(({ icon: SpecIcon, label }) => (
                    <span
                      key={label}
                      className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg border ${
                        isDisabled
                          ? 'text-gray-400 bg-gray-50 border-gray-200'
                          : 'text-indigo-600 bg-indigo-50 border-indigo-100'
                      }`}
                    >
                      <SpecIcon className="h-2.5 w-2.5" />
                      {label}
                    </span>
                  ))}
                </div>
              </div>

              {/* Footer CTA */}
              <div className={`px-5 py-3 border-t flex items-center justify-between ${
                isDisabled ? 'border-gray-100 bg-gray-50' : 'border-indigo-50 bg-indigo-50/40'
              }`}>
                {isDisabled ? (
                  <span className="text-xs text-gray-400 font-medium">Enable to configure</span>
                ) : (
                  <span className="text-xs font-semibold text-indigo-600">Add Devices</span>
                )}
                <div className={`h-7 w-7 rounded-lg flex items-center justify-center transition-all duration-300 ${
                  isDisabled
                    ? 'bg-gray-100'
                    : 'bg-indigo-100 group-hover:bg-indigo-600'
                }`}>
                  {isDisabled
                    ? <Lock className="h-3 w-3 text-gray-400" />
                    : <ArrowRight className="h-3.5 w-3.5 text-indigo-600 group-hover:text-white transition-colors duration-300" />
                  }
                </div>
              </div>
            </div>
          );
        })}

        {/* Request Integration */}
        <div className="group rounded-2xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center py-10 px-5 text-center cursor-not-allowed transition-all duration-200 hover:border-indigo-200 hover:bg-indigo-50/20">
          <div className="h-11 w-11 rounded-xl bg-gray-100 flex items-center justify-center mb-3 transition-all duration-200 group-hover:bg-indigo-100 group-hover:scale-105">
            <Plus className="h-5 w-5 text-gray-400 group-hover:text-indigo-500 transition-colors duration-200" strokeWidth={1.8} />
          </div>
          <p className="text-sm font-bold text-gray-500 group-hover:text-gray-700 transition-colors">Request Integration</p>
          <p className="text-xs text-gray-400 mt-1 leading-relaxed max-w-[140px]">Need another device? Contact our team.</p>
        </div>
      </div>
    </div>
  );
}
