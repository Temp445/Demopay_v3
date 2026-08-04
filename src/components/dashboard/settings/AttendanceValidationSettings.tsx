import { useState, useEffect, useRef } from 'react';
import { Save, AlertCircle, CheckCircle, Clock, Camera, MapPin, Navigation, ShieldCheck, BellDot } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import toast from 'react-hot-toast';
import { validateAuth } from '../../../stores/utils/storeUtils';
import { useSettingsStore } from '../../../stores/settingsStore';
import EmployeeAttendanceSettingsModal, { EmployeeAttendanceSettingsRef } from './EmployeeAttendanceSettingsModal';
import MissedPunchNotificationSettings from './MissedPunchNotificationSettings';

interface ValidationConfig {
  id?: string;
  tenant_id?: string;
  entry_grace_time_minutes: number;
  exit_grace_time_minutes: number;
  late_entry_limit_minutes: number;
  total_allowed_late_entry_count: number;
  early_exit_limit_minutes: number;
  total_allowed_early_exit_count: number;
  min_permission_minutes: number;
  max_permission_minutes: number;
  total_permission_minutes_per_month: number;
  permission_round_up_to_minutes: number;
  enable_half_day_rules: boolean;
  allow_manual_clock_in_out: boolean;
  require_location: boolean;
  enable_travel_tracking: boolean;
  capture_image_while_face_clockin: boolean;
  gps_sampling_interval_mins: number;
  min_movement_threshold_meters: number;
  device_tracking_applicability?: 'common' | 'specific';
  missed_punch_reset_hours: number;
}

const defaultConfig: ValidationConfig = {
  entry_grace_time_minutes: 15,
  exit_grace_time_minutes: 15,
  late_entry_limit_minutes: 30,
  total_allowed_late_entry_count: 5,
  early_exit_limit_minutes: 30,
  total_allowed_early_exit_count: 5,
  min_permission_minutes: 30,
  max_permission_minutes: 60,
  total_permission_minutes_per_month: 180,
  permission_round_up_to_minutes: 30,
  enable_half_day_rules: true,
  allow_manual_clock_in_out: false,
  require_location: false,
  enable_travel_tracking: false,
  capture_image_while_face_clockin: false,
  gps_sampling_interval_mins: 5,
  min_movement_threshold_meters: 20,
  device_tracking_applicability: 'common',
  missed_punch_reset_hours: 14
};

