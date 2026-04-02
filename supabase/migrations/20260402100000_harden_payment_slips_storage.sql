-- Harden payment slip storage policies to match the new path contract:
--   {agreement_id}/{kind}/{entity_id}-{timestamp}.{ext}
-- while keeping temporary compatibility for legacy object keys:
--   transfers/transfer-{agreement_id}-{timestamp}.{ext}
--   slips/{installment_id}-{timestamp}.{ext}
--   slips/reschedule-{installment_id}-{timestamp}.{ext}

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
  AND (
    (
      array_length(storage.foldername(name), 1) >= 2
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
    )
    OR (
      split_part(name, '/', 1) = 'transfers'
      AND split_part(name, '/', 2) ~ '^transfer-[0-9a-f-]{36}-'
      AND EXISTS (
        SELECT 1
        FROM public.debt_agreements agreement_row
        WHERE agreement_row.id::text = regexp_replace(split_part(name, '/', 2), '^transfer-([0-9a-f-]{36})-.*$', '\1')
          AND (
            agreement_row.lender_id = auth.uid()
            OR agreement_row.borrower_id = auth.uid()
          )
      )
    )
    OR (
      split_part(name, '/', 1) = 'slips'
      AND split_part(name, '/', 2) ~ '^(reschedule-)?[0-9a-f-]{36}-'
      AND EXISTS (
        SELECT 1
        FROM public.installments installment_row
        JOIN public.debt_agreements agreement_row
          ON agreement_row.id = installment_row.agreement_id
        WHERE installment_row.id::text = regexp_replace(split_part(name, '/', 2), '^(?:reschedule-)?([0-9a-f-]{36})-.*$', '\1')
          AND (
            agreement_row.lender_id = auth.uid()
            OR agreement_row.borrower_id = auth.uid()
          )
      )
    )
  )
);

