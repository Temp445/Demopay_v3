import React, { useState, useEffect } from 'react';
import { Clock, AlertCircle, Info, CheckCircle, Calculator, TrendingUp, Zap, DollarSign } from 'lucide-react';
import {
  getGlobalOvertimeConfig,
  updateGlobalOvertimeConfig,
  validateRoundingInterval,
  calculateOvertimePreview,
  formatOvertimeDisplay,
  getRoundingMethodDescription,
  getTimingDescription,
  type OvertimeConfig,
} from '../../../lib/overtime';
import toast from 'react-hot-toast';

function TimeSelect12h({ value, onChange }: { value: string, onChange: (v: string) => void }) {
  const [h24Str, mStr] = value.split(':');
  const h24 = parseInt(h24Str, 10) || 0;
  const m = parseInt(mStr, 10) || 0;
  const isPM = h24 >= 12;
  const h12 = h24 % 12 || 12;

  const updateTime = (newH12: number, newM: number, newIsPM: boolean) => {
    let newH24 = newH12;
    if (newIsPM && newH12 !== 12) newH24 += 12;
    if (!newIsPM && newH12 === 12) newH24 = 0;
    onChange(`${String(newH24).padStart(2, '0')}:${String(newM).padStart(2, '0')}`);
  };

  return (
    <div className="flex items-center border border-gray-300 rounded-md shadow-sm bg-white overflow-hidden focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 transition-colors w-full">
      <select 
        value={String(h12).padStart(2, '0')} 
        onChange={(e) => updateTime(parseInt(e.target.value, 10), m, isPM)}
        className="appearance-none bg-transparent border-none focus:ring-0 pl-3 pr-2 py-2 text-sm outline-none cursor-pointer text-center w-full min-w-[50px] font-medium"
      >
        {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
          <option key={h} value={String(h).padStart(2, '0')}>{String(h).padStart(2, '0')}</option>
        ))}
      </select>
      <span className="py-2 text-gray-400 font-bold flex-shrink-0">:</span>
      <select 
        value={String(m).padStart(2, '0')}
        onChange={(e) => updateTime(h12, parseInt(e.target.value, 10), isPM)}
        className="appearance-none bg-transparent border-none focus:ring-0 pl-2 pr-2 py-2 text-sm outline-none cursor-pointer text-center w-full min-w-[50px] font-medium"
      >
        {Array.from({ length: 12 }, (_, i) => i * 5).map((m) => (
          <option key={m} value={String(m).padStart(2, '0')}>{String(m).padStart(2, '0')}</option>
        ))}
      </select>
      <select
        value={isPM ? 'PM' : 'AM'}
        onChange={(e) => updateTime(h12, m, e.target.value === 'PM')}
        className="appearance-none bg-gray-50 border-none border-l border-gray-200 focus:ring-0 px-3 py-2 text-sm font-semibold cursor-pointer outline-none text-indigo-700 w-[65px] text-center flex-shrink-0"
      >
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
}

