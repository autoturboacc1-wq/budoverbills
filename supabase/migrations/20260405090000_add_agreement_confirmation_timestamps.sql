-- Add dedicated confirmation timestamps for agreement PDF evidence.
ALTER TABLE public.debt_agreements
ADD COLUMN IF NOT EXISTS lender_confirmed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS borrower_confirmed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.debt_agreements.lender_confirmed_at IS 'When the lender confirmed the agreement';
COMMENT ON COLUMN public.debt_agreements.borrower_confirmed_at IS 'When the borrower confirmed the agreement';

-- Backfill legacy confirmed agreements with the best available timestamp.
UPDATE public.debt_agreements
SET lender_confirmed_at = COALESCE(lender_confirmed_at, updated_at)
WHERE lender_confirmed = true
  AND lender_confirmed_at IS NULL;

UPDATE public.debt_agreements
SET borrower_confirmed_at = COALESCE(borrower_confirmed_at, updated_at)
WHERE borrower_confirmed = true
  AND borrower_confirmed_at IS NULL;

CREATE OR REPLACE FUNCTION public.enforce_debt_agreement_role_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  lender_only_changed boolean;
  borrower_only_changed boolean;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  lender_only_changed := (
    NEW.bank_name IS DISTINCT FROM OLD.bank_name OR
    NEW.account_number IS DISTINCT FROM OLD.account_number OR
    NEW.account_name IS DISTINCT FROM OLD.account_name OR
    NEW.lender_confirmed IS DISTINCT FROM OLD.lender_confirmed OR
    NEW.lender_confirmed_at IS DISTINCT FROM OLD.lender_confirmed_at OR
    NEW.lender_confirmed_ip IS DISTINCT FROM OLD.lender_confirmed_ip OR
    NEW.lender_confirmed_device IS DISTINCT FROM OLD.lender_confirmed_device OR
    NEW.transfer_slip_url IS DISTINCT FROM OLD.transfer_slip_url OR
    NEW.transferred_at IS DISTINCT FROM OLD.transferred_at
  );

  borrower_only_changed := (
    NEW.borrower_confirmed IS DISTINCT FROM OLD.borrower_confirmed OR
    NEW.borrower_confirmed_at IS DISTINCT FROM OLD.borrower_confirmed_at OR
    NEW.borrower_confirmed_ip IS DISTINCT FROM OLD.borrower_confirmed_ip OR
    NEW.borrower_confirmed_device IS DISTINCT FROM OLD.borrower_confirmed_device OR
    NEW.borrower_confirmed_transfer IS DISTINCT FROM OLD.borrower_confirmed_transfer OR
    NEW.borrower_confirmed_transfer_at IS DISTINCT FROM OLD.borrower_confirmed_transfer_at
  );

  IF v_actor = OLD.lender_id AND borrower_only_changed THEN
    RAISE EXCEPTION 'Lenders cannot modify borrower confirmation fields';
  END IF;

  IF v_actor = OLD.borrower_id AND lender_only_changed THEN
    RAISE EXCEPTION 'Borrowers cannot modify lender banking or transfer fields';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE VIEW public.debt_agreements_secure
WITH (security_invoker = true)
AS
SELECT
  da.id,
  da.lender_id,
  da.borrower_id,
  CASE
    WHEN auth.uid() = da.borrower_id OR da.borrower_confirmed = true
    THEN da.borrower_name
    ELSE '(รอการยืนยัน)'
  END AS borrower_name,
  CASE
    WHEN auth.uid() = da.borrower_id OR da.borrower_confirmed = true
    THEN da.borrower_phone
    ELSE NULL
  END AS borrower_phone,
  da.principal_amount,
  da.total_amount,
  da.interest_rate,
  da.interest_type,
  da.num_installments,
  da.frequency,
  da.start_date,
  da.status,
  da.description,
  da.bank_name,
  da.account_number,
  da.account_name,
  da.lender_confirmed,
  da.lender_confirmed_at,
  da.lender_confirmed_ip,
  da.lender_confirmed_device,
  da.borrower_confirmed,
  da.borrower_confirmed_at,
  da.borrower_confirmed_ip,
  da.borrower_confirmed_device,
  da.transfer_slip_url,
  da.transferred_at,
  da.borrower_confirmed_transfer,
  da.borrower_confirmed_transfer_at,
  da.agreement_text,
  da.reschedule_fee_rate,
  da.reschedule_interest_multiplier,
  da.created_at,
  da.updated_at
