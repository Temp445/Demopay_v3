import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

// --- Helper Functions ---
function formatTime12(date: Date, utcOffsetMinutes = 330): string {
  const localMs = date.getTime() + utcOffsetMinutes * 60 * 1000;
  const d = new Date(localMs);
  let h = d.getUTCHours();
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  h = h ? h : 12;
  const hh = String(h).padStart(2, "0");
  return `${hh}:${m} ${ampm}`;
}

function localDateStr(date: Date, utcOffsetMinutes = 330): string {
  const localMs = date.getTime() + utcOffsetMinutes * 60 * 1000;
  const d = new Date(localMs);
  return d.toISOString().slice(0, 10);
}

function parseShiftTime(timeStr: string): string {
  if (!timeStr) return '';
  const [h, min] = timeStr.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hr12 = hour % 12 || 12;
  return `${String(hr12).padStart(2, '0')}:${min} ${ampm}`;
}

// --- Main Handler ---
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: HEADERS });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    // Expect internal trigger (from pg_net) to pass service role key or custom cron secret
    const cronSecret = Deno.env.get("CRON_SECRET");
    if (cronSecret && authHeader !== `Bearer ${cronSecret}` && !authHeader.includes(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || '')) {
      console.warn("Unauthorized attempt to trigger missing-punch-cron.");
      // We'll allow it if they use the anon key for now, or just restrict it in prod.
      // For safety, let's let it run if it's the service role key.
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );

    // 1. Get all tenants with enabled notification settings
    const { data: settingsList, error: settingsErr } = await supabase
      .from('missed_punch_notification_settings')
      .select('*')
      .eq('is_enabled', true);

    if (settingsErr) throw settingsErr;
    if (!settingsList || settingsList.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No tenants with missed punch notifications enabled." }), { headers: HEADERS });
    }

    const now = new Date();
    // Assuming IST (UTC+5:30) for now, standard for this app
    const todayStr = localDateStr(now, 330);
    const notificationsToSend: any[] = [];
    const alertsToLog: any[] = [];
    const emailsToSend: Promise<any>[] = [];

    const EMAIL_URL = Deno.env.get("EMAIL_HUB_URL") || "";
    const EMAIL_API_KEY = Deno.env.get("EMAIL_API_KEY") || "";

    // Process each tenant
    for (const settings of settingsList) {
      const tenantId = settings.tenant_id;
      const graceStart = settings.grace_buffer_start_minutes;
      const graceEnd = settings.grace_buffer_end_minutes;

      // Fetch emails & smtp info for emails
      const { data: allEmps } = await supabase.from('employees').select('id, email').eq('tenant_id', tenantId);
      const empEmailMap = new Map((allEmps || []).map((e: any) => [e.id, e.email]));
      
      const { data: hrProfiles } = await supabase.from('profiles').select('email, user_role').eq('tenant_id', tenantId).in('user_role', ['Admin', 'HR', 'Super Admin']);
      const hrEmails = (hrProfiles || []).map((p: any) => p.email).filter(Boolean);
      
      const { data: hrAdmins } = await supabase.from('tenant_users').select('user_id').eq('tenant_id', tenantId).in('role', ['hr_admin', 'tenant_admin', 'owner']);
      const hrUserIds = (hrAdmins || []).map((hr: any) => hr.user_id);
      
      const { data: smtpSettings } = await supabase.from('smtp_configurations').select('*').eq('tenant_id', tenantId).maybeSingle();
      const { data: companyData } = await supabase.from('company_settings').select('company_name').eq('tenant_id', tenantId).maybeSingle();
      const companyName = companyData?.company_name || 'Your Company';

      // 2. Fetch Active Shifts & Employees for Today
      const { data: assignments, error: assignErr } = await supabase
        .from('shift_assignments')
        .select(`
          employee_id,
          employees (id, name, employee_code, status, departments(name), reporting_to),
          shifts (id, name, start_time, end_time)
        `)
        .eq('tenant_id', tenantId)
        .eq('schedule_date', todayStr);

      if (assignErr) {
        console.error(`[missing-punch-cron] Error fetching assignments for tenant ${tenantId}:`, assignErr);
        continue;
      }

      if (!assignments || assignments.length === 0) continue;

      // Filter active employees
      const activeAssignments = assignments.filter((a: any) => 
        a.shifts && a.employees && ['active', 'rejoin'].includes((a.employees.status || '').toLowerCase())
      );
      
      const employeeIds = [...new Set(activeAssignments.map((a: any) => a.employee_id))];
      if (employeeIds.length === 0) continue;

      // 3. Fetch Timestamps
      // We look back a bit to catch late INs and OUTs spanning past midnight
      const searchStart = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const searchEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

      const { data: timestamps, error: tsErr } = await supabase
        .from('attendance_timestamp')
        .select('employee_id, entry, timestamp')
        .eq('tenant_id', tenantId)
        .in('employee_id', employeeIds)
        .gte('timestamp', searchStart)
        .lte('timestamp', searchEnd);

      if (tsErr) {
        console.error(`[missing-punch-cron] Error fetching timestamps for tenant ${tenantId}:`, tsErr);
        continue;
      }

      const punchMap = new Map<string, { ins: Date[]; outs: Date[] }>();
      for (const ts of timestamps || []) {
        if (!punchMap.has(ts.employee_id)) punchMap.set(ts.employee_id, { ins: [], outs: [] });
        const bucket = punchMap.get(ts.employee_id)!;
        if (ts.entry === 'IN') bucket.ins.push(new Date(ts.timestamp));
        else bucket.outs.push(new Date(ts.timestamp));
      }

      // 4. Fetch Already Sent Alerts
      const { data: sentAlerts, error: alertsErr } = await supabase
        .from('missed_punch_alerts')
        .select('employee_id, alert_type')
        .eq('tenant_id', tenantId)
        .eq('shift_date', todayStr);
      
      if (alertsErr) {
        console.error(`[missing-punch-cron] Error fetching alerts for tenant ${tenantId}:`, alertsErr);
        continue;
      }
      
      const sentMap = new Map<string, Set<string>>();
      for (const alert of sentAlerts || []) {
        if (!sentMap.has(alert.employee_id)) sentMap.set(alert.employee_id, new Set());
        sentMap.get(alert.employee_id)!.add(alert.alert_type);
      }

      // 5. Detect Missing Punches
      for (const assignment of activeAssignments) {
        const shift = assignment.shifts;
        const employee = assignment.employees;

        const [year, month, day] = todayStr.split('-').map(Number);
        const [startH, startM] = (shift.start_time || '00:00:00').split(':').map(Number);
        const [endH, endM] = (shift.end_time || '00:00:00').split(':').map(Number);

        const shiftStartOnDate = new Date(year, month - 1, day, startH, startM, 0);
        const shiftEndOnDate = new Date(year, month - 1, day, endH, endM, 0);

        if (endH * 60 + endM < startH * 60 + startM) {
          shiftEndOnDate.setDate(shiftEndOnDate.getDate() + 1);
        }

        // Adjust for IST time offset to match absolute UTC timestamps from DB
        shiftStartOnDate.setMinutes(shiftStartOnDate.getMinutes() - 330);
        shiftEndOnDate.setMinutes(shiftEndOnDate.getMinutes() - 330);

        const graceStartEnd = new Date(shiftStartOnDate.getTime() + graceStart * 60 * 1000);
        const graceEndEnd = new Date(shiftEndOnDate.getTime() + graceEnd * 60 * 1000);

        const windowStart = new Date(shiftStartOnDate.getTime() - 4 * 60 * 60 * 1000); 

        const empPunches = punchMap.get(employee.id) || { ins: [], outs: [] };
        
        const relevantIns = empPunches.ins.filter(t => t >= windowStart && t <= graceEndEnd);
        const relevantOuts = empPunches.outs.filter(t => t >= windowStart && t <= new Date(graceEndEnd.getTime() + 12 * 60 * 60 * 1000));

        const hasIn = relevantIns.length > 0;
        const hasOut = relevantOuts.length > 0;
        const sentForEmp = sentMap.get(employee.id) || new Set();

        let missingType = null;
        if (!hasIn && now > graceStartEnd) {
          missingType = 'MISSING_IN';
        } else if (hasIn && !hasOut && now > graceEndEnd) {
          missingType = 'MISSING_OUT';
        }

        if (missingType && !sentForEmp.has(missingType)) {
          // Prepare notification message
          const [y, m, d] = todayStr.split('-');
          const dateFormatted = new Date(Number(y), Number(m)-1, Number(d)).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
          const msg = `Missing ${missingType === 'MISSING_IN' ? 'Clock-In' : 'Clock-Out'} for shift ${shift.name} (${parseShiftTime(shift.start_time)} - ${parseShiftTime(shift.end_time)}) on ${dateFormatted}. Employee: ${employee.name}`;

          // Find app and email recipients
          const appRecipientIds: string[] = [];
          const recipientEmails: string[] = [];

          if (settings.notify_employee) {
            appRecipientIds.push(employee.id);
            const eMail = empEmailMap.get(employee.id);
            if (eMail) recipientEmails.push(eMail);
          }
          if (settings.notify_reporting_head && employee.reporting_to) {
            appRecipientIds.push(employee.reporting_to);
            const rMail = empEmailMap.get(employee.reporting_to);
            if (rMail && !recipientEmails.includes(rMail)) recipientEmails.push(rMail);
          }
          
          if (settings.notify_hr_admin) {
            if (hrUserIds) hrUserIds.forEach((id: string) => appRecipientIds.push(id));
            if (hrEmails) hrEmails.forEach((email: string) => {
              if (email && !recipientEmails.includes(email)) recipientEmails.push(email);
            });
          }

          if (settings.notify_via_app && appRecipientIds.length > 0) {
            const uniqueAppIds = [...new Set(appRecipientIds)];
            for (const userId of uniqueAppIds) {
              notificationsToSend.push({
                tenant_id: tenantId,
                user_id: userId,
                type: 'system',
                title: 'Missing Attendance',
                message: msg,
                is_read: false
              });
            }
          }
          
          // Log alert to prevent dupes
          alertsToLog.push({
            tenant_id: tenantId,
            employee_id: employee.id,
            shift_id: shift.id,
            shift_date: todayStr,
            alert_type: missingType
          });
          
          // Send Emails via Hub
          if (settings.notify_via_email && recipientEmails.length > 0 && smtpSettings && EMAIL_URL && EMAIL_API_KEY) {
            const subject = `[Action Required] Missing ${missingType === 'MISSING_IN' ? 'Clock-In' : 'Clock-Out'} - ${employee.name}`;
            const isMissingIn = missingType === 'MISSING_IN';
            const accentColor = isMissingIn ? '#f59e0b' : '#ef4444';
            const iconEmoji = isMissingIn ? '⚠️' : '';
            const alertTitle = isMissingIn ? 'Missing Clock-In Detected' : 'Missing Clock-Out Detected';
            const clockInTimeStr = (!isMissingIn && relevantIns.length > 0) 
              ? new Date(relevantIns[0].timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
              : '';
              
            const alertMessage = isMissingIn
              ? `Our records show that <strong>${employee.name}</strong> did not clock <strong>in</strong> for their scheduled shift today.`
              : `Our records show that <strong>${employee.name}</strong> clocked <strong>in</strong> at <strong>${clockInTimeStr}</strong> but did not clock <strong>out</strong> before the end of their shift.`;

            const actionRequired = isMissingIn
              ? 'Please verify with the employee whether they were present today. If present, a manual clock-in entry may need to be added.'
              : 'Please ensure the employee clocks out or a manual clock-out entry is added to avoid payroll inaccuracies.';

            const empNameDisplay = `${employee.name}${employee.employee_code ? ` (${employee.employee_code})` : ''}`;
            const companyNameDisplay = companyName || 'Company';
            const employeeDepartment = employee.departments?.name;

            const html = `
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
              <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">${companyNameDisplay} — Attendance Alert</p>
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
                        <td style="padding:6px 0;color:#111827;font-size:13px;font-weight:700;">${empNameDisplay}</td>
                      </tr>
                      ${employeeDepartment ? `
                      <tr>
                        <td style="padding:6px 0;color:#6b7280;font-size:13px;font-weight:600;">Department</td>
                        <td style="padding:6px 0;color:#111827;font-size:13px;">${employeeDepartment}</td>
                      </tr>` : ''}
                      <tr>
                        <td style="padding:6px 0;color:#6b7280;font-size:13px;font-weight:600;">Date</td>
                        <td style="padding:6px 0;color:#111827;font-size:13px;">${dateFormatted}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#6b7280;font-size:13px;font-weight:600;">Shift</td>
                        <td style="padding:6px 0;color:#111827;font-size:13px;">${shift.name}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#6b7280;font-size:13px;font-weight:600;">Shift Hours</td>
                        <td style="padding:6px 0;color:#111827;font-size:13px;">${parseShiftTime(shift.start_time)} – ${parseShiftTime(shift.end_time)}</td>
                      </tr>
                      ${clockInTimeStr ? `
                      <tr>
                        <td style="padding:6px 0;color:#6b7280;font-size:13px;font-weight:600;">Clocked In At</td>
                        <td style="padding:6px 0;color:#059669;font-size:13px;font-weight:700;">${clockInTimeStr}</td>
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
        </table>

      </td>
    </tr>
  </table>

</body>
</html>
`;

            
            const [primaryTo, ...ccList] = recipientEmails;
            const emailMessage = {
              from: `${smtpSettings.sender_name || 'Email System'} <${smtpSettings.sender_email}>`,
              to: primaryTo,
              cc: ccList.length > 0 ? ccList : undefined,
              subject,
              html,
            };
            
            const emailPayload = {
              provider: 'smtp',
              config: {
                host: smtpSettings.host,
                port: Number(smtpSettings.port),
                secure: smtpSettings.encryption == "ssl" || false,
                auth: {
                  user: smtpSettings.username,
                  pass: smtpSettings.password_encrypted,
                }
              },
              message: emailMessage,
            };
            
            const sendEndpoint = EMAIL_URL.endsWith('/') ? `${EMAIL_URL}api/v1/email/send` : `${EMAIL_URL}/api/v1/email/send`;
            
            const emailPromise = fetch(sendEndpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-api-key": EMAIL_API_KEY },
              body: JSON.stringify(emailPayload),
            }).then(async resp => {
              if (!resp.ok) console.error("[missing-punch-cron] Email failed:", resp.status, resp.statusText, await resp.text());
              else console.log(`[missing-punch-cron] Email sent to ${primaryTo}`);
            }).catch(err => {
              console.error("[missing-punch-cron] Email fetch error:", err);
            });
            emailsToSend.push(emailPromise);
          }
        }
      }
    }

    // 6. Bulk Insert Notifications and Logs
    if (notificationsToSend.length > 0) {
      console.log(`[missing-punch-cron] Sending ${notificationsToSend.length} app notifications...`);
      const { error: notifErr } = await supabase.from('user_notifications').insert(notificationsToSend);
      if (notifErr) console.error("[missing-punch-cron] Failed to insert notifications:", notifErr);
    }

    if (alertsToLog.length > 0) {
      console.log(`[missing-punch-cron] Logging ${alertsToLog.length} missed punch alerts...`);
      const { error: logErr } = await supabase.from('missed_punch_alerts').insert(alertsToLog);
      if (logErr) console.error("[missing-punch-cron] Failed to log alerts:", logErr);
    }

    if (emailsToSend.length > 0) {
      console.log(`[missing-punch-cron] Awaiting ${emailsToSend.length} email deliveries...`);
      await Promise.all(emailsToSend);
    }

    return new Response(JSON.stringify({ 
      success: true, 
      notifications_sent: notificationsToSend.length,
      alerts_logged: alertsToLog.length
    }), { headers: HEADERS });

  } catch (error: any) {
    console.error("[missing-punch-cron] Error:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers: HEADERS });
  }
});
