-- Move reschedule request create/reject mutations behind RPCs so the client
-- no longer writes directly to reschedule_requests for those actions.

CREATE OR REPLACE FUNCTION public.create_reschedule_request(
  p_installment_id uuid,
  p_agreement_id uuid,
  p_original_due_date date,
  p_new_due_date date,
  p_principal_per_installment numeric,
  p_interest_per_installment numeric,
  p_current_interest_rate numeric,
  p_interest_type text,
  p_fee_installments integer DEFAULT 1,
  p_custom_fee_rate numeric DEFAULT NULL,
  p_slip_url text DEFAULT NULL,
  p_submitted_amount numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_agreement public.debt_agreements%ROWTYPE;
  v_installment public.installments%ROWTYPE;
  v_base_fee_rate numeric;
  v_applied_fee_rate numeric;
  v_total_fee numeric;
  v_fee_per_installment numeric;
  v_safeguard_applied boolean := false;
  v_fee_installments integer := GREATEST(COALESCE(p_fee_installments, 1), 1);
  v_request public.reschedule_requests%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT *
  INTO v_agreement
  FROM public.debt_agreements
  WHERE id = p_agreement_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agreement not found';
  END IF;

  IF v_agreement.borrower_id <> v_user_id THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT *
  INTO v_installment
  FROM public.installments
  WHERE id = p_installment_id
    AND agreement_id = p_agreement_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Installment not found';
  END IF;

  IF p_interest_type IS DISTINCT FROM 'none' THEN
    v_total_fee := CEIL(COALESCE(p_interest_per_installment, 0) * COALESCE(p_custom_fee_rate, 100) / 100.0);
    v_fee_per_installment := CEIL(v_total_fee / v_fee_installments);
  ELSE
    v_base_fee_rate := COALESCE(p_custom_fee_rate, 5);
    v_safeguard_applied := (v_base_fee_rate * 12 > 15);
    v_applied_fee_rate := CASE
      WHEN v_safeguard_applied THEN GREATEST(1, FLOOR(15 / 12.0))
      ELSE v_base_fee_rate
    END;
    v_total_fee := CEIL(COALESCE(p_principal_per_installment, 0) * v_applied_fee_rate / 100.0);
    v_fee_per_installment := CEIL(v_total_fee / v_fee_installments);
  END IF;

  INSERT INTO public.reschedule_requests (
    installment_id,
    agreement_id,
    requested_by,
    original_due_date,
    new_due_date,
    reschedule_fee,
    fee_installments,
    fee_per_installment,
    original_fee_rate,
    applied_fee_rate,
    safeguard_applied,
    custom_fee_rate,
    slip_url,
    submitted_amount,
    status
  ) VALUES (
    p_installment_id,
    p_agreement_id,
    v_user_id,
    p_original_due_date,
    p_new_due_date,
    v_total_fee,
    v_fee_installments,
    v_fee_per_installment,
    COALESCE(p_custom_fee_rate, 0),
    COALESCE(v_applied_fee_rate, 0),
    v_safeguard_applied,
    p_custom_fee_rate,
    p_slip_url,
    p_submitted_amount,
    'pending'
  )
  RETURNING * INTO v_request;

  RETURN jsonb_build_object(
    'success', true,
    'request_id', v_request.id,
    'reschedule_fee', v_request.reschedule_fee,
    'fee_per_installment', v_request.fee_per_installment,
    'status', v_request.status
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_reschedule_request(
  p_request_id uuid,
  p_rejection_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_request public.reschedule_requests%ROWTYPE;
  v_agreement public.debt_agreements%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT *
  INTO v_request
  FROM public.reschedule_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'Request is not pending';
  END IF;

  SELECT *
  INTO v_agreement
  FROM public.debt_agreements
  WHERE id = v_request.agreement_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agreement not found';
  END IF;

  IF v_agreement.lender_id <> v_user_id THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  UPDATE public.reschedule_requests
  SET
    status = 'rejected',
    approved_by = v_user_id,
    approved_at = now(),
    rejection_reason = p_rejection_reason
  WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'success', true,
    'request_id', p_request_id
  );
END;
$$;
