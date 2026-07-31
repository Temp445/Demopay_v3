import React, { useState, useEffect } from 'react';
import { Clock, AlertCircle, Info, CheckCircle, Calculator, TrendingUp, Zap, DollarSign, Plus, Trash2, Edit2, ShieldAlert } from 'lucide-react';
import {
  getOvertimePolicies,
  saveOvertimePolicy,
  deleteOvertimePolicy,
  validateRoundingInterval,
  calculateOvertimePreview,
  formatOvertimeDisplay,
  getRoundingMethodDescription,
  getTimingDescription,
  type OvertimePolicy,
} from '../../../lib/overtime';
import { getOTStructures } from '../../../lib/otManagement';
import type { OTStructure } from '../../../types/overtime';
import { getTenantId } from '../../../lib/tenantDb';
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
  const [policies, setPolicies] = useState<OvertimePolicy[]>([]);
  const [otStructures, setOtStructures] = useState<OTStructure[]>([]);
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(null);

  useEffect(() => {
    loadConfiguration();
  }, []);

  const loadConfiguration = async () => {
    try {
      setLoading(true);
      const fetchedPolicies = await getOvertimePolicies();
      const tenantId = await getTenantId();
      let structures: OTStructure[] = [];
      if (tenantId) {
        structures = await getOTStructures(tenantId);
        setOtStructures(structures);
      }
      
      const defaultStructure = structures.find(s => s.is_default) || structures[0];
      const updatedPolicies = fetchedPolicies.map(p => ({
        ...p,
        ot_structure_id: p.ot_structure_id || defaultStructure?.id
      }));
      
      setPolicies(updatedPolicies);

      if (updatedPolicies.length > 0 && !selectedPolicyId) {
        setSelectedPolicyId(updatedPolicies[0].id);
      }
    } catch (error) {
      console.error('Error loading overtime policies:', error);
      toast.error('Failed to load overtime configurations');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNew = () => {
    const newPolicy: OvertimePolicy = {
      id: '', // Will be assigned by backend
      name: 'New OT Policy',
      location_status_match: 'outside_office',
      is_default: false,
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
      ot_structure_id: otStructures.find(s => s.is_default)?.id || otStructures[0]?.id,
    };
    
    // Add temporarily to state with a temporary ID
    const tempId = 'temp-' + Date.now();
    setPolicies([...policies, { ...newPolicy, id: tempId }]);
    setSelectedPolicyId(tempId);
  };

  const handleDelete = async (policyId: string) => {
    if (policyId.startsWith('temp-')) {
      // Just remove from state
      const newPolicies = policies.filter(p => p.id !== policyId);
      setPolicies(newPolicies);
      setSelectedPolicyId(newPolicies.length > 0 ? newPolicies[0].id : null);
      return;
    }

    if (!window.confirm('Are you sure you want to delete this overtime policy?')) return;

    try {
      setSaving(true);
      await deleteOvertimePolicy(policyId);
      toast.success('Policy deleted successfully');
      
      const newPolicies = policies.filter(p => p.id !== policyId);
      setPolicies(newPolicies);
      setSelectedPolicyId(newPolicies.length > 0 ? newPolicies[0].id : null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete policy');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async (policy: OvertimePolicy) => {
    if (policy.enabled) {
      const validation = validateRoundingInterval(
        policy.threshold_minutes,
        policy.rounding_interval
      );

      if (!validation.valid) {
        toast.error(validation.message || 'Invalid configuration');
        return;
      }
      
      if (!policy.ot_structure_id) {
        toast.error('Please select an OT Structure. If none exist, create one first in OT Structures.');
        return;
      }
    }

    try {
      setSaving(true);
      // Remove temp id if it's a new policy
      const isNew = policy.id.startsWith('temp-');
      const payload = isNew ? { ...policy, id: undefined } as Partial<OvertimePolicy> : policy;
      
      const saved = await saveOvertimePolicy(payload);
      if (saved) {
        toast.success('Overtime policy saved successfully');
        setPolicies(prev => prev.map(p => p.id === policy.id ? saved : p));
        if (isNew) {
          setSelectedPolicyId(saved.id);
        }
      }
    } catch (error) {
      console.error('Error saving overtime policy:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save policy');
    } finally {
      setSaving(false);
    }
  };

  const handleConfigChange = (policyId: string, updates: Partial<OvertimePolicy>) => {
    setPolicies(prev => prev.map(p => p.id === policyId ? { ...p, ...updates } : p));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  const selectedPolicy = policies.find(p => p.id === selectedPolicyId);

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Policies List Sidebar */}
      <div className="lg:w-64 flex-shrink-0 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium text-gray-900 flex items-center gap-2">
            <Clock className="h-5 w-5 text-indigo-600" />
            OT Policies
          </h3>
          <button
            onClick={handleCreateNew}
            className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
            title="Create New Policy"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-2">
          {policies.map(policy => (
            <button
              key={policy.id}
              onClick={() => setSelectedPolicyId(policy.id)}
              className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
                selectedPolicyId === policy.id
                  ? 'bg-indigo-50 border-indigo-200 shadow-sm'
                  : 'bg-white border-gray-200 hover:border-indigo-100 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-gray-900 text-sm truncate pr-2">
                  {policy.name}
                </span>
                {policy.is_default && (
                  <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-100 text-indigo-800">
                    Default
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className={`w-2 h-2 rounded-full ${policy.enabled ? 'bg-green-500' : 'bg-gray-300'}`} />
                {policy.location_status_match === 'normal' ? 'Normal Location' : policy.location_status_match}
              </div>
            </button>
          ))}
          
          {policies.length === 0 && (
            <div className="text-sm text-gray-500 text-center py-4 border border-dashed rounded-xl border-gray-200">
              No policies configured
            </div>
          )}
        </div>
      </div>

      {/* Editor Main Content */}
      <div className="flex-1 space-y-6">
        {!selectedPolicy ? (
          <div className="bg-white shadow rounded-lg p-12 text-center border border-gray-100">
            <div className="mx-auto w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mb-4">
              <Clock className="h-8 w-8 text-indigo-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Policy Selected</h3>
            <p className="text-gray-500 max-w-sm mx-auto mb-6">
              Select an overtime policy from the sidebar or create a new one to configure calculation rules.
            </p>
            <button
              onClick={handleCreateNew}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Policy
            </button>
          </div>
        ) : (
          <>
            {/* Policy General Info */}
            <div className="bg-white shadow rounded-lg p-6 space-y-4">
              <div className="flex justify-between items-start mb-2">
                <h4 className="text-sm font-medium text-gray-900 flex items-center gap-2">
                  <Edit2 className="h-4 w-4 text-indigo-500" />
                  Policy Details
                </h4>
                {!selectedPolicy.is_default && (
                  <button
                    onClick={() => handleDelete(selectedPolicy.id)}
                    className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete Policy"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Policy Name
                  </label>
                  <input
                    type="text"
                    value={selectedPolicy.name}
                    onChange={(e) => handleConfigChange(selectedPolicy.id, { name: e.target.value })}
                    className="block w-full rounded-md border border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none sm:text-sm px-3 py-2"
                    placeholder="e.g. Client Location OT"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Applies To (Location Status)
                  </label>
                  <select
                    value={selectedPolicy.location_status_match}
                    onChange={(e) => handleConfigChange(selectedPolicy.id, { location_status_match: e.target.value })}
                    disabled={selectedPolicy.is_default}
                    className="block w-full rounded-md border border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none sm:text-sm disabled:bg-gray-50 disabled:text-gray-500 px-3 py-2"
                  >
                    <option value="normal">Normal</option>
                    <option value="outside_office">Outside Office</option>
                  </select>
                  {selectedPolicy.is_default && (
                    <p className="mt-1 text-xs text-gray-500">The default policy applies to normal location statuses.</p>
                  )}
                </div>
              </div>
            </div>

            {/* Master Toggle */}
            <div className="bg-white shadow rounded-lg p-6 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-gray-900">
                    Enable Overtime Calculation for this Policy
                  </label>
                  <p className="text-sm text-gray-500">
                    Activate overtime tracking when this policy applies
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleConfigChange(selectedPolicy.id, { enabled: !selectedPolicy.enabled })}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                    selectedPolicy.enabled ? 'bg-indigo-600' : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      selectedPolicy.enabled ? 'translate-x-5' : 'translate-x-0'
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
                  onClick={() => handleConfigChange(selectedPolicy.id, { link_with_payroll: !selectedPolicy.link_with_payroll })}
                  disabled={!selectedPolicy.enabled}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                    selectedPolicy.link_with_payroll ? 'bg-indigo-600' : 'bg-gray-200'
                  } ${!selectedPolicy.enabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      selectedPolicy.link_with_payroll ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              
                <div className="pt-4 border-t border-gray-100">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    OT Structure
                  </label>
                  <select
                    required
                    value={selectedPolicy.ot_structure_id || ''}
                    onChange={(e) => handleConfigChange(selectedPolicy.id, { ot_structure_id: e.target.value })}
                    className="block w-full rounded-md border border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none sm:text-sm px-3 py-2"
                  >
                    {otStructures.map(structure => (
                      <option key={structure.id} value={structure.id}>
                        {structure.structure_name} {structure.is_default ? '(Default)' : ''}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-sm text-gray-500">
                    Select the OT structure template used for payroll calculations
                  </p>
                </div>

              {!selectedPolicy.enabled && (
                <div className="rounded-md bg-yellow-50 p-4">
                  <div className="flex">
                    <AlertCircle className="h-5 w-5 text-yellow-400" />
                    <div className="ml-3">
                      <p className="text-sm text-yellow-700">
                        Overtime calculation is currently disabled for this policy. Enable it to
                        configure rules.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Configuration Options */}
            {selectedPolicy.enabled && (
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
                            name={`timing-${selectedPolicy.id}`}
                            value={option.value}
                            checked={selectedPolicy.calculation_timing === option.value}
                            onChange={(e) =>
                              handleConfigChange(selectedPolicy.id, {
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
                        value={selectedPolicy.threshold_minutes}
                        onChange={(e) =>
                          handleConfigChange(selectedPolicy.id, {
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
                        value={selectedPolicy.rounding_interval}
                        onChange={(e) =>
                          handleConfigChange(selectedPolicy.id, {
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
                        value={selectedPolicy.rounding_method}
                        onChange={(e) =>
                          handleConfigChange(selectedPolicy.id, {
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
                        {getRoundingMethodDescription(selectedPolicy.rounding_method)}
                      </p>
                    </div>

                    {/* Rounding Mode (only for 'both' timing) */}
                    {selectedPolicy.calculation_timing === 'both' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Rounding Application Mode
                        </label>
                        <div className="space-y-2">
                          <label className="flex items-start p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                            <input
                              type="radio"
                              name={`rounding_mode-${selectedPolicy.id}`}
                              value="separate"
                              checked={selectedPolicy.rounding_mode === 'separate'}
                              onChange={(e) =>
                                handleConfigChange(selectedPolicy.id, {
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
                              name={`rounding_mode-${selectedPolicy.id}`}
                              value="combined"
                              checked={selectedPolicy.rounding_mode === 'combined'}
                              onChange={(e) =>
                                handleConfigChange(selectedPolicy.id, {
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
                                selectedPolicy.monthly_hours_type === opt.value 
                                  ? 'border-indigo-600 bg-indigo-50 shadow-sm' 
                                  : 'border-gray-200 hover:bg-gray-50'
                              }`}
                              onClick={() => handleConfigChange(selectedPolicy.id, { monthly_hours_type: opt.value as any })}
                            >
                              <div className="flex items-center h-5">
                                <input
                                  type="radio"
                                  name={`hours_type-${selectedPolicy.id}`}
                                  value={opt.value}
                                  checked={selectedPolicy.monthly_hours_type === opt.value}
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
                        {selectedPolicy.monthly_hours_type === 'fixed' && (
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
                                value={selectedPolicy.fixed_days}
                                onChange={(e) => handleConfigChange(selectedPolicy.id, { fixed_days: parseFloat(e.target.value) || 0 })}
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
                              value={selectedPolicy.working_hours_per_day}
                              onChange={(e) => handleConfigChange(selectedPolicy.id, { working_hours_per_day: parseFloat(e.target.value) || 0 })}
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
                          <p className="text-[11px] text-slate-500 font-medium">Define the wage factor for overtime hours processed under this policy.</p>
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
                                  value={selectedPolicy.global_multiplier}
                                  onChange={(e) => handleConfigChange(selectedPolicy.id, { global_multiplier: parseFloat(e.target.value) || 1.00 })}
                                  className="w-32 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xl font-black text-indigo-600 focus:ring-4 focus:ring-indigo-50 focus:border-indigo-500 outline-none transition-all text-center pr-8"
                                />
                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-indigo-400 group-focus-within:text-indigo-600">x</span>
                              </div>
                              
                              <div className="flex items-center gap-1.5 p-1 bg-slate-50 border rounded-xl">
                                {[1.0, 1.5, 2.0].map(val => (
                                  <button
                                    key={val}
                                    type="button"
                                    onClick={() => handleConfigChange(selectedPolicy.id, { global_multiplier: val })}
                                    className={`px-3 py-1.5 text-[10px] font-black rounded-lg transition-all ${
                                      selectedPolicy.global_multiplier === val 
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
                            (Base Salary / ({selectedPolicy.monthly_hours_type === 'fixed' ? selectedPolicy.fixed_days : 'Days'} × {selectedPolicy.working_hours_per_day})) × {selectedPolicy.global_multiplier.toFixed(2)}x
                          </code>
                        </p>
                        <p className="text-[10px] text-slate-700 mt-2 font-semibold uppercase tracking-wider">
                          Example: ₹20,000 / {(selectedPolicy.monthly_hours_type === 'fixed' ? selectedPolicy.fixed_days : 30) * selectedPolicy.working_hours_per_day}hrs = ₹{(20000 / ((selectedPolicy.monthly_hours_type === 'fixed' ? selectedPolicy.fixed_days : 30) * selectedPolicy.working_hours_per_day)).toFixed(2)} × {selectedPolicy.global_multiplier.toFixed(2)} = <span className="text-indigo-600 font-black">₹{( (20000 / ((selectedPolicy.monthly_hours_type === 'fixed' ? selectedPolicy.fixed_days : 30) * selectedPolicy.working_hours_per_day)) * selectedPolicy.global_multiplier ).toFixed(2)}/hr</span>
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Save Button */}
            <div className="flex justify-end pt-4">
              <button
                type="button"
                onClick={() => handleSave(selectedPolicy)}
                disabled={saving}
                className="inline-flex items-center px-6 py-2.5 border border-transparent text-sm font-medium rounded-xl shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Saving...
                  </>
                ) : (
                  'Save Policy Configuration'
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}