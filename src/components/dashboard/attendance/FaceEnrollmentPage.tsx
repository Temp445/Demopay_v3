import React, { useState, useEffect } from 'react';
import { Search, AlertCircle, User, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Employee, getEmployees } from '../../../lib/employees';
import FaceEnrollmentCard from './FaceEnrollmentCard';

export default function FaceEnrollmentPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [filteredEmployees, setFilteredEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [departments, setDepartments] = useState<string[]>([]);
  const [refreshCounter, setRefreshCounter] = useState(0);

  useEffect(() => {
    const loadEmployees = async () => {
      try {
        setLoading(true);
        const data = await getEmployees();
        
        // Only include active employees
        const activeEmployees = data.filter(emp => emp.status === 'Active');
        setEmployees(activeEmployees);
        
        // Extract unique departments
        const uniqueDepartments = Array.from(new Set(activeEmployees.map(emp => emp.departments?.name)));
        setDepartments(uniqueDepartments);
        
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load employees');
      } finally {
        setLoading(false);
      }
    };

    loadEmployees();
  }, [refreshCounter]);
  
  // Filter employees based on search term and department
  useEffect(() => {
    let filtered = [...employees];
    
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        emp => 
          emp.name.toLowerCase().includes(term) || 
          emp.email.toLowerCase().includes(term) ||
          (emp.employee_code && emp.employee_code.toLowerCase().includes(term))
      );
    }
    
    if (selectedDepartment) {
      filtered = filtered.filter(emp => emp.departments?.name === selectedDepartment);
    }
    
    setFilteredEmployees(filtered);
  }, [employees, searchTerm, selectedDepartment]);
  
  const handleEnrollmentChange = () => {
    // Increment refresh counter to trigger a reload of enrollment status
    setRefreshCounter(prev => prev + 1);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
        <div className="flex items-center mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">Employees Face Enrollment</h1>
        </div>
        
        <p className="mt-1 text-sm text-gray-500 mb-6">
          Enroll employee faces for biometric attendance verification. Enrolled faces can be used for clock in/out.
        </p>
        
        {error && (
          <div className="mb-6 rounded-md bg-red-50 p-4">
            <div className="flex">
              <AlertCircle className="h-5 w-5 text-red-400" />
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">{error}</h3>
              </div>
            </div>
          </div>
        )}
        
        {/* Search and filter */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="relative rounded-md shadow-sm mt-1">
            <div className="absolute inset-y-0 left-0 -top-1 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 py-2 sm:text-sm border-gray-300 rounded-md"
              placeholder="Search employees..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <div>
            <select
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
              value={selectedDepartment}
              onChange={(e) => setSelectedDepartment(e.target.value)}
            >
              <option value="">All Departments</option>
              {departments.map((dept) => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
          </div>
        </div>
        
        {/* Employee cards */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filteredEmployees.length === 0 ? (
            <div className="col-span-full py-12 text-center">
              <User className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No employees found</h3>
              <p className="mt-1 text-sm text-gray-500">
                Try adjusting your search or filter to find employees.
              </p>
            </div>
          ) : (
            filteredEmployees.map(employee => (
              <FaceEnrollmentCard 
                key={employee.id} 
                employee={employee}
                onEnrollmentChange={handleEnrollmentChange}
              />
            ))
          )}
        </div>
        
        {/* Privacy notice */}
        <div className="mt-8 bg-blue-50 p-4 rounded-md">
          <h3 className="text-sm font-medium text-blue-800">Privacy Information</h3>
          <p className="mt-1 text-sm text-blue-600">
            Face data is securely stored and encrypted. It is only used for attendance verification and 
            is not shared with third parties. Employees can request deletion of their face data at any time.
          </p>
        </div>
      </div>
    </div>
  );
}