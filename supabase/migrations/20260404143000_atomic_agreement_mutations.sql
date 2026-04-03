-- Atomic agreement, extra payment, and reschedule mutation hardening.

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
    lender_confirmed
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
    true
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

CREATE OR REPLACE FUNCTION public.process_extra_payment(
  p_agreement_id uuid,
  p_extra_amount numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_agreement public.debt_agreements%ROWTYPE;
  v_remaining_payment numeric;
  v_requested_payment numeric;
  v_total_remaining_principal numeric;
  v_closed_count integer := 0;
  v_remaining_installments integer := 0;
  v_remaining_principal numeric := 0;
  v_periods_per_year integer := 12;
  v_period_rate numeric := 0;
  v_payment numeric := 0;
  v_last_installment_amount numeric := 0;
  v_installment record;
  v_current_principal numeric;
  v_current_interest numeric;
  v_current_total numeric;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT *
  INTO v_agreement
  FROM public.debt_agreements
  WHERE id = p_agreement_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agreement not found';
  END IF;

  IF v_agreement.lender_id <> v_user_id THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_extra_amount IS NULL OR p_extra_amount <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'principal_reduction', 0,
      'installments_closed', 0,
      'new_last_installment_amount', NULL
    );
  END IF;

  SELECT COALESCE(SUM(principal_portion), 0)
  INTO v_total_remaining_principal
  FROM public.installments
  WHERE agreement_id = p_agreement_id
    AND status <> 'paid'
    AND principal_portion > 0;

  v_requested_payment := LEAST(ROUND(p_extra_amount, 2), ROUND(v_total_remaining_principal, 2));
  v_remaining_payment := v_requested_payment;

  IF v_remaining_payment <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'principal_reduction', 0,
      'installments_closed', 0,
      'new_last_installment_amount', NULL
    );
  END IF;

  FOR v_installment IN
    SELECT id, installment_number, principal_portion, interest_portion, amount
    FROM public.installments
    WHERE agreement_id = p_agreement_id
      AND status <> 'paid'
      AND principal_portion > 0
    ORDER BY installment_number DESC
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining_payment <= 0;

    IF v_remaining_payment >= v_installment.principal_portion THEN
      UPDATE public.installments
      SET
        status = 'paid',
        paid_at = now(),
        confirmed_by_lender = true
      WHERE id = v_installment.id;

      v_remaining_payment := ROUND(v_remaining_payment - v_installment.principal_portion, 2);
      v_closed_count := v_closed_count + 1;
    ELSIF v_agreement.interest_type = 'flat' THEN
      v_current_principal := ROUND(GREATEST(0, v_installment.principal_portion - v_remaining_payment), 2);
      v_current_interest := COALESCE(v_installment.interest_portion, 0);
      v_current_total := ROUND(v_current_principal + v_current_interest, 2);

      UPDATE public.installments
      SET
        principal_portion = v_current_principal,
        amount = v_current_total
      WHERE id = v_installment.id;

      v_last_installment_amount := v_current_total;
      v_remaining_payment := 0;
    END IF;
  END LOOP;

  IF v_agreement.interest_type = 'effective' THEN
    SELECT COUNT(*), COALESCE(SUM(principal_portion), 0)
    INTO v_remaining_installments, v_remaining_principal
    FROM public.installments
    WHERE agreement_id = p_agreement_id
      AND status <> 'paid'
      AND principal_portion > 0;

    IF v_remaining_installments > 0 AND v_remaining_principal > 0 THEN
      v_remaining_principal := ROUND(GREATEST(0, v_total_remaining_principal - v_requested_payment), 2);

      IF v_agreement.frequency = 'daily' THEN
        v_periods_per_year := 365;
      ELSIF v_agreement.frequency = 'weekly' THEN
        v_periods_per_year := 52;
      ELSE
        v_periods_per_year := 12;
      END IF;

      v_period_rate := (COALESCE(v_agreement.interest_rate, 0) / 100) / v_periods_per_year;
      v_payment := 0;

      IF v_period_rate > 0 THEN
        v_payment := (
          v_remaining_principal * (v_period_rate * POWER(1 + v_period_rate, v_remaining_installments))
        ) / (POWER(1 + v_period_rate, v_remaining_installments) - 1);
      END IF;

      FOR v_installment IN
        SELECT id, installment_number
        FROM public.installments
        WHERE agreement_id = p_agreement_id
          AND status <> 'paid'
          AND principal_portion > 0
        ORDER BY installment_number ASC
        FOR UPDATE
      LOOP
        IF v_remaining_installments = 1 OR v_period_rate <= 0 THEN
          v_current_principal := ROUND(v_remaining_principal, 2);
          v_current_interest := 0;
        ELSE
          v_current_interest := ROUND(v_remaining_principal * v_period_rate, 2);
          v_current_principal := ROUND(GREATEST(0, v_payment - v_current_interest), 2);
        END IF;

        v_current_total := ROUND(v_current_principal + v_current_interest, 2);

        UPDATE public.installments
        SET
          principal_portion = v_current_principal,
          interest_portion = v_current_interest,
          amount = v_current_total
        WHERE id = v_installment.id;

        v_last_installment_amount := v_current_total;
        v_remaining_principal := ROUND(GREATEST(0, v_remaining_principal - v_current_principal), 2);
        v_remaining_installments := v_remaining_installments - 1;
      END LOOP;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'principal_reduction', ROUND(v_requested_payment - v_remaining_payment, 2),
    'installments_closed', v_closed_count,
    'new_last_installment_amount', v_last_installment_amount
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

  SELECT installment_number
  INTO v_target_installment_number
  FROM public.installments
  WHERE id = v_request.installment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Installment not found';
  END IF;

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
