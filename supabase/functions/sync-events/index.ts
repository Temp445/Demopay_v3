import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

// Native MD5 using Deno std crypto
async function md5(data: string): Promise<string> {
  const buffer = await crypto.subtle.digest("MD5", new TextEncoder().encode(data));
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function fetchWithDigest(url: string, method: string, username: string, password: string, bodyObj: any) {
  const body = JSON.stringify(bodyObj);
  const initialRes = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body });
  if (initialRes.status !== 401) return initialRes;

  const authHeader = initialRes.headers.get("www-authenticate");
  if (!authHeader) throw new Error("Device returned 401 but no WWW-Authenticate header was found.");

  const realm = authHeader.match(/realm="(.*?)"/)?.[1] || "";
  const nonce = authHeader.match(/nonce="(.*?)"/)?.[1] || "";
  const qop   = authHeader.match(/qop="(.*?)"/)?.[1]   || "auth";
  const opaqueMatch = authHeader.match(/opaque="(.*?)"/);
  const opaqueStr   = opaqueMatch ? `, opaque="${opaqueMatch[1]}"` : "";

  const nc     = "00000001";
  const cnonce = Math.random().toString(36).substring(2, 10);
  const uri    = new URL(url).pathname + new URL(url).search;

  const ha1          = await md5(`${username}:${realm}:${password}`);
  const ha2          = await md5(`${method}:${uri}`);
  const responseHash = await md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`);

  const digestAuthHeader = `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", qop=${qop}, nc=${nc}, cnonce="${cnonce}", response="${responseHash}"${opaqueStr}`;

  return await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", "Authorization": digestAuthHeader },
    body
  });
}

// Fetch all paginated events from a single device
async function fetchAllEventsFromDevice(
  settings: any,
  startTimeStr: string,
  endTimeStr: string
): Promise<any[]> {
  const allEvents: any[] = [];
  let currentPosition = 0;
  let hasMore = true;

  while (hasMore) {
    const isapiPayload = {
      AcsEventCond: {
        searchID: "1",
        searchResultPosition: currentPosition,
        maxResults: 500,
        major: 0,
        minor: 0,
        startTime: startTimeStr,
        endTime: endTimeStr,
      }
    };

    const deviceUrl = `http://${settings.device_ip}/ISAPI/AccessControl/AcsEvent?format=json`;
    const response = await fetchWithDigest(
      deviceUrl, "POST",
      settings.admin_user, settings.admin_password,
      isapiPayload
    );

    if (!response.ok) throw new Error(`Device "${settings.device_name}" rejected request. Status: ${response.status}`);

    const rawText = await response.text();
    let eventData;
    try {
      eventData = JSON.parse(rawText);
    } catch {
      throw new Error(`Failed to parse response from device "${settings.device_name}".`);
    }

    const eventsBatch = eventData?.AcsEvent?.InfoList || [];
    allEvents.push(...eventsBatch);

    if (eventData?.AcsEvent?.responseStatusStrg === "MORE" && eventsBatch.length > 0) {
      currentPosition += eventsBatch.length;
    } else {
      hasMore = false;
    }
  }

  return allEvents;
}

const normalizeCode = (code: string | null | undefined) =>
  code ? String(code).replace(/[\s_]/g, '').toUpperCase() : "";

