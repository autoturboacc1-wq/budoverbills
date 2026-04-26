-- Enforce the agreement funding handoff:
-- 1. Lender creation sends terms to the borrower, but is not treated as proof
--    that funds were transferred.
-- 2. Both parties must sign the loan contract before any confirmation.
-- 3. Borrower acceptance records agreement and signed-contract consent only.
-- 4. Lender must upload transfer proof and confirm transfer after borrower
--    acceptance.
-- 5. Borrower must confirm receipt before installment payments are allowed.

CREATE OR REPLACE VIEW public.debt_agreements_secure
WITH (security_invoker = true)
AS
SELECT
  da.id,
  da.lender_id,
  da.borrower_id,
  CASE
    WHEN auth.uid() = da.borrower_id OR da.borrower_confirmed = true
    THEN da.borrower_name
    ELSE '(รอการยืนยัน)'
  END AS borrower_name,
  CASE
    WHEN auth.uid() = da.borrower_id OR da.borrower_confirmed = true
    THEN da.borrower_phone
    ELSE NULL
  END AS borrower_phone,
  da.principal_amount,
  da.total_amount,
  da.interest_rate,
  da.interest_type,
  da.num_installments,
  da.frequency,
  da.start_date,
  da.status,
  da.description,
  da.bank_name,
  da.account_number,
  da.account_name,
  da.lender_confirmed,
  da.lender_confirmed_at,
  da.lender_confirmed_ip,
  da.lender_confirmed_device,
  da.borrower_confirmed,
  da.borrower_confirmed_at,
  da.borrower_confirmed_ip,
  da.borrower_confirmed_device,
  da.transfer_slip_url,
  da.transferred_at,
  da.borrower_confirmed_transfer,
  da.borrower_confirmed_transfer_at,
  da.agreement_text,
  da.reschedule_fee_rate,
  da.reschedule_interest_multiplier,
  da.created_at,
  da.updated_at,
  da.contract_finalized_at,
  da.contract_hash,
  da.contract_template_version
FROM public.debt_agreements da
WHERE da.lender_id = auth.uid() OR da.borrower_id = auth.uid();

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
  p_invitation_token text DEFAULT NULL
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
    false,
    NULL,
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

