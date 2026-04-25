-- Harden the loan-contract signing RPC.
--
-- Issues addressed:
--   1. The RPC trusted the client-supplied SHA-256 hash without recomputing
--      it.  A bypassing client could store HTML that disagrees with the
--      sworn-in numbers/parties.
--   2. Free-text fields (typed_name, place_of_signing, loan_purpose,
--      idCardLast4 inside party_info, address) had no server-side length
--      caps, only client maxLength.
--   3. IP address was captured client-side via a public IP service.  For
--      court evidence the IP must come from the inbound request headers.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Per-purpose PDPA consent for contract signing.
-- Generic app-level PDPA consent (in `profiles.pdpa_accepted_at`) is too
-- broad to cover the collection of identity data (full name + ID-card last
-- four + home address) required by a court-evidence loan contract.  The
-- "specific purpose" rule in PDPA requires a separate consent record.

CREATE TABLE IF NOT EXISTS public.agreement_pdpa_consents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id    uuid NOT NULL REFERENCES public.debt_agreements(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  purpose         text NOT NULL,
  consented_at    timestamptz NOT NULL DEFAULT now(),
  ip_address      text,
  user_agent      text,
  CONSTRAINT agreement_pdpa_consents_unique_per_purpose UNIQUE (agreement_id, user_id, purpose)
);

CREATE INDEX IF NOT EXISTS agreement_pdpa_consents_agreement_idx
  ON public.agreement_pdpa_consents (agreement_id);
CREATE INDEX IF NOT EXISTS agreement_pdpa_consents_user_idx
  ON public.agreement_pdpa_consents (user_id);

ALTER TABLE public.agreement_pdpa_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agreement_pdpa_consents_select_own ON public.agreement_pdpa_consents;
CREATE POLICY agreement_pdpa_consents_select_own
  ON public.agreement_pdpa_consents
  FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS agreement_pdpa_consents_insert_own ON public.agreement_pdpa_consents;
CREATE POLICY agreement_pdpa_consents_insert_own
  ON public.agreement_pdpa_consents
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.debt_agreements da
      WHERE da.id = agreement_pdpa_consents.agreement_id
        AND (da.lender_id = auth.uid() OR da.borrower_id = auth.uid())
    )
  );

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
  p_ip_address            text DEFAULT NULL,    -- kept for backward compat, ignored
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
  v_party_id4        text;
  v_party_address    text;
  v_request_ip       text;
  v_request_ua       text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_signer_role NOT IN ('lender', 'borrower') THEN
    RAISE EXCEPTION 'Invalid signer role';
  END IF;

  -- Length caps on free-text fields.  Anything over the cap gets rejected
  -- so the immutable evidence cannot be padded with attacker-controlled data.
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

  -- Validate party_info shape.  fullName 1-120, idCardLast4 exactly 4 digits,
  -- address 1-300.  Reject anything outside those bounds.
  v_party_full_name := COALESCE(btrim(p_party_info->>'fullName'), '');
  v_party_id4       := COALESCE(btrim(p_party_info->>'idCardLast4'), '');
  v_party_address   := COALESCE(btrim(p_party_info->>'address'), '');

  IF v_party_full_name = '' OR length(v_party_full_name) > 120 THEN
    RAISE EXCEPTION 'Party full name must be 1-120 characters';
  END IF;

  IF v_party_id4 !~ '^\d{4}$' THEN
    RAISE EXCEPTION 'Party id_card_last4 must be exactly 4 digits';
  END IF;

  IF v_party_address = '' OR length(v_party_address) > 300 THEN
    RAISE EXCEPTION 'Party address must be 1-300 characters';
  END IF;

  -- Recompute SHA-256 server-side over the raw HTML bytes and reject any
  -- mismatch with the client-supplied hash.  No whitespace normalization
  -- (server and client must agree byte-for-byte to keep hashes deterministic
  -- and avoid regex-dialect drift between Postgres POSIX `\s` and JS `\s`).
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

  -- Per-purpose PDPA consent must exist before identity data can be
  -- immortalised in the contract snapshot.
  IF NOT EXISTS (
    SELECT 1 FROM public.agreement_pdpa_consents
    WHERE agreement_id = p_agreement_id
      AND user_id = v_user_id
      AND purpose = 'loan_contract_identity'
  ) THEN
    RAISE EXCEPTION 'PDPA consent for loan_contract_identity is required';
  END IF;

  -- Capture the request IP and user-agent server-side from the inbound
  -- PostgREST request headers instead of trusting the client param.
  -- Falls back to the client-supplied value if the header is absent
  -- (e.g. when called via psql or supabase functions invoke).
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
    'success',           true,
    'agreement_id',      p_agreement_id,
    'signer_role',       p_signer_role,
    'signed_at',         v_now,
    'fully_signed',      v_other_signed,
    'contract_hash',     p_contract_hash,
    'ip_address',        v_request_ip
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.sign_agreement_contract(
  uuid, text, text, jsonb, text, text, text, text, text, text, text, text
) TO authenticated;
