-- Create trigger function to notify admins on suspicious activity
CREATE OR REPLACE FUNCTION public.notify_admins_on_suspicious_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  admin_record RECORD;
BEGIN
  -- Only trigger for suspicious activities
  IF NEW.is_suspicious = true THEN
    -- Notify all admins
    FOR admin_record IN 
      SELECT user_id FROM public.user_roles WHERE role = 'admin'
    LOOP
      INSERT INTO public.notifications (
        user_id,
        type,
        title,
        message,
        related_type,
        related_id
      ) VALUES (
        admin_record.user_id,
        'security_alert',
        'พบกิจกรรมต้องสงสัย',
        'ตรวจพบ ' || NEW.action_type || ' จาก User ID: ' || COALESCE(NEW.user_id::text, 'Unknown'),
        'activity_log',
        NEW.id
      );
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_notify_admins_suspicious ON public.activity_logs;
CREATE TRIGGER trigger_notify_admins_suspicious
  AFTER INSERT ON public.activity_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_admins_on_suspicious_activity();

-- Add comment
COMMENT ON FUNCTION public.notify_admins_on_suspicious_activity IS 'Automatically notifies all admins when suspicious activity is detected';