-- Fix admin_otp: Only allow insertion via security definer functions (not direct client access)
DROP POLICY IF EXISTS "System can insert OTP" ON public.admin_otp;

-- Create a restrictive insert policy that blocks direct client inserts
-- OTP insertion should only happen through the generate_admin_otp function (SECURITY DEFINER)
CREATE POLICY "Only system functions can insert OTP"
ON public.admin_otp
FOR INSERT
WITH CHECK (false);

-- Fix activity_logs: Only allow insertion via security definer functions
DROP POLICY IF EXISTS "System can insert activity logs" ON public.activity_logs;

-- Block direct client inserts - logs should only be inserted through log_activity function (SECURITY DEFINER)
CREATE POLICY "Only system functions can insert activity logs"
ON public.activity_logs
FOR INSERT
WITH CHECK (false);