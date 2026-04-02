-- Update can_view_profile to be more restrictive
-- Remove friend_requests check to prevent profile harvesting via sending requests
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
    )
$function$;