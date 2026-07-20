import React, { useState, useEffect } from 'react';
import { Clock, AlertCircle } from 'lucide-react';
import { useAttendanceStore, type ShiftAttendanceSettings as Settings } from '../../../stores/attendanceStore';
import { type Shift } from '../../../stores/shiftsStore';

interface ShiftAttendanceSettingsProps {
  shift: Shift;
  onSettingsUpdated?: () => void;
}

export default function ShiftAttendanceSettings({ shift, onSettingsUpdated }: ShiftAttendanceSettingsProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        setLoading(true);
        const today = new Date().toISOString().split('T')[0];
        const data = await getShiftAttendanceSettings(shift.id, today);
        setSettings(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load settings');
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, [shift.id]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-32">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!settings) return null;

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h3 className="text-lg font-medium text-gray-900 mb-4">Attendance Settings</h3>
      
      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-4">
          <div className="flex">
            <AlertCircle className="h-5 w-5 text-red-400" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">{error}</h3>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Clock In Window</label>
            <div className="mt-1 flex items-center space-x-2">
              <Clock className="h-5 w-5 text-gray-400" />
              <span className="text-sm text-gray-900">
                {settings.clock_in_start} - {settings.clock_in_end}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Clock Out Window</label>
            <div className="mt-1 flex items-center space-x-2">
              <Clock className="h-5 w-5 text-gray-400" />
              <span className="text-sm text-gray-900">
                {settings.clock_out_start} - {settings.clock_out_end}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Late Threshold</label>
            <div className="mt-1 text-sm text-gray-900">
              {settings.late_threshold_minutes} minutes
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Half Day Threshold</label>
            <div className="mt-1 text-sm text-gray-900">
              {settings.half_day_threshold_minutes} minutes
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}