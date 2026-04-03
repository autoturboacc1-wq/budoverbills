import React, { createContext, useContext, useState, useEffect, ReactNode, useRef, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { logActivityDirect } from '@/hooks/useActivityLogger';
import { clearAdminSession } from '@/utils/adminSession';
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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const currentUserIdRef = useRef<string | null>(null);

  const getSafeAuthDestination = useCallback((destinationPath?: string | null) => {
    if (!destinationPath || !destinationPath.startsWith('/') || destinationPath.startsWith('//')) {
      return '/';
    }

    return destinationPath;
  }, []);

  const fetchProfile = useCallback(async (userId: string) => {
    setProfileLoading(true);

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (currentUserIdRef.current !== userId) {
        return;
      }

      if (!error) {
        setProfile(data ?? null);
      }
    } finally {
      if (currentUserIdRef.current === userId) {
        setProfileLoading(false);
      }
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  }, [fetchProfile, user]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        const nextUser = session?.user ?? null;
        currentUserIdRef.current = nextUser?.id ?? null;
        setAuthLoading(true);
        setSession(session);
        setUser(nextUser);
        
        if (nextUser) {
          if (event === 'PASSWORD_RECOVERY' && window.location.pathname !== '/auth') {
            window.location.assign('/auth?type=recovery');
            return;
          }

          setTimeout(() => {
            void (async () => {
              await fetchProfile(nextUser.id);
              setAuthLoading(false);
            })();
          }, 0);
        } else {
          clearAdminSession();
          setProfile(null);
          setProfileLoading(false);
          setAuthLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  const signUp = async (email: string, password: string, displayName?: string) => {
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
  };

  const signIn = async (email: string, password: string) => {
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
  };

  const signInWithGoogle = async (destinationPath?: string) => {
    const safeDestination = getSafeAuthDestination(destinationPath);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth?from=${encodeURIComponent(safeDestination)}`,
      },
    });
    
    return { error: error as Error | null };
  };

  const signOut = async () => {
    // Log logout before signing out
    if (user) {
      logActivityDirect({
        actionType: 'logout',
        actionCategory: 'auth',
        userId: user.id
      });
    }
    
    clearAdminSession();
    await supabase.auth.signOut();
  };

  const requireAuth = (action: string): boolean => {
    if (!user) {
      console.warn(`Authentication required for action: ${action}`);
      const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      window.location.assign(`/auth?from=${encodeURIComponent(returnTo)}`);
      return false;
    }
    return true;
  };

  const isLoading = authLoading || profileLoading;

  const value: AuthContextType = {
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
  };

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
