-- Update can_view_profile function to also allow viewing profiles when searching by user_code
-- This is needed for friend search functionality

CREATE OR REPLACE FUNCTION public.can_view_profile(target_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    -- Must be authenticated
    auth.uid() IS NOT NULL
    AND (
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
    )
$$;

-- Also create a public profile search function that returns limited data for friend search
-- This allows searching by user_code without exposing phone numbers
CREATE OR REPLACE FUNCTION public.search_profile_by_code(search_code TEXT)
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  avatar_url TEXT,
  user_code TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    p.user_id,
    p.display_name,
    p.avatar_url,
    p.user_code
  FROM public.profiles p
  WHERE p.user_code = UPPER(search_code)
    AND auth.uid() IS NOT NULL
    AND p.user_id != auth.uid()
$$;