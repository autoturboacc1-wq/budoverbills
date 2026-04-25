-- Allow borrower to re-upload a payment slip while one is still pending.
--
-- Previously submit_installment_slip raised "A pending slip verification
-- already exists" the moment the borrower tried to upload a corrected file.
-- That meant a borrower who picked the wrong image had no self-serve path —
-- they had to ask the lender to reject the slip first.
--
-- This migration replaces that behaviour: if a pending verification submitted
-- by the SAME user already exists, mark it 'superseded' (preserving audit
-- trail) and continue with the new submission inside one transaction.
-- A pending verification owned by a different user is still rejected
-- defensively, even though RLS already prevents that case.
--
-- We also clear the lender's prior unread payment_uploaded notification for
-- this installment so the inbox shows only the current slip, not the stale
-- one. Read notifications are left alone for history.

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
  v_pending      public.slip_verifications%ROWTYPE;
  v_verification_id uuid;
  v_superseded_id uuid;
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

  -- Lock the existing pending verification (if any) so we can either
  -- supersede it (same submitter) or reject the call (different submitter).
  SELECT *
  INTO v_pending
  FROM public.slip_verifications
  WHERE installment_id = p_installment_id
    AND status = 'pending'
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF v_pending.submitted_by IS DISTINCT FROM v_user_id THEN
      RAISE EXCEPTION 'A pending slip verification already exists for this installment';
    END IF;

    UPDATE public.slip_verifications
    SET status      = 'superseded',
        verified_by = v_user_id,
        verified_at = v_now
    WHERE id = v_pending.id;

    v_superseded_id := v_pending.id;
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

  -- Drop the lender's stale unread payment_uploaded notification for this
  -- installment so the inbox does not stack up with one entry per re-upload.
  -- Read notifications are preserved as audit trail.
  IF v_superseded_id IS NOT NULL THEN
    DELETE FROM public.notifications
    WHERE user_id      = v_agreement.lender_id
      AND type         = 'payment_uploaded'
      AND related_type = 'installment'
      AND related_id   = p_installment_id
      AND is_read      = false;
  END IF;

  v_action_url := format('/debt/%s?pay=%s', v_agreement.id, p_installment_id);

  INSERT INTO public.notifications (
    user_id, type, title, message, related_type, related_id, action_url, priority
  )
  VALUES (
    v_agreement.lender_id,
    'payment_uploaded',
    CASE
      WHEN v_superseded_id IS NOT NULL AND v_is_fee THEN 'ผู้ยืมส่งสลิปค่าเลื่อนงวดใหม่'
      WHEN v_superseded_id IS NOT NULL THEN 'ผู้ยืมส่งสลิปใหม่'
      WHEN v_is_fee THEN 'มีการอัปโหลดสลิปค่าเลื่อนงวด'
      ELSE 'มีการอัปโหลดสลิป'
    END,
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
    'extra_amount',      v_extra,
    'superseded_verification_id', v_superseded_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_installment_slip(uuid, text, numeric) TO authenticated;
