import React, { useState, useRef, useEffect } from 'react';
import { Plus, Filter, Download, Upload, Building2, Briefcase, Layers, ChevronDown } from 'lucide-react';
import EmployeeList from './EmployeeList';
import EmployeeFilters from './EmployeeFilters';
import AddEmployeeModal from './AddEmployeeModal';
import ImportModal from '../../ImportModal';
import ManageDepartmentsModal from './ManageDepartmentsModal';
import ManageRolesModal from './ManageRolesModal';
import ManageCadresModal from './ManageCadresModal';
import { exportToCSV } from '../../../lib/export';
import { useEmployeesStore } from '../../../stores/employeesStore';
import { useAuth } from '../../../contexts/AuthContext';
import { importEmployees } from '../../../lib/import';
import { useRoleAccess } from '../../../hooks/useRoleAccess';

export default function EmployeesPage() {
  const { user } = useAuth();

  const { access, employeeId, canViewAllData, loading: roleLoading } = useRoleAccess();

  // Existing States
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(Date.now());
  const [exporting, setExporting] = useState(false);
  const [filters, setFilters] = useState({
    department: '',
    status: '',
    role: '',
    cadre: '',
  });

  // Modal States
  const [isDepartmentsModalOpen, setIsDepartmentsModalOpen] = useState(false);
  const [isRolesModalOpen, setIsRolesModalOpen] = useState(false);
  const [isCadresModalOpen, setIsCadresModalOpen] = useState(false);

  // NEW: Dropdown State & Ref
  const [isManageDropdownOpen, setIsManageDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // NEW: Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsManageDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleEmployeeAdded = () => {
    setLastRefresh(Date.now());
  };

  const handleImport = async (data: any[]) => {
    if (!user) throw new Error('User not authenticated');
    return await importEmployees(data, user.id);
  };

  const handleImportComplete = () => {
    setLastRefresh(Date.now());
  };

  const { items: employees, fetchEmployees } = useEmployeesStore();

  const handleExport = async () => {
    try {
      setExporting(true);
      await fetchEmployees();
      const filteredEmployees = employees.filter((employee) => {
        if (filters.department && employee.department !== filters.department) return false;
        if (filters.status && employee.status !== filters.status) return false;
        if (filters.role && employee.role !== filters.role) return false;
        if (filters.cadre && employee.cadre !== filters.cadre) return false;
        return true;
      });

      const filename = `employees_${new Date().toISOString().split('T')[0]}.csv`;
      exportToCSV(filteredEmployees, filename);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setExporting(false);
    }
  };

  // 2. ADD THIS: Prevent rendering until we know WHO the user is.
  // This stops the component from fetching "All" data while the ID is still null.
  if (roleLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <>
      <div className="py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Employees</h1>
              <p className="mt-1 text-sm text-gray-500">
                Manage your employee roster, view details, and handle employee information.
              </p>
            </div>

            {/* ACTION BUTTONS */}
            <div className="mt-4 md:mt-0 flex flex-col sm:flex-row gap-3">

              {canViewAllData && (
                <button
                  onClick={() => setIsFiltersOpen(!isFiltersOpen)}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  <Filter className="h-4 w-4 mr-2" />
                  Filters
                </button>
              )}
              {canViewAllData && (
                <button
                  onClick={handleExport}
                  disabled={exporting}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Download className="h-4 w-4 mr-2" />
                  {exporting ? 'Exporting...' : 'Export'}
                </button>
              )}
              {canViewAllData && (
                <button
                  onClick={() => setIsImportModalOpen(true)}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Import
                </button>
              )}

              {/* Combined Dropdown Button - Only for Admin/HR */}
              {canViewAllData && (
                <div className="relative" ref={dropdownRef}>
                  <button
                    onClick={() => setIsManageDropdownOpen(!isManageDropdownOpen)}
                    className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Manage & Add
                    <ChevronDown className="h-4 w-4 ml-2" />
                  </button>

                  {/* Dropdown Menu */}
                  {isManageDropdownOpen && (
                    <div className="origin-top-right absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-10">
                      <div className="py-1" role="menu" aria-orientation="vertical">
                        <button
                          onClick={() => {
                            setIsAddModalOpen(true);
                            setIsManageDropdownOpen(false);
                          }}
                          className="flex w-full items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        >
                          <Plus className="h-4 w-4 mr-3" />
                          Add Employee
                        </button>
                        <button
                          onClick={() => {
                            setIsDepartmentsModalOpen(true);
                            setIsManageDropdownOpen(false);
                          }}
                          className="flex w-full items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        >
                          <Building2 className="h-4 w-4 mr-3" />
                          Departments
                        </button>
                        <button
                          onClick={() => {
                            setIsRolesModalOpen(true);
                            setIsManageDropdownOpen(false);
                          }}
                          className="flex w-full items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        >
                          <Briefcase className="h-4 w-4 mr-3" />
                          Designation
                        </button>
                        <button
                          onClick={() => {
                            setIsCadresModalOpen(true);
                            setIsManageDropdownOpen(false);
                          }}
                          className="flex w-full items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        >
                          <Layers className="h-4 w-4 mr-3" />
                          Cadres
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>

          {isFiltersOpen && (
            <div className="mt-4">
              <EmployeeFilters filters={filters} onFilterChange={setFilters} />
            </div>
          )}

          <div className="mt-4">
            <EmployeeList
              filters={filters}
              onRefresh={handleEmployeeAdded}
              lastRefresh={lastRefresh}
              filterByEmployeeId={access.restrictedToOwnData ? employeeId : null}
              canEdit={canViewAllData}
              canDelete={canViewAllData}
            />
          </div>
        </div>

        {/* --- MODALS --- */}
        <AddEmployeeModal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          onEmployeeAdded={handleEmployeeAdded}
        />

        <ManageDepartmentsModal
          isOpen={isDepartmentsModalOpen}
          onClose={() => setIsDepartmentsModalOpen(false)}
        />

        <ManageRolesModal
          isOpen={isRolesModalOpen}
          onClose={() => setIsRolesModalOpen(false)}
        />

        <ManageCadresModal
          isOpen={isCadresModalOpen}
          onClose={() => setIsCadresModalOpen(false)}
        />
      </div>

      <ImportModal
        isOpen={isImportModalOpen}
        onClose={() => {
          setIsImportModalOpen(false);
          handleImportComplete();
        }}
        entityType="employees"
        entityName="Employees"
        onImport={handleImport}
      />
    </>
  );
}