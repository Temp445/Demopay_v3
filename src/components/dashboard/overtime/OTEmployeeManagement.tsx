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
    <div className="sm:p-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Users className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-600" />
            OT Employee Management
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 font-medium">Manage overtime eligibility for employees</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 mb-6 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-400" />
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name or code..."
              className="block w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-lg bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow"
            />
          </div>

          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Filter className="h-4 w-4 text-slate-400" />
            </div>
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="block w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-lg bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow appearance-none"
            >
              <option value="">All Departments</option>
              {departments.map(dept => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 sm:col-span-2 md:col-span-1">
            <button
              type="button"
              onClick={handleBulkEnable}
              disabled={selectedEmployees.length === 0}
              className="flex-1 justify-center px-4 py-2.5 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm transition-colors"
            >
              <CheckCircle className="h-4 w-4 shrink-0" />
              Enable Selected
            </button>
            <button
              type="button"
              onClick={handleBulkDisable}
              disabled={selectedEmployees.length === 0}
              className="flex-1 justify-center px-4 py-2.5 bg-rose-500 text-white text-xs font-bold rounded-lg hover:bg-rose-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm transition-colors"
            >
              <XCircle className="h-4 w-4 shrink-0" />
              Disable Selected
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Card List */}
      <div className="sm:hidden space-y-3 mb-6">
        <div className="flex items-center gap-2 px-1 mb-2">
          <input
            type="checkbox"
            checked={selectedEmployees.length === filteredEmployees.length && filteredEmployees.length > 0}
            onChange={handleSelectAll}
            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            id="selectAllMobile"
          />
          <label htmlFor="selectAllMobile" className="text-xs font-bold text-slate-500">Select All ({filteredEmployees.length})</label>
        </div>

        {filteredEmployees.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
            <Users className="h-10 w-10 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 font-semibold text-sm">No employees found</p>
          </div>
        ) : (
          filteredEmployees.map((emp) => (
            <div key={emp.employeeId} className={`bg-white p-4 rounded-xl border transition-colors ${selectedEmployees.includes(emp.employeeId) ? 'border-indigo-300 bg-indigo-50/30' : 'border-slate-200'}`}>
              <div className="flex justify-between items-start gap-3 mb-3">
                <div className="flex gap-3 min-w-0">
                  <input
                    type="checkbox"
                    checked={selectedEmployees.includes(emp.employeeId)}
                    onChange={() => handleSelectOne(emp.employeeId)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 mt-1 shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-slate-900 truncate">{emp.employeeName}</div>
                    <div className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">{emp.employeeCode}</div>
                  </div>
                </div>
                <button 
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-bold bg-indigo-50 px-2 py-1 rounded-md shrink-0 transition-colors" 
                  onClick={() => openNotesModal(emp.employeeId, emp.notes)}
                >
                  {emp.notes ? 'Edit Notes' : '+ Notes'}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-slate-50 p-2 rounded-lg">
                  <span className="text-slate-400 font-medium block mb-0.5">Department</span>
                  <span className="font-bold text-slate-700 truncate block">{emp.department}</span>
                </div>
                <div className="bg-slate-50 p-2 rounded-lg">
                  <span className="text-slate-400 font-medium block mb-0.5">Effective</span>
                  <span className="font-bold text-slate-700">{new Date(emp.effectiveFrom).toLocaleDateString('en-GB')}</span>
                </div>
              </div>
              <div className="mt-2 flex justify-between items-center bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                <span className="text-xs font-bold text-slate-600">OT Eligibility</span>
                <button
                  type="button"
                  onClick={() => handleToggle(emp.employeeId, emp.isOTEligible)}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 ${
                    emp.isOTEligible ? 'bg-emerald-500' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      emp.isOTEligible ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop Employee List */}
      <div className="hidden sm:block bg-white shadow-sm border border-slate-200 rounded-xl overflow-hidden">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest">
            <tr>
              <th className="px-6 py-4 text-left w-12">
                <input
                  type="checkbox"
                  checked={selectedEmployees.length === filteredEmployees.length && filteredEmployees.length > 0}
                  onChange={handleSelectAll}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
              </th>
              <th className="px-6 py-4 text-left">Employee</th>
              <th className="px-6 py-4 text-left">Department</th>
              <th className="px-6 py-4 text-left">OT Eligible</th>
              <th className="px-6 py-4 text-left">Effective From</th>
              <th className="px-6 py-4 text-left">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-100">
            {filteredEmployees.length === 0 ? (
               <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-slate-500 font-medium">
                  No employees found
                </td>
              </tr>
            ) : (
              filteredEmployees.map((emp) => (
                <tr key={emp.employeeId} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <input
                      type="checkbox"
                      checked={selectedEmployees.includes(emp.employeeId)}
                      onChange={() => handleSelectOne(emp.employeeId)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-bold text-slate-900">{emp.employeeName}</div>
                    <div className="text-[10px] font-mono text-slate-400 tracking-wider uppercase mt-0.5">{emp.employeeCode}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-600">
                    {emp.department}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleToggle(emp.employeeId, emp.isOTEligible)}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 ${
                        emp.isOTEligible ? 'bg-emerald-500' : 'bg-slate-300'
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
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-600">
                    {new Date(emp.effectiveFrom).toLocaleDateString('en-GB')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <button
                      type="button"
                      onClick={() => openNotesModal(emp.employeeId, emp.notes)}
                      className="text-indigo-600 hover:text-indigo-900 font-bold text-xs bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      {emp.notes ? 'Edit Notes' : 'Add Notes'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Notes Modal */}
      {showNotesModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Employee Notes</h3>
              <button 
                onClick={() => { setShowNotesModal(false); setCurrentEmployee(null); setNotes(''); }}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add notes about OT eligibility..."
                className="w-full px-4 py-3 border border-slate-200 rounded-xl h-32 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all resize-none"
              />
              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setShowNotesModal(false);
                    setCurrentEmployee(null);
                    setNotes('');
                  }}
                  className="px-5 py-2.5 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors text-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveNotes}
                  className="px-5 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-sm transition-colors text-sm"
                >
                  Save Notes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
