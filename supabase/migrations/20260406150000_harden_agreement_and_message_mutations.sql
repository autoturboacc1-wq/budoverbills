-- Harden agreement, installment, and message mutation paths that are still open in the audit.

CREATE OR REPLACE FUNCTION public.can_create_agreement_free(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_free_used integer;
  v_free_limit integer := 2;
  v_credits integer;
  v_actor_id uuid := auth.uid();
  v_actor_role text := COALESCE(auth.role(), '');
BEGIN
  IF v_actor_role <> 'service_role' AND (v_actor_id IS NULL OR v_actor_id <> p_user_id) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  SELECT 
    COALESCE(free_agreements_used, 0),
    COALESCE(agreement_credits, 0)
  INTO v_free_used, v_credits
  FROM public.profiles
  WHERE user_id = p_user_id;
  
  IF v_free_used IS NULL THEN
    v_free_used := 0;
  END IF;

  IF v_credits IS NULL THEN
    v_credits := 0;
  END IF;
  
  RETURN jsonb_build_object(
    'can_create_free', (v_free_used < v_free_limit) OR (v_credits > 0),
    'free_used', v_free_used,
    'free_limit', v_free_limit,
    'free_remaining', GREATEST(0, v_free_limit - v_free_used),
    'credits', v_credits,
    'total_available', GREATEST(0, v_free_limit - v_free_used) + v_credits,
    'fee_amount', 25,
    'fee_currency', 'THB'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_installment_role_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_agreement public.debt_agreements%ROWTYPE;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF v_actor IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT *
  INTO v_agreement
  FROM public.debt_agreements
  WHERE id = OLD.agreement_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agreement not found';
  END IF;

  IF v_actor = v_agreement.borrower_id THEN
    IF NEW.agreement_id IS DISTINCT FROM OLD.agreement_id
      OR NEW.installment_number IS DISTINCT FROM OLD.installment_number
      OR NEW.due_date IS DISTINCT FROM OLD.due_date
      OR NEW.amount IS DISTINCT FROM OLD.amount
      OR NEW.principal_portion IS DISTINCT FROM OLD.principal_portion
      OR NEW.interest_portion IS DISTINCT FROM OLD.interest_portion
      OR NEW.confirmed_by_lender IS DISTINCT FROM OLD.confirmed_by_lender
      OR NEW.paid_at IS DISTINCT FROM OLD.paid_at
      OR NEW.status IS DISTINCT FROM OLD.status
    THEN
      RAISE EXCEPTION 'Borrowers may only attach or replace payment proof';
    END IF;

    RETURN NEW;
  END IF;

  IF v_actor = v_agreement.lender_id THEN
    IF NEW.agreement_id IS DISTINCT FROM OLD.agreement_id
      OR NEW.installment_number IS DISTINCT FROM OLD.installment_number
      OR NEW.due_date IS DISTINCT FROM OLD.due_date
      OR NEW.amount IS DISTINCT FROM OLD.amount
      OR NEW.principal_portion IS DISTINCT FROM OLD.principal_portion
      OR NEW.interest_portion IS DISTINCT FROM OLD.interest_portion
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'Lenders cannot modify installment financial terms directly';
    END IF;

    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Not allowed';
END;
$$;

DROP TRIGGER IF EXISTS enforce_installment_role_updates_trigger ON public.installments;
CREATE TRIGGER enforce_installment_role_updates_trigger
BEFORE UPDATE ON public.installments
FOR EACH ROW
EXECUTE FUNCTION public.enforce_installment_role_updates();

CREATE OR REPLACE FUNCTION public.enforce_message_voice_note_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.sender_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'sender_id must match the authenticated user';
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.sender_id IS DISTINCT FROM OLD.sender_id
      OR NEW.agreement_id IS DISTINCT FROM OLD.agreement_id
      OR NEW.direct_chat_id IS DISTINCT FROM OLD.direct_chat_id
      OR NEW.content IS DISTINCT FROM OLD.content
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
      OR NEW.voice_url IS DISTINCT FROM OLD.voice_url
      OR NEW.voice_duration IS DISTINCT FROM OLD.voice_duration
      OR NEW.image_url IS DISTINCT FROM OLD.image_url
      OR NEW.file_url IS DISTINCT FROM OLD.file_url
    THEN
      RAISE EXCEPTION 'Only read_at may be updated on chat messages';
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS "Users can update installments for their agreements" ON public.installments;
CREATE POLICY "Users can update installments for their agreements"
ON public.installments
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.debt_agreements
    WHERE id = installments.agreement_id
      AND (lender_id = auth.uid() OR borrower_id = auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.debt_agreements
    WHERE id = installments.agreement_id
      AND (lender_id = auth.uid() OR borrower_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "Users can update messages" ON public.messages;
CREATE POLICY "Users can update messages"
ON public.messages FOR UPDATE
USING (
  (agreement_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM debt_agreements da
    WHERE da.id = messages.agreement_id 
    AND (da.lender_id = auth.uid() OR da.borrower_id = auth.uid())
  ))
  OR
  (direct_chat_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM direct_chats dc
    WHERE dc.id = messages.direct_chat_id
    AND (dc.user1_id = auth.uid() OR dc.user2_id = auth.uid())
  ))
)
WITH CHECK (
  (agreement_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM debt_agreements da
    WHERE da.id = messages.agreement_id 
    AND (da.lender_id = auth.uid() OR da.borrower_id = auth.uid())
  ))
  OR
  (direct_chat_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM direct_chats dc
    WHERE dc.id = messages.direct_chat_id
    AND (dc.user1_id = auth.uid() OR dc.user2_id = auth.uid())
  ))
);

