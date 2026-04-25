-- Add canonical action URLs to payment-collection notifications.
--
-- The notifications table already has action_url and priority columns.  This
-- migration updates the payment RPCs so new in-app notifications open the
-- exact action screen instead of relying on related_id fallback routing.

CREATE OR REPLACE FUNCTION public.submit_installment_slip(
  p_installment_id  uuid,
  p_slip_url        text,
  p_submitted_amount numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id      uuid := auth.uid();
  v_installment  public.installments%ROWTYPE;
  v_agreement    public.debt_agreements%ROWTYPE;
  v_pending_id   uuid;
  v_verification_id uuid;
  v_path_prefix  text;
  v_is_fee       boolean;
  v_label        text;
  v_extra        numeric := 0;
  v_now          timestamptz := now();
  v_action_url   text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF coalesce(btrim(p_slip_url), '') = '' OR length(p_slip_url) > 500 THEN
    RAISE EXCEPTION 'Invalid slip URL';
  END IF;

  IF p_submitted_amount IS NULL OR p_submitted_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid submitted amount';
  END IF;

  SELECT a.*
  INTO v_agreement
  FROM public.installments i
  JOIN public.debt_agreements a ON a.id = i.agreement_id
  WHERE i.id = p_installment_id
  FOR UPDATE OF a;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Installment not found';
  END IF;

  IF v_agreement.borrower_id IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'Only the borrower may submit a payment slip';
  END IF;

  IF v_agreement.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'Agreement is not in a payable state (status: %)', v_agreement.status;
  END IF;

  SELECT *
  INTO v_installment
  FROM public.installments
  WHERE id = p_installment_id
  FOR UPDATE;

  IF v_installment.confirmed_by_lender OR v_installment.status = 'paid' THEN
    RAISE EXCEPTION 'Installment is already paid';
  END IF;

  SELECT id INTO v_pending_id
  FROM public.slip_verifications
  WHERE installment_id = p_installment_id
    AND status = 'pending'
  LIMIT 1;

  IF v_pending_id IS NOT NULL THEN
    RAISE EXCEPTION 'A pending slip verification already exists for this installment';
  END IF;

  IF p_submitted_amount < v_installment.amount THEN
    RAISE EXCEPTION 'Submitted amount is less than the installment amount';
  END IF;

  v_path_prefix := v_agreement.id::text || '/installment/' || p_installment_id::text || '-';
  IF position(v_path_prefix in p_slip_url) <> 1 THEN
    RAISE EXCEPTION 'Slip URL does not belong to this installment';
  END IF;

  v_is_fee := COALESCE(v_installment.principal_portion, 0) = 0
           AND COALESCE(v_installment.amount, 0) > 0;
  v_label := CASE
    WHEN v_is_fee THEN 'ค่าเลื่อนงวด'
    ELSE format('งวดที่ %s', v_installment.installment_number)
  END;

  IF p_submitted_amount > v_installment.amount THEN
    v_extra := ROUND(p_submitted_amount - v_installment.amount, 2);
  END IF;

  INSERT INTO public.slip_verifications (
    installment_id, agreement_id, submitted_by, submitted_amount,
    slip_url, status, created_at
  ) VALUES (
    p_installment_id, v_agreement.id, v_user_id, p_submitted_amount,
    p_slip_url, 'pending', v_now
  )
  RETURNING id INTO v_verification_id;

  UPDATE public.installments
  SET payment_proof_url = p_slip_url,
      status            = CASE WHEN status = 'overdue' THEN 'overdue' ELSE 'pending' END,
      updated_at        = v_now
  WHERE id = p_installment_id;

  v_action_url := format('/debt/%s?pay=%s', v_agreement.id, p_installment_id);

  INSERT INTO public.notifications (
    user_id, type, title, message, related_type, related_id, action_url, priority
  )
  VALUES (
    v_agreement.lender_id,
    'payment_uploaded',
    CASE WHEN v_is_fee THEN 'มีการอัปโหลดสลิปค่าเลื่อนงวด' ELSE 'มีการอัปโหลดสลิป' END,
    CASE
      WHEN v_extra > 0 THEN format('มีการชำระเงิน%s ยอด ฿%s (เกินค่างวด ฿%s) - รอตรวจสอบสลิป',
                                    v_label,
                                    to_char(p_submitted_amount, 'FM999G999G999G990D00'),
                                    to_char(v_extra, 'FM999G999G999G990D00'))
      ELSE format('มีการชำระเงิน%s ยอด ฿%s - รอตรวจสอบสลิป',
                  v_label,
                  to_char(p_submitted_amount, 'FM999G999G999G990D00'))
    END,
    'installment',
    p_installment_id,
    v_action_url,
    'important'::public.notification_priority
  );

  RETURN jsonb_build_object(
    'success',           true,
    'verification_id',   v_verification_id,
    'installment_id',    p_installment_id,
    'submitted_amount',  p_submitted_amount,
    'extra_amount',      v_extra
  );
END;
$$;

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
  v_user_id        uuid := auth.uid();
  v_agreement_id   uuid;
  v_installment    public.installments%ROWTYPE;
  v_verification   public.slip_verifications%ROWTYPE;
  v_agreement      public.debt_agreements%ROWTYPE;
  v_extra_amount   numeric := 0;
  v_extra_result   jsonb   := '{}'::jsonb;
  v_is_fee         boolean;
  v_installment_label text;
  v_now            timestamptz;
  v_remaining_count integer := 0;
  v_status_completed boolean := false;
  v_action_url     text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_now := COALESCE(p_verified_at, now());

  SELECT agreement_id
  INTO v_agreement_id
  FROM public.installments
  WHERE id = p_installment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Installment not found';
  END IF;

  SELECT *
  INTO v_agreement
  FROM public.debt_agreements
  WHERE id = v_agreement_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agreement not found';
  END IF;

  IF v_agreement.lender_id <> v_user_id THEN
    RAISE EXCEPTION 'Forbidden';
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
    verified_by     = v_user_id,
    status          = 'approved',
    verified_at     = v_now
  WHERE id = p_verification_id;

  UPDATE public.installments
  SET
    confirmed_by_lender = true,
    status              = 'paid',
    paid_at             = v_now
  WHERE id = p_installment_id;

  v_is_fee := COALESCE(v_installment.principal_portion, 0) = 0
           AND COALESCE(v_installment.amount, 0) > 0;
  v_installment_label := CASE
    WHEN v_is_fee THEN 'ค่าเลื่อนงวด'
    ELSE format('งวดที่ %s', v_installment.installment_number)
  END;

  IF p_verified_amount > v_installment.amount THEN
    v_extra_amount := ROUND(p_verified_amount - v_installment.amount, 2);
    v_extra_result := public.process_extra_payment(v_agreement.id, v_extra_amount);
  END IF;

  SELECT count(*)
  INTO v_remaining_count
  FROM public.installments
  WHERE agreement_id = v_agreement.id
    AND status NOT IN ('paid', 'rescheduled');

  IF v_remaining_count = 0 AND v_agreement.status = 'active' THEN
    PERFORM set_config('app.agreement_mutation_source', 'rpc', true);
    UPDATE public.debt_agreements
    SET status     = 'completed',
        updated_at = v_now
    WHERE id = v_agreement.id
      AND status = 'active';
    v_status_completed := true;
  END IF;

  IF v_agreement.borrower_id IS NOT NULL THEN
    v_action_url := CASE
      WHEN v_status_completed THEN format('/debt/%s', v_agreement.id)
      ELSE format('/debt/%s?pay=%s', v_agreement.id, p_installment_id)
    END;

    INSERT INTO public.notifications (
      user_id, type, title, message, related_type, related_id, action_url, priority
    )
    VALUES (
      v_agreement.borrower_id,
      CASE WHEN v_status_completed THEN 'agreement_completed' ELSE 'payment_confirmed' END,
      CASE
        WHEN v_status_completed THEN 'ชำระหนี้ครบถ้วนแล้ว'
        WHEN v_extra_amount > 0 THEN 'ยืนยันการชำระ + ชำระเพิ่มเติม'
        WHEN v_is_fee THEN 'ยืนยันการชำระค่าเลื่อนงวด'
        ELSE 'ยืนยันการชำระแล้ว'
      END,
      CASE
        WHEN v_status_completed THEN format('คุณชำระหนี้ครบทุกงวดแล้ว ขอบคุณ!')
        WHEN v_extra_amount > 0 THEN format('%s ยืนยันแล้ว + ตัดเงินต้นเพิ่ม ฿%s', v_installment_label, to_char(v_extra_amount, 'FM999G999G999G990D00'))
        ELSE format('%s เจ้าหนี้ยืนยันยอด ฿%s และรับเงินแล้ว', v_installment_label, to_char(p_verified_amount, 'FM999G999G999G990D00'))
      END,
      CASE WHEN v_status_completed THEN 'agreement' ELSE 'installment' END,
      CASE WHEN v_status_completed THEN v_agreement.id ELSE p_installment_id END,
      v_action_url,
      (CASE WHEN v_status_completed THEN 'info' ELSE 'important' END)::public.notification_priority
    );
  END IF;

  RETURN jsonb_build_object(
    'success',               true,
    'verification_id',       p_verification_id,
    'installment_id',        p_installment_id,
    'verified_amount',       p_verified_amount,
    'extra_amount',          v_extra_amount,
    'extra_payment_result',  v_extra_result,
    'agreement_completed',   v_status_completed
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
  v_user_id       uuid := auth.uid();
  v_agreement_id  uuid;
  v_installment   public.installments%ROWTYPE;
  v_verification  public.slip_verifications%ROWTYPE;
  v_agreement     public.debt_agreements%ROWTYPE;
  v_is_fee        boolean;
  v_installment_label text;
  v_action_url    text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT agreement_id
  INTO v_agreement_id
  FROM public.installments
  WHERE id = p_installment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Installment not found';
  END IF;

  SELECT *
  INTO v_agreement
  FROM public.debt_agreements
  WHERE id = v_agreement_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agreement not found';
  END IF;

  IF v_agreement.lender_id <> v_user_id THEN
    RAISE EXCEPTION 'Forbidden';
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
    status           = 'rejected',
    rejection_reason = COALESCE(NULLIF(btrim(p_reason), ''), 'ยอดเงินไม่ตรงกับสลิป'),
    verified_by      = v_user_id,
    verified_amount  = NULL,
    verified_at      = COALESCE(p_rejected_at, now())
  WHERE id = p_verification_id;

  UPDATE public.installments
  SET
    payment_proof_url = NULL,
    status            = 'pending'
  WHERE id = p_installment_id;

  v_is_fee := COALESCE(v_installment.principal_portion, 0) = 0
           AND COALESCE(v_installment.amount, 0) > 0;
  v_installment_label := CASE
    WHEN v_is_fee THEN 'ค่าเลื่อนงวด'
    ELSE format('งวดที่ %s', v_installment.installment_number)
  END;
  v_action_url := format('/debt/%s?pay=%s', v_agreement.id, p_installment_id);

  IF v_agreement.borrower_id IS NOT NULL THEN
    INSERT INTO public.notifications (
      user_id, type, title, message, related_type, related_id, action_url, priority
    )
    VALUES (
      v_agreement.borrower_id,
      'payment_rejected',
      'ยอดเงินไม่ตรง',
      format(
        '%s: เจ้าหนี้แจ้งว่ายอดเงินที่กรอก (฿%s) ไม่ตรงกับสลิป กรุณาตรวจสอบและส่งใหม่',
        v_installment_label,
        to_char(v_verification.submitted_amount, 'FM999G999G999G990D00')
      ),
      'installment',
      p_installment_id,
      v_action_url,
      'critical'::public.notification_priority
    );
  END IF;

  RETURN jsonb_build_object(
    'success',          true,
    'verification_id',  p_verification_id,
    'installment_id',   p_installment_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_installment_slip(uuid, text, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_installment_payment(uuid, uuid, numeric, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_installment_payment(uuid, uuid, text, timestamptz) TO authenticated;
