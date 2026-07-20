import { useState, useEffect } from 'react';
import { useEmployeesStore } from '../../../stores/employeesStore';
import { useTenant } from '../../../contexts/TenantContext';
import { supabase } from '../../../lib/supabase';
import {
  Search,
  Users,
  UserX,
  ArrowRight,
  Sparkles,
  X
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function ReportingPage() {
  const { currentTenant } = useTenant();
  const { items: employees, fetchEmployees, updateEmployee, loading: storeLoading } = useEmployeesStore();

  const [loading, setLoading] = useState(false);
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [selectedReportingHeads, setSelectedReportingHeads] = useState<string[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);

  // Search & Filter state
  const [empSearch, setEmpSearch] = useState('');
  const [headSearch, setHeadSearch] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [assignmentFilter, setAssignmentFilter] = useState<'all' | 'assigned' | 'not_assigned'>('all');
  const [leftPanelType, setLeftPanelType] = useState<'employee' | 'reporting_head'>('employee');
  // When a reporting head is selected on the right, filter the left to show only their subordinates
  const [selectedHeadFilter, setSelectedHeadFilter] = useState<string>('');

  useEffect(() => {
    fetchEmployees();

    // Fetch user profiles to correctly map Employee/Admin/HR roles within the current tenant only
    const fetchProfiles = async () => {
      if (!currentTenant?.id) return;
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('tenant_id', currentTenant.id);
      if (!error && data) {
        setProfiles(data);
      }
    };
    fetchProfiles();
  }, [fetchEmployees, currentTenant]);

  // Extract unique departments for filtering
  const departments = Array.from(
    new Set(employees.map(emp => emp.department).filter(Boolean))
  ) as string[];

  // Helper to retrieve employee role from profiles or store roles relation
  const getEmployeeRole = (emp: any) => {
    if (!emp) return 'Employee';
    const profile = profiles.find(p => p.email?.toLowerCase() === emp.email?.toLowerCase());
    if (profile?.user_role) return profile.user_role;
    if (emp.is_reporting_head === true) return 'Reporting Head';
    return emp.role || 'Employee';
  };

  // Helper to check if an employee is a potential reporting head:
  // Role name includes 'admin' or 'hr'
  const isPotentialHead = (emp: any) => {
    if (!emp) return false;
    const role = getEmployeeRole(emp).toLowerCase();
    return (
      role.includes('admin') ||
      role.includes('hr')
    );
  };

  // Filter Employees (Left Side)
  const filteredEmployees = employees.filter(emp => {
    // Search by name or code
    const nameMatch = emp.name.toLowerCase().includes(empSearch.toLowerCase());
    const codeMatch = (emp.employee_code || '').toLowerCase().includes(empSearch.toLowerCase());
    const matchesSearch = nameMatch || codeMatch;

    // Filter by department
    const matchesDept = selectedDept === '' || emp.department === selectedDept;

    // Filter by Assignment Status
    const matchesAssignment = (() => {
      const hasAssignment = emp.reporting_to && Array.isArray(emp.reporting_to) && emp.reporting_to.length > 0;
      if (assignmentFilter === 'assigned') return hasAssignment;
      if (assignmentFilter === 'not_assigned') return !hasAssignment;
      return true;
    })();

    // Filter by selected left panel type (Employees vs Reporting Heads)
    const isMatchingType = leftPanelType === 'reporting_head' ? emp.is_reporting_head === true : !emp.is_reporting_head;

    // Filter by selected head (only show employees who report to that head)
    const matchesHeadFilter = selectedHeadFilter === '' || (() => {
      const ids = Array.isArray(emp.reporting_to)
        ? emp.reporting_to
        : emp.reporting_to ? [emp.reporting_to] : [];
      return ids.includes(selectedHeadFilter);
    })();

    // Only show Active or Rejoin employees
    const statusLower = (emp.status || '').toLowerCase();
    const isActiveOrRejoin = statusLower === 'active' || statusLower === 'rejoin';

    return isActiveOrRejoin && matchesSearch && matchesDept && matchesAssignment && isMatchingType && matchesHeadFilter;
  });

  // Filter and merge potential reporting heads from both Profiles (Admin/HR) and Employees (is_reporting_head === true)
  const potentialHeads = (() => {
    const list: any[] = [];
    const addedEmails = new Set<string>();

    // 1. Add all active employees in the current tenant whose role is Admin, HR Team, or Reporting Head (ONLY IF listing Employees on left panel)
    if (leftPanelType === 'employee') {
      employees.forEach(emp => {
        // Only include if they exist in the user management profiles
        const hasProfile = profiles.some(p => p.email?.toLowerCase() === emp.email?.toLowerCase());
        if (!hasProfile) return;

        const role = getEmployeeRole(emp);
        const roleLower = role.toLowerCase();
        const isHeadRole = roleLower.includes('admin') || roleLower.includes('hr') || roleLower.includes('reporting');

        if (isHeadRole) {
          const status = (emp.status || '').toLowerCase();
          const isValidStatus = status === 'active' || status === 'rejoin';

          // Standard employees must be active or rejoined to be listed
          if (roleLower.includes('admin') || roleLower.includes('hr') || isValidStatus) {
            list.push({
              id: emp.id,
              name: emp.name,
              email: emp.email,
              department: emp.department,
              user_role: role,
              is_reporting_head: emp.is_reporting_head || false,
              is_employee: true
            });
            if (emp.email) {
              addedEmails.add(emp.email.toLowerCase());
            }
          }
        }
      });
    }

    // 2. Add all Admin, HR Team, and Reporting Head profiles under the current tenant that have not been added yet
    profiles.forEach(profile => {
      const role = profile.user_role || '';
      const roleLower = role.toLowerCase();
      
      // If we are showing "Reporting Heads" in the left panel, we only want to list out HR Team and Admin on the right
      const isHeadRole = leftPanelType === 'reporting_head'
        ? (roleLower.includes('admin') || roleLower.includes('hr'))
        : (roleLower.includes('admin') || roleLower.includes('hr') || roleLower.includes('reporting'));
      
      if (!isHeadRole) return;

      const emailLower = (profile.email || '').toLowerCase();
      if (emailLower && addedEmails.has(emailLower)) return;

      // Find if they have an employee record in the current tenant
      const empRecord = employees.find(e => e.email?.toLowerCase() === emailLower);

      // Hide active reporting heads if we are assigning managers for a reporting head
      if (leftPanelType === 'reporting_head' && empRecord?.is_reporting_head) {
        return;
      }

      list.push({
        id: empRecord ? empRecord.id : profile.id, // Use employee ID if exists, otherwise profile ID
        name: profile.full_name || empRecord?.name || profile.email?.split('@')[0] || 'No Name',
        email: profile.email,
        department: empRecord?.department || 'General',
        user_role: role,
        is_reporting_head: empRecord?.is_reporting_head || false,
        is_employee: !!empRecord
      });
      
      if (emailLower) {
        addedEmails.add(emailLower);
      }
    });

    // Apply head search filter
    return list.filter(head => {
      const nameMatch = (head.name || '').toLowerCase().includes(headSearch.toLowerCase());
      const emailMatch = (head.email || '').toLowerCase().includes(headSearch.toLowerCase());
      return nameMatch || emailMatch;
    });
  })();

  // Calculate statistics
  const totalCount = employees.filter(emp => !emp.is_reporting_head).length;
  const headsCount = potentialHeads.length;
  const assignedCount = employees.filter(emp => 
    !emp.is_reporting_head && 
    emp.reporting_to && 
    (Array.isArray(emp.reporting_to) ? emp.reporting_to.length > 0 : !!emp.reporting_to)
  ).length;
  const unassignedCount = totalCount - assignedCount;

  // Toggle single employee selection
  const handleSelectEmployee = (id: string) => {
    setSelectedEmployees(prev => {
      const next = prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id];

      // When exactly one employee is selected, pre-highlight their currently assigned heads on the right
      if (next.length === 1) {
        const emp = employees.find(e => e.id === next[0]);
        const assignedIds = Array.isArray(emp?.reporting_to)
          ? emp!.reporting_to as string[]
          : emp?.reporting_to ? [emp.reporting_to as string] : [];
        setSelectedReportingHeads(assignedIds);
      } else {
        // Multiple selected — clear pre-highlight so user picks intentionally
        setSelectedReportingHeads([]);
      }

      return next;
    });
  };

  // Select / Deselect All filtered employees
  const handleSelectAllFiltered = () => {
    const allFilteredIds = filteredEmployees.map(emp => emp.id);
    const areAllSelected = allFilteredIds.every(id => selectedEmployees.includes(id));

    if (areAllSelected) {
      setSelectedEmployees(prev => prev.filter(id => !allFilteredIds.includes(id)));
    } else {
      setSelectedEmployees(prev => {
        const newSelection = [...prev];
        allFilteredIds.forEach(id => {
          if (!newSelection.includes(id)) {
            newSelection.push(id);
          }
        });
        return newSelection;
      });
    }
  };

  // Handle removing a single manager from an employee's list of reporting heads
  const handleRemoveSingleManager = async (empId: string, managerId: string) => {
    const emp = employees.find(e => e.id === empId);
    if (!emp) return;

    const currentManagers = Array.isArray(emp.reporting_to)
      ? emp.reporting_to
      : emp.reporting_to
        ? [emp.reporting_to]
        : [];

    if (currentManagers.length <= 1) {
      toast.error(`"${emp.name}" must have at least one Reporting Head.`);
      return;
    }

    const updatedManagers = currentManagers.filter(id => id !== managerId);

    setLoading(true);
    try {
      await updateEmployee(empId, { 
        reporting_to: updatedManagers
      });
      toast.success(`Removed manager assignment`);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Failed to remove manager');
    } finally {
      setLoading(false);
    }
  };

  // Handle bulk assignment of selected employees to selected reporting heads
  const handleAssignReportingHead = async () => {
    if (selectedEmployees.length === 0) {
      toast.error('Please select at least one employee');
      return;
    }
    if (selectedReportingHeads.length === 0) {
      toast.error('Please select at least one reporting head from the right list');
      return;
    }

    // Resolve each headId to an active employee record or profile ID
    const selectedHeads = selectedReportingHeads.map(headId => {
      let emp = employees.find(e => e.id === headId);
      const profile = profiles.find(p => p.id === headId);
      
      if (!emp && profile) {
        emp = employees.find(e => e.email?.toLowerCase() === profile.email?.toLowerCase());
      }
      
      // Extract resolved role (check profile first, then employee, fallback to Employee)
      const role = (profile?.user_role || emp?.role || 'Employee').toLowerCase();
      const isAdminOrHR = role.includes('admin') || role.includes('hr');

      if (isAdminOrHR) {
        // Admins and HR Team members bypass any employee status checks.
        // Return employee record ID if available, otherwise fallback to their profile ID.
        return {
          id: emp ? emp.id : (profile ? profile.id : headId),
          name: emp ? emp.name : (profile ? (profile.full_name || profile.email) : 'Admin')
        };
      } else {
        // Standard Employees must have an employee record and status 'Active' or 'Rejoin'
        if (!emp) return null;
        const status = (emp.status || '').toLowerCase();
        const isValidStatus = status === 'active' || status === 'rejoin';
        return isValidStatus ? { id: emp.id, name: emp.name } : null;
      }
    }).filter(Boolean) as any[];

    if (selectedHeads.length === 0) {
      toast.error('The selected reporting head(s) must be active or rejoined employees (Admins/HR Team members are always allowed regardless of status).');
      return;
    }

    const selectedHeadIds = selectedHeads.map(h => h.id);

    setLoading(true);
    try {
      // Loop over and update each employee in bulk with the list of manager IDs
      const updatePromises = selectedEmployees.map(empId =>
        updateEmployee(empId, { reporting_to: selectedHeadIds })
      );

      await Promise.all(updatePromises);
      toast.success(`Successfully assigned reporting head(s) to ${selectedEmployees.length} employee(s)`);
      setSelectedEmployees([]);
      setSelectedReportingHeads([]);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Failed to assign reporting head');
    } finally {
      setLoading(false);
    }
  };

  // Handle removing reporting head for selected employees
  const handleRemoveReportingHead = async (empIds: string[]) => {
    if (empIds.length === 0) return;

    // Check if any of the selected employees currently report to ONLY ONE manager/head/admin/hr team
    const singleManagerEmp = empIds.find(empId => {
      const emp = employees.find(e => e.id === empId);
      const managerCount = emp?.reporting_to ? (Array.isArray(emp.reporting_to) ? emp.reporting_to.length : 1) : 0;
      return managerCount === 1;
    });

    if (singleManagerEmp) {
      const emp = employees.find(e => e.id === singleManagerEmp);
      toast.error(`"${emp?.name || 'Selected Employee'}" must have at least one manager. To change: select them on the left, choose a new manager on the right, and click "Assign Head".`);
      return;
    }

    const confirmClear = window.confirm(`Are you sure you want to clear the reporting head assignment for ${empIds.length} employee(s)?`);
    if (!confirmClear) return;

    setLoading(true);
    try {
      const updatePromises = empIds.map(empId =>
        updateEmployee(empId, { reporting_to: null })
      );

      await Promise.all(updatePromises);
      toast.success(`Cleared reporting head assignment for ${empIds.length} employee(s)`);
      // Clean up selections
      setSelectedEmployees(prev => prev.filter(id => !empIds.includes(id)));
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Failed to remove reporting head');
    } finally {
      setLoading(false);
    }
  };

  // Dynamic HSL avatar generator to add beautiful, colorful visual flair
  const getAvatarStyle = (name: string) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash % 360);
    return {
      backgroundColor: `hsl(${h}, 70%, 90%)`,
      color: `hsl(${h}, 80%, 30%)`,
    };
  };

  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return (name[0] || '').toUpperCase();
  };

  return (
    <div className="min-h-screen  pb-24">
      {/* HEADER SECTION */}
      <div className="bg-white border-b border-gray-200 px-6 py-5 shadow-sm rounded-lg">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Users className="h-7 w-7 text-indigo-600" />
              Employee Reporting Setup
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Easily manage corporate hierarchies by assigning team members to their managers, leaders, or HR supervisors.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
              <Sparkles className="h-3.5 w-3.5" />
              Bulk Assignment Mode
            </span>
          </div>
        </div>

        {/* STATS OVERVIEW CARDS */}
        {/* <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <div className="bg-gradient-to-br from-indigo-50 to-indigo-100/50 border border-indigo-100/80 rounded-2xl p-4 transition-all hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-indigo-700 uppercase tracking-wide">Total Employees</span>
              <Users className="h-5 w-5 text-indigo-500" />
            </div>
            <div className="text-2xl font-extrabold text-indigo-900 mt-2">{totalCount}</div>
          </div>

          <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 border border-emerald-100/80 rounded-2xl p-4 transition-all hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-700 uppercase tracking-wide">Assigned Heads</span>
              <UserCheck className="h-5 w-5 text-emerald-500" />
            </div>
            <div className="text-2xl font-extrabold text-emerald-900 mt-2">{assignedCount}</div>
          </div>

          <div className="bg-gradient-to-br from-amber-50 to-amber-100/50 border border-amber-100/80 rounded-2xl p-4 transition-all hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-700 uppercase tracking-wide">Unassigned</span>
              <UserX className="h-5 w-5 text-amber-500" />
            </div>
            <div className="text-2xl font-extrabold text-amber-900 mt-2">{unassignedCount}</div>
          </div>

          <div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-100/80 rounded-2xl p-4 transition-all hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-purple-700 uppercase tracking-wide">Reporting Heads</span>
              <TrendingUp className="h-5 w-5 text-purple-500" />
            </div>
            <div className="text-2xl font-extrabold text-purple-900 mt-2">{headsCount}</div>
          </div>
        </div> */}
      </div>

      {/* SPLIT LAYOUT AREA */}
      <div className="max-w-7xl mx-auto  py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

          {/* LEFT SIDE: EMPLOYEES PANEL (col-span 7) */}
          <div className="lg:col-span-8 bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <span className="inline-flex items-center justify-center h-7 w-7 rounded-lg bg-indigo-50 text-indigo-600 font-semibold text-sm">1</span>
                  Select Employees
                </h2>
                {selectedEmployees.length > 0 && (
                  <button
                    onClick={() => setSelectedEmployees([])}
                    className="text-xs font-medium text-red-600 hover:text-red-700 transition-colors flex items-center gap-1"
                  >
                    Clear Selection ({selectedEmployees.length})
                  </button>
                )}
              </div>

              {/* SEGMENT SWITCHER */}
              <div className="flex bg-gray-100 p-1 rounded-xl mb-4 border border-gray-200/50">
                <button
                  onClick={() => {
                    setLeftPanelType('employee');
                    setSelectedEmployees([]);
                  }}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                    leftPanelType === 'employee'
                      ? 'bg-white text-indigo-600 shadow-sm border border-gray-200/20'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Employees
                </button>
                <button
                  onClick={() => {
                    setLeftPanelType('reporting_head');
                    setSelectedEmployees([]);
                  }}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                    leftPanelType === 'reporting_head'
                      ? 'bg-white text-indigo-600 shadow-sm border border-gray-200/20'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Reporting Heads
                </button>
              </div>

              {/* SEARCH & FILTERS BAR */}
              <div className="flex flex-col md:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search by employee name or code..."
                    value={empSearch}
                    onChange={(e) => setEmpSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div className="flex gap-2">
                  <div className="relative min-w-[140px]">
                    <select
                      value={selectedDept}
                      onChange={(e) => setSelectedDept(e.target.value)}
                      className="w-full pl-3 pr-8 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">All Departments</option>
                      {departments.map(dept => (
                        <option key={dept} value={dept}>{dept}</option>
                      ))}
                    </select>
                  </div>

                  <div className="relative min-w-[140px]">
                    <select
                      value={assignmentFilter}
                      onChange={(e) => setAssignmentFilter(e.target.value as any)}
                      className="w-fit pl-3 pr-4 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-gray-700"
                    >
                      <option value="all">All</option>
                      <option value="assigned">Assigned</option>
                      <option value="not_assigned">Not Assigned</option>
                    </select>
                  </div>
                </div>
              </div>
              {/* Active head filter badge */}
              {selectedHeadFilter && (() => {
                const head = potentialHeads.find(h => h.id === selectedHeadFilter);
                return head ? (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700 border border-indigo-200">
                      Showing subordinates of: <strong>{head.name}</strong>
                      <button
                        onClick={() => setSelectedHeadFilter('')}
                        className="ml-1 text-indigo-400 hover:text-indigo-700 transition-colors"
                        title="Clear head filter"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  </div>
                ) : null;
              })()}
            </div>

            {/* EMPLOYEE LIST CONTAINER */}
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-gray-50/70">
                  <tr>
                    <th scope="col" className="w-12 px-6 py-3">
                      <input
                        type="checkbox"
                        checked={filteredEmployees.length > 0 && filteredEmployees.every(emp => selectedEmployees.includes(emp.id))}
                        onChange={handleSelectAllFiltered}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                      />
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Employee</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Dept / Role</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Reporting To</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {storeLoading && employees.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-gray-400">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <div className="animate-spin rounded-full h-8 w-8 border-4 border-indigo-500 border-t-transparent"></div>
                          <span className="text-sm font-medium">Loading employees...</span>
                        </div>
                      </td>
                    </tr>
                  ) : filteredEmployees.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-gray-500 text-sm">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Users className="h-10 w-10 text-gray-300" />
                          <span>No employees match your search filters.</span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredEmployees.map((emp) => {
                      const isSelected = selectedEmployees.includes(emp.id);

                      // Resolve all assigned reporting heads
                      const managerIds = Array.isArray(emp.reporting_to)
                        ? emp.reporting_to
                        : emp.reporting_to
                          ? [emp.reporting_to]
                          : [];

                      return (
                        <tr
                          key={emp.id}
                          className={`hover:bg-indigo-50/30 transition-colors ${isSelected ? 'bg-indigo-50/20' : ''}`}
                        >
                          <td className="px-6 py-4">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleSelectEmployee(emp.id)}
                              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4 cursor-pointer"
                            />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-3">
                              <div
                                style={getAvatarStyle(emp.name)}
                                className="h-10 w-10 rounded-full flex items-center justify-center text-sm font-black shadow-sm"
                              >
                                {getInitials(emp.name)}
                              </div>
                              <div>
                                <div className="text-sm font-bold text-gray-900">{emp.name}</div>
                                <div className="text-xs font-semibold text-gray-400">Code: {emp.employee_code || 'N/A'}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex flex-col">
                              <span className="inline-flex items-center gap-1 text-xs font-bold text-gray-700">
                                {emp.department || 'General'}
                              </span>
                              {(() => {
                                const role = getEmployeeRole(emp);
                                if (role === 'Reporting Head') {
                                  return (
                                    <span className="inline-flex items-center gap-1 self-start px-2 py-0.5 rounded-full text-[9px] font-black bg-amber-50 text-amber-700 border border-amber-200 uppercase mt-1 tracking-wider">
                                      Reporting Head
                                    </span>
                                  );
                                }
                                if (role.toLowerCase().includes('admin')) {
                                  return (
                                    <span className="inline-flex items-center gap-1 self-start px-2 py-0.5 rounded-full text-[9px] font-black bg-indigo-50 text-indigo-700 border border-indigo-200 uppercase mt-1 tracking-wider">
                                      {role}
                                    </span>
                                  );
                                }
                                if (role.toLowerCase().includes('hr')) {
                                  return (
                                    <span className="inline-flex items-center gap-1 self-start px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase mt-1 tracking-wider">
                                      {role}
                                    </span>
                                  );
                                }
                                return (
                                  <span className="inline-flex items-center gap-1 self-start px-2 py-0.5 rounded-full text-[9px] font-black bg-gray-50 text-gray-600 border border-gray-200 uppercase mt-1 tracking-wider">
                                    {role}
                                  </span>
                                );
                              })()}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-wrap gap-1.5 max-w-[200px]">
                              {managerIds.length > 0 ? (
                                 managerIds.map(managerId => {
                                  // Resolve manager name from either Employee record or Profile record
                                  let managerName = '';
                                  const empManager = employees.find(e => e.id === managerId);
                                  if (empManager) {
                                    managerName = empManager.name;
                                  } else {
                                    const profManager = profiles.find(p => p.id === managerId);
                                    if (profManager) {
                                      managerName = profManager.full_name || profManager.email;
                                    }
                                  }
                                  if (!managerName) return null;
                                  return (
                                    <span key={managerId} className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-800 border border-indigo-100/80 shadow-xs">
                                      <span className="h-1 w-1 rounded-full bg-indigo-500"></span>
                                      {managerName}
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleRemoveSingleManager(emp.id, managerId);
                                        }}
                                        title={`Remove ${managerName}`}
                                        className="text-indigo-400 hover:text-indigo-600 transition-colors ml-0.5 p-0.5 rounded-full hover:bg-indigo-100"
                                      >
                                        <X className="h-2.5 w-2.5" />
                                      </button>
                                    </span>
                                  );
                                })
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-50 text-gray-400 border border-gray-100">
                                  Not Assigned
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* RIGHT SIDE: REPORTING HEADS PANEL (col-span 5) */}
          <div className="lg:col-span-4 bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 mb-4">
                <span className="inline-flex items-center justify-center h-7 w-7 rounded-lg bg-indigo-50 text-indigo-600 font-semibold text-sm">2</span>
                Choose Reporting Head
              </h2>

              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search reporting heads by name..."
                  value={headSearch}
                  onChange={(e) => setHeadSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              {/* Filter left panel by this head's subordinates */}
              <div className="mt-3">
                <select
                  value={selectedHeadFilter}
                  onChange={(e) => {
                    setSelectedHeadFilter(e.target.value);
                    setSelectedEmployees([]);
                    setSelectedReportingHeads([]);
                  }}
                  className="w-full pl-3 pr-4 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-gray-700"
                >
                  <option value="">— Filter employees by Reporting Head —</option>
                  {potentialHeads.map(head => {
                    const subCount = employees.filter(e => {
                      const ids = Array.isArray(e.reporting_to) ? e.reporting_to : e.reporting_to ? [e.reporting_to] : [];
                      return ids.includes(head.id);
                    }).length;
                    return (
                      <option key={head.id} value={head.id}>
                        {head.name} ({subCount} subordinate{subCount !== 1 ? 's' : ''})
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            {/* HEADS LIST */}
            <div className="p-4 max-h-[500px] overflow-y-auto space-y-3">
              {potentialHeads.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm">
                  <UserX className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                  No managers or reporting heads found.
                </div>
              ) : (
                potentialHeads.map(head => {
                  const isSelected = selectedReportingHeads.includes(head.id);
                  const role = head.user_role || 'Employee';
                  const roleLower = role.toLowerCase();
                  const isAdminRole = roleLower.includes('admin');
                  const isHRRole = roleLower.includes('hr');
                  
                  const name = head.name || head.email?.split('@')[0] || 'No Name';
                  const empRecord = employees.find(e => e.email?.toLowerCase() === head.email?.toLowerCase());

                  return (
                    <div
                      key={head.id}
                      onClick={() => {
                        setSelectedReportingHeads(prev =>
                          prev.includes(head.id) ? prev.filter(id => id !== head.id) : [...prev, head.id]
                        );
                      }}
                      className={`flex items-center justify-between p-4 rounded-2xl border transition-all cursor-pointer ${isSelected
                          ? 'border-indigo-600 bg-indigo-50/30 ring-2 ring-indigo-600/10 shadow-sm'
                          : 'border-gray-100 bg-white hover:border-indigo-200 hover:bg-gray-50/50'
                        }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          style={getAvatarStyle(name)}
                          className="h-10 w-10 rounded-full flex items-center justify-center text-sm font-black shadow-sm"
                        >
                          {getInitials(name)}
                        </div>
                        <div>
                          <div className="text-sm font-bold text-gray-900">{name}</div>
                          <div className="text-xs font-semibold text-gray-400 mt-0.5">{head.email}</div>
                        </div>
                      </div>

                      {/* BADGES TO SIGNAL ELIGIBILITY TYPE */}
                      <div className="flex flex-col items-end gap-1.5">
                        {empRecord?.is_reporting_head && (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700 uppercase">
                            Reporting Head
                          </span>
                        )}
                        {isAdminRole && (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 uppercase">
                            Admin
                          </span>
                        )}
                        {isHRRole && (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 uppercase">
                            HR Team
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* RIGHT SIDE PANEL FOOTER ACTIONS */}
            <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-3">
              <div className="flex flex-col">
                <span className="text-xs font-bold text-gray-500">
                  {selectedEmployees.length} Selected
                </span>
                <span className="text-[10px] text-gray-400 font-semibold">
                  {selectedReportingHeads.length} Head(s) chosen
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  disabled={loading || selectedEmployees.length === 0 || selectedReportingHeads.length === 0}
                  onClick={handleAssignReportingHead}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-extrabold shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 hover:shadow-indigo-500/40 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none"
                >
                  {loading ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                  ) : (
                    <>
                      Assign Head
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            </div>

          </div>

        </div>
      </div>
    </div>
  );
}
