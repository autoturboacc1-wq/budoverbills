-- Create activity_logs table for security monitoring
CREATE TABLE public.activity_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  action_type TEXT NOT NULL,
  action_category TEXT NOT NULL DEFAULT 'general',
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}',
  is_suspicious BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for efficient querying
CREATE INDEX idx_activity_logs_user_id ON public.activity_logs(user_id);
CREATE INDEX idx_activity_logs_action_type ON public.activity_logs(action_type);
CREATE INDEX idx_activity_logs_created_at ON public.activity_logs(created_at DESC);
CREATE INDEX idx_activity_logs_suspicious ON public.activity_logs(is_suspicious) WHERE is_suspicious = true;

-- Enable RLS
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can read activity logs
CREATE POLICY "Admins can read all activity logs"
  ON public.activity_logs
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- System can insert logs (via service role or security definer functions)
CREATE POLICY "System can insert activity logs"
  ON public.activity_logs
  FOR INSERT
  WITH CHECK (true);

-- Create function to log activity
CREATE OR REPLACE FUNCTION public.log_activity(
  p_user_id UUID,
  p_action_type TEXT,
  p_action_category TEXT DEFAULT 'general',
  p_metadata JSONB DEFAULT '{}',
  p_is_suspicious BOOLEAN DEFAULT false
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO public.activity_logs (
    user_id,
    action_type,
    action_category,
    metadata,
    is_suspicious
  ) VALUES (
    p_user_id,
    p_action_type,
    p_action_category,
    p_metadata,
    p_is_suspicious
  )
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$;

-- Create function to detect suspicious login patterns
CREATE OR REPLACE FUNCTION public.check_suspicious_login(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_failed_count INT;
  v_is_suspicious BOOLEAN := false;
BEGIN
  -- Check for multiple failed logins in last 10 minutes
  SELECT COUNT(*) INTO v_failed_count
  FROM public.activity_logs
  WHERE user_id = p_user_id
    AND action_type = 'login_failed'
    AND created_at > now() - interval '10 minutes';
  
  IF v_failed_count >= 3 THEN
    v_is_suspicious := true;
  END IF;
  
  RETURN v_is_suspicious;
END;
$$;

-- Create function to get user activity summary for admins
CREATE OR REPLACE FUNCTION public.get_suspicious_activities(p_hours INT DEFAULT 24)
RETURNS TABLE (
  user_id UUID,
  action_type TEXT,
  action_count BIGINT,
  last_occurrence TIMESTAMP WITH TIME ZONE
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    al.user_id,
    al.action_type,
    COUNT(*) as action_count,
    MAX(al.created_at) as last_occurrence
  FROM public.activity_logs al
  WHERE al.created_at > now() - (p_hours || ' hours')::interval
    AND al.is_suspicious = true
    AND public.has_role(auth.uid(), 'admin')
  GROUP BY al.user_id, al.action_type
  ORDER BY action_count DESC;
$$;

-- Add comment
COMMENT ON TABLE public.activity_logs IS 'Stores user activity for security monitoring and suspicious behavior detection';