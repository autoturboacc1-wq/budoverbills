-- Atomic agreement confirmation and transfer-proof mutations.

DROP FUNCTION IF EXISTS public.confirm_agreement_transfer(
  uuid,
  text,
  boolean,
  boolean,
  boolean,
  timestamptz,
  text,
  text
);

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
