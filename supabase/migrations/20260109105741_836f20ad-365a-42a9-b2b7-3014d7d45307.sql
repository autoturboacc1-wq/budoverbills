-- First, drop and recreate the view to ensure security_invoker is set correctly
DROP VIEW IF EXISTS public.debt_agreements_secure;

CREATE VIEW public.debt_agreements_secure
WITH (security_invoker = true)
AS
SELECT 
  da.id,
  da.lender_id,
  da.borrower_id,
  -- Only show borrower contact info if current user is the borrower OR borrower has confirmed
  CASE 
    WHEN auth.uid() = da.borrower_id OR da.borrower_confirmed = true 
    THEN da.borrower_name
    ELSE NULL
  END as borrower_name,
  CASE 
    WHEN auth.uid() = da.borrower_id OR da.borrower_confirmed = true 
    THEN da.borrower_phone
    ELSE NULL
  END as borrower_phone,
  da.principal_amount,
  da.total_amount,
  da.interest_rate,
  da.interest_type,
  da.num_installments,
  da.frequency,
  da.start_date,
  da.status,
  da.description,
  da.lender_confirmed,
  da.borrower_confirmed,
  da.reschedule_fee_rate,
  da.reschedule_interest_multiplier,
  da.created_at,
  da.updated_at
FROM public.debt_agreements da
WHERE da.lender_id = auth.uid() OR da.borrower_id = auth.uid();

-- Add comment explaining the security design
COMMENT ON VIEW public.debt_agreements_secure IS 'Secure view for debt agreements. Uses security_invoker=true to inherit caller permissions. Masks borrower info until agreement is confirmed. WHERE clause ensures users only see their own agreements.';