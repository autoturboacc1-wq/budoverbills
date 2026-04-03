-- Ensure only one pending slip verification can exist per installment at a time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_slip_verifications_one_pending_per_installment
ON public.slip_verifications (installment_id)
WHERE status = 'pending';
