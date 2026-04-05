-- BUG-RLS-09: Harden admin_otp brute-force protection.
--
-- The columns failed_attempts / locked_until were added in an earlier migration
-- but the verify_admin_otp function did not enforce 5-attempt lockout per spec.
-- This migration ensures the columns exist and replaces the verification function
-- with one that:
--   • Rejects attempts when locked_until > NOW()
--   • Increments failed_attempts on each wrong guess
--   • Locks for 15 minutes after 5 failed attempts
--   • Resets failed_attempts = 0 on success

ALTER TABLE public.admin_otp
  ADD COLUMN IF NOT EXISTS failed_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_admin_otp_locked_until
  ON public.admin_otp (locked_until)
  WHERE locked_until IS NOT NULL;

-- Replace verify_admin_otp with spec-compliant 5-attempt lockout.
DROP FUNCTION IF EXISTS public.verify_admin_otp(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.verify_admin_otp(p_user_id UUID, p_otp TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec   RECORD;
  v_new_attempts INTEGER;
BEGIN
  -- Caller must be the owner of the OTP
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized', 'message', 'ไม่มีสิทธิ์');
  END IF;

  -- Fetch the most-recent OTP row for this user, locking it to prevent races
  SELECT *
  INTO   v_rec
  FROM   public.admin_otp
  WHERE  user_id = p_user_id
  ORDER  BY created_at DESC
  LIMIT  1
  FOR UPDATE;

  IF v_rec IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_otp', 'message', 'ไม่พบรหัส OTP');
  END IF;

  -- Reject while lockout window is active
  IF v_rec.locked_until IS NOT NULL AND v_rec.locked_until > now() THEN
    RETURN jsonb_build_object(
      'success',      false,
      'error',        'locked',
      'message',      'บัญชีถูกล็อคชั่วคราว กรุณารอ 15 นาที',
      'locked_until', v_rec.locked_until
    );
  END IF;

  -- Reject expired OTP
  IF v_rec.expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'expired', 'message', 'รหัส OTP หมดอายุ');
  END IF;

  -- Reject already-used OTP
  IF v_rec.verified = true THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_used', 'message', 'รหัส OTP ถูกใช้แล้ว');
  END IF;

  -- Correct OTP — mark verified and clear lockout state
  IF v_rec.otp_code = p_otp THEN
    UPDATE public.admin_otp
    SET    verified       = true,
           failed_attempts = 0,
           locked_until   = NULL
    WHERE  id = v_rec.id;

    RETURN jsonb_build_object('success', true, 'message', 'ยืนยันสำเร็จ');
  END IF;

  -- Wrong OTP — increment counter and lock at 5 attempts
  v_new_attempts := v_rec.failed_attempts + 1;

  UPDATE public.admin_otp
  SET    failed_attempts = v_new_attempts,
         locked_until   = CASE
                            WHEN v_new_attempts >= 5 THEN now() + INTERVAL '15 minutes'
                            ELSE NULL
                          END
  WHERE  id = v_rec.id;

  IF v_new_attempts >= 5 THEN
    RETURN jsonb_build_object(
      'success',      false,
      'error',        'locked',
      'message',      'กรอก OTP ผิด 5 ครั้ง บัญชีถูกล็อค 15 นาที',
      'attempts',     v_new_attempts,
      'locked_until', now() + INTERVAL '15 minutes'
    );
  ELSE
    RETURN jsonb_build_object(
      'success',   false,
      'error',     'invalid',
      'message',   'รหัส OTP ไม่ถูกต้อง',
      'attempts',  v_new_attempts,
      'remaining', 5 - v_new_attempts
    );
  END IF;
END;
$$;
