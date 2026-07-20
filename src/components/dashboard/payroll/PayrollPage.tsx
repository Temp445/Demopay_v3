import React, { useState, useEffect } from 'react';
import { Download, Mail } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import PayrollList from './PayrollList';
import PayrollFilters from './PayrollFilters';
import PayrollSummary from './PayrollSummary';
import AddPayProcessModal from './AddPayProcessModal';
import { exportToCSV } from '../../../lib/export';
import { usePayrollStore } from '../../../stores/payrollStore';

export default function PayrollPage() {
  const navigate = useNavigate();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  // Removed isFiltersOpen state
  const [lastRefresh, setLastRefresh] = useState(Date.now());
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    period_start: '',
    period_end: '',
    status: '',
    department: '',
    cadre: '',
    employeeSearch: '',
  });

  const handlePayrollAdded = () => {
    setLastRefresh(Date.now());
  };

  const { items: payrollItems, loading, error, fetchPayrollEntries } = usePayrollStore();

  useEffect(() => {
    fetchPayrollEntries(filters.period_start, filters.period_end);
  }, [filters.period_start, filters.period_end, lastRefresh, fetchPayrollEntries]);

  const filteredEntries = payrollItems.filter((entry) => {
    if (filters.status && entry.status !== filters.status) return false;
    if (filters.period_start) {
      const filterStart = new Date(filters.period_start);
      const entryStart = new Date(entry.period_start);
      filterStart.setHours(0, 0, 0, 0);
      entryStart.setHours(0, 0, 0, 0);
      if (entryStart < filterStart) return false;
    }
    if (filters.period_end) {
      const filterEnd = new Date(filters.period_end);
      const entryEnd = new Date(entry.period_end);
      filterEnd.setHours(23, 59, 59, 999);
      entryEnd.setHours(0, 0, 0, 0);
      if (entryEnd > filterEnd) return false;
    }
    if (filters.department && entry.employee?.department?.name) {
      if (!entry.employee.department.name.toLowerCase().includes(filters.department.toLowerCase())) return false;
    }
    if (filters.cadre && entry.employee?.cadre?.name) {
      if (!entry.employee.cadre.name.toLowerCase().includes(filters.cadre.toLowerCase())) return false;
    }
    if (filters.employeeSearch && entry.employee) {
      const searchTerms = filters.employeeSearch.toLowerCase();
      const name = entry.employee.name?.toLowerCase() || '';
      const code = entry.employee.employee_code?.toLowerCase() || '';
      
      // Match if the search term is in name/code (typing)
      // OR if the name/code is in the search term (selected from suggestion 'Name (Code)')
      const nameMatch = name.includes(searchTerms) || searchTerms.includes(name);
      const codeMatch = code.includes(searchTerms) || searchTerms.includes(code);
      
      if (!nameMatch && !codeMatch) return false;
    }
    return true;
  });

  const handleExport = async () => {
    try {
      setExporting(true);
      setExportError(null);
      await fetchPayrollEntries(filters.period_start, filters.period_end);
      const payrollData = payrollItems;
      
      if (!payrollData || payrollData.length === 0) {
        throw new Error('No payroll data available to export');
      }

      const filename = `payroll_${new Date().toISOString().split('T')[0]}.csv`;
      
      const formattedData = payrollData.map(entry => ({
        'Employee Name': entry.employee?.name || 'Unknown',
        'Department': entry.employee?.department?.name || 'Unknown',
        'Period Start': new Date(entry.period_start).toLocaleDateString(),
        'Period End': new Date(entry.period_end).toLocaleDateString(),
        'Base Salary': entry.base_salary.toFixed(2),
        'Overtime Hours': entry.overtime_hours,
        'Overtime Amount': (entry.overtime_hours * entry.overtime_rate).toFixed(2),
        'Deductions': entry.deductions.toFixed(2),
        'Bonus': entry.bonus.toFixed(2),
        'Total Amount': entry.total_amount.toFixed(2),
        'Status': entry.status,
        'Payment Date': entry.payment_date ? new Date(entry.payment_date).toLocaleDateString() : 'N/A'
      }));

      await exportToCSV(formattedData, filename);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to export data';
      setExportError(errorMessage);
      console.error('Export failed:', error);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Payroll</h1>
            <p className="mt-1 text-sm text-gray-500">
              Manage payroll entries, process payments, and generate reports.
            </p>
          </div>
          <div className="mt-4 md:mt-0 flex flex-col sm:flex-row gap-3">
            {/* Filter Button Removed */}
            <button
              onClick={handleExport}
              disabled={exporting}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="h-4 w-4 mr-2" />
              {exporting ? 'Exporting...' : 'Export'}
            </button>
          </div>
        </div>

        {exportError && (
          <div className="mt-4 rounded-md bg-red-50 p-4">
            <div className="flex">
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Export failed</h3>
                <div className="mt-2 text-sm text-red-700">
                  {exportError}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Filters are now always visible (conditional check removed) */}
        <div className="mt-6 border-b border-gray-200 pb-6">
          <PayrollFilters filters={filters} onFilterChange={setFilters} entries={payrollItems} />
        </div>

        <div className="mt-4">
          <PayrollSummary 
            entries={filteredEntries}
            loading={loading}
            error={error}
          />
        </div>

        <div className="mt-4">
          <PayrollList 
            entries={filteredEntries}
            loading={loading}
            error={error}
            onRefresh={handlePayrollAdded}
            lastRefresh={lastRefresh}
            filters={filters}
          />
        </div>
      </div>

      <AddPayProcessModal 
        isOpen={isAddModalOpen} 
        onClose={() => setIsAddModalOpen(false)} 
        onPayrollAdded={handlePayrollAdded}
      />
    </div>
  );
}