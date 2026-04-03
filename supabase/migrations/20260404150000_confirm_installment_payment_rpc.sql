-- Atomic installment confirmation/rejection RPCs.

CREATE OR REPLACE FUNCTION public.confirm_installment_payment(
  p_installment_id uuid,
  p_verification_id uuid,
  p_verified_amount numeric,
  p_verified_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_installment public.installments%ROWTYPE;
  v_verification public.slip_verifications%ROWTYPE;
  v_agreement public.debt_agreements%ROWTYPE;
  v_extra_amount numeric := 0;
  v_extra_result jsonb := '{}'::jsonb;
  v_notification_id uuid;
  v_is_fee boolean;
  v_installment_label text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT *
  INTO v_installment
  FROM public.installments
  WHERE id = p_installment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Installment not found';
  END IF;

  SELECT *
  INTO v_agreement
  FROM public.debt_agreements
  WHERE id = v_installment.agreement_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agreement not found';
  END IF;

  IF v_agreement.lender_id <> v_user_id THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT *
  INTO v_verification
  FROM public.slip_verifications
  WHERE id = p_verification_id
    AND installment_id = p_installment_id
    AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending verification not found';
  END IF;

  IF v_verification.agreement_id <> v_agreement.id THEN
    RAISE EXCEPTION 'Verification does not match agreement';
  END IF;

  IF p_verified_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid verified amount';
  END IF;

  UPDATE public.slip_verifications
  SET
    verified_amount = p_verified_amount,
    verified_by = v_user_id,
    status = 'approved',
    verified_at = COALESCE(p_verified_at, now())
  WHERE id = p_verification_id;

  UPDATE public.installments
  SET
    confirmed_by_lender = true,
    status = 'paid',
    paid_at = COALESCE(p_verified_at, now())
  WHERE id = p_installment_id;

  v_is_fee := COALESCE(v_installment.principal_portion, 0) = 0 AND COALESCE(v_installment.amount, 0) > 0;
  v_installment_label := CASE
    WHEN v_is_fee THEN 'ค่าเลื่อนงวด'
    ELSE format('งวดที่ %s', v_installment.installment_number)
  END;

  IF p_verified_amount > v_installment.amount THEN
    v_extra_amount := ROUND(p_verified_amount - v_installment.amount, 2);
    v_extra_result := public.process_extra_payment(v_agreement.id, v_extra_amount);
  END IF;

  IF v_agreement.borrower_id IS NOT NULL THEN
    PERFORM public.create_notification(
      v_agreement.borrower_id,
      'payment_confirmed',
      CASE
        WHEN v_extra_amount > 0 THEN 'ยืนยันการชำระ + ชำระเพิ่มเติม'
        WHEN v_is_fee THEN 'ยืนยันการชำระค่าเลื่อนงวด'
        ELSE 'ยืนยันการชำระแล้ว'
      END,
      CASE
        WHEN v_extra_amount > 0 THEN format('%s ยืนยันแล้ว + ตัดเงินต้นเพิ่ม ฿%s', v_installment_label, to_char(v_extra_amount, 'FM999G999G999G990D00'))
        ELSE format('%s เจ้าหนี้ยืนยันยอด ฿%s และรับเงินแล้ว', v_installment_label, to_char(p_verified_amount, 'FM999G999G999G990D00'))
      END,
      'installment',
      p_installment_id
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'verification_id', p_verification_id,
    'installment_id', p_installment_id,
    'verified_amount', p_verified_amount,
    'extra_amount', v_extra_amount,
    'extra_payment_result', v_extra_result
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_installment_payment(
  p_installment_id uuid,
  p_verification_id uuid,
  p_reason text DEFAULT 'ยอดเงินไม่ตรงกับสลิป',
  p_rejected_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_installment public.installments%ROWTYPE;
  v_verification public.slip_verifications%ROWTYPE;
  v_agreement public.debt_agreements%ROWTYPE;
  v_is_fee boolean;
  v_installment_label text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT *
  INTO v_installment
  FROM public.installments
  WHERE id = p_installment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Installment not found';
  END IF;

  SELECT *
  INTO v_agreement
  FROM public.debt_agreements
  WHERE id = v_installment.agreement_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agreement not found';
  END IF;

  IF v_agreement.lender_id <> v_user_id THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT *
  INTO v_verification
  FROM public.slip_verifications
  WHERE id = p_verification_id
    AND installment_id = p_installment_id
    AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending verification not found';
  END IF;

  UPDATE public.slip_verifications
  SET
    status = 'rejected',
    rejection_reason = COALESCE(NULLIF(btrim(p_reason), ''), 'ยอดเงินไม่ตรงกับสลิป'),
    verified_by = v_user_id,
    verified_amount = NULL,
    verified_at = COALESCE(p_rejected_at, now())
  WHERE id = p_verification_id;

  UPDATE public.installments
  SET
    payment_proof_url = NULL,
    status = 'pending'
  WHERE id = p_installment_id;

  v_is_fee := COALESCE(v_installment.principal_portion, 0) = 0 AND COALESCE(v_installment.amount, 0) > 0;
  v_installment_label := CASE
    WHEN v_is_fee THEN 'ค่าเลื่อนงวด'
    ELSE format('งวดที่ %s', v_installment.installment_number)
  END;

  IF v_agreement.borrower_id IS NOT NULL THEN
    PERFORM public.create_notification(
      v_agreement.borrower_id,
      'payment_rejected',
      'ยอดเงินไม่ตรง',
      format(
        '%s: เจ้าหนี้แจ้งว่ายอดเงินที่กรอก (฿%s) ไม่ตรงกับสลิป กรุณาตรวจสอบและส่งใหม่',
        v_installment_label,
        to_char(v_verification.submitted_amount, 'FM999G999G999G990D00')
      ),
      'installment',
      p_installment_id
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'verification_id', p_verification_id,
    'installment_id', p_installment_id
  );
END;
$$;
