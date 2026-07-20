import React, { useState, useEffect } from 'react';
import { X, Clock, AlertCircle, CheckCircle2,IndianRupee } from 'lucide-react';
import { type Shift } from '../../../stores/shiftsStore';
import { useAttendanceStore } from '../../../stores/attendanceStore';

interface ShiftAttendanceSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  shift: Shift;
}

interface FormData {
  lateThresholdMinutes: number;
  halfDayThresholdMinutes: number;
}

export default function ShiftAttendanceSettingsModal({
  isOpen,
  onClose,
  shift,
}: ShiftAttendanceSettingsModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  
  const [formData, setFormData] = useState<FormData>({
    lateThresholdMinutes: 15,
    halfDayThresholdMinutes: 240
  });

  // Focus trap refs
  const firstFocusableRef = React.useRef<HTMLButtonElement>(null);
  const lastFocusableRef = React.useRef<HTMLButtonElement>(null);
  const { getShiftAttendanceSettings, updateShiftAttendanceSettings } = useAttendanceStore();

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        setSuccess(false);
      }, 5000); 
      return () => clearTimeout(timer);
    }
  }, [success]);
  
  useEffect(() => {
    if (isOpen) {
      const loadSettings = async () => {
        try {
          // setLoading(true);
          const today = new Date().toISOString().split('T')[0];
          const settings = await getShiftAttendanceSettings(shift.id, today);
          
          setFormData({
            lateThresholdMinutes: settings.late_threshold_minutes || 15,
            halfDayThresholdMinutes: settings.half_day_threshold_minutes || 240,
          });
          
          setError(null);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to load settings');
        } finally {
          setLoading(false);
        }
      };

      loadSettings();
      firstFocusableRef.current?.focus();
    }
  }, [isOpen, shift.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      await updateShiftAttendanceSettings(shift.id, {
        late_threshold_minutes: formData.lateThresholdMinutes,
        half_day_threshold_minutes: formData.halfDayThresholdMinutes,
      });

      setSuccess(true);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update settings');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 overflow-y-auto"
      role="dialog"
      aria-labelledby="shift-settings-title"
      aria-modal="true"
      onKeyDown={handleKeyDown}
    >
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity" aria-hidden="true">
          <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
        </div>

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        <div className="inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
          <div className="absolute top-0 right-0 pt-4 pr-4">
            <button
              ref={firstFocusableRef}
              type="button"
              className="bg-white rounded-md text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              onClick={onClose}
            >
              <X className="h-6 w-6" aria-hidden="true" />
            </button>
          </div>

          <div className="sm:flex sm:items-start">
            <div className="mt-3 text-center sm:mt-0 sm:text-left w-full">
              <h3 id="shift-settings-title" className="text-lg leading-6 font-medium text-gray-900">
                Attendance Settings for {shift.name}
              </h3>

              {error && (
                <div className="mt-4 rounded-md bg-red-50 p-4">
                  <div className="flex">
                    <AlertCircle className="h-5 w-5 text-red-400" />
                    <div className="ml-3"><h3 className="text-sm font-medium text-red-800">{error}</h3></div>
                  </div>
                </div>
              )}

              {success && (
                <div className="mt-4 rounded-md bg-green-50 p-4">
                  <div className="flex">
                    <CheckCircle2 className="h-5 w-5 text-green-400" />
                    <div className="ml-3"><h3 className="text-sm font-medium text-green-800">Settings updated successfully!</h3></div>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="mt-6 space-y-6">
                
                {/* Thresholds Section */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="lateThreshold" className="block text-sm font-medium text-gray-700">
                      Late Threshold (mins)
                    </label>
                    <input
                      type="number"
                      id="lateThreshold"
                      min="0"
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                      value={formData.lateThresholdMinutes}
                      onChange={(e) => setFormData({ ...formData, lateThresholdMinutes: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div>
                    <label htmlFor="halfDayThreshold" className="block text-sm font-medium text-gray-700">
                      Half Day Threshold (mins)
                    </label>
                    <input
                      type="number"
                      id="halfDayThreshold"
                      min="0"
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                      value={formData.halfDayThresholdMinutes}
                      onChange={(e) => setFormData({ ...formData, halfDayThresholdMinutes: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                </div>

                <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
                  >
                    {loading ? 'Saving...' : 'Save Settings'}
                  </button>
                  <button
                    type="button"
                    ref={lastFocusableRef}
                    className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:w-auto sm:text-sm"
                    onClick={onClose}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}