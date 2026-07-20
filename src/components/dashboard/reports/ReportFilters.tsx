import React, { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import { useDepartmentsStore } from '../../../stores/departmentsStore';
import { useEmployeesStore } from '../../../stores/employeesStore';
import { useCadresStore } from '../../../stores/cadresStore';

interface ReportFiltersProps {
  filters: {
    startDate: string;
    endDate: string;
    department: string;
    cadre: string;
    employee: string;
  };
  onFilterChange: (filters: {
    startDate: string;
    endDate: string;
    department: string;
    cadre: string;
    employee: string;
  }) => void;
  isRestricted?: boolean;
}

export default function ReportFilters({ filters, onFilterChange, isRestricted }: ReportFiltersProps) {
  const { items: departments, loading: deptLoading, error: deptError, fetchDepartments } = useDepartmentsStore();
  const { items: employees, loading: empLoading, error: empError, fetchEmployees } = useEmployeesStore();
  const { items: cadres, loading: cadresLoading, error: cadresError, fetchCadres } = useCadresStore();

  const loading = deptLoading || empLoading || cadresLoading;
  const error = deptError || empError || cadresError;

  useEffect(() => {
    fetchDepartments();
    fetchEmployees();
    fetchCadres();
  }, [fetchDepartments, fetchEmployees, fetchCadres]);

  // Filter employees based on selected department and cadre
  const filteredEmployees = employees.filter(emp => {
    if (filters.department && emp.department !== filters.department) return false;
    if (filters.cadre && emp.cadre !== filters.cadre) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="h-10 bg-gray-200 animate-pulse rounded-md"></div>
        <div className="h-10 bg-gray-200 animate-pulse rounded-md"></div>
        <div className="h-10 bg-gray-200 animate-pulse rounded-md"></div>
        <div className="h-10 bg-gray-200 animate-pulse rounded-md"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-red-600 text-sm">
        Error loading filters: {error}
      </div>
    );
  }

  return (
    <div className="bg-white p-4 rounded-lg shadow">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <div>
          <label htmlFor="startDate" className="block text-sm font-medium text-gray-700">
            Start Date
          </label>
          <input
            type="date"
            id="startDate"
            name="startDate"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            value={filters.startDate}
            onChange={(e) => onFilterChange({ ...filters, startDate: e.target.value })}
          />
        </div>

        <div>
          <label htmlFor="endDate" className="block text-sm font-medium text-gray-700">
            End Date
          </label>
          <input
            type="date"
            id="endDate"
            name="endDate"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            value={filters.endDate}
            onChange={(e) => onFilterChange({ ...filters, endDate: e.target.value })}
          />
        </div>

        {!isRestricted && (
          <>
            <div>
              <label htmlFor="department" className="block text-sm font-medium text-gray-700">
                Department
              </label>
              <select
                id="department"
                name="department"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                value={filters.department}
                onChange={(e) => {
                  // Reset employee selection when department changes
                  onFilterChange({ 
                    ...filters, 
                    department: e.target.value,
                    employee: ''
                  });
                }}
              >
                <option value="">All Departments</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.name}>
                    {department.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="cadre" className="block text-sm font-medium text-gray-700">
                Cadre
              </label>
              <select
                id="cadre"
                name="cadre"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                value={filters.cadre}
                onChange={(e) => onFilterChange({ ...filters, cadre: e.target.value })}
              >
                <option value="">All Cadres</option>
                {cadres.map((cadre) => (
                  <option key={cadre.id} value={cadre.name}>
                    {cadre.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="employee" className="block text-sm font-medium text-gray-700">
                Employee
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-gray-400" />
                </div>
                <select
                  id="employee"
                  name="employee"
                  className="mt-1 block w-full pl-10 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                  value={filters.employee}
                  onChange={(e) => onFilterChange({ ...filters, employee: e.target.value })}
                >
                  <option value="">All Employees</option>
                  {filteredEmployees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.name} - {employee.department}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}