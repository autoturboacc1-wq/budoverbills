-- Persist agreement completion in DB.
--
-- Background: confirm_installment_payment marks the installment as paid and
-- (via process_extra_payment) can also close future installments, but never
-- updates `debt_agreements.status` to 'completed'.  Domain code derives a
-- displayed completion status, but quota functions, history queries, and
-- admin reporting all read the DB column — so a fully paid agreement keeps
-- counting against the user's quota.
--
-- Fix: after the payment-confirmation transaction succeeds, look for any
-- installments that still need attention ('pending' or 'overdue').  If there
-- are none, flip the agreement status to 'completed'.  Rescheduled
-- installments are treated as settled because the rescheduling flow creates
-- new pending installments to replace them.

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

  -- After this confirmation (and any extra-payment cascade) check whether
  -- the agreement still has installments that require action.  Rescheduled
  -- installments are treated as settled because the reschedule flow creates
  -- new pending replacements.
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
    -- Direct insert (the lender calling this RPC isn't allowed to go through
    -- public.create_notification for a cross-user target).
    INSERT INTO public.notifications (user_id, type, title, message, related_type, related_id)
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
      CASE WHEN v_status_completed THEN v_agreement.id ELSE p_installment_id END
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
