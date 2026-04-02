-- Create slip_verifications table to track verification history
CREATE TABLE public.slip_verifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  installment_id UUID NOT NULL REFERENCES public.installments(id) ON DELETE CASCADE,
  agreement_id UUID NOT NULL REFERENCES public.debt_agreements(id) ON DELETE CASCADE,
  submitted_by UUID NOT NULL,
  submitted_amount NUMERIC NOT NULL,
  slip_url TEXT NOT NULL,
  verified_amount NUMERIC,
  verified_by UUID,
  status TEXT NOT NULL DEFAULT 'pending',
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  verified_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.slip_verifications ENABLE ROW LEVEL SECURITY;

-- Policy: Parties can view verifications for their agreements
CREATE POLICY "Parties can view slip verifications"
ON public.slip_verifications
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM debt_agreements da 
    WHERE da.id = slip_verifications.agreement_id 
    AND (da.lender_id = auth.uid() OR da.borrower_id = auth.uid())
  )
);

-- Policy: Borrowers can create verifications
CREATE POLICY "Borrowers can submit slip verifications"
ON public.slip_verifications
FOR INSERT
WITH CHECK (
  auth.uid() = submitted_by AND
  EXISTS (
    SELECT 1 FROM debt_agreements da 
    WHERE da.id = slip_verifications.agreement_id 
    AND da.borrower_id = auth.uid()
  )
);

-- Policy: Lenders can update verifications (to approve/reject)
CREATE POLICY "Lenders can update slip verifications"
ON public.slip_verifications
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM debt_agreements da 
    WHERE da.id = slip_verifications.agreement_id 
    AND da.lender_id = auth.uid()
  )
);

-- Create index for faster queries
CREATE INDEX idx_slip_verifications_installment ON public.slip_verifications(installment_id);
CREATE INDEX idx_slip_verifications_agreement ON public.slip_verifications(agreement_id);