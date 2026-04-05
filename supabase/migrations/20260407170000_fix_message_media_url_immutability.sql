-- BUG-RLS-19: message media URL immutability
-- The existing enforce_message_voice_note_integrity trigger (20260404110000) protects
-- voice_url and voice_duration on UPDATE, but image_url and file_url were not included.
-- The 20260406150000 migration updated the function body to cover those columns, however
-- it never re-attached the trigger, leaving the binding potentially stale.
--
-- This migration adds a dedicated, clearly-named trigger that enforces immutability of
-- all three media URL columns (image_url, file_url, voice_url) independently of the
-- broader integrity function.

CREATE OR REPLACE FUNCTION public.prevent_message_media_url_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.image_url IS DISTINCT FROM NEW.image_url OR
     OLD.file_url IS DISTINCT FROM NEW.file_url OR
     OLD.voice_url IS DISTINCT FROM NEW.voice_url THEN
    RAISE EXCEPTION 'message media URLs are immutable after creation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public;

DROP TRIGGER IF EXISTS enforce_message_media_immutability ON public.messages;
CREATE TRIGGER enforce_message_media_immutability
  BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.prevent_message_media_url_change();
