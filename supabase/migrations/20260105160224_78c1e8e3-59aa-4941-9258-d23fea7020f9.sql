
-- Drop the SECURITY DEFINER view and recreate as INVOKER (default)
DROP VIEW IF EXISTS public.debt_agreements_secure;

-- Recreate view without SECURITY DEFINER (uses INVOKER by default which is safe)
-- The RLS on debt_agreements table will be applied when querying this view
CREATE VIEW public.debt_agreements_secure 
WITH (security_invoker = true)
AS
SELECT 
  da.id,
  da.lender_id,
  da.borrower_id,
  -- Mask borrower contact info until confirmed
  CASE 
    WHEN auth.uid() = da.borrower_id OR da.borrower_confirmed = true 
    THEN da.borrower_name
    ELSE '(รอการยืนยัน)'
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
FROM public.debt_agreements da;

-- Grant access to the view
GRANT SELECT ON public.debt_agreements_secure TO authenticated;
