import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

// Native MD5 using Deno std crypto (replaces unreliable esm.sh/md5 CJS package)
async function md5(data: string): Promise<string> {
  const buffer = await crypto.subtle.digest("MD5", new TextEncoder().encode(data));
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hikvision-token",
};

// ── Digest Auth ───────────────────────────────────────────────────────────────
async function fetchWithDigest(
  url: string,
  method: string,
  username: string,
  password: string,
  bodyObj: unknown
): Promise<Response> {
  const body = JSON.stringify(bodyObj);
  const initialRes = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body,
  });

  if (initialRes.status !== 401) return initialRes;

  const authHeader = initialRes.headers.get("www-authenticate");
  if (!authHeader) throw new Error("Device returned 401 but no WWW-Authenticate header.");

  const realm = authHeader.match(/realm="(.*?)"/)?.[1] || "";
  const nonce = authHeader.match(/nonce="(.*?)"/)?.[1] || "";
  const qop   = authHeader.match(/qop="(.*?)"/)?.[1]   || "auth";
  const opaqueMatch = authHeader.match(/opaque="(.*?)"/);
  const opaqueStr = opaqueMatch ? `, opaque="${opaqueMatch[1]}"` : "";

  const nc     = "00000001";
  const cnonce = Math.random().toString(36).substring(2, 10);
  const uri    = new URL(url).pathname + new URL(url).search;

  const ha1          = await md5(`${username}:${realm}:${password}`);
  const ha2          = await md5(`${method}:${uri}`);
  const responseHash = await md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`);

  const digestAuthHeader = `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", qop=${qop}, nc=${nc}, cnonce="${cnonce}", response="${responseHash}"${opaqueStr}`;

  return await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", Authorization: digestAuthHeader },
    body,
  });
}

// ── Parse ISAPI Response ─────────────────────────────────────────────────────
function parseIsapi(rawText: string, httpOk: boolean) {
  let parsed: Record<string, unknown> = {};
  try { parsed = JSON.parse(rawText); } catch (_) { /* ignore */ }
  const statusCode    = typeof parsed?.statusCode    === "number" ? (parsed.statusCode as number) : (httpOk ? 0 : -1);
  const subStatusCode = ((parsed?.subStatusCode as string) ?? "").toLowerCase();
  return { statusCode, subStatusCode };
}

// ── Main Handler ─────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase    = createClient(supabaseUrl, supabaseKey);

  try {
    // 1. Shared Secret Token Verification
    // This function can be triggered by DB Webhooks OR manual UI hits.
    // In both cases, we require the x-hikvision-token header.
    const hikToken = req.headers.get("x-hikvision-token");
    const serverToken = Deno.env.get("HIKVISION_API_TOKEN");
    
    if (!hikToken || hikToken !== serverToken) {
       console.error("Unauthorized attempt to access auto-sync-employee-name");
       return new Response(JSON.stringify({ success: false, error: "Unauthorized: Invalid security token" }), { status: 401, headers: corsHeaders });
    }

    const body = await req.json();

    let employeeId: string;
    let newName: string;
    let tenantId: string;

    if (body.type === "UPDATE" && body.record) {
      const record     = body.record;
      const oldRecord  = body.old_record || {};
      if (record.name === oldRecord.name) {
        return new Response(JSON.stringify({ skipped: true, reason: "name unchanged" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      employeeId = record.id;
      newName    = record.name;
      tenantId   = record.tenant_id;
    } else {
      employeeId = body.employeeId;
      newName    = body.newName;
      tenantId   = body.tenantId;
    }

    if (!employeeId || !newName || !tenantId) {
      throw new Error("Missing required fields: employeeId, newName, tenantId");
    }

    // 1. Find all devices where this employee is uploaded
    const { data: deviceRows, error: devErr } = await supabase
      .from("hik_device_employees")
      .select("settings_id, device_employee_no")
      .eq("tenant_id", tenantId)
      .eq("employee_id", employeeId)
      .eq("upload_status", "uploaded");

    if (devErr) throw new Error("Failed to fetch device employee records: " + devErr.message);
    if (!deviceRows || deviceRows.length === 0) {
      return new Response(JSON.stringify({ skipped: true, reason: "not on any device" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results = [];

    for (const row of deviceRows) {
      if (!row.settings_id || !row.device_employee_no) continue;

      const { data: settings, error: settingsErr } = await supabase
        .from("hik_device_settings")
        .select("device_ip, admin_user, admin_password, is_enabled")
        .eq("id", row.settings_id)
        .single();

      if (settingsErr || !settings || !settings.is_enabled) {
        results.push({ settings_id: row.settings_id, success: false, error: "Device disabled or not found" });
        continue;
      }

      const modifyUrl = `http://${settings.device_ip}/ISAPI/AccessControl/UserInfo/Modify?format=json`;
      
      // BUILD PAYLOAD WITH UNDERSCORES
      const payload = {
        UserInfo: {
          employeeNo: row.device_employee_no,
          name: newName.toUpperCase().replace(/\s+/g, "_"), // Space to Underscore Fix
          userType: "normal",
          Valid: {
            enable: true,
            beginTime: "2000-01-01T00:00:00",
            endTime: "2035-01-01T00:00:00",
            timeType: "local",
          },
          doorRight: "1",
          RightPlan: [{ doorNo: 1, planTemplateNo: "1" }],
        },
      };

      try {
        const res = await fetchWithDigest(modifyUrl, "PUT", settings.admin_user, settings.admin_password, payload);
        const { statusCode, subStatusCode } = parseIsapi(await res.text(), res.ok);
        const success = statusCode === 0 || subStatusCode === "ok";
        results.push({ settings_id: row.settings_id, success });
      } catch (err: unknown) {
        results.push({ settings_id: row.settings_id, success: false, error: err instanceof Error ? err.message : "Error" });
      }
    }

    return new Response(
      JSON.stringify({ success: true, employee_id: employeeId, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});