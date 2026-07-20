import React, { useState, useEffect } from "react";
import { Link } from 'react-router-dom';
import { Filter, Download, Plus, Search, Upload, List, UserX, Settings } from "lucide-react"; 
import LeaveList from "./LeaveList";
import LeaveFilters from "./LeaveFilters";
import LeaveBalances from "./LeaveBalances";
import AddLeaveRequestModal from "./AddLeaveRequestModal";
import AbsenteeList from "./AbsenteeList";
import AbsenteeLeaveRequestModal from "./AbsenteeLeaveRequestModal";
import ImportModal from "../../ImportModal";
import { exportToCSV } from "../../../lib/export";
import { useLeaveStore, type LeaveRequest } from "../../../stores/leaveStore";
import {
  useEmployeesStore,
  type Employee,
} from "../../../stores/employeesStore";
import { useAuth } from "../../../contexts/AuthContext";
import { importLeaveTypes } from "../../../lib/import";
import { useRoleAccess } from "../../../hooks/useRoleAccess";

export default function LeavePage() {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingRequest, setEditingRequest] = useState<LeaveRequest | undefined>(undefined);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(Date.now());
  const { user } = useAuth();
  const { loading: roleLoading, access, employeeId, canViewAllData, role } = useRoleAccess();
  const isReportingHead = role === 'Reporting Head';

  // New state for tab switching
  const [activeTab, setActiveTab] = useState<"leaves" | "absentees">("leaves");

  const handleTabChange = (tab: "leaves" | "absentees") => {
    setActiveTab(tab);
    
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);

    if (tab === "leaves") {
      // By default list data from current month start date to future
      setFilters((prev) => ({ ...prev, start_date: formatLocal(firstDay), end_date: "" }));
    } else {
      setFilters((prev) => ({ ...prev, start_date: formatLocal(firstDay), end_date: formatLocal(today) }));
    }
  };

  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(
    null
  );
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [showEmployeeDropdown, setShowEmployeeDropdown] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Helper to format date local
  const formatLocal = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const todayDate = new Date();
  const initialFirstDay = new Date(todayDate.getFullYear(), todayDate.getMonth(), 1);

  const [filters, setFilters] = useState({
    start_date: formatLocal(initialFirstDay),
    end_date: "",
    status: "",
    type: "",
  });

  const [isAbsenteeModalOpen, setIsAbsenteeModalOpen] = useState(false);
  const [selectedAbsentee, setSelectedAbsentee] = useState<{
    employeeId: string;
    employeeName: string;
    absentDate: string;
    initialStatus?: string; // Added initialStatus
  } | null>(null);

  const {
    items: employees,
    loading,
    error,
    fetchEmployees,
  } = useEmployeesStore();
  const { leaveRequests, fetchLeaveRequests } = useLeaveStore();

  useEffect(() => {
    if (canViewAllData || isReportingHead) {
      fetchEmployees();
    } else if (employeeId) {
      fetchEmployees(employeeId);
    }
  }, [fetchEmployees, canViewAllData, employeeId, isReportingHead]);

  useEffect(() => {
    if (access.restrictedToOwnData && employeeId && employees.length > 0) {
      const currentEmployee = employees.find(emp => emp.id === employeeId);
      if (currentEmployee) {
        setSelectedEmployee(currentEmployee);
      }
    }
  }, [access.restrictedToOwnData, employeeId, employees]);

  useEffect(() => {
    if (selectedEmployee) {
      setEmployeeSearch(
        `${selectedEmployee.name}`
      );
    } else {
      setEmployeeSearch("");
    }
  }, [selectedEmployee]);

  const handleLeaveAdded = () => {
    setLastRefresh(Date.now());
  };

  const handleAbsenteeLeaveAdded = () => {
    setLastRefresh(Date.now());
    setIsAbsenteeModalOpen(false);
    setSelectedAbsentee(null);
  };

  // Added status parameter here
  const handleAbsenteeClick = (
    employeeId: string,
    employeeName: string,
    absentDate: string,
    status?: string 
  ) => {
    setSelectedAbsentee({ employeeId, employeeName, absentDate, initialStatus: status });
    setIsAbsenteeModalOpen(true);
  };

  const handleImport = async (data: any[]) => {
    return await importLeaveTypes(data);
  };

  const handleImportComplete = () => {
    setLastRefresh(Date.now());
  };

  const handleExport = async () => {
    try {
      setExporting(true);
      setExportError(null);

      await fetchLeaveRequests(
        selectedEmployee?.id || "",
        filters.start_date ||
          new Date(
            new Date().getFullYear(),
            new Date().getMonth(),
            1
          ).toISOString(),
        filters.end_date || new Date().toISOString()
      );

      if (!leaveRequests.items || leaveRequests.items.length === 0) {
        throw new Error("No leave data available to export");
      }

      const filename = `leave_requests_${
        new Date().toISOString().split("T")[0]
      }.csv`;

      const formattedData = leaveRequests.items.map((request) => ({
        "Start Date": new Date(request.start_date).toLocaleDateString(),
        "End Date": new Date(request.end_date).toLocaleDateString(),
        Type: request.leave_type?.name || "Leave",
        Reason: request.reason,
        Status: request.status,
        "Approved By": request.approved_by_user?.email || "N/A",
        "Approved At": request.approved_at
          ? new Date(request.approved_at).toLocaleString()
          : "N/A",
      }));

      await exportToCSV(formattedData, filename);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to export data";
      setExportError(errorMessage);
      console.error("Export failed:", error);
    } finally {
      setExporting(false);
    }
  };

  const selectedYear = filters.start_date
    ? new Date(filters.start_date).getFullYear()
    : new Date().getFullYear();

  // Helper function to get status badge color for employee dropdown
  const getEmployeeStatusBadgeColor = (status: string): string => {
    const statusLower = status.toLowerCase();

    if (statusLower === 'active') return '';
    if (statusLower === 'terminated') return 'bg-red-100 text-red-800';
    if (statusLower === 'suspended') return 'bg-yellow-100 text-yellow-800';
    if (statusLower === 'relieved') return 'bg-orange-100 text-orange-800';
    if (statusLower === 'resigned') return 'bg-gray-100 text-gray-800';

    // Default for any other status
    return 'bg-blue-100 text-blue-800';
  };

  // Filter active employees based on search input (name or code)
    // const activeEmployees = employees.filter((emp) => emp.status === "Active");
    const filteredEmployees = employees.filter((emp) => {
    const searchLower = employeeSearch.toLowerCase();
    
    // Filter by reporting_to if the user is a reporting head
    if (isReportingHead) {
      const isSelf = emp.id === employeeId;
      const reportingTo = Array.isArray(emp.reporting_to) ? emp.reporting_to : [emp.reporting_to];
      const matchesEmployeeId = employeeId && reportingTo.some(id => id && String(id).includes(employeeId));
      const matchesUserId = user && reportingTo.some(id => id && String(id).includes(user.id));
      
      if (!matchesEmployeeId && !matchesUserId && !isSelf) {
        return false;
      }
    }
    
    return (
      emp.name.toLowerCase().includes(searchLower) ||
      (emp.employee_code &&
        emp.employee_code.toLowerCase().includes(searchLower))
    );
  });

  const subordinateIds = React.useMemo(() => {
    if (!isReportingHead) return [];
    return employees
      .filter(emp => {
        const reportingTo = Array.isArray(emp.reporting_to) ? emp.reporting_to : [emp.reporting_to];
        const matchesEmployeeId = employeeId && reportingTo.some(id => id && String(id).includes(employeeId));
        const matchesUserId = user && reportingTo.some(id => id && String(id).includes(user.id));
        return matchesEmployeeId || matchesUserId;
      })
      .map(emp => emp.id);
  }, [isReportingHead, employees, employeeId, user]);

  if (roleLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="xl:py-6">
      <div className="max-w-7xl mx-auto px-2 xl:px-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              Leave Management
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Request leave, view balances, and manage leave requests.
            </p>
          </div>
          <div className="mt-4 md:mt-0 flex flex-col sm:flex-row gap-3">
            {canViewAllData && !isReportingHead && (
              <button
                onClick={handleExport}
                disabled={exporting}
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download className="h-4 w-4 mr-2" />
                {exporting ? "Exporting..." : "Export"}
              </button>
            )}
            {canViewAllData && !isReportingHead && (
              <button
                onClick={() => setIsImportModalOpen(true)}
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                <Upload className="h-4 w-4 mr-2" />
                Import Leave Types
              </button>
            )}
            {canViewAllData && !selectedEmployee && employeeId && (
              <button
                onClick={() => {
                  const currentEmployee = employees.find(emp => emp.id === employeeId);
                  if (currentEmployee) {
                    setSelectedEmployee(currentEmployee);
                    setIsAddModalOpen(true);
                  }
                }}
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                <Plus className="h-4 w-4 mr-2" />
                Request My Leave
              </button>
            )}
            {selectedEmployee && (
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                <Plus className="h-4 w-4 mr-2" />
                Request Leave
              </button>
            )}
            {canViewAllData && !isReportingHead && (
              <Link
                to="/dashboard/leave/types"
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                <Settings className="h-4 w-4 mr-2" />
                Leave Type
              </Link>
            )}
          </div>
        </div>

        {/* Employee Selector - Only for Admin/HR/Reporting Head */}
        {(canViewAllData || isReportingHead) && (
          <div className="mt-4 relative">
            <label
              htmlFor="employee-select"
              className="block text-sm font-medium text-gray-700"
            >
              Select Employee
            </label>
            <div className="mt-1 relative rounded-md shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                id="employee-select"
                autoComplete="off"
                className="mt-1 block w-full pl-10 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md border"
                placeholder="Search by name or code..."
                value={employeeSearch}
                onChange={(e) => {
                  setEmployeeSearch(e.target.value);
                  setShowEmployeeDropdown(true);
                  if (!e.target.value) {
                    setSelectedEmployee(null);
                    setLastRefresh(Date.now());
                  }
                }}
                onFocus={() => setShowEmployeeDropdown(true)}
                onBlur={() => setShowEmployeeDropdown(false)}
              />

              {showEmployeeDropdown && (
                <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
                  {filteredEmployees.length === 0 ? (
                    <li className="relative cursor-default select-none py-2 pl-3 pr-9 text-gray-500">
                      No employees found
                    </li>
                  ) : (
                    filteredEmployees.map((employee) => {
                      const statusBadgeColor = getEmployeeStatusBadgeColor(employee.status);
                      const isActive = employee.status.toLowerCase() === 'active' || employee.status.toLowerCase() === 'rejoin';

                      return (
                        <li
                          key={employee.id}
                          className="relative cursor-pointer select-none py-2 pl-3 pr-9 text-gray-900 hover:bg-indigo-50 group"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setSelectedEmployee(employee);
                            setShowEmployeeDropdown(false);
                            setLastRefresh(Date.now());
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <span className="block truncate font-medium">
                                {employee.name}
                              </span>
                              {!isActive && (
                                <span
                                  className={`px-2 py-0.5 text-xs font-medium rounded-full whitespace-nowrap ${statusBadgeColor}`}
                                >
                                  {employee.status.toUpperCase()}
                                </span>
                              )}
                            </div>
                            <span className="block text-xs text-gray-500 ml-2 flex-shrink-0">
                              {employee.employee_code || "No ID"}
                            </span>
                          </div>
                          <span className="block truncate text-xs text-gray-500">
                            {employee.department}
                          </span>
                        </li>
                      );
                    })
                  )}
                </ul>
              )}
            </div>
          </div>
        )}

        {exportError && (
          <div className="mt-4 rounded-md bg-red-50 p-4">
            <div className="flex">
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">
                  Export failed
                </h3>
                <div className="mt-2 text-sm text-red-700">{exportError}</div>
              </div>
            </div>
          </div>
        )}

        <div className="mt-4">
          <LeaveFilters 
            filters={filters} 
            onFilterChange={setFilters} 
            maxDate={activeTab === "absentees" ? formatLocal(todayDate) : undefined}
          />
        </div>

        {selectedEmployee && (
          <div className="mt-4">
            <LeaveBalances
              employeeId={selectedEmployee.id}
              lastRefresh={lastRefresh}
              year={selectedYear}
            />
          </div>
        )}

        {/* ----------------- TAB NAVIGATION SECTION ----------------- */}
        <div className="mt-8 border-b border-gray-200">
          <nav className="-mb-px flex space-x-8" aria-label="Tabs">
            <button
              onClick={() => handleTabChange("leaves")}
              className={`
                whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center
                ${
                  activeTab === "leaves"
                    ? "border-indigo-500 text-indigo-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }
              `}
            >
              <List className="h-4 w-4 mr-2" />
              Leave Requests
            </button>
            {canViewAllData && (
              <button
                onClick={() => handleTabChange("absentees")}
                className={`
                  whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center
                  ${
                    activeTab === "absentees"
                      ? "border-indigo-500 text-indigo-600"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }
                `}
              >
                <UserX className="h-4 w-4 mr-2" />
                Absentee List
              </button>
            )}
          </nav>
        </div>
        {/* ----------------------------------------------------------- */}

        {/* CONDITIONAL RENDERING OF LISTS */}
        <div className="mt-6">
          {canViewAllData && activeTab === "absentees" ? (
            <AbsenteeList
              employeeId={selectedEmployee?.id ?? null}
              startDate={filters.start_date}
              endDate={filters.end_date}
              onAbsenteeClick={handleAbsenteeClick}
              lastRefresh={lastRefresh}
              subordinateIds={subordinateIds}
              isReportingHead={isReportingHead}
            />
          ) : (
            <LeaveList
              employee={selectedEmployee || undefined}
              filters={filters}
              onRefresh={handleLeaveAdded}
              lastRefresh={lastRefresh}
              subordinateIds={subordinateIds}
              isReportingHead={isReportingHead}
              onEdit={(request) => {
                // Ensure selectedEmployee is set so the modal can render.
                // The employee's own record is already in the `employees` list.
                if (!selectedEmployee || selectedEmployee.id !== request.employee_id) {
                  const emp = employees.find(e => e.id === request.employee_id);
                  if (emp) setSelectedEmployee(emp);
                }
                setEditingRequest(request);
                setIsAddModalOpen(true);
              }}
            />
          )}
        </div>
      </div>

      {selectedEmployee && (
        <AddLeaveRequestModal
          employee={selectedEmployee}
          isOpen={isAddModalOpen}
          onClose={() => {
            setIsAddModalOpen(false);
            setEditingRequest(undefined);
          }}
          onLeaveAdded={handleLeaveAdded}
          initialData={editingRequest}
        />
      )}

      <ImportModal
        isOpen={isImportModalOpen}
        onClose={() => {
          setIsImportModalOpen(false);
          handleImportComplete();
        }}
        entityType="leave_types"
        entityName="Leave Types"
        onImport={handleImport}
      />

      {selectedAbsentee && (
        <AbsenteeLeaveRequestModal
          employeeId={selectedAbsentee.employeeId}
          employeeName={selectedAbsentee.employeeName}
          absentDate={selectedAbsentee.absentDate}
          initialStatus={selectedAbsentee.initialStatus} // Passed initialStatus here
          isOpen={isAbsenteeModalOpen}
          onClose={() => {
            setIsAbsenteeModalOpen(false);
            setSelectedAbsentee(null);
          }}
          onLeaveAdded={handleAbsenteeLeaveAdded}
        />
      )}
    </div>
  );
}