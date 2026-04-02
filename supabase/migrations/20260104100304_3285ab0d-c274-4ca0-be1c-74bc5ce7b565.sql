-- Create reschedule_requests table
CREATE TABLE public.reschedule_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  installment_id UUID NOT NULL REFERENCES public.installments(id) ON DELETE CASCADE,
  agreement_id UUID NOT NULL REFERENCES public.debt_agreements(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL,
  new_due_date DATE NOT NULL,
  original_due_date DATE NOT NULL,
  
  -- Fee calculation
  reschedule_fee NUMERIC NOT NULL DEFAULT 0,
  fee_installments INTEGER NOT NULL DEFAULT 1,
  fee_per_installment NUMERIC NOT NULL DEFAULT 0,
  
  -- Safeguard info
  original_fee_rate NUMERIC NOT NULL DEFAULT 5,
  applied_fee_rate NUMERIC NOT NULL DEFAULT 5,
  safeguard_applied BOOLEAN NOT NULL DEFAULT false,
  
  -- Approval
  status TEXT NOT NULL DEFAULT 'pending',
  approved_by UUID,
  approved_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.reschedule_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Borrowers can create reschedule requests"
ON public.reschedule_requests
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM debt_agreements da
    WHERE da.id = reschedule_requests.agreement_id
    AND da.borrower_id = auth.uid()
  )
);

CREATE POLICY "Parties can view reschedule requests"
ON public.reschedule_requests
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM debt_agreements da
    WHERE da.id = reschedule_requests.agreement_id
    AND (da.lender_id = auth.uid() OR da.borrower_id = auth.uid())
  )
);

CREATE POLICY "Lenders can update reschedule requests"
ON public.reschedule_requests
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM debt_agreements da
    WHERE da.id = reschedule_requests.agreement_id
    AND da.lender_id = auth.uid()
  )
);

CREATE POLICY "Borrowers can delete pending requests"
ON public.reschedule_requests
FOR DELETE
USING (
  requested_by = auth.uid() AND status = 'pending'
);

-- Trigger for updated_at
CREATE TRIGGER update_reschedule_requests_updated_at
BEFORE UPDATE ON public.reschedule_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();