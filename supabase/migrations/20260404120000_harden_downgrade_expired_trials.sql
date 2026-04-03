-- Ensure expired trials are fully downgraded, not just re-tiered.

CREATE OR REPLACE FUNCTION public.downgrade_expired_trials()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.subscriptions
  SET
    tier = 'free',
    is_trial = false,
    trial_ends_at = NULL,
    updated_at = now()
  WHERE is_trial = true
    AND trial_ends_at < now()
    AND tier = 'premium';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;
