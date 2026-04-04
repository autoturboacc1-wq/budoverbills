ALTER TABLE public.chat_typing
ADD CONSTRAINT chat_typing_direct_chat_user_unique
UNIQUE (direct_chat_id, user_id);
