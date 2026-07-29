import { useState, useEffect, useMemo } from "react";
import { Clock, Search, CreditCard as Edit, Filter, AlertCircle, Save, AlertTriangle, UserX, XCircle, ArrowRight, CheckSquare, Square, ExternalLink, FileText, Info, User } from "lucide-react";
import { useTimeStampManagementStore } from "../../../stores/timeStampManagementStore";
import { format } from "date-fns";
import EditTimeStampModal from "./EditTimeStampModal";
import AddTimeStampModal from "./AddTimeStampModal";
import toast from "react-hot-toast";
import { validateAttendanceRequests, getRequestDisplayInfo } from "../../../lib/attendanceRequestValidation";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../../lib/supabase";
import type {
  FilterMode,
  ProcessedTimeRecord,
  LocationScenarioFilter,
} from "../../../types/timeStampManagement";

type ViewCategory = "all" | "incomplete" | "wrong_shift" | "unscheduled" | "regular";
type ProcessFilter = "all" | "processed" | "unprocessed";

export default function TimeStampManagementPage() {
  const {
    items: timeRecords,
    shifts,
    employees,
    loading,
    error,
    dataSource,
    fetchShifts,
    fetchEmployees,
    fetchTimeRecordsByShift,
    fetchTimeRecordsByEmployee,
    saveToAttendanceLogs,
  } = useTimeStampManagementStore();

  const [filterMode, setFilterMode] = useState<FilterMode>("by_shift");
  const [viewCategory, setViewCategory] = useState<ViewCategory>("all");
  const [processFilter, setProcessFilter] = useState<ProcessFilter>("all");

  const [shiftFilter, setShiftFilter] = useState({
    shift_id: "",
    shift_date: format(new Date(), "yyyy-MM-dd"),
  });

  const [employeeFilter, setEmployeeFilter] = useState({
    employee_id: "",
    start_date: format(new Date(), "yyyy-MM-dd"),
    end_date: format(new Date(), "yyyy-MM-dd"),
  });

  const [searchTerm, setSearchTerm] = useState("");
  const [employeeNameFilter, setEmployeeNameFilter] = useState<string>("all");
  const [hasLoaded, setHasLoaded] = useState(false);

  const [selectedRecord, setSelectedRecord] = useState<ProcessedTimeRecord | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const [selectedRecordIds, setSelectedRecordIds] = useState<Set<string>>(new Set());

  const [locationFilter, setLocationFilter] = useState<LocationScenarioFilter>("all");

  const [employeeSearchText, setEmployeeSearchText] = useState("");
  const [showEmployeeDropdown, setShowEmployeeDropdown] = useState(false);
  const [showMoreFilters, setShowMoreFilters] = useState(false);

  const [requestDetails, setRequestDetails] = useState<Record<string, any>>({});
  const [tenantId, setTenantId] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchShifts();
    fetchEmployees();

    const fetchTenantId = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        if (user.user_metadata?.tenant_id) {
          setTenantId(user.user_metadata.tenant_id);
          return;
        }

        const { data: empData } = await supabase
          .from('employees')
          .select('tenant_id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (empData?.tenant_id) {
          setTenantId(empData.tenant_id);
          return;
        }

        const { data: profileData } = await supabase
          .from('profiles')
          .select('tenant_id')
          .eq('id', user.id)
          .maybeSingle();

        if (profileData?.tenant_id) {
          setTenantId(profileData.tenant_id);
        }
      } catch (err) {
        console.error("Failed to fetch tenant ID", err);
      }
    };
    fetchTenantId();
  }, [fetchShifts, fetchEmployees]);

  useEffect(() => {
    let isMounted = true;

    const fetchRequestDetails = async () => {
      if (!tenantId || timeRecords.length === 0) return;

      try {
        const details: Record<string, any> = {};

        await Promise.all(
          timeRecords.map(async (record) => {
            const dateStr = record.date.split('T')[0];

            const result = await validateAttendanceRequests(
              tenantId,
              record.employee_id,
              dateStr,
              record.clock_in ? new Date(record.clock_in) : null,
              record.clock_out ? new Date(record.clock_out) : null,
              shifts.find(s => s.id === record.matched_shift_id)?.start_time || null,
              shifts.find(s => s.id === record.matched_shift_id)?.end_time || null
            );

            if (result.hasPendingRequest || result.hasApprovedRequest) {
              details[record.id] = getRequestDisplayInfo(result);
            }
          })
        );

        if (isMounted) {
          setRequestDetails(details);
        }
      } catch (error) {
        console.error("Error fetching request validations:", error);
      }
    };

    fetchRequestDetails();

    return () => {
      isMounted = false;
    };
  }, [timeRecords, tenantId, shifts]);

  useEffect(() => {
    if (
      filterMode === "by_shift" &&
      shiftFilter.shift_id &&
      shiftFilter.shift_date
    ) {
      setSelectedRecordIds(new Set());
      fetchTimeRecordsByShift(shiftFilter).then(() => {
        setHasLoaded(true);
        setViewCategory("all");
      });
    }
  }, [filterMode, shiftFilter.shift_id, shiftFilter.shift_date, fetchTimeRecordsByShift]);

  useEffect(() => {
    if (
      filterMode === "by_employee" &&
      employeeFilter.employee_id &&
      employeeFilter.start_date &&
      employeeFilter.end_date
    ) {
      if (new Date(employeeFilter.end_date) < new Date(employeeFilter.start_date)) {
        toast.error("End date must be after start date");
        return;
      }

      setSelectedRecordIds(new Set());
      fetchTimeRecordsByEmployee(employeeFilter).then(() => {
        setHasLoaded(true);
        setViewCategory("all");
      });
    }
  }, [filterMode, employeeFilter.employee_id, employeeFilter.start_date, employeeFilter.end_date, fetchTimeRecordsByEmployee]);

  const handleFilterModeChange = (newMode: FilterMode) => {
    setFilterMode(newMode);
    setHasLoaded(false);
    setSelectedRecordIds(new Set());
    setSearchTerm("");
    setEmployeeNameFilter("all");
    setViewCategory("all");
    setProcessFilter("all");
    setEmployeeSearchText("");
    setEmployeeFilter((prev) => ({ ...prev, employee_id: "" }));
  };

  const filteredRecords = useMemo(() => {
    return timeRecords.filter((record) => {
      const employee = employees.find(e => e.id === record.employee_id);

      // 🚨 Critical Fix: Date-based employee visibility
    if (employee && employee.status_date && employee.status.toLowerCase() !== "active") {
        const recordDate = record.date.split("T")[0];

        if (new Date(recordDate) > new Date(employee.status_date)) {
          return false; // ❌ Hide after relieved date
        }
      }

      // 1. Employee Search Filter (Only active in "By Shift" mode)
      if (filterMode === "by_shift") {
        const matchesSearch =
          !searchTerm ||
          record.employee_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          record.employee_code.toLowerCase().includes(searchTerm.toLowerCase());

        const matchesEmployee =
          employeeNameFilter === "all" || record.employee_id === employeeNameFilter;

        if (!matchesSearch || !matchesEmployee) return false;
      }

      // 2. Process Status Filter
      const isUnprocessed = record.id.startsWith("ts_");
      if (processFilter === "processed" && isUnprocessed) return false;
      if (processFilter === "unprocessed" && !isUnprocessed) return false;

      // 3. Category Tab Filter
      const isIncomplete =
        (record.clock_in && !record.clock_out) || (!record.clock_in && record.clock_out);

      const matchesCategory =
        viewCategory === "all" ||
        (viewCategory === "incomplete" && isIncomplete) ||
        (viewCategory === "wrong_shift" && record.shift_status === "wrong_shift") ||
        (viewCategory === "unscheduled" && record.shift_status === "unscheduled") ||
        (viewCategory === "regular" && record.shift_status === "regular");

      // 4. Location Filter
      let matchesLocation = true;
      if (locationFilter !== "all") {
        matchesLocation = record.location_scenario === locationFilter;
      }

      return matchesCategory && matchesLocation;
    });
  }, [timeRecords, searchTerm, employeeNameFilter, viewCategory, filterMode, processFilter, locationFilter]);

  // Derived completely from source records to provide the global badge accurate count
  const unprocessedRecords = useMemo(() => {
    return timeRecords.filter(r => r.id.startsWith("ts_"));
  }, [timeRecords]);

  const stats = useMemo(() => {
    const incomplete = timeRecords.filter(
      (r) => (r.clock_in && !r.clock_out) || (!r.clock_in && r.clock_out)
    ).length;
    const wrongShift = timeRecords.filter((r) => r.shift_status === "wrong_shift").length;
    const unscheduled = timeRecords.filter((r) => r.shift_status === "unscheduled").length;
    const regular = timeRecords.filter((r) => r.shift_status === "regular").length;
    return { all: timeRecords.length, incomplete, wrongShift, unscheduled, regular };
  }, [timeRecords]);

  const getSelectableRecords = () => {
    return filteredRecords.filter((record) => {
      const isComplete = Boolean(record.clock_in && record.clock_out);
      const reqInfo = requestDetails[record.id];
      // Updated to handle array
      const isPending = Array.isArray(reqInfo) && reqInfo.some(r => r.status === "pending");
      
      return isComplete && !isPending;
    });
  };

  const toggleRecordSelection = (recordId: string) => {
    setSelectedRecordIds((prev) => {
      const next = new Set(prev);
      if (next.has(recordId)) next.delete(recordId);
      else next.add(recordId);
      return next;
    });
  };

  const toggleAllSelection = () => {
    const selectableRecords = getSelectableRecords();
    const allSelected =
      selectableRecords.length > 0 &&
      selectableRecords.every((r) => selectedRecordIds.has(r.id));

    if (allSelected) {
      const next = new Set(selectedRecordIds);
      selectableRecords.forEach((r) => next.delete(r.id));
      setSelectedRecordIds(next);
    } else {
      const next = new Set(selectedRecordIds);
      selectableRecords.forEach((r) => next.add(r.id));
      setSelectedRecordIds(next);
    }
  };

  const formatDateTime = (dateTimeString: string | null) => {
    if (!dateTimeString) return "N/A";
    try {
      return format(new Date(dateTimeString), "dd/MM/yyyy hh:mm a");
    } catch {
      return "Invalid Date";
    }
  };

  const formatDateOnly = (dateString: string) => {
    return format(new Date(dateString), "dd MMM yyyy");
  };

  const formatTime12Hour = (time: string | null) => {
    if (!time) return "N/A";
    try {
      const [hourStr, minuteStr] = time.split(":");
      let hour = Number(hourStr);
      const minute = Number(minuteStr);
      const period = hour >= 12 ? "PM" : "AM";
      hour = hour % 12 || 12;
      return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")} ${period}`;
    } catch {
      return "Invalid Time";
    }
  };

  const handleEditClick = (record: ProcessedTimeRecord) => {
    setSelectedRecord(record);
    setIsEditModalOpen(true);
  };

  const handleEditSuccess = async () => {
    setIsEditModalOpen(false);
    setSelectedRecord(null);
    toast.success("Time stamp updated successfully");

    if (filterMode === "by_shift") {
      await fetchTimeRecordsByShift(shiftFilter);
    } else {
      await fetchTimeRecordsByEmployee(employeeFilter);
    }
  };

  const handleAddSuccess = () => {
    setIsAddModalOpen(false);
    toast.success("Time stamp created successfully");
  };

  const handleUpdateToAttendanceLogs = async () => {
    const recordsToUpdate = timeRecords.filter((r) => selectedRecordIds.has(r.id));

    if (recordsToUpdate.length === 0) {
      toast.error("Please select at least one complete record to update.");
      return;
    }

    try {
      await saveToAttendanceLogs(recordsToUpdate);
      toast.success(`${recordsToUpdate.length} record(s) successfully saved to attendance logs`);
      setSelectedRecordIds(new Set());

      if (filterMode === "by_shift") {
        await fetchTimeRecordsByShift(shiftFilter);
      } else if (filterMode === "by_employee") {
        await fetchTimeRecordsByEmployee(employeeFilter);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save records");
    }
  };

  // const filteredEmployeeOptions = useMemo(() => {
  //   const today = new Date();
  //   today.setHours(0, 0, 0, 0);

  //   // Filter employees based on status and resignation date
  //   const activeEmployees = employees.filter((emp) => {
  //     // If employee is Relieved, check if resignation date has passed
  //     if (emp.status === 'Relieved' && emp.status_date) {
  //       const resignationDate = new Date(emp.status_date);
  //       resignationDate.setHours(0, 0, 0, 0);
  //       // Only show if resignation date hasn't passed yet
  //       return resignationDate >= today;
  //     }
  //     // Show all other employees
  //     return true;
  //   });

  //   if (!employeeSearchText) return activeEmployees;

  //   const lowerSearch = employeeSearchText.toLowerCase();
  //   return activeEmployees.filter(
  //     (emp) =>
  //       emp.name.toLowerCase().includes(lowerSearch) ||
  //       emp.employee_code.toLowerCase().includes(lowerSearch)
  //   );
  // }, [employees, employeeSearchText]);


  const isEmployeeVisible = (emp: any, startDate: string, endDate: string) => {
    if (!emp.status_date) return true;

    const exitStatuses = ["relieved", "terminated"];

    if (!exitStatuses.includes(emp.status?.toLowerCase())) {
      return true;
    }

    const relievedDate = new Date(emp.status_date);

    // ✅ KEY FIX: check overlap with range
    return relievedDate >= new Date(startDate);
  };

  const filteredEmployeeOptions = useMemo(() => {
    const lowerSearch = employeeSearchText.toLowerCase();

    const startDate = filterMode === "by_shift" ? shiftFilter.shift_date : employeeFilter.start_date;
    const endDate = filterMode === "by_shift" ? shiftFilter.shift_date : employeeFilter.end_date;

    const selectedEmp = employeeFilter.employee_id ? employees.find(e => e.id === employeeFilter.employee_id) : null;
    const isSelectedText = selectedEmp && employeeSearchText === `${selectedEmp.name} (${selectedEmp.employee_code})`;

    return employees.filter((emp) => {
      // ✅ FIXED LOGIC
      if (!isEmployeeVisible(emp, startDate, endDate)) return false;

      if (!employeeSearchText || isSelectedText) return true;

      return (
        emp.name.toLowerCase().includes(lowerSearch) ||
        emp.employee_code.toLowerCase().includes(lowerSearch)
      );
    });
  }, [
    employees,
    employeeSearchText,
    filterMode,
    shiftFilter.shift_date,
    employeeFilter.start_date,
    employeeFilter.end_date,
    employeeFilter.employee_id
  ]);
 
  const selectableRecordsList = getSelectableRecords();

  return (
    <div className="2xl:py-6">
      <div className="max-w-7xl">
        {/* Page Header */}
        <div className="px-4 sm:px-0 mb-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-lg sm:text-2xl font-bold text-gray-900 tracking-tight leading-tight">
                Time Stamp Management
              </h1>
              <p className="mt-0.5 text-xs sm:text-sm text-gray-500">
                View and edit employee clock records
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {unprocessedRecords.length > 0 && (
                <div className="relative group">
                  <span className="inline-flex items-center px-2.5 py-1.5 rounded-full xl:rounded-lg text-xs xl:text-sm font-semibold bg-amber-100 text-amber-800 border border-amber-200 cursor-help whitespace-nowrap">
                    <AlertTriangle className="w-3.5 h-3.5 mr-1 shrink-0" />
                    {unprocessedRecords.length} Unprocessed
                  </span>
                  <div className="absolute top-full right-0 mt-2 w-72 max-w-[calc(100vw-2rem)] bg-white border border-gray-200 rounded-xl shadow-xl z-50 hidden group-hover:block max-h-64 overflow-y-auto">
                    <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 text-xs font-bold text-gray-700 uppercase tracking-wider sticky top-0 rounded-t-xl">
                      Unprocessed Employees
                    </div>
                    <ul className="divide-y divide-gray-100">
                      {unprocessedRecords.map(r => (
                        <li key={r.id} className="px-3 py-2.5 flex justify-between items-center hover:bg-gray-50">
                          <span className="text-xs font-semibold text-gray-900">{r.employee_code}</span>
                          <span className="text-xs text-gray-500 truncate ml-3">{r.employee_name}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
              {/* Desktop-only Update button (xl+) */}
              {timeRecords.length > 0 && (
                <button
                  onClick={handleUpdateToAttendanceLogs}
                  disabled={loading || selectedRecordIds.size === 0}
                  className="hidden md:inline-flex items-center px-2 py-1 xl:px-4 xl:py-2 border border-transparent rounded-full xl:rounded-lg shadow-sm text-[13px] xl:text-sm xl:font-semibold text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  <Save className="h-4 w-4 mr-2 shrink-0" />
                  Update Selected ({selectedRecordIds.size})
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Filter Section */}
        <div className="bg-white shadow rounded-xl mb-4">
          {/* Pill Toggle */}
          <div className="px-4 pt-3 pb-3 border-b border-gray-100">
            <div className="flex rounded-xl bg-gray-100 p-1 gap-1">
              <button
                onClick={() => handleFilterModeChange("by_shift")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm font-semibold transition-all ${
                  filterMode === "by_shift"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-gray-600 hover:text-gray-800"
                }`}
              >
                <Clock className="h-4 w-4" />
                By Shift
              </button>
              <button
                onClick={() => handleFilterModeChange("by_employee")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm font-semibold transition-all ${
                  filterMode === "by_employee"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-gray-600 hover:text-gray-800"
                }`}
              >
                <User className="h-4 w-4" />
                By Employee
              </button>
            </div>
          </div>

          <div className="px-4 py-3 sm:px-6 sm:py-4">
            {filterMode === "by_shift" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Shift Name</label>
                  <select
                     value={shiftFilter.shift_id}
                     onChange={(e) =>
                       setShiftFilter((prev) => ({ ...prev, shift_id: e.target.value }))
                     }
                     className="block w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value="">Select Shift</option>
                    {shifts.map((shift) => (
                      <option key={shift.id} value={shift.id}>
                        {shift.name} ({formatTime12Hour(shift.start_time)} - {formatTime12Hour(shift.end_time)})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Shift Date</label>
                  <input
                    type="date"
                    value={shiftFilter.shift_date}
                    onChange={(e) =>
                      setShiftFilter((prev) => ({ ...prev, shift_date: e.target.value }))
                    }
                    className="block w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Start Date</label>
                  <input
                    type="date"
                    value={employeeFilter.start_date}
                    onChange={(e) => setEmployeeFilter((prev) => ({ ...prev, start_date: e.target.value }))}
                    className="block w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">End Date</label>
                  <input
                    type="date"
                    value={employeeFilter.end_date}
                    onChange={(e) => setEmployeeFilter((prev) => ({ ...prev, end_date: e.target.value }))}
                    min={employeeFilter.start_date}
                    className="block w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div className="relative col-span-3 sm:col-span-1">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Employee Search</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Search className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      value={employeeSearchText}
                      onChange={(e) => {
                        setEmployeeSearchText(e.target.value);
                        setShowEmployeeDropdown(true);
                        if (employeeFilter.employee_id) {
                          setEmployeeFilter((prev) => ({ ...prev, employee_id: "" }));
                        }
                      }}
                      onFocus={() => setShowEmployeeDropdown(true)}
                      onBlur={() => setTimeout(() => setShowEmployeeDropdown(false), 150)}
                      className="block w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="Search by name or code..."
                    />
                    {showEmployeeDropdown && filteredEmployeeOptions.length > 0 && (
                      <ul className="absolute z-50 top-full mt-1 max-h-60 w-full overflow-auto rounded-xl bg-white py-1 text-sm shadow-xl ring-1 ring-black ring-opacity-5 focus:outline-none">
                        {filteredEmployeeOptions.map((employee) => (
                          <li
                            key={employee.id}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setEmployeeFilter((prev) => ({ ...prev, employee_id: employee.id }));
                              setEmployeeSearchText(`${employee.name} (${employee.employee_code})`);
                              setShowEmployeeDropdown(false);
                            }}
                            className="relative cursor-pointer select-none py-2 pl-3 pr-9 text-gray-900 hover:bg-indigo-600 hover:text-white"
                          >
                            {employee.name} <span className="text-xs opacity-75 ml-1">({employee.employee_code})</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {hasLoaded && (
          <div className="bg-white shadow rounded-lg overflow-hidden">
            {/* TABS FOR VIEWS */}
            <div className="border-b border-gray-200">
              <nav className="flex gap-2 px-2.5 sm:px-4 pt-3 pb-2 overflow-x-auto scrollbar-hide" aria-label="Tabs">
                <button
                  onClick={() => setViewCategory("all")}
                  className={`flex-none inline-flex items-center gap-1.5 px-1.5 py-1.5 rounded-full text-xs font-semibold border transition-all whitespace-nowrap ${
                    viewCategory === "all" ? "bg-indigo-600 border-indigo-600 text-white shadow-sm" : "border-gray-200 text-gray-600 bg-white hover:border-indigo-300"
                  }`}
                >
                   All Records <span className={`ml-0.5 rounded-full px-1.5 text-[10px] font-bold ${viewCategory === "all" ? "bg-white/20" : "bg-indigo-100 text-indigo-700"}`}>{stats.all}</span>
                </button>
                <button
                  onClick={() => setViewCategory("regular")}
                  className={`flex-none inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all whitespace-nowrap ${
                    viewCategory === "regular" ? "bg-green-500 border-green-500 text-white shadow-sm" : "border-gray-200 text-gray-600 bg-white hover:border-green-300"
                  }`}
                >
                  <CheckSquare className="h-3 w-3" />
                  Regular {stats.regular > 0 && <span className={`ml-0.5 rounded-full px-1.5 text-[10px] font-bold ${viewCategory === "regular" ? "bg-white/20" : "bg-green-100 text-green-700"}`}>{stats.regular}</span>}
                </button>
                <button
                  onClick={() => setViewCategory("incomplete")}
                  className={`flex-none inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all whitespace-nowrap ${
                    viewCategory === "incomplete" ? "bg-amber-500 border-amber-500 text-white shadow-sm" : "border-gray-200 text-gray-600 bg-white hover:border-amber-300"
                  }`}
                >
                  <AlertTriangle className="h-3 w-3" />
                  Incomplete {stats.incomplete > 0 && <span className={`ml-0.5 rounded-full px-1.5 text-[10px] font-bold ${viewCategory === "incomplete" ? "bg-white/20" : "bg-amber-100 text-amber-700"}`}>{stats.incomplete}</span>}
                </button>
                <button
                  onClick={() => setViewCategory("wrong_shift")}
                  className={`flex-none inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all whitespace-nowrap ${
                    viewCategory === "wrong_shift" ? "bg-red-500 border-red-500 text-white shadow-sm" : "border-gray-200 text-gray-600 bg-white hover:border-red-300"
                  }`}
                >
                  <XCircle className="h-3 w-3" />
                  Wrong Shift {stats.wrongShift > 0 && <span className={`ml-0.5 rounded-full px-1.5 text-[10px] font-bold ${viewCategory === "wrong_shift" ? "bg-white/20" : "bg-red-100 text-red-700"}`}>{stats.wrongShift}</span>}
                </button>
                <button
                  onClick={() => setViewCategory("unscheduled")}
                  className={`flex-none inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all whitespace-nowrap ${
                    viewCategory === "unscheduled" ? "bg-purple-500 border-purple-500 text-white shadow-sm" : "border-gray-200 text-gray-600 bg-white hover:border-purple-300"
                  }`}
                >
                  <UserX className="h-3 w-3" />
                  Unscheduled {stats.unscheduled > 0 && <span className={`ml-0.5 rounded-full px-1.5 text-[10px] font-bold ${viewCategory === "unscheduled" ? "bg-white/20" : "bg-purple-100 text-purple-700"}`}>{stats.unscheduled}</span>}
                </button>
              </nav>
            </div>

            {/* Search + Filter Row */}
            <div className="px-4 py-2.5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 flex items-center gap-2">
                {filterMode === "by_shift" && (
                  <div className="flex-1 min-w-[200px] relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Search className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="block w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-gray-50"
                      placeholder="Search name / code..."
                    />
                  </div>
                )}
                
                <button
                  onClick={() => setShowMoreFilters(!showMoreFilters)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border transition-colors shrink-0 ${
                    showMoreFilters || locationFilter !== "all" || processFilter !== "all"
                      ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                      : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <Filter className="h-4 w-4" />
                  <span>{showMoreFilters ? 'Hide Filters' : 'More Filters'}</span>
                  {(locationFilter !== "all" || processFilter !== "all") && (
                    <span className="flex h-2 w-2 rounded-full bg-indigo-600 absolute top-0 right-0 -mt-1 -mr-1"></span>
                  )}
                </button>
              </div>
              
              {/* Filter Dropdowns */}
              {showMoreFilters && (
                <div className="flex items-center gap-2 shrink-0 overflow-x-auto w-full sm:w-auto">
                  <select
                    value={locationFilter}
                    onChange={(e) => setLocationFilter(e.target.value as LocationScenarioFilter)}
                    className="text-xs border border-gray-200 rounded-lg py-2.5 pl-2 pr-6 bg-gray-50 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-700 font-medium whitespace-nowrap"
                  >
                    <option value="all">All Locations</option>
                    <option value="in_out_outside">IN & OUT outside</option>
                    <option value="in_outside_in_office">Multiple IN (Outside -&gt; Office)</option>
                    <option value="in_office_out_outside">IN office, OUT outside</option>
                    <option value="outside_only">IN outside (No OUT)</option>
                  </select>

                  <select
                    value={processFilter}
                    onChange={(e) => setProcessFilter(e.target.value as any)}
                    className="text-xs border border-gray-200 rounded-lg py-2.5 pl-2 pr-6 bg-gray-50 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-700 font-medium"
                  >
                    <option value="all">All Records</option>
                    <option value="processed">Processed</option>
                    <option value="unprocessed">Unprocessed</option>
                  </select>
                </div>
              )}
            </div>

            {error && (
              <div className="px-4 py-3 sm:px-6 sm:py-4 bg-red-50 border-b border-red-200">
                <div className="flex items-center text-red-700">
                  <AlertCircle className="h-5 w-5 mr-2" />
                  <span className="text-sm">{error}</span>
                </div>
              </div>
            )}

            {loading ? (
              <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
              </div>
            ) : filteredRecords.length === 0 ? (
              <div className="text-center py-12">
                <Clock className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">
                  No records found in this view
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Try adjusting your filters or switching tabs.
                </p>
              </div>
            ) : (
              <>
                {/* Select All + Count + Update action bar (mobile/tablet) */}
                <div className="xl:hidden flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-gray-50/80">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectableRecordsList.length > 0 && selectedRecordIds.size === selectableRecordsList.length}
                      onChange={toggleAllSelection}
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                    />
                    <span className="text-xs font-semibold text-gray-600">Select All</span>
                  </label>
                  {/* <span className="text-xs text-gray-400 font-medium md:hidden">{filteredRecords.length} records</span> */}
                  {timeRecords.length > 0 && (
                    <button
                      onClick={handleUpdateToAttendanceLogs}
                      disabled={loading || selectedRecordIds.size === 0}
                      className="inline-flex md:hidden items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
                    >
                      <Save className="h-3.5 w-3.5" />
                      Update ({selectedRecordIds.size})
                    </button>
                  )}
                </div>

                {/* Mobile & Tablet Card View (rendered on screens < lg) */}
                <div className="block xl:hidden p-3 space-y-3">
                  {filteredRecords.map((record) => {
                    const isIncomplete = !record.clock_in || !record.clock_out;
                    const isFromTimestamp = record.id.startsWith("ts_");
                    const requestInfo = requestDetails[record.id];
                    const isPendingRequest = Array.isArray(requestInfo)
                      ? requestInfo.some(req => req.status === "pending")
                      : requestInfo?.status === "pending";
                    const isSelectable = !isIncomplete && !isPendingRequest;

                    return (() => {
                      const borderColor = isIncomplete
                        ? "border-l-amber-400"
                        : record.shift_status === "wrong_shift"
                        ? "border-l-red-400"
                        : record.shift_status === "unscheduled"
                        ? "border-l-purple-400"
                        : "border-l-green-400";

                      return (
                        <div
                          key={record.id}
                          className={`bg-white rounded-xl border border-gray-300 shadow-sm  overflow-hidden ${selectedRecordIds.has(record.id) ? "ring-2 ring-indigo-400 ring-offset-1" : ""}`}
                        >
                          {/* Card Header */}
                          <div className="px-4 pt-3 pb-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-start gap-2.5 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={selectedRecordIds.has(record.id)}
                                  disabled={!isSelectable}
                                  onChange={() => toggleRecordSelection(record.id)}
                                  className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                                />
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-sm font-bold text-gray-900 leading-tight">{record.employee_name}</span>
                                    {record.has_edits && (
                                      <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-blue-100 text-blue-700">Edited</span>
                                    )}
                                    {isFromTimestamp && !record.has_edits && (
                                      <span className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold border border-amber-200 bg-amber-50 text-amber-700">#</span>
                                    )}
                                  </div>
                                  <p className="text-xs text-gray-600 mt-0.5 truncate">{record.employee_code} · {record.department}</p>
                                </div>
                              </div>
                              <button
                                onClick={() => handleEditClick(record)}
                                className="shrink-0 p-1.5 flex items-center gap-1 text-[12px] rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
                                title="Edit record"
                              >
                                <Edit className="h-3.5 w-3.5" /> Edit
                              </button>
                            </div>

                            {/* Status Badges */}
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {isIncomplete && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800">
                                  <AlertTriangle className="h-3 w-3" /> Incomplete
                                </span>
                              )}
                              {record.shift_status === "wrong_shift" && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 text-red-800">
                                  <XCircle className="h-3 w-3" /> Wrong Shift
                                </span>
                              )}
                              {record.shift_status === "unscheduled" && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-purple-100 text-purple-800">
                                  <UserX className="h-3 w-3" /> Unscheduled
                                </span>
                              )}
                              {!isIncomplete && record.shift_status !== "wrong_shift" && record.shift_status !== "unscheduled" && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-100 text-green-800">
                                  Regular
                                </span>
                              )}
                              {filterMode === "by_employee" && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-600">
                                  {formatDateOnly(record.date)}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Clock In / Out Row */}
                          <div className="grid grid-cols-2 border-t border-gray-300 divide-x divide-gray-300">
                            <div className="px-4 py-2.5">
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-800 mb-0.5">Clock In</p>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <Clock className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                                <span className="text-xs font-semibold text-gray-800">{formatDateTime(record.clock_in)}</span>
                                {record.clock_in_is_outside && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-fuchsia-100 text-fuchsia-800">
                                    Outside
                                  </span>
                                )}
                                {record.location_scenario === 'in_outside_in_office' && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-amber-100 text-amber-800" title="Multiple IN punches (Outside -&gt; Office)">
                                    Multiple IN
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="px-4 py-2.5">
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-800 mb-0.5">Clock Out</p>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <Clock className={`h-3.5 w-3.5 shrink-0 ${record.clock_out ? "text-indigo-400" : "text-gray-400"}`} />
                                <span className={`text-xs font-semibold ${record.clock_out ? "text-gray-800" : "text-gray-400"}`}>{formatDateTime(record.clock_out)}</span>
                                {record.clock_out_is_outside && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-fuchsia-100 text-fuchsia-800">
                                    Outside
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Shift Info */}
                          {(viewCategory === "wrong_shift" || viewCategory === "unscheduled") && (
                            <div className="px-4 py-2 border-t border-gray-100 bg-gray-50/60 flex flex-col gap-0.5">
                              <span className={`text-[11px] font-semibold ${viewCategory === "wrong_shift" ? "text-red-600" : "text-purple-600"}`}>
                                Clocked In: {record.actual_shift || shifts.find(s => s.id === record.matched_shift_id)?.name || "Unknown"}
                              </span>
                              <span className="text-[11px] text-emerald-700">Assigned: {record.assigned_shifts?.join(", ") || "None"}</span>
                            </div>
                          )}

                          {/* Request badges */}
                          {requestInfo && Array.isArray(requestInfo) && requestInfo.length > 0 && (
                            <div className="px-4 py-2 border-t border-gray-100 flex flex-wrap gap-1.5">
                               <p className="text-[10px] font-semibold uppercase mt-0.5 tracking-wider text-gray-600">Request Status</p>

                              {requestInfo.map((req, idx) => (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => {
                                    if (req.status === "pending") {
                                      navigate(req.type === "Gate Pass" ? "/dashboard/gate-passes" : "/dashboard/permissions/approval");
                                    }
                                  }}
                                  className={`inline-flex items-center px-2 py-0.5 border rounded-full text-[10px] font-semibold transition-colors ${
                                    req.status === "pending"
                                      ? "bg-yellow-50 text-yellow-800 border-yellow-200 hover:bg-yellow-100"
                                      : "bg-green-50 text-green-800 border-green-200"
                                  }`}
                                >
                                 {req.type} ({req.status})
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  )}
                </div>

                {/* Desktop Table View (rendered on screens >= lg) */}
                <div className="hidden xl:block overflow-x-auto w-full max-w-full">
                  <table className="min-w-[900px] w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 sm:px-0 xl:px-2 sm:py-2 text-left w-12">
                          <button
                            onClick={toggleAllSelection}
                            className="text-gray-500 hover:text-gray-700"
                            title="Select all actionable records"
                          >
                            {selectableRecordsList.length > 0 &&
                            selectedRecordIds.size === selectableRecordsList.length ? (
                              <CheckSquare className="h-5 w-5 text-indigo-600 mt-2" />
                            ) : (
                              <Square className="h-5 w-5 mt-2" />
                            )}
                          </button>
                        </th>
                        <th className="px-4 py-3 sm:px-2 sm:py-3.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Employee</th>
                        <th className="px-4 py-3 sm:px-2 sm:py-3.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Shift Status</th>
                        {filterMode === "by_employee" && (
                          <th className="px-4 py-3 sm:px-2 sm:py-3.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                        )}
                        {(viewCategory === "wrong_shift" || viewCategory === "unscheduled") && (
                          <th className="px-4 py-3 sm:px-2 sm:py-3.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Shift Info</th>
                        )}
                        <th className="px-4 py-3 sm:px-0 2xl:px-2 sm:py-3.5 text-left text-xs font-medium text-gray-500 2xl:uppercase 2xl:tracking-wider">Clock-In</th>
                        <th className="px-4 py-3 sm:px-0 2xl:px-2 sm:py-3.5 text-left text-xs font-medium text-gray-500 2xl:uppercase 2xl:tracking-wider">Clock-Out</th>
                        <th className="px-4 py-3 sm:px-0 2xl:px-2 sm:py-3.5 text-left text-xs font-medium text-gray-500 2xl:uppercase 2xl:tracking-wider">Request Status</th>
                        <th className="px-4 py-3 sm:px-0 2xl:px-2 sm:py-3.5 text-left text-xs font-medium text-gray-500 2xl:uppercase 2xl:tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredRecords.map((record) => {
                        const isIncomplete = !record.clock_in || !record.clock_out;
                        const isFromTimestamp = record.id.startsWith("ts_");
                        const requestInfo = requestDetails[record.id];
                        const isPendingRequest = requestInfo?.status === "pending";
                        const isSelectable = !isIncomplete && !isPendingRequest;

                        const rowClasses = [
                          "hover:bg-gray-50 transition-colors",
                          record.has_edits ? "bg-blue-50" : "",
                          selectedRecordIds.has(record.id) ? "bg-indigo-50" : "",
                        ].filter(Boolean).join(" ");

                        return (
                          <tr key={record.id} className={rowClasses}>
                            <td className="px-4 py-3 sm:px-3 sm:py-4 whitespace-nowrap">
                              <input
                                type="checkbox"
                                checked={selectedRecordIds.has(record.id)}
                                disabled={!isSelectable}
                                onChange={() => toggleRecordSelection(record.id)}
                                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                                title={
                                  isPendingRequest ? "Cannot select records with pending requests"
                                    : isIncomplete ? "Cannot select incomplete records"
                                    : "Select to update"
                                }
                              />
                            </td>

                            <td className="px-4 py-3 sm:px-0 2xl:px-2 sm:py-4 whitespace-nowrap">
                              <div className="flex flex-col">
                                <div className="text-sm font-medium text-gray-900 flex items-center">
                                  {record.employee_name}
                                  {record.has_edits && (
                                    <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800" title={`Edited ${record.edit_count} time(s)`}></span>
                                  )}
                                  {isFromTimestamp && !record.has_edits && (
                                    <span className="ml-2 inline-flex items-center px-1.5 rounded-full text-[10px] font-medium border text-amber-800" title="Unprocessed record from raw timestamp data">
                                      #
                                    </span>
                                  )}
                                </div>
                                <div className="text-sm text-gray-500">{record.employee_code}</div>
                                <div className="text-xs text-gray-400">{record.department}</div>
                              </div>
                            </td>
                            <td className="px-4 py-3 sm:px-0 2xl:px-2 sm:py-4 text-sm max-w-[240px]">
                              <div className="flex flex-col gap-1.5 items-start">
                                {isIncomplete && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                                    Incomplete
                                  </span>
                                )}

                                {record.shift_status === "wrong_shift" && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                                    Wrong Shift
                                  </span>
                                )}

                                {record.shift_status === "unscheduled" && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                                    Unscheduled
                                  </span>
                                )}

                                {!isIncomplete &&
                                  record.shift_status !== "wrong_shift" &&
                                  record.shift_status !== "unscheduled" &&
                                  record.status !== "Pending Approval" && (
                                    <div className="flex flex-col mt-1">
                                      <span className="text-green-600 font-medium flex items-center gap-1">
                                        Regular
                                      </span>
                                      {record.assigned_shifts &&
                                        record.assigned_shifts.length > 0 && (
                                          <span className="text-xs text-gray-500 mt-0.5">
                                            {record.assigned_shifts.join(", ")}
                                          </span>
                                        )}
                                    </div>
                                  )}
                              </div>
                            </td>

                            {filterMode === "by_employee" && (
                              <td className="px-4 py-3 sm:px-0 2xl:px-2 sm:py-4 whitespace-nowrap text-[12px] 2xl:text-sm text-gray-900">
                                {formatDateOnly(record.date)}
                              </td>
                            )}

                            {(viewCategory === "wrong_shift" || viewCategory === "unscheduled") && (
                              <td className="px-4 py-3 sm:px-0 2xl:px-2  sm:py-4 whitespace-nowrap">
                                <div className="flex flex-col text-xs">
                                  <span className={`${viewCategory === "wrong_shift" ? "text-red-600" : "text-purple-600"} font-medium`}>
                                    Clocked In: {record.actual_shift || shifts.find((s) => s.id === record.matched_shift_id)?.name || "Unknown Shift"}
                                  </span>
                                  {viewCategory === "wrong_shift" ? (
                                    <span className="text-emerald-800 flex items-center mt-1">
                                      Assigned: {record.assigned_shifts?.join(", ") || "None"}
                                    </span>
                                  ) : (
                                    <span className="text-gray-400 flex items-center mt-1">
                                      Assigned: None
                                    </span>
                                  )}
                                </div>
                              </td>
                            )}

                            <td className="px-4 py-3 sm:px-0 2xl:px-2 sm:py-4 whitespace-nowrap text-[12px] 2xl:text-sm text-gray-900">
                              <div className="flex flex-col gap-1.5 items-start">
                                <span>{formatDateTime(record.clock_in)}</span>
                                {(record.clock_in_is_outside || record.location_scenario === 'in_outside_in_office') && (
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    {record.clock_in_is_outside && (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-fuchsia-100 text-fuchsia-800 border border-fuchsia-200">
                                        Outside
                                      </span>
                                    )}
                                    {record.location_scenario === 'in_outside_in_office' && (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-200" title="Multiple IN punches (Outside -&gt; Office)">
                                        Multiple IN
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 sm:px-0 2xl:px-2 sm:py-4 whitespace-nowrap text-[12px] 2xl:text-sm text-gray-900">
                              <div className="flex flex-col gap-1.5 items-start">
                                <span>{formatDateTime(record.clock_out)}</span>
                                {record.clock_out_is_outside && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-fuchsia-100 text-fuchsia-800 border border-fuchsia-200">
                                    Outside
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 sm:px-0 2xl:px-2 sm:py-4 ">
                              {requestInfo && Array.isArray(requestInfo) ? (
                                <div className="flex flex-col gap-1.5">
                                  {requestInfo.map((req, idx) => (
                                    <button
                                      key={idx}
                                      type="button"
                                      onClick={(e) => {
                                        if (req.status === 'pending') {
                                          e.stopPropagation();
                                          const path = req.type === 'Gate Pass'
                                            ? '/dashboard/gate-passes'
                                            : '/dashboard/permissions/approval';
                                          navigate(path);
                                        }
                                      }}
                                      className={`inline-flex items-center w-fit px-2 py-1 border rounded text-xs font-medium transition-colors ${
                                        req.status === 'pending'
                                          ? 'bg-yellow-50 text-yellow-800 border-yellow-200 hover:bg-yellow-100 cursor-pointer'
                                          : req.status === 'approved'
                                          ? 'bg-green-50 text-green-800 border-green-200 cursor-default'
                                          : 'bg-gray-50 text-gray-800 border-gray-200 cursor-default'
                                      }`}
                                      title={`Date: ${req.startDate === req.endDate ? req.startDate : `${req.startDate} to ${req.endDate}`}\nTime: ${req.startTime} - ${req.endTime}`}
                                    >
                                      {req.type} {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                                      {req.status === 'pending' && <ExternalLink className="h-3 w-3 ml-1" />}
                                    </button>
                                  ))}
                                </div>
                              ) : (
                                <span className="inline-flex items-center px-2 py-1 border rounded text-xs font-medium bg-gray-50 text-gray-800 border-gray-200">
                                  -
                                </span>
                              )}
                            </td>

                            <td className="px-4 py-3 sm:px-2 sm:py-4 whitespace-nowrap text-sm font-medium">
                              <button
                                onClick={() => handleEditClick(record)}
                                className="text-indigo-600 hover:text-indigo-900 inline-flex items-center"
                              >
                                <Edit className="h-4 w-4 mr-1" />
                                Edit
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </div>

     {selectedRecord && (
      <EditTimeStampModal
        record={selectedRecord}
        isOpen={isEditModalOpen}
        hasPendingRequest={requestDetails[selectedRecord.id]?.status === 'pending'} 
        onClose={() => {
          setIsEditModalOpen(false);
          setSelectedRecord(null);
        }}
        onSuccess={handleEditSuccess}
      />
    )}

      <AddTimeStampModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} onSuccess={handleAddSuccess} />
    </div>
  );
}