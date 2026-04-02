-- Harden payment slip storage policies to match the path contract:
-- {agreement_id}/{kind}/{entity_id}-{timestamp}.{ext}

DROP POLICY IF EXISTS "Borrowers can upload payment slips" ON storage.objects;
DROP POLICY IF EXISTS "Parties can view payment slips" ON storage.objects;
DROP POLICY IF EXISTS "Borrowers can update payment slips" ON storage.objects;
DROP POLICY IF EXISTS "Borrowers can delete payment slips" ON storage.objects;

CREATE POLICY "Agreement parties can view payment slips"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'payment-slips'
  AND auth.uid() IS NOT NULL
  AND array_length(storage.foldername(name), 1) >= 2
  AND (storage.foldername(name))[2] IN ('transfer', 'installment', 'reschedule')
  AND EXISTS (
    SELECT 1
    FROM public.debt_agreements agreement_row
    WHERE agreement_row.id::text = (storage.foldername(name))[1]
      AND (
        agreement_row.lender_id = auth.uid()
        OR agreement_row.borrower_id = auth.uid()
      )
  )
);

CREATE POLICY "Agreement party can insert owned payment slips"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'payment-slips'
  AND auth.uid() IS NOT NULL
  AND array_length(storage.foldername(name), 1) >= 2
  AND (
    (
      (storage.foldername(name))[2] = 'transfer'
      AND EXISTS (
        SELECT 1
        FROM public.debt_agreements agreement_row
        WHERE agreement_row.id::text = (storage.foldername(name))[1]
          AND agreement_row.lender_id = auth.uid()
      )
    )
    OR (
      (storage.foldername(name))[2] IN ('installment', 'reschedule')
      AND EXISTS (
        SELECT 1
        FROM public.debt_agreements agreement_row
        WHERE agreement_row.id::text = (storage.foldername(name))[1]
          AND agreement_row.borrower_id = auth.uid()
      )
    )
  )
);

CREATE POLICY "Agreement party can update owned payment slips"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'payment-slips'
  AND auth.uid() IS NOT NULL
  AND array_length(storage.foldername(name), 1) >= 2
  AND (
    (
      (storage.foldername(name))[2] = 'transfer'
      AND EXISTS (
        SELECT 1
        FROM public.debt_agreements agreement_row
        WHERE agreement_row.id::text = (storage.foldername(name))[1]
          AND agreement_row.lender_id = auth.uid()
      )
    )
    OR (
      (storage.foldername(name))[2] IN ('installment', 'reschedule')
      AND EXISTS (
        SELECT 1
        FROM public.debt_agreements agreement_row
        WHERE agreement_row.id::text = (storage.foldername(name))[1]
          AND agreement_row.borrower_id = auth.uid()
      )
    )
  )
)
WITH CHECK (
  bucket_id = 'payment-slips'
  AND auth.uid() IS NOT NULL
  AND array_length(storage.foldername(name), 1) >= 2
  AND (
    (
      (storage.foldername(name))[2] = 'transfer'
      AND EXISTS (
        SELECT 1
        FROM public.debt_agreements agreement_row
        WHERE agreement_row.id::text = (storage.foldername(name))[1]
          AND agreement_row.lender_id = auth.uid()
      )
    )
    OR (
      (storage.foldername(name))[2] IN ('installment', 'reschedule')
      AND EXISTS (
        SELECT 1
        FROM public.debt_agreements agreement_row
        WHERE agreement_row.id::text = (storage.foldername(name))[1]
          AND agreement_row.borrower_id = auth.uid()
      )
    )
  )
);

CREATE POLICY "Agreement party can delete owned payment slips"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'payment-slips'
  AND auth.uid() IS NOT NULL
  AND array_length(storage.foldername(name), 1) >= 2
  AND (
    (
      (storage.foldername(name))[2] = 'transfer'
      AND EXISTS (
        SELECT 1
        FROM public.debt_agreements agreement_row
        WHERE agreement_row.id::text = (storage.foldername(name))[1]
          AND agreement_row.lender_id = auth.uid()
      )
    )
    OR (
      (storage.foldername(name))[2] IN ('installment', 'reschedule')
      AND EXISTS (
        SELECT 1
        FROM public.debt_agreements agreement_row
        WHERE agreement_row.id::text = (storage.foldername(name))[1]
          AND agreement_row.borrower_id = auth.uid()
      )
    )
  )
);
