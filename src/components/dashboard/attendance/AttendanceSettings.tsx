import React, { useState, useEffect } from 'react';
import { Clock, AlertCircle } from 'lucide-react';
import { useAttendanceStore, type AttendanceSettings as Settings } from '../../../stores/attendanceStore';

export default function AttendanceSettings() {
  const { settings: storeSettings, loading: storeLoading, error: storeError, fetchAttendanceSettings, updateAttendanceSettings } = useAttendanceStore();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>({
    id: '',
    name: 'Default Settings',
    description: 'Default attendance settings',
    clock_in_start: '08:00',
    clock_in_end: '10:00',
    clock_out_start: '16:00',
    clock_out_end: '19:00',
    late_threshold_minutes: 15,
    half_day_threshold_minutes: 240,
    is_active: true
  });

  useEffect(() => {
    const loadSettings = async () => {
      try {
        await fetchAttendanceSettings();
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load settings');
      }
    };

    loadSettings();
  }, [fetchAttendanceSettings]);

  // Sync component state when store settings arrive
  useEffect(() => {
    if (storeSettings) {
      setSettings(storeSettings);
    }
  }, [storeSettings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      setError(null);
      await updateAttendanceSettings(settings);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  if (storeLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="bg-white shadow rounded-lg">
      <div className="p-6">
        <h3 className="text-lg font-medium text-gray-900">Attendance Settings</h3>
        
        {error && (
          <div className="mt-4 rounded-md bg-red-50 p-4">
            <div className="flex">
              <AlertCircle className="h-5 w-5 text-red-400" />
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">{error}</h3>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-6">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">
              Settings Name
            </label>
            <input
              type="text"
              id="name"
              required
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              value={settings.name}
              onChange={(e) => setSettings({ ...settings, name: e.target.value })}
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700">
              Description
            </label>
            <textarea
              id="description"
              rows={3}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              value={settings.description || ''}
              onChange={(e) => setSettings({ ...settings, description: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <label htmlFor="clock_in_start" className="block text-sm font-medium text-gray-700">
                Clock In Start Time
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Clock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="time"
                  id="clock_in_start"
                  required
                  className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md"
                  value={settings.clock_in_start}
                  onChange={(e) => setSettings({ ...settings, clock_in_start: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label htmlFor="clock_in_end" className="block text-sm font-medium text-gray-700">
                Clock In End Time
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Clock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="time"
                  id="clock_in_end"
                  required
                  className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md"
                  value={settings.clock_in_end}
                  onChange={(e) => setSettings({ ...settings, clock_in_end: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label htmlFor="clock_out_start" className="block text-sm font-medium text-gray-700">
                Clock Out Start Time
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Clock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="time"
                  id="clock_out_start"
                  required
                  className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md"
                  value={settings.clock_out_start}
                  onChange={(e) => setSettings({ ...settings, clock_out_start: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label htmlFor="clock_out_end" className="block text-sm font-medium text-gray-700">
                Clock Out End Time
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Clock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="time"
                  id="clock_out_end"
                  required
                  className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md"
                  value={settings.clock_out_end}
                  onChange={(e) => setSettings({ ...settings, clock_out_end: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <label htmlFor="late_threshold" className="block text-sm font-medium text-gray-700">
                Late Threshold (minutes)
              </label>
              <input
                type="number"
                id="late_threshold"
                required
                min="0"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                value={settings.late_threshold_minutes}
                onChange={(e) => setSettings({ ...settings, late_threshold_minutes: parseInt(e.target.value) })}
              />
              <p className="mt-1 text-sm text-gray-500">
                Minutes after clock in start time before marking as late
              </p>
            </div>

            <div>
              <label htmlFor="half_day_threshold" className="block text-sm font-medium text-gray-700">
                Half Day Threshold (minutes)
              </label>
              <input
                type="number"
                id="half_day_threshold"
                required
                min="0"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                value={settings.half_day_threshold_minutes}
                onChange={(e) => setSettings({ ...settings, half_day_threshold_minutes: parseInt(e.target.value) })}
              />
              <p className="mt-1 text-sm text-gray-500">
                Minimum minutes required to be counted as a full day
              </p>
            </div>
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="is_active"
              className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
              checked={settings.is_active}
              onChange={(e) => setSettings({ ...settings, is_active: e.target.checked })}
            />
            <label htmlFor="is_active" className="ml-2 block text-sm text-gray-900">
              Active
            </label>
          </div>

          <div className="pt-5">
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="ml-3 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}