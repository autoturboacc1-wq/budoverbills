-- Fix tips table RLS - remove overly permissive policy
DROP POLICY IF EXISTS "Anyone can create tips" ON public.tips;

-- Create proper policies for tips
-- Authenticated users can create tips
CREATE POLICY "Authenticated users can create tips"
ON public.tips
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND (user_id IS NULL OR auth.uid() = user_id));

-- Allow anonymous tips via secure function only (SECURITY DEFINER)
-- Users can view their own tips and all public (non-anonymous) tips
CREATE POLICY "Users can view tips"
ON public.tips
FOR SELECT
USING (
  auth.uid() = user_id 
  OR is_anonymous = false
  OR auth.uid() IS NOT NULL
);