serve(async (req) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hikvision-token"
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase    = createClient(supabaseUrl, supabaseKey);

  try {
    // ── 1. Security token check ──────────────────────────────────────────────
    const hikToken    = req.headers.get("x-hikvision-token");
    const serverToken = Deno.env.get("HIKVISION_API_TOKEN");
    if (!hikToken || hikToken !== serverToken) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized: Invalid security token" }),
        { status: 401, headers }
      );
    }

    const reqBody = await req.json().catch(() => ({}));

    // Accept either:
    //   settingsIds: string[]  — multi-device manual sync (new)
    //   settingsId:  string    — single-device / cron (legacy, still supported)
    const { startDate, endDate, tenantId, settingsId, settingsIds } = reqBody;

    // Resolve the list of device IDs to process
    // Multi-device: settingsIds array takes priority
    // Single-device (cron / legacy): fall back to settingsId
    const deviceIdList: string[] = settingsIds?.length
      ? settingsIds
      : settingsId
      ? [settingsId]
      : [];

    // ── 2. JWT & tenant verification (manual syncs only) ─────────────────────
    const isManualSync = Boolean(startDate);
    if (isManualSync) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(
          JSON.stringify({ success: false, error: "Unauthorized: Missing Authorization header" }),
          { status: 401, headers }
        );
      }
      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) {
        return new Response(
          JSON.stringify({ success: false, error: "Unauthorized: Invalid JWT" }),
          { status: 401, headers }
        );
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("tenant_id")
        .eq("id", user.id)
        .single();

      if (profileError || !profile || profile.tenant_id !== tenantId) {
        return new Response(
          JSON.stringify({ success: false, error: "Forbidden: You do not have access to this tenant" }),
          { status: 403, headers }
        );
      }
    }

    if (!tenantId)            throw new Error("tenantId is required");
    if (!deviceIdList.length) throw new Error("settingsId or settingsIds is required.");

    // ── 3. Load all device settings ──────────────────────────────────────────
    const { data: allSettings, error: settingsErr } = await supabase
      .from("hik_device_settings")
      .select("*")
      .in("id", deviceIdList)
      .eq("tenant_id", tenantId);

    if (settingsErr) throw new Error(`Database Error: ${settingsErr.message}`);
    if (!allSettings || allSettings.length === 0) throw new Error("No device configurations found.");

    // Filter to only enabled devices (for cron: also check enable_auto_sync)
    const activeSettings = allSettings.filter(s => {
      if (!s.is_enabled) return false;
      if (!isManualSync && !s.enable_auto_sync) return false;
      return true;
    });

    if (activeSettings.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "No active/enabled devices found." }),
        { status: 200, headers: { ...headers, "Content-Type": "application/json" } }
      );
    }

    // ── 4. Build valid employees map ──────────────────────────────────────────
    const { data: employeesData } = await supabase
      .from("employees")
      .select("employee_code")
      .eq("tenant_id", tenantId);

    const validEmployeesMap = new Map<string, string>();
    employeesData?.forEach(emp => {
      if (emp.employee_code) validEmployeesMap.set(normalizeCode(emp.employee_code), emp.employee_code);
    });

    // ── 5. Build time range strings ───────────────────────────────────────────
    let startTimeStr: string, endTimeStr: string;
    if (isManualSync) {
      const formatExact = (d: Date) =>
        new Date(d.getTime() + 5.5 * 60 * 60 * 1000).toISOString().split('.')[0] + '+05:30';
      startTimeStr = formatExact(new Date(startDate));
      endTimeStr   = formatExact(new Date(endDate));
    } else {
      const nowIST = new Date(new Date().getTime() + 5.5 * 60 * 60 * 1000);
      startTimeStr = `${nowIST.toISOString().split('T')[0]}T00:00:00+05:30`;
      endTimeStr   = nowIST.toISOString().split('.')[0] + '+05:30';
    }

    // ── 6. Fetch events from ALL devices and merge ────────────────────────────
    //
    // KEY FIX: We fetch from ALL devices first, then merge the events into a
    // single global list sorted by (employee_id, event_time).
    //
    // Without this, processing devices sequentially can produce wrong IN/OUT:
    //   Device 1: 8:00 AM → IN, 5:00 PM → OUT  (correct within device 1)
    //   Device 2: 12:00 PM → finds last=5PM OUT → saved as IN ❌
    //
    // Merged & sorted order: 8:00 AM → IN, 12:00 PM → OUT, 5:00 PM → IN ✓
    let totalFetchedFromDevices = 0;
    const deviceErrors: string[] = [];
    let allEventsAcrossDevices: any[] = [];

    for (const settings of activeSettings) {
      try {
        const deviceEvents = await fetchAllEventsFromDevice(settings, startTimeStr, endTimeStr);
        totalFetchedFromDevices += deviceEvents.length;
        // Tag each event with its source device IP for raw_data storage
        allEventsAcrossDevices.push(...deviceEvents.map(e => ({ ...e, _source_device_ip: settings.device_ip })));
      } catch (err: any) {
        deviceErrors.push(`${settings.device_name}: ${err.message}`);
        console.error(`Error fetching from device ${settings.device_name}:`, err.message);
      }
    }

    // ── 7. Filter to valid employees ──────────────────────────────────────────
    const verifiedEvents = allEventsAcrossDevices
      .filter(evt => evt.employeeNoString && validEmployeesMap.has(normalizeCode(evt.employeeNoString)))
      .map(evt => ({
        ...evt,
        matched_employee_code: validEmployeesMap.get(normalizeCode(evt.employeeNoString))
      }));

    if (verifiedEvents.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          fetched_from_device: totalFetchedFromDevices,
          added_to_db: 0,
          skipped_duplicates: 0,
          device_errors: deviceErrors
        }),
        { headers: { ...headers, "Content-Type": "application/json" } }
      );
    }

    // ── 8. Duplicate detection against existing DB records ────────────────────
    const { data: existingRecords } = await supabase
      .from("hik_attendance_events")
      .select("employee_id, event_time")
      .eq("tenant_id", tenantId)
      .gte("event_time", startTimeStr)
      .lte("event_time", endTimeStr);

    const existingSet = new Set<string>(
      existingRecords?.map(r => `${r.employee_id}_${new Date(r.event_time).toISOString()}`) || []
    );

    // ── 9. Build new-events list, deduplicating ───────────────────────────────
    const newEventsToInsert: any[] = [];
    let skipped_duplicates = 0;

    for (const evt of verifiedEvents) {
      const uniqueKey = `${evt.matched_employee_code}_${new Date(evt.time).toISOString()}`;
      if (existingSet.has(uniqueKey)) {
        skipped_duplicates++;
      } else {
        newEventsToInsert.push({
          tenant_id:   tenantId,
          employee_id: evt.matched_employee_code,
          event_time:  evt.time,
          device_ip:   evt._source_device_ip,
          raw_data:    evt
        });
        existingSet.add(uniqueKey);
      }
    }

    // ── 10. Sort ALL events globally by (employee_id, event_time) ─────────────
    //
    // Events from ALL devices are sorted together in one pass.
    // This ensures the DB trigger sees the correct chronological sequence
    // per employee regardless of which physical device recorded each punch.
    newEventsToInsert.sort((a, b) => {
      if (a.employee_id !== b.employee_id) {
        return a.employee_id.localeCompare(b.employee_id);
      }
      return new Date(a.event_time).getTime() - new Date(b.event_time).getTime();
    });

    // ── 11. Insert ONE AT A TIME (sequential, not bulk) ───────────────────────
    //
    // PostgreSQL fires AFTER FOR EACH ROW triggers only after the entire INSERT
    // statement completes. A bulk insert would cause every trigger to see an
    // empty attendance_timestamp → every event saved as IN (clockin).
    //
    // One-at-a-time inserts = each trigger fully completes before the next
    // event is inserted → correct alternating IN / OUT per employee.
    let added_to_db  = 0;
    let sync_errors  = 0;

    for (const evt of newEventsToInsert) {
      const { error } = await supabase.from("hik_attendance_events").insert(evt);
      if (error) {
        sync_errors++;
        console.error("Insert error for event:", evt.event_time, evt.employee_id, error.message);
      } else {
        added_to_db++;
      }
    }

    // ── 12. Post-insert recalculation ─────────────────────────────────────────
    //
    // WHY THIS IS NEEDED:
    // Even with sequential inserts + global sort, if a user fetches devices
    // SEPARATELY (e.g. Device 1 on Monday, Device 2 on Tuesday for the same
    // date), the new Device 2 events arrive AFTER Device 1's attendance records
    // are already committed. The trigger sees the wrong "last punch" and saves
    // incorrect IN/OUT values.
    //
    // Example:
    //   Sync 1 (Device 1): 8AM → IN, 5PM → OUT  (stored correctly)
    //   Sync 2 (Device 2): 12PM arrives → trigger sees last=5PM(OUT) → 12PM=IN ❌
    //
    // FIX: After all inserts complete, re-rank every attendance_timestamp record
    // for the affected employees on the affected IST dates by timestamp and
    // reassign IN/OUT (odd rank = IN, even = OUT).
    // This self-corrects any ordering disruption from separate fetches.
    let recalculated = 0;
    
    // Auto-repair runs if we added new records OR if this is a manual sync 
    // (so users can fix corrupted old data just by re-fetching the dates).
    if (added_to_db > 0 || isManualSync) {
      // Collect unique employee codes that were in the fetch payload
      // If manual sync, repair ALL employees found in the date range on the device.
      // If cron, only repair employees that had new inserts to save DB load.
      const codesToRepair = isManualSync 
        ? [...new Set(verifiedEvents.map((e: any) => e.matched_employee_code))]
        : [...new Set(newEventsToInsert.map((e: any) => e.employee_id))];

      if (codesToRepair.length > 0) {
        // Look up their employee UUIDs (attendance_timestamp uses UUID, not code)
        const { data: empRows } = await supabase
          .from("employees")
          .select("id")
          .eq("tenant_id", tenantId)
          .in("employee_code", codesToRepair);

        if (empRows && empRows.length > 0) {
          const employeeUuids = empRows.map((e: any) => e.id);

          // Re-rank and correct IN/OUT for these employees across the full date range
          const { data: fixCount } = await supabase.rpc("fix_attendance_entry_order", {
            p_employee_ids: employeeUuids,
            p_start_date:   isManualSync ? new Date(startDate).toISOString() : startTimeStr,
            p_end_date:     isManualSync ? new Date(endDate).toISOString()   : endTimeStr,
            p_tenant_id:    tenantId,
          });

          recalculated = fixCount ?? 0;
          if (recalculated > 0) {
            console.log(`Post-insert recalculation: corrected ${recalculated} IN/OUT record(s).`);
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        fetched_from_device: totalFetchedFromDevices,
        matched_tenant_employees: verifiedEvents.length,
        added_to_db,
        skipped_duplicates,
        sync_errors,
        recalculated_entries: recalculated,
        device_errors: deviceErrors
      }),
      { headers: { ...headers, "Content-Type": "application/json" } }
    );


  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 200, headers: { ...headers, "Content-Type": "application/json" } }
    );
  }
});