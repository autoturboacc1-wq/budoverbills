-- BUG-RLS-03
-- The original "Users can update installments for their agreements" policy
-- (created in 20251231145114) had no column restriction and no WITH CHECK clause,
-- allowing any party to the agreement — including the borrower — to set
-- `confirmed_by_lender = true`, `status = 'paid'`, or `paid_at = now()` directly
-- via the API without providing or having a verified payment slip.
--
-- A trigger-based guard was added in 20260406150000 (enforce_installment_role_updates_trigger)
-- but the RLS policy still carries no WITH CHECK and passes the USING predicate
-- unchanged, so a hostile client can still attempt writes that only the trigger
-- prevents. Belt-and-suspenders: the policy itself must also deny writes to the
-- financial-confirmation columns at the RLS layer.
--
-- Approach chosen (matches task spec "better" option):
--   • `confirmed_by_lender`, `paid_at`, and `status` changes are BLOCKED at the
--     RLS WITH CHECK level for both lender and borrower.  These columns must only
--     be mutated through the `confirm_installment_payment` /
--     `reject_installment_payment` SECURITY DEFINER RPCs (which bypass RLS).
--   • Both parties may still update non-financial columns (e.g. `payment_proof_url`,
--     `updated_at`) through the normal path; the trigger provides the additional
--     per-role column checks.

-- Drop the old unrestricted policies (original + the 20260406150000 replacement).
DROP POLICY IF EXISTS "Users can update installments for their agreements" ON public.installments;

-- Recreate with explicit WITH CHECK that prevents direct writes to confirmation
-- and financial-settlement columns.
CREATE POLICY "Users can update installments for their agreements"
ON public.installments
FOR UPDATE
USING (
  -- Caller must be a party to the parent agreement
  EXISTS (
    SELECT 1
    FROM public.debt_agreements da
    WHERE da.id = installments.agreement_id
      AND (da.lender_id = auth.uid() OR da.borrower_id = auth.uid())
  )
)
WITH CHECK (
  -- Same party check for the post-update row
  EXISTS (
    SELECT 1
    FROM public.debt_agreements da
    WHERE da.id = installments.agreement_id
      AND (da.lender_id = auth.uid() OR da.borrower_id = auth.uid())
  )
  -- Deny any direct mutation of confirmation / settlement columns.
  -- These are exclusively managed by the confirm_installment_payment and
  -- reject_installment_payment SECURITY DEFINER RPCs, which bypass RLS.
  AND confirmed_by_lender  IS NOT DISTINCT FROM (SELECT confirmed_by_lender  FROM public.installments WHERE id = installments.id)
  AND paid_at              IS NOT DISTINCT FROM (SELECT paid_at              FROM public.installments WHERE id = installments.id)
  AND status               IS NOT DISTINCT FROM (SELECT status               FROM public.installments WHERE id = installments.id)
  AND amount               IS NOT DISTINCT FROM (SELECT amount               FROM public.installments WHERE id = installments.id)
  AND due_date             IS NOT DISTINCT FROM (SELECT due_date             FROM public.installments WHERE id = installments.id)
  AND principal_portion    IS NOT DISTINCT FROM (SELECT principal_portion    FROM public.installments WHERE id = installments.id)
  AND interest_portion     IS NOT DISTINCT FROM (SELECT interest_portion     FROM public.installments WHERE id = installments.id)
);
