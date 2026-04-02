-- Create message_reactions table for emoji reactions
CREATE TABLE public.message_reactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  emoji TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- One reaction per user per message per emoji
  CONSTRAINT message_reactions_unique UNIQUE (message_id, user_id, emoji)
);

-- Enable RLS
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view reactions on messages they can see
CREATE POLICY "Users can view message reactions"
ON public.message_reactions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM messages m
    WHERE m.id = message_reactions.message_id
    AND (
      -- Agreement message
      (m.agreement_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM debt_agreements da
        WHERE da.id = m.agreement_id 
        AND (da.lender_id = auth.uid() OR da.borrower_id = auth.uid())
      ))
      OR
      -- Direct chat message
      (m.direct_chat_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM direct_chats dc
        WHERE dc.id = m.direct_chat_id
        AND (dc.user1_id = auth.uid() OR dc.user2_id = auth.uid())
      ))
    )
  )
);

-- Policy: Users can add reactions to messages they can see
CREATE POLICY "Users can add reactions"
ON public.message_reactions FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM messages m
    WHERE m.id = message_reactions.message_id
    AND (
      (m.agreement_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM debt_agreements da
        WHERE da.id = m.agreement_id 
        AND (da.lender_id = auth.uid() OR da.borrower_id = auth.uid())
      ))
      OR
      (m.direct_chat_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM direct_chats dc
        WHERE dc.id = m.direct_chat_id
        AND (dc.user1_id = auth.uid() OR dc.user2_id = auth.uid())
      ))
    )
  )
);

-- Policy: Users can remove their own reactions
CREATE POLICY "Users can remove own reactions"
ON public.message_reactions FOR DELETE
USING (auth.uid() = user_id);

-- Create index for fast lookups
CREATE INDEX idx_message_reactions_message_id ON public.message_reactions(message_id);

-- Enable realtime for reactions
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;