import { supabase } from "@/integrations/supabase/client";

const ADMIN_SESSION_TOKEN_KEY = "admin_session_token";
const ADMIN_SESSION_EXPIRES_AT_KEY = "admin_session_expires_at";
const ADMIN_SESSION_VERIFIED_VIA_KEY = "admin_session_verified_via";
const ADMIN_SESSION_CODE_NAME_KEY = "admin_code_name";
const ADMIN_SESSION_CODE_ROLE_KEY = "admin_code_role";
const ADMIN_SESSION_FUNCTION = "admin-session";
const validatedAdminSessions = new Map<string, AdminSessionDetails>();

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

export type AdminSessionDetails = {
  verifiedVia: "otp" | "code";
  codeName: string | null;
  codeRole: "admin" | "moderator" | null;
  expiresAt: string | null;
};

function getStoredSessionToken(): string | null {
  const token = sessionStorage.getItem(ADMIN_SESSION_TOKEN_KEY);
  return token && token.trim() ? token : null;
}

function isStoredSessionExpired(): boolean {
  const expiresAt = sessionStorage.getItem(ADMIN_SESSION_EXPIRES_AT_KEY);
  if (!expiresAt) {
    return false;
  }

  const expiresAtMs = new Date(expiresAt).getTime();
  return Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now();
}

function rememberValidatedAdminSession(userId: string, details: AdminSessionDetails): void {
  validatedAdminSessions.set(userId, details);
}

function forgetValidatedAdminSession(userId?: string | null): void {
  if (userId) {
    validatedAdminSessions.delete(userId);
    return;
  }

  validatedAdminSessions.clear();
}

async function invokeAdminSession<TResponse>(body: Record<string, unknown>): Promise<TResponse> {
  const { data, error } = await supabase.functions.invoke(ADMIN_SESSION_FUNCTION, { body });

  if (error) {
    throw error;
  }

  return data as TResponse;
}

export function getAdminSessionToken(): string | null {
  if (isStoredSessionExpired()) {
    clearAdminSession();
    return null;
  }

  return getStoredSessionToken();
}

export function hasAdminSession(userId?: string | null): boolean {
  if (!userId || !getStoredSessionToken()) {
    return false;
  }

  return validatedAdminSessions.has(userId);
}

export function hasAdminCodeSession(userId?: string | null): boolean {
  if (!userId || !getStoredSessionToken()) {
    return false;
  }

  return validatedAdminSessions.get(userId)?.verifiedVia === "code";
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
  sessionToken: string;
  verifiedVia?: "otp" | "code";
  codeName?: string | null;
  codeRole?: "admin" | "moderator" | null;
  expiresAt?: string | null;
}) {
  forgetValidatedAdminSession();
  sessionStorage.setItem(ADMIN_SESSION_TOKEN_KEY, params.sessionToken);

  if (params.expiresAt) {
    sessionStorage.setItem(ADMIN_SESSION_EXPIRES_AT_KEY, params.expiresAt);
  } else {
    sessionStorage.removeItem(ADMIN_SESSION_EXPIRES_AT_KEY);
  }

  if (params.verifiedVia) {
    sessionStorage.setItem(ADMIN_SESSION_VERIFIED_VIA_KEY, params.verifiedVia);
  } else {
    sessionStorage.removeItem(ADMIN_SESSION_VERIFIED_VIA_KEY);
  }

  if (params.codeName) {
    sessionStorage.setItem(ADMIN_SESSION_CODE_NAME_KEY, params.codeName);
  } else {
    sessionStorage.removeItem(ADMIN_SESSION_CODE_NAME_KEY);
  }

  if (params.codeRole) {
    sessionStorage.setItem(ADMIN_SESSION_CODE_ROLE_KEY, params.codeRole);
  } else {
    sessionStorage.removeItem(ADMIN_SESSION_CODE_ROLE_KEY);
  }
}

async function validateAdminSessionDetails(userId?: string | null): Promise<AdminSessionDetails | null> {
  const token = getStoredSessionToken();
  if (!userId || !token) {
    return null;
  }

  try {
    const result = await invokeAdminSession<AdminSessionValidateResponse>({
      action: "validate",
      session_token: token,
    });

    if (!result?.valid) {
      forgetValidatedAdminSession(userId);
      return null;
    }

    const details: AdminSessionDetails = {
      verifiedVia: result.verified_via ?? "otp",
      codeName: result.code_name ?? null,
      codeRole: result.code_role === "admin" || result.code_role === "moderator"
        ? result.code_role
        : null,
      expiresAt: result.expires_at ?? null,
    };

    rememberValidatedAdminSession(userId, details);

    return details;
  } catch (error) {
    console.error("Failed to validate admin session:", error);
    return null;
  }
}

export async function validateAdminSession(userId?: string | null): Promise<boolean> {
  return Boolean(await validateAdminSessionDetails(userId));
}

export async function getValidatedAdminSession(userId?: string | null): Promise<AdminSessionDetails | null> {
  return validateAdminSessionDetails(userId);
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
  forgetValidatedAdminSession();

  const token = getStoredSessionToken();
  if (token) {
    void revokeAdminSession(token);
  }

  sessionStorage.removeItem(ADMIN_SESSION_TOKEN_KEY);
  sessionStorage.removeItem(ADMIN_SESSION_EXPIRES_AT_KEY);
  sessionStorage.removeItem(ADMIN_SESSION_VERIFIED_VIA_KEY);
  sessionStorage.removeItem(ADMIN_SESSION_CODE_NAME_KEY);
  sessionStorage.removeItem(ADMIN_SESSION_CODE_ROLE_KEY);
}
