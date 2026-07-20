import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useShiftsStore } from '../../../stores/shiftsStore';

interface CreateShiftModalProps {
  isOpen: boolean;
  onClose: () => void;
  onShiftCreated: () => void;
}

export default function CreateShiftModal({ isOpen, onClose, onShiftCreated }: CreateShiftModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { createShift } = useShiftsStore();
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    start_time: '',
    end_time: '',
    break_start_time: '',
    break_end_time: '',
    shift_type: 'morning' as const,
    is_active: true
  });

  const validateTimeFormat = (time: string): boolean => {
    // Check if time matches HH:mm format
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    return timeRegex.test(time);
  };

  const formatTimeForSubmission = (time: string): string => {
    // Ensure time is in HH:mm:00 format
    if (validateTimeFormat(time)) {
      return `${time}:00`;
    }
    throw new Error('Invalid time format');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Validate time formats
      if (!validateTimeFormat(formData.start_time) || !validateTimeFormat(formData.end_time)) {
        throw new Error('Please enter valid times in HH:mm format');
      }

      if (!validateTimeFormat(formData.break_start_time) || !validateTimeFormat(formData.break_end_time)) {
        throw new Error('Please enter valid break times in HH:mm format');
      }

      // // Validate break times are within shift times
      // const shiftStart = formData.start_time;
      // const shiftEnd = formData.end_time;
      // const breakStart = formData.break_start_time;
      // const breakEnd = formData.break_end_time;

      // if (breakStart >= breakEnd) {
      //   throw new Error('Break end time must be after break start time');
      // }

      // if (breakStart < shiftStart || breakEnd > shiftEnd) {
      //   throw new Error('Break times must be within shift hours');
      // }

      // Validate break times are within shift times and handle overnight shifts
      const toMinutes = (time) => {
        const [h, m] = time.split(':').map(Number);
        return h * 60 + m;
      };

      const shiftStart = toMinutes(formData.start_time);
      let shiftEnd = toMinutes(formData.end_time);
      let breakStart = toMinutes(formData.break_start_time);
      let breakEnd = toMinutes(formData.break_end_time);

      // Detect overnight shift
      const isOvernightShift = shiftEnd <= shiftStart;

      if (isOvernightShift) {
        shiftEnd += 24 * 60;

        if (breakStart < shiftStart) breakStart += 24 * 60;
        if (breakEnd < shiftStart) breakEnd += 24 * 60;
      }

      // Break validation
      if (breakStart >= breakEnd) {
        throw new Error('Break end time must be after break start time');
      }

      if (breakStart < shiftStart || breakEnd > shiftEnd) {
        throw new Error('Break times must be within shift hours');
      }

      // Format times for submission
      const submissionData = {
        ...formData,
        start_time: formatTimeForSubmission(formData.start_time),
        end_time: formatTimeForSubmission(formData.end_time),
        break_start_time: formatTimeForSubmission(formData.break_start_time),
        break_end_time: formatTimeForSubmission(formData.break_end_time)
      };

      await createShift(submissionData);
      onShiftCreated();
      onClose();

      // Reset form
      setFormData({
        name: '',
        description: '',
        start_time: '',
        end_time: '',
        break_start_time: '',
        break_end_time: '',
        shift_type: 'morning',
        is_active: true
      });
    } catch (err) {
      setError(err?.message || (err instanceof Error ? err.message : 'Failed to create shift'));
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity" aria-hidden="true">
          <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
        </div>

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">
          &#8203;
        </span>

        <div className="inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
          <div className="absolute top-0 right-0 pt-4 pr-4">
            <button
              type="button"
              className="bg-white rounded-md text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              onClick={onClose}
            >
              <span className="sr-only">Close</span>
              <X className="h-6 w-6" aria-hidden="true" />
            </button>
          </div>

          <div className="sm:flex sm:items-start">
            <div className="mt-3 text-center sm:mt-0 sm:text-left w-full">
              <h3 className="text-lg leading-6 font-medium text-gray-900">Create New Shift</h3>
              {error && (
                <div className="mt-2 rounded-md bg-red-50 p-4">
                  <div className="text-sm text-red-700">{error}</div>
                </div>
              )}
              <form onSubmit={handleSubmit} className="mt-6 space-y-6">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                    Shift Name
                  </label>
                  <input
                    type="text"
                    id="name"
                    required
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
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
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="start_time" className="block text-sm font-medium text-gray-700">
                      Start Time (HH:mm)
                    </label>
                    <input
                      type="time"
                      id="start_time"
                      required
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                      value={formData.start_time}
                      onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                    />
                  </div>

                  <div>
                    <label htmlFor="end_time" className="block text-sm font-medium text-gray-700">
                      End Time (HH:mm)
                    </label>
                    <input
                      type="time"
                      id="end_time"
                      required
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                      value={formData.end_time}
                      onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Break Timing
                  </label>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="break_start_time" className="block text-sm text-gray-600 mb-1">
                        Break Start Time
                      </label>
                      <input
                        type="time"
                        id="break_start_time"
                        required
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                        value={formData.break_start_time}
                        onChange={(e) => setFormData({ ...formData, break_start_time: e.target.value })}
                      />
                    </div>

                    <div>
                      <label htmlFor="break_end_time" className="block text-sm text-gray-600 mb-1">
                        Break End Time
                      </label>
                      <input
                        type="time"
                        id="break_end_time"
                        required
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                        value={formData.break_end_time}
                        onChange={(e) => setFormData({ ...formData, break_end_time: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label htmlFor="shift_type" className="block text-sm font-medium text-gray-700">
                    Shift Type
                  </label>
                  <select
                    id="shift_type"
                    required
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    value={formData.shift_type}
                    onChange={(e) => setFormData({ ...formData, shift_type: e.target.value as 'morning' | 'afternoon' | 'night' })}
                  >
                    <option value="morning">Morning</option>
                    <option value="afternoon">Afternoon</option>
                    <option value="night">Night</option>
                  </select>
                </div>

                <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
                  >
                    {loading ? 'Creating...' : 'Create Shift'}
                  </button>
                  <button
                    type="button"
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