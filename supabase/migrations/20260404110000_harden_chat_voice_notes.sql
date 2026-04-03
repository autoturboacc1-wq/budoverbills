-- Harden chat voice notes and attachments without changing the existing message flow.
-- This closes two holes:
-- 1) Any authenticated user could upload into arbitrary chat-attachments paths.
-- 2) Any chat participant could overwrite voice_url / voice_duration on messages.

DROP POLICY IF EXISTS "Authenticated users can upload chat attachments" ON storage.objects;
DROP POLICY IF EXISTS "Chat attachment owners can upload chat attachments" ON storage.objects;
DROP POLICY IF EXISTS "Chat attachment owners can update chat attachments" ON storage.objects;

CREATE POLICY "Chat attachment owners can upload chat attachments"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'chat-attachments'
  AND auth.uid() IS NOT NULL
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Chat attachment owners can update chat attachments"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'chat-attachments'
  AND auth.uid() IS NOT NULL
  AND auth.uid()::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'chat-attachments'
  AND auth.uid() IS NOT NULL
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE OR REPLACE FUNCTION public.enforce_message_voice_note_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Trust internal/service operations, but stop authenticated users from mutating voice note fields.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.sender_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'sender_id must match the authenticated user';
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.sender_id IS DISTINCT FROM OLD.sender_id
      OR NEW.agreement_id IS DISTINCT FROM OLD.agreement_id
      OR NEW.direct_chat_id IS DISTINCT FROM OLD.direct_chat_id
      OR NEW.content IS DISTINCT FROM OLD.content
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
      OR NEW.voice_url IS DISTINCT FROM OLD.voice_url
      OR NEW.voice_duration IS DISTINCT FROM OLD.voice_duration
    THEN
      RAISE EXCEPTION 'Only read_at may be updated on chat messages';
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_message_voice_note_integrity ON public.messages;
CREATE TRIGGER enforce_message_voice_note_integrity
BEFORE INSERT OR UPDATE ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.enforce_message_voice_note_integrity();
