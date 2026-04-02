-- Add slip_url and submitted_amount columns to reschedule_requests for inline payment
ALTER TABLE public.reschedule_requests 
ADD COLUMN slip_url text,
ADD COLUMN submitted_amount numeric;

-- Add comment for clarity
COMMENT ON COLUMN public.reschedule_requests.slip_url IS 'URL of the uploaded payment slip for reschedule fee';
COMMENT ON COLUMN public.reschedule_requests.submitted_amount IS 'Amount the borrower claims to have transferred for reschedule fee';