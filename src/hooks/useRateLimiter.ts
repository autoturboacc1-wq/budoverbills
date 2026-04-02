import { useState, useCallback, useRef } from 'react';

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

// Global store for rate limiting across components
const rateLimitStore: Map<string, RateLimitState> = new Map();

export function useRateLimiter(key: string, config: Partial<RateLimitConfig> = {}) {
  const finalConfig = { ...defaultConfig, ...config };
  const [isBlocked, setIsBlocked] = useState(false);
  const [remainingAttempts, setRemainingAttempts] = useState(finalConfig.maxAttempts);
  const [blockTimeRemaining, setBlockTimeRemaining] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const getState = useCallback((): RateLimitState => {
    return rateLimitStore.get(key) || {
      attempts: 0,
      firstAttemptTime: null,
      blockedUntil: null,
    };
  }, [key]);

  const setState = useCallback((state: RateLimitState) => {
    rateLimitStore.set(key, state);
  }, [key]);

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
        setRemainingAttempts(finalConfig.maxAttempts);
        setState({
          attempts: 0,
          firstAttemptTime: null,
          blockedUntil: null,
        });
      }
    };

    updateRemaining();
    intervalRef.current = setInterval(updateRemaining, 1000);
  }, [clearBlockTimer, finalConfig.maxAttempts, setState]);

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
      setRemainingAttempts(finalConfig.maxAttempts);
    }

    return true;
  }, [getState, setState, startBlockTimer, finalConfig.maxAttempts]);

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
    if (state.firstAttemptTime && now - state.firstAttemptTime > finalConfig.windowMs) {
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
      setRemainingAttempts(finalConfig.maxAttempts);
      return { allowed: true };
    }

    // Record failed attempt
    const newAttempts = state.attempts + 1;
    const firstAttemptTime = state.firstAttemptTime || now;

    if (newAttempts >= finalConfig.maxAttempts) {
      // Block the user
      const blockedUntil = now + finalConfig.blockDurationMs;
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
        message: `ลองผิดเกิน ${finalConfig.maxAttempts} ครั้ง กรุณารอ ${Math.ceil(finalConfig.blockDurationMs / 1000 / 60)} นาที`,
      };
    }

    // Update state
    setState({
      attempts: newAttempts,
      firstAttemptTime,
      blockedUntil: null,
    });
    setRemainingAttempts(finalConfig.maxAttempts - newAttempts);

    return {
      allowed: true,
      message: `เหลือโอกาสอีก ${finalConfig.maxAttempts - newAttempts} ครั้ง`,
    };
  }, [getState, setState, startBlockTimer, finalConfig]);

  const reset = useCallback(() => {
    clearBlockTimer();
    setState({
      attempts: 0,
      firstAttemptTime: null,
      blockedUntil: null,
    });
    setIsBlocked(false);
    setRemainingAttempts(finalConfig.maxAttempts);
    setBlockTimeRemaining(0);
  }, [clearBlockTimer, setState, finalConfig.maxAttempts]);

  return {
    isBlocked,
    remainingAttempts,
    blockTimeRemaining,
    checkRateLimit,
    recordAttempt,
    reset,
  };
}
