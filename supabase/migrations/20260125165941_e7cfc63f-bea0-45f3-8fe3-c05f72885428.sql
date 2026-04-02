-- Fix overly permissive RLS policies

-- Drop the overly permissive service role policy (it's not needed with SECURITY DEFINER functions)
DROP POLICY IF EXISTS "Service role can manage all payments" ON public.agreement_payments;

-- Add proper update policy for completed payments via secure functions only
-- Users can update their own pending payments
CREATE POLICY "Users can update own pending payments"
ON public.agreement_payments
FOR UPDATE
USING (auth.uid() = user_id AND status = 'pending')
WITH CHECK (auth.uid() = user_id);

-- Add delete policy for own pending payments
CREATE POLICY "Users can delete own pending payments"
ON public.agreement_payments
FOR DELETE
USING (auth.uid() = user_id AND status = 'pending');