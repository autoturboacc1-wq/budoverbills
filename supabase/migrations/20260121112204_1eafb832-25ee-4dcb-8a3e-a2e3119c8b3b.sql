-- Add bank account columns to debt_agreements table
ALTER TABLE public.debt_agreements
ADD COLUMN bank_name text,
ADD COLUMN account_number text,
ADD COLUMN account_name text;

-- Add comment for documentation
COMMENT ON COLUMN public.debt_agreements.bank_name IS 'Bank name for receiving payments';
COMMENT ON COLUMN public.debt_agreements.account_number IS 'Bank account number or PromptPay';
COMMENT ON COLUMN public.debt_agreements.account_name IS 'Account holder name';