-- Slip OCR verification (MVP) — schema only, dormant until provider is enabled.
--
-- Adds OCR-result columns to slip_verifications so an out-of-band edge
-- function can attach a structured "we ran OCR on this slip" record without
-- changing the manual lender-confirm flow.  The lender still presses
-- "ยืนยันรับเงิน" — they just see a pre-verified badge if OCR matched.
--
-- IMPORTANT: This migration is intentionally shipped ahead of the feature
-- being turned on.  The verify-payment-slip edge function defaults to
-- SLIP_OCR_PROVIDER=none, so these columns will stay NULL until the env is
-- flipped (see the function's header comment for the criteria — roughly
-- ~50+ slips/day or first fraud incident).  Adding the columns now is cheap
-- and means we don't need a follow-up migration when the time comes.
--
-- ocr_status semantics:
--   NULL         — not yet processed (or provider not configured)
--   'matched'    — amount + receiver match expected installment within tolerance
--   'mismatched' — OCR succeeded but at least one field disagrees
--   'failed'     — OCR provider could not parse the slip (corrupt image, etc.)
--
-- The borrower cannot write these fields (RLS already restricts UPDATE to
-- the lender).  The edge function uses the service role to write results.

ALTER TABLE public.slip_verifications
  ADD COLUMN IF NOT EXISTS ocr_status            text,
  ADD COLUMN IF NOT EXISTS ocr_amount            numeric,
  ADD COLUMN IF NOT EXISTS ocr_transfer_time     timestamptz,
  ADD COLUMN IF NOT EXISTS ocr_receiver_account  text,
  ADD COLUMN IF NOT EXISTS ocr_receiver_name     text,
  ADD COLUMN IF NOT EXISTS ocr_reference         text,
  ADD COLUMN IF NOT EXISTS ocr_mismatch_reasons  text[],
  ADD COLUMN IF NOT EXISTS ocr_provider          text,
  ADD COLUMN IF NOT EXISTS ocr_payload           jsonb,
  ADD COLUMN IF NOT EXISTS ocr_processed_at      timestamptz;

ALTER TABLE public.slip_verifications
  DROP CONSTRAINT IF EXISTS slip_verifications_ocr_status_check;

ALTER TABLE public.slip_verifications
  ADD CONSTRAINT slip_verifications_ocr_status_check
  CHECK (ocr_status IS NULL OR ocr_status IN ('matched', 'mismatched', 'failed'));

CREATE INDEX IF NOT EXISTS idx_slip_verifications_ocr_reference
  ON public.slip_verifications (ocr_reference)
  WHERE ocr_reference IS NOT NULL;

-- Helper RPC the verify-payment-slip edge function calls (with service role,
-- so RLS is already bypassed; this exists to keep the write surface narrow
-- and auditable instead of letting the function update arbitrary columns).
CREATE OR REPLACE FUNCTION public.record_slip_ocr_result(
  p_verification_id      uuid,
  p_ocr_status           text,
  p_ocr_amount           numeric,
  p_ocr_transfer_time    timestamptz,
  p_ocr_receiver_account text,
  p_ocr_receiver_name    text,
  p_ocr_reference        text,
  p_ocr_mismatch_reasons text[],
  p_ocr_provider         text,
  p_ocr_payload          jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.slip_verifications%ROWTYPE;
  v_now      timestamptz := now();
BEGIN
  IF p_verification_id IS NULL THEN
    RAISE EXCEPTION 'verification_id is required';
  END IF;

  IF p_ocr_status IS NOT NULL AND p_ocr_status NOT IN ('matched', 'mismatched', 'failed') THEN
    RAISE EXCEPTION 'Invalid ocr_status: %', p_ocr_status;
  END IF;

  IF p_ocr_provider IS NULL OR length(btrim(p_ocr_provider)) = 0 THEN
    RAISE EXCEPTION 'ocr_provider is required';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.slip_verifications
  WHERE id = p_verification_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Verification not found';
  END IF;

  -- Once a lender has acted (approved/rejected), don't overwrite OCR fields —
  -- they are evidence-of-decision at that point.
  IF v_existing.status <> 'pending' THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason',  'verification_already_resolved',
      'status',  v_existing.status
    );
  END IF;

  UPDATE public.slip_verifications
  SET
    ocr_status            = p_ocr_status,
    ocr_amount            = p_ocr_amount,
    ocr_transfer_time     = p_ocr_transfer_time,
    ocr_receiver_account  = p_ocr_receiver_account,
    ocr_receiver_name     = p_ocr_receiver_name,
    ocr_reference         = p_ocr_reference,
    ocr_mismatch_reasons  = p_ocr_mismatch_reasons,
    ocr_provider          = p_ocr_provider,
    ocr_payload           = p_ocr_payload,
    ocr_processed_at      = v_now
  WHERE id = p_verification_id;

  RETURN jsonb_build_object(
    'success',         true,
    'verification_id', p_verification_id,
    'ocr_status',      p_ocr_status,
    'processed_at',    v_now
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_slip_ocr_result(
  uuid, text, numeric, timestamptz, text, text, text, text[], text, jsonb
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.record_slip_ocr_result(
  uuid, text, numeric, timestamptz, text, text, text, text[], text, jsonb
) TO service_role;

COMMENT ON COLUMN public.slip_verifications.ocr_status IS
  'matched | mismatched | failed | NULL (not run). Set by verify-payment-slip edge function.';
COMMENT ON COLUMN public.slip_verifications.ocr_mismatch_reasons IS
  'Codes such as amount_low, amount_high, receiver_mismatch, duplicate_reference, stale_timestamp.';
