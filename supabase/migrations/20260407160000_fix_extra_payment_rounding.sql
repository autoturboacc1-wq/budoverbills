-- Fix BUG-PAY-03: principal rounding drift in process_extra_payment.
-- A 1-cent gap could persist forever when ROUND(...,2) accumulated tiny
-- floating-point residuals across installments.  We now clamp any remaining
-- principal that is < 0.01 to exactly 0 after the amortisation loop.

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

  SELECT COALESCE(SUM(ROUND(principal_portion, 2)), 0)
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

    IF v_remaining_payment >= ROUND(v_installment.principal_portion, 2) THEN
      UPDATE public.installments
      SET
        status = 'paid',
        paid_at = now(),
        confirmed_by_lender = true
      WHERE id = v_installment.id;

      v_remaining_payment := ROUND(v_remaining_payment - ROUND(v_installment.principal_portion, 2), 2);
      -- Clamp sub-cent residual to zero
      IF v_remaining_payment < 0.01 THEN
        v_remaining_payment := 0;
      END IF;
      v_closed_count := v_closed_count + 1;
    ELSIF v_agreement.interest_type = 'flat' THEN
      v_current_principal := ROUND(GREATEST(0, ROUND(v_installment.principal_portion, 2) - v_remaining_payment), 2);
      -- Clamp sub-cent residual principal to zero
      IF v_current_principal < 0.01 THEN
        v_current_principal := 0;
      END IF;
      v_current_interest := ROUND(COALESCE(v_installment.interest_portion, 0), 2);
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
    SELECT COUNT(*), COALESCE(SUM(ROUND(principal_portion, 2)), 0)
    INTO v_remaining_installments, v_remaining_principal
    FROM public.installments
    WHERE agreement_id = p_agreement_id
      AND status <> 'paid'
      AND principal_portion > 0;

    IF v_remaining_installments > 0 AND v_remaining_principal > 0 THEN
      v_remaining_principal := ROUND(GREATEST(0, ROUND(v_total_remaining_principal, 2) - v_requested_payment), 2);
      -- Clamp sub-cent residual principal to zero
      IF v_remaining_principal < 0.01 THEN
        v_remaining_principal := 0;
      END IF;

      IF v_agreement.frequency = 'daily' THEN
        v_periods_per_year := 365;
      ELSIF v_agreement.frequency = 'weekly' THEN
        v_periods_per_year := 52;
      ELSE
        v_periods_per_year := 12;
      END IF;

      v_period_rate := (COALESCE(v_agreement.interest_rate, 0) / 100.0) / v_periods_per_year;
      v_payment := 0;

      IF v_period_rate > 0 AND v_remaining_principal > 0 THEN
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
          -- Last installment absorbs any remaining rounding residual exactly
          v_current_principal := ROUND(v_remaining_principal, 2);
          v_current_interest := 0;
        ELSE
          v_current_interest := ROUND(v_remaining_principal * v_period_rate, 2);
          v_current_principal := ROUND(GREATEST(0, ROUND(v_payment, 2) - v_current_interest), 2);
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
        -- Clamp sub-cent residual to zero so it cannot persist between iterations
        IF v_remaining_principal < 0.01 THEN
          v_remaining_principal := 0;
        END IF;
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
