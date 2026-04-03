import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};

function hashToken(token: string): Promise<string> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)).then((digest) =>
    Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS,
  });
}

function getHeader(req: Request, name: string): string | null {
  return req.headers.get(name) || req.headers.get(name.toLowerCase());
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlEncodeJson(value: unknown): string {
  return base64UrlEncode(new TextEncoder().encode(JSON.stringify(value)));
}

function base64UrlDecode(input: string): Uint8Array {
  const padded = input.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(input.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function hmacSha256(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return base64UrlEncode(new Uint8Array(signature));
}

async function signJwt(secret: string, payload: Record<string, unknown>): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64UrlEncodeJson(header);
  const encodedPayload = base64UrlEncodeJson(payload);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = await hmacSha256(secret, signingInput);
  return `${signingInput}.${signature}`;
}

async function verifyJwt(secret: string, token: string): Promise<Record<string, unknown> | null> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = await hmacSha256(secret, signingInput);

  if (signature !== expectedSignature) {
    return null;
  }

  try {
    return JSON.parse(new TextDecoder().decode(base64UrlDecode(encodedPayload)));
  } catch {
    return null;
  }
}

function getSupabaseClients(req: Request) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    throw new Error("Missing Supabase environment variables");
  }

  const authorization = getHeader(req, "authorization") ?? "";
  const authClient = createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: authorization,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return { authClient, serviceClient };
}

async function getAuthenticatedUser(req: Request) {
  const { authClient } = getSupabaseClients(req);
  const { data, error } = await authClient.auth.getUser();

  if (error) {
    throw error;
  }

  return data.user;
}

function getJwtSecret(): string {
  const secret = Deno.env.get("ADMIN_SESSION_JWT_SECRET");

  if (!secret) {
    throw new Error("Missing ADMIN_SESSION_JWT_SECRET");
  }

  return secret;
}

async function issueSession(req: Request, verificationType: "otp" | "code", code?: string) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return jsonResponse({ success: false, error: "unauthorized" }, 401);
  }

  const { authClient, serviceClient } = getSupabaseClients(req);
  const verifiedAt = new Date();
  const sessionSecret = getJwtSecret();
  let verifiedVia: "otp" | "code" = verificationType;
  let codeName: string | null = null;
  let codeRole: string | null = null;

  const { data: roles, error: roleError } = await serviceClient
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);

  if (roleError) {
    throw roleError;
  }

  const hasAdminAccess = (roles ?? []).some((row) => row.role === "admin" || row.role === "moderator");
  if (!hasAdminAccess) {
    return jsonResponse({ success: false, error: "forbidden" }, 403);
  }

  if (verificationType === "otp") {
    const { data, error } = await authClient.rpc("verify_admin_otp", {
      p_user_id: user.id,
      p_otp: code ?? "",
    });

    if (error) {
      throw error;
    }

    if (!data?.success) {
      return jsonResponse(data ?? { success: false, error: "invalid" }, 400);
    }
  } else {
    const { data, error } = await authClient.rpc("verify_admin_code", {
      p_code: code ?? "",
    });

    if (error) {
      throw error;
    }

    if (!data?.success) {
      return jsonResponse(data ?? { success: false, error: "invalid" }, 400);
    }

    verifiedVia = "code";
    codeName = data.code_name ?? null;
    codeRole = data.role ?? null;

    if (codeRole !== "admin" && codeRole !== "moderator") {
      return jsonResponse({ success: false, error: "invalid_role" }, 400);
    }
  }

  await serviceClient
    .from("admin_sessions")
    .update({ revoked_at: verifiedAt.toISOString() })
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .gt("expires_at", verifiedAt.toISOString());

  const expiresAt = new Date(verifiedAt.getTime() + 30 * 60 * 1000);
  const sessionPayload = {
    sub: user.id,
    verified_via: verifiedVia,
    code_name: codeName,
    code_role: codeRole,
    iat: Math.floor(verifiedAt.getTime() / 1000),
    exp: Math.floor(expiresAt.getTime() / 1000),
    jti: crypto.randomUUID(),
  };
  const sessionToken = await signJwt(sessionSecret, sessionPayload);

  const { error: insertError } = await serviceClient.from("admin_sessions").insert({
    user_id: user.id,
    session_token_hash: await hashToken(sessionToken),
    verified_via: verifiedVia,
    code_name: codeName,
    code_role: codeRole,
    expires_at: expiresAt.toISOString(),
  });

  if (insertError) {
    throw insertError;
  }

  return jsonResponse({
    success: true,
    session_token: sessionToken,
    verified_via: verifiedVia,
    code_name: codeName,
    code_role: codeRole,
    expires_at: expiresAt.toISOString(),
  });
}

