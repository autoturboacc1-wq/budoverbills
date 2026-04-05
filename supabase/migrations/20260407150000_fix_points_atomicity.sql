-- ============================================================
-- Fix Points Atomicity: BUG-HOOK-05, BUG-POINTS-03, BUG-POINTS-04
-- ============================================================
-- BUG-HOOK-05: Ensure user_points row creation is idempotent (ON CONFLICT DO NOTHING)
--              The earn_points / redeem_points RPCs already do this, but this migration
--              re-establishes the UNIQUE constraint explicitly so client-side upserts work.
-- BUG-POINTS-03: redeem_points uses SELECT ... FOR UPDATE to prevent double-spend.
--              Replaces any prior version with an authoritative definition.
-- BUG-POINTS-04: Daily reset is moved fully server-side inside earn_points / redeem_points.
--              The client no longer performs resets; the RPCs handle it atomically.
-- ============================================================

-- Ensure the UNIQUE constraint on user_points(user_id) exists (needed for upsert ignoreDuplicates)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.user_points'::regclass
      AND contype = 'u'
      AND conname = 'user_points_user_id_key'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.user_points'::regclass
      AND contype = 'p'
      AND array_length(conkey, 1) = 1
      AND (
        SELECT attname FROM pg_attribute
        WHERE attrelid = 'public.user_points'::regclass
          AND attnum = conkey[1]
      ) = 'user_id'
  ) THEN
    ALTER TABLE public.user_points ADD CONSTRAINT user_points_user_id_key UNIQUE (user_id);
  END IF;
END;
$$;

-- ============================================================
-- redeem_points: atomic, locked redemption (BUG-POINTS-03)
-- Uses SELECT ... FOR UPDATE to serialize concurrent redemption
-- attempts and prevent double-spend across multiple browser tabs.
-- Daily reset is also handled here server-side (BUG-POINTS-04).
-- ============================================================
CREATE OR REPLACE FUNCTION public.redeem_points(
  p_user_id uuid,
  p_points integer,
  p_reward_type text,
  p_reward_value text,
  p_description text DEFAULT NULL,
  p_reference_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_points_row public.user_points%ROWTYPE;
  v_today      date := (now() AT TIME ZONE 'Asia/Bangkok')::date;
  v_redemption_id uuid;
  v_reference_id  uuid := COALESCE(p_reference_id, gen_random_uuid());
BEGIN
  -- Auth guard: caller must be the owner
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_points <= 0 THEN
    RAISE EXCEPTION 'Points must be positive';
  END IF;

  -- Idempotent row creation (BUG-HOOK-05 server-side equivalent)
  INSERT INTO public.user_points (user_id, total_points, lifetime_points, daily_earned_today, last_daily_reset)
  VALUES (p_user_id, 0, 0, 0, v_today)
  ON CONFLICT (user_id) DO NOTHING;

  -- Lock the row to prevent concurrent redemptions (BUG-POINTS-03)
  SELECT *
  INTO v_points_row
  FROM public.user_points
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unable to load points row';
  END IF;

  -- Server-side daily reset (BUG-POINTS-04): keeps state correct even if app stays open overnight
  IF v_points_row.last_daily_reset IS DISTINCT FROM v_today THEN
    UPDATE public.user_points
    SET daily_earned_today = 0,
        last_daily_reset   = v_today
    WHERE user_id = p_user_id;

    v_points_row.daily_earned_today := 0;
    v_points_row.last_daily_reset   := v_today;
  END IF;

  -- Idempotency: if this reference_id was already redeemed, return success without re-spending
  IF p_reference_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.point_transactions
    WHERE user_id    = p_user_id
      AND action_type = 'redeem'
      AND reference_id = p_reference_id
  ) THEN
    RETURN jsonb_build_object(
      'success',       true,
      'duplicate',     true,
      'redemption_id', NULL,
      'points_spent',  0,
      'reference_id',  p_reference_id,
      'total_points',  v_points_row.total_points
    );
  END IF;

  -- Locked balance check — balance read and deduction happen in the same transaction
  -- while the row is exclusively locked, so no concurrent tab can interleave here.
  IF v_points_row.total_points < p_points THEN
    RAISE EXCEPTION 'insufficient_points';
  END IF;

  -- Atomic deduction
  UPDATE public.user_points
  SET total_points = total_points - p_points
  WHERE user_id = p_user_id
  RETURNING * INTO v_points_row;

  -- Record the redemption
  INSERT INTO public.point_redemptions (
    user_id,
    points_spent,
    reward_type,
    reward_value,
    status
  ) VALUES (
    p_user_id,
    p_points,
    p_reward_type,
    p_reward_value,
    'pending'
  )
  RETURNING id INTO v_redemption_id;

  -- Audit trail
  INSERT INTO public.point_transactions (
    user_id,
    points,
    action_type,
    reference_id,
    description
  ) VALUES (
    p_user_id,
    -p_points,
    'redeem',
    v_reference_id,
    p_description
  );

  RETURN jsonb_build_object(
    'success',       true,
    'duplicate',     false,
    'redemption_id', v_redemption_id,
    'points_spent',  p_points,
    'reference_id',  v_reference_id,
    'total_points',  v_points_row.total_points
  );
