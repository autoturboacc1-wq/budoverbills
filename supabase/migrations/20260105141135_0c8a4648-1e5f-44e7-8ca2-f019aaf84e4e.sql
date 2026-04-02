-- Create subscription status enum
CREATE TYPE public.subscription_tier AS ENUM ('free', 'premium');

-- Create subscriptions table
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  tier subscription_tier NOT NULL DEFAULT 'free',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can view their own subscription
CREATE POLICY "Users can view own subscription"
ON public.subscriptions FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Only system can insert/update subscriptions (via edge functions)
CREATE POLICY "Service role can manage subscriptions"
ON public.subscriptions FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Create trigger for updated_at
CREATE TRIGGER update_subscriptions_updated_at
BEFORE UPDATE ON public.subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Function to get user subscription tier
CREATE OR REPLACE FUNCTION public.get_user_tier(p_user_id UUID)
RETURNS subscription_tier
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT tier FROM public.subscriptions 
     WHERE user_id = p_user_id 
     AND (expires_at IS NULL OR expires_at > now())),
    'free'::subscription_tier
  )
$$;

-- Function to check if user can create more agreements
CREATE OR REPLACE FUNCTION public.can_create_agreement(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    CASE 
      WHEN public.get_user_tier(p_user_id) = 'premium' THEN true
      ELSE (
        SELECT COUNT(*) < 3 
        FROM public.debt_agreements 
        WHERE lender_id = p_user_id 
        AND status NOT IN ('completed', 'cancelled')
      )
    END
$$;

-- Function to check if user can create more groups
CREATE OR REPLACE FUNCTION public.can_create_group(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    CASE 
      WHEN public.get_user_tier(p_user_id) = 'premium' THEN true
      ELSE (
        SELECT COUNT(*) < 2 
        FROM public.expense_groups 
        WHERE created_by = p_user_id
      )
    END
$$;

-- Function to get user limits info
CREATE OR REPLACE FUNCTION public.get_user_limits(p_user_id UUID)
RETURNS TABLE (
  tier TEXT,
  agreements_used INT,
  agreements_limit INT,
  groups_used INT,
  groups_limit INT,
  can_create_agreement BOOLEAN,
  can_create_group BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    public.get_user_tier(p_user_id)::TEXT as tier,
    (SELECT COUNT(*)::INT FROM public.debt_agreements WHERE lender_id = p_user_id AND status NOT IN ('completed', 'cancelled')) as agreements_used,
    CASE WHEN public.get_user_tier(p_user_id) = 'premium' THEN -1 ELSE 3 END as agreements_limit,
    (SELECT COUNT(*)::INT FROM public.expense_groups WHERE created_by = p_user_id) as groups_used,
    CASE WHEN public.get_user_tier(p_user_id) = 'premium' THEN -1 ELSE 2 END as groups_limit,
    public.can_create_agreement(p_user_id) as can_create_agreement,
    public.can_create_group(p_user_id) as can_create_group
$$;

-- Auto-create free subscription for new users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Create profile
  INSERT INTO public.profiles (user_id, display_name, user_code)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'display_name', NEW.email),
    public.generate_user_code()
  );
  
  -- Create free subscription
  INSERT INTO public.subscriptions (user_id, tier)
  VALUES (NEW.id, 'free');
  
  RETURN NEW;
END;
$$;