export default function OvertimeSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<OvertimeConfig>({
    enabled: false,
    calculation_timing: 'both',
    threshold_minutes: 30,
    rounding_interval: 30,
    rounding_method: 'nearest',
    rounding_mode: 'combined',
    monthly_hours_type: 'fixed',
    fixed_days: 26,
    working_hours_per_day: 8,
    global_multiplier: 1.00,
    link_with_payroll: false,
  });

  // Preview calculation state
  const [shiftStart, setShiftStart] = useState('10:00');
  const [shiftEnd, setShiftEnd] = useState('18:30');
  const [clockIn, setClockIn] = useState('09:35');
  const [clockOut, setClockOut] = useState('19:15');
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    loadConfiguration();
  }, []);

  const loadConfiguration = async () => {
    try {
      setLoading(true);
      const data = await getGlobalOvertimeConfig();
      if (data) {
        setConfig(data);
      }
    } catch (error) {
      console.error('Error loading overtime config:', error);
      toast.error('Failed to load overtime configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    // Only validate configuration if overtime is actually enabled
    if (config.enabled) {
      const validation = validateRoundingInterval(
        config.threshold_minutes,
        config.rounding_interval
      );

      if (!validation.valid) {
        toast.error(validation.message || 'Invalid configuration');
        return;
      }
    }

    try {
      setSaving(true);
      await updateGlobalOvertimeConfig(config);
      toast.success('Overtime configuration saved successfully');
    } catch (error) {
      console.error('Error saving overtime config:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to save configuration'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleConfigChange = (updates: Partial<OvertimeConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
  };

  // Calculate preview
  const getMins = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  
  // Handle cross-midnight logic by assuming < 12h shifts
  let diffBefore = getMins(shiftStart) - getMins(clockIn);
  if (diffBefore < -720) diffBefore += 1440;
  else if (diffBefore > 720) diffBefore -= 1440;
  
  let diffAfter = getMins(clockOut) - getMins(shiftEnd);
  if (diffAfter < -720) diffAfter += 1440;
  else if (diffAfter > 720) diffAfter -= 1440;

  const actualBefore = Math.max(0, diffBefore);
  const actualAfter = Math.max(0, diffAfter);

  const preview = calculateOvertimePreview(
    config.calculation_timing === 'after' ? 0 : actualBefore,
    config.calculation_timing === 'before' ? 0 : actualAfter,
    config
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-gray-900 flex items-center gap-2">
            <Clock className="h-5 w-5 text-indigo-600" />
            Overtime Configuration
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Configure global overtime calculation rules and thresholds
          </p>
        </div>
      </div>

      {/* Master Toggle */}
      <div className="bg-white shadow rounded-lg p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm font-medium text-gray-900">
              Enable Overtime Calculation
            </label>
            <p className="text-sm text-gray-500">
              Master toggle to activate overtime system-wide
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleConfigChange({ enabled: !config.enabled })}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
              config.enabled ? 'bg-indigo-600' : 'bg-gray-200'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                config.enabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
          <div>
            <label className="text-sm font-medium text-gray-900 flex items-center gap-1">
              OT linked with payroll
              <span title="If enabled, overtime amount will be added to the employee payroll process, reports, and payslips.">
                <Info className="h-3 w-3 text-gray-400 cursor-help" />
              </span>
            </label>
            <p className="text-sm text-gray-500">
              Show/hide the option to link OT processing in the payroll page
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleConfigChange({ link_with_payroll: !config.link_with_payroll })}
            disabled={!config.enabled}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
              config.link_with_payroll ? 'bg-indigo-600' : 'bg-gray-200'
            } ${!config.enabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                config.link_with_payroll ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {!config.enabled && (
          <div className="rounded-md bg-yellow-50 p-4">
            <div className="flex">
              <AlertCircle className="h-5 w-5 text-yellow-400" />
              <div className="ml-3">
                <p className="text-sm text-yellow-700">
                  Overtime calculation is currently disabled. Enable it to
                  configure overtime rules.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Configuration Options */}
      {config.enabled && (
        <>
          {/* Calculation Timing */}
          <div className="bg-white shadow rounded-lg p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">
                Overtime Calculation Timing
              </label>
              <p className="text-sm text-gray-500 mb-4">
                Choose when overtime should be calculated relative to shift
                times
              </p>
              <div className="space-y-2">
                {[
                  {
                    value: 'before',
                    label: 'Before Shift Start Only',
                    desc: 'Calculate OT only when employees clock in early',
                  },
                  {
                    value: 'after',
                    label: 'After Shift End Only',
                    desc: 'Calculate OT only when employees clock out late',
                  },
                  {
                    value: 'both',
                    label: 'Both Before and After',
                    desc: 'Calculate OT for both early clock-in and late clock-out',
                  },
                ].map((option) => (
                  <label
                    key={option.value}
                    className="flex items-start p-3 border rounded-lg cursor-pointer hover:bg-gray-50"
                  >
                    <input
                      type="radio"
                      name="timing"
                      value={option.value}
                      checked={config.calculation_timing === option.value}
                      onChange={(e) =>
                        handleConfigChange({
                          calculation_timing: e.target.value as any,
                        })
                      }
                      className="mt-1 h-4 w-4 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div className="ml-3">
                      <div className="text-sm font-medium text-gray-900">
                        {option.label}
                      </div>
                      <div className="text-sm text-gray-500">{option.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Threshold Configuration */}
          <div className="bg-white shadow rounded-lg p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">
                Overtime Threshold (Minutes)
              </label>
              <p className="text-sm text-gray-500 mb-4">
                Minimum overtime minutes required to qualify. When exceeded, the
                entire duration counts.
              </p>
              <div className="flex items-center gap-4">
                <input
                  type="number"
                  min="0"
                  max="480"
                  step="5"
                  value={config.threshold_minutes}
                  onChange={(e) =>
                    handleConfigChange({
                      threshold_minutes: parseInt(e.target.value) || 0,
                    })
                  }
                  className="block w-32 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                />
                <span className="text-sm text-gray-500">minutes</span>
              </div>
              <div className="mt-2 flex items-start gap-2">
                <Info className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-gray-500">
                  Example: With 30-minute threshold, 25 minutes = no OT, 35
                  minutes = 35 minutes OT (full duration counts)
                </p>
              </div>
            </div>
          </div>

          {/* Rounding Rules */}
          <div className="bg-white shadow rounded-lg p-6 space-y-4">
            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-4 flex items-center gap-2">
                Rounding Rules
              </h4>

              {/* Rounding Interval */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Rounding Interval
                </label>
                <select
                  value={config.rounding_interval}
                  onChange={(e) =>
                    handleConfigChange({
                      rounding_interval: parseInt(e.target.value) as any,
                    })
                  }
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                >
                  <option value="10">10 minutes</option>
                  <option value="15">15 minutes</option>
                  <option value="30">30 minutes</option>
                  <option value="60">60 minutes (1 hour)</option>
                </select>
              </div>

              {/* Rounding Method */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Rounding Method
                </label>
                <select
                  value={config.rounding_method}
                  onChange={(e) =>
                    handleConfigChange({
                      rounding_method: e.target.value as any,
                    })
                  }
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                >
                  <option value="nearest">
                    Nearest - Round to closest interval
                  </option>
                  <option value="midpoint">
                    Midpoint - Round up at exact midpoint
                  </option>
                  <option value="start">
                    Start - Always round down to interval start
                  </option>
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  {getRoundingMethodDescription(config.rounding_method)}
                </p>
              </div>

              {/* Rounding Mode (only for 'both' timing) */}
              {config.calculation_timing === 'both' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Rounding Application Mode
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-start p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                      <input
                        type="radio"
                        name="rounding_mode"
                        value="separate"
                        checked={config.rounding_mode === 'separate'}
                        onChange={(e) =>
                          handleConfigChange({
                            rounding_mode: e.target.value as any,
                          })
                        }
                        className="mt-1 h-4 w-4 text-indigo-600 focus:ring-indigo-500"
                      />
                      <div className="ml-3">
                        <div className="text-sm font-medium text-gray-900">
                          Apply Separately
                        </div>
                        <div className="text-sm text-gray-500">
                          Round before-shift and after-shift OT independently
                        </div>
                      </div>
                    </label>
                    <label className="flex items-start p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                      <input
                        type="radio"
                        name="rounding_mode"
                        value="combined"
                        checked={config.rounding_mode === 'combined'}
                        onChange={(e) =>
                          handleConfigChange({
                            rounding_mode: e.target.value as any,
                          })
                        }
                        className="mt-1 h-4 w-4 text-indigo-600 focus:ring-indigo-500"
                      />
                      <div className="ml-3">
                        <div className="text-sm font-medium text-gray-900">
                          Apply to Combined Total
                        </div>
                        <div className="text-sm text-gray-500">
                          Round the total overtime once after combining both
                          periods
                        </div>
                      </div>
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>

          

          {/* Preview Calculator */}
          <div className="bg-white shadow rounded-lg p-6 space-y-4">
            <button
              type="button"
              onClick={() => setShowPreview(!showPreview)}
              className="flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-700"
            >
              <Info className="h-4 w-4" />
              {showPreview ? 'Hide' : 'Show'} Calculation Preview
            </button>

            {showPreview && (
              <div className="border-t pt-4 space-y-4">
                <p className="text-sm text-gray-700">
                  Test your configuration with sample values:
                </p>

                <div className="flex flex-col md:flex-row gap-6">
                  {/* Expected Shift Block */}
                  <div className="flex-1 bg-gray-50 p-4 rounded-xl border border-gray-200">
                    <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Expected Shift</h5>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Starts
                        </label>
                        <TimeSelect12h value={shiftStart} onChange={setShiftStart} />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Ends
                        </label>
                        <TimeSelect12h value={shiftEnd} onChange={setShiftEnd} />
                      </div>
                    </div>
                  </div>

                  {/* Actual Attendance Block */}
                  <div className="flex-1 bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                    <h5 className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-3">Actual Attendance</h5>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Clock In
                        </label>
                        <TimeSelect12h value={clockIn} onChange={setClockIn} />
                        <div className="mt-2 h-5">
                          {actualBefore > 0 ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800">
                              {actualBefore} mins early
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600">
                              On time
                            </span>
                          )}
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Clock Out
                        </label>
                        <TimeSelect12h value={clockOut} onChange={setClockOut} />
                        <div className="mt-2 h-5">
                          {actualAfter > 0 ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800">
                              {actualAfter} mins late
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600">
                              On time
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-indigo-50 rounded-lg p-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-indigo-900">
                    <CheckCircle className="h-4 w-4" />
                    Calculated Overtime
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="text-gray-600">Before-shift</div>
                      <div className="text-lg font-semibold text-indigo-900">
                        {formatOvertimeDisplay(preview.beforeRounded)}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-600">After-shift</div>
                      <div className="text-lg font-semibold text-indigo-900">
                        {formatOvertimeDisplay(preview.afterRounded)}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-600">Total Payable</div>
                      <div className="text-lg font-semibold text-indigo-900">
                        {formatOvertimeDisplay(preview.total)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Calculation Standards */}
          <div className="bg-white shadow rounded-lg p-6 space-y-6">
            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-4 flex items-center gap-2">
                <Calculator className="h-4 w-4 text-blue-500" />
                Overtime Calculation Standards
              </h4>
              <p className="text-xs text-gray-500 mb-6">
                Define how the hourly rate is derived from monthly salary components.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Strategy Choice */}
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-gray-700">
                    Monthly Hours Strategy
                  </label>
                  <div className="space-y-2">
                    {[
                      { value: 'fixed', label: 'Fixed Days per Month', desc: 'Use a standard number of days (e.g. 26) every month' },
                      { value: 'calendar_days', label: 'Calendar Days', desc: 'Use the actual number of days in the current month' }
                    ].map((opt) => (
                      <div 
                        key={opt.value} 
                        className={`flex items-start p-3 border rounded-lg cursor-pointer transition-all ${
                          config.monthly_hours_type === opt.value 
                            ? 'border-indigo-600 bg-indigo-50 shadow-sm' 
                            : 'border-gray-200 hover:bg-gray-50'
                        }`}
                        onClick={() => handleConfigChange({ monthly_hours_type: opt.value as any })}
                      >
                        <div className="flex items-center h-5">
                          <input
                            type="radio"
                            name="hours_type"
                            value={opt.value}
                            checked={config.monthly_hours_type === opt.value}
                            onChange={() => {}} // Controlled by div onClick
                            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 pointer-events-none"
                          />
                        </div>
                        <div className="ml-3">
                          <div className="text-sm font-bold text-gray-900">{opt.label}</div>
                          <div className="text-[10px] text-gray-500 leading-tight mt-0.5">{opt.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Numeric Inputs */}
                <div className="space-y-4">
                  {config.monthly_hours_type === 'fixed' && (
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                      <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">
                        Fixed Working Days
                      </label>
                      <div className="flex items-center gap-3">
                        <input
                          type="number"
                          min="1"
                          max="31"
                          step="0.5"
                          value={config.fixed_days}
                          onChange={(e) => handleConfigChange({ fixed_days: parseFloat(e.target.value) || 0 })}
                          className="block w-24 rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm font-bold"
                        />
                        <span className="text-sm text-gray-500 font-medium">days / month</span>
                      </div>
                      <p className="mt-2 text-[10px] text-gray-400">Common: 26 days (excluding Sundays) or 30 days.</p>
                    </div>
                  )}

                  <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">
                      Daily Working Hours
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        min="1"
                        max="24"
                        step="0.5"
                        value={config.working_hours_per_day}
                        onChange={(e) => handleConfigChange({ working_hours_per_day: parseFloat(e.target.value) || 0 })}
                        className="block w-24 rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm font-bold"
                      />
                      <span className="text-sm text-gray-500 font-medium">hours / day</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Global Multiplier Section - Premium Redesign */}
              <div className="mt-10 pt-8 border-t border-slate-100">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                    <TrendingUp className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 leading-none mb-1">OT Multiplier</h4>
                    <p className="text-[11px] text-slate-500 font-medium">Define the wage factor for overtime hours processed system-wide.</p>
                  </div>
                </div>

                <div className="bg-white border rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex flex-col lg:flex-row gap-8 items-start lg:items-center justify-between">
                    
                    {/* Input Controls */}
                    <div className="space-y-4 w-full lg:w-auto">
                      <div className="flex items-center gap-4">
                        <div className="relative group">
                          <input
                            type="number"
                            min="0.5"
                            max="5.0"
                            step="0.05"
                            value={config.global_multiplier}
                            onChange={(e) => handleConfigChange({ global_multiplier: parseFloat(e.target.value) || 1.00 })}
                            className="w-32 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xl font-black text-indigo-600 focus:ring-4 focus:ring-indigo-50 focus:border-indigo-500 outline-none transition-all text-center pr-8"
                          />
                          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-indigo-400 group-focus-within:text-indigo-600">x</span>
                        </div>
                        
                        <div className="flex items-center gap-1.5 p-1 bg-slate-50 border rounded-xl">
                          {[1.0, 1.5, 2.0].map(val => (
                            <button
                              key={val}
                              type="button"
                              onClick={() => handleConfigChange({ global_multiplier: val })}
                              className={`px-3 py-1.5 text-[10px] font-black rounded-lg transition-all ${
                                config.global_multiplier === val 
                                  ? 'bg-white text-indigo-600 shadow-sm border border-slate-200' 
                                  : 'text-slate-400 hover:text-slate-600 hover:bg-white/50'
                              }`}
                            >
                              {val.toFixed(1)}x
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Formula Preview Info */}
              <div className="mt-8 bg-slate-50 border border-slate-200 rounded-xl p-5 flex items-start gap-4">
                <div className="p-2.5 bg-white border border-slate-200 rounded-xl shrink-0 shadow-sm">
                  <Info className="h-4 w-4 text-indigo-600" />
                </div>
                <div>
                  <h5 className="text-sm font-bold text-slate-900 leading-none mb-2">Final Hourly OT Rate Formula</h5>
                  <p className="text-[11px] text-slate-700 font-medium leading-relaxed">
                    Rate = <code className="bg-white px-1.5 py-0.5 rounded border border-slate-200 text-indigo-700 font-bold mx-1">
                      (Base Salary / ({config.monthly_hours_type === 'fixed' ? config.fixed_days : 'Days'} × {config.working_hours_per_day})) × {config.global_multiplier.toFixed(2)}x
                    </code>
                  </p>
                  <p className="text-[10px] text-slate-700 mt-2 font-semibold uppercase tracking-wider">
                    Example: ₹20,000 / {(config.monthly_hours_type === 'fixed' ? config.fixed_days : 30) * config.working_hours_per_day}hrs = ₹{(20000 / ((config.monthly_hours_type === 'fixed' ? config.fixed_days : 30) * config.working_hours_per_day)).toFixed(2)} × {config.global_multiplier.toFixed(2)} = <span className="text-indigo-600 font-black">₹{( (20000 / ((config.monthly_hours_type === 'fixed' ? config.fixed_days : 30) * config.working_hours_per_day)) * config.global_multiplier ).toFixed(2)}/hr</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Save Button - Moved outside the config.enabled condition */}
      <div className="flex justify-end pt-4">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
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
      </div>
    </div>
  );
}