import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BASE_JSON_HEADERS = {
  "Content-Type": "application/json",
};

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

function getAllowedOrigins(): Set<string> {
  const origins = new Set<string>(DEFAULT_ALLOWED_ORIGINS);
  const rawOrigins = [
    Deno.env.get("ADMIN_SESSION_ALLOWED_ORIGINS"),
    Deno.env.get("SITE_URL"),
    Deno.env.get("APP_URL"),
    Deno.env.get("PUBLIC_SITE_URL"),
  ]
    .filter((value): value is string => Boolean(value))
    .join(",");

  for (const candidate of rawOrigins.split(",")) {
    const origin = normalizeOrigin(candidate);
    if (origin) {
      origins.add(origin);
    }
  }

  return origins;
}

function normalizeOrigin(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
}

function getRequestOrigin(req: Request): string | null {
  return normalizeOrigin(req.headers.get("origin") ?? req.headers.get("Origin") ?? "");
}

function buildCorsHeaders(req: Request): Headers | null {
  const requestOrigin = getRequestOrigin(req);
  if (!requestOrigin) {
    return null;
  }

  const allowedOrigins = getAllowedOrigins();
  if (!allowedOrigins.has(requestOrigin)) {
    return null;
  }

  const headers = new Headers(BASE_JSON_HEADERS);
  headers.set("Access-Control-Allow-Origin", requestOrigin);
  headers.set("Access-Control-Allow-Headers", "authorization, apikey, content-type, x-client-info, x-supabase-api-version");
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set("Access-Control-Max-Age", "86400");
  headers.set("Vary", "Origin");
  return headers;
}

function corsResponse(req: Request, body: unknown, status = 200): Response {
  const corsHeaders = buildCorsHeaders(req);
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders ?? BASE_JSON_HEADERS,
  });
}

function getHeader(req: Request, name: string): string | null {
  return req.headers.get(name) || req.headers.get(name.toLowerCase());
}

function getSupabaseClients(req: Request) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");

  if (!supabaseUrl || !anonKey) {
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
  return { authClient };
}

async function getAuthenticatedUser(req: Request) {
  const { authClient } = getSupabaseClients(req);
  const { data, error } = await authClient.auth.getUser();

  if (error) {
    throw error;
  }

  return data.user;
}

async function issueSession(req: Request, verificationType: "otp" | "code", code?: string) {
  const { authClient } = getSupabaseClients(req);
  const rpcName = verificationType === "otp"
    ? "verify_admin_otp_and_issue_session"
    : "verify_admin_code_and_issue_session";

  if (verificationType === "otp") {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return corsResponse(req, { success: false, error: "unauthorized" }, 401);
    }

    const { data, error } = await authClient.rpc(rpcName as never, {
      p_user_id: user.id,
      p_otp: code ?? "",
    } as never);

    if (error) {
      throw error;
    }

    return corsResponse(req, data ?? { success: false, error: "invalid" }, data?.success ? 200 : 400);
  }

  const { data, error } = await authClient.rpc(rpcName as never, {
    p_code: code ?? "",
  } as never);

  if (error) {
    throw error;
  }

  return corsResponse(req, data ?? { success: false, error: "invalid" }, data?.success ? 200 : 400);
}

async function validateSession(req: Request) {
  const body = await req.json().catch(() => ({}));
  const sessionToken = typeof body.session_token === "string" ? body.session_token.trim() : "";

  if (!sessionToken) {
    return corsResponse(req, { valid: false }, 400);
  }

  const { authClient } = getSupabaseClients(req);
  const { data, error } = await authClient.rpc("validate_admin_session" as never, {
    p_session_token: sessionToken,
  } as never);

  if (error) {
    throw error;
  }

  return corsResponse(req, data ?? { valid: false }, data?.valid ? 200 : 400);
}

async function revokeSession(req: Request) {
  const body = await req.json().catch(() => ({}));
  const sessionToken = typeof body.session_token === "string" ? body.session_token.trim() : "";

  if (!sessionToken) {
    return corsResponse(req, { success: false }, 400);
  }

  const { authClient } = getSupabaseClients(req);
  const { data, error } = await authClient.rpc("revoke_admin_session" as never, {
    p_session_token: sessionToken,
  } as never);

  if (error) {
    throw error;
  }

  return corsResponse(req, { success: Boolean(data) });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    const corsHeaders = buildCorsHeaders(req);
    if (!corsHeaders) {
      return new Response(null, { status: 403, headers: BASE_JSON_HEADERS });
    }

    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return corsResponse(req, { error: "Method not allowed" }, 405);
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

    return corsResponse(req, { error: "Unknown action" }, 400);
  } catch (error) {
    console.error("[admin-session] Unexpected error", error);
    return corsResponse(req, { error: "Internal server error" }, 500);
  }
});
