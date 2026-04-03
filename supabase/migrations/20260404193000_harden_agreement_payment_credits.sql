-- Harden agreement credit and payment RPCs so only the owner or a privileged path can mutate balances.

DROP FUNCTION IF EXISTS public.add_agreement_credits(uuid, integer);
DROP FUNCTION IF EXISTS public.use_free_agreement_slot(uuid);
DROP FUNCTION IF EXISTS public.use_agreement_credit(uuid);
DROP FUNCTION IF EXISTS public.record_agreement_payment(uuid, uuid, numeric, text, text);

CREATE OR REPLACE FUNCTION public.add_agreement_credits(p_user_id uuid, p_credits integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_effective_uid uuid := auth.uid();
  v_role text := COALESCE(auth.role(), '');
BEGIN
  IF p_credits IS NULL OR p_credits <= 0 THEN
    RAISE EXCEPTION 'Invalid credit amount';
  END IF;

  IF v_role <> 'service_role' AND (v_effective_uid IS NULL OR v_effective_uid <> p_user_id) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  UPDATE public.profiles
  SET agreement_credits = COALESCE(agreement_credits, 0) + p_credits
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.use_free_agreement_slot(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_effective_uid uuid := auth.uid();
  v_free_used integer;
BEGIN
  IF v_effective_uid IS NULL OR v_effective_uid <> p_user_id THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  SELECT COALESCE(free_agreements_used, 0)
  INTO v_free_used
  FROM public.profiles
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF v_free_used < 2 THEN
    UPDATE public.profiles
    SET free_agreements_used = COALESCE(free_agreements_used, 0) + 1
    WHERE user_id = p_user_id;
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.use_agreement_credit(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_effective_uid uuid := auth.uid();
  v_credits integer;
BEGIN
  IF v_effective_uid IS NULL OR v_effective_uid <> p_user_id THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  SELECT COALESCE(agreement_credits, 0)
  INTO v_credits
  FROM public.profiles
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF v_credits > 0 THEN
    UPDATE public.profiles
    SET agreement_credits = agreement_credits - 1
    WHERE user_id = p_user_id;
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_agreement_payment(
  p_user_id uuid,
  p_agreement_id uuid,
  p_amount numeric,
  p_currency text DEFAULT 'THB',
  p_payment_method text DEFAULT 'promptpay',
  p_status text DEFAULT 'pending'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment_id uuid;
  v_status text := COALESCE(lower(btrim(p_status)), 'pending');
  v_role text := COALESCE(auth.role(), '');
BEGIN
  IF v_role <> 'service_role' AND (auth.uid() IS NULL OR auth.uid() <> p_user_id) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  IF v_status NOT IN ('pending', 'completed', 'failed') THEN
    v_status := 'pending';
  END IF;

  IF v_status = 'completed' AND v_role <> 'service_role' THEN
    RAISE EXCEPTION 'Only service role can complete payments';
  END IF;

  INSERT INTO public.agreement_payments (
    user_id,
    agreement_id,
    amount,
    currency,
    payment_method,
    status
  )
  VALUES (
    p_user_id,
    p_agreement_id,
    p_amount,
    p_currency,
    p_payment_method,
    v_status
  )
  RETURNING id INTO v_payment_id;

  RETURN v_payment_id;
END;
$$;
