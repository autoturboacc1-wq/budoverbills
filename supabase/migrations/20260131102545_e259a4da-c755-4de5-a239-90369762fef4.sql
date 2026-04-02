-- Create direct_chats table for friend-to-friend messaging (like Messenger)
CREATE TABLE public.direct_chats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user1_id UUID NOT NULL,
  user2_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Ensure user1_id < user2_id to prevent duplicate rooms
  CONSTRAINT direct_chats_user_order CHECK (user1_id < user2_id),
  CONSTRAINT direct_chats_unique_pair UNIQUE (user1_id, user2_id)
);

-- Enable RLS
ALTER TABLE public.direct_chats ENABLE ROW LEVEL SECURITY;

-- Policies for direct_chats
CREATE POLICY "Users can view their direct chats"
ON public.direct_chats FOR SELECT
USING (auth.uid() = user1_id OR auth.uid() = user2_id);

CREATE POLICY "Users can create direct chats with friends"
ON public.direct_chats FOR INSERT
WITH CHECK (
  (auth.uid() = user1_id OR auth.uid() = user2_id)
  AND EXISTS (
    SELECT 1 FROM public.friends f
    WHERE f.user_id = auth.uid() 
    AND f.friend_user_id = CASE WHEN auth.uid() = user1_id THEN user2_id ELSE user1_id END
  )
);

CREATE POLICY "Users can update their direct chats"
ON public.direct_chats FOR UPDATE
USING (auth.uid() = user1_id OR auth.uid() = user2_id);

-- Add direct_chat_id to messages table and make agreement_id nullable
ALTER TABLE public.messages 
ADD COLUMN direct_chat_id UUID REFERENCES public.direct_chats(id) ON DELETE CASCADE;

ALTER TABLE public.messages 
ALTER COLUMN agreement_id DROP NOT NULL;

-- Add constraint: message must belong to either agreement OR direct_chat (not both, not neither)
ALTER TABLE public.messages 
ADD CONSTRAINT messages_chat_type_check 
CHECK (
  (agreement_id IS NOT NULL AND direct_chat_id IS NULL) OR 
  (agreement_id IS NULL AND direct_chat_id IS NOT NULL)
);

-- Drop old message policies and create new ones that support both chat types
DROP POLICY IF EXISTS "Agreement parties can view messages" ON public.messages;
DROP POLICY IF EXISTS "Agreement parties can send messages" ON public.messages;
DROP POLICY IF EXISTS "Agreement parties can update messages" ON public.messages;

-- New SELECT policy: view messages in agreements OR direct chats
CREATE POLICY "Users can view messages"
ON public.messages FOR SELECT
USING (
  -- Agreement chat: user is lender or borrower
  (agreement_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM debt_agreements da
    WHERE da.id = messages.agreement_id 
    AND (da.lender_id = auth.uid() OR da.borrower_id = auth.uid())
  ))
  OR
  -- Direct chat: user is participant
  (direct_chat_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM direct_chats dc
    WHERE dc.id = messages.direct_chat_id
    AND (dc.user1_id = auth.uid() OR dc.user2_id = auth.uid())
  ))
);

-- New INSERT policy: send messages in agreements OR direct chats
CREATE POLICY "Users can send messages"
ON public.messages FOR INSERT
WITH CHECK (
  auth.uid() = sender_id
  AND (
    -- Agreement chat: user is lender or borrower
    (agreement_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM debt_agreements da
      WHERE da.id = messages.agreement_id 
      AND (da.lender_id = auth.uid() OR da.borrower_id = auth.uid())
    ))
    OR
    -- Direct chat: user is participant
    (direct_chat_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM direct_chats dc
      WHERE dc.id = messages.direct_chat_id
      AND (dc.user1_id = auth.uid() OR dc.user2_id = auth.uid())
    ))
  )
);

-- New UPDATE policy: update messages in agreements OR direct chats (for read status)
CREATE POLICY "Users can update messages"
ON public.messages FOR UPDATE
USING (
  -- Agreement chat
  (agreement_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM debt_agreements da
    WHERE da.id = messages.agreement_id 
    AND (da.lender_id = auth.uid() OR da.borrower_id = auth.uid())
  ))
  OR
  -- Direct chat
  (direct_chat_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM direct_chats dc
    WHERE dc.id = messages.direct_chat_id
    AND (dc.user1_id = auth.uid() OR dc.user2_id = auth.uid())
  ))
);

-- Update chat_typing table to support direct chats
ALTER TABLE public.chat_typing 
ADD COLUMN direct_chat_id UUID REFERENCES public.direct_chats(id) ON DELETE CASCADE;

ALTER TABLE public.chat_typing 
ALTER COLUMN agreement_id DROP NOT NULL;

ALTER TABLE public.chat_typing 
ADD CONSTRAINT chat_typing_chat_type_check 
CHECK (
  (agreement_id IS NOT NULL AND direct_chat_id IS NULL) OR 
  (agreement_id IS NULL AND direct_chat_id IS NOT NULL)
);

-- Drop old typing policies and create new ones
DROP POLICY IF EXISTS "Agreement parties can view typing status" ON public.chat_typing;
DROP POLICY IF EXISTS "Users can manage own typing status" ON public.chat_typing;
DROP POLICY IF EXISTS "Users can update own typing status" ON public.chat_typing;
DROP POLICY IF EXISTS "Users can delete own typing status" ON public.chat_typing;

CREATE POLICY "Users can view typing status"
ON public.chat_typing FOR SELECT
USING (
  (agreement_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM debt_agreements da
    WHERE da.id = chat_typing.agreement_id 
    AND (da.lender_id = auth.uid() OR da.borrower_id = auth.uid())
  ))
  OR
  (direct_chat_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM direct_chats dc
    WHERE dc.id = chat_typing.direct_chat_id
    AND (dc.user1_id = auth.uid() OR dc.user2_id = auth.uid())
  ))
);

CREATE POLICY "Users can manage typing status"
ON public.chat_typing FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND (
    (agreement_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM debt_agreements da
      WHERE da.id = chat_typing.agreement_id 
      AND (da.lender_id = auth.uid() OR da.borrower_id = auth.uid())
    ))
    OR
    (direct_chat_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM direct_chats dc
      WHERE dc.id = chat_typing.direct_chat_id
      AND (dc.user1_id = auth.uid() OR dc.user2_id = auth.uid())
    ))
  )
);

CREATE POLICY "Users can update typing"
ON public.chat_typing FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete typing"
ON public.chat_typing FOR DELETE
USING (auth.uid() = user_id);

-- Enable realtime for direct_chats
ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_chats;

-- Create trigger for updated_at on direct_chats
CREATE TRIGGER update_direct_chats_updated_at
BEFORE UPDATE ON public.direct_chats
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();