import React, { useState, useEffect } from 'react';
import { X, Calendar as CalendarIcon, Loader2, AlertTriangle } from 'lucide-react';
import { useCompOffStore } from '../../../stores/compOffStore';
import { useLeaveStore } from '../../../stores/leaveStore';
import { supabase } from '../../../lib/supabase';
import { getTenantId } from '../../../lib/tenantDb';

interface WorkedHolidayDate {
  date: string;          // YYYY-MM-DD
  label: string;         // e.g. "Sun, 19 Jul 2026 — Weekly Holiday"
  holidayName: string;   // Name from get_holidays RPC (e.g. "Weekly Holiday", "Pongal")
}

interface AddCompOffRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  employeeId: string;
  employeeName: string;
  onSuccess: () => void;
}

export default function AddCompOffRequestModal({
  isOpen,
  onClose,
  employeeId,
  employeeName,
  onSuccess,
}: AddCompOffRequestModalProps) {
  const [loading, setLoading] = useState(false);
  const [datesLoading, setDatesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eligibleDates, setEligibleDates] = useState<WorkedHolidayDate[]>([]);

  const { submitRequest } = useCompOffStore();
  const { leaveTypes, fetchLeaveTypes } = useLeaveStore();

  const [formData, setFormData] = useState({
    employee_id: employeeId,
    leave_type_id: '',
    worked_date: '',
    reason: '',
  });

  // ── Fetch eligible worked dates (Sundays / Holidays with clock-in) ──
  useEffect(() => {
    if (!isOpen || !employeeId) return;

    fetchLeaveTypes();
    setFormData({
      employee_id: employeeId,
      leave_type_id: '',
      worked_date: '',
      reason: '',
    });
    setError(null);
    setEligibleDates([]);

    const loadEligibleDates = async () => {
      setDatesLoading(true);
      try {
        const tenantId = await getTenantId();
        console.log('[CompOff Debug] tenantId:', tenantId, 'employeeId:', employeeId);

        // Fetch attendance clock-IN records for the last 6 months
        const today = new Date();
        const sixMonthsAgo = new Date(today);
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        const startDate = sixMonthsAgo.toISOString().split('T')[0];
        const endDate = today.toISOString().split('T')[0];
        console.log('[CompOff Debug] date range:', startDate, '→', endDate);

        const { data: timestamps, error: tsErr } = await supabase
          .from('attendance_timestamp')
          .select('timestamp, entry')
          .eq('employee_id', employeeId)
          .eq('entry', 'IN')
          .gte('timestamp', `${startDate}T00:00:00.000Z`)
          .lte('timestamp', `${endDate}T23:59:59.999Z`)
          .order('timestamp', { ascending: false });

        if (tsErr) throw tsErr;
        console.log('[CompOff Debug] raw timestamps from DB:', timestamps);

        // Collect unique local dates from clock-in records (IST timezone)
        const uniqueDates = new Map<string, Date>();
        for (const ts of timestamps || []) {
          const d = new Date(ts.timestamp);
          const localStr = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD
          console.log('[CompOff Debug] ts:', ts.timestamp, '→ IST date:', localStr, 'getDay():', new Date(localStr + 'T12:00:00').getDay());
          if (!uniqueDates.has(localStr)) {
            uniqueDates.set(localStr, d);
          }
        }
        console.log('[CompOff Debug] uniqueDates:', Array.from(uniqueDates.keys()));

        if (uniqueDates.size === 0) {
          console.log('[CompOff Debug] No timestamps found — bailing early.');
          setEligibleDates([]);
          setDatesLoading(false);
          return;
        }

        // Fetch ALL holiday records (including recurring patterns)
        const { data: allHolidays, error: hlErr } = await supabase
          .from('holidays')
          .select('id, name, date, is_recurring, recurring_patterns, holiday_type')
          .eq('tenant_id', tenantId);

        console.log('[CompOff Debug] allHolidays from DB:', allHolidays, 'error:', hlErr);

        const dayToNumber: Record<string, number> = {
          sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
          thursday: 4, friday: 5, saturday: 6,
        };

        // Build a map: YYYY-MM-DD → holiday name for each clocked-in date
        const holidayMap = new Map<string, string>();

        for (const [dateStr] of uniqueDates.entries()) {
          const localDate = new Date(dateStr + 'T12:00:00');
          const dow = localDate.getDay(); // 0=Sun, 6=Sat
          const dayOfMonth = localDate.getDate();
          const weekIndex = Math.floor((dayOfMonth - 1) / 7);
          const nextWeek = new Date(localDate);
          nextWeek.setDate(nextWeek.getDate() + 7);
          const isLastOccurrence = nextWeek.getMonth() !== localDate.getMonth();

          console.log(`[CompOff Debug] checking date: ${dateStr}, dow=${dow}, weekIndex=${weekIndex}, isLast=${isLastOccurrence}`);

          for (const holiday of allHolidays || []) {
            if (!holiday) continue;

            // 1. Non-recurring: exact date match
            if (!holiday.is_recurring) {
              if (holiday.date === dateStr) {
                console.log(`[CompOff Debug]   ✓ Matched non-recurring: ${holiday.name}`);
                holidayMap.set(dateStr, holiday.name);
              }
              continue;
            }

            // 2. Recurring: check patterns (same logic as HolidayCalendar.tsx)
            console.log(`[CompOff Debug]   Recurring holiday "${holiday.name}", patterns:`, JSON.stringify(holiday.recurring_patterns));
            if (holiday.recurring_patterns?.length) {
              const matched = holiday.recurring_patterns.some((pattern: any) => {
                const pDay = (pattern.week_day || pattern.weekDay || '').toLowerCase();
                const pOcc = (pattern.week_occurrence || pattern.weekOccurrence || '').toLowerCase();
                console.log(`[CompOff Debug]     pattern: pDay="${pDay}" (want dow=${dow}→${Object.entries(dayToNumber).find(([,v])=>v===dow)?.[0]}), pOcc="${pOcc}"`);
                if (dayToNumber[pDay] !== dow) return false;
                if (!pOcc || pOcc === 'all') return true;
                const occurrenceMap: Record<string, number> = { first: 0, second: 1, third: 2, fourth: 3 };
                if (pOcc === 'last') return isLastOccurrence;
                return occurrenceMap[pOcc] === weekIndex;
              });

              if (matched && !holidayMap.has(dateStr)) {
                console.log(`[CompOff Debug]   ✓ Matched recurring: ${holiday.name}`);
                holidayMap.set(dateStr, holiday.name);
              }
            }
          }
        }
        console.log('[CompOff Debug] final holidayMap:', Object.fromEntries(holidayMap));

        // Check for existing comp-off requests (to skip already-requested dates)
        const { data: existingRequests } = await supabase
          .from('comp_off_requests')
          .select('worked_date')
          .eq('employee_id', employeeId)
          .eq('tenant_id', tenantId);

        const alreadyRequestedDates = new Set(
          (existingRequests || []).map((r: any) => r.worked_date)
        );

        // Build final eligible list
        const results: WorkedHolidayDate[] = [];
        for (const [dateStr] of uniqueDates.entries()) {
          if (alreadyRequestedDates.has(dateStr)) continue;
          if (!holidayMap.has(dateStr)) continue; // only holiday/weekly-off dates

          const localDate = new Date(dateStr + 'T12:00:00');
          const dayLabel = localDate.toLocaleDateString('en-IN', {
            weekday: 'short',
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          });

          const holidayName = holidayMap.get(dateStr) || 'Holiday';
          results.push({
            date: dateStr,
            label: `${dayLabel} — ${holidayName}`,
            holidayName,
          });
        }

        // Sort newest first
        results.sort((a, b) => b.date.localeCompare(a.date));
        setEligibleDates(results);
      } catch (err: any) {
        console.error('Failed to load eligible comp-off dates:', err);
        setError('Failed to load eligible dates. Please try again.');
      } finally {
        setDatesLoading(false);
      }
    };

    loadEligibleDates();
  }, [isOpen, employeeId, fetchLeaveTypes]);

  const compOffTypes = leaveTypes.items.filter(lt => {
    const name = lt.name.toLowerCase();
    return name.includes('comp off') || name.includes('compensatory') || name.includes('comp-off');
  });

  // Auto-select leave type if only one option
  useEffect(() => {
    if (compOffTypes.length === 1 && !formData.leave_type_id) {
      setFormData(prev => ({ ...prev, leave_type_id: compOffTypes[0].id }));
    }
  }, [compOffTypes, formData.leave_type_id]);

  // Auto-fill reason when a date is selected
  const handleDateChange = (dateStr: string) => {
    const selected = eligibleDates.find(d => d.date === dateStr);
    const autoReason = selected ? `Worked on ${selected.holidayName}` : '';
    setFormData(prev => ({
      ...prev,
      worked_date: dateStr,
      reason: autoReason,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.leave_type_id) {
      setError('Please select a Comp Off Leave Type.');
      return;
    }

    if (!formData.worked_date) {
      setError('Please select the date you worked.');
      return;
    }

    try {
      setLoading(true);
      await submitRequest(formData);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to submit request.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity" aria-hidden="true">
          <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
        </div>

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <div className="absolute top-0 right-0 pt-4 pr-4">
            <button
              onClick={onClose}
              className="bg-white rounded-md text-gray-400 hover:text-gray-500 focus:outline-none"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="sm:flex sm:items-start">
              <div className="mt-3 text-center sm:mt-0 sm:text-left w-full">
                <h3 className="text-lg leading-6 font-medium text-gray-900 flex items-center mb-1">
                  <CalendarIcon className="h-5 w-5 mr-2 text-indigo-500" />
                  Request Comp Off Credit
                </h3>

                <p className="text-sm text-gray-500 mb-4">
                  Requesting comp off credit for: <strong>{employeeName}</strong>
                </p>

                {error && (
                  <div className="mb-4 bg-red-50 p-4 rounded-md flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}

                {compOffTypes.length === 0 ? (
                  <div className="mb-4 bg-yellow-50 p-4 rounded-md">
                    <p className="text-sm text-yellow-700">
                      No Comp Off leave types are configured in Settings. Please ask your Admin to create one.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-4">

                    {/* Leave Type */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Leave Type
                      </label>
                      <select
                        required
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        value={formData.leave_type_id}
                        onChange={(e) => setFormData({ ...formData, leave_type_id: e.target.value })}
                      >
                        <option value="">Select a Leave Type</option>
                        {compOffTypes.map(lt => (
                          <option key={lt.id} value={lt.id}>{lt.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Date Worked — smart dropdown */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Date Worked (Weekend / Holiday)
                      </label>

                      {datesLoading ? (
                        <div className="mt-1 flex items-center gap-2 text-sm text-gray-500 py-2">
                          <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
                          Loading your worked holiday dates…
                        </div>
                      ) : eligibleDates.length === 0 ? (
                        <div className="mt-1 bg-amber-50 border border-amber-200 rounded-md p-3">
                          <p className="text-sm text-amber-700">
                            No eligible dates found. You must have a clock-in record on a Sunday or configured Holiday to request comp off.
                          </p>
                        </div>
                      ) : (
                        <select
                          required
                          className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                          value={formData.worked_date}
                          onChange={(e) => handleDateChange(e.target.value)}
                        >
                          <option value="">— Select a worked holiday/weekend date —</option>
                          {eligibleDates.map(d => (
                            <option key={d.date} value={d.date}>
                              {d.label}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    {/* Reason */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Reason for Working
                      </label>
                      <textarea
                        required
                        rows={3}
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        value={formData.reason}
                        onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                        placeholder="e.g., Required for urgent server deployment"
                      />
                    </div>

                    <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
                      <button
                        type="submit"
                        disabled={loading || datesLoading || eligibleDates.length === 0}
                        className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {loading ? 'Submitting…' : 'Submit Request'}
                      </button>
                      <button
                        type="button"
                        onClick={onClose}
                        className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:w-auto sm:text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
