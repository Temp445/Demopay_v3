import React, { useState, useEffect, useMemo, useRef } from 'react';
import { FileDown, Printer, AlertCircle, FileText, Download, ChevronDown } from 'lucide-react';
import { useReportsStore } from '../../../stores/reportsStore';
import { supabase } from '../../../lib/supabase';
import * as XLSX from 'xlsx-js-style';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { validateAuth } from '../../../stores/utils/storeUtils';

interface MusterRollReportProps {
  filters: {
    startDate: string;
    endDate: string;
    department: string;
    employee: string;
  };
}

export default function MusterRollReport({ filters }: MusterRollReportProps) {
  const { transactionReports, loading, error, fetchTransactionReport } = useReportsStore();
  const [companyInfo, setCompanyInfo] = useState<any>(null);
  const [legendItems, setLegendItems] = useState<{code: string, label: string}[]>([]);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const tableRef = useRef<HTMLTableElement>(null);

  const reportData = (transactionReports['musterRoll']?.data || []) as any[];

  useEffect(() => {
    fetchTransactionReport('musterRoll', filters);
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

    const fetchLegendData = async () => {
      const auth = await validateAuth();
      if (!auth.tenantId) return;

      // Fetch ALL Leave Types first to decide on fallback
      const { data: allLeaveTypes, error: fetchError } = await supabase
        .from('leave_types')
        .select('*')
        .eq('tenant_id', auth.tenantId);

      if (fetchError) {
        console.error('Error fetching leave types:', fetchError);
      }

      const activeLeaveTypes = (allLeaveTypes || [])
        .filter(lt => {
          const status = (lt.status || '').toString().trim().toLowerCase();
          return status === 'active' || lt.is_active === true;
        })
        .map(lt => ({ 
          code: lt.code || lt.name, // Use code if exists, otherwise name
          label: (lt.description || lt.name || '').toUpperCase() 
        }));

      const dynamicLeaveTypes = activeLeaveTypes;

      // Only show fallback if the table is completely empty for this tenant
      // and we have absolutely no leave types at all
      if ((allLeaveTypes || []).length === 0) {
        dynamicLeaveTypes.push(
          { code: 'CL', label: 'CASUAL LEAVE' },
          { code: 'EL', label: 'EARNED LEAVE' },
          { code: 'ML', label: 'MEDICAL LEAVE' },
          { code: 'SL', label: 'SICK LEAVE' }
        );
      }

      const items = [
        { code: 'P', label: 'PRESENT' },
        { code: 'A', label: 'ABSENT' },
        { code: 'F', label: 'FORENOON PRESENT' },
        { code: 'AN', label: 'AFTERNOON PRESENT' },
        { code: 'WH', label: 'WEEKLY HOLIDAY / WEEK OFF' },
        { code: 'NH', label: 'NATIONAL HOLIDAY / PUBLIC HOLIDAY' },
        { code: 'GH', label: 'GENERAL HOLIDAY' },
        { code: 'PR', label: 'PERMISSION' },
        { code: 'LT', label: 'LATE' },
        { code: 'EE', label: 'EARLY EXIT' },
        { code: 'LOP', label: 'LOSS OF PAY' },
        { code: 'FO', label: 'FIRST OFF' },
        { code: 'SO', label: 'SECOND OFF' },
        ...dynamicLeaveTypes.sort((a, b) => a.code.localeCompare(b.code))
      ];
      setLegendItems(items);
    };
    fetchLegendData();
  }, []);

  const daysInMonth = useMemo(() => {
    if (!filters.startDate || !filters.endDate) return [];
    const start = new Date(filters.startDate);
    const end = new Date(filters.endDate);
    const days = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      days.push(new Date(d));
    }
    return days;
  }, [filters.startDate, filters.endDate]);

  const monthYearLabel = useMemo(() => {
    if (!filters.startDate) return '';
    const date = new Date(filters.startDate);
    return date.toLocaleString('default', { month: 'long', year: 'numeric' }).toUpperCase();
  }, [filters.startDate]);

  const handleExportExcel = () => {
    if (!reportData.length) return;

    const workbook = XLSX.utils.book_new();
    const sheetData: any[][] = [];

    // Header Rows
    // Row 1
    const row1 = Array(45).fill('');
    row1[0] = 'Name and Address of the Factory';
    row1[6] = 'FORM No. 25';
    row1[28] = 'Registration No.';
    sheetData.push(row1);

    // Row 2
    const row2 = Array(45).fill('');
    row2[0] = companyInfo?.company_name || '';
    row2[6] = '(Prescribed under Rule 103 of the Tamil Nadu Factories Rules, 1950)';
    row2[28] = companyInfo?.registration_number || '';
    sheetData.push(row2);

    // Row 3
    const addr = companyInfo?.address || {};
    const row3 = Array(45).fill('');
    row3[0] = addr.street || '';
    row3[6] = 'MUSTER ROLL FOR THE MONTH OF ' + monthYearLabel;
    sheetData.push(row3);

    // Row 4
    const row4 = Array(45).fill('');
    row4[0] = `${addr.city || ''} ${addr.state || ''} ${addr.postalCode || ''}`.trim();
    sheetData.push(row4);

    sheetData.push([]); // Row 5
    sheetData.push([]); // Row 6

    // Table Header - Row 7
    const row7 = [
      'SI. No.', 'Name of the worker', "Father's Name", 'Designation / Nature of work.', 'Date of birth to be supported by extract from Birth Register', '', '', 'Place of employment', 'Group No.', 'Relay No.', 'Periods of work', 'FOR THE PERIOD ENDING'
    ];
    sheetData.push(row7);

    // Row 8 - DOB Sub-labels and DATES
    const row8 = [
      '', '', '', '', 'Day', 'Month', 'Year', '', '', '', '', 'DATES'
    ];
    sheetData.push(row8);

    // Row 9 - Labels (1) to (10)
    const row9 = Array(12).fill('');
    row9[0] = '(1)';
    row9[1] = '(2)';
    row9[2] = '(3)';
    row9[3] = '(4)';
    row9[4] = '(5)';
    row9[7] = '(6)';
    row9[8] = '(7)';
    row9[9] = '(8)';
    row9[10] = '(9)';
    row9[11] = '(10)';
    sheetData.push(row9);

    // Row 10 - Date Numbers
    const row10 = Array(11).fill('');
    daysInMonth.forEach(d => row10.push(d.getDate()));
    sheetData.push(row10);

    // Employee Rows - Row 11 onwards
    reportData.forEach((emp, index) => {
      const row = [
        (index + 1).toString(),
        emp.name,
        emp.fatherName || '',
        emp.designation,
        emp.dob.day,
        emp.dob.month,
        emp.dob.year,
        '', '', '', '',
      ];
      daysInMonth.forEach(d => {
        row.push(emp.attendance[d.getDate()] || 'A');
      });
      sheetData.push(row);
    });

    sheetData.push([]);
    legendItems.forEach(item => {
      sheetData.push([`${item.code} - ${item.label}`]);
    });

    const worksheet = XLSX.utils.aoa_to_sheet(sheetData);

    // Apply Styles (Borders, Font, Alignment)
    const range = XLSX.utils.decode_range(worksheet['!ref']!);
    const lastColIndex = 10 + daysInMonth.length;
    for (let R = range.s.r; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        
        // Ensure cell exists for table area to hold borders
        if (!worksheet[addr]) {
          if (R >= 6 && R < (10 + reportData.length) && C <= lastColIndex) {
             worksheet[addr] = { v: '', t: 's' };
          } else {
             continue;
          }
        }

        const style: any = {
          font: { sz: 8, name: 'Arial' },
          alignment: { vertical: "center", wrapText: true }
        };

        // Header Rows (1-4) Styling
        if (R < 4) {
          style.font.sz = 9;
          if (C < 4) {
             style.border = { bottom: { style: "thin" } };
          }
          if (R === 0 && C === 6) { // FORM No. 25
            style.font.sz = 16;
            style.font.bold = true;
            style.alignment.horizontal = "center";
          }
          if (R === 1 && C === 6) { // Prescribed under...
            style.alignment.horizontal = "center";
          }
          if (R === 2 && C === 6) { // MUSTER ROLL title
            style.font.sz = 14;
            style.font.bold = true;
            style.alignment.horizontal = "center";
          }
          if (C >= 28 && C <= 32) {
             style.alignment.horizontal = "right";
             style.font.bold = true;
          }
        }

        // Table Area Styling (Row 7 onwards)
        if (R >= 6 && R < (10 + reportData.length)) {
          if (C <= lastColIndex) {
            style.border = {
              top: { style: "thin" },
              bottom: { style: "thin" },
              left: { style: "thin" },
              right: { style: "thin" }
            };
          }
          
          if (R < 10) {
            style.font.bold = true;
            style.alignment.horizontal = "center";
            style.fill = { fgColor: { rgb: "F9F9F9" } };

            // Vertical Text for main header rows only (R: 6-7)
            if (R < 8 && (C === 0 || (C >= 7 && C <= 10))) {
               style.alignment.textRotation = 90;
               style.alignment.vertical = "center";
            }
          } else {
            if (C === 0 || (C >= 4 && C <= 6) || C >= 11) {
              style.alignment.horizontal = "center";
            } else {
              style.alignment.horizontal = "left";
            }
          }
        }

        worksheet[addr].s = style;
      }
    }

    // Row Heights
    worksheet['!rows'] = Array(sheetData.length).fill({ hpt: 20 });
    worksheet['!rows'][6] = { hpt: 100 }; // Main header row (Vertical text)
    worksheet['!rows'][7] = { hpt: 30 };  // DOB Sub-header (Day/Month/Year)
    worksheet['!rows'][8] = { hpt: 25 };  // Labels (1-10)
    worksheet['!rows'][9] = { hpt: 25 };  // Date Numbers

    // Column Widths
    worksheet['!cols'] = [
      { wch: 4 },  // SI. No. (Vertical)
      { wch: 25 }, // Name
      { wch: 20 }, // Father's Name
      { wch: 25 }, // Designation
      { wch: 6 },  // Day
      { wch: 6 },  // Month
      { wch: 10 }, // Year
      { wch: 4 },  // Place (Vertical)
      { wch: 4 },  // Group (Vertical)
      { wch: 4 },  // Relay (Vertical)
      { wch: 4 },  // Periods (Vertical)
    ];
    for (let i = 11; i <= lastColIndex; i++) {
      worksheet['!cols'].push({ wch: 3.5 });
    }

    // Merging
    const legendStartRow = 10 + reportData.length + 1;
    worksheet['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },   // Name and Address label
      { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } },   // Company Name
      { s: { r: 2, c: 0 }, e: { r: 2, c: 3 } },   // Address Line 1
      { s: { r: 3, c: 0 }, e: { r: 3, c: 3 } },   // Address Line 2

      { s: { r: 0, c: 6 }, e: { r: 0, c: 25 } }, // FORM No. 25
      { s: { r: 1, c: 6 }, e: { r: 1, c: 25 } }, // Prescribed under...
      { s: { r: 2, c: 6 }, e: { r: 2, c: 25 } },  // MUSTER ROLL label
      
      { s: { r: 0, c: 28 }, e: { r: 0, c: 32 } }, // Registration No. label
      { s: { r: 1, c: 28 }, e: { r: 1, c: 32 } }, // Registration No. value

      { s: { r: 6, c: 0 }, e: { r: 7, c: 0 } },   // SI. No (7-8)
      { s: { r: 6, c: 1 }, e: { r: 7, c: 1 } },   // Name (7-8)
      { s: { r: 6, c: 2 }, e: { r: 7, c: 2 } },   // Father's Name (7-8)
      { s: { r: 6, c: 3 }, e: { r: 7, c: 3 } },   // Designation (7-8)
      { s: { r: 6, c: 4 }, e: { r: 6, c: 6 } },   // DOB Header (7)
      { s: { r: 6, c: 7 }, e: { r: 7, c: 7 } },   // Place (7-8)
      { s: { r: 6, c: 8 }, e: { r: 7, c: 8 } },   // Group (7-8)
      { s: { r: 6, c: 9 }, e: { r: 7, c: 9 } },   // Relay (7-8)
      { s: { r: 6, c: 10 }, e: { r: 7, c: 10 } }, // Periods (7-8)
      
      { s: { r: 6, c: 11 }, e: { r: 6, c: lastColIndex } }, // Row 7: FOR THE PERIOD ENDING
      { s: { r: 7, c: 11 }, e: { r: 7, c: lastColIndex } }, // Row 8: DATES
      
      // Merging Row 9 and Row 10 for first 11 columns
      { s: { r: 8, c: 0 }, e: { r: 9, c: 0 } },   // (1) label
      { s: { r: 8, c: 1 }, e: { r: 9, c: 1 } },   // (2) label
      { s: { r: 8, c: 2 }, e: { r: 9, c: 2 } },   // (3) label
      { s: { r: 8, c: 3 }, e: { r: 9, c: 3 } },   // (4) label
      { s: { r: 8, c: 4 }, e: { r: 9, c: 6 } },   // (5) label spans 3 cols
      { s: { r: 8, c: 7 }, e: { r: 9, c: 7 } },   // (6) label
      { s: { r: 8, c: 8 }, e: { r: 9, c: 8 } },   // (7) label
      { s: { r: 8, c: 9 }, e: { r: 9, c: 9 } },   // (8) label
      { s: { r: 8, c: 10 }, e: { r: 9, c: 10 } }, // (9) label

      { s: { r: 8, c: 11 }, e: { r: 8, c: lastColIndex } }, // Row 9: (10) spans dates
    ];

    // Dynamic Legend Merges
    legendItems.forEach((_, i) => {
      const r = legendStartRow + i;
      worksheet['!merges']?.push({ s: { r, c: 0 }, e: { r, c: 5 } });
    });

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Muster Roll');
    XLSX.writeFile(workbook, `MusterRollReport_${monthYearLabel.replace(' ', '_')}.xlsx`);
  };

  const handleExportCSV = () => {
    if (!reportData.length) return;
    
    // We can reuse the Excel logic but without styles
    const workbook = XLSX.utils.book_new();
    const sheetData: any[][] = [];
    
    // Header
    sheetData.push(['MUSTER ROLL - ' + (companyInfo?.company_name || '')]);
    sheetData.push(['Month:', monthYearLabel]);
    sheetData.push([]);

    // Table Header
    const headers = ['SI. No.', 'Name', 'Father Name', 'Designation', 'DOB Day', 'DOB Month', 'DOB Year'];
    daysInMonth.forEach(d => headers.push(d.getDate().toString()));
    sheetData.push(headers);

    // Data
    reportData.forEach((emp, index) => {
      const row = [
        (index + 1).toString(),
        emp.name,
        emp.fatherName || '',
        emp.designation,
        emp.dob.day,
        emp.dob.month,
        emp.dob.year,
      ];
      daysInMonth.forEach(d => row.push(emp.attendance[d.getDate()] || 'A'));
      sheetData.push(row);
    });

    const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
    const csv = XLSX.utils.sheet_to_csv(worksheet);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `MusterRollReport_${monthYearLabel.replace(' ', '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPDF = () => {
    if (!tableRef.current || !reportData.length) return;

    const doc = new jsPDF('l', 'mm', 'a4');
    
    // Title
    doc.setFontSize(14);
    doc.text(`MUSTER ROLL - ${companyInfo?.company_name || ''}`, 14, 15);
    doc.setFontSize(10);
    doc.text(`For the month of ${monthYearLabel}`, 14, 22);

    autoTable(doc, {
      html: tableRef.current,
      startY: 30,
      styles: { 
        fontSize: 6, 
        cellPadding: 0.8,
        valign: 'middle',
        halign: 'center',
        lineWidth: 0.1,
        lineColor: [200, 200, 200]
      },
      headStyles: { 
        fillColor: [79, 70, 229], 
        textColor: 255,
        minCellHeight: 8
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center', valign: 'middle' },
        1: { cellWidth: 20 },
        2: { cellWidth: 20 },
        3: { cellWidth: 20 },
        4: { cellWidth: 8 },
        5: { cellWidth: 8 },
        6: { cellWidth: 10 },
        7: { cellWidth: 12, halign: 'center', valign: 'middle' },
        8: { cellWidth: 12, halign: 'center', valign: 'middle' },
        9: { cellWidth: 12, halign: 'center', valign: 'middle' },
        10: { cellWidth: 12, halign: 'center', valign: 'middle' },
      },
      theme: 'grid',
    });

    // Add Legend at the bottom
    const finalY = (doc as any).lastAutoTable.finalY || 30;
    doc.setFontSize(8);
    doc.text('Attendance Legend:', 14, finalY + 10);

    const legendRows = [];
    for (let i = 0; i < legendItems.length; i += 4) {
      const chunk = legendItems.slice(i, i + 4);
      legendRows.push(chunk.map(item => `${item.code}: ${item.label}`));
    }

    autoTable(doc, {
      startY: finalY + 12,
      body: legendRows,
      styles: { fontSize: 6, cellPadding: 1 },
      theme: 'plain',
    });

    doc.save(`MusterRollReport_${monthYearLabel.replace(' ', '_')}.pdf`);
  };

  if (loading) return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div></div>;
  if (error) return <div className="rounded-md bg-red-50 p-4"><div className="flex"><AlertCircle className="h-5 w-5 text-red-400" /><div className="ml-3"><h3 className="text-sm font-medium text-red-800">{error}</h3></div></div></div>;
  if (reportData.length === 0) return <div className="text-center py-12"><FileText className="mx-auto h-12 w-12 text-gray-400" /><h3 className="mt-2 text-sm font-medium text-gray-900">No data available</h3><p className="mt-1 text-sm text-gray-500">Try changing your filters.</p></div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-lg font-medium text-gray-900 flex items-center">
          <FileText className="h-5 w-5 mr-2 text-indigo-600" />
          Muster Roll Report
        </h2>
        <div className="flex items-center space-x-3">
          <div className="relative">
            <button
              onClick={() => setIsExportOpen(!isExportOpen)}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none"
            >
              <Download className="h-4 w-4 mr-2" />
              Export
              <ChevronDown className={`ml-2 h-4 w-4 transform transition-transform ${isExportOpen ? 'rotate-180' : ''}`} />
            </button>

            {isExportOpen && (
              <div className="absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-50">
                <div className="py-1" role="menu">
                  <button
                    onClick={() => { handleExportExcel(); setIsExportOpen(false); }}
                    className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    Export to Excel
                  </button>
                  <button
                    onClick={() => { handleExportCSV(); setIsExportOpen(false); }}
                    className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    Export to CSV
                  </button>
                  <button
                    onClick={() => { handleExportPDF(); setIsExportOpen(false); }}
                    className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    Export to PDF
                  </button>
                </div>
              </div>
            )}
          </div>
          
          <button
            onClick={() => window.print()}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            <Printer className="h-4 w-4 mr-2 text-gray-600" />
            Print
          </button>
        </div>
      </div>

      <div className="bg-white shadow overflow-hidden sm:rounded-lg border border-gray-200">
        <div className="p-6 overflow-x-auto">
          <table ref={tableRef} className="min-w-full border-collapse border border-gray-300 text-[10px]">
            <thead>
              <tr className="bg-gray-50 h-28">
                <th rowSpan={2} className="border border-gray-300 px-1 py-2 text-center align-middle" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>SI. No.</th>
                <th rowSpan={2} className="border border-gray-300 px-2 py-1 text-left min-w-[150px]">Name of the worker</th>
                <th rowSpan={2} className="border border-gray-300 px-2 py-1 text-left min-w-[120px]">Father's Name</th>
                <th rowSpan={2} className="border border-gray-300 px-2 py-1 text-left min-w-[150px]">Designation / Nature of work.</th>
                <th colSpan={3} className="border border-gray-300 px-2 py-1 text-center">Date of birth to be supported by extract from Birth Register</th>
                <th rowSpan={2} className="border border-gray-300 px-1 py-2 text-center align-middle" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>Place of employment</th>
                <th rowSpan={2} className="border border-gray-300 px-1 py-2 text-center align-middle" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>Group No.</th>
                <th rowSpan={2} className="border border-gray-300 px-1 py-2 text-center align-middle" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>Relay No.</th>
                <th rowSpan={2} className="border border-gray-300 px-1 py-2 text-center align-middle" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>Periods of work</th>
                <th className="border border-gray-300 px-2 py-1 text-center" colSpan={daysInMonth.length}>FOR THE PERIOD ENDING</th>
              </tr>
              <tr className="bg-gray-50">
                <th className="border border-gray-300 px-1 py-1">Day</th>
                <th className="border border-gray-300 px-1 py-1">Month</th>
                <th className="border border-gray-300 px-1 py-1">Year</th>
                <th className="border border-gray-300 px-2 py-1 text-center" colSpan={daysInMonth.length}>DATES</th>
              </tr>
              <tr className="bg-gray-50 font-bold">
                <th rowSpan={2} className="border border-gray-300 px-1 py-1 text-center align-middle">(1)</th>
                <th rowSpan={2} className="border border-gray-300 px-1 py-1 text-center align-middle">(2)</th>
                <th rowSpan={2} className="border border-gray-300 px-1 py-1 text-center align-middle">(3)</th>
                <th rowSpan={2} className="border border-gray-300 px-1 py-1 text-center align-middle">(4)</th>
                <th rowSpan={2} colSpan={3} className="border border-gray-300 px-1 py-1 text-center align-middle">(5)</th>
                <th rowSpan={2} className="border border-gray-300 px-1 py-1 text-center align-middle">(6)</th>
                <th rowSpan={2} className="border border-gray-300 px-1 py-1 text-center align-middle">(7)</th>
                <th rowSpan={2} className="border border-gray-300 px-1 py-1 text-center align-middle">(8)</th>
                <th rowSpan={2} className="border border-gray-300 px-1 py-1 text-center align-middle">(9)</th>
                <th className="border border-gray-300 px-1 py-1 text-center" colSpan={daysInMonth.length}>(10)</th>
              </tr>
              <tr className="bg-gray-50">
                {daysInMonth.map(date => (
                  <th key={date.getDate()} className="border border-gray-300 px-1 py-1 text-center w-8">
                    {date.getDate()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reportData.map((emp, idx) => (
                <tr key={emp.employeeId} className="hover:bg-gray-50">
                  <td className="border border-gray-300 px-2 py-2 text-center">{idx + 1}</td>
                  <td className="border border-gray-300 px-2 py-2 font-medium">{emp.name}</td>
                  <td className="border border-gray-300 px-2 py-2">{emp.fatherName}</td>
                  <td className="border border-gray-300 px-2 py-2 uppercase">{emp.designation}</td>
                  <td className="border border-gray-300 px-1 py-2 text-center">{emp.dob.day}</td>
                  <td className="border border-gray-300 px-1 py-2 text-center">{emp.dob.month}</td>
                  <td className="border border-gray-300 px-1 py-2 text-center">{emp.dob.year}</td>
                  <td className="border border-gray-300 px-2 py-2 text-center"></td>
                  <td className="border border-gray-300 px-2 py-2 text-center"></td>
                  <td className="border border-gray-300 px-2 py-2 text-center"></td>
                  <td className="border border-gray-300 px-2 py-2 text-center"></td>
                  {daysInMonth.map(d => {
                    const status = emp.attendance[d.getDate()];
                    const bgColor = 
                      status === 'P' ? 'text-green-600 font-bold' : 
                      status === 'WH' ? 'bg-gray-100 text-gray-500' :
                      status === 'NH' || status === 'GH' ? 'bg-indigo-50 text-indigo-700 font-bold' :
                      status === 'A' ? 'text-red-600 font-bold' :
                      'text-orange-600';
                    return (
                      <td key={d.getDate()} className={`border border-gray-300 px-1 py-2 text-center ${bgColor}`}>
                        {status}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          {/* Legend for Preview */}
          <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4 text-[10px] text-gray-600 uppercase border-t pt-6">
            {legendItems.map((item, idx) => (
              <div key={idx} className={`flex items-center space-x-2 ${item.code === 'P' ? 'text-green-600' : item.code === 'A' ? 'text-red-600' : ''}`}>
                <span className="font-bold w-12">{item.code}</span>
                <span>- {item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
