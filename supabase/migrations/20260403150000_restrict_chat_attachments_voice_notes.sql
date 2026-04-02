-- Restrict chat attachment reads so voice notes are visible only to the owner
-- or to legitimate agreement/direct-chat participants that the message belongs to.

DROP POLICY IF EXISTS "Agreement parties can view chat attachments" ON storage.objects;

CREATE POLICY "Voice note owners and participants can view chat attachments"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'chat-attachments'
  AND auth.uid() IS NOT NULL
  AND (
    -- Voice notes are uploaded under {owner_id}/voice/{chat_id}-{timestamp}.{ext}
    -- so the uploader can always read their own object.
    auth.uid()::text = (storage.foldername(name))[1]
    OR EXISTS (
      SELECT 1
      FROM public.messages message_row
      WHERE message_row.voice_url = storage.objects.name
        AND (
          (
            message_row.agreement_id IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM public.debt_agreements agreement_row
              WHERE agreement_row.id = message_row.agreement_id
                AND (
                  agreement_row.lender_id = auth.uid()
                  OR agreement_row.borrower_id = auth.uid()
                )
            )
          )
          OR (
            message_row.direct_chat_id IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM public.direct_chats direct_chat_row
              WHERE direct_chat_row.id = message_row.direct_chat_id
                AND (
                  direct_chat_row.user1_id = auth.uid()
                  OR direct_chat_row.user2_id = auth.uid()
                )
            )
          )
        )
    )
  )
);
