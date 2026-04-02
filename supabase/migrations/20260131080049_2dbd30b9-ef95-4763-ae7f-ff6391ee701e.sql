-- Add reply_to_id column for message replies
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES public.messages(id) ON DELETE SET NULL;

-- Add index for faster reply lookups
CREATE INDEX IF NOT EXISTS idx_messages_reply_to_id ON public.messages(reply_to_id);

-- Add comment for documentation
COMMENT ON COLUMN public.messages.reply_to_id IS 'References another message when this message is a reply';