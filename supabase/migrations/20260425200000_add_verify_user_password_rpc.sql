-- Step-up password verification without rotating the session.
--
-- Background: PasswordConfirmDialog uses `supabase.auth.signInWithPassword`
-- to verify the current user's password before sensitive actions.  That call
-- issues a *new* session (rotates JWTs, fires auth-state-change, can
-- invalidate other tabs/devices).  We just want to verify, not re-login.
--
-- This RPC compares the supplied password against the bcrypt hash stored in
-- `auth.users.encrypted_password` using pgcrypto's `crypt()` — the same
-- function Supabase uses to hash on signup — and returns boolean.  It runs
-- as SECURITY DEFINER so authenticated users can read their own row only
-- (the WHERE clause forces id = auth.uid()).
--
-- It also rate-limits inside the RPC to make brute force harder.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.password_verify_attempts (
  user_id        uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  failed_count   integer NOT NULL DEFAULT 0,
  window_started timestamptz NOT NULL DEFAULT now(),
  locked_until   timestamptz
);

ALTER TABLE public.password_verify_attempts ENABLE ROW LEVEL SECURITY;
-- No client-facing policies; the RPC writes via SECURITY DEFINER.

CREATE OR REPLACE FUNCTION public.verify_user_password(p_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id    uuid := auth.uid();
  v_hash       text;
  v_match      boolean;
  v_attempts   public.password_verify_attempts%ROWTYPE;
  v_now        timestamptz := now();
  v_max_fails  integer := 5;
  v_window     interval := interval '15 minutes';
  v_lockout    interval := interval '15 minutes';
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_password IS NULL OR length(p_password) = 0 OR length(p_password) > 200 THEN
    RAISE EXCEPTION 'Password must be 1-200 characters';
  END IF;

  -- Check rate limit / lockout
  SELECT *
  INTO v_attempts
  FROM public.password_verify_attempts
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF FOUND AND v_attempts.locked_until IS NOT NULL AND v_attempts.locked_until > v_now THEN
    RAISE EXCEPTION 'Too many failed attempts — locked until %', v_attempts.locked_until;
  END IF;

  -- Verify password against bcrypt hash on auth.users
  SELECT encrypted_password
  INTO v_hash
  FROM auth.users
  WHERE id = v_user_id;

  IF v_hash IS NULL THEN
    -- OAuth-only user (no local password set).  Caller must use OTP reauth.
    RETURN jsonb_build_object('success', false, 'reason', 'no_password_set');
  END IF;

  v_match := (v_hash = extensions.crypt(p_password, v_hash));

  IF v_match THEN
    -- Reset attempts on success
    INSERT INTO public.password_verify_attempts (user_id, failed_count, window_started, locked_until)
    VALUES (v_user_id, 0, v_now, NULL)
    ON CONFLICT (user_id) DO UPDATE
      SET failed_count = 0, window_started = v_now, locked_until = NULL;

    RETURN jsonb_build_object('success', true);
  ELSE
    -- Increment failures, possibly lock
    INSERT INTO public.password_verify_attempts (user_id, failed_count, window_started)
    VALUES (v_user_id, 1, v_now)
    ON CONFLICT (user_id) DO UPDATE
      SET
        failed_count = CASE
          WHEN public.password_verify_attempts.window_started < v_now - v_window THEN 1
          ELSE public.password_verify_attempts.failed_count + 1
        END,
        window_started = CASE
          WHEN public.password_verify_attempts.window_started < v_now - v_window THEN v_now
          ELSE public.password_verify_attempts.window_started
        END,
        locked_until = CASE
          WHEN public.password_verify_attempts.failed_count + 1 >= v_max_fails THEN v_now + v_lockout
          ELSE NULL
        END;

    RETURN jsonb_build_object('success', false, 'reason', 'invalid_password');
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_user_password(text) TO authenticated;
