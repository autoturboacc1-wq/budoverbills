DROP POLICY IF EXISTS "Parties can update their own agreements" ON public.debt_agreements;

CREATE POLICY "Lenders can update their agreement fields"
ON public.debt_agreements
FOR UPDATE
USING (auth.uid() = lender_id)
WITH CHECK (auth.uid() = lender_id);

CREATE POLICY "Borrowers can update their agreement fields"
ON public.debt_agreements
FOR UPDATE
USING (auth.uid() = borrower_id)
WITH CHECK (auth.uid() = borrower_id);

CREATE OR REPLACE FUNCTION public.enforce_debt_agreement_role_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  lender_only_changed boolean;
  borrower_only_changed boolean;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  lender_only_changed := (
    NEW.bank_name IS DISTINCT FROM OLD.bank_name OR
    NEW.account_number IS DISTINCT FROM OLD.account_number OR
    NEW.account_name IS DISTINCT FROM OLD.account_name OR
    NEW.lender_confirmed IS DISTINCT FROM OLD.lender_confirmed OR
    NEW.lender_confirmed_ip IS DISTINCT FROM OLD.lender_confirmed_ip OR
    NEW.lender_confirmed_device IS DISTINCT FROM OLD.lender_confirmed_device OR
    NEW.transfer_slip_url IS DISTINCT FROM OLD.transfer_slip_url OR
    NEW.transferred_at IS DISTINCT FROM OLD.transferred_at
  );

  borrower_only_changed := (
    NEW.borrower_confirmed IS DISTINCT FROM OLD.borrower_confirmed OR
    NEW.borrower_confirmed_ip IS DISTINCT FROM OLD.borrower_confirmed_ip OR
    NEW.borrower_confirmed_device IS DISTINCT FROM OLD.borrower_confirmed_device OR
    NEW.borrower_confirmed_transfer IS DISTINCT FROM OLD.borrower_confirmed_transfer OR
    NEW.borrower_confirmed_transfer_at IS DISTINCT FROM OLD.borrower_confirmed_transfer_at
  );

  IF v_actor = OLD.lender_id AND borrower_only_changed THEN
    RAISE EXCEPTION 'Lenders cannot modify borrower confirmation fields';
  END IF;

  IF v_actor = OLD.borrower_id AND lender_only_changed THEN
    RAISE EXCEPTION 'Borrowers cannot modify lender banking or transfer fields';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_debt_agreement_role_updates_trigger ON public.debt_agreements;

CREATE TRIGGER enforce_debt_agreement_role_updates_trigger
BEFORE UPDATE ON public.debt_agreements
FOR EACH ROW
EXECUTE FUNCTION public.enforce_debt_agreement_role_updates();
