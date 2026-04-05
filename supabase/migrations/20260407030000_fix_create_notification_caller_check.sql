-- BUG-RLS-01: Harden create_notification SECURITY DEFINER function.
--
-- Previous version allowed a session-level GUC (app.notification_source)
-- to bypass caller checks, meaning any authenticated user could call
--   SET app.notification_source = 'system';
--   SELECT create_notification('<victim_uuid>', ...);
-- to inject fake notifications into another user's inbox.
--
-- Fix: Remove the spoofable GUC bypass entirely.
-- Allowed callers are now:
--   1. auth.uid() IS NULL  — trigger / service-role context (no JWT).
--   2. auth.uid() = p_user_id — a user creating a notification for themselves.
--   3. auth.role() = 'service_role' — Supabase service-role key (server-to-server).
-- Cross-user notifications (lender → borrower, etc.) must originate from
-- SECURITY DEFINER trigger functions that run without an auth.uid() context,
-- not from direct RPC calls.

CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id     UUID,
  p_type        TEXT,
  p_title       TEXT,
  p_message     TEXT,
  p_related_type TEXT DEFAULT NULL,
  p_related_id  UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notification_id UUID;
  v_actor_id        UUID := auth.uid();
  v_actor_role      TEXT := COALESCE(auth.role(), '');
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Notification target user_id is required';
  END IF;

  -- Allow only:
  --   • trigger / internal context  (v_actor_id IS NULL)
  --   • service_role key            (v_actor_role = 'service_role')
  --   • user creating for themselves (v_actor_id = p_user_id)
  -- Reject everything else, including authenticated users targeting another user.
  IF v_actor_id IS NOT NULL
     AND v_actor_role <> 'service_role'
     AND v_actor_id <> p_user_id
  THEN
    RAISE EXCEPTION 'permission denied: callers may only create notifications for themselves';
  END IF;

  INSERT INTO public.notifications (user_id, type, title, message, related_type, related_id)
  VALUES (p_user_id, p_type, p_title, p_message, p_related_type, p_related_id)
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$$;

-- Revoke direct execute from authenticated users so the function can only be
-- reached via SECURITY DEFINER trigger chains or the service role.
-- (anon / authenticated roles must not call this directly for other users.)
REVOKE EXECUTE ON FUNCTION public.create_notification(UUID, TEXT, TEXT, TEXT, TEXT, UUID)
  FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_notification(UUID, TEXT, TEXT, TEXT, TEXT, UUID)
  TO authenticated, anon;
-- The GRANT above re-allows the call so self-notification still works from the
-- client via supabase-js; the body-level permission check rejects cross-user
-- calls regardless.
