-- =============================================
-- Friend Requests + Points Atomicity Hardening
-- =============================================

-- Prevent duplicate friend request pairs in either direction
CREATE UNIQUE INDEX IF NOT EXISTS friend_requests_unique_pair_idx
  ON public.friend_requests (LEAST(from_user_id, to_user_id), GREATEST(from_user_id, to_user_id));

-- Prevent duplicate friendship rows per direction
CREATE UNIQUE INDEX IF NOT EXISTS friends_unique_pair_idx
  ON public.friends (user_id, friend_user_id);

-- Make point transactions idempotent when a stable reference_id is supplied
ALTER TABLE public.point_transactions
  ALTER COLUMN reference_id SET DEFAULT gen_random_uuid();

UPDATE public.point_transactions
SET reference_id = gen_random_uuid()
WHERE reference_id IS NULL;

ALTER TABLE public.point_transactions
  ALTER COLUMN reference_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS point_transactions_unique_user_action_reference_idx
  ON public.point_transactions (user_id, action_type, reference_id);

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

CREATE OR REPLACE FUNCTION public.earn_points(
  p_user_id uuid,
  p_action_type text,
  p_reference_id uuid DEFAULT NULL,
  p_points integer DEFAULT 0,
  p_description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_points_row public.user_points%ROWTYPE;
  v_today date := (now() AT TIME ZONE 'Asia/Bangkok')::date;
  v_points_to_add integer;
  v_reference_id uuid := COALESCE(p_reference_id, gen_random_uuid());
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_points <= 0 THEN
    RAISE EXCEPTION 'Points must be positive';
  END IF;

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

  IF v_points_row.last_daily_reset IS DISTINCT FROM v_today THEN
    UPDATE public.user_points
    SET daily_earned_today = 0,
        last_daily_reset = v_today
    WHERE user_id = p_user_id;

    v_points_row.daily_earned_today := 0;
    v_points_row.last_daily_reset := v_today;
  END IF;

  IF p_reference_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.point_transactions
    WHERE user_id = p_user_id
      AND action_type = p_action_type
      AND reference_id = p_reference_id
  ) THEN
    RETURN jsonb_build_object(
      'success', true,
      'duplicate', true,
      'points_earned', 0,
      'reference_id', p_reference_id,
      'total_points', v_points_row.total_points,
      'lifetime_points', v_points_row.lifetime_points,
      'daily_earned_today', v_points_row.daily_earned_today
    );
  END IF;

  v_points_to_add := LEAST(p_points, GREATEST(0, 50 - v_points_row.daily_earned_today));

  IF v_points_to_add <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'duplicate', false,
      'points_earned', 0,
      'reason', 'daily_limit',
      'reference_id', v_reference_id,
      'total_points', v_points_row.total_points,
      'lifetime_points', v_points_row.lifetime_points,
      'daily_earned_today', v_points_row.daily_earned_today
    );
  END IF;

  UPDATE public.user_points
  SET total_points = total_points + v_points_to_add,
      lifetime_points = lifetime_points + v_points_to_add,
      daily_earned_today = daily_earned_today + v_points_to_add,
      last_daily_reset = v_today
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
    'success', true,
    'duplicate', false,
    'points_earned', v_points_to_add,
    'reference_id', v_reference_id,
    'total_points', v_points_row.total_points,
    'lifetime_points', v_points_row.lifetime_points,
    'daily_earned_today', v_points_row.daily_earned_today
  );
END;
$$;

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
  v_today date := (now() AT TIME ZONE 'Asia/Bangkok')::date;
  v_redemption_id uuid;
  v_reference_id uuid := COALESCE(p_reference_id, gen_random_uuid());
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_points <= 0 THEN
    RAISE EXCEPTION 'Points must be positive';
  END IF;

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

  IF v_points_row.last_daily_reset IS DISTINCT FROM v_today THEN
    UPDATE public.user_points
    SET daily_earned_today = 0,
        last_daily_reset = v_today
    WHERE user_id = p_user_id;

    v_points_row.daily_earned_today := 0;
    v_points_row.last_daily_reset := v_today;
  END IF;

  IF p_reference_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.point_transactions
    WHERE user_id = p_user_id
      AND action_type = 'redeem'
      AND reference_id = p_reference_id
  ) THEN
    RETURN jsonb_build_object(
      'success', true,
      'duplicate', true,
      'redemption_id', NULL,
      'points_spent', 0,
      'reference_id', p_reference_id,
      'total_points', v_points_row.total_points
    );
  END IF;

  IF v_points_row.total_points < p_points THEN
    RAISE EXCEPTION 'Insufficient points';
  END IF;

  UPDATE public.user_points
  SET total_points = total_points - p_points,
      lifetime_points = lifetime_points,
      daily_earned_today = daily_earned_today,
      last_daily_reset = v_today
  WHERE user_id = p_user_id
  RETURNING * INTO v_points_row;

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
    'success', true,
    'duplicate', false,
    'redemption_id', v_redemption_id,
    'points_spent', p_points,
    'reference_id', v_reference_id,
    'total_points', v_points_row.total_points
  );
END;
$$;
