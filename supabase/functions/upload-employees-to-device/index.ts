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

// Normalize employee code: removes spaces
const normalizeEmployeeNo = (code: string): string =>
  code.replace(/\s+/g, "").trim();

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
  const statusCode    = typeof parsed?.statusCode    === "number" ? (parsed.statusCode as number) : (httpOk ? 1 : -1);
  const subStatusCode = ((parsed?.subStatusCode as string) ?? "").toLowerCase();
  const statusString  = (parsed?.statusString as string) ?? `HTTP ${httpOk ? "200" : "error"}`;
  return { statusCode, subStatusCode, statusString };
}

// ── Build UserInfo Payload ────────────────────────────────────────────────────
function buildUserInfo(employeeNo: string, name: string) {
  let processedName = name.toUpperCase();
  
  // 1. Remove spaces immediately preceding or following a dot
  processedName = processedName.replace(/(?<=\.)\s+|\s+(?=\.)/g, "");
  
  // 2. Replace any remaining spaces with an underscore
  processedName = processedName.replace(/\s+/g, "_");

  return {
    UserInfo: {
      employeeNo,
      name: processedName, 
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
}

// ── Main Handler ─────────────────────────────────────────────────────────────
serve(async (req) => {
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

    const { tenantId, employeeIds, settingsId } = await req.json();

    if (!tenantId) throw new Error("tenantId is required");

    // Verify user belongs to this tenant
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", user.id)
      .single();

    if (profileError || !profile || profile.tenant_id !== tenantId) {
      return new Response(JSON.stringify({ success: false, error: "Forbidden: You do not have access to this tenant" }), { status: 403, headers: corsHeaders });
    }

    if (!settingsId) throw new Error("settingsId is required — select a device first");
    if (!Array.isArray(employeeIds) || employeeIds.length === 0)
      throw new Error("employeeIds array is required and must not be empty");

    // 1. Device settings
    const { data: settings, error: settingsErr } = await supabase
      .from("hik_device_settings")
      .select("id, device_ip, admin_user, admin_password, is_enabled")
      .eq("id", settingsId)
      .eq("tenant_id", tenantId)
      .single();

    if (settingsErr || !settings) throw new Error("Device settings not found");
    if (!settings.is_enabled) throw new Error("Device is disabled");

    // 2. Fetch selected employees
    const { data: employees, error: empErr } = await supabase
      .from("employees")
      .select("id, name, employee_code")
      .in("id", employeeIds)
      .eq("tenant_id", tenantId);

    if (empErr || !employees) throw new Error("Failed to fetch employees");

    // 3. Fetch existing device records
    const { data: existingRecords } = await supabase
      .from("hik_device_employees")
      .select("employee_id, upload_status, device_employee_no")
      .eq("tenant_id", tenantId)
      .eq("settings_id", settingsId)
      .in("employee_id", employeeIds);

    const existingMap = new Map<string, { upload_status: string; device_employee_no: string }>();
    (existingRecords || []).forEach((r) => existingMap.set(r.employee_id, r));

    const baseUrl    = `http://${settings.device_ip}`;
    const recordUrl  = `${baseUrl}/ISAPI/AccessControl/UserInfo/Record?format=json`;
    const modifyUrl  = `${baseUrl}/ISAPI/AccessControl/UserInfo/Modify?format=json`;
    const adminUser = settings.admin_user;
    const pass      = settings.admin_password;

    const results = [];

    for (const emp of employees) {
      const normalizedCode = normalizeEmployeeNo(emp.employee_code || emp.id);
      const existing       = existingMap.get(emp.id);
      const isAlreadyOnDevice = existing?.upload_status === "uploaded";

      let uploadStatus  = "failed";
      let resultMessage = "";

      try {
        const payload = buildUserInfo(normalizedCode, emp.name);

        if (isAlreadyOnDevice) {
          const res = await fetchWithDigest(modifyUrl, "PUT", adminUser, pass, payload);
          const { statusCode, subStatusCode, statusString } = parseIsapi(await res.text(), res.ok);

          if (statusCode === 1 || subStatusCode === "ok" || statusString === "OK" || statusString === "ok") {
            uploadStatus  = "uploaded";
            resultMessage = "Updated";
          } else {
            uploadStatus  = "failed";
            resultMessage = `Modify failed: ${statusString}`;
          }
        } else {
          const res = await fetchWithDigest(recordUrl, "POST", adminUser, pass, payload);
          const rawText = await res.text();
          const { statusCode, subStatusCode, statusString } = parseIsapi(rawText, res.ok);

          if (statusCode === 1 || subStatusCode === "ok" || statusString === "OK" || statusString === "ok") {
            uploadStatus  = "uploaded";
            resultMessage = "Success";
          } else if (
            subStatusCode.includes("repeat") ||
            subStatusCode.includes("recordexist") ||
            subStatusCode.includes("dataexist")
          ) {
            uploadStatus  = "uploaded";
            resultMessage = "Already on device";
          } else {
            // Fallback to Modify
            const modifyRes = await fetchWithDigest(modifyUrl, "PUT", adminUser, pass, payload);
            const mod = parseIsapi(await modifyRes.text(), modifyRes.ok);
            if (mod.statusCode === 1 || mod.subStatusCode === "ok" || mod.statusString === "OK" || mod.statusString === "ok") {
              uploadStatus  = "uploaded";
              resultMessage = "Already on device (synced via Modify)";
            } else {
              uploadStatus  = "failed";
              resultMessage = statusString;
            }
          }
        }
      } catch (devErr: any) {
        resultMessage = devErr.message;
      }

      const now = new Date().toISOString();
      await supabase.from("hik_device_employees").upsert(
        {
          tenant_id:          tenantId,
          employee_id:        emp.id,
          employee_code:      emp.employee_code,
          device_employee_no: normalizedCode,
          upload_status:      uploadStatus,
          settings_id:        settingsId,
          uploaded_at:        uploadStatus === "uploaded" ? (existing?.upload_status === "uploaded" ? undefined : now) : null,
          updated_at:         now,
        },
        { onConflict: "tenant_id,employee_id,settings_id" }
      );

      results.push({
        employee_id:     emp.id,
        employee_code:   emp.employee_code,
        normalized_code: normalizedCode,
        status:          uploadStatus,
        message:         resultMessage,
      });
    }

    return new Response(
      JSON.stringify({ success: true, total: results.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});