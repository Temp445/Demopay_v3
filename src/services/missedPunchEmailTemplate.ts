/**
 * Missed Punch Email Template Service
 *
 * Generates HTML email bodies for missing clock-in / clock-out notifications.
 */

import { MissingPunchRecord } from './missedPunchDetector';

function formatTime12h(timeHHMM: string): string {
  const [h, m] = timeHHMM.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${period}`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function formatTimestamp(isoStr: string): string {
  return new Date(isoStr).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/**
 * Builds the HTML email body for a missing punch notification.
 *
 * @param record       - The MissingPunchRecord to notify about
 * @param companyName  - The company name to show in the email header
 * @returns HTML string
 */
export function buildMissingPunchEmailHtml(record: MissingPunchRecord, companyName: string): string {
  const isMissingIn = record.missingType === 'MISSING_IN';
  const accentColor = isMissingIn ? '#f59e0b' : '#ef4444'; // amber for missing-in, red for missing-out
  const iconEmoji = isMissingIn ? '⚠️' : '';
  const alertTitle = isMissingIn ? 'Missing Clock-In Detected' : 'Missing Clock-Out Detected';
  const alertMessage = isMissingIn
    ? `Our records show that <strong>${record.employee_name}</strong> did not clock <strong>in</strong> for their scheduled shift today.`
    : `Our records show that <strong>${record.employee_name}</strong> clocked <strong>in</strong> at <strong>${formatTimestamp(record.clock_in_time!)}</strong> but did not clock <strong>out</strong> before the end of their shift.`;

  const actionRequired = isMissingIn
    ? 'Please verify with the employee whether they were present today. If present, a manual clock-in entry may need to be added.'
    : 'Please ensure the employee clocks out or a manual clock-out entry is added to avoid payroll inaccuracies.';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${alertTitle}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f9;font-family:'Segoe UI',Arial,sans-serif;">

  <!-- Wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6f9;padding:32px 16px;">
    <tr>
      <td align="center">

        <!-- Card -->
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.07);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,${accentColor},${isMissingIn ? '#d97706' : '#dc2626'});padding:32px 40px;text-align:center;">
              ${iconEmoji ? `<div style="font-size:40px;margin-bottom:10px;">${iconEmoji}</div>` : ''}
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.3px;">${alertTitle}</h1>
              <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">${companyName} — Attendance Alert</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 40px;">

              <!-- Greeting -->
              <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.6;">
                Hello,
              </p>
              <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">
                ${alertMessage}
              </p>

              <!-- Details Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fa;border-radius:8px;border:1px solid #e5e7eb;margin-bottom:24px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:6px 0;color:#6b7280;font-size:13px;font-weight:600;width:40%;">Employee</td>
                        <td style="padding:6px 0;color:#111827;font-size:13px;font-weight:700;">${record.employee_name}${record.employee_code ? ` (${record.employee_code})` : ''}</td>
                      </tr>
                      ${record.department ? `
                      <tr>
                        <td style="padding:6px 0;color:#6b7280;font-size:13px;font-weight:600;">Department</td>
                        <td style="padding:6px 0;color:#111827;font-size:13px;">${record.department}</td>
                      </tr>` : ''}
                      <tr>
                        <td style="padding:6px 0;color:#6b7280;font-size:13px;font-weight:600;">Date</td>
                        <td style="padding:6px 0;color:#111827;font-size:13px;">${formatDate(record.date)}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#6b7280;font-size:13px;font-weight:600;">Shift</td>
                        <td style="padding:6px 0;color:#111827;font-size:13px;">${record.shift_name}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#6b7280;font-size:13px;font-weight:600;">Shift Hours</td>
                        <td style="padding:6px 0;color:#111827;font-size:13px;">${formatTime12h(record.shift_start_time)} – ${formatTime12h(record.shift_end_time)}</td>
                      </tr>
                      ${record.clock_in_time ? `
                      <tr>
                        <td style="padding:6px 0;color:#6b7280;font-size:13px;font-weight:600;">Clocked In At</td>
                        <td style="padding:6px 0;color:#059669;font-size:13px;font-weight:700;">${formatTimestamp(record.clock_in_time)}</td>
                      </tr>` : ''}
                      <tr>
                        <td style="padding:6px 0;color:#6b7280;font-size:13px;font-weight:600;">Issue</td>
                        <td style="padding:6px 0;">
                          <span style="background:${accentColor};color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;text-transform:uppercase;letter-spacing:0.5px;">
                            ${isMissingIn ? 'No Clock-In' : 'No Clock-Out'}
                          </span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Action Required -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border-radius:8px;border-left:4px solid ${accentColor};margin-bottom:28px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0 0 4px;color:#92400e;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Action Required</p>
                    <p style="margin:0;color:#78350f;font-size:14px;line-height:1.6;">${actionRequired}</p>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 6px;color:#6b7280;font-size:13px;line-height:1.6;">
                This notification was generated automatically by the attendance system. Please log in to the HR portal to review or correct this record.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;text-align:center;">
              <p style="margin:0;color:#9ca3af;font-size:12px;">
                © ${new Date().getFullYear()} ${companyName}. This is an automated attendance alert.
              </p>
            </td>
          </tr>

        </table>
        <!-- /Card -->

      </td>
    </tr>
  </table>

</body>
</html>
`;
}

/**
 * Builds the subject line for a missing punch notification email.
 */
export function buildMissingPunchEmailSubject(record: MissingPunchRecord, companyName: string): string {
  const type = record.missingType === 'MISSING_IN' ? 'Clock-In' : 'Clock-Out';
  return `[${companyName}] ⚠️ Missing ${type} — ${record.employee_name} on ${record.date}`;
}
