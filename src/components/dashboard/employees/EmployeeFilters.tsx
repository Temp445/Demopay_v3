import React, { useState, useEffect } from 'react';
import { useDepartmentsStore } from '../../../stores/departmentsStore';
import { useRolesStore } from '../../../stores/rolesStore';
import { useCadresStore } from '../../../stores/cadresStore';

interface EmployeeFiltersProps {
  filters: {
    department: string;
    status: string;
    role: string;
    cadre: string;
  };
  onFilterChange: (filters: { department: string; status: string; role: string; cadre: string }) => void;
}

const statuses = ['Active', 'On Leave', 'Terminated'];

export default function EmployeeFilters({ filters, onFilterChange }: EmployeeFiltersProps) {
  const { items: departments, loading: deptLoading, error: deptError, fetchDepartments } = useDepartmentsStore();
  const { items: roles, loading: rolesLoading, error: rolesError, fetchRoles } = useRolesStore();
  const { items: cadres, loading: cadresLoading, error: cadresError, fetchCadres } = useCadresStore();

  const loading = deptLoading || rolesLoading || cadresLoading;
  const error = deptError || rolesError || cadresError;

  useEffect(() => {
    fetchDepartments();
    fetchRoles();
    fetchCadres();
  }, [fetchDepartments, fetchRoles, fetchCadres]);

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
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
      <div>
        <label htmlFor="filter-department" className="block text-sm font-medium text-gray-700">
          Department
        </label>
        <select
          id="filter-department"
          name="department"
          className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
          value={filters.department}
          onChange={(e) => onFilterChange({ ...filters, department: e.target.value })}
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
        <label htmlFor="filter-cadre" className="block text-sm font-medium text-gray-700">
          Cadre
        </label>
        <select
          id="filter-cadre"
          name="cadre"
          className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
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
        <label htmlFor="filter-status" className="block text-sm font-medium text-gray-700">
          Status
        </label>
        <select
          id="filter-status"
          name="status"
          className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
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

      <div>
        <label htmlFor="filter-role" className="block text-sm font-medium text-gray-700">
          Designation
        </label>
        <select
          id="filter-role"
          name="role"
          className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
          value={filters.role}
          onChange={(e) => onFilterChange({ ...filters, role: e.target.value })}
        >
          <option value="">All Designations</option>
          {roles.map((role) => (
            <option key={role.id} value={role.name}>
              {role.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}