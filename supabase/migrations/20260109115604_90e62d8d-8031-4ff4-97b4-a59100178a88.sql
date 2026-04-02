-- Drop old function and recreate with new return type
DROP FUNCTION IF EXISTS public.verify_admin_otp(UUID, TEXT);

-- Recreate verify_admin_otp function with JSONB return type
CREATE OR REPLACE FUNCTION public.verify_admin_otp(p_user_id UUID, p_otp TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_otp_record RECORD;
BEGIN
  -- Get the OTP record
  SELECT * INTO v_otp_record
  FROM public.admin_otp
  WHERE user_id = p_user_id
  ORDER BY created_at DESC
  LIMIT 1;

  -- Check if record exists
  IF v_otp_record IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_otp', 'message', 'ไม่พบรหัส OTP');
  END IF;

  -- Check if locked
  IF v_otp_record.locked_until IS NOT NULL AND v_otp_record.locked_until > now() THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'locked', 
      'message', 'บัญชีถูกล็อคชั่วคราว กรุณารอ 15 นาที',
      'locked_until', v_otp_record.locked_until
    );
  END IF;

  -- Check if expired
  IF v_otp_record.expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'expired', 'message', 'รหัส OTP หมดอายุ');
  END IF;

  -- Check if already verified
  IF v_otp_record.verified = true THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_used', 'message', 'รหัส OTP ถูกใช้แล้ว');
  END IF;

  -- Verify OTP
  IF v_otp_record.otp_code = p_otp THEN
    -- Success - mark as verified and reset attempts
    UPDATE public.admin_otp
    SET verified = true, failed_attempts = 0, locked_until = NULL
    WHERE id = v_otp_record.id;
    
    RETURN jsonb_build_object('success', true, 'message', 'ยืนยันสำเร็จ');
  ELSE
    -- Failed attempt - increment counter
    UPDATE public.admin_otp
    SET 
      failed_attempts = failed_attempts + 1,
      locked_until = CASE 
        WHEN failed_attempts + 1 >= 3 THEN now() + interval '15 minutes'
        ELSE NULL
      END
    WHERE id = v_otp_record.id;
    
    -- Check if now locked
    IF v_otp_record.failed_attempts + 1 >= 3 THEN
      RETURN jsonb_build_object(
        'success', false, 
        'error', 'locked', 
        'message', 'กรอก OTP ผิด 3 ครั้ง บัญชีถูกล็อค 15 นาที',
        'attempts', v_otp_record.failed_attempts + 1,
        'locked_until', now() + interval '15 minutes'
      );
    ELSE
      RETURN jsonb_build_object(
        'success', false, 
        'error', 'invalid', 
        'message', 'รหัส OTP ไม่ถูกต้อง',
        'attempts', v_otp_record.failed_attempts + 1,
        'remaining', 3 - (v_otp_record.failed_attempts + 1)
      );
    END IF;
  END IF;
END;
$$;

-- Function to check lock status
CREATE OR REPLACE FUNCTION public.check_admin_lock_status(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_otp_record RECORD;
BEGIN
  SELECT * INTO v_otp_record
  FROM public.admin_otp
  WHERE user_id = p_user_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_otp_record IS NULL THEN
    RETURN jsonb_build_object('locked', false);
  END IF;

  IF v_otp_record.locked_until IS NOT NULL AND v_otp_record.locked_until > now() THEN
    RETURN jsonb_build_object(
      'locked', true, 
      'locked_until', v_otp_record.locked_until,
      'remaining_seconds', EXTRACT(EPOCH FROM (v_otp_record.locked_until - now()))::INTEGER
    );
  END IF;

  RETURN jsonb_build_object('locked', false, 'failed_attempts', v_otp_record.failed_attempts);
END;
$$;