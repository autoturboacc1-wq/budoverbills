CREATE TABLE IF NOT EXISTS public.admin_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_token_hash text NOT NULL UNIQUE,
  verified_via text NOT NULL CHECK (verified_via IN ('otp', 'code')),
  code_name text,
  code_role public.app_role,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own admin sessions" ON public.admin_sessions;
CREATE POLICY "Users can view own admin sessions"
ON public.admin_sessions
FOR SELECT
USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.issue_admin_session(
  p_user_id uuid,
  p_verified_via text,
  p_code_name text DEFAULT NULL,
  p_code_role public.app_role DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF NOT public.has_role(p_user_id, 'admin') AND NOT public.has_role(p_user_id, 'moderator') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  UPDATE public.admin_sessions
  SET revoked_at = now()
  WHERE user_id = p_user_id
    AND revoked_at IS NULL
    AND expires_at > now();

  v_token := encode(gen_random_bytes(32), 'hex');

  INSERT INTO public.admin_sessions (
    user_id,
    session_token_hash,
    verified_via,
    code_name,
    code_role
  ) VALUES (
    p_user_id,
    encode(digest(v_token, 'sha256'), 'hex'),
    p_verified_via,
    p_code_name,
    p_code_role
  );

  RETURN jsonb_build_object(
    'success', true,
    'session_token', v_token,
    'verified_via', p_verified_via,
    'code_name', p_code_name,
    'code_role', p_code_role,
    'expires_in_seconds', 1800
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_admin_otp_and_issue_session(
  p_user_id uuid,
  p_otp text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.verify_admin_otp(p_user_id, p_otp);

  IF COALESCE((v_result ->> 'success')::boolean, false) IS NOT TRUE THEN
    RETURN v_result;
  END IF;

  RETURN public.issue_admin_session(p_user_id, 'otp');
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_admin_code_and_issue_session(
  p_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_result jsonb;
  v_role_text text;
  v_role public.app_role;
  v_code_name text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_result := public.verify_admin_code(p_code);

  IF COALESCE((v_result ->> 'success')::boolean, false) IS NOT TRUE THEN
    RETURN v_result;
  END IF;

  v_role_text := v_result ->> 'role';
  v_code_name := v_result ->> 'code_name';
  v_role := v_role_text::public.app_role;

  IF v_role NOT IN ('admin', 'moderator') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_role');
  END IF;

  RETURN public.issue_admin_session(v_user_id, 'code', v_code_name, v_role);
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_admin_session(
  p_session_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.admin_sessions%ROWTYPE;
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL OR p_session_token IS NULL OR length(trim(p_session_token)) = 0 THEN
    RETURN jsonb_build_object('valid', false);
  END IF;

  SELECT *
  INTO v_session
  FROM public.admin_sessions
  WHERE user_id = v_user_id
    AND session_token_hash = encode(digest(p_session_token, 'sha256'), 'hex')
    AND revoked_at IS NULL
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false);
  END IF;

  IF NOT public.has_role(v_user_id, 'admin') AND NOT public.has_role(v_user_id, 'moderator') THEN
    UPDATE public.admin_sessions
    SET revoked_at = now()
    WHERE id = v_session.id;

    RETURN jsonb_build_object('valid', false);
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'verified_via', v_session.verified_via,
    'code_name', v_session.code_name,
    'code_role', v_session.code_role,
    'expires_at', v_session.expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_admin_session(
  p_session_token text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_session_token IS NULL OR length(trim(p_session_token)) = 0 THEN
    RETURN false;
  END IF;

  UPDATE public.admin_sessions
  SET revoked_at = now()
  WHERE user_id = auth.uid()
    AND session_token_hash = encode(digest(p_session_token, 'sha256'), 'hex')
    AND revoked_at IS NULL;

  RETURN FOUND;
END;
$$;
