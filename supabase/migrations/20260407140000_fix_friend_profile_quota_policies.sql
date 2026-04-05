-- Fix BUG-FRIEND-03, BUG-RLS-24, BUG-RLS-13
-- BUG-FRIEND-03: friend_requests UPDATE policy WITH CHECK must prevent from_user_id forgery
-- BUG-RLS-24: profiles SELECT policy must restrict to owner/friends/counterparties only (PDPA)
-- BUG-RLS-13: can_create_agreement_free must verify caller = p_user_id

-- ============================================================
-- BUG-FRIEND-03: Harden friend_requests UPDATE WITH CHECK
-- The existing trigger already blocks from_user_id changes, but
-- the policy layer should also enforce it independently.
-- ============================================================

DROP POLICY IF EXISTS "Recipients can update requests" ON public.friend_requests;
CREATE POLICY "Recipients can update requests"
ON public.friend_requests
FOR UPDATE
USING (auth.uid() = to_user_id)
WITH CHECK (
  auth.uid() = to_user_id
  AND from_user_id = (SELECT fr.from_user_id FROM public.friend_requests fr WHERE fr.id = friend_requests.id)
  AND to_user_id   = (SELECT fr.to_user_id   FROM public.friend_requests fr WHERE fr.id = friend_requests.id)
);

-- ============================================================
-- BUG-RLS-24: Restrict profiles SELECT to owner/friends/counterparties
-- Replace can_view_profile with a version that does NOT have the
-- broad "auth.uid() IS NOT NULL" shortcut, and update the policy.
-- ============================================================

CREATE OR REPLACE FUNCTION public.can_view_profile(target_user_id uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
  SELECT
    -- Own profile
    auth.uid() = target_user_id
    OR
    -- Confirmed friend (caller has target in their friends list)
    EXISTS (
      SELECT 1
      FROM public.friends
      WHERE user_id = auth.uid()
        AND friend_user_id = target_user_id
    )
    OR
    -- Borrower can always see their lender's profile
    EXISTS (
      SELECT 1
      FROM public.debt_agreements
      WHERE borrower_id = auth.uid()
        AND lender_id = target_user_id
    )
    OR
    -- Lender can see borrower's profile only after borrower confirms
    EXISTS (
      SELECT 1
      FROM public.debt_agreements
      WHERE lender_id = auth.uid()
        AND borrower_id = target_user_id
        AND borrower_confirmed = true
    )
$$;

COMMENT ON FUNCTION public.can_view_profile IS
  'BUG-RLS-24 fix: profile visibility requires ownership, confirmed friendship, '
  'or an active debt-agreement counterparty relationship. '
  'Unauthenticated callers always get false (auth.uid() IS NULL makes all EXISTS checks fail).';

-- Refresh the policy so PostgreSQL picks up the new function body
DROP POLICY IF EXISTS "Users can view related profiles" ON public.profiles;
CREATE POLICY "Users can view related profiles"
ON public.profiles
FOR SELECT
USING (public.can_view_profile(user_id));

-- ============================================================
-- BUG-RLS-13: Enforce caller = p_user_id in can_create_agreement_free
-- Replaces the version in 20260406150000 with an explicit
-- auth.uid() != p_user_id guard as specified in the bug report.
-- ============================================================

CREATE OR REPLACE FUNCTION public.can_create_agreement_free(p_user_id uuid)
  RETURNS jsonb
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_free_used  integer;
  v_free_limit integer := 2;
  v_credits    integer;
  v_actor_id   uuid := auth.uid();
  v_actor_role text := COALESCE(auth.role(), '');
BEGIN
  -- BUG-RLS-13: only the owning user or service_role may probe quota
  IF v_actor_role <> 'service_role' THEN
    IF v_actor_id IS NULL OR v_actor_id <> p_user_id THEN
      RAISE EXCEPTION 'permission denied';
    END IF;
  END IF;

  SELECT
    COALESCE(free_agreements_used, 0),
    COALESCE(agreement_credits, 0)
  INTO v_free_used, v_credits
  FROM public.profiles
  WHERE user_id = p_user_id;

  v_free_used := COALESCE(v_free_used, 0);
  v_credits   := COALESCE(v_credits, 0);

  RETURN jsonb_build_object(
    'can_create_free',  (v_free_used < v_free_limit) OR (v_credits > 0),
    'free_used',        v_free_used,
    'free_limit',       v_free_limit,
    'free_remaining',   GREATEST(0, v_free_limit - v_free_used),
    'credits',          v_credits,
    'total_available',  GREATEST(0, v_free_limit - v_free_used) + v_credits,
    'fee_amount',       25,
    'fee_currency',     'THB'
  );
END;
$$;
