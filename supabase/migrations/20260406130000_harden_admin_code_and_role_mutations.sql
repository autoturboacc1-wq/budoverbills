-- Remove the historical bootstrap admin code so a leaked credential cannot be reused.
DELETE FROM public.admin_codes
WHERE code_name = 'Default Admin';

CREATE OR REPLACE FUNCTION public.verify_admin_code(p_code TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code_record RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'กรุณาเข้าสู่ระบบก่อน');
  END IF;

  IF p_code IS NULL OR length(trim(p_code)) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'รหัสไม่ถูกต้องหรือหมดอายุ');
  END IF;

  SELECT *
  INTO v_code_record
  FROM public.admin_codes
  WHERE code_hash = crypt(p_code, code_hash)
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now());

  IF v_code_record IS NULL THEN
    INSERT INTO public.activity_logs (user_id, action_type, action_category, is_suspicious)
    VALUES (auth.uid(), 'admin_code_failed', 'admin', true);

    RETURN jsonb_build_object('success', false, 'error', 'รหัสไม่ถูกต้องหรือหมดอายุ');
  END IF;

  UPDATE public.admin_codes
  SET last_used_at = now()
  WHERE id = v_code_record.id;

  INSERT INTO public.activity_logs (user_id, action_type, action_category, metadata)
  VALUES (
    auth.uid(),
    'admin_code_verified',
    'admin',
    jsonb_build_object('code_name', v_code_record.code_name, 'role', v_code_record.role)
  );

  RETURN jsonb_build_object(
    'success', true,
    'code_name', v_code_record.code_name,
    'role', v_code_record.role
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_and_send_admin_otp(p_user_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_otp TEXT;
  v_user_email TEXT;
  v_actor_id UUID := auth.uid();
BEGIN
  IF v_actor_id IS NULL OR v_actor_id <> p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'ไม่มีสิทธิ์');
  END IF;

  IF NOT public.has_role(p_user_id, 'admin') AND NOT public.has_role(p_user_id, 'moderator') THEN
    RETURN jsonb_build_object('success', false, 'error', 'ไม่มีสิทธิ์');
  END IF;

  SELECT email INTO v_user_email
  FROM auth.users
  WHERE id = p_user_id;

  IF v_user_email IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'ไม่พบอีเมลผู้ใช้');
  END IF;

  v_otp := public.generate_admin_otp(p_user_id);

  INSERT INTO public.activity_logs (user_id, action_type, action_category, metadata)
  VALUES (
    p_user_id,
    'admin_otp_generated',
    'admin',
    jsonb_build_object(
      'email', v_user_email,
      'sent_at', now(),
      'otp_hash', encode(sha256(v_otp::bytea), 'hex')
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'OTP ถูกส่งไปยังอีเมลของคุณแล้ว',
    'email', substring(v_user_email, 1, 3) || '***@' || split_part(v_user_email, '@', 2)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_user_role_mutation_via_rpc()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF COALESCE(current_setting('app.role_mutation_source', true), '') <> 'rpc' THEN
    RAISE EXCEPTION 'Role mutations must use RPCs';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_user_role_mutation_via_rpc_trigger ON public.user_roles;
CREATE TRIGGER enforce_user_role_mutation_via_rpc_trigger
BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_user_role_mutation_via_rpc();

CREATE OR REPLACE FUNCTION public.grant_user_role(p_user_id uuid, p_role app_role)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_inserted integer;
BEGIN
  IF v_actor_id IS NULL OR NOT public.has_role(v_actor_id, 'admin') THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  IF p_role NOT IN ('admin', 'moderator') THEN
    RAISE EXCEPTION 'Invalid role';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('public.user_roles.role_mutation_guard'));
  PERFORM set_config('app.role_mutation_source', 'rpc', true);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_user_id, p_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'role_exists',
      'message', 'ผู้ใช้มีสิทธิ์นี้อยู่แล้ว'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'เพิ่มสิทธิ์สำเร็จ'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_user_role(p_user_id uuid, p_role app_role)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_admin_count integer;
  v_deleted integer;
BEGIN
  IF v_actor_id IS NULL OR NOT public.has_role(v_actor_id, 'admin') THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  IF p_role NOT IN ('admin', 'moderator') THEN
    RAISE EXCEPTION 'Invalid role';
  END IF;

  IF p_user_id = v_actor_id AND p_role = 'admin' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'self_demote_blocked',
      'message', 'ไม่สามารถถอดสิทธิ์ Admin ของตัวเองได้'
    );
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('public.user_roles.role_mutation_guard'));
  PERFORM set_config('app.role_mutation_source', 'rpc', true);

  IF p_role = 'admin' THEN
    SELECT COUNT(*)
    INTO v_admin_count
    FROM public.user_roles
    WHERE role = 'admin';

    IF v_admin_count <= 1 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'last_admin',
        'message', 'ต้องมี Admin อย่างน้อย 1 คน'
      );
    END IF;
  END IF;

  DELETE FROM public.user_roles
  WHERE user_id = p_user_id
    AND role = p_role;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'role_not_found',
      'message', 'ไม่พบสิทธิ์นี้ของผู้ใช้'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'ถอดสิทธิ์สำเร็จ'
  );
END;
$$;
