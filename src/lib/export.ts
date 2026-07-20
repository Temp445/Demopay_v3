import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

type ExportData = Record<string, string | number | boolean | null>;

/* ===========================================================
   HEADER FORMATTER (FINAL – ENTERPRISE SAFE)
   Converts:
   - employeeCode → Employee Code
   - ATTENDANCE_BONUS_BASIC → Attendance Bonus Basic
   - net_amount → Net Amount
=========================================================== */
const formatHeader = (key: string): string => {
  if (!key) return '';

  return key
    .replace(/_/g, ' ')                  // snake_case → space
    .replace(/([a-z])([A-Z])/g, '$1 $2') // camelCase → space
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map(word =>
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    )
    .join(' ');
};

/* ===========================================================
   FILE SAVE HELPER
=========================================================== */
const saveFile = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/* ===========================================================
   VALUE FORMATTERS
=========================================================== */

const formatOTDuration = (hours: number): string => {
  const totalMins = Math.round(hours * 60);
  if (totalMins === 0) return '0m';
  if (totalMins < 60) return `${totalMins}m`;
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
};

// Display formatter (CSV + PDF + Excel)
const formatForDisplay = (val: any, key?: string): string => {
  if (typeof val === 'number') {
    const colName = key?.toLowerCase() || '';
    // Apply duration formatting for OT related columns
    if (['othours', 'hours', 'totalothours'].includes(colName)) {
      return formatOTDuration(val);
    }
    return parseFloat(val.toFixed(2)).toString();
  }
  return (val ?? '').toString();
};

// Excel formatter (keeps numbers as numbers unless they are durations)
const formatForExcel = (val: any, key?: string): any => {
  if (typeof val === 'number') {
    const colName = key?.toLowerCase() || '';
    if (['othours', 'hours', 'totalothours'].includes(colName)) {
      return formatOTDuration(val);
    }
    return parseFloat(val.toFixed(2));
  }
  return val;
};

/* ===========================================================
   CSV EXPORT
=========================================================== */
export function exportToCSV(data: ExportData[], filename = 'report') {
  if (!data?.length) throw new Error('No data to export');
  if (!filename.endsWith('.csv')) filename += '.csv';

  const headers = Object.keys(data[0]);

  const csv = [
    headers.map(k => formatHeader(k)).join(','),
    ...data.map(row =>
      headers
        .map(k => `"${formatForDisplay(row[k], k).replace(/"/g, '""')}"`)
        .join(',')
    ),
  ].join('\n');

  const blob = new Blob(['\uFEFF' + csv], {
    type: 'text/csv;charset=utf-8;',
  });

  saveFile(blob, filename);
}

/* ===========================================================
   PDF EXPORT (A4 SAFE – LARGE DATASETS)
=========================================================== */
export function exportToPDF(data: ExportData[], filename = 'report') {
  if (!data?.length) throw new Error('No data to export');
  if (!filename.endsWith('.pdf')) filename += '.pdf';

  const headers = Object.keys(data[0]);
  const body = data.map(row => headers.map(h => formatForDisplay(row[h], h)));

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  /* ---------- Title ---------- */
  const title = formatHeader(filename.replace('.pdf', '').replace(/_/g, ' '));
  doc.setFontSize(16);
  doc.text(title, 14, 18);

  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 24);

  /* ---------- Table ---------- */
  autoTable(doc, {
    startY: 30,
    head: [headers.map(formatHeader)],
    body,
    theme: 'grid',
    tableWidth: 'auto',

    styles: {
      fontSize: headers.length > 12 ? 7 : 8,
      cellPadding: 2,
      overflow: 'linebreak',
      cellWidth: 'auto',
      valign: 'middle',
    },

    headStyles: {
      fillColor: [79, 70, 229],
      textColor: 255,
      fontStyle: 'bold',
      halign: 'center',
    },

    alternateRowStyles: {
      fillColor: [249, 250, 251],
    },

    showHead: 'everyPage',
    pageBreak: 'auto',
    rowPageBreak: 'avoid',
    margin: { top: 30, left: 10, right: 10 },

    didDrawPage: () => {
      const pageCount = doc.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(
        `Page ${pageCount}`,
        doc.internal.pageSize.getWidth() - 20,
        doc.internal.pageSize.getHeight() - 8
      );
    },
  });

  doc.save(filename);
}

/* ===========================================================
   EXCEL EXPORT
=========================================================== */
export function exportToExcel(data: ExportData[], filename = 'report') {
  if (!data?.length) throw new Error('No data to export');
  if (!filename.endsWith('.xlsx')) filename += '.xlsx';

  const formatted = data.map(row => {
    const obj: Record<string, any> = {};
    Object.keys(row).forEach(k => {
      obj[formatHeader(k)] = formatForExcel(row[k], k);
    });
    return obj;
  });

  const sheet = XLSX.utils.json_to_sheet(formatted);

  sheet['!cols'] = Object.keys(formatted[0]).map(key => ({
    wch: Math.max(key.length + 5, 18),
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Report');

  const buffer = XLSX.write(wb, {
    bookType: 'xlsx',
    type: 'array',
  });

  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  saveFile(blob, filename);
}
