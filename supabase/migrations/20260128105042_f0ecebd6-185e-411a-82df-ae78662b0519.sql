-- Add agreement_credits column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS agreement_credits integer NOT NULL DEFAULT 0;

-- Create function to add credits when user buys coffee
CREATE OR REPLACE FUNCTION public.add_agreement_credits(p_user_id uuid, p_credits integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.profiles
  SET agreement_credits = agreement_credits + p_credits
  WHERE user_id = p_user_id;
  
  RETURN FOUND;
END;
$$;

-- Create function to use an agreement credit
CREATE OR REPLACE FUNCTION public.use_agreement_credit(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_credits integer;
BEGIN
  SELECT agreement_credits INTO v_credits
  FROM public.profiles
  WHERE user_id = p_user_id;
  
  IF v_credits > 0 THEN
    UPDATE public.profiles
    SET agreement_credits = agreement_credits - 1
    WHERE user_id = p_user_id;
    RETURN true;
  END IF;
  
  RETURN false;
END;
$$;

-- Update can_create_agreement_free to include purchased credits
CREATE OR REPLACE FUNCTION public.can_create_agreement_free(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_free_used integer;
  v_free_limit integer := 2;
  v_credits integer;
BEGIN
  SELECT 
    COALESCE(free_agreements_used, 0),
    COALESCE(agreement_credits, 0)
  INTO v_free_used, v_credits
  FROM public.profiles
  WHERE user_id = p_user_id;
  
  IF v_free_used IS NULL THEN
    v_free_used := 0;
  END IF;
  IF v_credits IS NULL THEN
    v_credits := 0;
  END IF;
  
  RETURN jsonb_build_object(
    'can_create_free', (v_free_used < v_free_limit) OR (v_credits > 0),
    'free_used', v_free_used,
    'free_limit', v_free_limit,
    'free_remaining', GREATEST(0, v_free_limit - v_free_used),
    'credits', v_credits,
    'total_available', GREATEST(0, v_free_limit - v_free_used) + v_credits,
    'fee_amount', 25,
    'fee_currency', 'THB'
  );
END;
$$;