async function validateSession(req: Request) {
  const body = await req.json().catch(() => ({}));
  const sessionToken = typeof body.session_token === "string" ? body.session_token.trim() : "";

  if (!sessionToken) {
    return jsonResponse({ valid: false }, 400);
  }

  const secret = getJwtSecret();
  const payload = await verifyJwt(secret, sessionToken);

  if (!payload?.sub || typeof payload.sub !== "string") {
    return jsonResponse({ valid: false });
  }

  if (typeof payload.exp !== "number" || payload.exp * 1000 <= Date.now()) {
    return jsonResponse({ valid: false });
  }

  const { serviceClient } = getSupabaseClients(req);
  const tokenHash = await hashToken(sessionToken);

  const { data: sessionRow, error: sessionError } = await serviceClient
    .from("admin_sessions")
    .select("verified_via, code_name, code_role, expires_at, revoked_at")
    .eq("user_id", payload.sub)
    .eq("session_token_hash", tokenHash)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (sessionError || !sessionRow) {
    return jsonResponse({ valid: false });
  }

  const { data: roles, error: roleError } = await serviceClient
    .from("user_roles")
    .select("role")
    .eq("user_id", payload.sub);

  if (roleError) {
    throw roleError;
  }

  const hasAdminAccess = (roles ?? []).some((row) => row.role === "admin" || row.role === "moderator");
  if (!hasAdminAccess) {
    await serviceClient.from("admin_sessions").update({ revoked_at: new Date().toISOString() }).eq("user_id", payload.sub).eq("session_token_hash", tokenHash);
    return jsonResponse({ valid: false });
  }

  return jsonResponse({
    valid: true,
    verified_via: sessionRow.verified_via,
    code_name: sessionRow.code_name,
    code_role: sessionRow.code_role,
    expires_at: sessionRow.expires_at,
  });
}

async function revokeSession(req: Request) {
  const body = await req.json().catch(() => ({}));
  const sessionToken = typeof body.session_token === "string" ? body.session_token.trim() : "";

  if (!sessionToken) {
    return jsonResponse({ success: false }, 400);
  }

  const secret = getJwtSecret();
  const payload = await verifyJwt(secret, sessionToken);
  if (!payload?.sub || typeof payload.sub !== "string") {
    return jsonResponse({ success: false }, 400);
  }

  const { serviceClient } = getSupabaseClients(req);
  const tokenHash = await hashToken(sessionToken);

  const { error } = await serviceClient
    .from("admin_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", payload.sub)
    .eq("session_token_hash", tokenHash)
    .is("revoked_at", null);

  if (error) {
    throw error;
  }

  return jsonResponse({ success: true });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: JSON_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "";
    const verificationType = body.verification_type === "code" ? "code" : "otp";
    const code = typeof body.code === "string" ? body.code : undefined;

    if (action === "issue") {
      return await issueSession(req, verificationType, code);
    }

    if (action === "validate") {
      return await validateSession(req);
    }

    if (action === "revoke") {
      return await revokeSession(req);
    }

    return jsonResponse({ error: "Unknown action" }, 400);
  } catch (error) {
    console.error("[admin-session] Unexpected error", error);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
