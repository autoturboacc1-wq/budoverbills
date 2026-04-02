-- Add original_due_date column to track rescheduled installments
ALTER TABLE public.installments 
ADD COLUMN original_due_date date;

-- Add comment for clarity
COMMENT ON COLUMN public.installments.original_due_date IS 'Original due date before rescheduling. NULL means not rescheduled.';

-- Also update existing reschedule_requests to copy original_due_date to installments
-- This handles historical data where we have approved reschedules
UPDATE public.installments i
SET original_due_date = r.original_due_date
FROM public.reschedule_requests r
WHERE i.id = r.installment_id
AND r.status = 'approved'
AND i.original_due_date IS NULL;