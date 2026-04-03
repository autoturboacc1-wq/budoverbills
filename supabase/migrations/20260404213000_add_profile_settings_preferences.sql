ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS notification_preferences jsonb NOT NULL DEFAULT '{
  "push": true,
  "email": true,
  "paymentReminders": true,
  "agreementUpdates": true
}'::jsonb,
ADD COLUMN IF NOT EXISTS privacy_settings jsonb NOT NULL DEFAULT '{
  "showProfile": true,
  "showActivity": false
}'::jsonb;

COMMENT ON COLUMN public.profiles.notification_preferences IS
'User notification settings persisted from the Settings screen.';

COMMENT ON COLUMN public.profiles.privacy_settings IS
'User privacy settings persisted from the Settings screen.';
