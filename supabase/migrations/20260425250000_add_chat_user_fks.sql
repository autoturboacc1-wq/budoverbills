-- Add foreign-key constraints from direct_chats / chat_rooms participant
-- columns to auth.users(id). Without these, deleting an auth user leaves
-- orphan rows that the participant-checked RLS policies still match against
-- via auth.uid() (i.e. they don't match), but the rows pile up and
-- get_chat_thread_summaries can return rooms whose counterparty no longer
-- exists. Adding ON DELETE CASCADE keeps the schema self-cleaning.
--
-- Migration is split into:
--   1. Clean up existing orphans (direct_chats/chat_rooms referring to
--      missing auth.users rows). This must happen first or the ALTER TABLE
--      will fail on legacy data.
--   2. Add the FK constraints (idempotent — IF NOT EXISTS guard via DO
--      block).
--
-- The RPC create_direct_chat_room (latest definition in
-- 20260425160000_repair_chat_read_and_direct_rooms.sql) already uses
-- LEAST/GREATEST and ON CONFLICT, so no RPC changes are needed.

-- ============================================================
-- 1. Cleanup orphan rows
-- ============================================================

DELETE FROM public.chat_rooms cr
WHERE cr.user1_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = cr.user1_id);

DELETE FROM public.chat_rooms cr
WHERE cr.user2_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = cr.user2_id);

DELETE FROM public.direct_chats dc
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = dc.user1_id)
   OR NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = dc.user2_id);

-- ============================================================
-- 2. Add FK constraints (idempotent)
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'direct_chats_user1_id_fkey'
      AND conrelid = 'public.direct_chats'::regclass
  ) THEN
    ALTER TABLE public.direct_chats
      ADD CONSTRAINT direct_chats_user1_id_fkey
      FOREIGN KEY (user1_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'direct_chats_user2_id_fkey'
      AND conrelid = 'public.direct_chats'::regclass
  ) THEN
    ALTER TABLE public.direct_chats
      ADD CONSTRAINT direct_chats_user2_id_fkey
      FOREIGN KEY (user2_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chat_rooms_user1_id_fkey'
      AND conrelid = 'public.chat_rooms'::regclass
  ) THEN
    ALTER TABLE public.chat_rooms
      ADD CONSTRAINT chat_rooms_user1_id_fkey
      FOREIGN KEY (user1_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chat_rooms_user2_id_fkey'
      AND conrelid = 'public.chat_rooms'::regclass
  ) THEN
    ALTER TABLE public.chat_rooms
      ADD CONSTRAINT chat_rooms_user2_id_fkey
      FOREIGN KEY (user2_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;
