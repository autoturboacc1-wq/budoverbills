-- Add scheduled_at column for scheduled posts
ALTER TABLE public.feed_posts 
ADD COLUMN scheduled_at timestamp with time zone DEFAULT NULL;

-- Create index for efficient querying of scheduled posts
CREATE INDEX idx_feed_posts_scheduled_at ON public.feed_posts (scheduled_at) 
WHERE scheduled_at IS NOT NULL AND is_published = false;