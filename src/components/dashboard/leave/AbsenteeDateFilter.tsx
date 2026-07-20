import React, { useState, useEffect } from 'react';
import { Calendar, AlertCircle } from 'lucide-react';

interface AbsenteeDateFilterProps {
  startDate: string;
  endDate: string;
  onDateChange: (startDate: string, endDate: string) => void;
}

export default function AbsenteeDateFilter({
  startDate,
  endDate,
  onDateChange,
}: AbsenteeDateFilterProps) {
  const [startInput, setStartInput] = useState('');
  const [endInput, setEndInput] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const formatDateToDDMMYYYY = (isoDate: string): string => {
    if (!isoDate) return '';
    const date = new Date(isoDate);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const parseDDMMYYYY = (dateStr: string): Date | null => {
    if (!dateStr) return null;
    const parts = dateStr.split('/');
    if (parts.length !== 3) return null;

    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);

    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;

    const date = new Date(year, month, day);
    if (
      date.getDate() !== day ||
      date.getMonth() !== month ||
      date.getFullYear() !== year
    ) {
      return null;
    }

    return date;
  };

  const validateDateRange = (start: string, end: string): string | null => {
    const startDate = parseDDMMYYYY(start);
    const endDate = parseDDMMYYYY(end);

    if (!startDate) {
      return 'Invalid start date format. Use DD/MM/YYYY';
    }

    if (!endDate) {
      return 'Invalid end date format. Use DD/MM/YYYY';
    }

    const currentYear = new Date().getFullYear();
    const previousYear = currentYear - 1;

    const minDate = new Date(previousYear, 0, 1);
    const maxDate = new Date(currentYear, 11, 31);

    if (startDate < minDate || startDate > maxDate) {
      return `Start date must be between 01/01/${previousYear} and 31/12/${currentYear}`;
    }

    if (endDate < minDate || endDate > maxDate) {
      return `End date must be between 01/01/${previousYear} and 31/12/${currentYear}`;
    }

    if (endDate < startDate) {
      return 'End date must be after start date';
    }

    return null;
  };

  useEffect(() => {
    setStartInput(formatDateToDDMMYYYY(startDate));
    setEndInput(formatDateToDDMMYYYY(endDate));
  }, [startDate, endDate]);

  const handleStartDateChange = (value: string) => {
    setStartInput(value);
    setValidationError(null);
  };

  const handleEndDateChange = (value: string) => {
    setEndInput(value);
    setValidationError(null);
  };

  const handleStartDateBlur = () => {
    const error = validateDateRange(startInput, endInput);
    if (error) {
      setValidationError(error);
      return;
    }

    const parsedDate = parseDDMMYYYY(startInput);
    if (parsedDate) {
      const isoDate = parsedDate.toISOString().split('T')[0];
      onDateChange(isoDate, endDate);
    }
  };

  const handleEndDateBlur = () => {
    const error = validateDateRange(startInput, endInput);
    if (error) {
      setValidationError(error);
      return;
    }

    const parsedDate = parseDDMMYYYY(endInput);
    if (parsedDate) {
      const isoDate = parsedDate.toISOString().split('T')[0];
      onDateChange(startDate, isoDate);
    }
  };

  const handleApply = () => {
    const error = validateDateRange(startInput, endInput);
    if (error) {
      setValidationError(error);
      return;
    }

    const startParsed = parseDDMMYYYY(startInput);
    const endParsed = parseDDMMYYYY(endInput);

    if (startParsed && endParsed) {
      const startISO = startParsed.toISOString().split('T')[0];
      const endISO = endParsed.toISOString().split('T')[0];
      onDateChange(startISO, endISO);
      setValidationError(null);
    }
  };

  return (
    <div className="bg-white shadow rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center">
          <Calendar className="h-5 w-5 text-indigo-600 mr-2" />
          <h3 className="text-sm font-medium text-gray-900">Absentee Date Range</h3>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label htmlFor="start-date" className="block text-xs font-medium text-gray-700 mb-1">
            Start Date (DD/MM/YYYY)
          </label>
          <input
            type="text"
            id="start-date"
            value={startInput}
            onChange={(e) => handleStartDateChange(e.target.value)}
            onBlur={handleStartDateBlur}
            placeholder="DD/MM/YYYY"
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          />
        </div>

        <div>
          <label htmlFor="end-date" className="block text-xs font-medium text-gray-700 mb-1">
            End Date (DD/MM/YYYY)
          </label>
          <input
            type="text"
            id="end-date"
            value={endInput}
            onChange={(e) => handleEndDateChange(e.target.value)}
            onBlur={handleEndDateBlur}
            placeholder="DD/MM/YYYY"
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          />
        </div>

        <div className="flex items-end">
          <button
            onClick={handleApply}
            className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Apply Filter
          </button>
        </div>
      </div>

      {validationError && (
        <div className="mt-3 rounded-md bg-red-50 p-3">
          <div className="flex">
            <AlertCircle className="h-5 w-5 text-red-400 mr-2" />
            <div className="text-sm text-red-700">{validationError}</div>
          </div>
        </div>
      )}

      <div className="mt-3 text-xs text-gray-500">
        <p>Date range must be between January 1st and December 31st of current or previous year.</p>
      </div>
    </div>
  );
}
