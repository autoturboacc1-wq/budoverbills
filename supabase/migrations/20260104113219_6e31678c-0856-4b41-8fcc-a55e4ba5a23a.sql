-- Add reschedule_interest_multiplier column to debt_agreements
-- This stores the default multiplier for interest-based reschedule fees (e.g., 0.5, 1, 1.5, 2)
ALTER TABLE public.debt_agreements 
ADD COLUMN reschedule_interest_multiplier numeric DEFAULT 1;

-- Add comment for documentation
COMMENT ON COLUMN public.debt_agreements.reschedule_interest_multiplier IS 'Default multiplier for interest-based reschedule fees. Used when interest_type is flat or effective.';