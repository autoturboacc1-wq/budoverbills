-- BUG-RLS-11: Restrict chat_rooms INSERT to prevent fake debt-room injection.
--
-- The previous policy allowed any authenticated user to INSERT a chat_room as
-- long as they were user1_id or user2_id — meaning an attacker could create a
-- fake "debt" room and push it into anyone's inbox.
--
-- Fix: remove all direct-user INSERT policies and restrict room creation to:
--   1. service_role (already set by migration 20260406170000), AND
--   2. a SECURITY DEFINER RPC (create_direct_chat_room) that validates the
--      caller is one of the participants and that a mutual friendship exists.
--
-- Agreement-based rooms are created exclusively by the
-- sync_chat_room_from_agreement / sync_chat_room_from_direct_chat triggers
-- which run as SECURITY DEFINER — they are unaffected.

-- Drop any remaining permissive INSERT policies on chat_rooms
DROP POLICY IF EXISTS "System can insert chat rooms"         ON public.chat_rooms;
DROP POLICY IF EXISTS "Users can update their own chat rooms" ON public.chat_rooms;
DROP POLICY IF EXISTS "Service role can insert chat rooms"   ON public.chat_rooms;

-- Re-create the service_role-only INSERT policy (idempotent)
CREATE POLICY "Service role can insert chat rooms"
ON public.chat_rooms
FOR INSERT
TO service_role
WITH CHECK (true);

-- SECURITY DEFINER RPC: authenticated users call this to open a direct chat.
-- Validates:
--   • caller is one of the two participants
--   • a mutual/accepted friendship exists between them
-- The actual INSERT uses the trigger (sync_chat_room_from_direct_chat) running
-- as SECURITY DEFINER, so no direct INSERT policy is needed for regular users.
CREATE OR REPLACE FUNCTION public.create_direct_chat_room(p_other_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id   UUID := auth.uid();
  v_dc_id       UUID;
  v_friendship  RECORD;
BEGIN
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  IF p_other_user_id IS NULL OR p_other_user_id = v_caller_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_participant');
  END IF;

  -- Require an accepted friendship between the two users
  SELECT *
  INTO   v_friendship
  FROM   public.friend_requests
  WHERE  status = 'accepted'
    AND  (
           (from_user_id = v_caller_id AND to_user_id = p_other_user_id)
        OR (from_user_id = p_other_user_id AND to_user_id = v_caller_id)
         )
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_friends',
                              'message', 'ต้องเป็นเพื่อนกันก่อนจึงจะสร้าง chat ได้');
  END IF;

  -- Check for an existing direct_chat between these two users
  SELECT id
  INTO   v_dc_id
  FROM   public.direct_chats
  WHERE  (user1_id = v_caller_id AND user2_id = p_other_user_id)
      OR (user1_id = p_other_user_id AND user2_id = v_caller_id)
  LIMIT 1;

  IF v_dc_id IS NULL THEN
    -- Insert a new direct_chat; the trigger will create the chat_room
    INSERT INTO public.direct_chats (user1_id, user2_id)
    VALUES (v_caller_id, p_other_user_id)
    RETURNING id INTO v_dc_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'direct_chat_id', v_dc_id);
END;
$$;
