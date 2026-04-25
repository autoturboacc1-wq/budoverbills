-- Allow voice notes recorded in cross-platform audio formats.
-- Safari/iOS commonly records playable audio as MP4/M4A/AAC rather than WebM.

UPDATE storage.buckets
SET
  allowed_mime_types = ARRAY[
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'audio/webm',
    'audio/ogg',
    'audio/mp4',
    'audio/aac',
    'audio/mpeg',
    'audio/x-m4a'
  ],
  file_size_limit = 10485760
WHERE id = 'chat-attachments';
