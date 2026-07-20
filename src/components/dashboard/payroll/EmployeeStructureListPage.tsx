import React, { useState, useEffect } from 'react';
import { Users, Search, Filter, Calendar, Briefcase, FileText, AlertCircle, CheckCircle, XCircle, UserMinus, RefreshCw, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../lib/supabase';
import { validateAuth } from '../../../stores/utils/storeUtils';
import { useSalaryStructuresStore } from '../../../stores/salaryStructuresStore';

interface EmployeeStructureData {
  assignment_id: string;
  employee_id: string;
  employee_code: string;
  name: string;
  email: string;
  department: string;
  effective_from: string;
  effective_to: string | null;
  status: 'Active' | 'Inactive';
}

export default function EmployeeStructureListPage() {
  const navigate = useNavigate();
  const { items: structures, fetchSalaryStructures } = useSalaryStructuresStore();
  
  const [selectedStructureId, setSelectedStructureId] = useState('');
  const [employees, setEmployees] = useState<EmployeeStructureData[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    fetchSalaryStructures();
  }, []);

  useEffect(() => {
    if (selectedStructureId) {
      fetchEmployeesByStructure();
    } else {
      setEmployees([]);
      setError(null);
    }
  }, [selectedStructureId]);

  const fetchEmployeesByStructure = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const auth = await validateAuth();
      if (!auth.isAuthenticated || !auth.tenantId) {
        throw new Error("Authentication failed.");
      }

      const { data: rawData, error: rawError } = await supabase
        .from('employee_salary_structures')
        .select('id, employee_id, effective_from, effective_to')
        .eq('structure_id', selectedStructureId)
        .eq('tenant_id', auth.tenantId)
        .order('effective_from', { ascending: false });

      if (rawError) throw rawError;

      if (!rawData || rawData.length === 0) {
        setEmployees([]);
        setLoading(false);
        return;
      }

      const employeeIds = rawData.map(item => item.employee_id);
      
      const { data: empData, error: empError } = await supabase
        .from('employees')
        .select('id, employee_code, name, email, department')
        .in('id', employeeIds);

      if (empError) throw empError;

      const employeeMap = new Map(empData?.map(e => [e.id, e]));

      const todayStr = new Date().toISOString().split('T')[0];

      const formattedData: EmployeeStructureData[] = rawData.map((item) => {
        const empDetails = employeeMap.get(item.employee_id);
        
        const isActive = !item.effective_to || item.effective_to > todayStr;

        return {
          assignment_id: item.id,
          employee_id: item.employee_id,
          employee_code: empDetails?.employee_code || 'N/A',
          name: empDetails?.name || 'Unknown',
          email: empDetails?.email || '-',
          department: empDetails?.department || '-',
          effective_from: item.effective_from,
          effective_to: item.effective_to,
          status: isActive ? 'Active' : 'Inactive'
        };
      });

      setEmployees(formattedData);

    } catch (err) {
      console.error('Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load list');
    } finally {
      setLoading(false);
    }
  };

  const handleDeactivate = async (assignmentId: string, employeeName: string) => {
    if (!window.confirm(`Are you sure you want to deactivate ${employeeName}? They will be marked Inactive immediately.`)) {
      return;
    }

    try {
      setActionLoading(assignmentId);
      const today = new Date().toISOString().split('T')[0];

      const { error } = await supabase
        .from('employee_salary_structures')
        .update({ effective_to: today })
        .eq('id', assignmentId);

      if (error) throw error;
      await fetchEmployeesByStructure();
    } catch (err) {
      console.error('Error deactivating:', err);
      alert('Failed to deactivate employee.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReactivate = async (assignmentId: string, employeeName: string) => {
    if (!window.confirm(`Are you sure you want to reactivate ${employeeName}?`)) {
      return;
    }

    try {
      setActionLoading(assignmentId);

      const { error } = await supabase
        .from('employee_salary_structures')
        .update({ effective_to: null })
        .eq('id', assignmentId);

      if (error) throw error;
      await fetchEmployeesByStructure();
    } catch (err) {
      console.error('Error reactivating:', err);
      alert('Failed to reactivate employee.');
    } finally {
      setActionLoading(null);
    }
  };

  const filteredEmployees = employees.filter(emp => 
    (emp.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
    (emp.employee_code || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (emp.department || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6">
      <div className="mb-6">
        {/* Back Button */}
        <button
          onClick={() => navigate(-1)}
          className="mb-4 inline-flex items-center text-sm text-gray-500 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Salary Structures
        </button>

        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Users className="h-6 w-6 text-indigo-600" />
          Employee Structure List
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage employees assigned to salary structures.
        </p>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <FileText className="inline h-4 w-4 mr-1" /> 
              Select Salary Structure
            </label>
            <select 
              value={selectedStructureId} 
              onChange={(e) => setSelectedStructureId(e.target.value)} 
              className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            >
              <option value="">-- Choose a Structure --</option>
              {/* Filter applied here: checks is_active boolean */}
              {structures
                .filter((s) => s.is_active) 
                .map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search by name, code or department..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              disabled={!selectedStructureId}
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm disabled:bg-gray-100"
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        {error && (
          <div className="p-4 bg-red-50 text-red-700 border-b border-red-200 flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            {error}
          </div>
        )}

        {!selectedStructureId ? (
          <div className="text-center py-16 px-4">
            <Filter className="mx-auto h-12 w-12 text-gray-300" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No Structure Selected</h3>
          </div>
        ) : loading ? (
          <div className="text-center py-16 text-gray-500">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-2"></div>
            Loading employees...
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            No employees found for this structure.
          </div>
        ) : (
          <>
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
              <h3 className="text-sm font-medium text-gray-700">
                Assigned Employees ({filteredEmployees.length})
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Employee</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Department</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredEmployees.map((emp) => (
                    <tr key={emp.assignment_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                       
                          <div className="ml-4">
                            <div className={`text-sm font-medium ${emp.status === 'Active' ? 'text-gray-900' : 'text-gray-500'}`}>
                                {emp.name}
                            </div>
                            <div className="text-sm text-gray-500">{emp.employee_code}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900 flex items-center gap-2">
                            <Briefcase className="h-4 w-4 text-gray-400" />
                            {emp.department}
                          </div>
                      </td>
                      
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          emp.status === 'Active' 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {emp.status === 'Active' ? (
                             <CheckCircle className="w-3 h-3 mr-1" />
                          ) : (
                             <XCircle className="w-3 h-3 mr-1" />
                          )}
                          {emp.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        {emp.status === 'Active' ? (
                          <button
                            onClick={() => handleDeactivate(emp.assignment_id, emp.name)}
                            disabled={actionLoading === emp.assignment_id}
                            className="text-red-600 hover:text-red-900 flex items-center gap-1 ml-auto disabled:opacity-50"
                          >
                            {actionLoading === emp.assignment_id ? (
                              <div className="h-4 w-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                              <UserMinus className="h-4 w-4" />
                            )}
                            Deactivate
                          </button>
                        ) : (
                          <button
                            onClick={() => handleReactivate(emp.assignment_id, emp.name)}
                            disabled={actionLoading === emp.assignment_id}
                            className="text-green-600 hover:text-green-900 flex items-center gap-1 ml-auto disabled:opacity-50"
                          >
                            {actionLoading === emp.assignment_id ? (
                               <div className="h-4 w-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                               <RefreshCw className="h-4 w-4" />
                            )}
                            Reactivate
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}