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

// ── Digest Auth Helper ──────────────────────────────────────────────────────
async function fetchWithDigest(
  url: string,
  method: string,
  username: string,
  password: string,
  bodyObj: unknown
): Promise<Response> {
  const initialRes = await fetch(url, {
    method,
    headers: { 
      "Content-Type": typeof bodyObj === "string" && bodyObj.trim().startsWith("<") ? "application/xml" : "application/json" 
    },
    body: typeof bodyObj === "string" ? bodyObj : JSON.stringify(bodyObj),
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
    headers: { 
      "Content-Type": typeof bodyObj === "string" && bodyObj.trim().startsWith("<") ? "application/xml" : "application/json", 
      Authorization: digestAuthHeader 
    },
    body: typeof bodyObj === "string" ? bodyObj : JSON.stringify(bodyObj),
  });
}

// ── Parse ISAPI Response ─────────────────────────────────────────────────────
function parseIsapiResponse(rawText: string, httpOk: boolean) {
  let parsed: Record<string, unknown> = {};
  if (rawText.trim().startsWith("<")) {
    // Basic XML extraction
    const statusCodeMatch = rawText.match(/<statusCode>(\d+)<\/statusCode>/);
    const subStatusCodeMatch = rawText.match(/<subStatusCode>(.*?)<\/subStatusCode>/);
    const statusStringMatch = rawText.match(/<statusString>(.*?)<\/statusString>/);
    parsed = {
      statusCode: statusCodeMatch ? parseInt(statusCodeMatch[1], 10) : (httpOk ? 0 : -1),
      subStatusCode: subStatusCodeMatch ? subStatusCodeMatch[1] : "",
      statusString: statusStringMatch ? statusStringMatch[1] : ""
    };
  } else {
    try { parsed = JSON.parse(rawText); } catch (_) { /* device may return empty OK body */ }
  }

  const statusCode    = typeof parsed?.statusCode    === "number" ? (parsed.statusCode as number) : (httpOk ? 0 : -1);
  const subStatusCode = ((parsed?.subStatusCode as string) ?? "").toLowerCase();
  const statusString  = (parsed?.statusString as string) ?? `HTTP ${httpOk ? "200" : "error"}`;

  return { statusCode, subStatusCode, statusString };
}

// ── Main Handler ─────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase    = createClient(supabaseUrl, supabaseKey);

  try {
    // 1. Shared Secret Token Verification
    const hikToken = req.headers.get("x-hikvision-token");
    const serverToken = Deno.env.get("HIKVISION_API_TOKEN");
    if (!hikToken || hikToken !== serverToken) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized: Invalid security token" }), { status: 401, headers: corsHeaders });
    }

    // 2. JWT & Tenant Verification
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized: Missing Authorization header" }), { status: 401, headers: corsHeaders });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized: Invalid JWT" }), { status: 401, headers: corsHeaders });
    }

    const { tenantId, employeeId, settingsId } = await req.json();

    if (!tenantId)   throw new Error("tenantId is required");

    // Verify user belongs to this tenant
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", user.id)
      .single();

    if (profileError || !profile || profile.tenant_id !== tenantId) {
      return new Response(JSON.stringify({ success: false, error: "Forbidden: You do not have access to this tenant" }), { status: 403, headers: corsHeaders });
    }

    if (!employeeId) throw new Error("employeeId is required");
    if (!settingsId) throw new Error("settingsId is required — select a device first");

    // 1. Fetch device settings by specific settingsId
    const { data: settings, error: settingsErr } = await supabase
      .from("hik_device_settings")
      .select("device_ip, admin_user, admin_password, is_enabled")
      .eq("id", settingsId)
      .eq("tenant_id", tenantId)
      .single();

    if (settingsErr || !settings) throw new Error("Device settings not found");
    if (!settings.is_enabled)     throw new Error("Device connection is disabled");

    // 2. Fetch the stored device employee number for THIS device
    const { data: record, error: recErr } = await supabase
      .from("hik_device_employees")
      .select("device_employee_no")
      .eq("tenant_id", tenantId)
      .eq("employee_id", employeeId)
      .eq("settings_id", settingsId)
      .single();

    if (recErr || !record?.device_employee_no) {
      throw new Error("No device record found for this employee on this device. They may not have been uploaded.");
    }

    const empNo    = record.device_employee_no;
    const baseUrl  = `http://${settings.device_ip}`;
    const adminUser = settings.admin_user;
    const pass      = settings.admin_password;

    console.log(`[delete-device-employee] Starting deletion for empNo=${empNo} on ${settings.device_ip}`);

    // ── Step A: Delete face data from Face Library ───────────────────────────
    const faceDeleteUrl = `${baseUrl}/ISAPI/Intelligent/FDLib/FDSearch/Delete?format=json&FDID=1&faceLibType=blackFD`;
    const facePayload   = { FPID: [{ value: empNo }] };

    try {
      const faceRes     = await fetchWithDigest(faceDeleteUrl, "PUT", adminUser, pass, facePayload);
      const faceRawText = await faceRes.text();
      const { statusCode, subStatusCode } = parseIsapiResponse(faceRawText, faceRes.ok);
      console.log(`[delete-device-employee] Face delete response: HTTP ${faceRes.status}, statusCode=${statusCode}, sub=${subStatusCode}`);
    } catch (faceErr) {
      console.warn(`[delete-device-employee] Face delete warning (non-fatal): ${faceErr}`);
    }

    // ── Step B: Delete UserInfo ──────────────────────────────────────────────
    const userDeleteUrl = `${baseUrl}/ISAPI/AccessControl/UserInfo/Delete?format=json`;
    
    const userPayload   = {
      UserInfoDelCond: {
        EmployeeNoList: [
          { employeeNo: String(empNo) }
        ]
      }
    };

    const userRes     = await fetchWithDigest(userDeleteUrl, "PUT", adminUser, pass, userPayload);
    const userRawText = await userRes.text();
    const { statusCode, subStatusCode, statusString } = parseIsapiResponse(userRawText, userRes.ok);
    console.log(`[delete-device-employee] UserInfo delete response: HTTP ${userRes.status}, statusCode=${statusCode}, sub=${subStatusCode}, body=${userRawText}`);

    const isSuccess = statusCode === 0 || subStatusCode === "ok" || subStatusCode === "usernotexist";
    if (!isSuccess) {
      throw new Error(`Device rejected user deletion: ${statusString} (sub: ${subStatusCode})`);
    }

    console.log(`[delete-device-employee] Successfully deleted ${empNo} from device.`);

    // ── Step C: Delete database record AFTER confirmed device deletion ──────────────
    const { error: dbErr } = await supabase
      .from("hik_device_employees")
      .delete()
      .eq("tenant_id",   tenantId)
      .eq("employee_id", employeeId)
      .eq("settings_id", settingsId);

    if (dbErr) {
      console.error(`[delete-device-employee] DB deletion failed: ${dbErr.message}`);
      throw new Error(`Device deletion succeeded, but database cleanup failed: ${dbErr.message}`);
    }

    return new Response(
      JSON.stringify({ success: true, message: `Employee ${empNo} removed from device and database.` }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[delete-device-employee] FATAL ERROR:", message);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});