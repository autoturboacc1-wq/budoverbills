-- Update debt_agreements_secure view to include bank account columns
DROP VIEW IF EXISTS public.debt_agreements_secure;

CREATE VIEW public.debt_agreements_secure WITH (security_invoker = true) AS
SELECT
  id,
  lender_id,
  borrower_id,
  principal_amount,
  total_amount,
  interest_rate,
  num_installments,
  start_date,
  lender_confirmed,
  borrower_confirmed,
  reschedule_fee_rate,
  reschedule_interest_multiplier,
  created_at,
  updated_at,
  -- Hide borrower info until borrower confirms
  CASE 
    WHEN borrower_confirmed = true THEN borrower_name 
    ELSE '(รอการยืนยัน)'
  END as borrower_name,
  CASE 
    WHEN borrower_confirmed = true THEN borrower_phone 
    ELSE NULL
  END as borrower_phone,
  interest_type,
  frequency,
  status,
  description,
  -- Bank account info (visible to both parties)
  bank_name,
  account_number,
  account_name
FROM public.debt_agreements
WHERE 
  auth.uid() = lender_id 
  OR auth.uid() = borrower_id;