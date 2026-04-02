-- Create table for admin access codes
CREATE TABLE public.admin_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code_name TEXT NOT NULL UNIQUE,
  code_hash TEXT NOT NULL,
  role app_role NOT NULL DEFAULT 'moderator',
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.admin_codes ENABLE ROW LEVEL SECURITY;

-- Only admins can view/manage codes
CREATE POLICY "Only admins can view admin codes"
ON public.admin_codes
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can manage admin codes"
ON public.admin_codes
FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- Create function to verify admin code (no auth required)
CREATE OR REPLACE FUNCTION public.verify_admin_code(p_code TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code_record RECORD;
  v_code_hash TEXT;
BEGIN
  -- Simple hash for comparison
  v_code_hash := encode(sha256(p_code::bytea), 'hex');
  
  -- Find matching code
  SELECT * INTO v_code_record
  FROM public.admin_codes
  WHERE code_hash = v_code_hash
    AND is_active = true;
  
  IF v_code_record IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'รหัสไม่ถูกต้อง');
  END IF;
  
  -- Update last used
  UPDATE public.admin_codes
  SET last_used_at = now()
  WHERE id = v_code_record.id;
  
  RETURN jsonb_build_object(
    'success', true, 
    'code_name', v_code_record.code_name,
    'role', v_code_record.role
  );
END;
$$;

-- Create function to add admin code (only admins can use)
CREATE OR REPLACE FUNCTION public.create_admin_code(p_code_name TEXT, p_code TEXT, p_role app_role DEFAULT 'moderator')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code_hash TEXT;
BEGIN
  -- Check if caller is admin
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'ไม่มีสิทธิ์');
  END IF;
  
  v_code_hash := encode(sha256(p_code::bytea), 'hex');
  
  INSERT INTO public.admin_codes (code_name, code_hash, role)
  VALUES (p_code_name, v_code_hash, p_role);
  
  RETURN jsonb_build_object('success', true, 'message', 'สร้างรหัสสำเร็จ');
END;
$$;

-- Insert a default admin code: "ADMIN2024" (you can change this)
INSERT INTO public.admin_codes (code_name, code_hash, role)
VALUES ('Content Creator', encode(sha256('CONTENT2024'::bytea), 'hex'), 'moderator');