-- BUG-RLS-05: log_activity SECURITY DEFINER function did not verify that the
-- caller is the same user as p_user_id, allowing any authenticated user to
-- supply an arbitrary user_id and generate false suspicious-activity flags
-- visible to admins (false-flag attack).
--
-- Fix: Replace the function body so that when called by a regular authenticated
-- user the function enforces auth.uid() = p_user_id.  Service-role callers
-- (internal system calls) are still permitted to log on behalf of any user.

CREATE OR REPLACE FUNCTION public.log_activity(
  p_user_id UUID,
  p_action_type TEXT,
  p_action_category TEXT DEFAULT 'general',
  p_metadata JSONB DEFAULT '{}',
  p_is_suspicious BOOLEAN DEFAULT false
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_log_id    UUID;
  v_caller_id UUID  := auth.uid();
  v_role      TEXT  := COALESCE(auth.role(), '');
BEGIN
  -- BUG-RLS-05 fix: only service_role may log on behalf of another user;
  -- a regular authenticated caller must always match p_user_id.
  IF p_user_id IS NOT NULL
     AND v_role <> 'service_role'
     AND (v_caller_id IS NULL OR v_caller_id <> p_user_id)
  THEN
    RAISE EXCEPTION 'permission denied: caller may not log activity for another user';
  END IF;

  INSERT INTO public.activity_logs (
    user_id,
    action_type,
    action_category,
    metadata,
    is_suspicious
  ) VALUES (
    p_user_id,
    p_action_type,
    p_action_category,
    p_metadata,
    p_is_suspicious
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

COMMENT ON FUNCTION public.log_activity IS
  'Logs user activity. Enforces auth.uid() = p_user_id for authenticated callers '
  '(service_role may log on behalf of any user). BUG-RLS-05 fix.';
