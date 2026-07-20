import React, { useState, useEffect } from 'react';
import { AlertCircle, FileText } from 'lucide-react';
import { useReportsStore } from '../../../stores/reportsStore';
import ReportTable from './ReportTable';
import ReportActions from './ReportActions'; // Import the new component

interface StatutoryReportProps {
  subtype: string;
  filters: {
    startDate: string;
    endDate: string;
    department: string;
    employee: string;
  };
}

export default function StatutoryReport({ subtype, filters }: StatutoryReportProps) {
  const { statutoryReports, loading, error, fetchStatutoryReport } = useReportsStore();
  const [columns, setColumns] = useState<string[]>([]);

  const reportData = statutoryReports[subtype]?.data || [];
  const summary = statutoryReports[subtype]?.summary || {};

  useEffect(() => {
    fetchStatutoryReport(subtype, filters);
  }, [subtype, filters, fetchStatutoryReport]);

  useEffect(() => {
    if (reportData.length > 0) {
      setColumns(Object.keys(reportData[0]));
    }
  }, [reportData]);

  const getReportTitle = () => {
    switch (subtype) {
      case 'taxDeduction':
        return 'Tax Deduction Statement';
      case 'providentFund':
        return 'Provident Fund Report';
      case 'insurance':
        return 'Insurance Contribution Report';
      case 'professionalTax':
        return 'Professional Tax Report';
      default:
        return 'Statutory Report';
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md bg-red-50 p-4">
        <div className="flex">
          <AlertCircle className="h-5 w-5 text-red-400" />
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">{error}</h3>
          </div>
        </div>
      </div>
    );
  }

  if (reportData.length === 0) {
    return (
      <div className="text-center py-12">
        <FileText className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-medium text-gray-900">No data available</h3>
        <p className="mt-1 text-sm text-gray-500">
          Try changing your filters or selecting a different report type.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-gray-900">{getReportTitle()}</h2>
        
        {/* Replaced manual Print button with ReportActions */}
        <div className="flex space-x-2">
          <ReportActions 
            data={reportData} 
            columns={columns} 
            title={getReportTitle()} 
          />
        </div>
      </div>

      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <div className="px-4 py-5 sm:px-6 bg-gray-50">
          <h3 className="text-lg leading-6 font-medium text-gray-900">
            Report Details
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Generated on {new Date().toLocaleString('en-GB')} | 
            {filters.department ? ` Department: ${filters.department} |` : ''}
            {filters.startDate ? ` Period: ${filters.startDate} to ${filters.endDate}` : ''}
          </p>
        </div>
        
        <ReportTable data={reportData} columns={columns} />
        
        {/* Summary Section */}
        {Object.keys(summary).length > 0 && (
          <div className="px-4 py-5 sm:px-6 bg-gray-50 border-t border-gray-200">
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              Summary
            </h3>
            <div className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {Object.entries(summary).map(([key, value]) => (
                <div key={key} className="bg-white overflow-hidden shadow rounded-lg">
                  <div className="px-4 py-5 sm:p-6">
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                    </dt>
                    <dd className="mt-1 text-3xl font-semibold text-gray-900">
                      {typeof value === 'number' ? value.toLocaleString('en-IN', {
                        style: 'currency',
                        currency: 'INR',
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      }) : value}
                    </dd>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}