import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

// Native MD5 using Deno std crypto (replaces unreliable esm.sh/md5 CJS package)
async function md5(data: string): Promise<string> {
  const buffer = await crypto.subtle.digest("MD5", new TextEncoder().encode(data));
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// Helper for Digest Auth
async function fetchWithDigest(url: string, method: string, username: string, password: string, bodyObj: any, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const body = JSON.stringify(bodyObj);
    const initialRes = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body, signal: controller.signal });
    if (initialRes.status !== 401) return initialRes;

    const authHeader = initialRes.headers.get("www-authenticate");
    if (!authHeader) throw new Error("No WWW-Authenticate header found.");

    const realm = authHeader.match(/realm="(.*?)"/)?.[1] || "";
    const nonce = authHeader.match(/nonce="(.*?)"/)?.[1] || "";
    const qop = authHeader.match(/qop="(.*?)"/)?.[1] || "auth";
    const opaqueStr = authHeader.match(/opaque="(.*?)"/)?.[0] ? `, ${authHeader.match(/opaque="(.*?)"/)?.[0]}` : "";

    const nc = "00000001"; 
    const cnonce = Math.random().toString(36).substring(2, 10); 
    const uri = new URL(url).pathname + new URL(url).search;

    const ha1 = await md5(`${username}:${realm}:${password}`);
    const ha2 = await md5(`${method}:${uri}`);
    const responseHash = await md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`);

    const digestAuthHeader = `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", qop=${qop}, nc=${nc}, cnonce="${cnonce}", response="${responseHash}"${opaqueStr}`;

    return await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", "Authorization": digestAuthHeader },
      body,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

const normalizeCode = (code: string | null | undefined) => 
  code ? String(code).replace(/[\s_]/g, '').toUpperCase() : "";

