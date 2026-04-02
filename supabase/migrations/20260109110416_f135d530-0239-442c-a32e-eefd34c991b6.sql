-- Improve can_view_profile to require borrower confirmation for debt agreements
CREATE OR REPLACE FUNCTION public.can_view_profile(target_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT 
    -- Must be authenticated
    auth.uid() IS NOT NULL
    AND (
      -- Own profile - always allowed
      auth.uid() = target_user_id
      OR
      -- Is a confirmed friend (mutual friendship established)
      EXISTS (
        SELECT 1 FROM public.friends 
        WHERE user_id = auth.uid() AND friend_user_id = target_user_id
      )
      OR
      -- Is counterparty in CONFIRMED debt agreement
      -- Borrower can always see lender's profile
      EXISTS (
        SELECT 1 FROM public.debt_agreements
        WHERE borrower_id = auth.uid() AND lender_id = target_user_id
      )
      OR
      -- Lender can see borrower's profile ONLY after borrower confirms
      EXISTS (
        SELECT 1 FROM public.debt_agreements
        WHERE lender_id = auth.uid() 
          AND borrower_id = target_user_id
          AND borrower_confirmed = true
      )
    )
$function$;

-- Add comment explaining the security design
COMMENT ON FUNCTION public.can_view_profile IS 'Controls profile visibility. Access allowed for: own profile, confirmed friends, or debt agreement counterparties (borrower must confirm before lender can see their profile). This prevents contact information harvesting.';