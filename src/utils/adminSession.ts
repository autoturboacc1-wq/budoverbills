import { supabase } from "@/integrations/supabase/client";

const ADMIN_SESSION_TOKEN_KEY = "admin_session_token";
const ADMIN_SESSION_FUNCTION = "admin-session";

type AdminSessionIssueResponse = {
  success: boolean;
  error?: string;
  message?: string;
  session_token?: string;
  verified_via?: "otp" | "code";
  code_name?: string | null;
  code_role?: string | null;
  expires_at?: string;
  attempts?: number;
  remaining?: number;
  locked_until?: string;
};

type AdminSessionValidateResponse = {
  valid?: boolean;
  verified_via?: "otp" | "code";
  code_name?: string | null;
  code_role?: string | null;
  expires_at?: string;
};

function getStoredSessionToken(): string | null {
  return sessionStorage.getItem(ADMIN_SESSION_TOKEN_KEY);
}

async function invokeAdminSession<TResponse>(body: Record<string, unknown>): Promise<TResponse> {
  const { data, error } = await supabase.functions.invoke(ADMIN_SESSION_FUNCTION, { body });

  if (error) {
    throw error;
  }

  return data as TResponse;
}

export function getAdminSessionToken(): string | null {
  return getStoredSessionToken();
}

export function hasAdminSession(userId?: string | null): boolean {
  return Boolean(userId) &&
    sessionStorage.getItem("admin_verified") === userId &&
    Boolean(getStoredSessionToken());
}

export function hasAdminCodeSession(userId?: string | null): boolean {
  return hasAdminSession(userId) && sessionStorage.getItem("admin_code_verified") === "true";
}

export async function issueAdminOtpSession(otp: string): Promise<AdminSessionIssueResponse> {
  return invokeAdminSession<AdminSessionIssueResponse>({
    action: "issue",
    verification_type: "otp",
    code: otp,
  });
}

export async function issueAdminCodeSession(code: string): Promise<AdminSessionIssueResponse> {
  return invokeAdminSession<AdminSessionIssueResponse>({
    action: "issue",
    verification_type: "code",
    code,
  });
}

export function setAdminSession(params: {
  userId: string;
  sessionToken: string;
  codeVerified?: boolean;
  codeName?: string;
  codeRole?: string;
}) {
  sessionStorage.setItem("admin_verified", params.userId);
  sessionStorage.setItem(ADMIN_SESSION_TOKEN_KEY, params.sessionToken);

  if (params.codeVerified) {
    sessionStorage.setItem("admin_code_verified", "true");
  }

  if (params.codeName) {
    sessionStorage.setItem("admin_code_name", params.codeName);
  }

  if (params.codeRole) {
    sessionStorage.setItem("admin_code_role", params.codeRole);
  }
}

export async function validateAdminSession(userId?: string | null): Promise<boolean> {
  const token = getStoredSessionToken();
  if (!userId || !token) {
    return false;
  }

  try {
    const result = await invokeAdminSession<AdminSessionValidateResponse>({
      action: "validate",
      session_token: token,
    });

    if (!result?.valid) {
      return false;
    }

    sessionStorage.setItem("admin_verified", userId);

    if (result.verified_via === "code") {
      sessionStorage.setItem("admin_code_verified", "true");
      if (result.code_name) {
        sessionStorage.setItem("admin_code_name", result.code_name);
      }
      if (result.code_role) {
        sessionStorage.setItem("admin_code_role", result.code_role);
      }
    }

    return true;
  } catch (error) {
    console.error("Failed to validate admin session:", error);
    return false;
  }
}

async function revokeAdminSession(sessionToken: string): Promise<void> {
  try {
    await invokeAdminSession({
      action: "revoke",
      session_token: sessionToken,
    });
  } catch (error) {
    console.error("Failed to revoke admin session:", error);
  }
}

export function clearAdminSession(): void {
  const token = getStoredSessionToken();
  if (token) {
    void revokeAdminSession(token);
  }

  sessionStorage.removeItem("admin_verified");
  sessionStorage.removeItem(ADMIN_SESSION_TOKEN_KEY);
  sessionStorage.removeItem("admin_code_verified");
  sessionStorage.removeItem("admin_code_name");
  sessionStorage.removeItem("admin_code_role");
}
