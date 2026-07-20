import { useState, useEffect } from 'react';
import { Save, AlertCircle, CheckCircle } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import toast from 'react-hot-toast';
import { validateAuth } from '../../../stores/utils/storeUtils';

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
  require_location: false
};

export default function AttendanceValidationSettings() {
  const [config, setConfig] = useState<ValidationConfig>(defaultConfig);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    loadConfig();
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

  const handleChange = (field: keyof ValidationConfig, value: number | boolean) => {
    setConfig(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Attendance Validation Settings</h2>
          <p className="text-sm text-gray-600 mt-1">
            Configure attendance validation rules for your organization
          </p>
        </div>
        <button
          onClick={handleSave}
          className={`flex items-center space-x-2 px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white`}
        >
          <Save className="h-5 w-5" />
          <span>{saving ? 'Saving...' : 'Save Changes'}</span>
        </button>
      </div>

      <div className="space-y-6">
        {/* Grace Time Settings */}
        <div className="border-b pb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Grace Time Settings</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Entry Grace Time (minutes)
              </label>
              <input
                type="number"
                min="0"
                value={config.entry_grace_time_minutes}
                onChange={(e) => handleChange('entry_grace_time_minutes', parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">Time allowed before shift end without penalty</p>
            </div>
          </div>
        </div>

        {/* Late Entry Settings */}
        <div className="border-b pb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Late Entry Settings</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Late Entry Limit (minutes)
              </label>
              <input
                type="number"
                min="0"
                value={config.late_entry_limit_minutes}
                onChange={(e) => handleChange('late_entry_limit_minutes', parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">Number of late entries allowed per month</p>
            </div>
          </div>
        </div>

        {/* Early Exit Settings */}
        <div className="border-b pb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Early Exit Settings</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Early Exit Limit (minutes)
              </label>
              <input
                type="number"
                min="0"
                value={config.early_exit_limit_minutes}
                onChange={(e) => handleChange('early_exit_limit_minutes', parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">Number of early exits allowed per month</p>
            </div>
          </div>
        </div>

        {/* Permission Settings */}
        <div className="border-b pb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Permission Settings</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Minimum Permission (minutes)
              </label>
              <input
                type="number"
                min="0"
                value={config.min_permission_minutes}
                onChange={(e) => handleChange('min_permission_minutes', parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">Round up permission minutes to this increment</p>
            </div>
          </div>
        </div>

        {/* Employee Controls */}
        <div className="border-b pb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Employee Controls</h3>
          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              id="allow_manual_clock_in_out"
              checked={config.allow_manual_clock_in_out || false}
              onChange={(e) => handleChange('allow_manual_clock_in_out', e.target.checked)}
              className="h-5 w-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="allow_manual_clock_in_out" className="text-sm font-medium text-gray-700">
              Allow Employee Manual Clock In/Out
            </label>
          </div>
          <p className="text-xs text-gray-500 mt-2 ml-8">
            When enabled, standard employees will be able to clock in/out without mandatory face recognition.
          </p>
        </div>

        {/* Location Settings */}
        <div className="border-b pb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Location Settings</h3>
          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              id="require_location"
              checked={config.require_location || false}
              onChange={(e) => handleChange('require_location', e.target.checked)}
              className="h-5 w-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="require_location" className="text-sm font-medium text-gray-700">
              Require Location During Clock In/Out
            </label>
          </div>
          <p className="text-xs text-gray-500 mt-2 ml-8">
            When enabled, the browser will request GPS location and validate against configured branch radii.
          </p>
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
              className="h-5 w-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="enable_half_day" className="text-sm font-medium text-gray-700">
              Enable Half Day Rules
            </label>
          </div>
          <p className="text-xs text-gray-500 mt-2 ml-8">
            When enabled, employees exiting before break or entering after break will be marked as half-day absent
          </p>
        </div> */}

        {/* Information Box */}
        <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
          <div className="flex items-start space-x-3">
            <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-blue-900 mb-2">Validation Flow</h4>
              <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
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
    </div>
  );
}
