-- Create storage bucket for payment slips
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'payment-slips', 
  'payment-slips', 
  true,
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
);

-- RLS policy: Users can upload slips for their own agreements (as borrower)
CREATE POLICY "Borrowers can upload payment slips"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'payment-slips' 
  AND auth.uid() IS NOT NULL
);

-- RLS policy: Both parties can view payment slips for their agreements
CREATE POLICY "Parties can view payment slips"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'payment-slips'
  AND auth.uid() IS NOT NULL
);

-- RLS policy: Borrowers can update their own slips
CREATE POLICY "Borrowers can update payment slips"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'payment-slips'
  AND auth.uid() IS NOT NULL
);

-- RLS policy: Borrowers can delete their own slips
CREATE POLICY "Borrowers can delete payment slips"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'payment-slips'
  AND auth.uid() IS NOT NULL
);