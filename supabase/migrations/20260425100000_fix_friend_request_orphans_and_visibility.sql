-- Fix accept-friend-request flow when the sender's account is gone or the
-- recipient cannot see the sender's profile.
--
-- Two symptoms reported from the field:
--   1. Pending request shows "User undefined" because can_view_profile blocks
--      the recipient from reading the sender's display_name / user_code.
--   2. Tapping "ยอมรับ" returns "ไม่สามารถยอมรับคำขอได้" because
--      friend_requests.from_user_id has no FK to auth.users, so an orphan row
--      survives a sender deletion and the INSERT into public.friends violates
--      friends.friend_user_id REFERENCES auth.users(id).
--
-- Fixes below: clean up orphans, add cascading FKs so new orphans cannot form,
-- harden accept_friend_request to self-heal stale rows, and let the recipient
-- of a pending request see the sender's profile (one-directional, so the
-- BUG-RLS-24 harvesting concern stays addressed).

-- ============================================================
-- 1. Remove orphan friend_requests left behind by deleted users
-- ============================================================

DELETE FROM public.friend_requests fr
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = fr.from_user_id)
   OR NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = fr.to_user_id);

-- ============================================================
-- 2. Add cascading FKs so future deletions clean up automatically
-- ============================================================

ALTER TABLE public.friend_requests
  DROP CONSTRAINT IF EXISTS friend_requests_from_user_id_fkey,
  ADD  CONSTRAINT friend_requests_from_user_id_fkey
    FOREIGN KEY (from_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.friend_requests
  DROP CONSTRAINT IF EXISTS friend_requests_to_user_id_fkey,
  ADD  CONSTRAINT friend_requests_to_user_id_fkey
    FOREIGN KEY (to_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ============================================================
-- 3. Harden accept_friend_request against missing counterparties
-- ============================================================

CREATE OR REPLACE FUNCTION public.accept_friend_request(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.friend_requests%ROWTYPE;
  v_from_display_name text;
  v_from_user_code text;
  v_to_display_name text;
  v_to_user_code text;
  v_from_user_exists boolean;
  v_to_user_exists boolean;
  v_inserted_count integer := 0;
  v_rows_inserted integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT *
  INTO v_request
  FROM public.friend_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Friend request not found';
  END IF;

  IF v_request.to_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'Friend request is not pending';
  END IF;

  -- Defensive check: the FK added above should make this impossible going
  -- forward, but legacy rows or in-flight deletions could still leave one
  -- side missing. Self-heal by deleting the request and surfacing a clean
  -- error instead of letting the friends INSERT raise a FK violation that
  -- the client surfaces as the generic "ไม่สามารถยอมรับคำขอได้".
  SELECT EXISTS (SELECT 1 FROM auth.users WHERE id = v_request.from_user_id)
    INTO v_from_user_exists;
  SELECT EXISTS (SELECT 1 FROM auth.users WHERE id = v_request.to_user_id)
    INTO v_to_user_exists;

  IF NOT v_from_user_exists OR NOT v_to_user_exists THEN
    DELETE FROM public.friend_requests WHERE id = p_request_id;
    RAISE EXCEPTION 'Friend request counterparty no longer exists';
  END IF;

  SELECT display_name, user_code
  INTO v_from_display_name, v_from_user_code
  FROM public.profiles
  WHERE user_id = v_request.from_user_id;

  SELECT display_name, user_code
  INTO v_to_display_name, v_to_user_code
  FROM public.profiles
  WHERE user_id = v_request.to_user_id;

  INSERT INTO public.friends (user_id, friend_user_id, friend_name)
  VALUES (
    v_request.to_user_id,
    v_request.from_user_id,
    COALESCE(NULLIF(v_from_display_name, ''), 'User ' || COALESCE(v_from_user_code, 'Unknown'))
  )
  ON CONFLICT (user_id, friend_user_id) DO NOTHING;
  GET DIAGNOSTICS v_rows_inserted = ROW_COUNT;
  v_inserted_count := v_inserted_count + v_rows_inserted;

  INSERT INTO public.friends (user_id, friend_user_id, friend_name)
  VALUES (
    v_request.from_user_id,
    v_request.to_user_id,
    COALESCE(NULLIF(v_to_display_name, ''), 'User ' || COALESCE(v_to_user_code, 'Unknown'))
  )
  ON CONFLICT (user_id, friend_user_id) DO NOTHING;
  GET DIAGNOSTICS v_rows_inserted = ROW_COUNT;
  v_inserted_count := v_inserted_count + v_rows_inserted;

  UPDATE public.friend_requests
  SET status = 'accepted'
  WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'success', true,
    'request_id', p_request_id,
    'friends_created', v_inserted_count
  );
END;
$$;

-- ============================================================
-- 4. Let the recipient of a pending request read the sender's profile
--
-- BUG-RLS-24 removed the bidirectional pending-request clause to stop senders
-- from harvesting profiles by spamming requests. Re-add the clause but limit
-- it to the recipient's perspective: a sender voluntarily reveals themselves
-- by initiating the request, and the recipient legitimately needs the name
-- and user_code to decide whether to accept.
-- ============================================================

CREATE OR REPLACE FUNCTION public.can_view_profile(target_user_id uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
  SELECT
    auth.uid() = target_user_id
    OR EXISTS (
      SELECT 1
      FROM public.friends
      WHERE user_id = auth.uid()
        AND friend_user_id = target_user_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.debt_agreements
      WHERE borrower_id = auth.uid()
        AND lender_id = target_user_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.debt_agreements
      WHERE lender_id = auth.uid()
        AND borrower_id = target_user_id
        AND borrower_confirmed = true
    )
    OR EXISTS (
      -- Recipient of a still-pending friend request can see who is asking.
      -- Direction matters: the sender does NOT get reciprocal visibility,
      -- which preserves the BUG-RLS-24 anti-harvest property.
      SELECT 1
      FROM public.friend_requests
      WHERE to_user_id = auth.uid()
        AND from_user_id = target_user_id
        AND status = 'pending'
    )
$$;

COMMENT ON FUNCTION public.can_view_profile IS
  'Profile visibility: owner, confirmed friend, debt counterparty, or '
  'recipient of a still-pending friend request from target_user_id. '
  'Sender visibility into recipient profiles remains blocked (BUG-RLS-24).';
