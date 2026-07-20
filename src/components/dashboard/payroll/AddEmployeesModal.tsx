import React, { useState, useEffect, useMemo } from 'react';
import { X, Search, AlertTriangle, CheckCircle, User, Plus } from 'lucide-react';
import { useStructureAssignmentsStore } from '../../../stores/structureAssignmentsStore';
import { useEmployeesStore } from '../../../stores/employeesStore';

interface AddEmployeesModalProps {
  isOpen: boolean;
  onClose: () => void;
  structureId: string;
  structureName: string;
  // CHANGED: Instead of saving internally, we pass data back to parent
  onAddEmployees: (selectedEmployees: any[]) => void; 
}

export default function AddEmployeesModal({
  isOpen,
  onClose,
  structureId,
  structureName,
  onAddEmployees,
}: AddEmployeesModalProps) {
  // 1. Get Assignment Links (to check who is already assigned)
  const {
    allEmployees: assignmentMap,
    fetchAllEmployeesWithAssignments,
    loading: assignmentsLoading,
  } = useStructureAssignmentsStore();

  // 2. Get Employee Details
  const {
    items: employees,
    fetchEmployees,
    loading: employeesLoading,
  } = useEmployeesStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen) {
      fetchEmployees();
      fetchAllEmployeesWithAssignments();
      setSelectedEmployeeIds([]);
      setSearchTerm('');
    }
  }, [isOpen]);

  const loading = employeesLoading || assignmentsLoading;

  // 3. Merge Data
  const combinedEmployees = useMemo(() => {
    if (!employees) return [];
    return employees.map((emp) => {
      const assignment = assignmentMap.find((a) => a.id === emp.id);
      return {
        ...emp,
        current_structure_id: assignment?.current_structure_id,
        current_structure_name: assignment?.current_structure_name,
        individual_component_values: assignment?.individual_component_values,
      };
    });
  }, [employees, assignmentMap]);

  // 4. Filter
  const filteredEmployees = useMemo(() => {
    const searchLower = searchTerm.toLowerCase();
    return combinedEmployees.filter((emp) => {
      return (
        (emp.employee_code?.toLowerCase() || '').includes(searchLower) ||
        (emp.name?.toLowerCase() || '').includes(searchLower) ||
        (emp.full_name?.toLowerCase() || '').includes(searchLower) ||
        (emp.department?.toLowerCase() || '').includes(searchLower)
      );
    });
  }, [combinedEmployees, searchTerm]);

  const handleToggleEmployee = (employeeId: string) => {
    setSelectedEmployeeIds((prev) =>
      prev.includes(employeeId)
        ? prev.filter((id) => id !== employeeId)
        : [...prev, employeeId]
    );
  };

  const handleSelectAll = () => {
    const selectable = filteredEmployees.filter(e => e.current_structure_id !== structureId);
    if (selectedEmployeeIds.length === selectable.length) {
      setSelectedEmployeeIds([]);
    } else {
      setSelectedEmployeeIds(selectable.map((emp) => emp.id));
    }
  };

  // CHANGED: Logic to pass data to parent instead of API call
  const handleAddToList = () => {
    if (selectedEmployeeIds.length === 0) return;

    // Find the full employee objects for the selected IDs
    const selectedEmployeeObjects = combinedEmployees.filter(emp => 
      selectedEmployeeIds.includes(emp.id)
    );

    onAddEmployees(selectedEmployeeObjects);
    onClose();
  };

  if (!isOpen) return null;

  const selectedCount = selectedEmployeeIds.length;
  const alreadyAssignedCount = selectedEmployeeIds.filter(
    (id) => combinedEmployees.find((e) => e.id === id)?.current_structure_id === structureId
  ).length;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" onClick={onClose} />

        <div className="inline-block w-full max-w-5xl my-8 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-lg">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-medium text-gray-900">Select Employees</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Select employees to add to the staging list for: <span className="font-medium">{structureName}</span>
                </p>
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-500">
                <X className="h-6 w-6" />
              </button>
            </div>
          </div>

          {/* Search Bar & List (Same as before, abbreviated for brevity) */}
          <div className="px-6 py-4 bg-white border-b border-gray-200">
            <div className="flex items-center gap-4">
               <div className="relative flex-1">
                 <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
                 <input 
                   type="text" 
                   className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md"
                   placeholder="Search..."
                   value={searchTerm}
                   onChange={e => setSearchTerm(e.target.value)}
                 />
               </div>
               <button onClick={handleSelectAll} className="px-4 py-2 text-sm font-medium text-indigo-700 bg-indigo-100 rounded-md">
                 Select All
               </button>
            </div>
          </div>

          {/* Employee List Container */}
          <div className="px-6 py-4 max-h-96 overflow-y-auto">
             {loading ? <p>Loading...</p> : (
               <div className="space-y-2">
                 {filteredEmployees.map(employee => {
                   const isSelected = selectedEmployeeIds.includes(employee.id);
                   const isAssigned = employee.current_structure_id === structureId;
                   return (
                     <label key={employee.id} className={`flex items-center p-4 rounded-lg border-2 cursor-pointer ${isSelected ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200'}`}>
                        <input 
                          type="checkbox" 
                          checked={isSelected} 
                          onChange={() => handleToggleEmployee(employee.id)}
                          disabled={isAssigned}
                          className="h-4 w-4 text-indigo-600 rounded"
                        />
                        <div className="ml-3">
                           <p className="font-medium">{employee.name || employee.full_name}</p>
                           <p className="text-sm text-gray-500">{employee.employee_code} | {employee.department}</p>
                        </div>
                     </label>
                   )
                 })}
               </div>
             )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
            <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-md bg-white text-gray-700">Cancel</button>
            <button 
              onClick={handleAddToList}
              disabled={selectedCount === 0}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
            >
              <Plus className="inline-block h-4 w-4 mr-2" />
              Add to List
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}