CREATE OR REPLACE FUNCTION public.enforce_debt_agreement_role_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_mutation_source text := COALESCE(current_setting('app.agreement_mutation_source', true), '');
  lender_only_changed boolean;
  borrower_only_changed boolean;
  financial_terms_changed boolean;
  status_changed boolean;
BEGIN
  IF v_actor IS NULL THEN
    RETURN NEW;
  END IF;

  lender_only_changed := (
    NEW.bank_name IS DISTINCT FROM OLD.bank_name OR
    NEW.account_number IS DISTINCT FROM OLD.account_number OR
    NEW.account_name IS DISTINCT FROM OLD.account_name OR
    NEW.lender_confirmed IS DISTINCT FROM OLD.lender_confirmed OR
    NEW.lender_confirmed_at IS DISTINCT FROM OLD.lender_confirmed_at OR
    NEW.lender_confirmed_ip IS DISTINCT FROM OLD.lender_confirmed_ip OR
    NEW.lender_confirmed_device IS DISTINCT FROM OLD.lender_confirmed_device OR
    NEW.transfer_slip_url IS DISTINCT FROM OLD.transfer_slip_url OR
    NEW.transferred_at IS DISTINCT FROM OLD.transferred_at
  );

  borrower_only_changed := (
    NEW.borrower_confirmed IS DISTINCT FROM OLD.borrower_confirmed OR
    NEW.borrower_confirmed_at IS DISTINCT FROM OLD.borrower_confirmed_at OR
    NEW.borrower_confirmed_ip IS DISTINCT FROM OLD.borrower_confirmed_ip OR
    NEW.borrower_confirmed_device IS DISTINCT FROM OLD.borrower_confirmed_device OR
    NEW.borrower_confirmed_transfer IS DISTINCT FROM OLD.borrower_confirmed_transfer OR
    NEW.borrower_confirmed_transfer_at IS DISTINCT FROM OLD.borrower_confirmed_transfer_at
  );

  financial_terms_changed := (
    NEW.principal_amount IS DISTINCT FROM OLD.principal_amount OR
    NEW.interest_rate IS DISTINCT FROM OLD.interest_rate OR
    NEW.interest_type IS DISTINCT FROM OLD.interest_type OR
    NEW.total_amount IS DISTINCT FROM OLD.total_amount OR
    NEW.num_installments IS DISTINCT FROM OLD.num_installments OR
    NEW.frequency IS DISTINCT FROM OLD.frequency OR
    NEW.start_date IS DISTINCT FROM OLD.start_date OR
    NEW.reschedule_fee_rate IS DISTINCT FROM OLD.reschedule_fee_rate OR
    NEW.reschedule_interest_multiplier IS DISTINCT FROM OLD.reschedule_interest_multiplier
  );

  status_changed := NEW.status IS DISTINCT FROM OLD.status;

  IF v_actor = OLD.lender_id AND borrower_only_changed THEN
    RAISE EXCEPTION 'Lenders cannot modify borrower confirmation fields';
  END IF;

  IF v_actor = OLD.borrower_id AND lender_only_changed THEN
    RAISE EXCEPTION 'Borrowers cannot modify lender banking or transfer fields';
  END IF;

  IF OLD.status <> 'pending_confirmation' AND financial_terms_changed THEN
    RAISE EXCEPTION 'Agreement financial terms cannot be changed after activation';
  END IF;

  IF status_changed THEN
    IF OLD.status = 'pending_confirmation'
       AND NEW.status = 'cancelled'
       AND v_mutation_source = '' THEN
      RETURN NEW;
    END IF;

    IF v_mutation_source <> 'rpc' THEN
      RAISE EXCEPTION 'Agreement status changes must go through approved RPCs';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP FUNCTION IF EXISTS public.create_agreement_with_installments(
  uuid, uuid, text, text, numeric, numeric, text, numeric, integer, text, date,
  text, numeric, numeric, text, text, text, jsonb
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
  v_quota jsonb;
  v_free_remaining integer := 0;
  v_credits integer := 0;
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
    lender_confirmed_at
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
    true,
    now()
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
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_mark_lender_confirmed AND p_mark_borrower_confirmed THEN
    RAISE EXCEPTION 'Invalid confirmation request';
  END IF;

  SELECT *
  INTO v_agreement
  FROM public.debt_agreements
  WHERE id = p_agreement_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agreement not found';
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

  IF p_mark_lender_confirmed AND COALESCE(NULLIF(btrim(COALESCE(p_transfer_slip_url, v_agreement.transfer_slip_url)), ''), NULL) IS NULL THEN
    RAISE EXCEPTION 'Transfer slip is required';
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
      'ข้าพเจ้า %s ยืนยันว่าได้รับเงินจำนวน %s บาท จาก %s เมื่อวันที่ %s และตกลงจะชำระคืนตามข้อตกลงที่ระบุในแอพ Budoverbills',
      v_borrower_name,
      to_char(v_agreement.principal_amount, 'FM999G999G999G990'),
      v_lender_name,
      v_formatted_date
    );
  END IF;

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
      WHEN (
        CASE WHEN p_mark_lender_confirmed THEN true ELSE lender_confirmed END
      ) AND (
        CASE WHEN p_mark_borrower_confirmed THEN true ELSE borrower_confirmed END
      ) THEN 'active'
      ELSE status
    END,
    updated_at = now()
  WHERE id = v_agreement.id;

  RETURN jsonb_build_object(
    'success', true,
    'agreement_id', v_agreement.id,
    'lender_confirmed', CASE WHEN p_mark_lender_confirmed THEN true ELSE v_agreement.lender_confirmed END,
    'borrower_confirmed', CASE WHEN p_mark_borrower_confirmed THEN true ELSE v_agreement.borrower_confirmed END,
    'borrower_confirmed_transfer', CASE WHEN p_mark_borrower_transfer_confirmed THEN true ELSE v_agreement.borrower_confirmed_transfer END
  );
END;
$$;
