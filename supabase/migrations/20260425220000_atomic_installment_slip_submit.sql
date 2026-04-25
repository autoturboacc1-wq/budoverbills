-- Server-owned, atomic payment-slip submission.
--
-- Background: today the borrower client orchestrates four mutations across
-- two services to record an installment payment:
--   1. upload file to Supabase Storage (payment-slips bucket)
--   2. INSERT slip_verifications
--   3. UPDATE installments (payment_proof_url, status)
--   4. INSERT notifications
-- Steps 2-4 each have their own RLS path and the only safety net is a
-- best-effort client try/catch that may or may not delete the storage file
-- and rollback the slip_verifications row.  Race conditions, network
-- partitions, and double-submits leave orphan files / duplicate pending
-- verifications / mismatched installment status.
--
-- This migration moves steps 2-4 into a single SECURITY DEFINER RPC that
-- locks the parent rows, validates the storage path format, and writes all
-- three rows atomically.  The client still uploads the file to storage
-- (we cannot lift HTTP storage uploads into Postgres), but if the RPC fails
-- the client's existing cleanup path can delete the orphan.

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

  -- Lock parent agreement first (parent → child ordering matches existing
  -- confirm_installment_payment to avoid deadlocks).
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

  IF v_agreement.status <> 'active' THEN
    RAISE EXCEPTION 'Agreement is not active';
  END IF;

  -- Lock the installment row itself
  SELECT *
  INTO v_installment
  FROM public.installments
  WHERE id = p_installment_id
  FOR UPDATE;

  IF v_installment.confirmed_by_lender OR v_installment.status = 'paid' THEN
    RAISE EXCEPTION 'Installment is already paid';
  END IF;

  -- Reject if there is already a pending verification for this installment
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

  -- Storage path must match `{agreement_id}/installment/{installment_id}-...`
  -- so the slip belongs to this agreement+installment, not someone else's.
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

  -- Insert notification directly.  We can't go through public.create_notification
  -- because that function rejects cross-user calls (the borrower is creating a
  -- notification for the lender).  This RPC runs as SECURITY DEFINER so the
  -- direct INSERT bypasses RLS — which is fine because we've already
  -- authenticated the borrower against the agreement above.
  INSERT INTO public.notifications (user_id, type, title, message, related_type, related_id)
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
    p_installment_id
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

GRANT EXECUTE ON FUNCTION public.submit_installment_slip(uuid, text, numeric) TO authenticated;
