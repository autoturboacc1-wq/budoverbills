-- Loan contract signing feature
-- Adds an immutable contract snapshot + dual-party electronic signatures
-- for use as legal evidence in Thai courts (per ป.พ.พ. ม.653 + พ.ร.บ. ธุรกรรมอิเล็กทรอนิกส์).

-- 1. Snapshot columns on debt_agreements -------------------------------------
ALTER TABLE public.debt_agreements
  ADD COLUMN IF NOT EXISTS contract_template_version text,
  ADD COLUMN IF NOT EXISTS contract_html_snapshot    text,
  ADD COLUMN IF NOT EXISTS contract_hash             text,
  ADD COLUMN IF NOT EXISTS contract_finalized_at     timestamptz,
  ADD COLUMN IF NOT EXISTS lender_party_info         jsonb,
  ADD COLUMN IF NOT EXISTS borrower_party_info       jsonb,
  ADD COLUMN IF NOT EXISTS place_of_signing          text,
  ADD COLUMN IF NOT EXISTS loan_purpose              text;

COMMENT ON COLUMN public.debt_agreements.contract_html_snapshot IS
  'Immutable HTML rendering of the signed contract — frozen on each sign and rehashed.';
COMMENT ON COLUMN public.debt_agreements.contract_hash IS
  'SHA-256 hex of contract_html_snapshot at the time of last signature.';
COMMENT ON COLUMN public.debt_agreements.lender_party_info IS
  'Lender''s self-declared identity at signing time: { full_name, id_card_last4, address }.';
COMMENT ON COLUMN public.debt_agreements.borrower_party_info IS
  'Borrower''s self-declared identity at signing time: { full_name, id_card_last4, address }.';

-- 2. agreement_signatures table ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.agreement_signatures (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id           uuid NOT NULL REFERENCES public.debt_agreements(id) ON DELETE CASCADE,
  signer_user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  signer_role            text NOT NULL CHECK (signer_role IN ('lender', 'borrower')),
  typed_name             text NOT NULL,
  contract_hash_at_sign  text NOT NULL,
  signed_at              timestamptz NOT NULL DEFAULT now(),
  ip_address             text,
  device_id              text,
  user_agent             text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agreement_signatures_unique_signer UNIQUE (agreement_id, signer_role)
);

CREATE INDEX IF NOT EXISTS agreement_signatures_agreement_id_idx
  ON public.agreement_signatures (agreement_id);

ALTER TABLE public.agreement_signatures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agreement_signatures_select_own ON public.agreement_signatures;
CREATE POLICY agreement_signatures_select_own
  ON public.agreement_signatures
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.debt_agreements da
      WHERE da.id = agreement_signatures.agreement_id
        AND (da.lender_id = auth.uid() OR da.borrower_id = auth.uid())
    )
  );

-- Inserts go through the SECURITY DEFINER RPC below.  No direct INSERT/UPDATE/DELETE policies.

-- 3. sign_agreement_contract RPC --------------------------------------------
DROP FUNCTION IF EXISTS public.sign_agreement_contract(
  uuid, text, text, text, jsonb, text, text, text, text, text, text, text
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
  p_ip_address            text DEFAULT NULL,
  p_device_id             text DEFAULT NULL,
  p_user_agent            text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id    uuid := auth.uid();
  v_agreement  public.debt_agreements%ROWTYPE;
  v_now        timestamptz := now();
  v_other_signed boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_signer_role NOT IN ('lender', 'borrower') THEN
    RAISE EXCEPTION 'Invalid signer role';
  END IF;

  IF coalesce(btrim(p_typed_name), '') = '' THEN
    RAISE EXCEPTION 'Typed name is required';
  END IF;

  IF coalesce(btrim(p_contract_html), '') = '' OR coalesce(btrim(p_contract_hash), '') = '' THEN
    RAISE EXCEPTION 'Contract snapshot and hash are required';
  END IF;

  IF p_party_info IS NULL OR jsonb_typeof(p_party_info) <> 'object' THEN
    RAISE EXCEPTION 'Party info is required';
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

  -- Snapshot the latest contract HTML + hash.
  -- The borrower's signature produces the final, canonical snapshot.
  PERFORM set_config('app.agreement_mutation_source', 'rpc', true);

  UPDATE public.debt_agreements
  SET
    contract_html_snapshot   = p_contract_html,
    contract_hash            = p_contract_hash,
    contract_template_version = COALESCE(p_contract_template_ver, contract_template_version),
    lender_party_info        = CASE WHEN p_signer_role = 'lender'   THEN p_party_info ELSE lender_party_info   END,
    borrower_party_info      = CASE WHEN p_signer_role = 'borrower' THEN p_party_info ELSE borrower_party_info END,
    place_of_signing         = COALESCE(p_place_of_signing, place_of_signing),
    loan_purpose             = COALESCE(p_loan_purpose,     loan_purpose),
    updated_at               = v_now
  WHERE id = p_agreement_id;

  INSERT INTO public.agreement_signatures (
    agreement_id, signer_user_id, signer_role, typed_name,
    contract_hash_at_sign, signed_at, ip_address, device_id, user_agent
  ) VALUES (
    p_agreement_id, v_user_id, p_signer_role, btrim(p_typed_name),
    p_contract_hash, v_now, p_ip_address, p_device_id, p_user_agent
  );

  -- Mark contract as finalized once both parties have signed.
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
    'contract_hash',     p_contract_hash
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.sign_agreement_contract(
  uuid, text, text, jsonb, text, text, text, text, text, text, text, text
) TO authenticated;
