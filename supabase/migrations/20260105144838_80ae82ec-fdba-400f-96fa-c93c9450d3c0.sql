-- Add trial_ends_at column to subscriptions
ALTER TABLE public.subscriptions 
ADD COLUMN trial_ends_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Add is_trial column to easily identify trial subscriptions
ALTER TABLE public.subscriptions 
ADD COLUMN is_trial BOOLEAN NOT NULL DEFAULT false;

-- Update get_user_tier function to handle trial expiration
CREATE OR REPLACE FUNCTION public.get_user_tier(p_user_id uuid)
 RETURNS subscription_tier
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT 
      CASE 
        -- If trial has expired, return free
        WHEN is_trial = true AND trial_ends_at < now() THEN 'free'::subscription_tier
        -- If subscription has expired, return free
        WHEN expires_at IS NOT NULL AND expires_at < now() THEN 'free'::subscription_tier
        -- Otherwise return the tier
        ELSE tier
      END
     FROM public.subscriptions 
     WHERE user_id = p_user_id 
     ORDER BY created_at DESC
     LIMIT 1),
    'free'::subscription_tier
  )
$function$;

-- Function to start a premium trial
CREATE OR REPLACE FUNCTION public.start_premium_trial(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_existing_trial boolean;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  -- Check if user already had a trial
  SELECT EXISTS(
    SELECT 1 FROM public.subscriptions 
    WHERE user_id = p_user_id AND is_trial = true
  ) INTO v_existing_trial;
  
  IF v_existing_trial THEN
    RETURN false; -- User already used their trial
  END IF;
  
  -- Update subscription to premium trial
  UPDATE public.subscriptions
  SET 
    tier = 'premium',
    is_trial = true,
    trial_ends_at = now() + interval '7 days',
    updated_at = now()
  WHERE user_id = p_user_id;
  
  RETURN true;
END;
$function$;

-- Function to downgrade expired trials (called by cron)
CREATE OR REPLACE FUNCTION public.downgrade_expired_trials()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.subscriptions
  SET 
    tier = 'free',
    updated_at = now()
  WHERE is_trial = true 
    AND trial_ends_at < now() 
    AND tier = 'premium';
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;
