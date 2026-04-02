ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS voice_url TEXT,
ADD COLUMN IF NOT EXISTS voice_duration INTEGER;

COMMENT ON COLUMN public.messages.voice_url IS 'Private storage path for a chat voice note';
COMMENT ON COLUMN public.messages.voice_duration IS 'Voice note duration in seconds';
