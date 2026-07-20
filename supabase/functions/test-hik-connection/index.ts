import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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
async function fetchWithDigest(url: string, method: string, username: string, password: string, signal: AbortSignal): Promise<Response> {
  const initialRes = await fetch(url, { method, signal });
  if (initialRes.status !== 401) return initialRes;

  const authHeader = initialRes.headers.get("www-authenticate");
  if (!authHeader) throw new Error("No WWW-Authenticate header found.");

  const realm = authHeader.match(/realm="(.*?)"/)?.[1] || "";
  const nonce = authHeader.match(/nonce="(.*?)"/)?.[1] || "";
  const qop = authHeader.match(/qop="(.*?)"/)?.[1] || "auth";
  
  const nc = "00000001";
  const cnonce = Math.random().toString(36).substring(2, 10);
  const uri = new URL(url).pathname + new URL(url).search;

  const ha1 = await md5(`${username}:${realm}:${password}`);
  const ha2 = await md5(`${method}:${uri}`);
  const responseHash = await md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`);

  const digestAuthHeader = `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", qop=${qop}, nc=${nc}, cnonce="${cnonce}", response="${responseHash}"`;

  return await fetch(url, {
    method,
    headers: { Authorization: digestAuthHeader },
    signal
  });
}

// ── Main Handler ─────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // 1. Shared Secret Token Verification
    const hikToken = req.headers.get("x-hikvision-token");
    const serverToken = Deno.env.get("HIKVISION_API_TOKEN");
    
    if (!hikToken || hikToken !== serverToken) {
       return new Response(JSON.stringify({ success: false, status: 'unauthorized', message: 'Unauthorized: Invalid security token' }), { status: 401, headers: corsHeaders });
    }

    const { device_ip, admin_user, admin_password } = await req.json();

    if (!device_ip || !admin_user || !admin_password) {
      return new Response(JSON.stringify({ success: false, status: 'offline', message: 'Missing credentials' }), { headers: { ...corsHeaders, "Content-Type": "application/json" }});
    }

    // According to ISAPI docs, this endpoint verifies connectivity and working status
    const url = `http://${device_ip}/ISAPI/AccessControl/AcsWorkStatus?format=json`;
    
    // Set a 15-second timeout to accommodate high-latency connections
    // ISAPI requires 2 round-trips for Digest Auth, which can be slow over international WAN
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetchWithDigest(url, "GET", admin_user, admin_password, controller.signal);
      clearTimeout(timeoutId);

      if (res.ok) {
        return new Response(JSON.stringify({ success: true, status: 'online', message: 'Connection successful. Credentials are valid.' }), { headers: { ...corsHeaders, "Content-Type": "application/json" }});
      } else if (res.status === 401) {
        return new Response(JSON.stringify({ success: false, status: 'unauthorized', message: 'Invalid Username or Password.' }), { headers: { ...corsHeaders, "Content-Type": "application/json" }});
      } else {
        return new Response(JSON.stringify({ success: false, status: 'error', message: `Device returned HTTP ${res.status}` }), { headers: { ...corsHeaders, "Content-Type": "application/json" }});
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      
      const rawMsg = err.message || "";
      let userFriendlyMsg = "Unknown network error.";
      
      if (err.name === 'AbortError') {
        userFriendlyMsg = "Connection timed out. The device took longer than 15 seconds to respond.";
      } else if (rawMsg.includes("Connection refused") || rawMsg.includes("os error 111")) {
        userFriendlyMsg = "Connection refused. The IP address is reachable, but port is closed (check your port number).";
      } else if (rawMsg.includes("No route to host") || rawMsg.includes("os error 113")) {
        userFriendlyMsg = "No route to host. The router/firewall is blocking the connection or the IP is offline.";
      } else if (rawMsg.includes("deadline has elapsed")) {
         userFriendlyMsg = "Network timeout. The connection dropped before completing.";
      } else {
         // Keep the original if we don't recognize it, but trim the overwhelming rust stack trace
         userFriendlyMsg = rawMsg.split(":")[0]?.trim() || rawMsg;
      }

      return new Response(JSON.stringify({ 
        success: false, 
        status: 'offline', 
        message: `Connection failed: ${userFriendlyMsg}`,
        raw_error: rawMsg
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" }});
    }

  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, status: 'error', message: err.message }), { headers: { ...corsHeaders, "Content-Type": "application/json" }});
  }
});