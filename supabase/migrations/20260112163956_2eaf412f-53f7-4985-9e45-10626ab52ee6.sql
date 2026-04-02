-- Change payment-slips bucket to private
UPDATE storage.buckets 
SET public = false 
WHERE id = 'payment-slips';