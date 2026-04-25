-- Link borrowers by explicit user_code on the client, or by one-time invite
-- token when the lender does not know the borrower's code.
--
-- This intentionally does not match profiles by phone number. A phone number is
-- useful contact metadata, but it is not strong enough proof that the current
-- account is the intended counterparty.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.debt_agreements
ADD COLUMN IF NOT EXISTS invitation_token_hash text UNIQUE,
ADD COLUMN IF NOT EXISTS invitation_claimed_at timestamptz;

DROP FUNCTION IF EXISTS public.create_agreement_with_installments(
  uuid, uuid, text, text, numeric, numeric, text, numeric, integer, text, date,
  text, numeric, numeric, text, text, text, jsonb
);

DROP FUNCTION IF EXISTS public.create_agreement_with_installments(
  uuid, uuid, text, text, numeric, numeric, text, numeric, integer, text, date,
  text, numeric, numeric, text, text, text, jsonb, text
);

CREATE FUNCTION public.create_agreement_with_installments(
  p_lender_id uuid,
  p_borrower_id uuid,
  p_borrower_phone text,
  p_borrower_name text,
  p_principal_amount numeric,
  p_interest_rate numeric,
  p_interest_type text,
  p_total_amount numeric,
  p_num_installments integer,
  p_frequency text,
  p_start_date date,
  p_description text,
  p_reschedule_fee_rate numeric,
  p_reschedule_interest_multiplier numeric,
  p_bank_name text,
  p_account_number text,
  p_account_name text,
  p_installments jsonb,
  p_invitation_token text
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
  v_quota jsonb;
  v_free_remaining integer := 0;
  v_credits integer := 0;
  v_invitation_token text := NULLIF(btrim(COALESCE(p_invitation_token, '')), '');
  v_invitation_token_hash text;
BEGIN
  IF v_user_id IS NULL OR v_user_id <> p_lender_id THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_borrower_id IS NOT NULL AND p_borrower_id = p_lender_id THEN
    RAISE EXCEPTION 'Borrower cannot be the same as lender';
  END IF;

  IF p_borrower_id IS NULL THEN
    IF v_invitation_token IS NULL OR length(v_invitation_token) < 32 THEN
      RAISE EXCEPTION 'Invitation token is required';
    END IF;

    v_invitation_token_hash := encode(digest(v_invitation_token, 'sha256'), 'hex');
  END IF;

  v_quota := public.can_create_agreement_free(p_lender_id);
  IF COALESCE((v_quota ->> 'can_create_free')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Agreement quota exceeded';
  END IF;

  v_free_remaining := COALESCE((v_quota ->> 'free_remaining')::integer, 0);
  v_credits := COALESCE((v_quota ->> 'credits')::integer, 0);

  IF v_free_remaining > 0 THEN
    IF public.use_free_agreement_slot(p_lender_id) IS NOT TRUE THEN
      RAISE EXCEPTION 'Unable to consume free agreement slot';
    END IF;
  ELSIF v_credits > 0 THEN
    IF public.use_agreement_credit(p_lender_id) IS NOT TRUE THEN
      RAISE EXCEPTION 'Unable to consume agreement credit';
    END IF;
  ELSE
    RAISE EXCEPTION 'Agreement quota exceeded';
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
    lender_confirmed_at,
    invitation_token_hash
  )
  VALUES (
    p_lender_id,
    p_borrower_id,
    NULLIF(btrim(COALESCE(p_borrower_phone, '')), ''),
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
    now(),
    v_invitation_token_hash
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
    'borrower_id', p_borrower_id,
    'invitation_required', p_borrower_id IS NULL,
    'installments_created', v_installment_count
  );
END;
$$;

DROP FUNCTION IF EXISTS public.claim_agreement_invitation(text);

CREATE FUNCTION public.claim_agreement_invitation(
  p_invitation_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_token text := NULLIF(btrim(COALESCE(p_invitation_token, '')), '');
  v_token_hash text;
  v_agreement public.debt_agreements%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF v_token IS NULL OR length(v_token) < 32 THEN
    RAISE EXCEPTION 'Invalid invitation token';
  END IF;

  v_token_hash := encode(digest(v_token, 'sha256'), 'hex');

  SELECT *
  INTO v_agreement
  FROM public.debt_agreements
  WHERE invitation_token_hash = v_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found';
  END IF;

  IF v_agreement.lender_id = v_user_id THEN
    RAISE EXCEPTION 'Borrower cannot be the same as lender';
  END IF;

  IF v_agreement.status <> 'pending_confirmation' THEN
    RAISE EXCEPTION 'Agreement is not pending confirmation';
  END IF;

  IF v_agreement.borrower_id IS NOT NULL AND v_agreement.borrower_id <> v_user_id THEN
    RAISE EXCEPTION 'Invitation already claimed';
  END IF;

  PERFORM set_config('app.agreement_mutation_source', 'rpc', true);

  UPDATE public.debt_agreements
  SET
    borrower_id = v_user_id,
    invitation_token_hash = NULL,
    invitation_claimed_at = COALESCE(invitation_claimed_at, now()),
    updated_at = now()
  WHERE id = v_agreement.id;

  RETURN jsonb_build_object(
    'success', true,
    'agreement_id', v_agreement.id
  );
END;
$$;
