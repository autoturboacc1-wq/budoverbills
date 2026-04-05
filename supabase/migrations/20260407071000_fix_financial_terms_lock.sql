-- BUG-RLS-22: trigger enforce_debt_agreement_role_updates does not lock
-- financial terms once an agreement reaches 'active' status.  A lender could
-- change interest_rate, total_amount, monthly_payment, or principal_amount
-- after the borrower has already confirmed.
--
-- Fix: when OLD.status = 'active', block any change to the four core financial
-- columns before performing the existing role-based checks.

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

  -- BUG-RLS-22: Lock core financial terms once the agreement is active.
  -- No party — not even the lender — may alter these columns after both sides
  -- have confirmed, regardless of mutation_source.
  IF OLD.status = 'active' AND (
    NEW.interest_rate     IS DISTINCT FROM OLD.interest_rate     OR
    NEW.total_amount      IS DISTINCT FROM OLD.total_amount      OR
    NEW.monthly_payment   IS DISTINCT FROM OLD.monthly_payment   OR
    NEW.principal_amount  IS DISTINCT FROM OLD.principal_amount
  ) THEN
    RAISE EXCEPTION 'financial terms cannot be modified after agreement is active';
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

-- Re-create the trigger to pick up the updated function body.
DROP TRIGGER IF EXISTS enforce_debt_agreement_role_updates_trigger ON public.debt_agreements;
CREATE TRIGGER enforce_debt_agreement_role_updates_trigger
BEFORE UPDATE ON public.debt_agreements
FOR EACH ROW
EXECUTE FUNCTION public.enforce_debt_agreement_role_updates();
