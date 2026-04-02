-- Allow users to insert their own subscription (for existing users who don't have one)
CREATE POLICY "Users can insert own subscription"
ON public.subscriptions FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Insert free subscriptions for all existing users who don't have one
INSERT INTO public.subscriptions (user_id, tier)
SELECT p.user_id, 'free'::subscription_tier
FROM public.profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM public.subscriptions s WHERE s.user_id = p.user_id
);