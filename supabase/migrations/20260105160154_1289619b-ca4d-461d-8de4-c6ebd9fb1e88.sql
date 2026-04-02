
-- Create a view that hides borrower contact info until they confirm
-- This replaces direct table access with controlled data exposure

-- Create a secure function to get debt agreements with conditional borrower info
CREATE OR REPLACE FUNCTION public.get_debt_agreement_safe(p_agreement_id uuid)
RETURNS TABLE (
  id uuid,
  lender_id uuid,
  borrower_id uuid,
  borrower_name text,
  borrower_phone text,
  principal_amount numeric,
  total_amount numeric,
  interest_rate numeric,
  interest_type text,
  num_installments integer,
  frequency text,
  start_date date,
  status text,
  description text,
  lender_confirmed boolean,
  borrower_confirmed boolean,
  reschedule_fee_rate numeric,
  reschedule_interest_multiplier numeric,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    da.id,
    da.lender_id,
    da.borrower_id,
    -- Only show borrower contact info if:
    -- 1. Current user is the borrower themselves, OR
    -- 2. Borrower has confirmed the agreement
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
  WHERE da.id = p_agreement_id
    AND (da.lender_id = auth.uid() OR da.borrower_id = auth.uid());
END;
$$;

-- Create a secure view for listing agreements with masked borrower info
CREATE OR REPLACE VIEW public.debt_agreements_secure AS
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
FROM public.debt_agreements da
WHERE da.lender_id = auth.uid() OR da.borrower_id = auth.uid();

-- Grant access to the view
GRANT SELECT ON public.debt_agreements_secure TO authenticated;
