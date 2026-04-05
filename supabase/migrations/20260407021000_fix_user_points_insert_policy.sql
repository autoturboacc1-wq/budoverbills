-- BUG-RLS-07: The original "Users can insert own points" RLS policy on
-- user_points only checked auth.uid() = user_id, allowing a client to INSERT
-- a row with an arbitrary total_points value (e.g. 999999), effectively
-- self-granting unlimited points.
--
-- Fix: Drop the permissive INSERT policy and replace it with a
-- SECURITY DEFINER initialisation function that always inserts with all
-- point columns set to 0.  Direct INSERT via RLS is blocked (WITH CHECK (false)).
-- Existing rows are not affected.

-- 1. Remove the permissive INSERT policy (idempotent).
DROP POLICY IF EXISTS "Users can insert own points" ON public.user_points;

-- 2. Block all direct client INSERTs; initialisation must go through the
--    initialize_user_points() function below.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_policies
    WHERE  schemaname = 'public'
      AND  tablename  = 'user_points'
      AND  policyname = 'Block direct insert on user_points'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Block direct insert on user_points"
      ON public.user_points
      FOR INSERT
      WITH CHECK (false)
    $policy$;
  END IF;
END;
$$;

-- 3. SECURITY DEFINER function that safely initialises a user_points row.
--    Always sets total_points, lifetime_points, and daily_earned_today to 0.
--    Calling user must match p_user_id (service_role may init for any user).
CREATE OR REPLACE FUNCTION public.initialize_user_points(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_role      TEXT := COALESCE(auth.role(), '');
BEGIN
  -- BUG-RLS-07 fix: only the owning user or service_role may initialise.
  IF v_role <> 'service_role'
     AND (v_caller_id IS NULL OR v_caller_id <> p_user_id)
  THEN
    RAISE EXCEPTION 'permission denied: caller may not initialise points for another user';
  END IF;

  INSERT INTO public.user_points (
    user_id,
    total_points,
    lifetime_points,
    daily_earned_today,
    last_daily_reset
  )
  VALUES (
    p_user_id,
    0,   -- total_points always starts at 0
    0,   -- lifetime_points always starts at 0
    0,   -- daily_earned_today always starts at 0
    CURRENT_DATE
  )
  ON CONFLICT (user_id) DO NOTHING;  -- idempotent: no-op if row already exists
END;
$$;

COMMENT ON FUNCTION public.initialize_user_points IS
  'Creates a zeroed user_points row for a new user. '
  'Direct INSERT via RLS is blocked to prevent clients from self-granting points. '
  'BUG-RLS-07 fix.';
