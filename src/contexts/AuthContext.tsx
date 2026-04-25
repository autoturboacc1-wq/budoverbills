import React, { createContext, useContext, useState, useEffect, ReactNode, useRef, useCallback, useMemo } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { logActivityDirect } from '@/hooks/useActivityLogger';
import { clearAdminSession } from '@/utils/adminSession';

const AUTH_RECOVERY_FLAG_KEY = 'auth_password_recovery';

function readRecoveryFlag(): boolean {
  return typeof window !== 'undefined' && window.sessionStorage.getItem(AUTH_RECOVERY_FLAG_KEY) === 'true';
}

function setRecoveryFlag(enabled: boolean): void {
  if (typeof window === 'undefined') {
    return;
  }

  if (enabled) {
    window.sessionStorage.setItem(AUTH_RECOVERY_FLAG_KEY, 'true');
    return;
  }

  window.sessionStorage.removeItem(AUTH_RECOVERY_FLAG_KEY);
}

function normalizeInternalPath(destinationPath?: string | null): string {
  if (!destinationPath) {
    return '/';
  }

  let decoded = destinationPath;
  try {
    decoded = decodeURIComponent(destinationPath);
  } catch {
    decoded = destinationPath;
  }

  const candidate = decoded.trim();
  if (!candidate.startsWith('/') || candidate.startsWith('//')) {
    return '/';
  }

  if (/[\s\\]/.test(candidate)) {
    return '/';
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(candidate)) {
    return '/';
  }

  try {
    const url = new URL(candidate, window.location.origin);
    return url.origin === window.location.origin && url.pathname.startsWith('/')
      ? `${url.pathname}${url.search}${url.hash}`
      : '/';
  } catch {
    return '/';
  }
}
interface Profile {
  id: string;
  user_id: string;
  display_name: string | null;
  phone: string | null;
  user_code: string | null;
  avatar_url: string | null;
  pdpa_accepted_at: string | null;
  first_name: string | null;
  last_name: string | null;
  theme_preference: string | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  isLoading: boolean;
  isGuest: boolean;
  signUp: (email: string, password: string, displayName?: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signInWithGoogle: (destinationPath?: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  requireAuth: (action: string) => boolean;
  refreshProfile: () => Promise<void>;
  isPasswordRecovery: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(readRecoveryFlag);
  const currentUserIdRef = useRef<string | null>(null);
  const authStateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAuthStateTimeout = useCallback(() => {
    if (authStateTimeoutRef.current !== null) {
      clearTimeout(authStateTimeoutRef.current);
      authStateTimeoutRef.current = null;
    }
  }, []);

  const getSafeAuthDestination = useCallback((destinationPath?: string | null) => {
    return normalizeInternalPath(destinationPath);
  }, []);

  /**
   * Fetches the profile for `userId`.
   *
   * `setLoadingFlag` lets the caller decide which loading state to flip:
   *  - calls from onAuthStateChange pass a no-op because `authLoading`
   *    already covers the whole auth+profile window, preventing a race
   *    where `profileLoading` briefly resets to false between the `finally`
   *    block and the subsequent `setAuthLoading(false)` call.
   *  - calls from `refreshProfile` pass `setProfileLoading` so the
   *    dedicated profile-refresh spinner is shown correctly.
   */
  const fetchProfile = useCallback(async (
    userId: string,
    setLoadingFlag: (v: boolean) => void = () => undefined,
  ) => {
    setLoadingFlag(true);

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (currentUserIdRef.current !== userId) {
        return;
      }

      if (error) {
        return;
      }

      if (data === null) {
        // Profile row missing. Could be a brand-new signup whose trigger
        // has not run yet, OR a stale JWT in localStorage for a user that
        // was deleted server-side. supabase.auth.getUser() hits the auth
        // server and distinguishes the two — if the user no longer exists
        // it errors, and we sign out so the app drops to /auth instead of
        // looping at /personal-info forever.
        const { error: userErr } = await supabase.auth.getUser();
        if (currentUserIdRef.current !== userId) {
          return;
        }
        if (userErr) {
          await supabase.auth.signOut();
          return;
        }
      }

      setProfile(data);
    } finally {
      if (currentUserIdRef.current === userId) {
        setLoadingFlag(false);
      }
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) {
      await fetchProfile(user.id, setProfileLoading);
    }
  }, [fetchProfile, user]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        const nextUser = session?.user ?? null;
        const isRecoveryEvent = event === 'PASSWORD_RECOVERY';
        currentUserIdRef.current = nextUser?.id ?? null;
        clearAuthStateTimeout();
        setAuthLoading(true);
        setSession(session);
        setUser(nextUser);

        if (isRecoveryEvent) {
          setIsPasswordRecovery(true);
          setRecoveryFlag(true);
        } else if (!nextUser) {
          setIsPasswordRecovery(false);
        }
        
        if (nextUser) {
          if (isRecoveryEvent && window.location.pathname !== '/auth') {
            window.location.assign('/auth?type=recovery');
            return;
          }

          authStateTimeoutRef.current = setTimeout(() => {
            void (async () => {
              // Pass no-op for setLoadingFlag: authLoading already covers the
              // entire auth+profile initialisation window, so profileLoading
              // must not toggle independently here (BUG-AUTH-07).
              await fetchProfile(nextUser.id);
              if (currentUserIdRef.current === nextUser.id) {
                setAuthLoading(false);
              }
            })();
          }, 0);
        } else {
          clearAuthStateTimeout();
          setRecoveryFlag(false);
          clearAdminSession();
          setProfile(null);
          setProfileLoading(false);
          setAuthLoading(false);
        }
      }
    );

