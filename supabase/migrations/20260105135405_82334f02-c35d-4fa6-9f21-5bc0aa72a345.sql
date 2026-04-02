-- Fix Security Issues: Update RLS policies

-- 1. Fix profiles: Only authenticated users can view profiles
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
CREATE POLICY "Authenticated users can view profiles" 
ON public.profiles 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- 2. Fix engagement_badges: Only authenticated users can view badges
DROP POLICY IF EXISTS "Anyone can view badges" ON public.engagement_badges;
CREATE POLICY "Authenticated users can view badges" 
ON public.engagement_badges 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- 3. Fix feed_likes: Only authenticated users can view likes
DROP POLICY IF EXISTS "Anyone can view likes" ON public.feed_likes;
CREATE POLICY "Authenticated users can view likes" 
ON public.feed_likes 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- 4. Fix feed_comments: Only authenticated users can view comments
DROP POLICY IF EXISTS "Anyone can view comments" ON public.feed_comments;
CREATE POLICY "Authenticated users can view comments" 
ON public.feed_comments 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- 5. Fix notifications INSERT: Only authenticated users can create notifications for themselves
DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;
CREATE POLICY "Users can create own notifications" 
ON public.notifications 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Also add a service function for system notifications (e.g., from triggers)
CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_message TEXT,
  p_related_type TEXT DEFAULT NULL,
  p_related_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notification_id UUID;
BEGIN
  INSERT INTO public.notifications (user_id, type, title, message, related_type, related_id)
  VALUES (p_user_id, p_type, p_title, p_message, p_related_type, p_related_id)
  RETURNING id INTO v_notification_id;
  
  RETURN v_notification_id;
END;
$$;