serve(async (req) => {
  const headers = { 
    "Access-Control-Allow-Origin": "*", 
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hikvision-token",
    "Content-Type": "application/json" 
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  
  const startTime = Date.now();
  const RUN_DURATION = 50000; // Run for 50 seconds total
  const INTERVAL = 10000;     // Pulse every 10 seconds
  let iterations = 0;

  try {
    // 1. Robust Security Verification
    const body = await req.json().catch(() => ({}));
    const serverTokenRaw = Deno.env.get("HIKVISION_API_TOKEN");
    
    // Clean the server token (remove accidental quotes or spaces)
    const serverToken = serverTokenRaw?.trim().replace(/^["']|["']$/g, "");
    
    let hikToken = req.headers.get("x-hikvision-token");
    
    if (!hikToken) {
      const auth = req.headers.get("Authorization");
      if (auth?.startsWith("Bearer ")) {
        hikToken = auth.replace("Bearer ", "").trim();
      }
    }
    
    if (!hikToken && body.hik_token) {
      hikToken = body.hik_token;
    }

    // Comprehensive trimming and cleaning for the received token
    if (hikToken) {
      hikToken = String(hikToken).trim().replace(/^["']|["']$/g, "");
    }

    // Diagnostic Endpoint
    if (req.url.endsWith("/health")) {
      return new Response(JSON.stringify({ 
        token_set: !!serverToken,
        token_len_match: serverToken?.length === hikToken?.length,
        received_token: !!hikToken,
        token_match: serverToken === hikToken,
        status: serverToken === hikToken ? "READY" : "AUTH_ERROR"
      }), { headers });
    }
    
    if (!hikToken || hikToken !== serverToken) {
       console.error(`[cron-sync-all] Auth failed. ServerToken: ${serverToken ? 'SET' : 'NOT SET'}, Received: ${hikToken ? 'YES' : 'NO'}`);
       if (hikToken && serverToken && hikToken !== serverToken) {
         console.error(`[cron-sync-all] Token Mismatch. Lengths: Sent=${hikToken.length}, Server=${serverToken.length}`);
       }
       return new Response(JSON.stringify({ success: false, error: "Unauthorized: Invalid security token" }), { status: 401, headers });
    }

    // 1. Fetch enabled devices ONCE at the start of the function
    const { data: devices, error: devErr } = await supabase
      .from("hik_device_settings")
      .select("*")
      .eq("is_enabled", true)
      .eq("enable_auto_sync", true);

    if (devErr || !devices || devices.length === 0) {
        return new Response(JSON.stringify({ success: true, message: "No active devices to sync." }), { headers });
    }

    // 2. Start the High-Frequency Loop
    while (Date.now() - startTime < RUN_DURATION) {
      const loopStart = Date.now();
      iterations++;
      console.log(`[PULSE ${iterations}] Syncing ${devices.length} devices...`);

      const syncPromises = devices.map(async (settings) => {
        const tenantId = settings.tenant_id;
        
        try {
          // Fetch Employees
          const { data: empData } = await supabase.from("employees").select("employee_code").eq("tenant_id", tenantId);
          const validEmployeesMap = new Map();
          empData?.forEach(e => { if (e.employee_code) validEmployeesMap.set(normalizeCode(e.employee_code), e.employee_code); });

          // Time Range (Look back 1 hour for high-frequency pulses)
          const startUTC = new Date(Date.now() - (60 * 60 * 1000));
          const endUTC = new Date(Date.now() + (2 * 60 * 60 * 1000));

          const toISTString = (dateObj: Date) => {
              const istDate = new Date(dateObj.getTime() + (5.5 * 60 * 60 * 1000));
              return istDate.toISOString().split('.')[0] + '+05:30';
          };

          const startTimeStr = toISTString(startUTC);
          const endTimeStr = toISTString(endUTC);
          
          let allEvents: any[] = [];
          let currentPosition = 0;
          let hasMore = true;
          const searchID = crypto.randomUUID();

          while (hasMore) {
            const payload = { AcsEventCond: { searchID, searchResultPosition: currentPosition, maxResults: 500, major: 0, minor: 0, startTime: startTimeStr, endTime: endTimeStr } };
            const response = await fetchWithDigest(`http://${settings.device_ip}/ISAPI/AccessControl/AcsEvent?format=json`, "POST", settings.admin_user, settings.admin_password, payload);
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = JSON.parse(await response.text());
            const batch = data?.AcsEvent?.InfoList || [];
            allEvents.push(...batch);

            if (batch.length > 0 && data?.AcsEvent?.totalMatches > (currentPosition + batch.length)) {
              currentPosition += batch.length;
            } else {
              hasMore = false;
            }
          }

          const verifiedEvents = allEvents
            .filter(evt => evt.employeeNoString && validEmployeesMap.has(normalizeCode(evt.employeeNoString)))
            .map(evt => ({ ...evt, matched_employee_code: validEmployeesMap.get(normalizeCode(evt.employeeNoString)) }));

          if (verifiedEvents.length > 0) {
            // Deduplicate against Database using integer Timestamps
            const { data: existing } = await supabase
              .from("hik_attendance_events")
              .select("employee_id, event_time")
              .eq("tenant_id", tenantId)
              .gte("event_time", startUTC.toISOString());

            const existingSet = new Set(existing?.map(r => `${r.employee_id}_${new Date(r.event_time).getTime()}`) || []);
            
            const inserts = [];
            for (const evt of verifiedEvents) {
              const timeKey = `${evt.matched_employee_code}_${new Date(evt.time).getTime()}`;
              if (!existingSet.has(timeKey)) {
                inserts.push({ 
                  tenant_id: tenantId, 
                  employee_id: evt.matched_employee_code, 
                  event_time: evt.time, 
                  device_ip: settings.device_ip, 
                  raw_data: evt 
                });
                existingSet.add(timeKey);
              }
            }

            if (inserts.length > 0) {
              await supabase.from("hik_attendance_events").insert(inserts);
            }
          }
          return { device: settings.device_name, success: true };
        } catch (err: any) {
          return { device: settings.device_name, error: err.message };
        }
      });

      await Promise.all(syncPromises);

      // Sleep logic: Wait for the remainder of the 10-second interval
      const elapsed = Date.now() - loopStart;
      const sleepTime = Math.max(0, INTERVAL - elapsed);
      if (Date.now() - startTime + sleepTime < RUN_DURATION) {
          await new Promise(resolve => setTimeout(resolve, sleepTime));
      } else {
          break; // Stop if the next sleep would exceed RUN_DURATION
      }
    }

    return new Response(JSON.stringify({ success: true, iterations }), { headers });

  } catch (error: any) {
    console.error("[FATAL-ERROR]", error.message);
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers });
  }
});