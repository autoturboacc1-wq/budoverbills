-- Create content_personas table for admin to create different posting personas
CREATE TABLE public.content_personas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  avatar_url TEXT,
  description TEXT,
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.content_personas ENABLE ROW LEVEL SECURITY;

-- Only admins can manage personas
CREATE POLICY "Admins can manage personas"
ON public.content_personas
FOR ALL
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Anyone authenticated can view active personas (for display on feed)
CREATE POLICY "Authenticated users can view active personas"
ON public.content_personas
FOR SELECT
USING (auth.uid() IS NOT NULL AND is_active = true);

-- Add persona_id to feed_posts (nullable for backward compatibility)
ALTER TABLE public.feed_posts
ADD COLUMN persona_id UUID REFERENCES public.content_personas(id) ON DELETE SET NULL;

-- Create trigger for updated_at
CREATE TRIGGER update_content_personas_updated_at
BEFORE UPDATE ON public.content_personas
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();