CREATE OR REPLACE FUNCTION public.confirm_agreement_transfer(
  p_agreement_id uuid,
  p_transfer_slip_url text DEFAULT NULL,
  p_mark_lender_confirmed boolean DEFAULT false,
  p_mark_borrower_confirmed boolean DEFAULT false,
  p_mark_borrower_transfer_confirmed boolean DEFAULT false,
  p_confirmed_at timestamptz DEFAULT now(),
  p_client_ip text DEFAULT NULL,
  p_device_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_agreement public.debt_agreements%ROWTYPE;
  v_lender_display_name text;
  v_lender_first_name text;
  v_lender_last_name text;
  v_lender_name text := 'ผู้ให้ยืม';
  v_borrower_name text := 'ผู้ยืม';
  v_local_time timestamp;
  v_month_name text;
  v_formatted_date text;
  v_confirmation_text text;
  v_confirmed_at timestamptz := COALESCE(p_confirmed_at, now());
  v_effective_transfer_slip_url text;
  v_next_lender_confirmed boolean;
  v_next_borrower_confirmed boolean;
  v_next_borrower_transfer_confirmed boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_mark_lender_confirmed AND p_mark_borrower_confirmed THEN
    RAISE EXCEPTION 'Invalid confirmation request';
  END IF;

  IF p_mark_borrower_confirmed AND p_mark_borrower_transfer_confirmed THEN
    RAISE EXCEPTION 'Borrower must confirm receipt after lender transfer proof';
  END IF;

  SELECT *
  INTO v_agreement
  FROM public.debt_agreements
  WHERE id = p_agreement_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agreement not found';
  END IF;

  IF v_agreement.status NOT IN ('pending_confirmation', 'active') THEN
    RAISE EXCEPTION 'Agreement is not confirmable';
  END IF;

  IF (
    p_mark_borrower_confirmed OR
    p_mark_lender_confirmed OR
    p_mark_borrower_transfer_confirmed
  ) AND v_agreement.contract_finalized_at IS NULL THEN
    RAISE EXCEPTION 'Loan contract must be signed by both parties first';
  END IF;

  IF v_user_id <> v_agreement.lender_id AND v_user_id <> v_agreement.borrower_id THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_mark_lender_confirmed OR (
    p_transfer_slip_url IS NOT NULL AND v_user_id <> v_agreement.lender_id
  ) THEN
    IF v_user_id <> v_agreement.lender_id THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;
  END IF;

  IF p_mark_borrower_confirmed OR p_mark_borrower_transfer_confirmed THEN
    IF v_user_id <> v_agreement.borrower_id THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;
  END IF;

  IF p_mark_borrower_confirmed AND COALESCE(v_agreement.borrower_confirmed, false) THEN
    RAISE EXCEPTION 'Borrower already confirmed agreement';
  END IF;

  IF p_mark_lender_confirmed THEN
    IF NOT COALESCE(v_agreement.borrower_confirmed, false) THEN
      RAISE EXCEPTION 'Borrower must accept agreement before lender transfer confirmation';
    END IF;

    IF COALESCE(v_agreement.lender_confirmed, false) THEN
      RAISE EXCEPTION 'Lender already confirmed transfer';
    END IF;
  END IF;

  v_effective_transfer_slip_url := COALESCE(
    NULLIF(btrim(COALESCE(p_transfer_slip_url, '')), ''),
    NULLIF(btrim(COALESCE(v_agreement.transfer_slip_url, '')), '')
  );

  IF p_mark_lender_confirmed AND v_effective_transfer_slip_url IS NULL THEN
    RAISE EXCEPTION 'Transfer slip is required';
  END IF;

  IF p_mark_borrower_transfer_confirmed THEN
    IF NOT COALESCE(v_agreement.borrower_confirmed, false) THEN
      RAISE EXCEPTION 'Borrower must accept agreement before confirming receipt';
    END IF;

    IF NOT COALESCE(v_agreement.lender_confirmed, false) THEN
      RAISE EXCEPTION 'Lender transfer confirmation is required';
    END IF;

    IF v_effective_transfer_slip_url IS NULL THEN
      RAISE EXCEPTION 'Transfer slip is required';
    END IF;
  END IF;

  SELECT display_name, first_name, last_name
  INTO v_lender_display_name, v_lender_first_name, v_lender_last_name
  FROM public.profiles
  WHERE user_id = v_agreement.lender_id
  LIMIT 1;

  v_lender_name := COALESCE(
    NULLIF(btrim(COALESCE(v_lender_first_name, '') || ' ' || COALESCE(v_lender_last_name, '')), ''),
    NULLIF(btrim(v_lender_display_name), ''),
    'ผู้ให้ยืม'
  );
  v_borrower_name := COALESCE(NULLIF(btrim(v_agreement.borrower_name), ''), 'ผู้ยืม');

  v_local_time := timezone('Asia/Bangkok', v_confirmed_at);
  v_month_name := CASE EXTRACT(MONTH FROM v_local_time)::int
    WHEN 1 THEN 'มกราคม'
    WHEN 2 THEN 'กุมภาพันธ์'
    WHEN 3 THEN 'มีนาคม'
    WHEN 4 THEN 'เมษายน'
    WHEN 5 THEN 'พฤษภาคม'
    WHEN 6 THEN 'มิถุนายน'
    WHEN 7 THEN 'กรกฎาคม'
    WHEN 8 THEN 'สิงหาคม'
    WHEN 9 THEN 'กันยายน'
    WHEN 10 THEN 'ตุลาคม'
    WHEN 11 THEN 'พฤศจิกายน'
    WHEN 12 THEN 'ธันวาคม'
  END;
  v_formatted_date := format(
    '%s %s %s เวลา %s:%s น.',
    EXTRACT(DAY FROM v_local_time)::int,
    v_month_name,
    EXTRACT(YEAR FROM v_local_time)::int,
    lpad(EXTRACT(HOUR FROM v_local_time)::int::text, 2, '0'),
    lpad(EXTRACT(MINUTE FROM v_local_time)::int::text, 2, '0')
  );

  IF p_mark_lender_confirmed THEN
    v_confirmation_text := format(
      'ข้าพเจ้า %s ยืนยันว่าได้โอนเงินจำนวน %s บาท ให้แก่ %s เมื่อวันที่ %s และตกลงรับชำระคืนตามข้อตกลงที่ระบุในแอพ Budoverbills',
      v_lender_name,
      to_char(v_agreement.principal_amount, 'FM999G999G999G990'),
      v_borrower_name,
      v_formatted_date
    );
  ELSIF p_mark_borrower_confirmed THEN
    v_confirmation_text := format(
      'ข้าพเจ้า %s ได้อ่านและยอมรับหนังสือสัญญากู้ยืมเงินที่ลงนามครบถ้วนแล้ว และตกลงจะชำระคืนเงินจำนวน %s บาท ให้แก่ %s ตามเงื่อนไขในสัญญา เมื่อวันที่ %s',
      v_borrower_name,
      to_char(v_agreement.principal_amount, 'FM999G999G999G990'),
      v_lender_name,
      v_formatted_date
    );
  ELSIF p_mark_borrower_transfer_confirmed THEN
    v_confirmation_text := format(
      'ข้าพเจ้า %s ยืนยันว่าได้รับเงินจำนวน %s บาท จาก %s เมื่อวันที่ %s ตามสลิปโอนเงินที่ผู้ให้ยืมอัปโหลดไว้',
      v_borrower_name,
      to_char(v_agreement.principal_amount, 'FM999G999G999G990'),
      v_lender_name,
      v_formatted_date
    );
  END IF;

  v_next_lender_confirmed := CASE
    WHEN p_mark_lender_confirmed THEN true
    ELSE COALESCE(v_agreement.lender_confirmed, false)
  END;
  v_next_borrower_confirmed := CASE
    WHEN p_mark_borrower_confirmed THEN true
    ELSE COALESCE(v_agreement.borrower_confirmed, false)
  END;
  v_next_borrower_transfer_confirmed := CASE
    WHEN p_mark_borrower_transfer_confirmed THEN true
    ELSE COALESCE(v_agreement.borrower_confirmed_transfer, false)
  END;

  PERFORM set_config('app.agreement_mutation_source', 'rpc', true);

  UPDATE public.debt_agreements
  SET
    transfer_slip_url = CASE
      WHEN p_transfer_slip_url IS NOT NULL THEN p_transfer_slip_url
      ELSE transfer_slip_url
    END,
    transferred_at = CASE
      WHEN p_transfer_slip_url IS NOT NULL THEN v_confirmed_at
      ELSE transferred_at
    END,
    lender_confirmed = CASE
      WHEN p_mark_lender_confirmed THEN true
      ELSE lender_confirmed
    END,
    lender_confirmed_ip = CASE
      WHEN p_mark_lender_confirmed THEN p_client_ip
      ELSE lender_confirmed_ip
    END,
    lender_confirmed_device = CASE
      WHEN p_mark_lender_confirmed THEN p_device_id
      ELSE lender_confirmed_device
    END,
    lender_confirmed_at = CASE
      WHEN p_mark_lender_confirmed THEN v_confirmed_at
      ELSE lender_confirmed_at
    END,
    borrower_confirmed = CASE
      WHEN p_mark_borrower_confirmed THEN true
      ELSE borrower_confirmed
    END,
    borrower_confirmed_ip = CASE
      WHEN p_mark_borrower_confirmed THEN p_client_ip
      ELSE borrower_confirmed_ip
    END,
    borrower_confirmed_device = CASE
      WHEN p_mark_borrower_confirmed THEN p_device_id
      ELSE borrower_confirmed_device
    END,
    borrower_confirmed_at = CASE
      WHEN p_mark_borrower_confirmed THEN v_confirmed_at
      ELSE borrower_confirmed_at
    END,
    borrower_confirmed_transfer = CASE
      WHEN p_mark_borrower_transfer_confirmed THEN true
      ELSE borrower_confirmed_transfer
    END,
    borrower_confirmed_transfer_at = CASE
      WHEN p_mark_borrower_transfer_confirmed THEN v_confirmed_at
      ELSE borrower_confirmed_transfer_at
    END,
    agreement_text = CASE
      WHEN v_confirmation_text IS NULL THEN agreement_text
      WHEN COALESCE(agreement_text, '') <> '' THEN agreement_text || E'\n\n---\n\n' || v_confirmation_text
      ELSE v_confirmation_text
    END,
    status = CASE
      WHEN v_next_lender_confirmed
        AND v_next_borrower_confirmed
        AND v_next_borrower_transfer_confirmed
        THEN 'active'
      ELSE status
    END,
    updated_at = now()
  WHERE id = v_agreement.id;

  RETURN jsonb_build_object(
    'success', true,
    'agreement_id', v_agreement.id,
    'lender_confirmed', v_next_lender_confirmed,
    'borrower_confirmed', v_next_borrower_confirmed,
    'borrower_confirmed_transfer', v_next_borrower_transfer_confirmed
  );
END;
$$;

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

  IF v_agreement.status NOT IN ('active', 'rescheduling') THEN
    RAISE EXCEPTION 'Agreement is not ready for installment payment';
  END IF;

  SELECT *
  INTO v_installment
  FROM public.installments
  WHERE id = p_installment_id
  FOR UPDATE;

  IF v_installment.confirmed_by_lender OR v_installment.status = 'paid' THEN
    RAISE EXCEPTION 'Installment is already paid';
  END IF;

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
GRANT EXECUTE ON FUNCTION public.create_agreement_with_installments(
  uuid, uuid, text, text, numeric, numeric, text, numeric, integer, text, date,
  text, numeric, numeric, text, text, text, jsonb, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_agreement_transfer(
  uuid, text, boolean, boolean, boolean, timestamptz, text, text
) TO authenticated;

CREATE OR REPLACE FUNCTION public.sync_chat_room_from_agreement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_room_type chat_room_type;
    v_has_pending BOOLEAN := false;
    v_pending_type pending_action_type := 'none';
    v_pending_for UUID;
    v_has_overdue BOOLEAN;
    v_has_pending_payment BOOLEAN;
    v_has_pending_confirm BOOLEAN;
BEGIN
    IF NEW.status = 'pending_confirmation' THEN
        v_room_type := 'agreement';
        v_pending_type := 'confirm';

        IF NOT COALESCE(NEW.borrower_confirmed, false) THEN
            v_pending_for := NEW.borrower_id;
        ELSIF NOT COALESCE(NEW.lender_confirmed, false) THEN
            v_pending_for := NEW.lender_id;
        ELSIF NEW.transfer_slip_url IS NOT NULL
          AND NOT COALESCE(NEW.borrower_confirmed_transfer, false) THEN
            v_pending_for := NEW.borrower_id;
        END IF;

        v_has_pending := v_pending_for IS NOT NULL;
        IF NOT v_has_pending THEN
            v_pending_type := 'none';
        END IF;
    ELSIF NEW.status = 'active' THEN
        SELECT
            EXISTS(SELECT 1 FROM installments WHERE agreement_id = NEW.id AND status = 'overdue'),
            EXISTS(SELECT 1 FROM installments WHERE agreement_id = NEW.id AND status = 'pending'),
            EXISTS(SELECT 1 FROM installments WHERE agreement_id = NEW.id AND status = 'pending_confirmation')
        INTO v_has_overdue, v_has_pending_payment, v_has_pending_confirm;

        IF v_has_overdue OR v_has_pending_payment THEN
            v_room_type := 'debt';
            v_has_pending := true;
            v_pending_type := 'pay';
            v_pending_for := NEW.borrower_id;
        ELSIF v_has_pending_confirm THEN
            v_room_type := 'debt';
            v_has_pending := true;
            v_pending_type := 'confirm';
            v_pending_for := NEW.lender_id;
        ELSE
            v_room_type := 'agreement';
        END IF;
    ELSE
        v_room_type := 'agreement';
    END IF;

    INSERT INTO public.chat_rooms (
        agreement_id, room_type, has_pending_action, pending_action_type,
        pending_action_for, user1_id, user2_id
    )
    VALUES (
        NEW.id, v_room_type, v_has_pending, v_pending_type,
        v_pending_for, NEW.lender_id, COALESCE(NEW.borrower_id, NEW.lender_id)
    )
    ON CONFLICT (agreement_id) DO UPDATE SET
        room_type = EXCLUDED.room_type,
        has_pending_action = EXCLUDED.has_pending_action,
        pending_action_type = EXCLUDED.pending_action_type,
        pending_action_for = EXCLUDED.pending_action_for,
        user2_id = EXCLUDED.user2_id,
        updated_at = now();

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_chat_room_from_installment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_agreement RECORD;
    v_has_overdue BOOLEAN;
    v_has_pending_payment BOOLEAN;
    v_has_pending_confirm BOOLEAN;
    v_room_type chat_room_type;
    v_has_pending BOOLEAN := false;
    v_pending_type pending_action_type := 'none';
    v_pending_for UUID;
BEGIN
    SELECT * INTO v_agreement FROM debt_agreements WHERE id = NEW.agreement_id;

    IF v_agreement IS NULL THEN
        RETURN NEW;
    END IF;

    IF v_agreement.status = 'pending_confirmation' THEN
        v_room_type := 'agreement';
        v_pending_type := 'confirm';

        IF NOT COALESCE(v_agreement.borrower_confirmed, false) THEN
            v_pending_for := v_agreement.borrower_id;
        ELSIF NOT COALESCE(v_agreement.lender_confirmed, false) THEN
            v_pending_for := v_agreement.lender_id;
        ELSIF v_agreement.transfer_slip_url IS NOT NULL
          AND NOT COALESCE(v_agreement.borrower_confirmed_transfer, false) THEN
            v_pending_for := v_agreement.borrower_id;
        END IF;

        v_has_pending := v_pending_for IS NOT NULL;
        IF NOT v_has_pending THEN
            v_pending_type := 'none';
        END IF;
    ELSE
        SELECT
            EXISTS(SELECT 1 FROM installments WHERE agreement_id = NEW.agreement_id AND status = 'overdue'),
            EXISTS(SELECT 1 FROM installments WHERE agreement_id = NEW.agreement_id AND status = 'pending'),
            EXISTS(SELECT 1 FROM installments WHERE agreement_id = NEW.agreement_id AND status = 'pending_confirmation')
        INTO v_has_overdue, v_has_pending_payment, v_has_pending_confirm;

        IF v_has_overdue OR v_has_pending_payment THEN
            v_room_type := 'debt';
            v_has_pending := true;
            v_pending_type := 'pay';
            v_pending_for := v_agreement.borrower_id;
        ELSIF v_has_pending_confirm THEN
            v_room_type := 'debt';
            v_has_pending := true;
            v_pending_type := 'confirm';
            v_pending_for := v_agreement.lender_id;
        ELSE
            v_room_type := 'agreement';
        END IF;
    END IF;

    UPDATE public.chat_rooms
    SET
        room_type = v_room_type,
        has_pending_action = v_has_pending,
        pending_action_type = v_pending_type,
        pending_action_for = v_pending_for,
        updated_at = now()
    WHERE agreement_id = NEW.agreement_id;

    RETURN NEW;
END;
$$;

UPDATE public.chat_rooms cr
SET
  room_type = 'agreement'::public.chat_room_type,
  has_pending_action = pending_state.pending_for IS NOT NULL,
  pending_action_type = CASE
    WHEN pending_state.pending_for IS NULL THEN 'none'::public.pending_action_type
    ELSE 'confirm'::public.pending_action_type
  END,
  pending_action_for = pending_state.pending_for,
  updated_at = now()
FROM (
  SELECT
    da.id,
    CASE
      WHEN NOT COALESCE(da.borrower_confirmed, false) THEN da.borrower_id
      WHEN NOT COALESCE(da.lender_confirmed, false) THEN da.lender_id
      WHEN da.transfer_slip_url IS NOT NULL
        AND NOT COALESCE(da.borrower_confirmed_transfer, false) THEN da.borrower_id
      ELSE NULL
    END AS pending_for
  FROM public.debt_agreements da
  WHERE da.status = 'pending_confirmation'
) pending_state
WHERE cr.agreement_id = pending_state.id;
