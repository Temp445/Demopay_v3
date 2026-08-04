import React, { useState, useEffect } from 'react';
import { X, Clock, AlertCircle, Info } from 'lucide-react';
import {
  getShiftOvertimeConfig,
  updateShiftOvertimeConfig,
  getOvertimePolicies,
  getTimingDescription,
  type ShiftOvertimeConfig as ShiftOvertimeConfigType,
  type OvertimeConfig,
} from '../../../lib/overtime';
import toast from 'react-hot-toast';

interface ShiftOvertimeConfigProps {
  shiftId: string;
  shiftName: string;
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
}

export default function ShiftOvertimeConfig({
  shiftId,
  shiftName,
  isOpen,
  onClose,
  onSave,
}: ShiftOvertimeConfigProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [globalConfig, setGlobalConfig] = useState<OvertimeConfig | null>(null);
  const [config, setConfig] = useState<ShiftOvertimeConfigType>({
    overtime_enabled: true,
    overtime_config_override: false,
    overtime_calculation_timing: null,
  });

  useEffect(() => {
    if (isOpen) {
      loadConfiguration();
    }
  }, [isOpen, shiftId]);

  const loadConfiguration = async () => {
    try {
      setLoading(true);
      const [shiftConfig, policies] = await Promise.all([
        getShiftOvertimeConfig(shiftId),
        getOvertimePolicies(),
      ]);

      if (shiftConfig) {
        setConfig(shiftConfig);
      }
      setGlobalConfig(policies.find(p => p.is_default) || policies[0] || null);
    } catch (error) {
      console.error('Error loading shift overtime config:', error);
      toast.error('Failed to load configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await updateShiftOvertimeConfig(shiftId, config);
      toast.success('Shift overtime configuration saved');
      onSave();
      onClose();
    } catch (error) {
      console.error('Error saving shift overtime config:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to save configuration'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleConfigChange = (updates: Partial<ShiftOvertimeConfigType>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
  };

  if (!isOpen) return null;

  const effectiveTiming =
    config.overtime_config_override && config.overtime_calculation_timing
      ? config.overtime_calculation_timing
      : globalConfig?.calculation_timing || 'both';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity" aria-hidden="true">
          <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
        </div>

        <span
          className="hidden sm:inline-block sm:align-middle sm:h-screen"
          aria-hidden="true"
        >
          &#8203;
        </span>

        <div className="inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
          {/* Header */}
          <div className="absolute top-0 right-0 pt-4 pr-4">
            <button
              onClick={onClose}
              className="bg-white rounded-md text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              <span className="sr-only">Close</span>
              <X className="h-6 w-6" />
            </button>
          </div>

          <div className="sm:flex sm:items-start">
            <div className="mt-3 text-center sm:mt-0 sm:text-left w-full">
              <h3 className="text-lg leading-6 font-medium text-gray-900 flex items-center gap-2">
                <Clock className="h-5 w-5 text-indigo-600" />
                Overtime Configuration - {shiftName}
              </h3>
              <p className="mt-2 text-sm text-gray-500">
                Configure overtime rules specific to this shift
              </p>

              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  {/* Global Status Info */}
                  {!globalConfig?.enabled && (
                    <div className="rounded-md bg-yellow-50 p-4">
                      <div className="flex">
                        <AlertCircle className="h-5 w-5 text-yellow-400 flex-shrink-0" />
                        <div className="ml-3">
                          <p className="text-sm text-yellow-700">
                            Overtime calculation is disabled globally. Enable it
                            in Company Settings to use overtime features.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Shift Enable Toggle */}
                  <div className="border rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <label className="text-sm font-medium text-gray-900">
                          Enable Overtime for This Shift
                        </label>
                        <p className="text-sm text-gray-500">
                          Overtime will be calculated only if both global and
                          shift-level are enabled
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          handleConfigChange({
                            overtime_enabled: !config.overtime_enabled,
                          })
                        }
                        disabled={!globalConfig?.enabled}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                          config.overtime_enabled
                            ? 'bg-indigo-600'
                            : 'bg-gray-200'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            config.overtime_enabled
                              ? 'translate-x-5'
                              : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  {/* Override Configuration */}
                  {config.overtime_enabled && globalConfig?.enabled && (
                    <>
                      <div className="border rounded-lg p-4">
                        <div className="flex items-start">
                          <input
                            type="checkbox"
                            checked={config.overtime_config_override}
                            onChange={(e) =>
                              handleConfigChange({
                                overtime_config_override: e.target.checked,
                                overtime_calculation_timing:
                                  e.target.checked
                                    ? config.overtime_calculation_timing ||
                                      'both'
                                    : null,
                              })
                            }
                            className="mt-1 h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                          />
                          <div className="ml-3 flex-1">
                            <label className="text-sm font-medium text-gray-900">
                              Use Custom Timing Configuration
                            </label>
                            <p className="text-sm text-gray-500">
                              Override global timing settings for this shift
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Current Configuration Display */}
                      <div className="bg-gray-50 rounded-lg p-4">
                        <div className="flex items-start gap-2">
                          <Info className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                          <div className="text-sm">
                            <div className="font-medium text-gray-900 mb-1">
                              Current Configuration:
                            </div>
                            <div className="text-gray-600 space-y-1">
                              <div>
                                <span className="font-medium">Timing:</span>{' '}
                                {getTimingDescription(effectiveTiming)}
                                {config.overtime_config_override &&
                                  ' (Custom)'}
                                {!config.overtime_config_override &&
                                  ' (Global)'}
                              </div>
                              <div>
                                <span className="font-medium">Threshold:</span>{' '}
                                {globalConfig?.threshold_minutes} minutes
                                (Global)
                              </div>
                              <div>
                                <span className="font-medium">Rounding:</span>{' '}
                                {globalConfig?.rounding_interval} min,{' '}
                                {globalConfig?.rounding_method} (Global)
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Custom Timing Options */}
                      {config.overtime_config_override && (
                        <div className="border rounded-lg p-4 space-y-3">
                          <label className="block text-sm font-medium text-gray-900">
                            Overtime Calculation Timing
                          </label>
                          <div className="space-y-2">
                            {[
                              {
                                value: 'before',
                                label: 'Before Shift Start Only',
                              },
                              {
                                value: 'after',
                                label: 'After Shift End Only',
                              },
                              {
                                value: 'both',
                                label: 'Both Before and After',
                              },
                            ].map((option) => (
                              <label
                                key={option.value}
                                className="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50"
                              >
                                <input
                                  type="radio"
                                  name="shift_timing"
                                  value={option.value}
                                  checked={
                                    config.overtime_calculation_timing ===
                                    option.value
                                  }
                                  onChange={(e) =>
                                    handleConfigChange({
                                      overtime_calculation_timing: e.target
                                        .value as any,
                                    })
                                  }
                                  className="h-4 w-4 text-indigo-600 focus:ring-indigo-500"
                                />
                                <span className="ml-3 text-sm font-medium text-gray-900">
                                  {option.label}
                                </span>
                              </label>
                            ))}
                          </div>
                          <p className="text-xs text-gray-500">
                            Other settings (threshold, rounding) will use global
                            configuration
                          </p>
                        </div>
                      )}
                    </>
                  )}

                  {/* Action Buttons */}
                  <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse gap-3">
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={saving || !globalConfig?.enabled}
                      className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {saving ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Saving...
                        </>
                      ) : (
                        'Save Configuration'
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={onClose}
                      className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:w-auto sm:text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
