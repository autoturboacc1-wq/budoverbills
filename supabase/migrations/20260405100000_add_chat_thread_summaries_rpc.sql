-- Consolidate chat thread summary and unread count lookup into a single server-side path.
-- This keeps the client from scanning every message just to build the inbox and friend badges.

CREATE OR REPLACE FUNCTION public.get_chat_thread_summaries()
RETURNS TABLE (
  chat_id uuid,
  chat_type text,
  agreement_id uuid,
  direct_chat_id uuid,
  room_type text,
  has_pending_action boolean,
  pending_action_type text,
  pending_action_for uuid,
  counterparty_id uuid,
  counterparty_name text,
  counterparty_avatar text,
  last_message text,
  last_message_at timestamptz,
  unread_count integer,
  role text,
  agreement_status text,
  principal_amount double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH agreement_threads AS (
    SELECT
      da.id AS chat_id,
      'agreement'::text AS chat_type,
      da.id AS agreement_id,
      NULL::uuid AS direct_chat_id,
      COALESCE(cr.room_type::text, 'agreement') AS room_type,
      COALESCE(cr.has_pending_action, false) AS has_pending_action,
      COALESCE(cr.pending_action_type::text, 'none') AS pending_action_type,
      cr.pending_action_for,
      CASE
        WHEN da.lender_id = auth.uid() THEN da.borrower_id
        ELSE da.lender_id
      END AS counterparty_id,
      COALESCE(cp.display_name, da.borrower_name, 'ผู้ยืม') AS counterparty_name,
      cp.avatar_url AS counterparty_avatar,
      cr.last_message,
      cr.last_message_at,
      COALESCE((
        SELECT count(*)::int
        FROM public.messages m
        WHERE m.agreement_id = da.id
          AND m.sender_id <> auth.uid()
          AND m.read_at IS NULL
      ), 0) AS unread_count,
      CASE
        WHEN da.lender_id = auth.uid() THEN 'lender'
        ELSE 'borrower'
      END AS role,
      da.status::text AS agreement_status,
      da.principal_amount::double precision AS principal_amount
    FROM public.debt_agreements da
    LEFT JOIN public.chat_rooms cr
      ON cr.agreement_id = da.id
    LEFT JOIN public.profiles cp
      ON cp.user_id = CASE
        WHEN da.lender_id = auth.uid() THEN da.borrower_id
        ELSE da.lender_id
      END
    WHERE auth.uid() IS NOT NULL
      AND auth.uid() IN (da.lender_id, da.borrower_id)
      AND da.status IN ('active', 'pending_confirmation')
  ),
  direct_threads AS (
    SELECT
      dc.id AS chat_id,
      'direct'::text AS chat_type,
      NULL::uuid AS agreement_id,
      dc.id AS direct_chat_id,
      COALESCE(cr.room_type::text, 'casual') AS room_type,
      COALESCE(cr.has_pending_action, false) AS has_pending_action,
      COALESCE(cr.pending_action_type::text, 'none') AS pending_action_type,
      cr.pending_action_for,
      CASE
        WHEN dc.user1_id = auth.uid() THEN dc.user2_id
        ELSE dc.user1_id
      END AS counterparty_id,
      COALESCE(cp.display_name, 'ผู้ใช้') AS counterparty_name,
      cp.avatar_url AS counterparty_avatar,
      cr.last_message,
      cr.last_message_at,
      COALESCE((
        SELECT count(*)::int
        FROM public.messages m
        WHERE m.direct_chat_id = dc.id
          AND m.sender_id <> auth.uid()
          AND m.read_at IS NULL
      ), 0) AS unread_count,
      NULL::text AS role,
      NULL::text AS agreement_status,
      NULL::double precision AS principal_amount
    FROM public.direct_chats dc
    LEFT JOIN public.chat_rooms cr
      ON cr.direct_chat_id = dc.id
    LEFT JOIN public.profiles cp
      ON cp.user_id = CASE
        WHEN dc.user1_id = auth.uid() THEN dc.user2_id
        ELSE dc.user1_id
      END
    WHERE auth.uid() IS NOT NULL
      AND auth.uid() IN (dc.user1_id, dc.user2_id)
  )
  SELECT * FROM agreement_threads
  UNION ALL
  SELECT * FROM direct_threads;
$$;

REVOKE ALL ON FUNCTION public.get_chat_thread_summaries() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_chat_thread_summaries() TO authenticated;

CREATE INDEX IF NOT EXISTS idx_messages_agreement_unread
  ON public.messages(agreement_id)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_messages_direct_chat_unread
  ON public.messages(direct_chat_id)
  WHERE read_at IS NULL;