CREATE POLICY "Agreement party can insert owned payment slips"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'payment-slips'
  AND auth.uid() IS NOT NULL
  AND (
    (
      array_length(storage.foldername(name), 1) >= 2
      AND (storage.foldername(name))[2] = 'transfer'
      AND EXISTS (
        SELECT 1
        FROM public.debt_agreements agreement_row
        WHERE agreement_row.id::text = (storage.foldername(name))[1]
          AND agreement_row.lender_id = auth.uid()
      )
    )
    OR (
      array_length(storage.foldername(name), 1) >= 2
      AND (storage.foldername(name))[2] IN ('installment', 'reschedule')
      AND EXISTS (
        SELECT 1
        FROM public.debt_agreements agreement_row
        WHERE agreement_row.id::text = (storage.foldername(name))[1]
          AND agreement_row.borrower_id = auth.uid()
      )
    )
    OR (
      split_part(name, '/', 1) = 'transfers'
      AND split_part(name, '/', 2) ~ '^transfer-[0-9a-f-]{36}-'
      AND EXISTS (
        SELECT 1
        FROM public.debt_agreements agreement_row
        WHERE agreement_row.id::text = regexp_replace(split_part(name, '/', 2), '^transfer-([0-9a-f-]{36})-.*$', '\1')
          AND agreement_row.lender_id = auth.uid()
      )
    )
    OR (
      split_part(name, '/', 1) = 'slips'
      AND split_part(name, '/', 2) ~ '^(reschedule-)?[0-9a-f-]{36}-'
      AND EXISTS (
        SELECT 1
        FROM public.installments installment_row
        JOIN public.debt_agreements agreement_row
          ON agreement_row.id = installment_row.agreement_id
        WHERE installment_row.id::text = regexp_replace(split_part(name, '/', 2), '^(?:reschedule-)?([0-9a-f-]{36})-.*$', '\1')
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
  AND (
    (
      array_length(storage.foldername(name), 1) >= 2
      AND (storage.foldername(name))[2] = 'transfer'
      AND EXISTS (
        SELECT 1
        FROM public.debt_agreements agreement_row
        WHERE agreement_row.id::text = (storage.foldername(name))[1]
          AND agreement_row.lender_id = auth.uid()
      )
    )
    OR (
      array_length(storage.foldername(name), 1) >= 2
      AND (storage.foldername(name))[2] IN ('installment', 'reschedule')
      AND EXISTS (
        SELECT 1
        FROM public.debt_agreements agreement_row
        WHERE agreement_row.id::text = (storage.foldername(name))[1]
          AND agreement_row.borrower_id = auth.uid()
      )
    )
    OR (
      split_part(name, '/', 1) = 'transfers'
      AND split_part(name, '/', 2) ~ '^transfer-[0-9a-f-]{36}-'
      AND EXISTS (
        SELECT 1
        FROM public.debt_agreements agreement_row
        WHERE agreement_row.id::text = regexp_replace(split_part(name, '/', 2), '^transfer-([0-9a-f-]{36})-.*$', '\1')
          AND agreement_row.lender_id = auth.uid()
      )
    )
    OR (
      split_part(name, '/', 1) = 'slips'
      AND split_part(name, '/', 2) ~ '^(reschedule-)?[0-9a-f-]{36}-'
      AND EXISTS (
        SELECT 1
        FROM public.installments installment_row
        JOIN public.debt_agreements agreement_row
          ON agreement_row.id = installment_row.agreement_id
        WHERE installment_row.id::text = regexp_replace(split_part(name, '/', 2), '^(?:reschedule-)?([0-9a-f-]{36})-.*$', '\1')
          AND agreement_row.borrower_id = auth.uid()
      )
    )
  )
)
WITH CHECK (
  bucket_id = 'payment-slips'
  AND auth.uid() IS NOT NULL
  AND (
    (
      array_length(storage.foldername(name), 1) >= 2
      AND (storage.foldername(name))[2] = 'transfer'
      AND EXISTS (
        SELECT 1
        FROM public.debt_agreements agreement_row
        WHERE agreement_row.id::text = (storage.foldername(name))[1]
          AND agreement_row.lender_id = auth.uid()
      )
    )
    OR (
      array_length(storage.foldername(name), 1) >= 2
      AND (storage.foldername(name))[2] IN ('installment', 'reschedule')
      AND EXISTS (
        SELECT 1
        FROM public.debt_agreements agreement_row
        WHERE agreement_row.id::text = (storage.foldername(name))[1]
          AND agreement_row.borrower_id = auth.uid()
      )
    )
    OR (
      split_part(name, '/', 1) = 'transfers'
      AND split_part(name, '/', 2) ~ '^transfer-[0-9a-f-]{36}-'
      AND EXISTS (
        SELECT 1
        FROM public.debt_agreements agreement_row
        WHERE agreement_row.id::text = regexp_replace(split_part(name, '/', 2), '^transfer-([0-9a-f-]{36})-.*$', '\1')
          AND agreement_row.lender_id = auth.uid()
      )
    )
    OR (
      split_part(name, '/', 1) = 'slips'
      AND split_part(name, '/', 2) ~ '^(reschedule-)?[0-9a-f-]{36}-'
      AND EXISTS (
        SELECT 1
        FROM public.installments installment_row
        JOIN public.debt_agreements agreement_row
          ON agreement_row.id = installment_row.agreement_id
        WHERE installment_row.id::text = regexp_replace(split_part(name, '/', 2), '^(?:reschedule-)?([0-9a-f-]{36})-.*$', '\1')
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
  AND (
    (
      array_length(storage.foldername(name), 1) >= 2
      AND (storage.foldername(name))[2] = 'transfer'
      AND EXISTS (
        SELECT 1
        FROM public.debt_agreements agreement_row
        WHERE agreement_row.id::text = (storage.foldername(name))[1]
          AND agreement_row.lender_id = auth.uid()
      )
    )
    OR (
      array_length(storage.foldername(name), 1) >= 2
      AND (storage.foldername(name))[2] IN ('installment', 'reschedule')
      AND EXISTS (
        SELECT 1
        FROM public.debt_agreements agreement_row
        WHERE agreement_row.id::text = (storage.foldername(name))[1]
          AND agreement_row.borrower_id = auth.uid()
      )
    )
    OR (
      split_part(name, '/', 1) = 'transfers'
      AND split_part(name, '/', 2) ~ '^transfer-[0-9a-f-]{36}-'
      AND EXISTS (
        SELECT 1
        FROM public.debt_agreements agreement_row
        WHERE agreement_row.id::text = regexp_replace(split_part(name, '/', 2), '^transfer-([0-9a-f-]{36})-.*$', '\1')
          AND agreement_row.lender_id = auth.uid()
      )
    )
    OR (
      split_part(name, '/', 1) = 'slips'
      AND split_part(name, '/', 2) ~ '^(reschedule-)?[0-9a-f-]{36}-'
      AND EXISTS (
        SELECT 1
        FROM public.installments installment_row
        JOIN public.debt_agreements agreement_row
          ON agreement_row.id = installment_row.agreement_id
        WHERE installment_row.id::text = regexp_replace(split_part(name, '/', 2), '^(?:reschedule-)?([0-9a-f-]{36})-.*$', '\1')
          AND agreement_row.borrower_id = auth.uid()
      )
    )
  )
);
