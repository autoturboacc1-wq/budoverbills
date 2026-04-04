-- Harden remaining social/chat policy gaps and make typing upserts conflict-safe.

DROP POLICY IF EXISTS "Recipients can update requests" ON public.friend_requests;
CREATE POLICY "Recipients can update requests"
ON public.friend_requests
FOR UPDATE
USING (auth.uid() = to_user_id)
WITH CHECK (auth.uid() = to_user_id);

CREATE OR REPLACE FUNCTION public.enforce_friend_request_update_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF NEW.from_user_id IS DISTINCT FROM OLD.from_user_id
    OR NEW.to_user_id IS DISTINCT FROM OLD.to_user_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Friend request participants are immutable';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_friend_request_update_integrity_trigger ON public.friend_requests;
CREATE TRIGGER enforce_friend_request_update_integrity_trigger
BEFORE UPDATE ON public.friend_requests
FOR EACH ROW
EXECUTE FUNCTION public.enforce_friend_request_update_integrity();

DROP POLICY IF EXISTS "Users can update their own chat rooms" ON public.chat_rooms;
DROP POLICY IF EXISTS "System can insert chat rooms" ON public.chat_rooms;

CREATE POLICY "Service role can insert chat rooms"
ON public.chat_rooms
FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY "Service role can update chat rooms"
ON public.chat_rooms
FOR UPDATE
TO service_role
USING (true)
WITH CHECK (true);

ALTER TABLE public.chat_typing
DROP CONSTRAINT IF EXISTS chat_typing_direct_chat_user_unique;

ALTER TABLE public.chat_typing
ADD CONSTRAINT chat_typing_direct_chat_user_unique
UNIQUE (direct_chat_id, user_id);
