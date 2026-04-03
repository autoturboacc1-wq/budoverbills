-- Harden admin role mutation flow behind SECURITY DEFINER RPCs.

DROP POLICY IF EXISTS "Only admins can manage roles" ON public.user_roles;

DROP FUNCTION IF EXISTS public.grant_user_role(uuid, app_role);
DROP FUNCTION IF EXISTS public.revoke_user_role(uuid, app_role);

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