FROM public.debt_agreements da
WHERE da.lender_id = auth.uid() OR da.borrower_id = auth.uid();

CREATE OR REPLACE FUNCTION public.create_agreement_with_installments(
  p_lender_id uuid,
  p_borrower_id uuid DEFAULT NULL,
  p_borrower_phone text DEFAULT NULL,
  p_borrower_name text DEFAULT NULL,
  p_principal_amount numeric,
  p_interest_rate numeric DEFAULT 0,
  p_interest_type text DEFAULT 'none',
  p_total_amount numeric,
  p_num_installments integer,
  p_frequency text DEFAULT 'monthly',
  p_start_date date,
  p_description text DEFAULT NULL,
  p_reschedule_fee_rate numeric DEFAULT 5,
  p_reschedule_interest_multiplier numeric DEFAULT 1,
  p_bank_name text DEFAULT NULL,
  p_account_number text DEFAULT NULL,
  p_account_name text DEFAULT NULL,
  p_installments jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_agreement_id uuid;
  v_installment_count integer;
  v_expected_installment_count integer;
  v_installment_sum numeric;
BEGIN
  IF v_user_id IS NULL OR v_user_id <> p_lender_id THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_borrower_id IS NOT NULL AND p_borrower_id = p_lender_id THEN
    RAISE EXCEPTION 'Borrower cannot be the same as lender';
  END IF;

  IF p_installments IS NULL OR jsonb_typeof(p_installments) <> 'array' THEN
    RAISE EXCEPTION 'Invalid installments payload';
  END IF;

  v_installment_count := jsonb_array_length(p_installments);
  v_expected_installment_count := COALESCE(p_num_installments, 0);

  IF v_installment_count <> v_expected_installment_count THEN
    RAISE EXCEPTION 'Installment count mismatch';
  END IF;

  SELECT COALESCE(SUM((item ->> 'amount')::numeric), 0)
  INTO v_installment_sum
  FROM jsonb_array_elements(p_installments) AS item;

  IF ABS(v_installment_sum - p_total_amount) > 0.01 THEN
    RAISE EXCEPTION 'Installment total does not match agreement total';
  END IF;

  INSERT INTO public.debt_agreements (
    lender_id,
    borrower_id,
    borrower_phone,
    borrower_name,
    principal_amount,
    interest_rate,
    interest_type,
    total_amount,
    num_installments,
    frequency,
    start_date,
    description,
    reschedule_fee_rate,
    reschedule_interest_multiplier,
    bank_name,
    account_number,
    account_name,
    lender_confirmed,
    lender_confirmed_at
  )
  VALUES (
    p_lender_id,
    p_borrower_id,
    p_borrower_phone,
    p_borrower_name,
    p_principal_amount,
    p_interest_rate,
    p_interest_type,
    p_total_amount,
    p_num_installments,
    p_frequency,
    p_start_date,
    p_description,
    p_reschedule_fee_rate,
    p_reschedule_interest_multiplier,
    p_bank_name,
    p_account_number,
    p_account_name,
    true,
    now()
  )
  RETURNING id INTO v_agreement_id;

  INSERT INTO public.installments (
    agreement_id,
    installment_number,
    due_date,
    amount,
    principal_portion,
    interest_portion
  )
  SELECT
    v_agreement_id,
    item.installment_number,
    item.due_date,
    item.amount,
    item.principal_portion,
    item.interest_portion
  FROM jsonb_to_recordset(p_installments) AS item(
    installment_number integer,
    due_date date,
    amount numeric,
    principal_portion numeric,
    interest_portion numeric
  );

  RETURN jsonb_build_object(
    'success', true,
    'agreement_id', v_agreement_id,
    'installments_created', v_installment_count
  );
END;
$$;
