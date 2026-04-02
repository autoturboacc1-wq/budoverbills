-- Fix profiles: Users can only see their own profile OR profiles of their friends/counterparties

-- Create a function to check if user can view a profile
CREATE OR REPLACE FUNCTION public.can_view_profile(target_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    -- Own profile
    auth.uid() = target_user_id
    OR
    -- Is a friend (mutual)
    EXISTS (
      SELECT 1 FROM public.friends 
      WHERE user_id = auth.uid() AND friend_user_id = target_user_id
    )
    OR
    -- Is counterparty in debt agreement
    EXISTS (
      SELECT 1 FROM public.debt_agreements
      WHERE (lender_id = auth.uid() AND borrower_id = target_user_id)
         OR (borrower_id = auth.uid() AND lender_id = target_user_id)
    )
    OR
    -- Sent or received friend request
    EXISTS (
      SELECT 1 FROM public.friend_requests
      WHERE (from_user_id = auth.uid() AND to_user_id = target_user_id)
         OR (to_user_id = auth.uid() AND from_user_id = target_user_id)
    )
$$;

-- Update profiles policy
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;
CREATE POLICY "Users can view related profiles" 
ON public.profiles 
FOR SELECT 
USING (public.can_view_profile(user_id));