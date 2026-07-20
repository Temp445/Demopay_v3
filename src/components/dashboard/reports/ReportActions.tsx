import React, { useState, useRef, useEffect } from 'react';
import { Download, ChevronDown, Printer } from 'lucide-react';
import { exportToCSV, exportToExcel, exportToPDF } from '../../../lib/export';

interface ReportActionsProps {
  data: any[];
  columns: string[];
  title: string;
  onPrint?: () => void; // Optional custom print handler, defaults to window.print
}

export default function ReportActions({ 
  data, 
  columns, 
  title,
  onPrint 
}: ReportActionsProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDropdown]);

  const handleExport = (type: 'csv' | 'excel' | 'pdf') => {
    if (!data || data.length === 0) return;

    // Filter data to only include visible columns
    const dataToExport = data.map((row: any) => {
      const cleanRow: Record<string, any> = {};
      columns.forEach((colKey) => {
        cleanRow[colKey] = row[colKey];
      });
      return cleanRow;
    });

    const fileName = `${title.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}`;

    try {
      if (type === 'csv') exportToCSV(dataToExport, fileName);
      if (type === 'excel') exportToExcel(dataToExport, fileName);
      if (type === 'pdf') exportToPDF(dataToExport, fileName);
    } catch (err) {
      console.error("Export failed:", err);
    }
    
    setShowDropdown(false);
  };

  return (
    <div className="flex space-x-2">
      {/* Export Dropdown */}
      <div className="relative" ref={dropdownRef}>
        <button
          className="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
          onClick={() => setShowDropdown(!showDropdown)}
        >
          <Download className="h-4 w-4 mr-2" />
          Export
          <ChevronDown className="h-4 w-4 ml-1" />
        </button>

        {showDropdown && (
          <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-10 border border-gray-200">
            <div className="py-1">
              <button 
                onClick={() => handleExport('excel')} 
                className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
              >
                Export to Excel
              </button>
              <button 
                onClick={() => handleExport('csv')} 
                className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
              >
                Export to CSV
              </button>
              <button 
                onClick={() => handleExport('pdf')} 
                className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
              >
                Export to PDF
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Print Button */}
      <button 
        className="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50" 
        onClick={onPrint || (() => window.print())}
      >
        <Printer className="h-4 w-4 mr-2" /> 
        Print
      </button>
    </div>
  );
}