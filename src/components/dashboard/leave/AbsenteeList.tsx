import React, { useEffect } from 'react';
import { UserX, AlertTriangle, Calendar, User, Building2 } from 'lucide-react';
import { useAbsenteeStore, AbsenteeRecord } from '../../../stores/absenteeStore';
import { format } from 'date-fns';

interface AbsenteeListProps {
  employeeId: string | null;
  startDate: string;
  endDate: string;
  onAbsenteeClick: (
    employeeId: string,
    employeeName: string,
    absentDate: string,
    status?: string // Added status prop
  ) => void;
  lastRefresh: number;
  subordinateIds?: string[];
  isReportingHead?: boolean;
}

export default function AbsenteeList({
  employeeId,
  startDate,
  endDate,
  onAbsenteeClick,
  lastRefresh,
  subordinateIds,
  isReportingHead,
}: AbsenteeListProps) {
  const { items: absentees, loading, error, fetchAbsentees } = useAbsenteeStore();

  useEffect(() => {
    if (startDate && endDate) {
      fetchAbsentees(startDate, endDate, employeeId || undefined);
    }
  }, [startDate, endDate, employeeId, lastRefresh, fetchAbsentees]);

  const filteredAbsentees = employeeId
    ? absentees.filter(a => a.employee_id === employeeId)
    : isReportingHead
    ? absentees.filter(a => subordinateIds?.includes(a.employee_id))
    : absentees;

  if (loading) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center justify-center h-32">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-indigo-600" />
        </div>
      </div>
    );
  }

  if (!filteredAbsentees || filteredAbsentees.length === 0) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <div className="text-center py-12">
          <UserX className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No absentees found</h3>
          <p className="mt-1 text-sm text-gray-500">
            {employeeId
              ? "This employee has no absentees in the selected period."
              : "All employees have attendance or approved leave for the selected period."}
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <div className="rounded-md bg-red-50 p-4">
          <div className="flex">
            <AlertTriangle className="h-5 w-5 text-red-400" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Error loading absentees</h3>
              <div className="mt-2 text-sm text-red-700">{error}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Group absentees by employee, now storing an array of objects to keep the status
  const groupedByEmployee = filteredAbsentees.reduce((acc: Record<string, any>, record: AbsenteeRecord) => {
    if (!acc[record.employee_id]) {
      acc[record.employee_id] = {
        employee_name: record.employee_name,
        employee_code: record.employee_code,
        department: record.department,
        records: [], // Storing complex objects instead of just string dates
      };
    }
    acc[record.employee_id].records.push({
      date: record.absent_date,
      status: record.status
    });
    return acc;
  }, {});

  return (
    <div className="bg-white shadow rounded-lg">
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <UserX className="h-5 w-5 text-red-600" />
          <h2 className="text-lg font-medium text-gray-900">Absentee Records</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            {Object.keys(groupedByEmployee).length} employee{Object.keys(groupedByEmployee).length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      <div className="px-6 py-4 space-y-4">
        {Object.entries(groupedByEmployee).map(([employeeId, data]) => (
          <div key={employeeId} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <User className="h-4 w-4 text-gray-400" />
                  <h3 className="text-sm font-medium text-gray-900">{data.employee_name}</h3>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                    {data.employee_code}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Building2 className="h-3 w-3" />
                  <span>{data.department}</span>
                </div>
              </div>
              <div className="text-right">
                <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-red-50 text-red-700">
                  {data.records.length} absent day{data.records.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>

            <div className="border-t border-gray-200 pt-3 mt-3">
              <p className="text-xs font-medium text-gray-700 mb-2">Absent Dates:</p>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {data.records.sort((a: any, b: any) => a.date.localeCompare(b.date)).map((rec: any) => (
                  <button
                    key={rec.date}
                    onClick={() => onAbsenteeClick(employeeId, data.employee_name, rec.date, rec.status)}
                    className="inline-flex flex-col items-center justify-center px-3 py-2 border border-gray-300 rounded-md shadow-sm text-xs font-medium text-gray-700 bg-white hover:bg-indigo-50 hover:border-indigo-500 hover:text-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
                  >
                    <div className="flex items-center">
                      <Calendar className="h-3 w-3 mr-1" />
                      {format(new Date(rec.date), 'dd/MM/yyyy')}
                    </div>
                    {/* Tiny visual indicator if it's a half-day absence */}
                    {rec.status === 'First Off' && <span className="text-[10px] text-orange-500 mt-1">1st Half Off</span>}
                    {rec.status === 'Second Off' && <span className="text-[10px] text-orange-500 mt-1">2nd Half Off</span>}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 rounded-b-lg">
        <p className="text-xs text-gray-500">
          Click on any date to create a leave request for that employee
        </p>
      </div>
    </div>
  );
}