    return () => {
      clearAuthStateTimeout();
      subscription.unsubscribe();
    };
  }, [clearAuthStateTimeout, fetchProfile]);

  const signUp = useCallback(async (email: string, password: string, displayName?: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          display_name: displayName || email.split('@')[0],
        },
      },
    });
    
    // Log signup
    if (!error && data?.user) {
      logActivityDirect({
        actionType: 'signup',
        actionCategory: 'auth',
        userId: data.user.id,
        metadata: { email }
      });
    }
    
    return { error: error as Error | null };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    // Log activity
    if (error) {
      logActivityDirect({
        actionType: 'login_failed',
        actionCategory: 'auth',
        metadata: { email, error_message: error.message },
        isSuspicious: true
      });
    } else if (data?.user) {
      logActivityDirect({
        actionType: 'login_success',
        actionCategory: 'auth',
        userId: data.user.id
      });
    }
    
    return { error: error as Error | null };
  }, []);

  const signInWithGoogle = useCallback(async (destinationPath?: string) => {
    const safeDestination = getSafeAuthDestination(destinationPath);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth?from=${encodeURIComponent(safeDestination)}`,
      },
    });
    
    return { error: error as Error | null };
  }, [getSafeAuthDestination]);

  const signOut = useCallback(async () => {
    // Log logout before signing out
    if (user) {
      logActivityDirect({
        actionType: 'logout',
        actionCategory: 'auth',
        userId: user.id
      });
    }
    
    setRecoveryFlag(false);
    setIsPasswordRecovery(false);
    clearAdminSession();
    await supabase.auth.signOut();
  }, [user]);

  const requireAuth = useCallback((action: string): boolean => {
    if (!user) {
      console.warn(`Authentication required for action: ${action}`);
      const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      window.location.assign(`/auth?from=${encodeURIComponent(returnTo)}`);
      return false;
    }
    return true;
  }, [user]);

  const isLoading = authLoading || profileLoading;

  const value: AuthContextType = useMemo(() => ({
    user,
    session,
    profile,
    isLoading,
    isGuest: !user,
    signUp,
    signIn,
    signInWithGoogle,
    signOut,
    requireAuth,
    refreshProfile,
    isPasswordRecovery,
  }), [
    user,
    session,
    profile,
    isLoading,
    signUp,
    signIn,
    signInWithGoogle,
    signOut,
    requireAuth,
    refreshProfile,
    isPasswordRecovery,
  ]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
