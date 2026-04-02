-- Add column to store custom fee rate for no-interest agreements
ALTER TABLE public.reschedule_requests 
ADD COLUMN custom_fee_rate numeric DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.reschedule_requests.custom_fee_rate IS 'Custom fee rate (1-20%) selected for no-interest agreements. NULL means default rate was used.';