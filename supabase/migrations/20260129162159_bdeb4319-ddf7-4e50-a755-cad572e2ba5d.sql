-- Add image_url and file_url columns to messages table for file sharing
ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS image_url TEXT,
ADD COLUMN IF NOT EXISTS file_url TEXT,
ADD COLUMN IF NOT EXISTS file_name TEXT;

-- Create chat_typing table for realtime typing indicators
CREATE TABLE IF NOT EXISTS public.chat_typing (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agreement_id UUID NOT NULL REFERENCES public.debt_agreements(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  is_typing BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add unique constraint to prevent duplicates
ALTER TABLE public.chat_typing 
ADD CONSTRAINT chat_typing_agreement_user_unique UNIQUE (agreement_id, user_id);

-- Enable RLS
ALTER TABLE public.chat_typing ENABLE ROW LEVEL SECURITY;

-- RLS policies for chat_typing
CREATE POLICY "Agreement parties can view typing status"
ON public.chat_typing FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.debt_agreements da
    WHERE da.id = chat_typing.agreement_id
    AND (da.lender_id = auth.uid() OR da.borrower_id = auth.uid())
  )
);

CREATE POLICY "Users can manage own typing status"
ON public.chat_typing FOR INSERT
WITH CHECK (
  auth.uid() = user_id AND
  EXISTS (
    SELECT 1 FROM public.debt_agreements da
    WHERE da.id = chat_typing.agreement_id
    AND (da.lender_id = auth.uid() OR da.borrower_id = auth.uid())
  )
);

CREATE POLICY "Users can update own typing status"
ON public.chat_typing FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own typing status"
ON public.chat_typing FOR DELETE
USING (auth.uid() = user_id);

-- Enable realtime for chat_typing table
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_typing;

-- Create storage bucket for chat attachments if not exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-attachments', 'chat-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for chat attachments
CREATE POLICY "Authenticated users can upload chat attachments"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'chat-attachments' 
  AND auth.uid() IS NOT NULL
);

CREATE POLICY "Agreement parties can view chat attachments"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'chat-attachments'
  AND auth.uid() IS NOT NULL
);

CREATE POLICY "Users can delete own chat attachments"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'chat-attachments'
  AND auth.uid()::text = (storage.foldername(name))[1]
);