-- =============================================
-- Pay-per-Agreement + Tip Jar Monetization Model
-- =============================================

-- Drop existing subscription-related functions that conflict with new model
DROP FUNCTION IF EXISTS public.can_create_agreement(uuid);
DROP FUNCTION IF EXISTS public.can_create_group(uuid);
DROP FUNCTION IF EXISTS public.get_user_limits(uuid);

-- Add free_agreements_used column to track free quota (2 free per user)
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS free_agreements_used integer NOT NULL DEFAULT 0;

-- Create agreement_payments table to track per-agreement fees
CREATE TABLE public.agreement_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  agreement_id uuid REFERENCES public.debt_agreements(id) ON DELETE SET NULL,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'THB',
  payment_type text NOT NULL DEFAULT 'agreement_fee', -- 'agreement_fee' or 'tip'
  status text NOT NULL DEFAULT 'pending', -- 'pending', 'completed', 'failed'
  payment_method text, -- 'promptpay', 'stripe', etc.
  transaction_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

-- Enable RLS on agreement_payments
ALTER TABLE public.agreement_payments ENABLE ROW LEVEL SECURITY;

-- RLS policies for agreement_payments
CREATE POLICY "Users can view own payments"
ON public.agreement_payments
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create own payments"
ON public.agreement_payments
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can manage all payments"
ON public.agreement_payments
FOR ALL
USING (true)
WITH CHECK (true);

-- Create tips table for Buy Me Coffee donations
CREATE TABLE public.tips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid, -- nullable for anonymous tips
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'THB',
  message text,
  display_name text, -- optional display name for tip
  is_anonymous boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending',
  payment_method text,
  transaction_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

-- Enable RLS on tips
ALTER TABLE public.tips ENABLE ROW LEVEL SECURITY;

-- RLS policies for tips
CREATE POLICY "Anyone can create tips"
ON public.tips
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Users can view own tips"
ON public.tips
FOR SELECT
USING (auth.uid() = user_id OR is_anonymous = false);

-- Function to check if user can create agreement (2 free, then pay)
CREATE OR REPLACE FUNCTION public.can_create_agreement_free(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_free_used integer;
  v_free_limit integer := 2;
BEGIN
  SELECT COALESCE(free_agreements_used, 0) INTO v_free_used
  FROM public.profiles
  WHERE user_id = p_user_id;
  
  IF v_free_used IS NULL THEN
    v_free_used := 0;
  END IF;
  
  RETURN jsonb_build_object(
    'can_create_free', v_free_used < v_free_limit,
    'free_used', v_free_used,
    'free_limit', v_free_limit,
    'free_remaining', GREATEST(0, v_free_limit - v_free_used),
    'fee_amount', 29,
    'fee_currency', 'THB'
  );
END;
$$;

-- Function to use a free agreement slot
CREATE OR REPLACE FUNCTION public.use_free_agreement_slot(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_free_used integer;
BEGIN
  SELECT free_agreements_used INTO v_free_used
  FROM public.profiles
  WHERE user_id = p_user_id;
  
  IF v_free_used < 2 THEN
    UPDATE public.profiles
    SET free_agreements_used = free_agreements_used + 1
    WHERE user_id = p_user_id;
    RETURN true;
  END IF;
  
  RETURN false;
END;
$$;

-- Function to record agreement payment
CREATE OR REPLACE FUNCTION public.record_agreement_payment(
  p_user_id uuid,
  p_agreement_id uuid,
  p_amount numeric,
  p_currency text DEFAULT 'THB',
  p_payment_method text DEFAULT 'promptpay'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment_id uuid;
BEGIN
  INSERT INTO public.agreement_payments (user_id, agreement_id, amount, currency, payment_method, status)
  VALUES (p_user_id, p_agreement_id, p_amount, p_currency, p_payment_method, 'completed')
  RETURNING id INTO v_payment_id;
  
  RETURN v_payment_id;
END;
$$;

-- Function to record tip
CREATE OR REPLACE FUNCTION public.record_tip(
  p_user_id uuid,
  p_amount numeric,
  p_currency text DEFAULT 'THB',
  p_message text DEFAULT NULL,
  p_display_name text DEFAULT NULL,
  p_is_anonymous boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tip_id uuid;
BEGIN
  INSERT INTO public.tips (user_id, amount, currency, message, display_name, is_anonymous, status)
  VALUES (p_user_id, p_amount, p_currency, p_message, p_display_name, p_is_anonymous, 'completed')
  RETURNING id INTO v_tip_id;
  
  RETURN v_tip_id;
END;
$$;