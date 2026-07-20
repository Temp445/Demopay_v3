import React, { useState, useMemo } from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  isToday,
  getDay,
  getDate,
  addDays,
  subMonths,
  addMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { type Holiday } from "../../../stores/holidaysStore";

interface HolidayCalendarProps {
  holidays: Holiday[];
  onDateClick?: (date: Date) => void;
  selectedDate?: Date;
}

export default function HolidayCalendar({
  holidays,
  onDateClick,
  selectedDate,
}: HolidayCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);

  const calendarDays = useMemo(() => {
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    const startDay = getDay(monthStart);
    const paddedDays: Date[] = [];

    for (let i = 0; i < startDay; i++) {
      paddedDays.push(addDays(monthStart, i - startDay));
    }

    return [...paddedDays, ...days];
  }, [monthStart, monthEnd]);

  const handlePrevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const handleNextMonth = () => setCurrentDate(addMonths(currentDate, 1));

  // Helper to determine which occurrence of the day this is (e.g., 1st, 2nd, Last)
  const getWeekOccurrence = (date: Date) => {
    const dayOfMonth = getDate(date);
    const weekIndex = Math.floor((dayOfMonth - 1) / 7); // 0 = 1st, 1 = 2nd, 2 = 3rd...

    // Check if it's the last occurrence of this day in the month
    const nextWeekSameDay = addDays(date, 7);
    const isLast = nextWeekSameDay.getMonth() !== date.getMonth();

    return { index: weekIndex, isLast };
  };

  // Returns array of mapped holiday items containing the holiday and its display text
  const getHolidaysForDate = (date: Date) => {
    if (!Array.isArray(holidays)) return [];

    const matchedHolidays: { holiday: Holiday; displayText: string }[] = [];

    holidays.forEach((holiday) => {
      if (!holiday) return;

      // 1. Non-Recurring Holidays
      if (!holiday.is_recurring) {
        if (holiday.date && isSameDay(new Date(holiday.date), date)) {
          matchedHolidays.push({ holiday, displayText: holiday.name });
        }
        return;
      }

      // 2. Recurring Holidays
      if (holiday.is_recurring && holiday.recurring_patterns?.length) {
        const currentDayOfWeek = getDay(date); // 0=Sun, 1=Mon...

        // Map string text from DB to integer for date-fns
        const dayToNumber: Record<string, number> = {
          sunday: 0,
          monday: 1,
          tuesday: 2,
          wednesday: 3,
          thursday: 4,
          friday: 5,
          saturday: 6,
        };

        const matchedPattern = holiday.recurring_patterns.find(
          (pattern: any) => {
            const pDay = (
              pattern.week_day ||
              pattern.weekDay ||
              ""
            ).toLowerCase();
            const pOcc = (
              pattern.week_occurrence ||
              pattern.weekOccurrence ||
              ""
            ).toLowerCase();

            // Check Day Match
            if (dayToNumber[pDay] !== currentDayOfWeek) return false;

            // Check Occurrence Match
            if (!pOcc || pOcc === "all") return true;

            const { index, isLast } = getWeekOccurrence(date);
            const occurrenceMap: Record<string, number> = {
              first: 0,
              second: 1,
              third: 2,
              fourth: 3,
            };

            if (pOcc === "last") return isLast;
            return occurrenceMap[pOcc] === index;
          },
        );

        if (matchedPattern) {
          matchedHolidays.push({
            holiday,
            displayText: holiday.name, // Strictly displaying just the name now
          });
        }
      }
    });

    return matchedHolidays;
  };

  return (
    <div className="bg-white rounded-lg shadow border border-gray-200">
      {/* Header */}
      <div className="p-4 flex items-center justify-between border-b">
        <h2 className="text-lg font-semibold text-gray-900">
          {format(currentDate, "MMMM yyyy")}
        </h2>
        <div className="flex space-x-2">
          <button
            onClick={handlePrevMonth}
            className="p-2 rounded-md hover:bg-gray-100"
          >
            <ChevronLeft className="h-5 w-5 text-gray-600" />
          </button>
          <button
            onClick={handleNextMonth}
            className="p-2 rounded-md hover:bg-gray-100"
          >
            <ChevronRight className="h-5 w-5 text-gray-600" />
          </button>
        </div>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-px bg-gray-200">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <div
            key={day}
            className="bg-gray-50 py-2 text-center text-sm font-medium text-gray-500"
          >
            {day}
          </div>
        ))}

        {/* Dates grid */}
        {calendarDays.map((date) => {
          const dateHolidays = getHolidaysForDate(date);
          const isCurrentMonth = date.getMonth() === currentDate.getMonth();
          const selected = selectedDate && isSameDay(date, selectedDate);
          const today = isToday(date);

          return (
            <div
              key={date.toISOString()}
              onClick={() => onDateClick?.(date)}
              className={`min-h-[100px] p-2 border border-gray-100 cursor-pointer relative
                ${isCurrentMonth ? "bg-white" : "bg-gray-50 text-gray-300"}
                ${today ? "bg-blue-50 border-blue-300" : ""}
                ${selected ? "ring-2 ring-indigo-500" : ""}
                hover:bg-gray-100 transition`}
            >
              <div
                className={`font-medium ${isCurrentMonth ? "text-gray-700" : "text-gray-400"}`}
              >
                {format(date, "d")}
              </div>
              <div className="absolute right-1 bottom-1 flex flex-col space-y-1 max-w-[90%]">
                {dateHolidays.map((item, idx) => (
                  <div
                    key={`${item.holiday.id}-${idx}`}
                    className={`text-xs p-1 rounded break-words whitespace-normal ${
                      item.holiday.holiday_type === "public"
                        ? "bg-red-100 text-red-800"
                        : "bg-green-100 text-green-800"
                    }`}
                    title={item.holiday.name}
                  >
                    {item.displayText}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
