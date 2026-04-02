-- Add pdpa_accepted_at column to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pdpa_accepted_at TIMESTAMP WITH TIME ZONE;