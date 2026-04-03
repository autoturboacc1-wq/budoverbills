CREATE UNIQUE INDEX IF NOT EXISTS chat_typing_direct_chat_user_unique_idx
ON public.chat_typing (direct_chat_id, user_id)
WHERE direct_chat_id IS NOT NULL AND agreement_id IS NULL;
