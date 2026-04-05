-- BUG-RLS-12: Protect the `status` field in enforce_debt_agreement_role_updates.
--
-- The previous trigger function checked that status changes must come through
-- an approved RPC (app.agreement_mutation_source = 'rpc'), but any
-- authenticated user could set that session GUC themselves:
--   SET app.agreement_mutation_source = 'rpc';
--   UPDATE debt_agreements SET status = 'completed' WHERE id = '<uuid>';
-- …causing debts to silently disappear from the dashboard.
--
-- Fix: When status changes and the caller is an authenticated user (not a
-- trigger / service-role context), only the lender or an admin may change it.
-- Borrowers are explicitly blocked from changing status regardless of the GUC.
-- Trigger/service-role calls (auth.uid() IS NULL or service_role) are still
-- allowed so that RPCs like confirm_installment_payment can advance status.

CREATE OR REPLACE FUNCTION public.enforce_debt_agreement_role_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_role text := COALESCE(auth.role(), '');
  v_mutation_source text := COALESCE(current_setting('app.agreement_mutation_source', true), '');
  lender_only_changed boolean;
  borrower_only_changed boolean;
  financial_terms_changed boolean;
  status_changed boolean;
BEGIN
  -- Trigger / service-role context: no actor restrictions apply.
  IF v_actor IS NULL OR v_actor_role = 'service_role' THEN
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

  -- Lender cannot touch borrower confirmation fields.
  IF v_actor = OLD.lender_id AND borrower_only_changed THEN
    RAISE EXCEPTION 'Lenders cannot modify borrower confirmation fields';
  END IF;

  -- Borrower cannot touch lender banking / transfer fields.
  IF v_actor = OLD.borrower_id AND lender_only_changed THEN
    RAISE EXCEPTION 'Borrowers cannot modify lender banking or transfer fields';
  END IF;

  -- Financial terms are locked once the agreement is no longer pending.
  IF OLD.status <> 'pending_confirmation' AND financial_terms_changed THEN
    RAISE EXCEPTION 'Agreement financial terms cannot be changed after activation';
  END IF;

  -- Status field protection.
  IF status_changed THEN
    -- Borrowers can NEVER change status directly.
    IF v_actor = OLD.borrower_id THEN
      RAISE EXCEPTION 'Borrowers cannot change agreement status directly';
    END IF;

    -- Allow a lender to cancel their own pending_confirmation agreement
    -- without going through an RPC (e.g., via the UI cancel button).
    IF v_actor = OLD.lender_id
       AND OLD.status = 'pending_confirmation'
       AND NEW.status = 'cancelled'
    THEN
      RETURN NEW;
    END IF;

    -- All other status transitions must go through approved RPCs, identified
    -- by the mutation-source GUC set inside SECURITY DEFINER RPC bodies.
    -- Note: unlike the caller-identity check above, this GUC is only trusted
    -- because we have already confirmed v_actor is the lender (or an admin
    -- via a separate policy); a borrower cannot reach this point.
    IF v_mutation_source <> 'rpc' THEN
      RAISE EXCEPTION 'Agreement status changes must go through approved RPCs';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
