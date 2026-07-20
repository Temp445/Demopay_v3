import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-manual-sync, x-tenant-id",
  "Content-Type": "application/json",
};

// Format a date in HH:mm (24-hour) using a UTC offset in minutes
function formatHHMM(date: Date, utcOffsetMinutes = 0): string {
  const localMs = date.getTime() + utcOffsetMinutes * 60 * 1000;
  const d = new Date(localMs);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

// Return today's date as YYYY-MM-DD in local time (UTC + offset)
function localDateStr(date: Date, utcOffsetMinutes = 0): string {
  const localMs = date.getTime() + utcOffsetMinutes * 60 * 1000;
  const d = new Date(localMs);
  return d.toISOString().slice(0, 10);
}

// Build a simple attendance report HTML
function getInitials(name: string): string {
  if (!name) return "U";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

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

function buildReportHtml(
  shiftName: string,
  shiftStart: string,
  shiftEnd: string,
  totalAssigned: number,
  present: Array<{ name: string; code?: string; clockInTime?: string }>,
  absent: Array<{ name: string; code?: string }>,
  unscheduled: Array<{ name: string; code?: string; clockInTime?: string }>,
  sentAt: string,
  isManualTest?: boolean
): string {
  const totalClockedIn = present.length + unscheduled.length;
  const fmtTime = (t: string) => (t && t.length >= 5 ? t.slice(0, 5) : "--:--");

  const badgeHtml = isManualTest
    ? `<span style="background:#fee2e2;color:#991b1b;border:1px solid #fecdd3;padding:3px 8px;border-radius:5px;font-size:11px;font-weight:800;letter-spacing:0.5px;text-transform:uppercase;margin-left:10px;vertical-align:middle;display:inline-block;">TESTING SAMPLE</span>`
    : "";

  const absentRows = absent.length === 0
    ? `<tr><td colspan="2" style="padding:20px 16px;text-align:center;color:#f1f5f9;font-size:13px;font-style:italic;">Zero Absentees!</td></tr>`
    : absent.map(emp => `
        <tr style="border-top:1px solid #f1f5f9;">
          <td style="padding:12px 16px;font-size:13px;color:#64748b;font-family:monospace;vertical-align:middle;width:30%;border-top:1px solid #f1f5f9;">${emp.code || "N/A"}</td>
          <td style="padding:12px 16px;vertical-align:middle;border-top:1px solid #f1f5f9;">
            <span style="background:#fecdd3;color:#e11d48;border-radius:50%;width:34px;height:34px;line-height:34px;text-align:center;display:inline-block;font-size:12px;font-weight:700;vertical-align:middle;margin-right:10px;">${getInitials(emp.name)}</span>
            <span style="font-size:13px;font-weight:500;color:#1e293b;vertical-align:middle;">${emp.name}</span>
          </td>
        </tr>`).join("");

  const presentRows = present.length === 0
    ? `<tr><td colspan="3" style="padding:20px 16px;text-align:center;color:#94a3b8;font-size:13px;font-style:italic;">No assigned employees clocked in yet</td></tr>`
    : present.map(emp => `
        <tr style="border-top:1px solid #f1f5f9;">
          <td style="padding:12px 16px;font-size:13px;color:#64748b;font-family:monospace;vertical-align:middle;width:30%;border-top:1px solid #f1f5f9;">${emp.code || "N/A"}</td>
          <td style="padding:12px 16px;vertical-align:middle;border-top:1px solid #f1f5f9;">
            <span style="background:#bbf7d0;color:#059669;border-radius:50%;width:34px;height:34px;line-height:34px;text-align:center;display:inline-block;font-size:12px;font-weight:700;vertical-align:middle;margin-right:10px;">${getInitials(emp.name)}</span>
            <span style="font-size:13px;font-weight:500;color:#1e293b;vertical-align:middle;">${emp.name}</span>
          </td>
          <td style="padding:12px 16px;vertical-align:middle;text-align:right;border-top:1px solid #f1f5f9;">
            <span style="background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;padding:4px 10px;border-radius:6px;font-size:12px;font-family:monospace;font-weight:600;display:inline-block;">⏱ ${emp.clockInTime || "--:--"}</span>
          </td>
        </tr>`).join("");

  const unscheduledRows = unscheduled.length === 0
    ? `<tr><td colspan="3" style="padding:20px 16px;text-align:center;color:#94a3b8;font-size:13px;font-style:italic;">No unassigned employees In</td></tr>`
    : unscheduled.map(emp => `
        <tr style="border-top:1px solid #f1f5f9;">
          <td style="padding:12px 16px;font-size:13px;color:#64748b;font-family:monospace;vertical-align:middle;width:30%;border-top:1px solid #f1f5f9;">${emp.code || "N/A"}</td>
          <td style="padding:12px 16px;vertical-align:middle;border-top:1px solid #f1f5f9;">
            <span style="background:#fef08a;color:#ca8a04;border-radius:50%;width:34px;height:34px;line-height:34px;text-align:center;display:inline-block;font-size:12px;font-weight:700;vertical-align:middle;margin-right:10px;">${getInitials(emp.name)}</span>
            <span style="font-size:13px;font-weight:500;color:#1e293b;vertical-align:middle;">${emp.name}</span>
          </td>
          <td style="padding:12px 16px;vertical-align:middle;text-align:right;border-top:1px solid #f1f5f9;">
            <span style="background:#fefce8;color:#ca8a04;border:1px solid #fef08a;padding:4px 10px;border-radius:6px;font-size:12px;font-family:monospace;font-weight:600;display:inline-block;">⏱ ${emp.clockInTime || "--:--"}</span>
          </td>
        </tr>`).join("");

  const footerText = isManualTest
    ? `Sent via Ace Payroll System &bull; ${sentAt} (Manual Test Trigger - Sample Purpose)`
    : `Sent via Ace Payroll System &bull; ${sentAt} (Auto Scheduled)`;

  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:640px;margin:32px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background:#3730a3;padding:28px 32px 24px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;line-height:1.2;vertical-align:middle;">Attendance Report based on shift ${badgeHtml}</td>
        </tr>
      </table>
      <div style="margin-top:14px;">
        <span style="display:inline-block;background:#4338ca;border:1px solid #4f46e5;padding:6px 14px;border-radius:999px;font-size:13px;color:#e0e7ff;font-weight:500;">
          Shift: <strong style="color:#ffffff;">${shiftName}</strong> &nbsp;&middot;&nbsp; ${fmtTime(shiftStart)} &ndash; ${fmtTime(shiftEnd)}
        </span>
      </div>
    </div>

    
    <!-- Metric Cards -->
    <div style="padding: 24px 20px 0;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%; border-collapse:separate; border-spacing:12px 12px;">
        <tr>
          <td width="33.33%" style="background:#eef2ff; border:1px solid #c7d2fe; border-radius:12px; padding:16px 8px; text-align:center; vertical-align:middle;">
            <div style="font-size:28px; font-weight:800; color:#3730a3; line-height:1;">${totalAssigned}</div>
            <div style="font-size:10px; font-weight:700; color:#6366f1; text-transform:uppercase; letter-spacing:0.8px; margin-top:6px;">Total Employees Assigned to This Shift</div>
          </td>
          <td width="33.33%" style="background:#f0fdf4; border:1px solid #86efac; border-radius:12px; padding:16px 8px; text-align:center; vertical-align:middle;">
            <div style="font-size:28px; font-weight:800; color:#16a34a; line-height:1;">${present.length}</div>
            <div style="font-size:10px; font-weight:700; color:#22c55e; text-transform:uppercase; letter-spacing:0.8px; margin-top:6px;">Present "Clock In" Employees</div>
          </td>
          <td width="33.33%" style="background:#fef2f2; border:1px solid #fca5a5; border-radius:12px; padding:16px 8px; text-align:center; vertical-align:middle;">
            <div style="font-size:28px; font-weight:800; color:#dc2626; line-height:1;">${absent.length}</div>
            <div style="font-size:10px; font-weight:700; color:#ef4444; text-transform:uppercase; letter-spacing:0.8px; margin-top:6px;">Absent "Not Clock In" Employees</div>
          </td>
        </tr>
        <tr>
          <td colspan="1" style="background:#fefce8; border:1px solid #fde047; border-radius:12px; padding:16px 8px; text-align:center; vertical-align:middle;">
            <div style="font-size:28px; font-weight:800; color:#ca8a04; line-height:1;">${unscheduled.length}</div>
            <div style="font-size:10px; font-weight:700; color:#eab308; text-transform:uppercase; letter-spacing:0.8px; margin-top:6px;">Unassigned Employees "Clocked In"</div>
          </td>

          <td colspan="1" style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:16px 8px; text-align:center; vertical-align:middle;">
            <div style="font-size:28px; font-weight:800; color:#334155; line-height:1;">${totalClockedIn}</div>
            <div style="font-size:10px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.8px; margin-top:6px;">Total Employees <br/> "Clocked In" this shift</div>
          </td>
        </tr>
      </table>
    </div>

    <!-- Main Content Container (No Flex!) -->
    <div style="padding:24px 32px 32px;">

      <!-- Absent Section -->
      <div style="border:1px solid #fca5a5;border-radius:12px;overflow:hidden;margin-bottom:24px;background:#ffffff;">
        <table style="width:100%;border-collapse:collapse;background:#fff1f2;border-bottom:1px solid #fca5a5;">
          <tr>
            <td style="padding:14px 18px;text-align:left;vertical-align:middle;">
              <span style="background:#fecdd3;color:#dc2626;width:26px;height:26px;line-height:26px;text-align:center;border-radius:6px;display:inline-block;font-size:13px;font-weight:700;vertical-align:middle;margin-right:8px;">!</span>
              <span style="font-size:14px;font-weight:600;color:#dc2626;vertical-align:middle;">Absent employees</span>
              <span style="font-size:13px;color:#f87171;font-weight:400;vertical-align:middle;margin-left:4px;">(assigned)</span>
            </td>
            <td style="padding:14px 18px;text-align:right;vertical-align:middle;">
              <span style="background:#fecdd3;color:#dc2626;border-radius:999px;padding:3px 10px;font-size:13px;font-weight:700;display:inline-block;">${absent.length}</span>
            </td>
          </tr>
        </table>
        <table style="width:100%;border-collapse:collapse;background:#ffffff;">
          <thead>
            <tr style="border-bottom:1px solid #f1f5f9;background:#ffffff;">
              <th style="padding:10px 16px;text-align:left;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.8px;width:30%;">CODE</th>
              <th style="padding:10px 16px;text-align:left;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.8px;">EMPLOYEE NAME</th>
            </tr>
          </thead>
          <tbody>${absentRows}</tbody>
        </table>
      </div>

      <!-- Unscheduled Section -->
      <div style="border:1px solid #fde047;border-radius:12px;overflow:hidden;margin-bottom:24px;background:#ffffff;">
        <table style="width:100%;border-collapse:collapse;background:#fefce8;border-bottom:1px solid #fde047;">
          <tr>
            <td style="padding:14px 18px;text-align:left;vertical-align:middle;">
              <span style="background:#fef08a;color:#ca8a04;width:26px;height:26px;line-height:26px;text-align:center;border-radius:6px;display:inline-block;font-size:13px;font-weight:700;vertical-align:middle;margin-right:8px;">+</span>
              <span style="font-size:14px;font-weight:600;color:#ca8a04;vertical-align:middle;">Unassigned employees "Clocked In"</span>
            </td>
            <td style="padding:14px 18px;text-align:right;vertical-align:middle;">
              <span style="background:#fef08a;color:#ca8a04;border-radius:999px;padding:3px 10px;font-size:13px;font-weight:700;display:inline-block;">${unscheduled.length}</span>
            </td>
          </tr>
        </table>
        <table style="width:100%;border-collapse:collapse;background:#ffffff;">
          <thead>
            <tr style="border-bottom:1px solid #f1f5f9;background:#ffffff;">
              <th style="padding:10px 16px;text-align:left;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.8px;width:30%;">CODE</th>
              <th style="padding:10px 16px;text-align:left;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.8px;">EMPLOYEE NAME</th>
              <th style="padding:10px 16px;text-align:right;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.8px;">CLOCK IN</th>
            </tr>
          </thead>
          <tbody>${unscheduledRows}</tbody>
        </table>
      </div>

        <!-- Present Section -->
      <div style="border:1px solid #86efac;border-radius:12px;overflow:hidden;margin-bottom:24px;background:#ffffff;">
        <table style="width:100%;border-collapse:collapse;background:#f0fdf4;border-bottom:1px solid #86efac;">
          <tr>
            <td style="padding:14px 18px;text-align:left;vertical-align:middle;">
              <span style="background:#bbf7d0;color:#16a34a;width:26px;height:26px;line-height:26px;text-align:center;border-radius:6px;display:inline-block;font-size:13px;font-weight:700;vertical-align:middle;margin-right:8px;">✓</span>
              <span style="font-size:14px;font-weight:600;color:#16a34a;vertical-align:middle;">Present employees</span>
              <span style="font-size:13px;color:#4ade80;font-weight:400;vertical-align:middle;margin-left:4px;">(assigned)</span>
            </td>
            <td style="padding:14px 18px;text-align:right;vertical-align:middle;">
              <span style="background:#bbf7d0;color:#16a34a;border-radius:999px;padding:3px 10px;font-size:13px;font-weight:700;display:inline-block;">${present.length}</span>
            </td>
          </tr>
        </table>
        <table style="width:100%;border-collapse:collapse;background:#ffffff;">
          <thead>
            <tr style="border-bottom:1px solid #f1f5f9;background:#ffffff;">
              <th style="padding:10px 16px;text-align:left;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.8px;width:30%;">CODE</th>
              <th style="padding:10px 16px;text-align:left;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.8px;">EMPLOYEE NAME</th>
              <th style="padding:10px 16px;text-align:right;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.8px;">CLOCK IN</th>
            </tr>
          </thead>
          <tbody>${presentRows}</tbody>
        </table>
      </div>

      <!-- Footer -->
      <div style="text-align:center;padding-top:16px;">
        <p style="margin:0;font-size:11px;color:#94a3b8;font-weight:500;">${footerText}</p>
      </div>

    </div>
  </div>
</body>
</html>`;
}

function isNearestShift(isoTimestamp: string, currentShiftId: string, allShifts: any[], tzOffsetMin: number): boolean {
  if (!allShifts || allShifts.length <= 1) return true;
  const date = new Date(isoTimestamp);
  const localMs = date.getTime() + tzOffsetMin * 60 * 1000;
  const localDate = new Date(localMs);
  const clockInMinutes = localDate.getUTCHours() * 60 + localDate.getUTCMinutes();

  let minDiff = Infinity;
  let nearestShiftId = currentShiftId;

  for (const s of allShifts) {
    if (!s.start_time) continue;
    const [hh, mm] = s.start_time.split(":").map(Number);
    const shiftMinutes = hh * 60 + mm;
    let diff = Math.abs(clockInMinutes - shiftMinutes);
    if (diff > 720) {
      diff = 1440 - diff;
    }
    if (diff < minDiff) {
      minDiff = diff;
      nearestShiftId = s.id;
    }
  }

  return nearestShiftId === currentShiftId;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: HEADERS });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const EMAIL_URL = Deno.env.get("EMAIL_HUB_URL") || "";
  const EMAIL_API_KEY = Deno.env.get("EMAIL_API_KEY") || "";

  // IST offset = +5:30 = 330 minutes
  const TZ_OFFSET_MINUTES = 330;

  const now = new Date();
  const currentTimeHHMM = formatHHMM(now, TZ_OFFSET_MINUTES);
  const todayDateStr = localDateStr(now, TZ_OFFSET_MINUTES);

  console.log(`[shift-report-cron] Tick at UTC=${now.toISOString()} | IST=${currentTimeHHMM} | Date=${todayDateStr}`);

  try {
    // Check if this is a manual sync and retrieve target tenant
    const isGlobalManualTest = req.headers.get("x-manual-sync") === "true";
    const targetTenantId = req.headers.get("x-tenant-id");

    // 1. Fetch settings — for manual sync, fetch only the target tenant
    let settingsQuery = supabase
      .from("shift_report_settings")
      .select("*");

    if (isGlobalManualTest && targetTenantId) {
      settingsQuery = settingsQuery.eq("tenant_id", targetTenantId);
    } else if (!isGlobalManualTest) {
      settingsQuery = settingsQuery.eq("is_monitoring", true);
    }

    const { data: settings, error: settingsErr } = await settingsQuery;

    if (settingsErr) throw new Error(`Failed to load settings: ${settingsErr.message}`);
    if (!settings || settings.length === 0) {
      const msg = isGlobalManualTest
        ? "No shift_report_settings found for any tenant."
        : "No active monitoring tenants.";
      console.log(`[shift-report-cron] ${msg}`);
      return new Response(JSON.stringify({ success: true, message: msg }), { headers: HEADERS });
    }

    const results: any[] = [];
    const settingsToProcess = isGlobalManualTest ? settings.slice(0, 1) : settings;

    await Promise.all(
      settingsToProcess.map(async (setting) => {
        const tenantId: string = setting.tenant_id;
        const shiftId: string = setting.shift_id; // 'all' or specific uuid
        const delayMinutes: number = setting.delay_minutes || 5;
        const selectedEmployeeIds: string[] = setting.selected_employee_ids || [];
        let customRecipients: Array<{ name: string; email: string; isSelected: boolean }> = [];
        if (typeof setting.custom_recipients === "string") {
          try { customRecipients = JSON.parse(setting.custom_recipients); } catch (e) {}
        } else if (Array.isArray(setting.custom_recipients)) {
          customRecipients = setting.custom_recipients;
        }

        const { data: allTenantShifts, error: shiftsErr } = await supabase
          .from("shifts")
          .select("id, name, start_time, end_time")
          .eq("tenant_id", tenantId);

        if (shiftsErr || !allTenantShifts || allTenantShifts.length === 0) {
          console.warn(`[shift-report-cron] No shifts for tenant ${tenantId}`);
          return;
        }

        let targetShifts = shiftId === "all" ? allTenantShifts : allTenantShifts.filter((s: any) => s.id === shiftId);
        if (targetShifts.length === 0) targetShifts = allTenantShifts;

        const shiftsToProcess = isGlobalManualTest ? targetShifts.slice(0, 1) : targetShifts;

        await Promise.all(
          shiftsToProcess.map(async (shift) => {
            const tzOffsetMs = TZ_OFFSET_MINUTES * 60 * 1000;
            const [rawHH, rawMM] = shift.start_time.split(":").map(Number);

            const localNow = new Date(now.getTime() + tzOffsetMs);
            const yyyy = localNow.getUTCFullYear();
            const mm = localNow.getUTCMonth();
            const dd = localNow.getUTCDate();

            let targetReportMs = Date.UTC(yyyy, mm, dd, rawHH, rawMM) - tzOffsetMs + delayMinutes * 60 * 1000;
            let shiftDateMs = Date.UTC(yyyy, mm, dd) - tzOffsetMs;

            const isManualTest = isGlobalManualTest;
            const WINDOW_MS = 10 * 60 * 1000;
            const isTimeToSend = now.getTime() >= targetReportMs && now.getTime() <= (targetReportMs + WINDOW_MS);

            console.log(
              `[shift-report-cron] Shift '${shift.name}': target=${new Date(targetReportMs).toISOString()} now=${now.toISOString()} inWindow=${isTimeToSend}`
            );

            if (!isTimeToSend && !isManualTest) {
              return;
            }

            const windowStart = new Date(targetReportMs).toISOString();
            const windowEnd = new Date(targetReportMs + WINDOW_MS).toISOString();

            const { data: existingLogs } = await supabase
              .from("shift_report_logs")
              .select("id")
              .eq("tenant_id", tenantId)
              .eq("shift_id", shift.id)
              .eq("triggered_by", "cron")
              .gte("sent_at", windowStart)
              .lte("sent_at", windowEnd)
              .limit(1);

            if (existingLogs && existingLogs.length > 0 && !isManualTest) {
              console.log(`[shift-report-cron] Already sent report for shift ${shift.name} in this window. Skipping.`);
              return;
            }

            const reportDateStr = new Date(shiftDateMs + tzOffsetMs).toISOString().split('T')[0];
            console.log(`[shift-report-cron] ${isManualTest ? 'MANUAL SYNC' : 'TIME MATCH'}! Sending report for shift '${shift.name}' (Date: ${reportDateStr}, Tenant: ${tenantId})`);

            const dayStartISO = new Date(shiftDateMs).toISOString();
            const dayEndISO = new Date(shiftDateMs + 24 * 60 * 60 * 1000 - 1).toISOString();

            const [assignmentsRes, timestampsRes, smtpRes, empRes, allAssignRes] = await Promise.all([
              !isManualTest
                ? supabase
                    .from("shift_assignments")
                    .select("employee_id, employee:employees(name, employee_code)")
                    .eq("shift_id", shift.id)
                    .eq("tenant_id", tenantId)
                    .eq("schedule_date", reportDateStr)
                : Promise.resolve({ data: [], error: null }),
              !isManualTest
                ? supabase
                    .from("attendance_timestamp")
                    .select("employee_id, timestamp, employee:employees(id, name, employee_code)")
                    .eq("tenant_id", tenantId)
                    .eq("entry", "IN")
                    .gte("timestamp", dayStartISO)
                    .lte("timestamp", dayEndISO)
                : Promise.resolve({ data: [], error: null }),
              supabase
                .from("smtp_configurations")
                .select("*")
                .eq("tenant_id", tenantId)
                .single(),
              selectedEmployeeIds.length > 0
                ? supabase
                    .from("employees")
                    .select("id, name, email")
                    .eq("tenant_id", tenantId)
                    .in("id", selectedEmployeeIds)
                : Promise.resolve({ data: null, error: null }),
              !isManualTest
                ? supabase
                    .from("shift_assignments")
                    .select("employee_id")
                    .eq("tenant_id", tenantId)
                    .eq("schedule_date", reportDateStr)
                : Promise.resolve({ data: [], error: null })
            ]);

            const assignments = assignmentsRes.data;
            const assignErr = assignmentsRes.error;
            const timestamps = timestampsRes.data;
            const smtpSettings = smtpRes.data;
            const smtpErr = smtpRes.error;
            const empData = empRes.data;

            let present: any[];
            let absent: any[];
            let unscheduled: any[];
            let totalAssigned: number;

            if (isManualTest) {
              totalAssigned = 10;
              present = [
                { name: "Johnathan Davis", code: "EMP-2041", clockInTime: "09:55 AM" },
                { name: "Sarah Jenkins", code: "EMP-2042", clockInTime: "09:58 AM" },
                { name: "Michael Chen", code: "EMP-2045", clockInTime: "10:00 AM" },
                { name: "Emily Rodriguez", code: "EMP-2048", clockInTime: "10:02 AM" },
                { name: "David Kim", code: "EMP-2049", clockInTime: "10:05 AM" },
                { name: "Jessica Taylor", code: "EMP-2051", clockInTime: "10:10 AM" },
                { name: "Robert Wilson", code: "EMP-2052", clockInTime: "10:12 AM" },
                { name: "Amanda Martinez", code: "EMP-2055", clockInTime: "10:15 AM" }
              ];
              absent = [
                { name: "William Thomas", code: "EMP-2043" },
                { name: "Olivia Brown", code: "EMP-2047" }
              ];
              unscheduled = [
                { name: "Alexander Wright", code: "EMP-9011", clockInTime: "09:50 AM" },
                { name: "Victoria Green", code: "EMP-9014", clockInTime: "10:05 AM" },
                { name: "Daniel Martinez", code: "EMP-9018", clockInTime: "10:20 AM" },
                { name: "Rachel Adams", code: "EMP-9022", clockInTime: "10:30 AM" }
              ];
            } else {
              if (assignErr) {
                console.error(`[shift-report-cron] assignments error: ${assignErr.message}`);
                await insertLog(supabase, { tenantId, shift, recipientsCount: 0, presentCount: 0, absentCount: 0, totalCount: 0, status: "error", errorMessage: assignErr.message, recipientEmails: [] });
                return;
              }

              const assignedList = assignments?.map((a: any) => ({
                id: a.employee_id,
                name: (a.employee as any)?.name || "",
                code: (a.employee as any)?.employee_code || "",
              })) || [];

              const allAssignedIdsToday = new Set((allAssignRes.data || []).map((a: any) => a.employee_id));

              const clockedInMap = new Map<string, string>();
              timestamps?.forEach((t: any) => {
                if (t.employee_id && t.timestamp) {
                  if (!clockedInMap.has(t.employee_id) || t.timestamp < clockedInMap.get(t.employee_id)!) {
                    clockedInMap.set(t.employee_id, t.timestamp);
                  }
                }
              });

              const formatTimeStr = (iso?: string) => {
                if (!iso) return "--:--";
                return formatTime12(new Date(iso), TZ_OFFSET_MINUTES);
              };

              present = assignedList
                .filter((a) => clockedInMap.has(a.id))
                .map((a) => ({
                  ...a,
                  clockInTime: formatTimeStr(clockedInMap.get(a.id)),
                }));

              absent = assignedList.filter((a) => !clockedInMap.has(a.id));

              const unscheduledMap = new Map();
              timestamps?.forEach((t: any) => {
                if (t.employee_id && !allAssignedIdsToday.has(t.employee_id) && t.employee && t.timestamp) {
                  if (isNearestShift(t.timestamp, shift.id, allTenantShifts, TZ_OFFSET_MINUTES)) {
                    const current = unscheduledMap.get(t.employee_id);
                    if (!current || t.timestamp < current.rawTimestamp) {
                      unscheduledMap.set(t.employee_id, {
                        id: t.employee_id,
                        name: (t.employee as any)?.name || "",
                        code: (t.employee as any)?.employee_code || "",
                        clockInTime: formatTimeStr(t.timestamp),
                        rawTimestamp: t.timestamp,
                      });
                    }
                  }
                }
              });
              unscheduled = Array.from(unscheduledMap.values());
              totalAssigned = assignedList.length;
            }

            const employeeRecipients: Array<{ name: string; email: string }> = [];
            empData?.forEach((e: any) => {
              if (e.email) employeeRecipients.push({ name: e.name, email: e.email });
            });

            const selectedCustom = customRecipients
              .filter((r) => r.isSelected !== false && r.email)
              .map((r) => ({ name: r.name, email: r.email }));

            const allRecipients = [...employeeRecipients, ...selectedCustom];

            if (allRecipients.length === 0) {
              console.warn(`[shift-report-cron] No recipients configured for tenant ${tenantId}, shift ${shift.name}`);
              await insertLog(supabase, { tenantId, shift, recipientsCount: 0, presentCount: present.length, absentCount: absent.length, totalCount: totalAssigned, status: "error", errorMessage: "No recipients configured" });
              return;
            }

            if (smtpErr || !smtpSettings) {
              console.error(`[shift-report-cron] SMTP settings missing for tenant ${tenantId}`);
              await insertLog(supabase, { tenantId, shift, recipientsCount: 0, presentCount: 0, absentCount: 0, totalCount: 0, status: "error", errorMessage: "SMTP settings missing" });
              return;
            }

            const sentAt = new Date().toISOString();
            const shiftName = isManualTest ? "Demo Shift" : shift.name;
            const shiftStart = isManualTest ? "10:00:00" : shift.start_time;
            const shiftEnd = isManualTest ? "18:30:00" : shift.end_time;
            const reportHtml = buildReportHtml(shiftName, shiftStart, shiftEnd, totalAssigned, present, absent, unscheduled, sentAt, isManualTest);
            const subject = isManualTest
              ? `[TESTING SAMPLE] Attendance Report: Demo Shift - ${todayDateStr}`
              : `[Attendance Report] ${shift.name} - ${todayDateStr}`;

            const recipientsToProcess = isManualTest ? allRecipients.slice(0, 1) : allRecipients;

            const sendResults = await Promise.all(
              recipientsToProcess.map(async (recipient) => {
                try {
                  const emailMessage = {
                    from: `${smtpSettings.sender_name || 'Email System'} <${smtpSettings.sender_email}>`,
                    to: recipient.email,
                    subject,
                    html: reportHtml,
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
                      },
                    },
                    message: emailMessage,
                  };

                  const sendEndpoint = EMAIL_URL.endsWith('/') ? `${EMAIL_URL}api/v1/email/send` : `${EMAIL_URL}/api/v1/email/send`;

                  const resp = await fetch(sendEndpoint, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      "x-api-key": EMAIL_API_KEY,
                    },
                    body: JSON.stringify(emailPayload),
                  });

                  if (!resp.ok) {
                    const errBody = await resp.text();
                    console.error(`[shift-report-cron] Email failed to ${recipient.email}: ${resp.status} ${errBody}`);
                    return { success: false, error: `HTTP ${resp.status}: ${errBody}` };
                  } else {
                    console.log(`[shift-report-cron] Email sent to ${recipient.email}`);
                    return { success: true, error: null };
                  }
                } catch (e: any) {
                  console.error(`[shift-report-cron] Fetch error to ${recipient.email}: ${e.message}`);
                  return { success: false, error: e.message };
                }
              })
            );

            const successCount = sendResults.filter(r => r.success).length;
            const failure = sendResults.find(r => !r.success);
            const sendError = failure ? failure.error : null;

            const logStatus = sendError && successCount === 0 ? "error" : successCount > 0 ? "success" : "error";
            await insertLog(supabase, {
              tenantId,
              shift,
              recipientsCount: allRecipients.length,
              presentCount: present.length,
              absentCount: absent.length,
              totalCount: totalAssigned,
              status: logStatus,
              errorMessage: sendError,
              recipientEmails: allRecipients.map(r => r.email),
            });

            results.push({ tenant: tenantId, shift: shift.name, sent: successCount, total: allRecipients.length, status: logStatus });
          })
        );
      })
    );

    return new Response(JSON.stringify({ success: true, processed: results }), { headers: HEADERS });
  } catch (err: any) {
    console.error("[shift-report-cron] FATAL:", err.message);
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: HEADERS });
  }
});

async function insertLog(
  supabase: any,
  params: {
    tenantId: string;
    shift: { id: string; name: string };
    recipientsCount: number;
    presentCount: number;
    absentCount: number;
    totalCount: number;
    status: string;
    errorMessage?: string | null;
    recipientEmails: string[];
  }
) {
  const { error } = await supabase.from("shift_report_logs").insert({
    tenant_id: params.tenantId,
    shift_id: params.shift.id,
    shift_name: params.shift.name,
    sent_at: new Date().toISOString(),
    recipients_count: params.recipientsCount,
    present_count: params.presentCount,
    absent_count: params.absentCount,
    total_count: params.totalCount,
    triggered_by: "cron",
    status: params.status,
    error_message: params.errorMessage || null,
    recipient_emails: params.recipientEmails,
  });
  if (error) console.error("[shift-report-cron] Failed to write log:", error.message);
}
