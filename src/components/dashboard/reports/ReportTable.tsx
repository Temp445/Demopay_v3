import { useState, useEffect } from 'react';
import { CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

interface ReportTableProps {
  data: any[];
  columns: string[];
}

const NUMERIC_COLUMNS = ['employeeCode', 'salary', 'amount', 'age', 'netAmount', 'earnings', 'deductions', 'lopDays', 'totalWorkingDays', 'paidWorkingDays'];


export default function ReportTable({ data, columns }: ReportTableProps) {
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const [tempSortField, setTempSortField] = useState<string | null>(null);
  const [tempSortDirection, setTempSortDirection] = useState<'asc' | 'desc'>('asc');

  const [tempFilters, setTempFilters] = useState<any>({});
  const [filters, setFilters] = useState<any>({});

  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    setSortField(tempSortField);
    setSortDirection(tempSortDirection);
    setCurrentPage(1);
  }, [tempSortField, tempSortDirection]);

  // Sorting
  const sortedData = [...data].sort((a, b) => {
    if (!sortField) return 0;

    let aValue = a[sortField];
    let bValue = b[sortField];

    if (aValue == null) return sortDirection === 'asc' ? -1 : 1;
    if (bValue == null) return sortDirection === 'asc' ? 1 : -1;

    if (NUMERIC_COLUMNS.includes(sortField) || typeof aValue === 'number') {
      return sortDirection === 'asc' ? Number(aValue) - Number(bValue) : Number(bValue) - Number(aValue);
    }

    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return sortDirection === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
    }

    return 0;
  });

  // Filtering
  const filteredData = sortedData.filter((row) => {
    return Object.entries(filters).every(([col, filter]: any) => {
      if (!filter) return true;
      const value = row[col];

      if (typeof filter === 'object') {
        // Numeric filter
        if (filter.min != null && value < filter.min) return false;
        if (filter.max != null && value > filter.max) return false;
        // Date filter
        if (filter.start && new Date(value) < new Date(filter.start)) return false;
        if (filter.end && new Date(value) > new Date(filter.end)) return false;
      } else {
        // String filter
        if (value !== filter) return false;
      }
      return true;
    });
  });

  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const paginatedData = filteredData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const formatOTDuration = (hours: number): string => {
    const totalMins = Math.round(hours * 60);
    if (totalMins === 0) return '0m';
    if (totalMins < 60) return `${totalMins}m`;
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
  };

  const formatCellValue = (value: any, column?: string) => {
    if (value === null || value === undefined) return '-';
    if (column === 'employeeCode') return String(value);
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'number') {
      const colName = column?.toLowerCase() || '';
      
      // List of numeric columns that should NOT have currency formatting
      const isNonCurrency = [
        'lopdays', 'totalworkingdays', 'paidworkingdays', 
        'employeecount', 'othours', 'hours', 'totalrecords',
        'totalothours', 'averageperformancerating'
      ].includes(colName);

      if (isNonCurrency) {
        if (colName === 'othours' || colName === 'hours' || colName === 'totalothours') {
          return formatOTDuration(value);
        }
        return value.toLocaleString(); 
      }

      // Check if THIS specific column is amount/salary/financial related
      const isCurrency = [
        'amount', 'salary', 'bonus', 'netpay', 'hra', 'basic', 
        'conveyance', 'allowance', 'reimbursement', 'contribution', 
        'pf', 'esi', 'loan', 'advance', 'arrears', 'overtime',
        'netamount', 'earnings', 'deductions', 'tax', 'tds'
      ].some(keyword => colName.includes(keyword));

      if (isCurrency) {
        return value.toLocaleString('en-IN', { style: 'currency', currency: 'INR' });
      }
      
      return value.toLocaleString();
    }
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
      return new Date(value).toLocaleDateString('en-GB'); // dd/MM/yyyy
    }
    return String(value);
  };

  const formatColumnHeader = (column: string) => {
    if (column === 'startDate') return 'Join Date';
    if (column === 'lopDays') return 'LOP';
    if (column === 'totalWorkingDays') return 'Work Days'; 
    if (column === 'paidWorkingDays') return 'Paid Days';
    return column
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/_/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  const HIDDEN_FILTERS = ['taxid', 'address', 'taxId'];

  return (
    <div className="w-full">
      {/* Filter Toggle */}
      <div className="flex justify-end m-2">
        <button
          onClick={() => setIsFilterOpen(!isFilterOpen)}
          className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-sm"
        >
          {isFilterOpen ? 'Close Filters' : 'Filter Data'}
        </button>
      </div>

      {/* Filter Panel */}
      {isFilterOpen && (
        <div className="mb-4 p-4 border rounded bg-gray-50 flex flex-wrap gap-4 shadow-inner">
          {columns.map((column) => {
            if (HIDDEN_FILTERS.includes(column.toLowerCase())) return null;

            const colValues = data.map((row) => row[column]).filter(v => v != null);
            const isNumeric = NUMERIC_COLUMNS.includes(column) || colValues.every(v => !isNaN(v));
            const isDate = colValues.every(v => /^\d{4}-\d{2}-\d{2}/.test(v));
            const isString = !isNumeric && !isDate;

            return (
              <div key={column} className="flex flex-col gap-1">
                <label className="text-sm font-medium">{formatColumnHeader(column)}</label>

                {/* Numeric Filter */}
                {isNumeric && (
                  <div className="flex gap-2">
                    <input
                      type="number"
                      placeholder="Min"
                      className="border px-2 py-1 rounded w-24"
                      onChange={(e) =>
                        setTempFilters((prev: any) => ({
                          ...prev,
                          [column]: { ...prev[column], min: e.target.value ? Number(e.target.value) : undefined }
                        }))
                      }
                    />
                    <input
                      type="number"
                      placeholder="Max"
                      className="border px-2 py-1 rounded w-24"
                      onChange={(e) =>
                        setTempFilters((prev: any) => ({
                          ...prev,
                          [column]: { ...prev[column], max: e.target.value ? Number(e.target.value) : undefined }
                        }))
                      }
                    />
                  </div>
                )}

                {/* String Filter */}
                {isString && (
                  <select
                    className="border px-3 py-1 rounded w-48"
                    onChange={(e) => setTempFilters((prev: any) => ({
                      ...prev,
                      [column]: e.target.value || undefined
                    }))}
                  >
                    <option value="">All</option>
                    {[...new Set(colValues)].map((val) => (
                      <option key={val} value={val}>{val}</option>
                    ))}
                  </select>
                )}

                {/* Date Filter using react-datepicker */}
                {isDate && (
                  <div className="flex gap-2 items-center">
                    <DatePicker
                      selected={tempFilters[column]?.start ? new Date(tempFilters[column].start) : null}
                      onChange={(date: Date | null) =>
                        setTempFilters((prev: any) => ({
                          ...prev,
                          [column]: { ...prev[column], start: date ? date.toISOString().split('T')[0] : undefined }
                        }))
                      }
                      dateFormat="dd/MM/yyyy"
                      placeholderText="dd/MM/yyyy"
                      className="border px-2 py-1 rounded w-36"
                      isClearable
                    />
                    <DatePicker
                      selected={tempFilters[column]?.end ? new Date(tempFilters[column].end) : null}
                      onChange={(date: Date | null) =>
                        setTempFilters((prev: any) => ({
                          ...prev,
                          [column]: { ...prev[column], end: date ? date.toISOString().split('T')[0] : undefined }
                        }))
                      }
                      dateFormat="dd/MM/yyyy"
                      placeholderText="dd/MM/yyyy"
                      className="border px-2 py-1 rounded w-36"
                      isClearable
                    />
                    <CalendarIcon className="h-5 w-5 text-gray-400 pointer-events-none" />
                  </div>
                )}
              </div>
            );
          })}

          {/* Apply & Clear */}
          <div className="flex gap-2 mt-auto ml-auto">
            <button
              onClick={() => { setFilters(tempFilters); setCurrentPage(1); }}
              className="px-4 py-1 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700"
            >
              Apply
            </button>
            <button
              onClick={() => { setFilters({}); setTempFilters({}); setTempSortField(null); setSortField(null); setCurrentPage(1); }}
              className="px-4 py-1 bg-white border border-gray-300 text-gray-700 rounded text-sm hover:bg-gray-50"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Table & Pagination remain same as previous version */}
      <div className="overflow-x-auto border rounded shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-100">
            <tr>
              {columns.map(column => (
                <th
                  key={column}
                  className="px-4 py-4 text-left text-xs font-bold text-gray-700 uppercase whitespace-nowrap border-b border-gray-200 cursor-pointer hover:bg-gray-200"
                  onClick={() => {
                    if (sortField === column) {
                      setTempSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                    } else {
                      setTempSortField(column);
                      setSortField(column);
                      setTempSortDirection('asc');
                      setSortDirection('asc');
                    }
                  }}
                >
                  {formatColumnHeader(column)}
                  {sortField === column && <span> {sortDirection === 'asc' ? '↑' : '↓'}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {paginatedData.length > 0 ? (
              paginatedData.map((row, rowIndex) => (
               <tr
  key={rowIndex}
  className={`transition-colors
    ${
      row.status === 'Absent'
        ? 'bg-red-100 hover:bg-red-100'
        : 'hover:bg-indigo-50'
    }
  `}
>

                  {columns.map(column => (
                    <td key={column} className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 border-b border-gray-100">
                      {formatCellValue(row[column], column)}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-gray-500 text-sm">
                  No data matches your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t px-4 py-3 bg-gray-50">
          <p className="text-sm text-gray-700">
            Showing <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span> to{' '}
            <span className="font-medium">{Math.min(currentPage * itemsPerPage, filteredData.length)}</span> of{' '}
            <span className="font-medium">{filteredData.length}</span>
          </p>
          <div className="flex gap-1">
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(p => p - 1)}
              className="p-1 border rounded bg-white hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={18} />
            </button>
            {[...Array(totalPages)].map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentPage(i + 1)}
                className={`px-3 py-1 border rounded text-sm font-medium ${
                  currentPage === i + 1 ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                {i + 1}
              </button>
            ))}
            <button
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(p => p + 1)}
              className="p-1 border rounded bg-white hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
