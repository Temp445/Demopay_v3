import React, { useEffect, useState } from 'react';
import { Users, Search, Filter, CheckCircle, XCircle, Download } from 'lucide-react';
import { useOTEmployeesStore } from '../../../stores/otEmployeesStore';
import { useDepartmentsStore } from '../../../stores/departmentsStore';
import toast from 'react-hot-toast';

export default function OTEmployeeManagement() {
  const { employees, loading: empLoading, error, fetchEmployees, updateEligibility, bulkUpdate } = useOTEmployeesStore();
  const { items: allDepartments, loading: deptLoading, fetchDepartments } = useDepartmentsStore();
  
  const loading = empLoading || deptLoading;
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [currentEmployee, setCurrentEmployee] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    fetchEmployees();
    fetchDepartments();
  }, [fetchEmployees, fetchDepartments]);

  useEffect(() => {
    if (error) {
      toast.error(error);
    }
  }, [error]);

  const departments = [...new Set(allDepartments.map(d => d.name))];

  const filteredEmployees = employees.filter(emp => {
    const matchesSearch = emp.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.employeeCode.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDepartment = !departmentFilter || emp.department === departmentFilter;
    return matchesSearch && matchesDepartment;
  });

  const handleToggle = async (employeeId: string, currentStatus: boolean) => {
    try {
      await updateEligibility(employeeId, !currentStatus);
      toast.success(`OT eligibility ${!currentStatus ? 'enabled' : 'disabled'}`);
    } catch (error) {
      toast.error('Failed to update eligibility');
      console.error(error);
    }
  };

  const handleBulkEnable = async () => {
    if (selectedEmployees.length === 0) {
      toast.error('Please select employees first');
      return;
    }

    try {
      await bulkUpdate(selectedEmployees, true);
      toast.success(`Enabled OT for ${selectedEmployees.length} employees`);
      setSelectedEmployees([]);
    } catch (error) {
      toast.error('Failed to bulk update');
      console.error(error);
    }
  };

  const handleBulkDisable = async () => {
    if (selectedEmployees.length === 0) {
      toast.error('Please select employees first');
      return;
    }

    try {
      await bulkUpdate(selectedEmployees, false);
      toast.success(`Disabled OT for ${selectedEmployees.length} employees`);
      setSelectedEmployees([]);
    } catch (error) {
      toast.error('Failed to bulk update');
      console.error(error);
    }
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedEmployees(filteredEmployees.map(emp => emp.employeeId));
    } else {
      setSelectedEmployees([]);
    }
  };

  const handleSelectOne = (employeeId: string) => {
    setSelectedEmployees(prev =>
      prev.includes(employeeId)
        ? prev.filter(id => id !== employeeId)
        : [...prev, employeeId]
    );
  };

  const openNotesModal = (employeeId: string, currentNotes?: string) => {
    setCurrentEmployee(employeeId);
    setNotes(currentNotes || '');
    setShowNotesModal(true);
  };

  const handleSaveNotes = async () => {
    if (!currentEmployee) return;

    const employee = employees.find(e => e.employeeId === currentEmployee);
    if (!employee) return;

    try {
      await updateEligibility(currentEmployee, employee.isOTEligible, notes);
      toast.success('Notes saved');
      setShowNotesModal(false);
      setCurrentEmployee(null);
      setNotes('');
    } catch (error) {
      toast.error('Failed to save notes');
      console.error(error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Users className="h-6 w-6" />
          OT Employee Management
        </h1>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow mb-6 p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Search className="h-4 w-4 inline mr-1" />
              Search
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name or code..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Filter className="h-4 w-4 inline mr-1" />
              Department
            </label>
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="">All Departments</option>
              {departments.map(dept => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
          </div>

          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={handleBulkEnable}
              disabled={selectedEmployees.length === 0}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <CheckCircle className="h-4 w-4" />
              Enable Selected
            </button>
            <button
              type="button"
              onClick={handleBulkDisable}
              disabled={selectedEmployees.length === 0}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <XCircle className="h-4 w-4" />
              Disable Selected
            </button>
          </div>
        </div>
      </div>

      {/* Employee List */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left">
                <input
                  type="checkbox"
                  checked={selectedEmployees.length === filteredEmployees.length && filteredEmployees.length > 0}
                  onChange={handleSelectAll}
                  className="rounded"
                />
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Employee
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Department
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                OT Eligible
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Effective From
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredEmployees.map((emp) => (
              <tr key={emp.employeeId} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <input
                    type="checkbox"
                    checked={selectedEmployees.includes(emp.employeeId)}
                    onChange={() => handleSelectOne(emp.employeeId)}
                    className="rounded"
                  />
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">{emp.employeeName}</div>
                  <div className="text-sm text-gray-500">{emp.employeeCode}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {emp.department}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleToggle(emp.employeeId, emp.isOTEligible)}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                      emp.isOTEligible ? 'bg-green-600' : 'bg-gray-200'
                    }`}
                    title={emp.isOTEligible ? 'OT Enabled' : 'OT Disabled'}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        emp.isOTEligible ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {new Date(emp.effectiveFrom).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <button
                    type="button"
                    onClick={() => openNotesModal(emp.employeeId, emp.notes)}
                    className="text-blue-600 hover:text-blue-900"
                  >
                    {emp.notes ? 'Edit Notes' : 'Add Notes'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredEmployees.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            No employees found
          </div>
        )}
      </div>

      {/* Notes Modal */}
      {showNotesModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold mb-4">Employee Notes</h3>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes about OT eligibility..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md h-32"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => {
                  setShowNotesModal(false);
                  setCurrentEmployee(null);
                  setNotes('');
                }}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveNotes}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
