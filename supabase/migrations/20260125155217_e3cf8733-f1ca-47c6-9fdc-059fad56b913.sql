-- Add columns for lender transfer proof with borrower confirmation
ALTER TABLE public.debt_agreements 
ADD COLUMN IF NOT EXISTS transfer_slip_url TEXT,
ADD COLUMN IF NOT EXISTS transferred_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS borrower_confirmed_transfer BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS borrower_confirmed_transfer_at TIMESTAMPTZ;

-- Add comment for documentation
COMMENT ON COLUMN public.debt_agreements.transfer_slip_url IS 'URL of lender transfer proof slip';
COMMENT ON COLUMN public.debt_agreements.transferred_at IS 'When lender uploaded transfer proof';
COMMENT ON COLUMN public.debt_agreements.borrower_confirmed_transfer IS 'Borrower confirms receiving the money';
COMMENT ON COLUMN public.debt_agreements.borrower_confirmed_transfer_at IS 'When borrower confirmed transfer';