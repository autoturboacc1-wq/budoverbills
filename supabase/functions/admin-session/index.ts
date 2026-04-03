import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS,
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
      return jsonResponse({ success: false, error: "unauthorized" }, 401);
    }

    const { data, error } = await authClient.rpc(rpcName as never, {
      p_user_id: user.id,
      p_otp: code ?? "",
    } as never);

    if (error) {
      throw error;
    }

    return jsonResponse(data ?? { success: false, error: "invalid" }, data?.success ? 200 : 400);
  }

  const { data, error } = await authClient.rpc(rpcName as never, {
    p_code: code ?? "",
  } as never);

  if (error) {
    throw error;
  }

  return jsonResponse(data ?? { success: false, error: "invalid" }, data?.success ? 200 : 400);
}

async function validateSession(req: Request) {
  const body = await req.json().catch(() => ({}));
  const sessionToken = typeof body.session_token === "string" ? body.session_token.trim() : "";

  if (!sessionToken) {
    return jsonResponse({ valid: false }, 400);
  }

  const { authClient } = getSupabaseClients(req);
  const { data, error } = await authClient.rpc("validate_admin_session" as never, {
    p_session_token: sessionToken,
  } as never);

  if (error) {
    throw error;
  }

  return jsonResponse(data ?? { valid: false }, data?.valid ? 200 : 400);
}

async function revokeSession(req: Request) {
  const body = await req.json().catch(() => ({}));
  const sessionToken = typeof body.session_token === "string" ? body.session_token.trim() : "";

  if (!sessionToken) {
    return jsonResponse({ success: false }, 400);
  }

  const { authClient } = getSupabaseClients(req);
  const { data, error } = await authClient.rpc("revoke_admin_session" as never, {
    p_session_token: sessionToken,
  } as never);

  if (error) {
    throw error;
  }

  return jsonResponse({ success: Boolean(data) });
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
