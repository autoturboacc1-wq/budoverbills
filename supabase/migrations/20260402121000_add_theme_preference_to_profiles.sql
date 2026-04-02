ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS theme_preference TEXT NOT NULL DEFAULT 'default'
CHECK (theme_preference IN ('default', 'ocean', 'sunset', 'forest', 'midnight'));

COMMENT ON COLUMN public.profiles.theme_preference IS
'User selected color theme: default, ocean, sunset, forest, midnight';
