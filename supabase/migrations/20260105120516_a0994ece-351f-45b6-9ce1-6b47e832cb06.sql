-- Add category column to feed_posts
ALTER TABLE public.feed_posts 
ADD COLUMN category text DEFAULT 'general';

-- Add index for category filtering
CREATE INDEX idx_feed_posts_category ON public.feed_posts(category);