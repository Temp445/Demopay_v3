import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wifi, Plus, ArrowRight, Fingerprint, CheckCircle2, Lock, ScanFace } from 'lucide-react';

import { useSettingsStore } from '../../../stores/settingsStore';

export default function BiometricControllers() {
  const navigate = useNavigate();
  const { companySettings, updateCompanySettings } = useSettingsStore();
  const isHikvisionEnabled = companySettings?.is_hikvision_enabled ?? false;

  const toggleHikvision = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const newValue = !isHikvisionEnabled;
    try {
      await updateCompanySettings({ is_hikvision_enabled: newValue });
    } catch (err) {
      console.error('Failed to update hikvision enabled status:', err);
    }
  };

  const controllers = [
    {
      id: 'hikvision',
      name: 'Hikvision Device',
      vendor: 'Hikvision',
      description: 'Sync attendance data, manage biometric device connections, and configure auto-sync schedules.',
      icon: Wifi,
      headerGradient: 'from-indigo-600 to-blue-500',
      iconBg: 'bg-white/20',
      features: ['Device Management', 'Auto Sync', 'Attendance Logs'],
      path: '/dashboard/settings/hik-device-controller',
      status: 'active',
    },
  ];

  return (
    <div className="max-w-6xl mx-auto py-10 px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-10">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-100">
            <ScanFace className="h-5 w-5 text-indigo-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Biometric Device Manager</h1>
        </div>
        <p className="mt-1 text-sm text-gray-500 max-w-xl">
          Connect biometric hardware to automate attendance tracking and employee data synchronization.
        </p>
      </div>

      {/* Active integrations */}
      <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-4">Integrations</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-10">
        {controllers.map((controller) => {
          const isHikvision = controller.id === 'hikvision';
          const isDisabled = isHikvision && !isHikvisionEnabled;

          return (
            <div
              key={controller.id}
              className={`rounded-2xl overflow-hidden border flex flex-col transition-all duration-200 ${
                isDisabled
                  ? 'border-gray-200 opacity-70 grayscale'
                  : 'border-transparent shadow-[0_2px_12px_rgba(0,0,0,0.08)] hover:shadow-[0_6px_24px_rgba(99,102,241,0.15)] cursor-pointer'
              }`}
              onClick={() => {
                if (!isDisabled) navigate(controller.path);
              }}
            >
              {/* Card Header */}
              <div className={`relative bg-gradient-to-br ${controller.headerGradient} px-6 pt-6 pb-10`}>
                <div className="flex items-start justify-between">
                  <div className={`${controller.iconBg} rounded-xl p-3 backdrop-blur-sm`}>
                    <controller.icon className="h-6 w-6 text-white" />
                  </div>
                  {/* Toggle */}
                  <div
                    onClick={toggleHikvision}
                    className="cursor-pointer"
                    title={isHikvisionEnabled ? 'Disable' : 'Enable'}
                  >
                    <label className="relative inline-flex items-center cursor-pointer pointer-events-none">
                      <input type="checkbox" className="sr-only peer" checked={isHikvisionEnabled} readOnly />
                      <div className="w-10 h-5 bg-white/30 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-white/50"></div>
                    </label>
                  </div>
                </div>
                {/* Vendor pill */}
                <div className="mt-4">
                  <span className="text-white/70 text-[10px] font-semibold uppercase tracking-wider">{controller.vendor}</span>
                  <h3 className="text-white text-lg font-bold mt-0.5">{controller.name}</h3>
                </div>
              </div>

              {/* Card Body — pulled up to overlap header */}
              <div className="relative -mt-5 mx-4 bg-white rounded-xl px-4 pt-4 pb-5 flex-1 flex flex-col shadow-sm border border-gray-100">
                {/* Status badge */}
                <div className="flex items-center justify-between mb-3">
                  {isDisabled ? (
                    <div className="flex items-center gap-1.5">
                      <Lock className="h-3 w-3 text-gray-400" />
                      <span className="text-[11px] font-semibold text-gray-400">Disabled</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-wide">Enable</span>
                    </div>
                  )}
                </div>

                <p className="text-sm text-gray-500 leading-relaxed flex-1">{controller.description}</p>

                {/* Feature chips */}
                <div className="flex flex-wrap gap-1.5 mt-4">
                  {controller.features.map((f) => (
                    <span key={f} className="text-[11px] px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
                      {f}
                    </span>
                  ))}
                </div>

                {/* CTA */}
                {!isDisabled ? (
                  <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
                    <span className="text-sm font-semibold text-indigo-600">Configure</span>
                    <div className="h-7 w-7 rounded-full bg-indigo-50 flex items-center justify-center group-hover:bg-indigo-100 transition-colors">
                      <ArrowRight className="h-3.5 w-3.5 text-indigo-600" />
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 pt-4 border-t border-gray-100 text-center">
                    <span className="text-xs text-gray-400">Enable the toggle above to configure</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Request Integration */}
        <div className="rounded-2xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center py-10 px-6 text-center cursor-not-allowed bg-white">
          <div className="h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
            <Plus className="h-5 w-5 text-gray-400" />
          </div>
          <p className="text-sm font-semibold text-gray-600">Request Integration</p>
          <p className="text-xs text-gray-400 mt-1 max-w-[160px]">Need a specific device? Let us know.</p>
        </div>
      </div>
    </div>
  );
}
