import React, { useEffect, useRef } from "react";
import { Download, Printer, AlertCircle, FileText } from "lucide-react";
import jsPDF from "jspdf";
import { useSettingsStore } from "../../../stores/settingsStore";

interface PayslipData {
  slNo: number;
  employeeId: string;
  employeeCode: string;
  name: string;
  fatherName: string;
  designation: string;
  uanNumber: string;
  dateOfEntry: string;
  noOfDaysWorked: number;
  leaveWithWages: number;
  noOfDaysWagesPaid: number;
  payPeriod: string;
  earnings: Record<string, number>;
  deductions: Record<string, number>;
  grossEarnings: number;
  totalDeductions: number;
  netPay: number;
  lessAmount: number;
  paidAmount: number;
  // CHANGED: Replaced hardcoded balances with a dynamic record
  leaveBalances: Record<string, number>;
  advanceBalance: number;
  vehicleBalance: number;
  allEarnings: Array<{ name: string; amount: number }>;
  allDeductions: Array<{ name: string; amount: number }>;
}

interface PayslipReportProps {
  data: PayslipData[];
  loading: boolean;
  error: string | null;
}

export default function PayslipReport({
  data,
  loading,
  error,
}: PayslipReportProps) {
  const { companySettings, fetchCompanySettings } = useSettingsStore();
  const payslipRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    fetchCompanySettings();
  }, [fetchCompanySettings]);

  const companyName = companySettings?.company_name || "DEMO PRIVATE LIMITED";
  const registrationNo = companySettings?.registration_number || "TVR 5703";

  const formatAddress = () => {
    if (!companySettings?.address) {
      return "123, 2ND FLOOR, BUSINESS PARK ROAD, CHENNAI - 600017";
    }

    if (typeof companySettings.address === "object") {
      const { street, postalCode } = companySettings.address as any;
      return [street, postalCode].filter(Boolean).join(", ");
    }

    return String(companySettings.address);
  };

  const companyAddress = formatAddress();

  const downloadPayslip = (index: number) => {
    const element = payslipRefs.current[index];
    if (!element) return;

    const payslip = data[index];
    const pdf = new jsPDF("p", "mm", "a4");

    // --- Configuration ---
    const margin = 15;
    const pageWidth = 210;
    const contentWidth = pageWidth - margin * 2;
    let yPos = margin;
    const rowHeight = 7;

    const halfWidth = contentWidth / 2;
    const col1W = halfWidth * 0.70; // Earning Name
    const col2W = halfWidth * 0.30; // Earning Amount
    const col3W = halfWidth * 0.65; // Deduction Name
    const col4W = halfWidth * 0.35; // Deduction Amount

    const grayColor: [number, number, number] = [243, 244, 246];

    // --- Helper: Draw Cell ---
    const drawCell = (
      text: string,
      x: number,
      y: number,
      w: number,
      h: number,
      options: {
        align?: "left" | "center" | "right";
        isBold?: boolean;
        fontSize?: number;
        fillColor?: [number, number, number] | null;
        noBorder?: boolean;
      } = {}
    ) => {
      const {
        align = "left",
        isBold = false,
        fontSize = 9,
        fillColor = null,
        noBorder = false,
      } = options;

      if (fillColor) {
        pdf.setFillColor(...fillColor);
        pdf.rect(x, y, w, h, "F");
      }

      if (!noBorder) {
        pdf.setDrawColor(0);
        pdf.setLineWidth(0.1);
        pdf.rect(x, y, w, h, "S");
      }

      if (text) {
        pdf.setFont("helvetica", isBold ? "bold" : "normal");
        pdf.setFontSize(fontSize);
        pdf.setTextColor(0);

        const padding = 2;
        const wrappedText = pdf.splitTextToSize(text.toString(), w - padding * 2);
        const lineHeight = fontSize * 0.35;
        const textHeight = wrappedText.length * lineHeight;
        const yTextStart = y + (h - textHeight) / 2 + lineHeight;

        let xText = x + padding;

        if (align === "center") {
          xText = x + w / 2;
          pdf.text(wrappedText, xText, yTextStart, { align: "center" });
        } else if (align === "right") {
          xText = x + w - padding;
          pdf.text(wrappedText, xText, yTextStart, { align: "right" });
        } else {
          pdf.text(wrappedText, xText, yTextStart);
        }
      }
    };

    // --- 1. Company Header ---
    drawCell(`${companyName}    ${companyAddress}`, margin, yPos, contentWidth, 10, {
      align: "center",
      isBold: true,
      fontSize: 10,
    });
    yPos += 10;

    // --- 2. Title Section ---
    const titleHeight = 14;
    drawCell("", margin, yPos, contentWidth, titleHeight, {}); // Box
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "bold");
    pdf.text(
      `[Form 25-B] Regn No:${registrationNo} WAGES REGISTER\\WAGES SLIP\\TIME CARD`,
      pageWidth / 2,
      yPos + 5,
      { align: "center" }
    );
    pdf.text(
      `ACKNOWLEDGEMENT FOR THE MONTH OF ${payslip.payPeriod}`,
      pageWidth / 2,
      yPos + 10,
      { align: "center" }
    );
    yPos += titleHeight;

    // --- 3. Employee Details ---
    const empLabelW = contentWidth * 0.35;
    const empValueW = contentWidth * 0.65;

    const employeeDetails = [
      ["SI.NO", payslip.slNo.toString()],
      ["Employee ID", payslip.employeeCode || "-"],
      ["Name of the Employee", payslip.name],
      ["Fathers Name", payslip.fatherName],
      ["Designation", payslip.designation],
      ["UAN No", payslip.uanNumber],
      ["Date of Entry", payslip.dateOfEntry],
      ["No of Days Worked", payslip.noOfDaysWorked.toString()],
      ["Leave with Wages", payslip.leaveWithWages.toString()],
      ["No of Days Wages Paid", payslip.noOfDaysWagesPaid.toString()],
    ];

    employeeDetails.forEach(([label, value]) => {
      drawCell(label, margin, yPos, empLabelW, rowHeight, { isBold: true, fontSize: 8 });
      drawCell(value, margin + empLabelW, yPos, empValueW, rowHeight, { align: "center", fontSize: 9 });
      yPos += rowHeight;
    });

    // --- 4. Earnings & Deductions ---
    drawCell("EARNING", margin, yPos, halfWidth, rowHeight, {
      align: "center", fillColor: grayColor, isBold: true, fontSize: 8
    });
    drawCell("DEDUCTION", margin + halfWidth, yPos, halfWidth, rowHeight, {
      align: "center", fillColor: grayColor, isBold: true, fontSize: 8
    });
    yPos += rowHeight;

    const maxRows = Math.max(payslip.allEarnings.length, payslip.allDeductions.length);

    for (let i = 0; i < maxRows; i++) {
      const earning = payslip.allEarnings[i];
      const deduction = payslip.allDeductions[i];

      drawCell(earning?.name?.toUpperCase() || "", margin, yPos, col1W, rowHeight, { fontSize: 8, isBold: true });
      drawCell(earning?.amount?.toFixed(2) || "", margin + col1W, yPos, col2W, rowHeight, { align: "right", fontSize: 9 });
      drawCell(deduction?.name?.toUpperCase() || "", margin + halfWidth, yPos, col3W, rowHeight, { fontSize: 8 });
      drawCell(deduction?.amount?.toFixed(2) || "", margin + halfWidth + col3W, yPos, col4W, rowHeight, { align: "right", fontSize: 9 });
      yPos += rowHeight;
    }

    drawCell("GROSS", margin, yPos, col1W, rowHeight, { isBold: true, fontSize: 8 });
    drawCell(payslip.grossEarnings.toFixed(2), margin + col1W, yPos, col2W, rowHeight, { align: "right", isBold: true, fontSize: 9 });
    drawCell("TOTAL DEDUCTION", margin + halfWidth, yPos, col3W, rowHeight, { isBold: true, fontSize: 8 });
    drawCell(payslip.totalDeductions.toFixed(2), margin + halfWidth + col3W, yPos, col4W, rowHeight, { align: "right", isBold: true, fontSize: 9 });
    yPos += rowHeight;

    // --- 5. Net Pay ---
    drawCell("NET PAY :", margin, yPos, col1W, rowHeight, { isBold: true, fontSize: 8 });
    drawCell(Math.round(payslip.netPay).toString(), margin + col1W, yPos, col2W, rowHeight, { align: "right", isBold: true, fontSize: 10 });
    drawCell("", margin + halfWidth, yPos, col3W, rowHeight, { fontSize: 8 });
    drawCell(payslip.lessAmount.toString(), margin + halfWidth + col3W, yPos, col4W, rowHeight, { align: "right", fontSize: 9 });
    yPos += rowHeight;

    // --- 6. Leave Details (Dynamic) ---
    drawCell("AVAILABLE BALANCE LEAVE DETAILS", margin, yPos, halfWidth, rowHeight, {
      align: "center", fillColor: grayColor, isBold: true, fontSize: 8
    });
    drawCell("PAID AMOUNT", margin + halfWidth, yPos, col3W, rowHeight, {
      align: "left", fillColor: grayColor, isBold: true, fontSize: 8
    });
    drawCell(Math.round(payslip.paidAmount).toString(), margin + halfWidth + col3W, yPos, col4W, rowHeight, {
      align: "right", isBold: true, fontSize: 9
    });
    yPos += rowHeight;

    // DYNAMIC LEAVE GENERATION FOR PDF