END;
$$;

-- ============================================================
-- earn_points: re-declare to ensure server-side daily reset
-- is always applied (BUG-POINTS-04). Matches the existing
-- authoritative version but made explicit here for completeness.
-- ============================================================
CREATE OR REPLACE FUNCTION public.earn_points(
  p_user_id      uuid,
  p_action_type  text,
  p_reference_id uuid    DEFAULT NULL,
  p_points       integer DEFAULT 0,
  p_description  text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_points_row   public.user_points%ROWTYPE;
  v_today        date := (now() AT TIME ZONE 'Asia/Bangkok')::date;
  v_points_to_add integer;
  v_reference_id  uuid := COALESCE(p_reference_id, gen_random_uuid());
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_points <= 0 THEN
    RAISE EXCEPTION 'Points must be positive';
  END IF;

  -- Idempotent row creation (BUG-HOOK-05 server-side equivalent)
  INSERT INTO public.user_points (user_id, total_points, lifetime_points, daily_earned_today, last_daily_reset)
  VALUES (p_user_id, 0, 0, 0, v_today)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT *
  INTO v_points_row
  FROM public.user_points
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unable to load points row';
  END IF;

  -- Server-side daily reset (BUG-POINTS-04)
  IF v_points_row.last_daily_reset IS DISTINCT FROM v_today THEN
    UPDATE public.user_points
    SET daily_earned_today = 0,
        last_daily_reset   = v_today
    WHERE user_id = p_user_id;

    v_points_row.daily_earned_today := 0;
    v_points_row.last_daily_reset   := v_today;
  END IF;

  -- Duplicate transaction guard
  IF p_reference_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.point_transactions
    WHERE user_id     = p_user_id
      AND action_type = p_action_type
      AND reference_id = p_reference_id
  ) THEN
    RETURN jsonb_build_object(
      'success',           true,
      'duplicate',         true,
      'points_earned',     0,
      'reference_id',      p_reference_id,
      'total_points',      v_points_row.total_points,
      'lifetime_points',   v_points_row.lifetime_points,
      'daily_earned_today', v_points_row.daily_earned_today
    );
  END IF;

  v_points_to_add := LEAST(p_points, GREATEST(0, 50 - v_points_row.daily_earned_today));

  IF v_points_to_add <= 0 THEN
    RETURN jsonb_build_object(
      'success',           false,
      'duplicate',         false,
      'points_earned',     0,
      'reason',            'daily_limit',
      'reference_id',      v_reference_id,
      'total_points',      v_points_row.total_points,
      'lifetime_points',   v_points_row.lifetime_points,
      'daily_earned_today', v_points_row.daily_earned_today
    );
  END IF;

  UPDATE public.user_points
  SET total_points      = total_points + v_points_to_add,
      lifetime_points   = lifetime_points + v_points_to_add,
      daily_earned_today = daily_earned_today + v_points_to_add,
      last_daily_reset  = v_today
  WHERE user_id = p_user_id
  RETURNING * INTO v_points_row;

  INSERT INTO public.point_transactions (
    user_id,
    points,
    action_type,
    reference_id,
    description
  ) VALUES (
    p_user_id,
    v_points_to_add,
    p_action_type,
    v_reference_id,
    p_description
  );

  RETURN jsonb_build_object(
    'success',           true,
    'duplicate',         false,
    'points_earned',     v_points_to_add,
    'reference_id',      v_reference_id,
    'total_points',      v_points_row.total_points,
    'lifetime_points',   v_points_row.lifetime_points,
    'daily_earned_today', v_points_row.daily_earned_today
  );
END;
$$;
