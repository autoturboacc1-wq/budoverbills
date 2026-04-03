import { useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';

interface RateLimitConfig {
  maxAttempts: number;
  windowMs: number;
  blockDurationMs: number;
}

interface RateLimitState {
  attempts: number;
  firstAttemptTime: number | null;
  blockedUntil: number | null;
}

const defaultConfig: RateLimitConfig = {
  maxAttempts: 5,
  windowMs: 60 * 1000, // 1 minute window
  blockDurationMs: 5 * 60 * 1000, // 5 minute block
};

// Global store for rate limiting across components.
// Keys are scoped per authenticated user or anonymous browser session.
const rateLimitStore: Map<string, RateLimitState> = new Map();
const ANONYMOUS_SCOPE_STORAGE_KEY = 'rate_limiter_anonymous_scope';

function createAnonymousScope(forceNew = false): string {
  if (typeof window === 'undefined') {
    return 'anonymous';
  }

  if (forceNew) {
    window.sessionStorage.removeItem(ANONYMOUS_SCOPE_STORAGE_KEY);
  }

  const existingScope = window.sessionStorage.getItem(ANONYMOUS_SCOPE_STORAGE_KEY);
  if (existingScope) {
    return existingScope;
  }

  const nextScope =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  window.sessionStorage.setItem(ANONYMOUS_SCOPE_STORAGE_KEY, nextScope);
  return nextScope;
}

export function useRateLimiter(key: string, config: Partial<RateLimitConfig> = {}) {
  const { user } = useAuth();
  const maxAttempts = config.maxAttempts ?? defaultConfig.maxAttempts;
  const windowMs = config.windowMs ?? defaultConfig.windowMs;
  const blockDurationMs = config.blockDurationMs ?? defaultConfig.blockDurationMs;
  const [anonymousScope, setAnonymousScope] = useState(() => createAnonymousScope());
  const [isBlocked, setIsBlocked] = useState(false);
  const [remainingAttempts, setRemainingAttempts] = useState(maxAttempts);
  const [blockTimeRemaining, setBlockTimeRemaining] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previousUserIdRef = useRef<string | null>(user?.id ?? null);

  useEffect(() => {
    const currentUserId = user?.id ?? null;
    const previousUserId = previousUserIdRef.current;

    if (previousUserId && !currentUserId) {
      setAnonymousScope(createAnonymousScope(true));
    }

    previousUserIdRef.current = currentUserId;
  }, [user?.id]);

  const scope = user?.id ?? anonymousScope;
  const scopedKey = `${scope}:${key}`;

  const getState = useCallback((): RateLimitState => {
    return rateLimitStore.get(scopedKey) || {
      attempts: 0,
      firstAttemptTime: null,
      blockedUntil: null,
    };
  }, [scopedKey]);

  const setState = useCallback((state: RateLimitState) => {
    rateLimitStore.set(scopedKey, state);
  }, [scopedKey]);

  const clearBlockTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startBlockTimer = useCallback((blockedUntil: number) => {
    clearBlockTimer();
    
    const updateRemaining = () => {
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((blockedUntil - now) / 1000));
      setBlockTimeRemaining(remaining);
      
      if (remaining <= 0) {
        clearBlockTimer();
        setIsBlocked(false);
        setRemainingAttempts(maxAttempts);
        setState({
          attempts: 0,
          firstAttemptTime: null,
          blockedUntil: null,
        });
      }
    };

    updateRemaining();
    intervalRef.current = setInterval(updateRemaining, 1000);
  }, [clearBlockTimer, maxAttempts, setState]);

  useEffect(() => {
    const state = getState();
    const now = Date.now();

    if (state.blockedUntil && now < state.blockedUntil) {
      setIsBlocked(true);
      setRemainingAttempts(0);
      startBlockTimer(state.blockedUntil);
      return clearBlockTimer;
    }

    if (state.blockedUntil && now >= state.blockedUntil) {
      setState({
        attempts: 0,
        firstAttemptTime: null,
        blockedUntil: null,
      });
    }

    setIsBlocked(false);
    setBlockTimeRemaining(0);
    setRemainingAttempts(Math.max(0, maxAttempts - state.attempts));

    return clearBlockTimer;
  }, [clearBlockTimer, getState, maxAttempts, setState, startBlockTimer, scopedKey]);

  const checkRateLimit = useCallback((): boolean => {
    const now = Date.now();
    const state = getState();

    // Check if currently blocked
    if (state.blockedUntil && now < state.blockedUntil) {
      setIsBlocked(true);
      startBlockTimer(state.blockedUntil);
      return false;
    }

    // Reset if block has expired
    if (state.blockedUntil && now >= state.blockedUntil) {
      setState({
        attempts: 0,
        firstAttemptTime: null,
        blockedUntil: null,
      });
      setIsBlocked(false);
      setRemainingAttempts(maxAttempts);
    }

    return true;
  }, [getState, maxAttempts, setState, startBlockTimer]);

  const recordAttempt = useCallback((success: boolean = false): { allowed: boolean; message?: string } => {
    const now = Date.now();
    let state = getState();

    // Check if currently blocked
    if (state.blockedUntil && now < state.blockedUntil) {
      const remainingSec = Math.ceil((state.blockedUntil - now) / 1000);
      return {
        allowed: false,
        message: `กรุณารอ ${remainingSec} วินาที ก่อนลองอีกครั้ง`,
      };
    }

    // Reset if window has passed
    if (state.firstAttemptTime && now - state.firstAttemptTime > windowMs) {
      state = {
        attempts: 0,
        firstAttemptTime: null,
        blockedUntil: null,
      };
    }

    // If successful, reset attempts
    if (success) {
      setState({
        attempts: 0,
        firstAttemptTime: null,
        blockedUntil: null,
      });
      setIsBlocked(false);
      setRemainingAttempts(maxAttempts);
      return { allowed: true };
    }

    // Record failed attempt
    const newAttempts = state.attempts + 1;
    const firstAttemptTime = state.firstAttemptTime || now;

    if (newAttempts >= maxAttempts) {
      // Block the user
      const blockedUntil = now + blockDurationMs;
      setState({
        attempts: newAttempts,
        firstAttemptTime,
        blockedUntil,
      });
      setIsBlocked(true);
      setRemainingAttempts(0);
      startBlockTimer(blockedUntil);
      
      return {
        allowed: false,
        message: `ลองผิดเกิน ${maxAttempts} ครั้ง กรุณารอ ${Math.ceil(blockDurationMs / 1000 / 60)} นาที`,
      };
    }

    // Update state
    setState({
      attempts: newAttempts,
      firstAttemptTime,
      blockedUntil: null,
    });
    setRemainingAttempts(maxAttempts - newAttempts);

    return {
      allowed: true,
      message: `เหลือโอกาสอีก ${maxAttempts - newAttempts} ครั้ง`,
    };
  }, [blockDurationMs, getState, maxAttempts, setState, startBlockTimer, windowMs]);

  const reset = useCallback(() => {
    clearBlockTimer();
    setState({
      attempts: 0,
      firstAttemptTime: null,
      blockedUntil: null,
    });
    setIsBlocked(false);
    setRemainingAttempts(maxAttempts);
    setBlockTimeRemaining(0);
  }, [clearBlockTimer, maxAttempts, setState]);

  return {
    isBlocked,
    remainingAttempts,
    blockTimeRemaining,
    checkRateLimit,
    recordAttempt,
    reset,
  };
}
