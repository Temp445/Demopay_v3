import React, { useState, useEffect, useRef } from 'react';
import { FileDown, Printer, AlertCircle, FileText, Download, ChevronDown } from 'lucide-react';
import { useReportsStore } from '../../../stores/reportsStore';
import { supabase } from '../../../lib/supabase';
import * as XLSX from 'xlsx-js-style';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { validateAuth } from '../../../stores/utils/storeUtils';

interface TimestampMismatchReportProps {
  filters: {
    startDate: string;
    endDate: string;
    department: string;
    employee: string;
  };
}

export default function TimestampMismatchReport({ filters }: TimestampMismatchReportProps) {
  const { transactionReports, loading, error, fetchTransactionReport } = useReportsStore();
  const [companyInfo, setCompanyInfo] = useState<any>(null);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const tableRef = useRef<HTMLTableElement>(null);
  const exportDropdownRef = useRef<HTMLDivElement>(null);

  const reportData = (transactionReports['timestampMismatch']?.data || []) as any[];

  useEffect(() => {
    fetchTransactionReport('timestampMismatch', filters);
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
      'Employee ID': item.empId,
      'Employee Name': item.name,
      'Shift Date': item.shiftDate,
      'Shift Timing': item.shiftTiming,
      'Clock In Time': item.clockInTime || '-',
      'Clock Out Time': item.clockOutTime || '-',
      'Attendance Status': item.attendanceStatus,
      'Leave Status': item.leaveStatus || '-',
      'Mismatch Reason': item.mismatchReason,
      'Fix the Issue': item.resolution
    })));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Mismatch Report');
    XLSX.writeFile(wb, `Timestamp_Mismatch_Report_${filters.startDate}_to_${filters.endDate}.xlsx`);
    setIsExportOpen(false);
  };

  const handleExportPDF = () => {
    const doc = new jsPDF('l', 'mm', 'a4');
    
    // Header
    doc.setFontSize(16);
    doc.text(companyInfo?.company_name || 'Timestamp Mismatch Report', 14, 15);
    doc.setFontSize(10);
    doc.text(`Period: ${filters.startDate} to ${filters.endDate}`, 14, 22);
    if (filters.department) doc.text(`Department: ${filters.department}`, 14, 27);

    autoTable(doc, {
      startY: 32,
      head: [[
        'ID', 'Name', 'Date', 'Shift Timing', 'In', 'Out', 'Status', 'Leave', 'Mismatch Reason', 'Fix the Issue'
      ]],
      body: reportData.map(item => [
        item.empId,
        item.name,
        item.shiftDate,
        item.shiftTiming,
        item.clockInTime || '-',
        item.clockOutTime || '-',
        item.attendanceStatus,
        item.leaveStatus,
        item.mismatchReason,
        item.resolution
      ]),
      columnStyles: {
        0: { cellWidth: 15 }, // ID
        1: { cellWidth: 25 }, // Name
        2: { cellWidth: 20 }, // Date
        3: { cellWidth: 25 }, // Shift
        4: { cellWidth: 15 }, // In
        5: { cellWidth: 15 }, // Out
        6: { cellWidth: 18 }, // Status
        7: { cellWidth: 18 }, // Leave
        8: { cellWidth: 45 }, // Mismatch Reason
        9: { cellWidth: 65 } // Resolution
      },
      styles: { fontSize: 7, cellPadding: 1.5, overflow: 'linebreak' },
      headStyles: { fillColor: [79, 70, 229], fontSize: 7 },
      theme: 'grid'
    });

    doc.save(`Timestamp_Mismatch_Report_${filters.startDate}_to_${filters.endDate}.pdf`);
    setIsExportOpen(false);
  };

  const handlePrint = () => {
    window.print();
    setIsExportOpen(false);
  };

  if (loading) return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div></div>;
  if (error) return <div className="rounded-md bg-red-50 p-4"><div className="flex"><AlertCircle className="h-5 w-5 text-red-400" /><div className="ml-3"><h3 className="text-sm font-medium text-red-800">{error}</h3></div></div></div>;
  if (reportData.length === 0) return <div className="text-center py-12"><FileText className="mx-auto h-12 w-12 text-gray-400" /><h3 className="mt-2 text-sm font-medium text-gray-900">No mismatches found</h3><p className="mt-1 text-sm text-gray-500">All attendance records match their timestamps for the selected period.</p></div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-lg font-medium text-gray-900">Timestamp Mismatch Report</h2>
          <p className="text-sm text-gray-500">Diagnostic report for sync and status inconsistencies.</p>
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
            <div className="absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-50">
              <div className="py-1">
                <button
                  onClick={handleExportExcel}
                  className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 w-full text-left"
                >
                  Export to Excel
                </button>
                <button
                  onClick={handleExportPDF}
                  className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 w-full text-left"
                >
                  Export to PDF
                </button>
                <button
                  onClick={handlePrint}
                  className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 w-full text-left"
                >
                  Print Report
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="overflow-x-auto border border-gray-200 rounded-lg shadow-sm">
        <table className="min-w-full divide-y divide-gray-200" ref={tableRef}>
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Emp ID</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Shift Timing</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Clock In</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Clock Out</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Leave</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Mismatch Reason</th>
              {/* <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Log</th> */}
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fix the Issue</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {reportData.map((item, idx) => (
              <tr key={`${item.empId}-${item.shiftDate}-${idx}`} className="hover:bg-gray-50">
                <td className="px-3 py-2 whitespace-nowrap text-xs font-medium text-gray-900">{item.empId}</td>
                <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-600">{item.name}</td>
                <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-600">{item.shiftDate}</td>
                <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-600">{item.shiftTiming}</td>
                <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-600">{item.clockInTime || '-'}</td>
                <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-600">{item.clockOutTime || '-'}</td>
                <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-600">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] ${
                    item.attendanceStatus === 'Present' ? 'bg-green-100 text-green-800' :
                    item.attendanceStatus === 'Absent' ? 'bg-red-100 text-red-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {item.attendanceStatus}
                  </span>
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-600">{item.leaveStatus}</td>
                <td className="px-3 py-2 text-xs text-red-600 font-medium min-w-[200px]" title={item.mismatchReason}>
                  {item.mismatchReason}
                </td>
                {/* <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-600">
                  <span className={item.attendanceLogAvailability === 'Yes' ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                    {item.attendanceLogAvailability}
                  </span>
                </td> */}
                <td className="px-3 py-2 text-xs text-indigo-600 font-medium min-w-[300px]" title={item.resolution}>
                  {item.resolution}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
