import React from 'react';
import { RotateCw as RotateClockwise } from 'lucide-react';
import { differenceInCalendarDays, parseISO, isValid } from 'date-fns';


interface RotationPatternSelectorProps {
  value: 'none' | 'daily' | 'weekly' | 'monthly';
  weekInterval: number;
  monthInterval: number;
  startDate: string; // Added prop
  endDate: string;   // Added prop
  onChange: (
    pattern: 'none' | 'daily' | 'weekly' | 'monthly',
    interval: number
  ) => void;
}

export default function RotationPatternSelector({
  value,
  weekInterval,
  monthInterval,
  startDate,
  endDate,
  onChange
}: RotationPatternSelectorProps) {

  // Calculate duration to determine available options
  const getAvailableOptions = () => {
    // 1. If no end date or dates are invalid, default to None
    if (!startDate || !endDate) return { showDaily: false, showWeekly: false, showMonthly: false };

    const start = parseISO(startDate);
    const end = parseISO(endDate);

    if (!isValid(start) || !isValid(end)) return { showDaily: false, showWeekly: false, showMonthly: false };

   const diffInDays = differenceInCalendarDays(end, start);


    // Logic based on your request:
    // Same date (diff 0) -> None only
    // > 1 day -> Daily
    // > 7 days -> Weekly
    // > 30 days -> Monthly

    if (diffInDays === 0) {
  return {
    showDaily: false,
    showWeekly: false,
    showMonthly: false
  };
}
    return {
      showDaily: diffInDays >= 1,
      showWeekly: diffInDays >= 7,
      showMonthly: diffInDays >= 30 
    };
  };

  const { showDaily, showWeekly, showMonthly } = getAvailableOptions();

  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium text-gray-700">
        Rotation Pattern
      </label>

      <div className="grid grid-cols-2 gap-4">
        {/* Rotation Type */}
        <div className="col-span-2">
          <select
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base
                       border-gray-300 rounded-md
                       focus:outline-none focus:ring-indigo-500 focus:border-indigo-500
                       sm:text-sm"
            value={value}
            onChange={(e) =>
              onChange(
                e.target.value as any,
                e.target.value === 'weekly'
                  ? weekInterval
                  : monthInterval
              )
            }
          >
            {/* Always visible */}
            <option value="none">No Rotation</option>

            {/* Conditionally visible based on date range */}
            {showDaily && <option value="daily">Daily</option>}
            {showWeekly && <option value="weekly">Weekly</option>}
            {showMonthly && <option value="monthly">Monthly</option>}
          </select>
        </div>

        {/* Weekly Interval Inputs */}
        {value === 'weekly' && showWeekly && (
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700">
              Weeks Between Rotations
            </label>
            <div className="mt-1 relative rounded-md shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <RotateClockwise className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="number"
                min="1"
                max="52"
                className="focus:ring-indigo-500 focus:border-indigo-500
                           block w-full pl-10 sm:text-sm
                           border-gray-300 rounded-md"
                value={weekInterval}
                onChange={(e) =>
                  onChange('weekly', parseInt(e.target.value, 10))
                }
              />
            </div>
          </div>
        )}

        {/* Monthly Interval Inputs */}
        {value === 'monthly' && showMonthly && (
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700">
              Months Between Rotations
            </label>
            <div className="mt-1 relative rounded-md shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <RotateClockwise className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="number"
                min="1"
                max="12"
                className="focus:ring-indigo-500 focus:border-indigo-500
                           block w-full pl-10 sm:text-sm
                           border-gray-300 rounded-md"
                value={monthInterval}
                onChange={(e) =>
                  onChange('monthly', parseInt(e.target.value, 10))
                }
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}