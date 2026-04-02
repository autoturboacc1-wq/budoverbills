-- Create table for admin OTP verification
CREATE TABLE public.admin_otp (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  otp_code TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  verified BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.admin_otp ENABLE ROW LEVEL SECURITY;

-- Policy: Only the user can view their own OTP
CREATE POLICY "Users can view own OTP"
ON public.admin_otp FOR SELECT
USING (auth.uid() = user_id);

-- Policy: System can insert OTP (via service role)
CREATE POLICY "System can insert OTP"
ON public.admin_otp FOR INSERT
WITH CHECK (true);

-- Policy: Users can update their own OTP (mark as verified)
CREATE POLICY "Users can update own OTP"
ON public.admin_otp FOR UPDATE
USING (auth.uid() = user_id);

-- Policy: Users can delete their own OTP
CREATE POLICY "Users can delete own OTP"
ON public.admin_otp FOR DELETE
USING (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX idx_admin_otp_user_id ON public.admin_otp(user_id);
CREATE INDEX idx_admin_otp_expires_at ON public.admin_otp(expires_at);

-- Function to generate and store OTP
CREATE OR REPLACE FUNCTION public.generate_admin_otp(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_otp TEXT;
BEGIN
  -- Delete any existing OTP for this user
  DELETE FROM public.admin_otp WHERE user_id = p_user_id;
  
  -- Generate 6-digit OTP
  v_otp := LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');
  
  -- Insert new OTP with 5-minute expiry
  INSERT INTO public.admin_otp (user_id, otp_code, expires_at)
  VALUES (p_user_id, v_otp, now() + interval '5 minutes');
  
  RETURN v_otp;
END;
$$;

-- Function to verify OTP
CREATE OR REPLACE FUNCTION public.verify_admin_otp(p_user_id UUID, p_otp TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_valid BOOLEAN := false;
BEGIN
  -- Check if OTP is valid and not expired
  UPDATE public.admin_otp
  SET verified = true
  WHERE user_id = p_user_id 
    AND otp_code = p_otp 
    AND expires_at > now()
    AND verified = false
  RETURNING true INTO v_valid;
  
  RETURN COALESCE(v_valid, false);
END;
$$;