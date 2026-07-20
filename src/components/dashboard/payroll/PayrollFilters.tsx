import React, { useEffect, useState, useRef } from 'react';
import { XCircle, X } from 'lucide-react';

interface PayrollFiltersProps {
  filters: {
    period_start: string;
    period_end: string;
    status: string;
    department: string;
    cadre: string;
    employeeSearch: string;
  };
  onFilterChange: (filters: any) => void;
  entries?: any[];
}

const statuses = ['Draft', 'Paid'];

function Autocomplete({ value, onChange, options, placeholder, id, label }: { value: string, onChange: (v: string) => void, options: string[], placeholder: string, id: string, label: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const filteredOptions = options.filter(opt => opt.toLowerCase().includes(value.toLowerCase()));

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={wrapperRef} className="relative">
      <label htmlFor={id} className="block text-sm font-medium text-gray-700">{label}</label>
      <div className="relative mt-1">
        <input
          type="text"
          id={id}
          placeholder={placeholder}
          autoComplete="off"
          className="block w-full rounded-md border-gray-300 pr-8 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
        />
        {value && (
          <button
            type="button"
            className="absolute inset-y-0 right-0 flex items-center pr-2 text-gray-400 hover:text-gray-600"
            onClick={() => {
              onChange('');
              setIsOpen(false);
            }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {isOpen && filteredOptions.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
          {filteredOptions.map((opt, idx) => (
            <li
              key={idx}
              className="relative cursor-pointer select-none py-2 pl-3 pr-9 text-gray-900 hover:bg-indigo-50 hover:text-indigo-900"
              onClick={() => {
                onChange(opt);
                setIsOpen(false);
              }}
            >
              <span className="block truncate">{opt}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function PayrollFilters({ filters, onFilterChange, entries = [] }: PayrollFiltersProps) {
  
  // Extract unique suggestions for datalists
  const departments = Array.from(new Set(entries.map(e => e.employee?.department?.name).filter(Boolean)));
  const cadres = Array.from(new Set(entries.map(e => e.employee?.cadre?.name).filter(Boolean)));
  // Employee search suggestions combining name and code
  const employeeSuggestions = Array.from(new Set(entries.map(e => {
    if (!e.employee) return null;
    return `${e.employee.name} (${e.employee.employee_code || 'N/A'})`;
  }).filter(Boolean)));

  const latestPayrollApplied = useRef(false);

  // 1. Logic to set default dates
  useEffect(() => {
    if (latestPayrollApplied.current) return;

    if (entries && entries.length > 0) {
      // Prefer latest payroll dates
      const latest = [...entries].sort((a, b) => 
        new Date(b.period_end).getTime() - new Date(a.period_end).getTime()
      )[0];
      
      onFilterChange({
        ...filters,
        period_start: latest.period_start,
        period_end: latest.period_end,
      });
      latestPayrollApplied.current = true;
    } else if (!filters.period_start || !filters.period_end) {
      // Fallback: Current Month
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      const formatDate = (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };

      onFilterChange({
        ...filters,
        period_start: formatDate(start),
        period_end: formatDate(end),
      });
      // We don't set latestPayrollApplied.current = true yet, 
      // because we want to update it if entries load later
    }
  }, [entries.length]);

  const handleClear = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const formatDate = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    onFilterChange({
      period_start: formatDate(start),
      period_end: formatDate(end),
      status: '',
      department: '',
      cadre: '',
      employeeSearch: '',
    });
  };

  return (
    // 2. Added 'sticky top-0 z-10 bg-white' to make the filter bar always visible while scrolling
    <div className="sticky top-0 z-10 grid grid-cols-1 gap-4 border-b border-gray-200 bg-white py-4 sm:grid-cols-2 lg:grid-cols-4 p-4 rounded-lg">
      <div>
        <label htmlFor="period_start" className="block text-sm font-medium text-gray-700">
          Period Start
        </label>
        <input
          type="date"
          id="period_start"
          name="period_start"
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          value={filters.period_start}
          onChange={(e) => onFilterChange({ ...filters, period_start: e.target.value })}
        />
      </div>

      <div>
        <label htmlFor="period_end" className="block text-sm font-medium text-gray-700">
          Period End
        </label>
        <input
          type="date"
          id="period_end"
          name="period_end"
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          value={filters.period_end}
          onChange={(e) => onFilterChange({ ...filters, period_end: e.target.value })}
        />
      </div>

      <div>
        <label htmlFor="status" className="block text-sm font-medium text-gray-700">
          Status
        </label>
        <select
          id="status"
          name="status"
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          value={filters.status}
          onChange={(e) => onFilterChange({ ...filters, status: e.target.value })}
        >
          <option value="">All Statuses</option>
          {statuses.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </div>

      <Autocomplete
        id="department"
        label="Department"
        placeholder="Filter by department"
        value={filters.department}
        onChange={(val) => onFilterChange({ ...filters, department: val })}
        options={departments as string[]}
      />

      <Autocomplete
        id="cadre"
        label="Cadre"
        placeholder="Filter by cadre"
        value={filters.cadre}
        onChange={(val) => onFilterChange({ ...filters, cadre: val })}
        options={cadres as string[]}
      />

      <Autocomplete
        id="employeeSearch"
        label="Employee / ID"
        placeholder="Filter by name or code"
        value={filters.employeeSearch}
        onChange={(val) => onFilterChange({ ...filters, employeeSearch: val })}
        options={employeeSuggestions as string[]}
      />

      <div className="flex items-end">
        <button
          type="button"
          onClick={handleClear}
          className="inline-flex items-center px-3 py-1 border border-gray-300 shadow-sm text-xs font-medium rounded-md text-gray-600 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 h-[38px] transition-colors"
        >
          <XCircle className="h-3.5 w-3.5 mr-1.5 text-gray-400" />
          Clear
        </button>
      </div>
    </div>
  );
}