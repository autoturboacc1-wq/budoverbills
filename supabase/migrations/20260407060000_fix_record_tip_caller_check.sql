-- BUG-RLS-06: record_tip does not validate auth.uid() = p_user_id
-- Any authenticated user could forge tip records attributed to other users.
-- Fix: Replace the function with a strict caller check.

CREATE OR REPLACE FUNCTION public.record_tip(
  p_user_id uuid,
  p_amount numeric,
  p_currency text DEFAULT 'THB',
  p_message text DEFAULT NULL,
  p_display_name text DEFAULT NULL,
  p_is_anonymous boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tip_id uuid;
  v_actor_role text := COALESCE(auth.role(), '');
BEGIN
  -- Allow service_role to record tips on behalf of any user (e.g. webhooks).
  -- All other callers must be the user they are recording a tip for.
  IF v_actor_role <> 'service_role' AND auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'permission denied: cannot record tip for another user';
  END IF;

  INSERT INTO public.tips (user_id, amount, currency, message, display_name, is_anonymous, status)
  VALUES (p_user_id, p_amount, p_currency, p_message, p_display_name, p_is_anonymous, 'completed')
  RETURNING id INTO v_tip_id;

  RETURN v_tip_id;
END;
$$;