const leaveEntries = Object.entries(payslip.leaveBalances || {});

// Total table width (all 4 columns combined)
const totalWidth = col1W + col2W + col3W + col4W;
const singleColWidth = totalWidth / 4;

// If no leaves
if (leaveEntries.length === 0) {
  drawCell(
    "No leave balances available",
    margin,
    yPos,
    totalWidth,
    rowHeight,
    { align: "center", fontSize: 8 }
  );
  yPos += rowHeight;
} else {

  // Split into chunks of 4 (like your HTML table)
  for (let i = 0; i < leaveEntries.length; i += 4) {
    const chunk = leaveEntries.slice(i, i + 4);

    // -----------------------------
    // ROW 1 → LEAVE HEADINGS
    // -----------------------------
    for (let col = 0; col < 4; col++) {
      drawCell(
        chunk[col] ? chunk[col][0].toUpperCase() : "",
        margin + col * singleColWidth,
        yPos,
        singleColWidth,
        rowHeight,
        {
          align: "center",
          isBold: true,
          fontSize: 8,
        }
      );
    }

    yPos += rowHeight;

    // -----------------------------
    // ROW 2 → LEAVE VALUES
    // -----------------------------
    for (let col = 0; col < 4; col++) {
      drawCell(
        chunk[col] ? chunk[col][1].toString() : "",
        margin + col * singleColWidth,
        yPos,
        singleColWidth,
        rowHeight,
        {
          align: "center",
          fontSize: 9,
        }
      );
    }

    yPos += rowHeight;
  }
}
    // --- 7. Advance Details ---
    drawCell("AVAILABLE BALANCE ADVANCE DETAILS", margin, yPos, contentWidth, rowHeight, {
      align: "left", fillColor: grayColor, isBold: true, fontSize: 8
    });
    yPos += rowHeight;

    drawCell("ADVANCE", margin, yPos, col1W, rowHeight, { fontSize: 9 });
    drawCell(payslip.advanceBalance.toString(), margin + col1W, yPos, col2W, rowHeight, { fontSize: 9 });
    drawCell("", margin + halfWidth, yPos, col3W, rowHeight, {});
    drawCell("", margin + halfWidth + col3W, yPos, col4W, rowHeight, {});
    yPos += rowHeight;

    drawCell("VEHICLE", margin, yPos, col1W, rowHeight, { fontSize: 9 });
    drawCell(payslip.vehicleBalance.toString(), margin + col1W, yPos, col2W, rowHeight, { fontSize: 9 });
    drawCell("", margin + halfWidth, yPos, col3W, rowHeight, {});
    drawCell("", margin + halfWidth + col3W, yPos, col4W, rowHeight, {});
    yPos += rowHeight;

    const sigHeight = 30;
    drawCell("", margin, yPos, contentWidth, sigHeight, {});

    // Left Side Text
    pdf.setFontSize(9);
    pdf.text(`For ${companyName}`, margin + 2, yPos + 5);
    pdf.setFontSize(8);
    pdf.text("Admin- Manager", margin + 2, yPos + sigHeight - 2);

    // Right Side Text
    pdf.setFontSize(9);
    pdf.text("Signature of Employee", margin + halfWidth + (halfWidth / 2), yPos + sigHeight - 2, { align: 'left' });

    pdf.save(`Payslip_${payslip.name}_${payslip.payPeriod}.pdf`);
  };

  const printPayslip = (index: number) => {
    const element = payslipRefs.current[index];
    if (!element) return;

    const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map((node) => node.outerHTML)
      .join('');

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';

    document.body.appendChild(iframe);

    const printDocument = iframe.contentWindow?.document;
    if (printDocument) {
      printDocument.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Payslip - ${data[index].name}</title>
            ${styles} 
            <style>
              @media print {
                @page { size: A4; margin: 10mm; }
                html, body { height: 99%; }
                body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; zoom: 0.90; display: flex; align-items: center; justify-content: center; }
                .p-8 { padding: 1.5rem !important; }
                ::-webkit-scrollbar { display: none; }
              }
            </style>
          </head>
          <body>
             <div style="width: 100%; max-width: 800px;">
                ${element.outerHTML}
             </div>
          </body>
        </html>
      `);
      printDocument.close();

      setTimeout(() => {
        if (iframe.contentWindow) {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
        }
        setTimeout(() => {
          document.body.removeChild(iframe);
        }, 1000);
      }, 500);
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

  if (!data || data.length === 0) {
    return (
      <div className="text-center py-12">
        <FileText className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-medium text-gray-900">
          No payslips available
        </h3>
        <p className="mt-1 text-sm text-gray-500">
          Try changing your filters or ensure payroll has been processed for the
          selected period.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Payslip Report</h2>
        <p className="mt-1 text-sm text-gray-500">
          Generated on {new Date().toLocaleString("en-GB")} | Total Payslips:{" "}
          {data.length}
        </p>
      </div>

      {data.map((payslip, index) => {
        // Pre-calculate chunks for 2-column layout in display
        const leaveEntries = Object.entries(payslip.leaveBalances || {});
        const leaveRows = [];
        for (let i = 0; i < leaveEntries.length; i += 2) {
          leaveRows.push(leaveEntries.slice(i, i + 2));
        }

        return (
          <div
            key={index}
            className="bg-white shadow-lg rounded-lg overflow-hidden border border-gray-200"
          >
            {/* Action buttons */}
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex flex-col md:flex-row md:justify-between md:items-center">
              <h3 className="text-lg font-medium text-gray-900">
                {payslip.name} - {payslip.payPeriod}
              </h3>
              <div className="flex space-x-2">
                <button
                  onClick={() => printPayslip(index)}
                  className="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                >
                  <Printer className="h-4 w-4 mr-2" />
                  Print
                </button>
                <button
                  onClick={() => downloadPayslip(index)}
                  className="inline-flex items-center px-3 py-1.5 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download PDF
                </button>
              </div>
            </div>

            {/* Payslip content */}
            <div
              ref={(el) => (payslipRefs.current[index] = el)}
              className="md:p-8"
              style={{ fontFamily: "Arial, sans-serif" }}
            >
              {/* Company Header */}
              <div className="border-x border-t border-black flex gap-3 p-2  text-center w-full justify-center items-center">
                <h1 className="text-sm font-bold">
                  {companyName} <span className="ml-3"> {companyAddress}</span>
                </h1>
              </div>

              {/* Form Title */}
              <div className="border border-black p-2 text-center">
                <p className="text-xs font-semibold">
                  [Form 25-B] Regn No:{registrationNo} WAGES REGISTER\WAGES
                  SLIP\TIME CARD
                </p>
                <p className="text-xs font-semibold">
                  ACKNOWLEDGEMENT FOR THE MONTH OF {payslip.payPeriod}
                </p>
              </div>

              {/* Employee Details */}
              <table className="w-full border-collapse border border-black">
                <tbody>
                  <tr>
                    <td className="border border-black px-1 py-1 font-semibold text-sm w-1/3">
                      SI.NO
                    </td>
                    <td className="border border-black px-1 py-1 text-sm text-center">
                      {payslip.slNo}
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-black px-1 py-1 font-semibold text-xs">
                      Employee ID
                    </td>
                    <td className="border border-black px-1 py-1 text-sm text-center">
                      {payslip.employeeCode || "-"}
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-black px-1 py-1 font-semibold text-xs">
                      Name of the Employee
                    </td>
                    <td className="border border-black px-1 py-1 text-sm text-center">
                      {payslip.name}
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-black px-1 py-1 font-semibold text-xs">
                      Fathers Name
                    </td>
                    <td className="border border-black px-1 py-1 text-sm text-center">
                      {payslip.fatherName}
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-black px-1 py-1 font-semibold text-xs">
                      Designation
                    </td>
                    <td className="border border-black px-1 py-1 text-sm text-center">
                      {payslip.designation}
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-black px-1 py-1 font-semibold text-xs">
                      UAN No
                    </td>
                    <td className="border border-black px-1 py-1 text-sm text-center">
                      {payslip.uanNumber}
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-black px-1 py-1 font-semibold text-xs">
                      Date of Entry
                    </td>
                    <td className="border border-black px-1 py-1 text-sm text-center">
                      {payslip.dateOfEntry}
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-black px-1 py-1 font-semibold text-xs">
                      No of Days Worked
                    </td>
                    <td className="border border-black px-1 py-1 text-sm text-center">
                      {payslip.noOfDaysWorked}
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-black px-1 py-1 font-semibold text-xs">
                      Leave with Wages
                    </td>
                    <td className="border border-black px-1 py-1 text-sm text-center">
                      {payslip.leaveWithWages}
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-black px-1 py-1 font-semibold text-xs">
                      No of Days Wages Paid
                    </td>
                    <td className="border border-black px-1 py-1 text-center text-sm">
                      {payslip.noOfDaysWagesPaid}
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Earnings and Deductions */}
              <table className="w-full border-collapse border border-black">
                <thead>
                  <tr>
                    <th
                      colSpan={2}
                      className="border border-black px-3 py-2 bg-gray-100 font-light text-sm"
                    >
                      EARNING
                    </th>
                    <th
                      colSpan={2}
                      className="border border-black px-3 py-2 bg-gray-100 font-light text-sm"
                    >
                      DEDUCTION
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({
                    length: Math.max(
                      payslip.allEarnings.length,
                      payslip.allDeductions.length
                    ),
                  }).map((_, i) => (
                    <tr key={i}>
                      <td className="border border-black px-1 py-1 text-xs font-semibold w-1/3">
                        {payslip.allEarnings[i]?.name?.toUpperCase() || ""}
                      </td>
                      <td className="border border-black px-3 py-1 text-sm text-right w-1/4">
                        {payslip.allEarnings[i]?.amount?.toFixed(2) || ""}
                      </td>
                      <td className="border border-black px-1 py-1 text-xs w-1/4">
                        {payslip.allDeductions[i]?.name?.toUpperCase() || ""}
                      </td>
                      <td className="border border-black px-1 py-1 text-sm text-right w-1/4">
                        {payslip.allDeductions[i]?.amount?.toFixed(2) || ""}
                      </td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className="border border-black px-1 py-2 text-xs">
                      GROSS
                    </td>
                    <td className="border border-black px-3 py-2 text-sm text-right">
                      {payslip.grossEarnings.toFixed(2)}
                    </td>
                    <td className="border border-black px-1 py-2 text-xs">
                      TOTAL DEDUCTION
                    </td>
                    <td className="border border-black px-1 py-2 text-sm text-right">
                      {payslip.totalDeductions.toFixed(2)}
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Net Pay and Balance Details */}
              <table className="w-full border-collapse">
                <tbody>
                  <tr className="font-bold">
                    <td className="border-x  border-b border-black px-1 py-2 text-start text-xs w-1/3">
                      NET PAY :
                    </td>
                    <td className="border-x border-b border-black px-1 py-2 text-base text-end w-1/4">
                      {payslip.netPay.toFixed(2)}
                    </td>
                    <td className="border-x border-b border-black px-1 py-2 text-xs w-1/4">
                      {/* LESS AMOUNT [ + OR - ] */}
                    </td>
                    <td className="border-x border-b border-black px-1 py-2 text-sm text-end w-1/4">
                      {/* {payslip.lessAmount} */}
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Leave and Advance Details - DYNAMIC SECTION */}
              <table className="w-full border-collapse  text-sm">
                <thead>
                  <tr>
                    <td
                      colSpan={2}
                      className="border-x border-black  py-2 px-[9px] bg-gray-100 font-semibold text-center text-xs "
                    >
                      AVAILABLE BALANCE LEAVE DETAILS
                    </td>
                    <td className="border-x border-black py-2 px-1 w-1/4 bg-gray-100 font-semibold text-xs">
                      PAID AMOUNT
                    </td>
                    <td
                      colSpan={2}
                      className="border-x border-black py-2 font-semibold text-right text-base"
                    >
                      {payslip.paidAmount.toFixed(2)}
                    </td>
                  </tr>
                </thead>
          <tbody>
            {(() => {
              const leaveEntries = Object.entries(payslip.leaveBalances || {});
              const rows = [];
              
              // Chunk the leaves into groups of 4
              for (let i = 0; i < leaveEntries.length; i += 4) {
                rows.push(leaveEntries.slice(i, i + 4));
              }
          
              if (rows.length === 0) {
                return (
                  <tr>
                    <td colSpan={4} className="border border-black px-3 py-4 text-center text-gray-400 italic">
                      No leave balances available
                    </td>
                  </tr>
                );
              }

    return rows.map((chunk, rowIdx) => (
      <React.Fragment key={rowIdx}>
        {/* Row 1: Names (Headers) */}
        <tr>
          {[...Array(4)].map((_, colIdx) => (
            <td
              key={`name-${colIdx}`}
              className="border border-black px-1 py-1 bg-gray-50 text-center font-bold text-[10px]"
            >
              {chunk[colIdx] ? chunk[colIdx][0].toUpperCase() : ""}
            </td>
          ))}
        </tr>
        {/* Row 2: Values */}
        <tr>
          {[...Array(4)].map((_, colIdx) => (
            <td
              key={`val-${colIdx}`}
              className="border border-black px-1 py-1 text-center text-sm "
            >
              {chunk[colIdx] ? chunk[colIdx][1] : ""}
            </td>
          ))}
        </tr>
      </React.Fragment>
    ));
  })()}
</tbody>
              </table>

              <table className="w-full border-collapse border-x border-black">
                <thead>
                  <tr>
                    <th
                      colSpan={2}
                      className="border-l border-black px-3  py-2 bg-gray-100 font-semibold  text-xs"
                    >
                      AVAILABLE BALANCE ADVANCE DETAILS
                    </th>
                  </tr>
                </thead>

                <tbody>
                  <tr>
                    <td className="border border-black px-3 py-1 text-sm w-1/3">
                      ADVANCE
                    </td>
                    <td className="border border-black px-3 py-1 text-sm w-1/4">
                      {payslip.advanceBalance}
                    </td>

                    <td className="border border-black px-3 py-1 text-sm w-1/4"></td>
                    <td className="border border-black px-3 py-1 text-sm w-1/4"></td>
                  </tr>

                  <tr>
                    <td className="border border-black px-3 py-1 text-sm">
                      VEHICLE
                    </td>
                    <td className="border border-black px-3 py-1 text-sm">
                      {payslip.vehicleBalance}
                    </td>

                    <td className="border border-black px-3 py-1 text-sm"></td>
                    <td className="border border-black px-3 py-1 text-sm"></td>
                  </tr>
                </tbody>
              </table>

              {/* Signatures */}
              <div className="grid grid-cols-2 min-h-32">
                <div className="border-b border-l border-black px-1 flex flex-col justify-between">
                  <p className="text-sm">For {companyName}</p>
                  <p className="text-xs text-left font-semibold">
                    Admin- Manager
                  </p>
                </div>

                <div className="border-r border-b border-black flex justify-center items-end">
                  <p className="text-xs font-semibold">Signature of Employee</p>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}