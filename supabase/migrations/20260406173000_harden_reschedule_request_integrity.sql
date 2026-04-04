-- Harden reschedule approval/creation invariants.

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

  IF EXISTS (
    SELECT 1
    FROM public.reschedule_requests
    WHERE installment_id = p_installment_id
      AND agreement_id = p_agreement_id
      AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'Pending reschedule request already exists';
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

CREATE OR REPLACE FUNCTION public.approve_reschedule_request(
  p_request_id uuid
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
  v_target_installment_number integer;
  v_days_diff integer;
  v_shifted_count integer := 0;
  v_installment record;
  v_due_date date;
  v_target_installment public.installments%ROWTYPE;
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

  SELECT *
  INTO v_target_installment
  FROM public.installments
  WHERE id = v_request.installment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Installment not found';
  END IF;

  IF v_target_installment.status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending installments can be rescheduled';
  END IF;

  v_target_installment_number := v_target_installment.installment_number;
  v_days_diff := v_request.new_due_date - v_request.original_due_date;

  FOR v_installment IN
    SELECT id, installment_number, due_date, status
    FROM public.installments
    WHERE agreement_id = v_request.agreement_id
      AND installment_number >= v_target_installment_number
      AND status <> 'paid'
    ORDER BY installment_number ASC
    FOR UPDATE
  LOOP
    v_due_date := v_installment.due_date + v_days_diff;
    v_shifted_count := v_shifted_count + 1;

    IF v_installment.id = v_request.installment_id THEN
      UPDATE public.installments
      SET
        due_date = v_due_date,
        status = 'pending',
        original_due_date = v_request.original_due_date
      WHERE id = v_installment.id;
    ELSE
      UPDATE public.installments
      SET due_date = v_due_date
      WHERE id = v_installment.id;
    END IF;
  END LOOP;

  UPDATE public.reschedule_requests
  SET
    status = 'approved',
    approved_by = v_user_id,
    approved_at = now()
  WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'success', true,
    'request_id', p_request_id,
    'shifted_count', v_shifted_count
  );
END;
$$;
