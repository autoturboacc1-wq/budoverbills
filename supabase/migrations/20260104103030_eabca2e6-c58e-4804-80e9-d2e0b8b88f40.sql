-- Add reschedule_fee_rate column to debt_agreements
ALTER TABLE public.debt_agreements 
ADD COLUMN reschedule_fee_rate numeric DEFAULT 5;