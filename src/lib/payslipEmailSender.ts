import { supabase } from './supabase';
import { EmailSenderService } from '../services/email-sender.service';
import { useReportsStore } from '../stores/reportsStore';
import type { PayrollEntry } from './payroll';

export interface SendPayslipResult {
  success: boolean;
  logId?: string;
  error?: string;
}

// In-memory cache for company settings to eliminate database roundtrips during batch sending
const companySettingsCache: { [tenantId: string]: { data: any; timestamp: number } } = {};
const CACHE_TTL_MS = 60000; // 1 minute cache

export async function generatePayslipHtmlString(
  entry: PayrollEntry,
  tenantId: string
): Promise<{ html: string; filename: string; subject: string }> {
  const employeeName = entry.employee?.name || 'Employee';
  const payPeriodStart = entry.period_start;
  const payPeriodEnd = entry.period_end;

  // 1️⃣ Fetch Company Settings (with in-memory cache for high-speed batch dispatch)
  const now = Date.now();
  let companySettings = companySettingsCache[tenantId]?.timestamp > now - CACHE_TTL_MS
    ? companySettingsCache[tenantId].data
    : null;

  if (!companySettings) {
    const { data } = await supabase
      .from('company_settings')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle();
    companySettings = data;
    if (companySettings) {
      companySettingsCache[tenantId] = { data: companySettings, timestamp: now };
    }
  }

  const companyName = companySettings?.company_name || 'Our Company';
  const street = companySettings?.address?.street || '';
  const postalCode = companySettings?.address?.postalCode || '';
  const companyAddress = [street, postalCode].filter(Boolean).join(', ');
  const regNo = companySettings?.registration_number || '';

  // 2️⃣ Fetch exact payslip data using getPayslipReport
  const reportsStore = useReportsStore.getState();
  const result = await reportsStore.getPayslipReport(
    payPeriodStart,
    payPeriodEnd,
    '',
    entry.employee_id,
    tenantId
  );

  const payslip = result.data?.[0];
  if (!payslip) {
    throw new Error(`Payslip data could not be generated for ${employeeName} (${payPeriodStart})`);
  }

  // 3️⃣ Construct HTML Template matching exact Form 25-B layout from PayslipReport
  const allEarnings = payslip.allEarnings || [];
  const allDeductions = payslip.allDeductions || [];
  const maxRows = Math.max(allEarnings.length, allDeductions.length);
  const earningsDeductionsRows = Array.from({ length: maxRows }).map((_, i) => {
    const earning = allEarnings[i];
    const deduction = allDeductions[i];
    return `
      <tr>
        <td style="border: 1px solid #000; padding: 6px 10px; font-size: 13px; font-weight: 600;">
          ${earning?.name?.toUpperCase() || ''}
        </td>
        <td style="border: 1px solid #000; padding: 6px 10px; font-size: 13px; text-align: right;">
          ${earning?.amount !== undefined ? Number(earning.amount).toFixed(2) : ''}
        </td>
        <td style="border: 1px solid #000; padding: 6px 10px; font-size: 13px;">
          ${deduction?.name?.toUpperCase() || ''}
        </td>
        <td style="border: 1px solid #000; padding: 6px 10px; font-size: 13px; text-align: right;">
          ${deduction?.amount !== undefined ? Number(deduction.amount).toFixed(2) : ''}
        </td>
      </tr>
    `;
  }).join('');

  const leaveBalances = Object.entries(payslip.leaveBalances || {});
  let leaveBalancesHtml = '';
  if (leaveBalances.length === 0) {
    leaveBalancesHtml = `
      <tr>
        <td colspan="4" style="border: 1px solid #000; padding: 16px; text-align: center; color: #666; font-style: italic; font-size: 13px;">
          No leave balances available
        </td>
      </tr>
    `;
  } else {
    for (let i = 0; i < leaveBalances.length; i += 4) {
      const chunk = leaveBalances.slice(i, i + 4);
      const headers = Array.from({ length: 4 }).map((_, colIdx) => `
        <td style="border: 1px solid #000; padding: 6px 10px; background-color: #f9fafb; text-align: center; font-weight: bold; font-size: 11px;">
          ${chunk[colIdx] ? chunk[colIdx][0].toUpperCase() : ''}
        </td>
      `).join('');
      const values = Array.from({ length: 4 }).map((_, colIdx) => `
        <td style="border: 1px solid #000; padding: 6px 10px; text-align: center; font-size: 13px;">
          ${chunk[colIdx] ? chunk[colIdx][1] : ''}
        </td>
      `).join('');
      leaveBalancesHtml += `<tr>${headers}</tr><tr>${values}</tr>`;
    }
  }

  const htmlBody = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Payslip - ${employeeName}</title>
    </head>
    <body style="margin: 0; padding: 24px; font-family: Arial, sans-serif; background-color: #ffffff; color: #000000;">
      <div style="max-width: 800px; margin: 0 auto; background-color: #ffffff; padding: 16px;">
        
        <table style="width: 100%; border-collapse: collapse; border: 1px solid #000; font-size: 13px; font-family: Arial, sans-serif; color: #000000;">
          <colgroup>
            <col style="width: 35%;">
            <col style="width: 15%;">
            <col style="width: 35%;">
            <col style="width: 15%;">
          </colgroup>
          
          <thead>
            <tr>
              <td colspan="4" style="border: 1px solid #000; padding: 12px; text-align: center;">
                <h1 style="margin: 0; font-size: 14px; font-weight: medium; color: #000000;">
                  ${companyName} <span style="margin-left: 12px; font-weight: medium; font-size: 14px;">${companyAddress}</span>
                </h1>
              </td>
            </tr>
            <tr>
              <td colspan="4" style="border: 1px solid #000; padding: 10px; text-align: center;">
                <p style="margin: 0 0 6px 0; font-size: 13px; font-weight: 600; color: #000000;">
                  [Form 25-B] Regn No:${regNo} WAGES REGISTER\\WAGES SLIP\\TIME CARD
                </p>
                <p style="margin: 0; font-size: 13px; font-weight: 600; color: #000000;">
                  ACKNOWLEDGEMENT FOR THE MONTH OF ${payslip.payPeriod}
                </p>
              </td>
            </tr>
          </thead>

          <tbody>
            <tr>
              <td colspan="2" style="border: 1px solid #000; padding: 6px 10px; font-weight: 600;"><span style="color: #000000; text-decoration: none;">SI. NO</span></td>
              <td colspan="2" style="border: 1px solid #000; padding: 6px 10px; text-align: center;">${payslip.slNo || ''}</td>
            </tr>
            <tr>
              <td colspan="2" style="border: 1px solid #000; padding: 6px 10px; font-weight: 600;">Employee ID</td>
              <td colspan="2" style="border: 1px solid #000; padding: 6px 10px; text-align: center;">${payslip.employeeCode || '-'}</td>
            </tr>
            <tr>
              <td colspan="2" style="border: 1px solid #000; padding: 6px 10px; font-weight: 600;">Name of the Employee</td>
              <td colspan="2" style="border: 1px solid #000; padding: 6px 10px; text-align: center;">${payslip.name}</td>
            </tr>
            <tr>
              <td colspan="2" style="border: 1px solid #000; padding: 6px 10px; font-weight: 600;">Fathers Name</td>
              <td colspan="2" style="border: 1px solid #000; padding: 6px 10px; text-align: center;">${payslip.fatherName || '-'}</td>
            </tr>
            <tr>
              <td colspan="2" style="border: 1px solid #000; padding: 6px 10px; font-weight: 600;">Designation</td>
              <td colspan="2" style="border: 1px solid #000; padding: 6px 10px; text-align: center;">${payslip.designation || '-'}</td>
            </tr>
            <tr>
              <td colspan="2" style="border: 1px solid #000; padding: 6px 10px; font-weight: 600;">UAN No</td>
              <td colspan="2" style="border: 1px solid #000; padding: 6px 10px; text-align: center;">${payslip.uanNumber || '-'}</td>
            </tr>
            <tr>
              <td colspan="2" style="border: 1px solid #000; padding: 6px 10px; font-weight: 600;">Date of Entry</td>
              <td colspan="2" style="border: 1px solid #000; padding: 6px 10px; text-align: center;">${payslip.dateOfEntry || '-'}</td>
            </tr>
            <tr>
              <td colspan="2" style="border: 1px solid #000; padding: 6px 10px; font-weight: 600;">No of Days Worked</td>
              <td colspan="2" style="border: 1px solid #000; padding: 6px 10px; text-align: center;">${payslip.noOfDaysWorked !== undefined ? payslip.noOfDaysWorked : 0}</td>
            </tr>
            <tr>
              <td colspan="2" style="border: 1px solid #000; padding: 6px 10px; font-weight: 600;">Leave with Wages</td>
              <td colspan="2" style="border: 1px solid #000; padding: 6px 10px; text-align: center;">${payslip.leaveWithWages !== undefined ? payslip.leaveWithWages : 0}</td>
            </tr>
            <tr>
              <td colspan="2" style="border: 1px solid #000; padding: 6px 10px; font-weight: 600;">No of Days Wages Paid</td>
              <td colspan="2" style="border: 1px solid #000; padding: 6px 10px; text-align: center;">${payslip.noOfDaysWagesPaid !== undefined ? payslip.noOfDaysWagesPaid : 0}</td>
            </tr>

            <tr>
              <td colspan="2" style="border: 1px solid #000; padding: 8px 10px; background-color: #f3f4f6; font-weight: 600;">EARNING</td>
              <td colspan="2" style="border: 1px solid #000; padding: 8px 10px; background-color: #f3f4f6; font-weight: 600;">DEDUCTION</td>
            </tr>
            ${earningsDeductionsRows}
            <tr style="font-weight: 600;">
              <td style="border: 1px solid #000; padding: 8px 10px;">GROSS</td>
              <td style="border: 1px solid #000; padding: 8px 10px; text-align: right;">${Number(payslip.grossEarnings || 0).toFixed(2)}</td>
              <td style="border: 1px solid #000; padding: 8px 10px;">TOTAL DEDUCTION</td>
              <td style="border: 1px solid #000; padding: 8px 10px; text-align: right;">${Number(payslip.totalDeductions || 0).toFixed(2)}</td>
            </tr>

            <tr style="font-weight: bold;">
              <td style="border: 1px solid #000; padding: 8px 10px;">NET PAY :</td>
              <td style="border: 1px solid #000; padding: 8px 10px; font-size: 14px; text-align: right;">${Number(payslip.netPay || 0).toFixed(2)}</td>
              <td style="border: 1px solid #000; padding: 8px 10px;"></td>
              <td style="border: 1px solid #000; padding: 8px 10px;"></td>
            </tr>

            <tr>
              <td colspan="2" style="border: 1px solid #000; padding: 8px 10px; background-color: #f3f4f6; font-weight: 600; text-align: center;">
                AVAILABLE BALANCE LEAVE DETAILS
              </td>
              <td style="border: 1px solid #000; padding: 8px 10px; background-color: #f3f4f6; font-weight: 600; text-align: center;">
                PAID AMOUNT
              </td>
              <td style="border: 1px solid #000; padding: 8px 10px; font-weight: bold; font-size: 14px; text-align: right;">
                ${Number(payslip.paidAmount || 0).toFixed(2)}
              </td>
            </tr>
            ${leaveBalancesHtml}

            <tr>
              <td colspan="4" style="border: 1px solid #000; padding: 8px 10px; background-color: #f3f4f6; font-weight: 600; text-align: left;">
                AVAILABLE BALANCE ADVANCE DETAILS
              </td>
            </tr>
            <tr>
              <td style="border: 1px solid #000; padding: 6px 10px;">ADVANCE</td>
              <td style="border: 1px solid #000; padding: 6px 10px; text-align: right;">${payslip.advanceBalance || 0}</td>
              <td style="border: 1px solid #000; padding: 6px 10px;"></td>
              <td style="border: 1px solid #000; padding: 6px 10px;"></td>
            </tr>
            <tr>
              <td style="border: 1px solid #000; padding: 6px 10px;">VEHICLE</td>
              <td style="border: 1px solid #000; padding: 6px 10px; text-align: right;">${payslip.vehicleBalance || 0}</td>
              <td style="border: 1px solid #000; padding: 6px 10px;"></td>
              <td style="border: 1px solid #000; padding: 6px 10px;"></td>
            </tr>

            <tr>
              <td colspan="2" style="border: 1px solid #000; border-right: none; padding: 16px 12px; vertical-align: top; height: 90px;">
                <div style="font-size: 13px; margin-bottom: 48px;">For ${companyName}</div>
                <div style="font-size: 12px; font-weight: 600;">Admin- Manager</div>
              </td>
              <td colspan="2" style="border: 1px solid #000; border-left: none; padding: 16px 12px; vertical-align: bottom; text-align: center; height: 90px;">
                <div style="font-size: 12px; font-weight: 600;">Signature of Employee</div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </body>
    </html>
  `;

  const safeEmpName = employeeName.replace(/[^a-zA-Z0-9]/g, '_');
  const safePeriod = (payslip.payPeriod || '').replace(/[^a-zA-Z0-9]/g, '_');
  const filename = `Payslip_${safePeriod}_${safeEmpName}.html`;
  const subject = `Your Payslip for ${payslip.payPeriod} - ${companyName}`;

  return { html: htmlBody, filename, subject };
}

export async function sendPayslipEmail(
  entry: PayrollEntry,
  tenantId: string,
  userId: string
): Promise<SendPayslipResult> {
  const employeeEmail = entry.employee?.email || '';
  const employeeName = entry.employee?.name || 'Employee';

  try {
    if (!employeeEmail || !employeeEmail.includes('@')) {
      throw new Error(`Invalid or missing email address for employee ${employeeName}`);
    }

    const { html: htmlBody, filename: attachmentFilename, subject } = await generatePayslipHtmlString(entry, tenantId);

    const utf8Bytes = new TextEncoder().encode(htmlBody);
    const base64Content = btoa(Array.from(utf8Bytes, byte => String.fromCharCode(byte)).join(''));

    const emailResult = await EmailSenderService.sendEmail({
      tenant_id: tenantId,
      user_id: userId,
      to: employeeEmail,
      subject: subject,
      html: htmlBody,
      attachments: [
        {
          filename: attachmentFilename,
          content: base64Content,
          type: 'text/html'
        }
      ]
    });

    // 5️⃣ Log Success
    const { data: logData, error: logError } = await supabase
      .from('payslip_email_sender_logs')
      .insert({
        tenant_id: tenantId,
        user_id: userId,
        subject: subject,
        body_html: `Payslip delivered successfully to ${employeeEmail}`,
        recipients: { to: employeeEmail },
        attachment_count: 1,
        status: 'sent',
        sent_at: new Date().toISOString()
      })
      .select()
      .single();

    if (logError) {
      console.warn('Failed to insert success email log:', logError);
    }

    return {
      success: true,
      logId: logData?.id
    };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error occurred while dispatching payslip';
    
    // Log Failure
    const { data: failLog } = await supabase
      .from('payslip_email_sender_logs')
      .insert({
        tenant_id: tenantId,
        user_id: userId,
        subject: `Payslip Dispatch Failure - ${employeeName} - ${entry.period_start}`,
        body_html: `Failed to deliver payslip. Error: ${errorMsg}`,
        recipients: { to: employeeEmail || 'N/A' },
        attachment_count: 0,
        status: 'failed',
        error_message: errorMsg,
        sent_at: new Date().toISOString()
      })
      .select()
      .single();

    return {
      success: false,
      logId: failLog?.id,
      error: errorMsg
    };
  }
}
