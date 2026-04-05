-- BUG-CHAT-05: The original 20260404210000 migration created a partial UNIQUE
-- INDEX (WHERE direct_chat_id IS NOT NULL AND agreement_id IS NULL) instead of
-- a full UNIQUE constraint.  PostgREST's ON CONFLICT path requires a real table
-- constraint, not a partial index, so upserts silently inserted duplicate rows
-- and typing status got stuck.
--
-- Fix: drop the partial index if it still exists, then (re-)create a full
-- UNIQUE constraint that covers the same columns.  The constraint may already
-- exist from 20260406170000; the IF NOT EXISTS / DROP CONSTRAINT IF EXISTS
-- guards make this migration safe to run in any environment state.

-- 1. Drop the partial index created by the original migration (no-op if the
--    index was already replaced by the later constraint migration).
DROP INDEX IF EXISTS public.chat_typing_direct_chat_user_unique_idx;

-- 2. Re-create the full constraint idempotently.
ALTER TABLE public.chat_typing
DROP CONSTRAINT IF EXISTS chat_typing_direct_chat_user_unique;

ALTER TABLE public.chat_typing
ADD CONSTRAINT chat_typing_direct_chat_user_unique
UNIQUE (direct_chat_id, user_id);
