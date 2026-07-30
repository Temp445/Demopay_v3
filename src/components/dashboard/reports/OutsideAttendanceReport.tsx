import React, { useState, useEffect, useRef } from 'react';
import { FileDown, Printer, AlertCircle, FileText, Download, ChevronDown } from 'lucide-react';
import { useReportsStore } from '../../../stores/reportsStore';
import { supabase } from '../../../lib/supabase';
import * as XLSX from 'xlsx';
import html2pdf from 'html2pdf.js';
import { validateAuth } from '../../../stores/utils/storeUtils';

interface OutsideAttendanceReportProps {
  filters: {
    startDate: string;
    endDate: string;
    department: string;
    employee: string;
  };
}

export default function OutsideAttendanceReport({ filters }: OutsideAttendanceReportProps) {
  const { transactionReports, loading, error, fetchTransactionReport } = useReportsStore();
  const [companyInfo, setCompanyInfo] = useState<any>(null);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const tableRef = useRef<HTMLTableElement>(null);
  const exportDropdownRef = useRef<HTMLDivElement>(null);

  const reportData = (transactionReports['outsideAttendance']?.data || []) as any[];

  useEffect(() => {
    fetchTransactionReport('outsideAttendance', filters);
  }, [filters, fetchTransactionReport]);

  useEffect(() => {
    const fetchCompanySettings = async () => {
      const auth = await validateAuth();
      if (auth.tenantId) {
        const { data } = await supabase
          .from('company_settings')
          .select('*')
          .eq('tenant_id', auth.tenantId)
          .single();
        if (data) setCompanyInfo(data);
      }
    };
    fetchCompanySettings();
  }, []);

  // Handle click outside export dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(event.target as Node)) {
        setIsExportOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleExportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(reportData.map(item => ({
      'Employee ID': item.employeeCode,
      'Employee Name': item.name,
      'Department': item.department,
      'Date': item.date,
      'Clock In Time': item.clockInTime,
      'Clock In Location': item.clockInLocation,
      'Clock Out Time': item.clockOutTime,
      'Clock Out Location': item.clockOutLocation,
      'Status': item.status
    })));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Outside Attendance Report');
    XLSX.writeFile(wb, `Outside_Attendance_Report_${filters.startDate}_to_${filters.endDate}.xlsx`);
    setIsExportOpen(false);
  };

  const handleExportPDF = () => {
    const element = document.createElement('div');
    element.innerHTML = `
      <div style="padding: 20px; font-family: sans-serif;">
        <h2 style="font-size: 18px; margin-bottom: 5px; color: #111827;">${companyInfo?.company_name || 'Outside Attendance Report'}</h2>
        <p style="font-size: 12px; color: #4B5563; margin-bottom: 5px;">Period: ${filters.startDate} to ${filters.endDate}</p>
        ${filters.department ? `<p style="font-size: 12px; color: #4B5563; margin-bottom: 20px;">Department: ${filters.department}</p>` : ''}
        <style>
          table { width: 100%; border-collapse: collapse; font-size: 10px; margin-top: 15px; }
          th, td { border: 1px solid #E5E7EB; padding: 8px 12px; text-align: left; }
          th { background-color: #F9FAFB; color: #374151; font-weight: 600; text-transform: uppercase; }
          td { color: #4B5563; }
        </style>
        <table>
          <thead>
            <tr>
              <th style="width: 8%">Employee ID</th>
              <th style="width: 12%">Name</th>
              <th style="width: 12%">Department</th>
              <th style="width: 8%">Date</th>
              <th style="width: 8%">Clock In</th>
              <th style="width: 17%">In Location</th>
              <th style="width: 8%">Clock Out</th>
              <th style="width: 17%">Out Location</th>
              <th style="width: 8%">Status</th>
            </tr>
          </thead>
          <tbody>
            ${reportData.map(item => `
              <tr>
                <td>${item.employeeCode}</td>
                <td style="font-weight: 500; color: #111827;">${item.name}</td>
                <td>${item.department}</td>
                <td>${item.date}</td>
                <td>${item.clockInTime}</td>
                <td>${item.clockInLocation}</td>
                <td>${item.clockOutTime}</td>
                <td>${item.clockOutLocation}</td>
                <td>${item.status}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    const opt = {
      margin:       10,
      filename:     `Outside_Attendance_Report_${filters.startDate}_to_${filters.endDate}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'landscape' }
    };

    html2pdf().set(opt).from(element).save();
    setIsExportOpen(false);
  };

  const handlePrint = () => {
    window.print();
    setIsExportOpen(false);
  };

  if (loading) return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div></div>;
  if (error) return <div className="rounded-md bg-red-50 p-4"><div className="flex"><AlertCircle className="h-5 w-5 text-red-400" /><div className="ml-3"><h3 className="text-sm font-medium text-red-800">{error}</h3></div></div></div>;
  if (reportData.length === 0) return <div className="text-center py-12"><FileText className="mx-auto h-12 w-12 text-gray-400" /><h3 className="mt-2 text-sm font-medium text-gray-900">No outside attendance found</h3><p className="mt-1 text-sm text-gray-500">All attendance records are within the office for the selected period.</p></div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-lg font-medium text-gray-900">Outside Attendance Report</h2>
          <p className="text-sm text-gray-500">List of employees who clocked in or out from outside the office.</p>
        </div>
        <div className="relative" ref={exportDropdownRef}>
          <button
            onClick={() => setIsExportOpen(!isExportOpen)}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            <Download className="h-4 w-4 mr-2" />
            Export
            <ChevronDown className="h-4 w-4 ml-2" />
          </button>
          
          {isExportOpen && (
            <div className="origin-top-right absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-10">
              <div className="py-1" role="menu">
                <button
                  onClick={handleExportPDF}
                  className="flex w-full items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  <FileDown className="h-4 w-4 mr-2 text-red-500" />
                  Export as PDF
                </button>
                <button
                  onClick={handleExportExcel}
                  className="flex w-full items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  <FileDown className="h-4 w-4 mr-2 text-green-500" />
                  Export as Excel
                </button>
                <button
                  onClick={handlePrint}
                  className="flex w-full items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  <Printer className="h-4 w-4 mr-2 text-gray-500" />
                  Print Report
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200" ref={tableRef}>
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Employee ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Department</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Clock In</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">In Location</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Clock Out</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Out Location</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {reportData.map((item, idx) => (
                <tr key={`${item.empId}-${item.date}-${idx}`} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 min-w-[150px]">{item.employeeCode}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.department}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.date}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.clockInTime}</td>
                  <td className="px-6 py-4 whitespace-normal text-sm text-gray-500 min-w-[250px] max-w-[400px]">{item.clockInLocation}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.clockOutTime}</td>
                  <td className="px-6 py-4 whitespace-normal text-sm text-gray-500 min-w-[250px] max-w-[400px]">{item.clockOutLocation}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                      {item.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
