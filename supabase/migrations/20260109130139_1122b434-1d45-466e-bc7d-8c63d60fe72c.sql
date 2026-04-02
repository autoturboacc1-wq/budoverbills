-- Add expires_at column to admin_codes table
ALTER TABLE public.admin_codes 
ADD COLUMN expires_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Update verify_admin_code function to check expiration
CREATE OR REPLACE FUNCTION public.verify_admin_code(p_code text)
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
  
  -- Check expiration
  IF v_code_record.expires_at IS NOT NULL AND v_code_record.expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'รหัสหมดอายุแล้ว');
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

-- Update create_admin_code function to support expires_at
CREATE OR REPLACE FUNCTION public.create_admin_code(
  p_code_name text, 
  p_code text, 
  p_role app_role DEFAULT 'moderator'::app_role,
  p_expires_at timestamp with time zone DEFAULT NULL
)
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
  
  INSERT INTO public.admin_codes (code_name, code_hash, role, expires_at)
  VALUES (p_code_name, v_code_hash, p_role, p_expires_at);
  
  RETURN jsonb_build_object('success', true, 'message', 'สร้างรหัสสำเร็จ');
END;
$$;

-- Function to delete admin code
CREATE OR REPLACE FUNCTION public.delete_admin_code(p_code_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'ไม่มีสิทธิ์');
  END IF;
  
  DELETE FROM public.admin_codes WHERE id = p_code_id;
  
  RETURN jsonb_build_object('success', true, 'message', 'ลบรหัสสำเร็จ');
END;
$$;

-- Function to update admin code
CREATE OR REPLACE FUNCTION public.update_admin_code(
  p_code_id uuid,
  p_code_name text DEFAULT NULL,
  p_is_active boolean DEFAULT NULL,
  p_expires_at timestamp with time zone DEFAULT NULL,
  p_clear_expiry boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'ไม่มีสิทธิ์');
  END IF;
  
  UPDATE public.admin_codes
  SET 
    code_name = COALESCE(p_code_name, code_name),
    is_active = COALESCE(p_is_active, is_active),
    expires_at = CASE 
      WHEN p_clear_expiry THEN NULL
      WHEN p_expires_at IS NOT NULL THEN p_expires_at
      ELSE expires_at
    END
  WHERE id = p_code_id;
  
  RETURN jsonb_build_object('success', true, 'message', 'อัปเดตสำเร็จ');
END;
$$;

-- Allow admins to view admin_codes
CREATE POLICY "Admins can view admin codes"
ON public.admin_codes
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));