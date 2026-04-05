-- BUG-RLS-08: The "Users can insert own subscription" policy on the
-- subscriptions table only checked auth.uid() = user_id, allowing any
-- authenticated user to INSERT a row with tier='premium' and an arbitrary
-- expires_at (e.g. '2099-01-01'), completely bypassing the billing system.
--
-- Fix:
--   1. Drop the permissive INSERT policy (already done in migration
--      20260406143000, but repeated here idempotently for clarity).
--   2. Create a tightly-scoped INSERT policy that restricts new rows to
--      tier='free' only, so self-initialisation of a free subscription is
--      still possible while premium tier upgrades must go through an RPC.
--   3. Provide a SECURITY DEFINER RPC for tier upgrades so the billing path
--      is the only way to set tier='premium'.

-- 1. Remove the vulnerable INSERT policy (idempotent).
DROP POLICY IF EXISTS "Users can insert own subscription"    ON public.subscriptions;
DROP POLICY IF EXISTS "Users can insert own subscriptions"   ON public.subscriptions;

-- 2. Allow users to self-initialise only a free-tier subscription row.
--    Tier upgrades (premium, etc.) must use the upgrade_subscription() RPC.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_policies
    WHERE  schemaname = 'public'
      AND  tablename  = 'subscriptions'
      AND  policyname = 'Users can self-init free subscription only'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Users can self-init free subscription only"
      ON public.subscriptions
      FOR INSERT
      TO authenticated
      WITH CHECK (
        auth.uid() = user_id
        AND tier = 'free'          -- BUG-RLS-08 fix: only free tier on INSERT
        AND expires_at IS NULL     -- free tier has no expiry
      )
    $policy$;
  END IF;
END;
$$;

-- 3. SECURITY DEFINER function for legitimate tier upgrades (called by billing
--    webhooks / edge functions running as service_role or after payment
--    verification).  Regular authenticated users cannot call this to set
--    an arbitrary tier; service_role callers can.
CREATE OR REPLACE FUNCTION public.upgrade_subscription(
  p_user_id   UUID,
  p_tier      public.subscription_tier,
  p_expires_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_role TEXT := COALESCE(auth.role(), '');
BEGIN
  -- BUG-RLS-08 fix: only service_role (billing webhooks/edge functions) may
  -- set a non-free tier.  Authenticated clients are explicitly rejected.
  IF v_role <> 'service_role' THEN
    RAISE EXCEPTION 'permission denied: tier upgrades must go through the billing system';
  END IF;

  IF p_tier IS NULL THEN
    RAISE EXCEPTION 'tier is required';
  END IF;

  INSERT INTO public.subscriptions (user_id, tier, expires_at)
  VALUES (p_user_id, p_tier, p_expires_at)
  ON CONFLICT (user_id) DO UPDATE
    SET tier       = EXCLUDED.tier,
        expires_at = EXCLUDED.expires_at,
        updated_at = now();
END;
$$;

COMMENT ON FUNCTION public.upgrade_subscription IS
  'Sets subscription tier for a user. Only callable by service_role (billing '
  'webhooks). Authenticated clients may not call this to prevent billing bypass. '
  'BUG-RLS-08 fix.';
