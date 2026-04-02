-- Drop feed and expense group related tables
-- These features have been removed from the app

-- First drop tables that have foreign keys
DROP TABLE IF EXISTS public.saved_posts CASCADE;
DROP TABLE IF EXISTS public.reading_progress CASCADE;
DROP TABLE IF EXISTS public.feed_comments CASCADE;
DROP TABLE IF EXISTS public.feed_likes CASCADE;
DROP TABLE IF EXISTS public.feed_posts CASCADE;
DROP TABLE IF EXISTS public.content_personas CASCADE;

-- Drop expense group tables
DROP TABLE IF EXISTS public.group_expenses CASCADE;
DROP TABLE IF EXISTS public.group_members CASCADE;
DROP TABLE IF EXISTS public.expense_groups CASCADE;

-- Create messages table for chat between agreement parties
CREATE TABLE public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agreement_id UUID NOT NULL REFERENCES public.debt_agreements(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  read_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Only parties of the agreement can view messages
CREATE POLICY "Agreement parties can view messages"
ON public.messages
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.debt_agreements da
    WHERE da.id = messages.agreement_id
    AND (da.lender_id = auth.uid() OR da.borrower_id = auth.uid())
  )
);

-- Only parties can send messages
CREATE POLICY "Agreement parties can send messages"
ON public.messages
FOR INSERT
WITH CHECK (
  auth.uid() = sender_id
  AND EXISTS (
    SELECT 1 FROM public.debt_agreements da
    WHERE da.id = messages.agreement_id
    AND (da.lender_id = auth.uid() OR da.borrower_id = auth.uid())
  )
);

-- Parties can update messages (for marking as read)
CREATE POLICY "Agreement parties can update messages"
ON public.messages
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.debt_agreements da
    WHERE da.id = messages.agreement_id
    AND (da.lender_id = auth.uid() OR da.borrower_id = auth.uid())
  )
);

-- Enable realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- Create index for faster queries
CREATE INDEX idx_messages_agreement_id ON public.messages(agreement_id);
CREATE INDEX idx_messages_created_at ON public.messages(created_at DESC);