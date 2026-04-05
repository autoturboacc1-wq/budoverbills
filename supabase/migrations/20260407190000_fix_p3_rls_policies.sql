-- Fix P3 (low priority) RLS bugs:
--   BUG-RLS-20: Avatar cleanup on account deletion
--   BUG-RLS-23: reschedule_requests policies missing public. prefix
--   BUG-RLS-25: chat_rooms UPDATE policy allows participants to reset pending_action_type
--   BUG-RLS-28: chat-attachments bucket missing MIME type and size limits
--   BUG-RLS-29: Lock ordering inconsistency in payment RPCs (deadlock risk)

-- ============================================================
-- BUG-RLS-20: Delete avatar from storage on account deletion
-- ============================================================

CREATE OR REPLACE FUNCTION public.delete_user_avatar_on_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_avatar_url text;
  v_storage_path text;
BEGIN
  -- Read avatar_url from profiles before the cascade delete removes it
  SELECT avatar_url
  INTO v_avatar_url
  FROM public.profiles
  WHERE user_id = OLD.id;

  IF v_avatar_url IS NOT NULL AND v_avatar_url <> '' THEN
    -- Extract the storage object path from the URL.
    -- Supabase CDN URLs look like: .../storage/v1/object/public/avatars/<path>
    -- We need just the part after the bucket name.
    v_storage_path := regexp_replace(
      v_avatar_url,
      '^.*/storage/v1/object/(?:public|authenticated)/avatars/',
      ''
    );

    IF v_storage_path IS NOT NULL AND v_storage_path <> '' AND v_storage_path <> v_avatar_url THEN
      DELETE FROM storage.objects
      WHERE bucket_id = 'avatars'
        AND name = v_storage_path;
    END IF;
  END IF;

  RETURN OLD;
END;
$$;

-- Fire BEFORE DELETE so profiles row (with avatar_url) still exists when trigger runs.
-- auth.users DELETE cascades to public.profiles, so we hook at the auth.users level.
DROP TRIGGER IF EXISTS on_auth_user_deleted_cleanup_avatar ON auth.users;
CREATE TRIGGER on_auth_user_deleted_cleanup_avatar
  BEFORE DELETE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.delete_user_avatar_on_delete();

-- ============================================================
-- BUG-RLS-23: Add public. prefix to reschedule_requests policies
-- ============================================================

DROP POLICY IF EXISTS "Borrowers can create reschedule requests" ON public.reschedule_requests;
DROP POLICY IF EXISTS "Parties can view reschedule requests"     ON public.reschedule_requests;
DROP POLICY IF EXISTS "Lenders can update reschedule requests"   ON public.reschedule_requests;
DROP POLICY IF EXISTS "Borrowers can delete pending requests"    ON public.reschedule_requests;

CREATE POLICY "Borrowers can create reschedule requests"
ON public.reschedule_requests
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.debt_agreements da
    WHERE da.id = reschedule_requests.agreement_id
      AND da.borrower_id = auth.uid()
  )
);

CREATE POLICY "Parties can view reschedule requests"
ON public.reschedule_requests
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.debt_agreements da
    WHERE da.id = reschedule_requests.agreement_id
      AND (da.lender_id = auth.uid() OR da.borrower_id = auth.uid())
  )
);

CREATE POLICY "Lenders can update reschedule requests"
ON public.reschedule_requests
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.debt_agreements da
    WHERE da.id = reschedule_requests.agreement_id
      AND da.lender_id = auth.uid()
  )
);

CREATE POLICY "Borrowers can delete pending requests"
ON public.reschedule_requests
FOR DELETE
USING (
  requested_by = auth.uid() AND status = 'pending'
);

-- ============================================================
-- BUG-RLS-25: Restrict chat_rooms UPDATE so only non-system
-- fields (last_message, last_message_at, unread counts) can be
-- changed by participants. pending_action_type, has_pending_action,
-- pending_action_for, and room_type are managed by triggers only.
-- ============================================================

DROP POLICY IF EXISTS "Users can update their own chat rooms" ON public.chat_rooms;

CREATE POLICY "Users can update their own chat rooms"
ON public.chat_rooms
FOR UPDATE
USING (auth.uid() = user1_id OR auth.uid() = user2_id)
WITH CHECK (
  -- Participants may only change messaging/read-state columns.
  -- System-owned fields must remain unchanged.
  (auth.uid() = user1_id OR auth.uid() = user2_id)
  AND pending_action_type = (SELECT cr.pending_action_type FROM public.chat_rooms cr WHERE cr.id = chat_rooms.id)
  AND has_pending_action   = (SELECT cr.has_pending_action   FROM public.chat_rooms cr WHERE cr.id = chat_rooms.id)
  AND pending_action_for   IS NOT DISTINCT FROM (SELECT cr.pending_action_for FROM public.chat_rooms cr WHERE cr.id = chat_rooms.id)
  AND room_type            = (SELECT cr.room_type            FROM public.chat_rooms cr WHERE cr.id = chat_rooms.id)
);

-- ============================================================
-- BUG-RLS-28: Add MIME type and size limits to chat-attachments
-- ============================================================

UPDATE storage.buckets
SET
  allowed_mime_types = ARRAY[
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'audio/webm',
    'audio/ogg'
  ],
  file_size_limit = 10485760  -- 10 MB
WHERE id = 'chat-attachments';

-- ============================================================
-- BUG-RLS-29: Consistent lock ordering in payment RPCs
-- Always acquire locks in this order to avoid deadlocks:
--   1. debt_agreements (parent)
--   2. installments (child)
--   3. slip_verifications (grandchild)
--
-- confirm_installment_payment and reject_installment_payment
-- previously locked installments BEFORE debt_agreements, which
-- is the reverse of process_extra_payment. Rewrite them to lock
-- debt_agreements first.
-- ============================================================

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
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Step 1: Resolve agreement_id without locking yet
  SELECT agreement_id
  INTO v_agreement_id
  FROM public.installments
  WHERE id = p_installment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Installment not found';
  END IF;

  -- Step 2: Lock agreement first (parent → child ordering)
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

  -- Step 3: Lock installment
  SELECT *
  INTO v_installment
  FROM public.installments
  WHERE id = p_installment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Installment not found';
  END IF;

  -- Step 4: Lock verification
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
    verified_at     = COALESCE(p_verified_at, now())
  WHERE id = p_verification_id;

  UPDATE public.installments
  SET
    confirmed_by_lender = true,
    status              = 'paid',
    paid_at             = COALESCE(p_verified_at, now())
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
    'success',               true,
    'verification_id',       p_verification_id,
    'installment_id',        p_installment_id,
    'verified_amount',       p_verified_amount,
    'extra_amount',          v_extra_amount,
    'extra_payment_result',  v_extra_result
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
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Step 1: Resolve agreement_id without locking yet
  SELECT agreement_id
  INTO v_agreement_id
  FROM public.installments
  WHERE id = p_installment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Installment not found';
  END IF;

  -- Step 2: Lock agreement first (parent → child ordering)
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

  -- Step 3: Lock installment
  SELECT *
  INTO v_installment
  FROM public.installments
  WHERE id = p_installment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Installment not found';
  END IF;

  -- Step 4: Lock verification
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
    'success',          true,
    'verification_id',  p_verification_id,
    'installment_id',   p_installment_id
  );
END;
$$;
