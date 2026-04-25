-- Fix accept_friend_request failing with:
--   42P10 | there is no unique or exclusion constraint matching the
--           ON CONFLICT specification
--
-- The original harden migration declared:
--   CREATE UNIQUE INDEX IF NOT EXISTS friends_unique_pair_idx
--     ON public.friends (user_id, friend_user_id);
--
-- That index never made it onto production (most likely because duplicate
-- (user_id, friend_user_id) rows existed when the migration first ran, and
-- the IF NOT EXISTS variant let later steps proceed). Without the index,
-- the INSERT ... ON CONFLICT clauses inside accept_friend_request raise
-- 42P10, which surfaces in the UI as "ไม่สามารถยอมรับคำขอได้".
--
-- Fix:
--   1. Deduplicate any existing (user_id, friend_user_id) collisions,
--      keeping the oldest row so historical names/nicknames are preserved.
--   2. Add a real UNIQUE CONSTRAINT (named friends_user_id_friend_user_id_key)
--      that ON CONFLICT can always resolve, instead of relying on a bare
--      unique index that may be missing.
--   3. Rewrite accept_friend_request to use INSERT ... WHERE NOT EXISTS
--      so that even if the constraint is somehow dropped in the future, the
--      function does not blow up — it just becomes a no-op on the duplicate.

-- ============================================================
-- 1. Deduplicate friends rows so the unique constraint can be added
-- ============================================================

DELETE FROM public.friends f
USING public.friends keep
WHERE f.user_id = keep.user_id
  AND f.friend_user_id = keep.friend_user_id
  AND f.id <> keep.id
  AND keep.created_at <= f.created_at
  AND (keep.created_at < f.created_at OR keep.id < f.id);

-- ============================================================
-- 2. Add the canonical UNIQUE CONSTRAINT (drop any stale loose index first)
-- ============================================================

DROP INDEX IF EXISTS public.friends_unique_pair_idx;

ALTER TABLE public.friends
  DROP CONSTRAINT IF EXISTS friends_user_id_friend_user_id_key;

ALTER TABLE public.friends
  ADD CONSTRAINT friends_user_id_friend_user_id_key
  UNIQUE (user_id, friend_user_id);

-- ============================================================
-- 3. Make accept_friend_request resilient to ON CONFLICT loss
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
  v_from_friend_name text;
  v_to_friend_name text;
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

  v_from_friend_name := COALESCE(NULLIF(v_from_display_name, ''),
                                 'User ' || COALESCE(v_from_user_code, 'Unknown'));
  v_to_friend_name   := COALESCE(NULLIF(v_to_display_name, ''),
                                 'User ' || COALESCE(v_to_user_code, 'Unknown'));

  -- Use WHERE NOT EXISTS instead of ON CONFLICT so the function keeps
  -- working even if the unique constraint is ever dropped or replaced.
  INSERT INTO public.friends (user_id, friend_user_id, friend_name)
  SELECT v_request.to_user_id, v_request.from_user_id, v_from_friend_name
  WHERE NOT EXISTS (
    SELECT 1 FROM public.friends
    WHERE user_id = v_request.to_user_id
      AND friend_user_id = v_request.from_user_id
  );
  GET DIAGNOSTICS v_rows_inserted = ROW_COUNT;
  v_inserted_count := v_inserted_count + v_rows_inserted;

  INSERT INTO public.friends (user_id, friend_user_id, friend_name)
  SELECT v_request.from_user_id, v_request.to_user_id, v_to_friend_name
  WHERE NOT EXISTS (
    SELECT 1 FROM public.friends
    WHERE user_id = v_request.from_user_id
      AND friend_user_id = v_request.to_user_id
  );
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
