import { useEffect, useState, useCallback } from 'react';
import { MapPin, Radio, Bell, AlertTriangle, Save, Shield, ToggleLeft, ToggleRight, Info, Map, Key, CheckCircle, Loader2, XCircle, Eye, EyeOff, ReceiptIndianRupee } from 'lucide-react';
import { useTenant } from '../../../contexts/TenantContext';
import { useLocationSettingsStore } from '../../../stores/locationSettingsStore';
import { supabase } from '../../../lib/supabase';
import toast from 'react-hot-toast';

interface SettingToggleProps {
  label: string;
  description: string;
  enabled: boolean;
  onChange: (val: boolean) => void;
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
  impact?: string;
  children?: React.ReactNode;
}

function SettingToggle({ label, description, enabled, onChange, icon: Icon, iconBg, iconColor, impact, children }: SettingToggleProps) {
  return (
    <div className={`rounded-xl border transition-all duration-200 ${enabled ? 'bg-white border-blue-100 shadow-sm' : 'bg-gray-50 border-gray-200'}`}>
      <div className="flex flex-col sm:flex-row sm:items-start gap-4 p-4 sm:p-5">
        <div className="flex items-center justify-between w-full sm:w-auto">
          <div className={`p-2.5 rounded-lg ${iconBg} flex-shrink-0`}>
            <Icon className={`h-5 w-5 ${iconColor}`} />
          </div>
          <button
            type="button"
            onClick={() => onChange(!enabled)}
            className="sm:hidden flex-shrink-0 focus:outline-none"
            aria-label={`Toggle ${label}`}
          >
            {enabled ? (
              <ToggleRight className="h-8 w-8 text-blue-600 transition-colors" />
            ) : (
              <ToggleLeft className="h-8 w-8 text-gray-300 transition-colors" />
            )}
          </button>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className={`text-base font-semibold ${enabled ? 'text-gray-900' : 'text-gray-500'}`}>{label}</h3>
              {description && <p className="text-sm text-gray-500 mt-1 leading-relaxed">{description}</p>}
              {impact && (
                <div className="flex items-center gap-1.5 mt-2">
                  <Info className="h-4 w-4 text-amber-500 flex-shrink-0" />
                  <span className="text-sm text-amber-700">{impact}</span>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => onChange(!enabled)}
              className="hidden sm:block flex-shrink-0 focus:outline-none"
              aria-label={`Toggle ${label}`}
            >
              {enabled ? (
                <ToggleRight className="h-9 w-9 text-blue-600 transition-colors" />
              ) : (
                <ToggleLeft className="h-9 w-9 text-gray-300 transition-colors" />
              )}
            </button>
          </div>
        </div>
      </div>
      {children && enabled && (
        <div className="px-4 sm:px-5 pb-4 sm:pb-5 pt-0 sm:ml-14">
          <div className="pt-4 border-t border-gray-100">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}

export default function LocationSettingsPage() {
  const { currentTenant } = useTenant();
  const { settings, loading, saving, fetchSettings, saveSettings } = useLocationSettingsStore();

  const [localSettings, setLocalSettings] = useState({
    live_tracking_enabled: true,
    radius_monitoring_enabled: true,
    work_event_notifications_enabled: true,
    violation_notifications_enabled: true,
    journey_tracking_interval_mins: 5,
    work_radius_tracking_interval_mins: 15,
    allow_add_new_location: false,
    field_work_integration_enabled: false,
    field_work_component_id: null as string | null,
    travel_allowance_method: 'manual' as 'manual' | 'distance' | 'fixed',
    travel_allowance_rate: 0,
  });

  const [isDirty, setIsDirty] = useState(false);

  const [connectedComponent, setConnectedComponent] = useState<{
    name: string;
    description: string;
    is_active: boolean;
  } | null>(null);
  const [loadingComponent, setLoadingComponent] = useState(false);

  const fetchConnectedComponent = async (componentId: string) => {
    setLoadingComponent(true);
    try {
      const { data, error } = await supabase
        .from('payroll_components')
        .select('name, description, is_active')
        .eq('id', componentId)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setConnectedComponent(data);
      } else {
        setConnectedComponent(null);
      }
    } catch (err) {
      console.error('Failed to fetch connected component:', err);
      setConnectedComponent(null);
    } finally {
      setLoadingComponent(false);
    }
  };

  useEffect(() => {
    if (localSettings.field_work_component_id) {
      fetchConnectedComponent(localSettings.field_work_component_id);
    } else {
      setConnectedComponent(null);
    }
  }, [localSettings.field_work_component_id]);

  useEffect(() => {
    if (currentTenant?.id) {
      fetchSettings(currentTenant.id);
    }
  }, [currentTenant?.id]);

  useEffect(() => {
    setLocalSettings({
      live_tracking_enabled: settings.live_tracking_enabled,
      radius_monitoring_enabled: settings.radius_monitoring_enabled,
      work_event_notifications_enabled: settings.work_event_notifications_enabled,
      violation_notifications_enabled: settings.violation_notifications_enabled,
      journey_tracking_interval_mins: settings.journey_tracking_interval_mins ?? 5,
      minimum_movement_threshold_meters: settings.minimum_movement_threshold_meters ?? 10,
      work_radius_tracking_interval_mins: settings.work_radius_tracking_interval_mins ?? 15,
      work_radius_minimum_movement_threshold_meters: settings.work_radius_minimum_movement_threshold_meters ?? 10,
      allow_add_new_location: settings.allow_add_new_location ?? false,
      field_work_integration_enabled: settings.field_work_integration_enabled ?? false,
      field_work_component_id: settings.field_work_component_id ?? null,
      travel_allowance_method: settings.travel_allowance_method ?? 'manual',
      travel_allowance_rate: settings.travel_allowance_rate ?? 0,
      multi_location_policy: settings.multi_location_policy ?? 'separate',
    });
    setIsDirty(false);
  }, [settings]);

  const handleToggle = (key: keyof typeof localSettings, value: boolean) => {
    setLocalSettings(prev => {
      return { ...prev, [key]: value };
    });
    setIsDirty(true);
  };



  const handleSave = async () => {
    if (!currentTenant?.id) return;

    const { data: activeSessions } = await supabase
      .from('work_locations')
      .select('id')
      .eq('tenant_id', currentTenant.id)
      .in('status', ['in_progress'])
      .limit(1);

    if (activeSessions && activeSessions.length > 0) {
      toast.error('Cannot change location settings while work sessions are active. Please wait until all active work is completed or paused.');
      return;
    }

    if (Number(localSettings.journey_tracking_interval_mins) < 1) {
      toast.error('Journey Tracking Interval must be at least 1 minute.');
      return;
    }

    if (Number(localSettings.minimum_movement_threshold_meters) < 20) {
      toast.error('Minimum Movement Threshold must be at least 20 meters.');
      return;
    }

    if (Number(localSettings.work_radius_tracking_interval_mins) < 5) {
      toast.error('Work Area Tracking Interval must be at least 5 minutes.');
      return;
    }

    if (Number(localSettings.work_radius_minimum_movement_threshold_meters) < 20) {
      toast.error('Work Area Minimum Movement Threshold must be at least 20 meters.');
      return;
    }

    try {
      const payload: Record<string, any> = {
        live_tracking_enabled: localSettings.live_tracking_enabled,
        radius_monitoring_enabled: localSettings.radius_monitoring_enabled,
        work_event_notifications_enabled: localSettings.work_event_notifications_enabled,
        violation_notifications_enabled: localSettings.violation_notifications_enabled,
        journey_tracking_interval_mins: Number(localSettings.journey_tracking_interval_mins) || 5,
        minimum_movement_threshold_meters: Number(localSettings.minimum_movement_threshold_meters) || 10,
        work_radius_tracking_interval_mins: Number(localSettings.work_radius_tracking_interval_mins) || 15,
        work_radius_minimum_movement_threshold_meters: Number(localSettings.work_radius_minimum_movement_threshold_meters) || 10,
        allow_add_new_location: localSettings.allow_add_new_location,
        field_work_integration_enabled: localSettings.field_work_integration_enabled,
        field_work_component_id: localSettings.field_work_component_id,
        travel_allowance_method: localSettings.travel_allowance_method,
        travel_allowance_rate: Number(localSettings.travel_allowance_rate) || 0,
        multi_location_policy: localSettings.multi_location_policy,
      };
      await saveSettings(currentTenant.id, payload);
      toast.success('Location settings saved successfully');
      setIsDirty(false);
    } catch {
      toast.error('Failed to save settings');
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="max-w-4xl mx-auto space-y-4">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2 bg-blue-100 rounded-lg">
            <MapPin className="h-6 w-6 text-blue-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Work Location Settings</h1>
        </div>
        <p className="text-base text-gray-500 ml-1">
          Control how work location tracking behaves across the platform. Changes take effect immediately.
        </p>
      </div>

      <div className="space-y-3">
        <div className="mt-5 mb-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Tracking</p>
        </div>

        <SettingToggle
          label="Live GPS Tracking"
          description="When enabled, employees must share their GPS location before starting work."
          enabled={localSettings.live_tracking_enabled}
          onChange={(v) => handleToggle('live_tracking_enabled', v)}
          icon={Radio}
          iconBg="bg-blue-50"
          iconColor="text-blue-600"
          impact={!localSettings.live_tracking_enabled ? 'Live Tracking screen will be hidden from the sidebar. Only timestamps will be recorded on Start Work.' : undefined}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Journey Tracking Interval (Minutes)</label>
              <input
                type="number"
                min="1"
                max="60"
                value={localSettings.journey_tracking_interval_mins || ''}
                onChange={(e) => {
                  const val = e.target.value === '' ? ('' as unknown as number) : parseInt(e.target.value);
                  setLocalSettings(prev => ({ ...prev, journey_tracking_interval_mins: val }));
                  setIsDirty(true);
                }}
                className="w-full px-4 py-2.5 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Minimum Movement Threshold (meters)</label>
              <input
                type="number"
                min="20"
                max="1000"
                value={localSettings.minimum_movement_threshold_meters || ''}
                onChange={(e) => {
                  const val = e.target.value === '' ? ('' as unknown as number) : parseInt(e.target.value);
                  setLocalSettings(prev => ({ ...prev, minimum_movement_threshold_meters: val }));
                  setIsDirty(true);
                }}
                className="w-full px-4 py-2.5 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow"
              />
            </div>
          </div>
        </SettingToggle>

        <SettingToggle
          label="Radius Monitoring"
          description="When enabled, a configurable radius boundary is set for each work location."
          enabled={localSettings.radius_monitoring_enabled}
          onChange={(v) => handleToggle('radius_monitoring_enabled', v)}
          icon={Shield}
          iconBg="bg-green-50"
          iconColor="text-green-600"
          impact={!localSettings.radius_monitoring_enabled ? 'Radius configuration will be hidden in the assignment UI. No boundary violations will be tracked.' : undefined}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Work Area Tracking Interval (Minutes)</label>
              <input
                type="number"
                min="5"
                max="60"
                value={localSettings.work_radius_tracking_interval_mins || ''}
                onChange={(e) => {
                  const val = e.target.value === '' ? ('' as unknown as number) : parseInt(e.target.value);
                  setLocalSettings(prev => ({ ...prev, work_radius_tracking_interval_mins: val }));
                  setIsDirty(true);
                }}
                className="w-full px-4 py-2.5 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-shadow"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Minimum Movement Threshold (meters)</label>
              <input
                type="number"
                min="20"
                max="1000"
                value={localSettings.work_radius_minimum_movement_threshold_meters || ''}
                onChange={(e) => {
                  const val = e.target.value === '' ? ('' as unknown as number) : parseInt(e.target.value);
                  setLocalSettings(prev => ({ ...prev, work_radius_minimum_movement_threshold_meters: val }));
                  setIsDirty(true);
                }}
                className="w-full px-4 py-2.5 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-shadow"
              />
            </div>
          </div>
        </SettingToggle>

        <SettingToggle
          label="Allow Employees to Add New Work Locations"
          description="When enabled, employees can dynamically add new work locations from the field and loop through their daily journey workflow."
          enabled={localSettings.allow_add_new_location}
          onChange={(v) => handleToggle('allow_add_new_location', v)}
          icon={MapPin}
          iconBg="bg-purple-50"
          iconColor="text-purple-600"
        />

        <div className="mt-5 mb-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Payroll Integration</p>
        </div>

        <div className={`rounded-xl border transition-all duration-200 p-5 ${localSettings.field_work_integration_enabled ? 'bg-white border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
          <div className="flex items-start gap-4">
            <div className={`p-2.5 hidden rounded-lg md:flex flex-shrink-0 ${localSettings.field_work_integration_enabled ? 'bg-blue-50' : 'bg-gray-100'}`}>
              <ReceiptIndianRupee className={`h-5 w-5 ${localSettings.field_work_integration_enabled ? 'text-blue-600' : 'text-gray-400'}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className={`text-base font-semibold ${localSettings.field_work_integration_enabled ? 'text-gray-900' : 'text-gray-500'}`}>
                    Travel Allowance linked with payroll
                  </h3>
                  <p className="text-sm text-gray-500 mt-0.5 leading-relaxed">
                    If enabled, Travel Allowance will be added to the employee's payroll.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    if (!currentTenant?.id) return;
                    const nextVal = !localSettings.field_work_integration_enabled;

                    if (nextVal) {
                      // Enabling
                      if (localSettings.field_work_component_id) {
                        // Component already exists - activate it
                        try {
                          const { error } = await supabase
                            .from('payroll_components')
                            .update({ is_active: true, updated_at: new Date().toISOString() })
                            .eq('id', localSettings.field_work_component_id);
                          if (error) throw error;

                          await saveSettings(currentTenant.id, {
                            field_work_integration_enabled: true,
                            field_work_component_id: localSettings.field_work_component_id
                          });

                          toast.success('Travel Allowance integration enabled');
                        } catch (err) {
                          toast.error('Failed to activate connected component');
                        }
                      } else {
                        // Component does not exist - auto-create
                        const toastId = toast.loading('Auto-creating Travel Allowance payroll component...');
                        try {
                          const { data: newComp, error: createError } = await supabase
                            .from('payroll_components')
                            .insert({
                              tenant_id: currentTenant.id,
                              name: 'Travel Allowance',
                              description: 'Paid gate pass travel allowance',
                              component_type: 'earning',
                              component_category: 'general',
                              type_selection: 'individual',
                              amount_type: 'value',
                              calculation_type: 'simple',
                              value_set: 'at_executing',
                              eligibility: 'all',
                              rounding_type: 'none',
                              is_active: true
                            })
                            .select()
                            .single();

                          if (createError) throw createError;

                          await saveSettings(currentTenant.id, {
                            field_work_integration_enabled: true,
                            field_work_component_id: newComp.id
                          });

                          toast.success("Auto-created and dynamically linked 'Travel Allowance' component!", { id: toastId });
                        } catch (err) {
                          console.error(err);
                          toast.error('Failed to auto-create Travel Allowance component', { id: toastId });
                        }
                      }
                    } else {
                      // Disabling
                      if (localSettings.field_work_component_id) {
                        try {
                          const { error } = await supabase
                            .from('payroll_components')
                            .update({ is_active: false, updated_at: new Date().toISOString() })
                            .eq('id', localSettings.field_work_component_id);
                          if (error) throw error;
                        } catch (err) {
                          console.error('Failed to make component inactive:', err);
                        }
                      }

                      await saveSettings(currentTenant.id, {
                        field_work_integration_enabled: false
                      });

                      toast.success('Integration disabled. Component set to inactive.');
                    }
                  }}
                  className="flex-shrink-0 focus:outline-none"
                  aria-label="Toggle Travel Allowance Integration"
                >
                  {localSettings.field_work_integration_enabled ? (
                    <ToggleRight className="h-9 w-9 text-blue-600 transition-colors" />
                  ) : (
                    <ToggleLeft className="h-9 w-9 text-gray-300 transition-colors" />
                  )}
                </button>
              </div>

              {localSettings.field_work_integration_enabled && (
                <div className="pt-2 border-t border-blue-100/50 bg-blue-50/30 rounded-lg">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      {loadingComponent ? (
                        <div className="flex items-center gap-1.5 text-xs text-gray-500">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          <span>Fetching component details...</span>
                        </div>
                      ) : connectedComponent ? (
                        <div className="space-y-4">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-700 font-medium">Mapped Component:</span>
                            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold rounded">
                              {connectedComponent.name}
                            </span>
                            <span className={`px-1.5 py-0.5 text-[9px] font-semibold rounded ${connectedComponent.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                              {connectedComponent.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 bg-blue-50/70 border border-blue-100 rounded px-2.5 py-1">
                            <Info className="h-3.5 w-3.5 text-blue-600 flex-shrink-0" />
                            <span className="text-[10px] text-blue-700 leading-snug">
                              Once enabled, the component will be automatically created if it is not available in the <strong>Component Master</strong>. After that, go to the Salary Structure and add the component to the structure.
                            </span>
                          </div>

                          <div className="pt-3 border-t border-blue-100/50">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1.5">Calculation Method</label>
                                <select
                                  value={localSettings.travel_allowance_method}
                                  onChange={(e) => {
                                    setLocalSettings(prev => ({
                                      ...prev,
                                      travel_allowance_method: e.target.value as 'manual' | 'distance' | 'fixed'
                                    }));
                                    setIsDirty(true);
                                  }}
                                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                                >
                                  <option value="manual">Manual Entry (Receipt-Based)</option>
                                  <option value="distance">Distance-Based (Per km)</option>
                                  <option value="fixed">Fixed Amount (Per journey)</option>
                                </select>
                                <p className="text-[10px] text-gray-500 mt-1">
                                  {localSettings.travel_allowance_method === 'manual' && 'Admin enters exact amount based on receipts.'}
                                  {localSettings.travel_allowance_method === 'distance' && 'Calculated as Total km × Rate.'}
                                  {localSettings.travel_allowance_method === 'fixed' && 'Flat amount granted per journey.'}
                                </p>
                              </div>

                              {localSettings.travel_allowance_method !== 'manual' && (
                                <div>
                                  <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                    {localSettings.travel_allowance_method === 'distance' ? 'Rate (₹ per km)' : 'Flat Amount (₹ per journey)'}
                                  </label>
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={localSettings.travel_allowance_rate || ''}
                                    onChange={(e) => {
                                      const val = e.target.value === '' ? ('' as unknown as number) : parseFloat(e.target.value);
                                      setLocalSettings(prev => ({ ...prev, travel_allowance_rate: val }));
                                      setIsDirty(true);
                                    }}
                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                                  />
                                </div>
                              )}
                            </div>
                            
                            {/* Multi-Location Policy */}
                            <div className="mt-4 pt-4 border-t border-blue-100/50">
                              <label className="block text-xs font-medium text-gray-700 mb-1.5">Multi-Location Policy</label>
                              <div className="flex flex-col sm:flex-row gap-3">
                                <label className={`flex-1 flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${localSettings.multi_location_policy === 'separate' ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-200 hover:bg-gray-50'}`}>
                                  <input 
                                    type="radio" 
                                    name="multi_location_policy" 
                                    value="separate"
                                    checked={localSettings.multi_location_policy === 'separate'}
                                    onChange={(e) => {
                                      setLocalSettings(prev => ({ ...prev, multi_location_policy: 'separate' }));
                                      setIsDirty(true);
                                    }}
                                    className="mt-1 text-blue-600 focus:ring-blue-500"
                                  />
                                  <div>
                                    <div className="text-sm font-semibold text-gray-900">Separate Locations</div>
                                    <div className="text-xs text-gray-500 mt-0.5">Split journey distance precisely between locations visited in the same day.</div>
                                  </div>
                                </label>
                                
                                <label className={`flex-1 flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${localSettings.multi_location_policy === 'combine' ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-200 hover:bg-gray-50'}`}>
                                  <input 
                                    type="radio" 
                                    name="multi_location_policy" 
                                    value="combine"
                                    checked={localSettings.multi_location_policy === 'combine'}
                                    onChange={(e) => {
                                      setLocalSettings(prev => ({ ...prev, multi_location_policy: 'combine' }));
                                      setIsDirty(true);
                                    }}
                                    className="mt-1 text-blue-600 focus:ring-blue-500"
                                  />
                                  <div>
                                    <div className="text-sm font-semibold text-gray-900">Combine into Daily Route</div>
                                    <div className="text-xs text-gray-500 mt-0.5">Group all locations into a single combined approval item for the full day's route.</div>
                                  </div>
                                </label>
                              </div>
                            </div>

                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-amber-700">
                          Component connection lost. It will be recreated on your next toggle.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* <div className="mt-5 mb-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Notifications</p>
        </div> */}

        {/* <SettingToggle
          label="Work Event Notifications"
          description="Send notifications to relevant parties when work is started, paused, resumed, or completed by employees."
          enabled={localSettings.work_event_notifications_enabled}
          onChange={(v) => handleToggle('work_event_notifications_enabled', v)}
          icon={Bell}
          iconBg="bg-amber-50"
          iconColor="text-amber-600"
          impact={!localSettings.work_event_notifications_enabled ? 'No notifications will be sent for work start, pause, resume, or completion events.' : undefined}
        /> */}

        {/* <SettingToggle
          label="Location Violation Alerts"
          description="Send real-time alerts to admins when an employee exits their assigned work location boundary."
          enabled={localSettings.violation_notifications_enabled}
          onChange={(v) => handleToggle('violation_notifications_enabled', v)}
          icon={AlertTriangle}
          iconBg="bg-red-50"
          iconColor="text-red-600"
          impact={!localSettings.violation_notifications_enabled ? 'Admins will not receive alerts when employees leave their assigned radius.' : undefined}
        /> */}
      </div>

      <div className="mt-6 flex items-center justify-between pt-4 border-t border-gray-100">
        {isDirty ? (
          <p className="text-xs text-amber-600 font-medium">You have unsaved changes</p>
        ) : (
          <p className="text-xs text-gray-400">All changes are saved</p>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !isDirty}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
