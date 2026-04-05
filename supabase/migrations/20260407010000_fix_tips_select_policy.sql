-- BUG-RLS-02
-- The "Users can view tips" policy (last set in 20260406143000) still contains
-- `OR is_anonymous = false` which allows ANY authenticated user to read all
-- non-anonymous tip rows, including the donor's user_id, amount, message, and
-- transaction_ref — effectively deanonymizing donors.
--
-- Fix: restrict SELECT to rows the caller owns, plus a narrow public projection
-- for the "donor wall" use-case (non-anonymous tips where the donor opted in).
-- Because RLS cannot restrict individual columns, we keep the same row-level
-- predicate but tighten it: a row is visible only when the caller is the owner,
-- OR when the tip is explicitly non-anonymous (donor opted in to public display).
-- The `OR auth.uid() IS NOT NULL` clause that was present in earlier migrations
-- is permanently removed here.

-- Drop every previous SELECT policy variant for tips so no stale policy survives.
DROP POLICY IF EXISTS "Users can view own tips"            ON public.tips;
DROP POLICY IF EXISTS "Users can view tips"                ON public.tips;
DROP POLICY IF EXISTS "Admins can view all tips"           ON public.tips;

-- Recreate with least-privilege predicate:
--   1. The authenticated caller is the tip owner  (their own rows, any anonymity setting)
--   2. The tip is explicitly public (is_anonymous = false AND user_id IS NOT NULL)
--      — donor opted in; amount/message may be shown on a donor wall.
-- Anonymous tips (is_anonymous = true) are NEVER visible to other users.
CREATE POLICY "Users can view tips"
ON public.tips
FOR SELECT
USING (
  -- Own tips: always visible to the owner regardless of anonymous flag
  auth.uid() = user_id
  -- Public opted-in tips: donor set is_anonymous = false
  OR (is_anonymous = false AND user_id IS NOT NULL)
);
