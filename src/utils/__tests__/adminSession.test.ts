import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const supabaseMocks = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: supabaseMocks.invoke,
    },
  },
}));

import {
  clearAdminSession,
  getAdminSessionToken,
  hasAdminCodeSession,
  hasAdminSession,
  issueAdminCodeSession,
  issueAdminOtpSession,
  setAdminSession,
  validateAdminSession,
} from '@/utils/adminSession';

describe('adminSession helpers', () => {
  beforeEach(() => {
    const store = new Map<string, string>();

    vi.spyOn(sessionStorage, 'clear').mockImplementation(() => {
      store.clear();
    });
    vi.spyOn(sessionStorage, 'getItem').mockImplementation((key: string) => store.get(key) ?? null);
    vi.spyOn(sessionStorage, 'removeItem').mockImplementation((key: string) => {
      store.delete(key);
    });
    vi.spyOn(sessionStorage, 'setItem').mockImplementation((key: string, value: string) => {
      store.set(key, value);
    });
    supabaseMocks.invoke.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns false without a user or stored token', async () => {
    await expect(validateAdminSession(undefined)).resolves.toBe(false);
    await expect(validateAdminSession('user-1')).resolves.toBe(false);

    expect(supabaseMocks.invoke).not.toHaveBeenCalled();
    expect(hasAdminSession('user-1')).toBe(false);
    expect(hasAdminCodeSession('user-1')).toBe(false);
    expect(getAdminSessionToken()).toBeNull();
  });

  it('stores the validated code session metadata when the function reports a valid code session', async () => {
    sessionStorage.setItem('admin_session_token', 'session-token');
    supabaseMocks.invoke.mockResolvedValueOnce({
      data: {
        valid: true,
        verified_via: 'code',
        code_name: 'admin-code',
        code_role: 'support',
      },
      error: null,
    });

    await expect(validateAdminSession('user-123')).resolves.toBe(true);

    expect(supabaseMocks.invoke).toHaveBeenCalledWith('admin-session', {
      body: {
        action: 'validate',
        session_token: 'session-token',
      },
    });
  });

  it('issues and clears admin session state through the expected rpc actions', async () => {
    supabaseMocks.invoke
      .mockResolvedValueOnce({
        data: {
          success: true,
          session_token: 'otp-session',
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          success: true,
          session_token: 'code-session',
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { success: true },
        error: null,
      });

    sessionStorage.setItem('admin_verified', 'user-123');
    sessionStorage.setItem('admin_session_token', 'stored-token');
    sessionStorage.setItem('admin_code_verified', 'true');
    sessionStorage.setItem('admin_code_name', 'admin-code');
    sessionStorage.setItem('admin_code_role', 'support');

    await issueAdminOtpSession('111111');
    await issueAdminCodeSession('ABCDEF');

    clearAdminSession();
    await Promise.resolve();

    expect(supabaseMocks.invoke).toHaveBeenNthCalledWith(1, 'admin-session', {
      body: {
        action: 'issue',
        verification_type: 'otp',
        code: '111111',
      },
    });
    expect(supabaseMocks.invoke).toHaveBeenNthCalledWith(2, 'admin-session', {
      body: {
        action: 'issue',
        verification_type: 'code',
        code: 'ABCDEF',
      },
    });
    expect(supabaseMocks.invoke).toHaveBeenNthCalledWith(3, 'admin-session', {
      body: {
        action: 'revoke',
        session_token: 'stored-token',
      },
    });
  });

  it('treats expired stored admin sessions as invalid on the client', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-10T00:00:00.000Z'));
    supabaseMocks.invoke.mockResolvedValue({ data: { success: true }, error: null });

    setAdminSession({
      sessionToken: 'session-token',
      verifiedVia: 'code',
      expiresAt: '2026-04-09T23:59:00.000Z',
    });

    expect(getAdminSessionToken()).toBeNull();
    expect(hasAdminSession('user-123')).toBe(false);
    expect(hasAdminCodeSession('user-123')).toBe(false);

    vi.useRealTimers();
  });

  it('stores verification metadata when setting an admin session', () => {
    setAdminSession({
      sessionToken: 'session-token',
      verifiedVia: 'code',
      codeName: 'support-code',
      codeRole: 'admin',
      expiresAt: '2026-04-10T01:00:00.000Z',
    });

    expect(sessionStorage.getItem('admin_session_token')).toBe('session-token');
    expect(sessionStorage.getItem('admin_session_verified_via')).toBe('code');
    expect(sessionStorage.getItem('admin_code_name')).toBe('support-code');
    expect(sessionStorage.getItem('admin_code_role')).toBe('admin');
    expect(sessionStorage.getItem('admin_session_expires_at')).toBe('2026-04-10T01:00:00.000Z');
  });
});
