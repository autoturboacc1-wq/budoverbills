-- Create storage bucket for feed images
INSERT INTO storage.buckets (id, name, public)
VALUES ('feed-images', 'feed-images', true);

-- Storage policies for feed-images bucket
CREATE POLICY "Anyone can view feed images"
ON storage.objects
FOR SELECT
USING (bucket_id = 'feed-images');

CREATE POLICY "Admins can upload feed images"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'feed-images' 
  AND public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins can update feed images"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'feed-images' 
  AND public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins can delete feed images"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'feed-images' 
  AND public.has_role(auth.uid(), 'admin')
);

-- Enable realtime for feed_comments
ALTER TABLE public.feed_comments REPLICA IDENTITY FULL;

-- Add table to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.feed_comments;