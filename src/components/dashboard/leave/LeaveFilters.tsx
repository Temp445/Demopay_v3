import React, { useEffect } from "react";
import { useLeaveStore } from "../../../stores/leaveStore";
import { format } from "date-fns";

interface LeaveFiltersProps {
  filters: {
    start_date: string;
    end_date: string;
    status: string;
    type: string;
  };
  onFilterChange: (filters: {
    start_date: string;
    end_date: string;
    status: string;
    type: string;
  }) => void;
  maxDate?: string;
}

const statuses = ["Pending", "Approved", "Rejected", "Cancelled"];

// Helper to format date as yyyy-MM-dd
function formatDateLocal(date: Date) {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function LeaveFilters({
  filters,
  onFilterChange,
  maxDate,
}: LeaveFiltersProps) {
  const { leaveTypes, fetchLeaveTypes } = useLeaveStore();
  const leaveTypesData = leaveTypes.items || [];
  const loading = leaveTypes.loading;

  useEffect(() => {
    fetchLeaveTypes();
  }, [fetchLeaveTypes]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[...Array(4)].map((_, index) => (
          <div
            key={index}
            className="h-10 bg-gray-200 animate-pulse rounded-md"
          />
        ))}
      </div>
    );
  }

  // Get current start year for the max attribute of the end date
  const startYear = filters.start_date 
    ? new Date(filters.start_date).getFullYear() 
    : new Date().getFullYear();

  // Handle Start Date changes
  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newStartStr = e.target.value;
    if (!newStartStr) {
      onFilterChange({ ...filters, start_date: "" });
      return;
    }

    const newStartDate = new Date(newStartStr);
    let newEndDate = new Date(filters.end_date || newStartStr);

    // Adjust endDate to same year as new startDate
    newEndDate.setFullYear(newStartDate.getFullYear());

    // Prevent endDate before startDate
    if (newEndDate < newStartDate) newEndDate = newStartDate;

    onFilterChange({
      ...filters,
      start_date: newStartStr,
      end_date: format(newEndDate, "yyyy-MM-dd"),
    });
  };

  // Handle End Date changes
  const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newEndStr = e.target.value;
    if (!newEndStr) {
      onFilterChange({ ...filters, end_date: "" });
      return;
    }

    const newEndDate = new Date(newEndStr);
    const currentStartDate = new Date(filters.start_date || newEndStr);

    // Force same year as startDate
    newEndDate.setFullYear(currentStartDate.getFullYear());

    // Prevent endDate before startDate
    if (newEndDate < currentStartDate) {
      newEndDate.setMonth(currentStartDate.getMonth(), currentStartDate.getDate());
    }

    onFilterChange({
      ...filters,
      end_date: format(newEndDate, "yyyy-MM-dd"),
    });
  };

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Start Date
        </label>
        <input
          type="date"
          value={filters.start_date}
          onChange={handleStartDateChange}
          max={maxDate}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-1.5"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          End Date
        </label>
        <input
          type="date"
          value={filters.end_date}
          onChange={handleEndDateChange}
          min={filters.start_date}
          max={maxDate || `${startYear}-12-31`}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-1.5"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Leave Type
        </label>
        <select
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2"
          value={filters.type}
          onChange={(e) => onFilterChange({ ...filters, type: e.target.value })}
        >
          <option value="">All Types</option>
          {leaveTypesData.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Status
        </label>
        <select
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2"
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
    </div>
  );
}