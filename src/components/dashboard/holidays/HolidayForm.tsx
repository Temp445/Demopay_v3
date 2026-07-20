import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useHolidaysStore, type Holiday, type WeekDayPattern, type WeekDay, type WeekOccurrence } from '../../../stores/holidaysStore';
import { useAuth } from '../../../contexts/AuthContext';

interface HolidayFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (holiday: Omit<Holiday, 'id' | 'created_at'>) => Promise<void>;
  holiday?: Holiday;
}

export default function HolidayForm({
  isOpen,
  onClose,
  onSave,
  holiday
}: HolidayFormProps) {
  const {user} = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    date: '',
    holiday_type: 'public' as 'public' | 'company',
    description: '',
    is_recurring: false,
    recurring_patterns: [] as WeekDayPattern[]
  });

  const occurrencesMap = [
    { value: 'first', label: 'First' },
    { value: 'second', label: 'Second' },
    { value: 'third', label: 'Third' },
    { value: 'fourth', label: 'Fourth' },
    { value: 'last', label: 'Last' }
  ];

  useEffect(() => {
    if (holiday) {
      setFormData({
        name: holiday.name,
        date: holiday.date,
        holiday_type: holiday.holiday_type,
        description: holiday.description || '',
        is_recurring: holiday.is_recurring,
        recurring_patterns: holiday.recurring_patterns || []
      });
    } else {
      setFormData({
        name: '',
        date: '',
        holiday_type: 'public',
        description: '',
        is_recurring: false,
        recurring_patterns: [] as WeekDayPattern[]
      });
    }
  }, [holiday]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Validate recurring patterns if enabled
      if (formData.is_recurring && formData.recurring_patterns.length === 0) {
        throw new Error('Please select at least one weekday and occurrence pattern');
      }

      const holidayData = {
        name: formData.name,
        date: formData.date,
        holiday_type: formData.holiday_type,
        description: formData.description,
        is_recurring: formData.is_recurring,
        recurring_patterns: formData.recurring_patterns,
        created_by: user?.id ?? null
      };

      await onSave(holidayData);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save holiday');
    } finally {
      setLoading(false);
    }
  };

  const weekDays: { value: WeekDay; label: string }[] = [
    { value: 'sunday', label: 'Sunday' },
    { value: 'monday', label: 'Monday' },
    { value: 'tuesday', label: 'Tuesday' },
    { value: 'wednesday', label: 'Wednesday' },
    { value: 'thursday', label: 'Thursday' },
    { value: 'friday', label: 'Friday' },
    { value: 'saturday', label: 'Saturday' }
  ];

  const occurrences: { value: WeekOccurrence; label: string }[] = [
    { value: 'first', label: 'First' },
    { value: 'second', label: 'Second' },
    { value: 'third', label: 'Third' },
    { value: 'fourth', label: 'Fourth' },
    { value: 'last', label: 'Last' }
  ];

  const handleWeekDaySelect = (weekDay: WeekDay) => {
    const existingPattern = formData.recurring_patterns.find(p => p.weekDay === weekDay);
    if (existingPattern) {
      setFormData({
        ...formData,
        recurring_patterns: formData.recurring_patterns.filter(p => p.weekDay !== weekDay)
      });
    } else {
      setFormData({
        ...formData,
        recurring_patterns: [
          ...formData.recurring_patterns,
          { weekDay, weekOccurrence: '' }
        ]
      });
    }
  };

  const handleOccurrenceSelect = (weekDay: WeekDay, occurrence: WeekOccurrence) => {
    const existOccurrence = formData.recurring_patterns.filter(p => !(p.weekDay === weekDay && p.weekOccurrence === occurrence));
    const pattern = formData.recurring_patterns.filter(p => p.weekDay === weekDay && p.weekOccurrence === occurrence);

    let newOccurrences = [] as WeekDayPattern[];

    if (pattern.length === 0) {      
      newOccurrences = [...existOccurrence, { weekDay, weekOccurrence: occurrence }];      
    }
    else {
      newOccurrences = [...existOccurrence];
    }

    setFormData({
        ...formData,
        recurring_patterns: newOccurrences 
      });      
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
              onClick={onClose}
              className="bg-white rounded-md text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              <span className="sr-only">Close</span>
              <X className="h-6 w-6" aria-hidden="true" />
            </button>
          </div>

          <div className="sm:flex sm:items-start">
            <div className="mt-3 text-center sm:mt-0 sm:text-left w-full">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                {holiday ? 'Edit Holiday' : 'Add Holiday'}
              </h3>

              {error && (
                <div className="mt-2 rounded-md bg-red-50 p-4">
                  <div className="text-sm text-red-700">{error}</div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="mt-6 space-y-6">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                    Holiday Name
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
                  <label htmlFor="type" className="block text-sm font-medium text-gray-700">
                    Holiday Type
                  </label>
                  <select
                    id="type"
                    required
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    value={formData.holiday_type}
                    onChange={(e) => setFormData({ ...formData, holiday_type: e.target.value as 'public' | 'company' })}
                  >
                    <option value="public">Public Holiday</option>
                    <option value="company">Company Holiday</option>
                  </select>
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="is_recurring"
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                    checked={formData.is_recurring}
                    onChange={(e) => setFormData({
                      ...formData,
                      is_recurring: e.target.checked,
                      recurring_patterns: e.target.checked ? formData.recurring_patterns : []
                    })}
                  />
                  <label htmlFor="is_recurring" className="ml-2 block text-sm text-gray-900">
                    Weekly Holiday
                  </label>
                </div>

                {formData.is_recurring ? (
                  <div className="space-y-4 bg-gray-50 p-4 rounded-md">
                    <div className="space-y-4">
                      {weekDays.map(({ value: weekDay, label }) => (
                        <div key={weekDay} className="space-y-2">
                          <div className="flex items-center">
                            <input
                              type="checkbox"
                              id={`weekday-${weekDay}`}
                              className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                              checked={formData.recurring_patterns.some(p => p.weekDay === weekDay)}
                              onChange={() => handleWeekDaySelect(weekDay)}
                            />
                            <label htmlFor={`weekday-${weekDay}`} className="ml-2 block text-sm font-medium text-gray-700">
                              {label}
                            </label>
                          </div>

                          {formData.recurring_patterns.some(p => p.weekDay === weekDay) && (
                            <div className="ml-6 flex flex-wrap gap-2">
                              {occurrences.map(({ value: occurrence, label }) => (
                                <label key={occurrence} className="inline-flex items-center">
                                  <input
                                    type="checkbox"
                                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                                    checked={formData.recurring_patterns
                                      .find(p => p.weekDay === weekDay && p.weekOccurrence === occurrence) ? true : false}
                                      // ?.occurrences?.includes(occurrence) || false}
                                    onChange={() => handleOccurrenceSelect(weekDay, occurrence)}
                                  />
                                  <span className="ml-2 text-sm text-gray-700">{label}</span>
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* {formData.recurring_patterns.length > 0 && (
                      <div className="mt-4 p-4 bg-blue-50 rounded-md">
                        <h4 className="text-sm font-medium text-blue-900">Selected Patterns:</h4>
                        <ul className="mt-2 text-sm text-blue-700">
                          {formData.recurring_patterns.map(({ weekDay, occurrences }) => (
                            <li key={weekDay}>
                              {weekDays.find(d => d.value === weekDay)?.label}:{' '}
                              {occurrences
                                .map(o => occurrencesMap.find(occ => occ.value === o)?.label)
                                .join(', ')} week(s)
                            </li>
                          ))}
                        </ul>
                      </div>
                    )} */}

                  </div>
                ) : (
                  <div>
                    <label htmlFor="date" className="block text-sm font-medium text-gray-700">
                      Date
                    </label>
                    <input
                      type="date"
                      id="date"
                      required
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                      value={formData.date}
                      onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    />
                  </div>
                )}

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

                <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
                  >
                    {loading ? 'Saving...' : 'Save Holiday'}
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