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

// HELPER: Exact Match Normalizer (Removes spaces, dashes, lowers case)
// "EMP 0089" -> "emp0089"
// "0089"     -> "0089"
const normalizeExact = (code: string | null | undefined): string => {
  if (!code) return "";
  return String(code).replace(/[\s\-_]+/g, "").trim().toLowerCase();
};

async function fetchWithDigest(url: string, method: string, username: string, password: string, bodyObj: unknown): Promise<Response> {
  const body = bodyObj ? JSON.stringify(bodyObj) : undefined;
  const initialRes = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body });

  if (initialRes.status !== 401) return initialRes;

  const authHeader = initialRes.headers.get("www-authenticate");
  if (!authHeader) throw new Error("Device returned 401 but no WWW-Authenticate header.");

  const realm = authHeader.match(/realm="(.*?)"/)?.[1] || "";
  const nonce = authHeader.match(/nonce="(.*?)"/)?.[1] || "";
  const qop = authHeader.match(/qop="(.*?)"/)?.[1] || "auth";
  const opaqueMatch = authHeader.match(/opaque="(.*?)"/);
  const opaqueStr = opaqueMatch ? `, opaque="${opaqueMatch[1]}"` : "";

  const nc = "00000001";
  const cnonce = Math.random().toString(36).substring(2, 10);
  const uri = new URL(url).pathname + new URL(url).search;

  const ha1 = await md5(`${username}:${realm}:${password}`);
  const ha2 = await md5(`${method}:${uri}`);
  const responseHash = await md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`);

  const digestAuthHeader = `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", qop=${qop}, nc=${nc}, cnonce="${cnonce}", response="${responseHash}"${opaqueStr}`;

  return await fetch(url, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), Authorization: digestAuthHeader },
    body,
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

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

    const { tenantId, settingsId } = await req.json();
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

    if (!settingsId) throw new Error("settingsId is required");

    const { data: settings, error: settingsErr } = await supabase
      .from("hik_device_settings")
      .select("id, device_ip, admin_user, admin_password, is_enabled")
      .eq("id", settingsId)
      .eq("tenant_id", tenantId)
      .single();

    if (settingsErr || !settings) throw new Error("Device settings not found");
    if (!settings.is_enabled) throw new Error("Device is disabled");

    const { data: dbEmployees, error: dbErr } = await supabase
      .from("employees")
      .select("id, employee_code, name")
      .eq("tenant_id", tenantId);

    if (dbErr || !dbEmployees) throw new Error("Failed to fetch employees from DB");

    // Build Map for Exact String extraction only
    const dbEmpExactMap = new Map<string, any>();

    for (const emp of dbEmployees) {
      if (emp.employee_code) {
        const exact = normalizeExact(emp.employee_code);
        if (exact) dbEmpExactMap.set(exact, { id: emp.id, code: emp.employee_code });
      }
    }

    const deviceUrl = `http://${settings.device_ip}/ISAPI/AccessControl/UserInfo/Search?format=json`;
    let allDeviceUsers: any[] = [];
    let position = 0;
    let hasMore = true;
    let loopGuard = 0;
    
    const searchSessionId = "sync_" + Date.now();

    while (hasMore) {
      loopGuard++;
      if (loopGuard > 50) break;

      const payload = {
        UserInfoSearchCond: {
          searchID: searchSessionId,
          searchResultPosition: position,
          maxResults: 1000
        }
      };

      const res = await fetchWithDigest(deviceUrl, "POST", settings.admin_user, settings.admin_password, payload);
      if (!res.ok) throw new Error(`Device responded with ${res.status}`);

      const rawText = await res.text();
      let parsed: any = {};
      try { parsed = JSON.parse(rawText); } catch (_) { }

      const userInfoList = parsed?.UserInfoSearch?.UserInfo || [];
      allDeviceUsers = allDeviceUsers.concat(userInfoList);

      if (parsed?.UserInfoSearch?.responseStatusStrg === "MORE" && userInfoList.length > 0) {
        position += userInfoList.length;
      } else {
        hasMore = false;
      }
    }

    let syncCount = 0;
    const now = new Date().toISOString();
    const rowsToUpsert: any[] = [];

    // Matching Algorithm (Strict exact normalized match only)
    for (const devUser of allDeviceUsers) {
      const rawDevEmpNo = String(devUser.employeeNo || "");
      if (!rawDevEmpNo) continue;

      const exact = normalizeExact(rawDevEmpNo);
      const match = dbEmpExactMap.get(exact);

      if (match) {
        const enrolledFaceCount = Number(devUser.numOfFace || 0);

        rowsToUpsert.push({
          tenant_id:          tenantId,
          employee_id:        match.id,
          employee_code:      match.code,
          device_employee_no: rawDevEmpNo, 
          upload_status:      "uploaded",
          settings_id:        settingsId,
          has_face:           enrolledFaceCount > 0,
          uploaded_at:        now,
          updated_at:         now,
        });
        syncCount++;
      }
    }

    if (rowsToUpsert.length > 0) {
      const { error: upsertErr } = await supabase
        .from("hik_device_employees")
        .upsert(rowsToUpsert, { onConflict: "tenant_id,employee_id,settings_id" });
      if (upsertErr) throw new Error(`Failed to save synced employees: ${upsertErr.message}`);
    }

    // Cleanup: Remove users from DB if they were deleted physically on the device
    const deviceEmpNosStr = new Set<string>();

    for (const u of allDeviceUsers) {
      const raw = String(u.employeeNo || "");
      const exact = normalizeExact(raw);
      if (exact) deviceEmpNosStr.add(exact);
    }

    const { data: dbRecords } = await supabase
      .from("hik_device_employees")
      .select("id, device_employee_no")
      .eq("tenant_id", tenantId)
      .eq("settings_id", settingsId)
      .not("device_employee_no", "is", null);

    const orphanedIds = (dbRecords || [])
      .filter(rec => {
        const rawRecNo = String(rec.device_employee_no || "");
        if (!rawRecNo) return false;

        const exact = normalizeExact(rawRecNo);
        if (exact && deviceEmpNosStr.has(exact)) return false;
        return true; 
      })
      .map(rec => rec.id);

    let deletedCount = 0;
    if (orphanedIds.length > 0) {
      await supabase.from("hik_device_employees").delete().in("id", orphanedIds);
      deletedCount = orphanedIds.length;
    }

    return new Response(
      JSON.stringify({ success: true, message: `Synced ${syncCount} employees. Removed ${deletedCount} deleted.`, synced_count: syncCount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});