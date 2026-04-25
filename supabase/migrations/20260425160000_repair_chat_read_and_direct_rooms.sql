-- Repair chat read-state and direct-room creation without rewriting earlier
-- migrations. This keeps message UPDATE hardening intact while giving clients a
-- narrow server-side path for read receipts.

-- ============================================================
-- 1. Mark chat messages read through a participant-checked RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.mark_chat_messages_read(
  p_agreement_id uuid DEFAULT NULL,
  p_direct_chat_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_updated_count integer := 0;
BEGIN
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  IF (p_agreement_id IS NULL AND p_direct_chat_id IS NULL)
     OR (p_agreement_id IS NOT NULL AND p_direct_chat_id IS NOT NULL) THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_target');
  END IF;

  IF p_agreement_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.debt_agreements da
      WHERE da.id = p_agreement_id
        AND (da.lender_id = v_caller_id OR da.borrower_id = v_caller_id)
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'not_participant');
    END IF;

    UPDATE public.messages
    SET read_at = now()
    WHERE agreement_id = p_agreement_id
      AND sender_id <> v_caller_id
      AND read_at IS NULL;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  ELSE
    IF NOT EXISTS (
      SELECT 1
      FROM public.direct_chats dc
      WHERE dc.id = p_direct_chat_id
        AND (dc.user1_id = v_caller_id OR dc.user2_id = v_caller_id)
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'not_participant');
    END IF;

    UPDATE public.messages
    SET read_at = now()
    WHERE direct_chat_id = p_direct_chat_id
      AND sender_id <> v_caller_id
      AND read_at IS NULL;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'updated_count', v_updated_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mark_chat_messages_read(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_chat_messages_read(uuid, uuid) TO authenticated;

-- ============================================================
-- 2. Fix direct chat room creation RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_direct_chat_room(p_other_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_user1_id uuid;
  v_user2_id uuid;
  v_direct_chat_id uuid;
BEGIN
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  IF p_other_user_id IS NULL OR p_other_user_id = v_caller_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_participant');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.friends f
    WHERE f.user_id = v_caller_id
      AND f.friend_user_id = p_other_user_id
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'not_friends',
      'message', 'ต้องเป็นเพื่อนกันก่อนจึงจะสร้าง chat ได้'
    );
  END IF;

  v_user1_id := LEAST(v_caller_id, p_other_user_id);
  v_user2_id := GREATEST(v_caller_id, p_other_user_id);

  INSERT INTO public.direct_chats (user1_id, user2_id)
  VALUES (v_user1_id, v_user2_id)
  ON CONFLICT (user1_id, user2_id) DO UPDATE
  SET updated_at = public.direct_chats.updated_at
  RETURNING id INTO v_direct_chat_id;

  INSERT INTO public.chat_rooms (
    direct_chat_id,
    room_type,
    user1_id,
    user2_id
  )
  VALUES (
    v_direct_chat_id,
    'casual',
    v_user1_id,
    v_user2_id
  )
  ON CONFLICT (direct_chat_id) DO NOTHING;

  RETURN jsonb_build_object(
    'success', true,
    'direct_chat_id', v_direct_chat_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_direct_chat_room(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_direct_chat_room(uuid) TO authenticated;

-- ============================================================
-- 3. Backfill missing chat_rooms and last-message metadata
-- ============================================================

INSERT INTO public.chat_rooms (
  agreement_id,
  room_type,
  has_pending_action,
  pending_action_type,
  pending_action_for,
  user1_id,
  user2_id
)
SELECT
  da.id,
  CASE
    WHEN da.status = 'active' AND EXISTS (
      SELECT 1
      FROM public.installments i
      WHERE i.agreement_id = da.id
        AND i.status IN ('pending', 'overdue', 'pending_confirmation')
    ) THEN 'debt'::public.chat_room_type
    ELSE 'agreement'::public.chat_room_type
  END,
  CASE
    WHEN da.status = 'pending_confirmation' THEN true
    WHEN da.status = 'active' AND EXISTS (
      SELECT 1
      FROM public.installments i
      WHERE i.agreement_id = da.id
        AND i.status IN ('pending', 'overdue', 'pending_confirmation')
    ) THEN true
    ELSE false
  END,
  CASE
    WHEN da.status = 'pending_confirmation' THEN 'confirm'::public.pending_action_type
    WHEN da.status = 'active' AND EXISTS (
      SELECT 1
      FROM public.installments i
      WHERE i.agreement_id = da.id
        AND i.status = 'pending_confirmation'
    ) THEN 'confirm'::public.pending_action_type
    WHEN da.status = 'active' AND EXISTS (
      SELECT 1
      FROM public.installments i
      WHERE i.agreement_id = da.id
        AND i.status IN ('pending', 'overdue')
    ) THEN 'pay'::public.pending_action_type
    ELSE 'none'::public.pending_action_type
  END,
  CASE
    WHEN da.status = 'pending_confirmation'
      THEN CASE WHEN da.borrower_confirmed THEN da.lender_id ELSE da.borrower_id END
    WHEN da.status = 'active' AND EXISTS (
      SELECT 1
      FROM public.installments i
      WHERE i.agreement_id = da.id
        AND i.status = 'pending_confirmation'
    ) THEN da.lender_id
    WHEN da.status = 'active' AND EXISTS (
      SELECT 1
      FROM public.installments i
      WHERE i.agreement_id = da.id
        AND i.status IN ('pending', 'overdue')
    ) THEN da.borrower_id
    ELSE NULL
  END,
  da.lender_id,
  COALESCE(da.borrower_id, da.lender_id)
FROM public.debt_agreements da
WHERE da.status IN ('active', 'pending_confirmation')
ON CONFLICT (agreement_id) DO NOTHING;

INSERT INTO public.chat_rooms (
  direct_chat_id,
  room_type,
  user1_id,
  user2_id
)
SELECT
  dc.id,
  'casual'::public.chat_room_type,
  dc.user1_id,
  dc.user2_id
FROM public.direct_chats dc
ON CONFLICT (direct_chat_id) DO NOTHING;

WITH latest_messages AS (
  SELECT DISTINCT ON (
    COALESCE(agreement_id, direct_chat_id),
    CASE WHEN agreement_id IS NOT NULL THEN 'agreement' ELSE 'direct' END
  )
    agreement_id,
    direct_chat_id,
    LEFT(content, 100) AS last_message,
    created_at AS last_message_at
  FROM public.messages
  ORDER BY
    COALESCE(agreement_id, direct_chat_id),
    CASE WHEN agreement_id IS NOT NULL THEN 'agreement' ELSE 'direct' END,
    created_at DESC
)
UPDATE public.chat_rooms cr
SET
  last_message = latest_messages.last_message,
  last_message_at = latest_messages.last_message_at,
  updated_at = now()
FROM latest_messages
WHERE (
    cr.agreement_id IS NOT NULL
    AND cr.agreement_id = latest_messages.agreement_id
  )
  OR (
    cr.direct_chat_id IS NOT NULL
    AND cr.direct_chat_id = latest_messages.direct_chat_id
  );
