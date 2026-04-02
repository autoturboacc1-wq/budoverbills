-- Add is_sponsored to feed_posts
ALTER TABLE public.feed_posts 
ADD COLUMN is_sponsored boolean NOT NULL DEFAULT false;

-- Add deleted_at to content_personas for soft delete
ALTER TABLE public.content_personas 
ADD COLUMN deleted_at timestamp with time zone DEFAULT NULL;

-- Create index for faster queries on deleted personas
CREATE INDEX idx_content_personas_deleted_at ON public.content_personas(deleted_at);

-- Create function to auto-cleanup deleted personas after 30 days
CREATE OR REPLACE FUNCTION public.cleanup_deleted_personas()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  -- Permanently delete personas that were soft-deleted more than 30 days ago
  DELETE FROM public.content_personas
  WHERE deleted_at IS NOT NULL 
    AND deleted_at < now() - interval '30 days';
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;