export default function AttendanceValidationSettings() {
  const [activeTab, setActiveTab] = useState<'validation' | 'missing_attendance'>('validation');
  const [config, setConfig] = useState<ValidationConfig>(defaultConfig);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const { companySettings, fetchCompanySettings } = useSettingsStore();
  const employeeSettingsRef = useRef<EmployeeAttendanceSettingsRef>(null);

  useEffect(() => {
    loadConfig();
    fetchCompanySettings();
  }, []);

  const loadConfig = async () => {
    try {
      const auth = await validateAuth();
      if (!auth?.tenantId) return;

      const { data, error } = await supabase
        .from('attendance_validation_config')
        .select('*')
        .eq('tenant_id', auth.tenantId)
        .eq('is_active', true)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading config:', error);
        return;
      }

      if (data) {
        setConfig(data);
      }
    } catch (error) {
      console.error('Error loading validation config:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('User not authenticated');
        return;
      }

       const auth = await validateAuth();
        if (!auth?.tenantId) {
        toast.error('Tenant not found');
        return;
      }

      const saveData = {
        ...config,
        tenant_id: auth.tenantId,
        is_active: true
      };

      const { error } = await supabase
        .from('attendance_validation_config')
        .upsert(saveData, {
          onConflict: 'tenant_id'
        });

      if (error) {
        toast.error(`Failed to save: ${error.message}`);
        return;
      }

      if (config.device_tracking_applicability === 'specific' && employeeSettingsRef.current) {
        await employeeSettingsRef.current.save();
      }

      toast.success('Settings saved successfully');
      setHasChanges(false);
      await loadConfig();
    } catch (error) {
      toast.error('Failed to save settings');
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    setLoading(true);
    await loadConfig();
    setHasChanges(false);
  };

  const handleChange = (field: keyof ValidationConfig, value: number | boolean) => {
    if (field === 'require_location' && value === true) {
      const locations = companySettings?.branch_locations || [];
      if (locations.length === 0) {
        toast.error('Please add at least one branch location before requiring location for attendance.');
        return; // Prevent enabling
      }
    }
    setConfig(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      <div className="p-4 sm:p-6 border-b border-gray-200">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Attendance Settings</h2>
        <p className="text-sm text-gray-600 mt-1">
          Configure attendance validation rules and notifications for your organization
        </p>
      </div>

      {/* ── Tab Navigation ── */}
      <div className="px-4 sm:px-6 py-4 bg-gray-50 border-b border-gray-200">
        <div className="inline-flex bg-white border border-gray-200 rounded-xl p-1 shadow-sm gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('validation')}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
              activeTab === 'validation'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
            }`}
          >
            <ShieldCheck className="h-4 w-4" />
            Validation Rules
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('missing_attendance')}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
              activeTab === 'missing_attendance'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
            }`}
          >
            <BellDot className="h-4 w-4" />
            Attendance Alert
          </button>
        </div>
      </div>

      <div className="p-4 sm:p-6">
        {activeTab === 'validation' && (
          <div className="space-y-6">
        {/* Grace Time Settings */}
        <div className="border-b pb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Grace Time Settings</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Entry Grace Time (minutes)
              </label>
              <input
                type="number"
                min="0"
                value={config.entry_grace_time_minutes}
                onChange={(e) => handleChange('entry_grace_time_minutes', parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="text-xs text-gray-500 mt-1">Time allowed after shift start without penalty</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Exit Grace Time (minutes)
              </label>
              <input
                type="number"
                min="0"
                value={config.exit_grace_time_minutes}
                onChange={(e) => handleChange('exit_grace_time_minutes', parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="text-xs text-gray-500 mt-1">Time allowed before shift end without penalty</p>
            </div>
          </div>
        </div>

        {/* Late Entry Settings */}
        <div className="border-b pb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Late Entry Settings</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Late Entry Limit (minutes)
              </label>
              <input
                type="number"
                min="0"
                value={config.late_entry_limit_minutes}
                onChange={(e) => handleChange('late_entry_limit_minutes', parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="text-xs text-gray-500 mt-1">Maximum minutes to be marked as late</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Monthly Late Entry Count Limit
              </label>
              <input
                type="number"
                min="0"
                value={config.total_allowed_late_entry_count}
                onChange={(e) => handleChange('total_allowed_late_entry_count', parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="text-xs text-gray-500 mt-1">Number of late entries allowed per month</p>
            </div>
          </div>
        </div>

        {/* Early Exit Settings */}
        <div className="border-b pb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Early Exit Settings</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Early Exit Limit (minutes)
              </label>
              <input
                type="number"
                min="0"
                value={config.early_exit_limit_minutes}
                onChange={(e) => handleChange('early_exit_limit_minutes', parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="text-xs text-gray-500 mt-1">Maximum minutes to be marked as early exit</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Monthly Early Exit Count Limit
              </label>
              <input
                type="number"
                min="0"
                value={config.total_allowed_early_exit_count}
                onChange={(e) => handleChange('total_allowed_early_exit_count', parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="text-xs text-gray-500 mt-1">Number of early exits allowed per month</p>
            </div>
          </div>
        </div>

        {/* Permission Settings */}
        <div className="border-b pb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Permission Settings</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Minimum Permission (minutes)
              </label>
              <input
                type="number"
                min="0"
                value={config.min_permission_minutes}
                onChange={(e) => handleChange('min_permission_minutes', parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="text-xs text-gray-500 mt-1">Minimum minutes per permission occurrence</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Maximum Permission (minutes)
              </label>
              <input
                type="number"
                min="0"
                value={config.max_permission_minutes}
                onChange={(e) => handleChange('max_permission_minutes', parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="text-xs text-gray-500 mt-1">Maximum minutes per permission occurrence</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Total Monthly Permission (minutes)
              </label>
              <input
                type="number"
                min="0"
                value={config.total_permission_minutes_per_month}
                onChange={(e) => handleChange('total_permission_minutes_per_month', parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="text-xs text-gray-500 mt-1">Total permission minutes allowed per employee per month</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Permission Round Up To (minutes)
              </label>
              <input
                type="number"
                min="1"
                value={config.permission_round_up_to_minutes}
                onChange={(e) => handleChange('permission_round_up_to_minutes', parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="text-xs text-gray-500 mt-1">Round up permission minutes to this increment</p>
            </div>
          </div>
        </div>

        {/* Device & Tracking Controls */}
        <div className="border-b pb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Clock In/Out & Tracking Controls</h3>
          
          <div className="mb-6">
            <label className="text-sm font-medium text-gray-700 block mb-3">Applicability</label>
            <div className="inline-flex bg-gray-100/80 p-1.5 rounded-xl border border-gray-200/50 shadow-inner">
              <button
                type="button"
                onClick={() => handleChange('device_tracking_applicability', 'common')}
                className={`px-6 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ease-in-out ${
                  config.device_tracking_applicability === 'common'
                    ? 'bg-white text-indigo-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-200/50'
                }`}
              >
                All Employees
              </button>
              <button
                type="button"
                onClick={() => handleChange('device_tracking_applicability', 'specific')}
                className={`px-6 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ease-in-out ${
                  config.device_tracking_applicability === 'specific'
                    ? 'bg-white text-indigo-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-200/50'
                }`}
              >
                Specific Employees
              </button>
            </div>
          </div>

          {config.device_tracking_applicability === 'common' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
              {/* Employee Controls */}
              <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                        <Clock className="w-5 h-5" />
                      </div>
                      <label htmlFor="allow_manual_clock_in_out" className="text-sm font-semibold text-gray-900 cursor-pointer">
                        Manual Clock In/Out
                      </label>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        id="allow_manual_clock_in_out"
                        checked={config.allow_manual_clock_in_out || false}
                        onChange={(e) => handleChange('allow_manual_clock_in_out', e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    When enabled, standard employees will be able to clock in/out without mandatory face recognition.
                  </p>
                </div>
              </div>

              {/* Missed Punch Reset Hours */}
              <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                        <Clock className="w-5 h-5" />
                      </div>
                      <label className="text-sm font-semibold text-gray-900">
                        Max Shift Duration
                      </label>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-2 mb-4">
                    If an employee doesn't clock out, the system automatically resets their shift after this many hours.
                  </p>
                  <input
                    type="number"
                    min="12"
                    max="24"
                    value={config.missed_punch_reset_hours}
                    onChange={(e) => handleChange('missed_punch_reset_hours', parseInt(e.target.value) || 14)}
                    onBlur={(e) => {
                      const val = parseInt(e.target.value);
                      if (isNaN(val) || val < 12) handleChange('missed_punch_reset_hours', 12);
                      else if (val > 24) handleChange('missed_punch_reset_hours', 24);
                    }}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Capture Face Image */}
              <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                        <Camera className="w-5 h-5" />
                      </div>
                      <label htmlFor="capture_image_while_face_clockin" className="text-sm font-semibold text-gray-900 cursor-pointer">
                        Face Image Capture
                      </label>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        id="capture_image_while_face_clockin"
                        checked={config.capture_image_while_face_clockin || false}
                        onChange={(e) => handleChange('capture_image_while_face_clockin', e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    When enabled, the system will save an image from the device camera during face recognition.
                  </p>
                </div>
              </div>

              {/* Location Settings */}
              <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                        <MapPin className="w-5 h-5" />
                      </div>
                      <label htmlFor="require_location" className="text-sm font-semibold text-gray-900 cursor-pointer">
                        Require Location
                      </label>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        id="require_location"
                        checked={config.require_location || false}
                        onChange={(e) => handleChange('require_location', e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    When enabled, the browser will request GPS location and validate against configured branch radii.
                  </p>
                </div>
              </div>

              {/* Field Travel Tracking */}
              <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between md:col-span-2">
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                        <Navigation className="w-5 h-5" />
                      </div>
                      <label htmlFor="enable_travel_tracking" className="text-sm font-semibold text-gray-900 cursor-pointer">
                        Enable Travel Tracking
                      </label>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        id="enable_travel_tracking"
                        checked={config.enable_travel_tracking || false}
                        onChange={(e) => handleChange('enable_travel_tracking', e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    When enabled, the system will track the employee's travel route if they clock in outside the office.
                  </p>
                  
                  {config.enable_travel_tracking && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6 pt-4 border-t border-gray-100">
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                          GPS Sampling Interval (minutes)
                        </label>
                        <input
                          type="number"
                          min="5"
                          value={config.gps_sampling_interval_mins === undefined ? '' : config.gps_sampling_interval_mins}
                          onChange={(e) => handleChange('gps_sampling_interval_mins', e.target.value === '' ? '' : parseInt(e.target.value))}
                          onBlur={(e) => {
                            const val = parseInt(e.target.value);
                            if (!isNaN(val) && val < 2) handleChange('gps_sampling_interval_mins', 5);
                          }}
                          placeholder="e.g., 5"
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                        />
                        <p className="text-[10px] text-gray-400 mt-1">Records location periodically when stationary (Min: 5 mins)</p>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                          Minimum Movement Threshold (meters)
                        </label>
                        <input
                          type="number"
                          min="20"
                          value={config.min_movement_threshold_meters === undefined ? '' : config.min_movement_threshold_meters}
                          onChange={(e) => handleChange('min_movement_threshold_meters', e.target.value === '' ? '' : parseInt(e.target.value))}
                          onBlur={(e) => {
                            const val = parseInt(e.target.value);
                            if (!isNaN(val) && val < 20) handleChange('min_movement_threshold_meters', 20);
                          }}
                          placeholder="e.g., 20"
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                        />
                        <p className="text-[10px] text-gray-400 mt-1">Records a checkpoint on move (Min: 20 meters)</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-2">
              <EmployeeAttendanceSettingsModal 
                ref={employeeSettingsRef} 
                onChange={() => setHasChanges(true)} 
              />
            </div>
          )}
        </div>


        {/* Half Day Rules */}
        {/* <div className="pb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Half Day Rules</h3>
          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              id="enable_half_day"
              checked={config.enable_half_day_rules}
              onChange={(e) => handleChange('enable_half_day_rules', e.target.checked)}
              className="h-5 w-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
            />
            <label htmlFor="enable_half_day" className="text-sm font-medium text-gray-700">
              Enable Half Day Rules
            </label>
          </div>
          <p className="text-xs text-gray-500 mt-2 ml-8">
            When enabled, employees exiting before break or entering after break will be marked as half-day absent
          </p>
        </div> */}

        {/* Action Buttons */}
        <div className="flex  sm:flex-row items-center justify-end gap-3 ">
          <button
            onClick={handleCancel}
            disabled={saving || !hasChanges}
            className={`w-full sm:w-auto px-4 py-2 rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50`}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className={`flex items-center justify-center space-x-2 w-full sm:w-auto px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50`}
          >
            <Save className="h-5 w-5 shrink-0" />
            <span>{saving ? 'Saving...' : 'Save Changes'}</span>
          </button>
        </div>

        {/* Information Box */}
        <div className="bg-indigo-50 border border-indigo-200 rounded-md p-4">
          <div className="flex items-start space-x-3">
            <AlertCircle className="h-5 w-5 text-indigo-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-indigo-900 mb-2">Validation Flow</h4>
              <ol className="text-sm text-indigo-800 space-y-1 list-decimal list-inside">
                <li>Grace Period Check - Within grace time → Present</li>
                <li>Late Entry Check - Beyond grace but within limit and count → Late</li>
                <li>Early Exit Check - Beyond grace but within limit and count → Early Exit</li>
                <li>Permission Check - Beyond limits or counts exceeded → Permission (if sufficient balance)</li>
                <li>If permission insufficient or invalid → First Off/Second Off (Absent)</li>
                <li>Exit before break or enter after break → First Off/Second Off (Absent)</li>
              </ol>
            </div>
          </div>
        </div>
        </div>
        )}

        {activeTab === 'missing_attendance' && (
          <div className="w-full">
            <MissedPunchNotificationSettings />
          </div>
        )}
      </div>
    </div>
  );
}
