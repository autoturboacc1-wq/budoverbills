-- BUG-RLS-02 (messages): messages UPDATE policy lacks WITH CHECK (sender_id = auth.uid())
-- A chat participant could update image_url / file_url on another participant's message,
-- forging a payment slip. Fix: add sender_id = auth.uid() to the WITH CHECK clause.

DROP POLICY IF EXISTS "Users can update messages" ON public.messages;

CREATE POLICY "Users can update messages"
ON public.messages FOR UPDATE
USING (
  (agreement_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.debt_agreements da
    WHERE da.id = messages.agreement_id
      AND (da.lender_id = auth.uid() OR da.borrower_id = auth.uid())
  ))
  OR
  (direct_chat_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.direct_chats dc
    WHERE dc.id = messages.direct_chat_id
      AND (dc.user1_id = auth.uid() OR dc.user2_id = auth.uid())
  ))
)
WITH CHECK (
  -- The row being written must belong to the caller.
  sender_id = auth.uid()
  AND (
    (agreement_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.debt_agreements da
      WHERE da.id = messages.agreement_id
        AND (da.lender_id = auth.uid() OR da.borrower_id = auth.uid())
    ))
    OR
    (direct_chat_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.direct_chats dc
      WHERE dc.id = messages.direct_chat_id
        AND (dc.user1_id = auth.uid() OR dc.user2_id = auth.uid())
    ))
  )
);
