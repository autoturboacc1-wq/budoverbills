-- Add slip_url column to group_expenses table
ALTER TABLE public.group_expenses 
ADD COLUMN slip_url TEXT;

-- Add comment for clarity
COMMENT ON COLUMN public.group_expenses.slip_url IS 'URL of uploaded payment slip/receipt';