-- Harden remaining high-priority security paths discovered in the audit.

ALTER TABLE public.admin_otp
  ADD COLUMN IF NOT EXISTS failed_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until timestamptz;

CREATE INDEX IF NOT EXISTS idx_admin_otp_locked_until
  ON public.admin_otp (locked_until)
  WHERE locked_until IS NOT NULL;

DROP POLICY IF EXISTS "Users can view tips" ON public.tips;
CREATE POLICY "Users can view tips"
ON public.tips
FOR SELECT
USING (
  auth.uid() = user_id
  OR is_anonymous = false
);

DROP POLICY IF EXISTS "Users can insert own points" ON public.user_points;
CREATE POLICY "Users can insert own points"
  ON public.user_points FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND total_points = 0
    AND lifetime_points = 0
    AND daily_earned_today = 0
  );

DROP POLICY IF EXISTS "Users can insert own subscription" ON public.subscriptions;

CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_message TEXT,
  p_related_type TEXT DEFAULT NULL,
  p_related_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notification_id UUID;
  v_actor_id UUID := auth.uid();
  v_actor_role TEXT := COALESCE(auth.role(), '');
  v_is_internal_call BOOLEAN := COALESCE(current_setting('app.notification_source', true), '') = 'system';
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Notification target is required';
  END IF;

  IF NOT v_is_internal_call
     AND v_actor_role <> 'service_role'
     AND (
       v_actor_id IS NULL
       OR (v_actor_id <> p_user_id AND NOT public.has_role(v_actor_id, 'admin'))
     ) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  INSERT INTO public.notifications (user_id, type, title, message, related_type, related_id)
  VALUES (p_user_id, p_type, p_title, p_message, p_related_type, p_related_id)
  RETURNING id INTO v_notification_id;
  
  RETURN v_notification_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_activity(
  p_user_id UUID,
  p_action_type TEXT,
  p_action_category TEXT DEFAULT 'general',
  p_metadata JSONB DEFAULT '{}',
  p_is_suspicious BOOLEAN DEFAULT false
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_log_id UUID;
  v_actor_id UUID := auth.uid();
  v_actor_role TEXT := COALESCE(auth.role(), '');
BEGIN
  IF p_user_id IS NOT NULL
     AND v_actor_role <> 'service_role'
     AND (v_actor_id IS NULL OR v_actor_id <> p_user_id) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  INSERT INTO public.activity_logs (
    user_id,
    action_type,
    action_category,
    metadata,
    is_suspicious
  ) VALUES (
    p_user_id,
    p_action_type,
    p_action_category,
    p_metadata,
    p_is_suspicious
  )
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_tip(
  p_user_id uuid,
  p_amount numeric,
  p_currency text DEFAULT 'THB',
  p_message text DEFAULT NULL,
  p_display_name text DEFAULT NULL,
  p_is_anonymous boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tip_id uuid;
  v_actor_id uuid := auth.uid();
  v_actor_role text := COALESCE(auth.role(), '');
BEGIN
  IF v_actor_role <> 'service_role'
     AND (
       (p_user_id IS NOT NULL AND (v_actor_id IS NULL OR v_actor_id <> p_user_id))
       OR (p_user_id IS NULL AND v_actor_id IS NULL)
     ) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  INSERT INTO public.tips (user_id, amount, currency, message, display_name, is_anonymous, status)
  VALUES (p_user_id, p_amount, p_currency, p_message, p_display_name, p_is_anonymous, 'completed')
  RETURNING id INTO v_tip_id;
  
  RETURN v_tip_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_admin_otp(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_otp TEXT;
  v_actor_id UUID := auth.uid();
  v_actor_role TEXT := COALESCE(auth.role(), '');
BEGIN
  IF v_actor_role <> 'service_role' AND (v_actor_id IS NULL OR v_actor_id <> p_user_id) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  DELETE FROM public.admin_otp WHERE user_id = p_user_id;

  v_otp := LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');

  INSERT INTO public.admin_otp (user_id, otp_code, expires_at, failed_attempts, locked_until)
  VALUES (p_user_id, v_otp, now() + interval '10 minutes', 0, NULL);

  RETURN v_otp;
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_admin_otp_and_issue_session(
  p_user_id uuid,
  p_otp text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_result := public.verify_admin_otp(p_user_id, p_otp);

  IF COALESCE((v_result ->> 'success')::boolean, false) IS NOT TRUE THEN
    RETURN v_result;
  END IF;

  RETURN public.issue_admin_session(p_user_id, 'otp');
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
    PERFORM set_config('app.notification_source', 'system', true);
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
    PERFORM set_config('app.notification_source', 'system', true);
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
