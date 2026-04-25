-- Upgrade party_info validation in sign_agreement_contract:
-- Accept full 13-digit Thai national ID (idCardNumber) instead of last-4 only.
-- Legacy blobs that stored idCardLast4 remain readable; new signatures must
-- supply idCardNumber with a valid checksum.

CREATE OR REPLACE FUNCTION public.sign_agreement_contract(
  p_agreement_id          uuid,
  p_signer_role           text,
  p_typed_name            text,
  p_party_info            jsonb,
  p_contract_html         text,
  p_contract_hash         text,
  p_contract_template_ver text,
  p_place_of_signing      text DEFAULT NULL,
  p_loan_purpose          text DEFAULT NULL,
  p_ip_address            text DEFAULT NULL,
  p_device_id             text DEFAULT NULL,
  p_user_agent            text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id          uuid := auth.uid();
  v_agreement        public.debt_agreements%ROWTYPE;
  v_now              timestamptz := now();
  v_other_signed     boolean;
  v_recomputed_hash  text;
  v_party_full_name  text;
  v_party_id         text;
  v_party_address    text;
  v_request_ip       text;
  v_request_ua       text;
  v_checksum         int;
  v_sum              int;
  v_i                int;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_signer_role NOT IN ('lender', 'borrower') THEN
    RAISE EXCEPTION 'Invalid signer role';
  END IF;

  IF coalesce(btrim(p_typed_name), '') = '' OR length(p_typed_name) > 120 THEN
    RAISE EXCEPTION 'Typed name must be 1-120 characters';
  END IF;

  IF p_place_of_signing IS NOT NULL AND length(p_place_of_signing) > 120 THEN
    RAISE EXCEPTION 'Place of signing too long';
  END IF;

  IF p_loan_purpose IS NOT NULL AND length(p_loan_purpose) > 200 THEN
    RAISE EXCEPTION 'Loan purpose too long';
  END IF;

  IF coalesce(btrim(p_contract_html), '') = '' OR coalesce(btrim(p_contract_hash), '') = '' THEN
    RAISE EXCEPTION 'Contract snapshot and hash are required';
  END IF;

  IF length(p_contract_html) > 200000 THEN
    RAISE EXCEPTION 'Contract HTML exceeds maximum size';
  END IF;

  IF p_party_info IS NULL OR jsonb_typeof(p_party_info) <> 'object' THEN
    RAISE EXCEPTION 'Party info is required';
  END IF;

  v_party_full_name := COALESCE(btrim(p_party_info->>'fullName'), '');
  -- Accept idCardNumber (new) or idCardLast4 (legacy)
  v_party_id        := COALESCE(
    NULLIF(btrim(p_party_info->>'idCardNumber'), ''),
    NULLIF(btrim(p_party_info->>'idCardLast4'), '')
  );
  v_party_address   := COALESCE(btrim(p_party_info->>'address'), '');

  IF v_party_full_name = '' OR length(v_party_full_name) > 120 THEN
    RAISE EXCEPTION 'Party full name must be 1-120 characters';
  END IF;

  -- Must supply a full 13-digit ID for new signatures.
  IF v_party_id IS NULL OR v_party_id !~ '^\d{13}$' THEN
    RAISE EXCEPTION 'Party idCardNumber must be exactly 13 digits';
  END IF;

  -- Thai national ID Luhn-style checksum validation.
  v_sum := 0;
  FOR v_i IN 1..12 LOOP
    v_sum := v_sum + CAST(substring(v_party_id FROM v_i FOR 1) AS int) * (13 - v_i);
  END LOOP;
  v_checksum := (11 - (v_sum % 11)) % 10;
  IF v_checksum <> CAST(substring(v_party_id FROM 13 FOR 1) AS int) THEN
    RAISE EXCEPTION 'Party idCardNumber checksum is invalid';
  END IF;

  IF v_party_address = '' OR length(v_party_address) > 300 THEN
    RAISE EXCEPTION 'Party address must be 1-300 characters';
  END IF;

  -- Server-side SHA-256 re-verification of the contract snapshot.
  v_recomputed_hash := 'sha256:' || encode(extensions.digest(p_contract_html, 'sha256'), 'hex');
  IF v_recomputed_hash <> p_contract_hash THEN
    RAISE EXCEPTION 'Contract hash mismatch — refusing to sign tampered snapshot';
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
    RAISE EXCEPTION 'Agreement is not in a signable state';
  END IF;

  IF p_signer_role = 'lender' AND v_user_id <> v_agreement.lender_id THEN
    RAISE EXCEPTION 'Only the lender can sign as lender';
  END IF;

  IF p_signer_role = 'borrower' AND v_user_id <> v_agreement.borrower_id THEN
    RAISE EXCEPTION 'Only the borrower can sign as borrower';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.agreement_signatures
    WHERE agreement_id = p_agreement_id AND signer_role = p_signer_role
  ) THEN
    RAISE EXCEPTION 'You have already signed this contract';
  END IF;

  IF p_signer_role = 'borrower' AND NOT EXISTS (
    SELECT 1 FROM public.agreement_signatures
    WHERE agreement_id = p_agreement_id AND signer_role = 'lender'
  ) THEN
    RAISE EXCEPTION 'Lender must sign the contract first';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.agreement_pdpa_consents
    WHERE agreement_id = p_agreement_id
      AND user_id = v_user_id
      AND purpose = 'loan_contract_identity'
  ) THEN
    RAISE EXCEPTION 'PDPA consent for loan_contract_identity is required';
  END IF;

  BEGIN
    v_request_ip := COALESCE(
      NULLIF(btrim(split_part(
        current_setting('request.headers', true)::json->>'x-forwarded-for',
        ',', 1
      )), ''),
      NULLIF(btrim(current_setting('request.headers', true)::json->>'x-real-ip'), ''),
      NULLIF(btrim(p_ip_address), ''),
      'unknown'
    );
    v_request_ua := COALESCE(
      NULLIF(btrim(current_setting('request.headers', true)::json->>'user-agent'), ''),
      NULLIF(btrim(p_user_agent), ''),
      NULL
    );
  EXCEPTION WHEN others THEN
    v_request_ip := COALESCE(NULLIF(btrim(p_ip_address), ''), 'unknown');
    v_request_ua := NULLIF(btrim(p_user_agent), '');
  END;

  PERFORM set_config('app.agreement_mutation_source', 'rpc', true);

  UPDATE public.debt_agreements
  SET
    contract_html_snapshot    = p_contract_html,
    contract_hash             = p_contract_hash,
    contract_template_version = COALESCE(p_contract_template_ver, contract_template_version),
    lender_party_info         = CASE WHEN p_signer_role = 'lender'   THEN p_party_info ELSE lender_party_info   END,
    borrower_party_info       = CASE WHEN p_signer_role = 'borrower' THEN p_party_info ELSE borrower_party_info END,
    place_of_signing          = COALESCE(p_place_of_signing, place_of_signing),
    loan_purpose              = COALESCE(p_loan_purpose,     loan_purpose),
    updated_at                = v_now
  WHERE id = p_agreement_id;

  INSERT INTO public.agreement_signatures (
    agreement_id, signer_user_id, signer_role, typed_name,
    contract_hash_at_sign, signed_at, ip_address, device_id, user_agent
  ) VALUES (
    p_agreement_id, v_user_id, p_signer_role, btrim(p_typed_name),
    p_contract_hash, v_now, v_request_ip, p_device_id, v_request_ua
  );

  SELECT EXISTS (
    SELECT 1 FROM public.agreement_signatures
    WHERE agreement_id = p_agreement_id
      AND signer_role = CASE p_signer_role WHEN 'lender' THEN 'borrower' ELSE 'lender' END
  ) INTO v_other_signed;

  IF v_other_signed THEN
    UPDATE public.debt_agreements
    SET contract_finalized_at = v_now
    WHERE id = p_agreement_id
      AND contract_finalized_at IS NULL;
  END IF;

  RETURN jsonb_build_object(
    'success',      true,
    'agreement_id', p_agreement_id,
    'signer_role',  p_signer_role,
    'signed_at',    v_now,
    'fully_signed', v_other_signed,
    'contract_hash', p_contract_hash,
    'ip_address',   v_request_ip
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.sign_agreement_contract(
  uuid, text, text, jsonb, text, text, text, text, text, text, text, text
) TO authenticated;
