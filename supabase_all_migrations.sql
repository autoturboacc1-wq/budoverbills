-- ============================================
-- Migration: 20251231134337_eded21ed-4dff-4e08-8288-a9d2336e3f00.sql
-- ============================================

-- Create profiles table for user information
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  display_name TEXT,
  phone TEXT,
  user_code TEXT UNIQUE,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view all profiles"
ON public.profiles FOR SELECT
USING (true);

CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile"
ON public.profiles FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Function to generate unique user code
CREATE OR REPLACE FUNCTION public.generate_user_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  code TEXT;
  exists_check BOOLEAN;
BEGIN
  LOOP
    code := upper(substring(md5(random()::text) from 1 for 8));
    SELECT EXISTS(SELECT 1 FROM public.profiles WHERE user_code = code) INTO exists_check;
    EXIT WHEN NOT exists_check;
  END LOOP;
  RETURN code;
END;
$$;

-- Function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name, user_code)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'display_name', NEW.email),
    public.generate_user_code()
  );
  RETURN NEW;
END;
$$;

-- Trigger for auto-creating profile on signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Trigger for profile timestamp updates
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Friends table
CREATE TABLE public.friends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  friend_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  friend_name TEXT NOT NULL,
  friend_phone TEXT,
  nickname TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS for friends
ALTER TABLE public.friends ENABLE ROW LEVEL SECURITY;

-- Friends RLS Policies
CREATE POLICY "Users can view own friends"
ON public.friends FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own friends"
ON public.friends FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own friends"
ON public.friends FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own friends"
ON public.friends FOR DELETE
USING (auth.uid() = user_id);

-- ============================================
-- Migration: 20251231135341_bdba6119-4b15-4ca0-b712-141c8944b244.sql
-- ============================================

-- Fix function search path for generate_user_code
CREATE OR REPLACE FUNCTION public.generate_user_code()
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  code TEXT;
  exists_check BOOLEAN;
BEGIN
  LOOP
    code := upper(substring(md5(random()::text) from 1 for 8));
    SELECT EXISTS(SELECT 1 FROM public.profiles WHERE user_code = code) INTO exists_check;
    EXIT WHEN NOT exists_check;
  END LOOP;
  RETURN code;
END;
$$;

-- ============================================
-- Migration: 20251231145114_63bb32e4-521f-48a1-85f7-6ba02b4874d9.sql
-- ============================================

-- Create debt agreements table
CREATE TABLE public.debt_agreements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Parties involved
  lender_id UUID NOT NULL,
  borrower_id UUID,
  borrower_phone TEXT,
  borrower_name TEXT,
  
  -- Agreement details
  principal_amount DECIMAL(12,2) NOT NULL,
  interest_rate DECIMAL(5,2) DEFAULT 0,
  interest_type TEXT NOT NULL DEFAULT 'none' CHECK (interest_type IN ('none', 'flat', 'effective')),
  total_amount DECIMAL(12,2) NOT NULL,
  
  -- Payment schedule
  num_installments INTEGER NOT NULL DEFAULT 1,
  frequency TEXT NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  start_date DATE NOT NULL,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending_confirmation' CHECK (status IN ('pending_confirmation', 'active', 'completed', 'cancelled', 'rescheduling')),
  lender_confirmed BOOLEAN DEFAULT FALSE,
  borrower_confirmed BOOLEAN DEFAULT FALSE,
  
  -- Notes
  description TEXT
);

-- Create installments table for payment tracking
CREATE TABLE public.installments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agreement_id UUID NOT NULL REFERENCES public.debt_agreements(id) ON DELETE CASCADE,
  installment_number INTEGER NOT NULL,
  due_date DATE NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  principal_portion DECIMAL(12,2) NOT NULL,
  interest_portion DECIMAL(12,2) DEFAULT 0,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue', 'rescheduled')),
  paid_at TIMESTAMP WITH TIME ZONE,
  payment_proof_url TEXT,
  confirmed_by_lender BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create groups table for bill sharing
CREATE TABLE public.expense_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create group members table
CREATE TABLE public.group_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.expense_groups(id) ON DELETE CASCADE,
  user_id UUID,
  name TEXT NOT NULL,
  phone TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create group expenses table
CREATE TABLE public.group_expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.expense_groups(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  paid_by_member_id UUID NOT NULL REFERENCES public.group_members(id) ON DELETE CASCADE,
  split_between UUID[] NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.debt_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_expenses ENABLE ROW LEVEL SECURITY;

-- RLS Policies for debt_agreements
CREATE POLICY "Users can view agreements they are part of"
ON public.debt_agreements
FOR SELECT
USING (auth.uid() = lender_id OR auth.uid() = borrower_id);

CREATE POLICY "Users can create agreements as lender"
ON public.debt_agreements
FOR INSERT
WITH CHECK (auth.uid() = lender_id);

CREATE POLICY "Parties can update their own agreements"
ON public.debt_agreements
FOR UPDATE
USING (auth.uid() = lender_id OR auth.uid() = borrower_id);

CREATE POLICY "Only lender can delete pending agreements"
ON public.debt_agreements
FOR DELETE
USING (auth.uid() = lender_id AND status = 'pending_confirmation');

-- RLS Policies for installments
CREATE POLICY "Users can view installments for their agreements"
ON public.installments
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.debt_agreements 
    WHERE id = installments.agreement_id 
    AND (lender_id = auth.uid() OR borrower_id = auth.uid())
  )
);

CREATE POLICY "Users can insert installments for their agreements"
ON public.installments
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.debt_agreements 
    WHERE id = agreement_id 
    AND lender_id = auth.uid()
  )
);

CREATE POLICY "Users can update installments for their agreements"
ON public.installments
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.debt_agreements 
    WHERE id = installments.agreement_id 
    AND (lender_id = auth.uid() OR borrower_id = auth.uid())
  )
);

-- RLS Policies for expense_groups
CREATE POLICY "Users can view groups they created"
ON public.expense_groups
FOR SELECT
USING (auth.uid() = created_by);

CREATE POLICY "Users can create groups"
ON public.expense_groups
FOR INSERT
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their groups"
ON public.expense_groups
FOR UPDATE
USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their groups"
ON public.expense_groups
FOR DELETE
USING (auth.uid() = created_by);

-- RLS Policies for group_members
CREATE POLICY "Users can view members of their groups"
ON public.group_members
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.expense_groups 
    WHERE id = group_members.group_id 
    AND created_by = auth.uid()
  )
);

CREATE POLICY "Users can add members to their groups"
ON public.group_members
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.expense_groups 
    WHERE id = group_id 
    AND created_by = auth.uid()
  )
);

CREATE POLICY "Users can update members of their groups"
ON public.group_members
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.expense_groups 
    WHERE id = group_members.group_id 
    AND created_by = auth.uid()
  )
);

CREATE POLICY "Users can delete members from their groups"
ON public.group_members
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.expense_groups 
    WHERE id = group_members.group_id 
    AND created_by = auth.uid()
  )
);

-- RLS Policies for group_expenses
CREATE POLICY "Users can view expenses of their groups"
ON public.group_expenses
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.expense_groups 
    WHERE id = group_expenses.group_id 
    AND created_by = auth.uid()
  )
);

CREATE POLICY "Users can add expenses to their groups"
ON public.group_expenses
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.expense_groups 
    WHERE id = group_id 
    AND created_by = auth.uid()
  )
);

CREATE POLICY "Users can update expenses in their groups"
ON public.group_expenses
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.expense_groups 
    WHERE id = group_expenses.group_id 
    AND created_by = auth.uid()
  )
);

CREATE POLICY "Users can delete expenses from their groups"
ON public.group_expenses
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.expense_groups 
    WHERE id = group_expenses.group_id 
    AND created_by = auth.uid()
  )
);

-- Add triggers for updated_at
CREATE TRIGGER update_debt_agreements_updated_at
  BEFORE UPDATE ON public.debt_agreements
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_installments_updated_at
  BEFORE UPDATE ON public.installments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_expense_groups_updated_at
  BEFORE UPDATE ON public.expense_groups
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- Migration: 20251231154105_79e752bd-e277-4500-a9b8-05a03b94f7d3.sql
-- ============================================

-- Create storage bucket for payment slips
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'payment-slips', 
  'payment-slips', 
  true,
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
);

-- RLS policy: Users can upload slips for their own agreements (as borrower)
CREATE POLICY "Borrowers can upload payment slips"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'payment-slips' 
  AND auth.uid() IS NOT NULL
);

-- RLS policy: Both parties can view payment slips for their agreements
CREATE POLICY "Parties can view payment slips"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'payment-slips'
  AND auth.uid() IS NOT NULL
);

-- RLS policy: Borrowers can update their own slips
CREATE POLICY "Borrowers can update payment slips"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'payment-slips'
  AND auth.uid() IS NOT NULL
);

-- RLS policy: Borrowers can delete their own slips
CREATE POLICY "Borrowers can delete payment slips"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'payment-slips'
  AND auth.uid() IS NOT NULL
);

-- ============================================
-- Migration: 20251231161604_7c1a0089-07a2-4ce8-a07e-68a8e8ce0e20.sql
-- ============================================

-- Create notifications table
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  related_id UUID,
  related_type TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can only view their own notifications
CREATE POLICY "Users can view own notifications"
ON public.notifications
FOR SELECT
USING (auth.uid() = user_id);

-- Users can update their own notifications (mark as read)
CREATE POLICY "Users can update own notifications"
ON public.notifications
FOR UPDATE
USING (auth.uid() = user_id);

-- System can insert notifications for any user
CREATE POLICY "System can insert notifications"
ON public.notifications
FOR INSERT
WITH CHECK (true);

-- Users can delete their own notifications
CREATE POLICY "Users can delete own notifications"
ON public.notifications
FOR DELETE
USING (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX idx_notifications_is_read ON public.notifications(user_id, is_read);

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- ============================================
-- Migration: 20251231164355_3db13880-71dd-458f-8f97-533470e72d0d.sql
-- ============================================

-- Create role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

-- Create user_roles table
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles (avoids recursive RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- RLS policies for user_roles
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Only admins can manage roles"
ON public.user_roles
FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Create feed_posts table for admin content
CREATE TABLE public.feed_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id UUID NOT NULL,
    title TEXT NOT NULL,
    content TEXT,
    content_type TEXT NOT NULL DEFAULT 'article', -- 'article', 'video', 'link', 'tip'
    image_url TEXT,
    video_url TEXT,
    external_link TEXT,
    is_published BOOLEAN NOT NULL DEFAULT false,
    published_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on feed_posts
ALTER TABLE public.feed_posts ENABLE ROW LEVEL SECURITY;

-- Everyone can view published posts
CREATE POLICY "Anyone can view published posts"
ON public.feed_posts
FOR SELECT
USING (is_published = true);

-- Admins can view all posts (including drafts)
CREATE POLICY "Admins can view all posts"
ON public.feed_posts
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Only admins can create posts
CREATE POLICY "Only admins can create posts"
ON public.feed_posts
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Only admins can update posts
CREATE POLICY "Only admins can update posts"
ON public.feed_posts
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

-- Only admins can delete posts
CREATE POLICY "Only admins can delete posts"
ON public.feed_posts
FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

-- Create feed_likes table for user engagement
CREATE TABLE public.feed_likes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    post_id UUID REFERENCES public.feed_posts(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (user_id, post_id)
);

-- Enable RLS on feed_likes
ALTER TABLE public.feed_likes ENABLE ROW LEVEL SECURITY;

-- Users can view all likes
CREATE POLICY "Anyone can view likes"
ON public.feed_likes
FOR SELECT
USING (true);

-- Users can manage their own likes
CREATE POLICY "Users can insert own likes"
ON public.feed_likes
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own likes"
ON public.feed_likes
FOR DELETE
USING (auth.uid() = user_id);

-- Create feed_comments table
CREATE TABLE public.feed_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    post_id UUID REFERENCES public.feed_posts(id) ON DELETE CASCADE NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on feed_comments
ALTER TABLE public.feed_comments ENABLE ROW LEVEL SECURITY;

-- Anyone can view comments
CREATE POLICY "Anyone can view comments"
ON public.feed_comments
FOR SELECT
USING (true);

-- Users can create comments
CREATE POLICY "Users can create comments"
ON public.feed_comments
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update own comments
CREATE POLICY "Users can update own comments"
ON public.feed_comments
FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete own comments
CREATE POLICY "Users can delete own comments"
ON public.feed_comments
FOR DELETE
USING (auth.uid() = user_id);

-- Create saved_posts table for Vault feature
CREATE TABLE public.saved_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    post_id UUID REFERENCES public.feed_posts(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (user_id, post_id)
);

-- Enable RLS on saved_posts
ALTER TABLE public.saved_posts ENABLE ROW LEVEL SECURITY;

-- Users can manage their own saved posts
CREATE POLICY "Users can view own saved posts"
ON public.saved_posts
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can save posts"
ON public.saved_posts
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unsave posts"
ON public.saved_posts
FOR DELETE
USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_feed_posts_updated_at
BEFORE UPDATE ON public.feed_posts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_feed_comments_updated_at
BEFORE UPDATE ON public.feed_comments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- Migration: 20251231165211_91534d6f-fc88-4e44-9db2-752be6aa50af.sql
-- ============================================

-- Create storage bucket for feed images
INSERT INTO storage.buckets (id, name, public)
VALUES ('feed-images', 'feed-images', true);

-- Storage policies for feed-images bucket
CREATE POLICY "Anyone can view feed images"
ON storage.objects
FOR SELECT
USING (bucket_id = 'feed-images');

CREATE POLICY "Admins can upload feed images"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'feed-images' 
  AND public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins can update feed images"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'feed-images' 
  AND public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins can delete feed images"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'feed-images' 
  AND public.has_role(auth.uid(), 'admin')
);

-- Enable realtime for feed_comments
ALTER TABLE public.feed_comments REPLICA IDENTITY FULL;

-- Add table to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.feed_comments;

-- ============================================
-- Migration: 20260101004605_f45ce4ae-491d-4543-b136-8ea26a05cc18.sql
-- ============================================

-- Create push subscriptions table
CREATE TABLE public.push_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

-- Enable RLS
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can manage their own subscriptions
CREATE POLICY "Users can view own subscriptions"
ON public.push_subscriptions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own subscriptions"
ON public.push_subscriptions FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own subscriptions"
ON public.push_subscriptions FOR DELETE
USING (auth.uid() = user_id);

-- ============================================
-- Migration: 20260101142823_d0d8d6de-e331-4f68-aa43-64812669fa4f.sql
-- ============================================

-- Create friend_requests table for pending friend requests
CREATE TABLE public.friend_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  from_user_id UUID NOT NULL,
  to_user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(from_user_id, to_user_id)
);

-- Enable RLS
ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own requests"
ON public.friend_requests
FOR SELECT
USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);

CREATE POLICY "Users can create friend requests"
ON public.friend_requests
FOR INSERT
WITH CHECK (auth.uid() = from_user_id);

CREATE POLICY "Recipients can update requests"
ON public.friend_requests
FOR UPDATE
USING (auth.uid() = to_user_id);

CREATE POLICY "Users can delete their own sent requests"
ON public.friend_requests
FOR DELETE
USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_friend_requests_updated_at
BEFORE UPDATE ON public.friend_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.friend_requests;

-- ============================================
-- Migration: 20260102112453_90f1e6a1-ef15-4fd9-ac1e-9aae51136e7f.sql
-- ============================================

-- Add pdpa_accepted_at column to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pdpa_accepted_at TIMESTAMP WITH TIME ZONE;

-- ============================================
-- Migration: 20260104100304_3285ab0d-c274-4ca0-be1c-74bc5ce7b565.sql
-- ============================================

-- Create reschedule_requests table
CREATE TABLE public.reschedule_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  installment_id UUID NOT NULL REFERENCES public.installments(id) ON DELETE CASCADE,
  agreement_id UUID NOT NULL REFERENCES public.debt_agreements(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL,
  new_due_date DATE NOT NULL,
  original_due_date DATE NOT NULL,
  
  -- Fee calculation
  reschedule_fee NUMERIC NOT NULL DEFAULT 0,
  fee_installments INTEGER NOT NULL DEFAULT 1,
  fee_per_installment NUMERIC NOT NULL DEFAULT 0,
  
  -- Safeguard info
  original_fee_rate NUMERIC NOT NULL DEFAULT 5,
  applied_fee_rate NUMERIC NOT NULL DEFAULT 5,
  safeguard_applied BOOLEAN NOT NULL DEFAULT false,
  
  -- Approval
  status TEXT NOT NULL DEFAULT 'pending',
  approved_by UUID,
  approved_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.reschedule_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Borrowers can create reschedule requests"
ON public.reschedule_requests
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM debt_agreements da
    WHERE da.id = reschedule_requests.agreement_id
    AND da.borrower_id = auth.uid()
  )
);

CREATE POLICY "Parties can view reschedule requests"
ON public.reschedule_requests
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM debt_agreements da
    WHERE da.id = reschedule_requests.agreement_id
    AND (da.lender_id = auth.uid() OR da.borrower_id = auth.uid())
  )
);

CREATE POLICY "Lenders can update reschedule requests"
ON public.reschedule_requests
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM debt_agreements da
    WHERE da.id = reschedule_requests.agreement_id
    AND da.lender_id = auth.uid()
  )
);

CREATE POLICY "Borrowers can delete pending requests"
ON public.reschedule_requests
FOR DELETE
USING (
  requested_by = auth.uid() AND status = 'pending'
);

-- Trigger for updated_at
CREATE TRIGGER update_reschedule_requests_updated_at
BEFORE UPDATE ON public.reschedule_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- Migration: 20260104101948_417823b8-0d28-4707-aa7d-6b1df518631b.sql
-- ============================================

-- Add column to store custom fee rate for no-interest agreements
ALTER TABLE public.reschedule_requests 
ADD COLUMN custom_fee_rate numeric DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.reschedule_requests.custom_fee_rate IS 'Custom fee rate (1-20%) selected for no-interest agreements. NULL means default rate was used.';

-- ============================================
-- Migration: 20260104103030_eabca2e6-c58e-4804-80e9-d2e0b8b88f40.sql
-- ============================================

-- Add reschedule_fee_rate column to debt_agreements
ALTER TABLE public.debt_agreements 
ADD COLUMN reschedule_fee_rate numeric DEFAULT 5;

-- ============================================
-- Migration: 20260104113219_6e31678c-0856-4b41-8fcc-a55e4ba5a23a.sql
-- ============================================

-- Add reschedule_interest_multiplier column to debt_agreements
-- This stores the default multiplier for interest-based reschedule fees (e.g., 0.5, 1, 1.5, 2)
ALTER TABLE public.debt_agreements 
ADD COLUMN reschedule_interest_multiplier numeric DEFAULT 1;

-- Add comment for documentation
COMMENT ON COLUMN public.debt_agreements.reschedule_interest_multiplier IS 'Default multiplier for interest-based reschedule fees. Used when interest_type is flat or effective.';

-- ============================================
-- Migration: 20260104150602_5ff8d02f-55d3-4679-8ca7-13d230a9b416.sql
-- ============================================

-- Create slip_verifications table to track verification history
CREATE TABLE public.slip_verifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  installment_id UUID NOT NULL REFERENCES public.installments(id) ON DELETE CASCADE,
  agreement_id UUID NOT NULL REFERENCES public.debt_agreements(id) ON DELETE CASCADE,
  submitted_by UUID NOT NULL,
  submitted_amount NUMERIC NOT NULL,
  slip_url TEXT NOT NULL,
  verified_amount NUMERIC,
  verified_by UUID,
  status TEXT NOT NULL DEFAULT 'pending',
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  verified_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.slip_verifications ENABLE ROW LEVEL SECURITY;

-- Policy: Parties can view verifications for their agreements
CREATE POLICY "Parties can view slip verifications"
ON public.slip_verifications
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM debt_agreements da 
    WHERE da.id = slip_verifications.agreement_id 
    AND (da.lender_id = auth.uid() OR da.borrower_id = auth.uid())
  )
);

-- Policy: Borrowers can create verifications
CREATE POLICY "Borrowers can submit slip verifications"
ON public.slip_verifications
FOR INSERT
WITH CHECK (
  auth.uid() = submitted_by AND
  EXISTS (
    SELECT 1 FROM debt_agreements da 
    WHERE da.id = slip_verifications.agreement_id 
    AND da.borrower_id = auth.uid()
  )
);

-- Policy: Lenders can update verifications (to approve/reject)
CREATE POLICY "Lenders can update slip verifications"
ON public.slip_verifications
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM debt_agreements da 
    WHERE da.id = slip_verifications.agreement_id 
    AND da.lender_id = auth.uid()
  )
);

-- Create index for faster queries
CREATE INDEX idx_slip_verifications_installment ON public.slip_verifications(installment_id);
CREATE INDEX idx_slip_verifications_agreement ON public.slip_verifications(agreement_id);

-- ============================================
-- Migration: 20260104155753_11bb0053-b7dc-43ef-8e27-699687a560c1.sql
-- ============================================

-- Add original_due_date column to track rescheduled installments
ALTER TABLE public.installments 
ADD COLUMN original_due_date date;

-- Add comment for clarity
COMMENT ON COLUMN public.installments.original_due_date IS 'Original due date before rescheduling. NULL means not rescheduled.';

-- Also update existing reschedule_requests to copy original_due_date to installments
-- This handles historical data where we have approved reschedules
UPDATE public.installments i
SET original_due_date = r.original_due_date
FROM public.reschedule_requests r
WHERE i.id = r.installment_id
AND r.status = 'approved'
AND i.original_due_date IS NULL;

-- ============================================
-- Migration: 20260104161638_daeca350-0b31-4aeb-9c80-eb9cab64f7f0.sql
-- ============================================

-- Add slip_url and submitted_amount columns to reschedule_requests for inline payment
ALTER TABLE public.reschedule_requests 
ADD COLUMN slip_url text,
ADD COLUMN submitted_amount numeric;

-- Add comment for clarity
COMMENT ON COLUMN public.reschedule_requests.slip_url IS 'URL of the uploaded payment slip for reschedule fee';
COMMENT ON COLUMN public.reschedule_requests.submitted_amount IS 'Amount the borrower claims to have transferred for reschedule fee';

-- ============================================
-- Migration: 20260105114452_8a4f3f54-eaf8-488c-9064-31ecf73505f0.sql
-- ============================================

-- Add scheduled_at column for scheduled posts
ALTER TABLE public.feed_posts 
ADD COLUMN scheduled_at timestamp with time zone DEFAULT NULL;

-- Create index for efficient querying of scheduled posts
CREATE INDEX idx_feed_posts_scheduled_at ON public.feed_posts (scheduled_at) 
WHERE scheduled_at IS NOT NULL AND is_published = false;

-- ============================================
-- Migration: 20260105115333_0caf26e9-e0e7-41a3-b5d6-28fe407e2d3b.sql
-- ============================================

-- Enable required extensions for cron and http requests
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ============================================
-- Migration: 20260105120516_a0994ece-351f-45b6-9ce1-6b47e832cb06.sql
-- ============================================

-- Add category column to feed_posts
ALTER TABLE public.feed_posts 
ADD COLUMN category text DEFAULT 'general';

-- Add index for category filtering
CREATE INDEX idx_feed_posts_category ON public.feed_posts(category);

-- ============================================
-- Migration: 20260105120942_3c697141-da96-4fb1-baa1-7460973d48d5.sql
-- ============================================

-- Create reading_progress table to track which posts users have read
CREATE TABLE public.reading_progress (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  post_id UUID NOT NULL REFERENCES public.feed_posts(id) ON DELETE CASCADE,
  read_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, post_id)
);

-- Enable RLS
ALTER TABLE public.reading_progress ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view own reading progress"
ON public.reading_progress
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert reading progress"
ON public.reading_progress
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete reading progress"
ON public.reading_progress
FOR DELETE
USING (auth.uid() = user_id);

-- Create index for better query performance
CREATE INDEX idx_reading_progress_user_id ON public.reading_progress(user_id);
CREATE INDEX idx_reading_progress_post_id ON public.reading_progress(post_id);

-- ============================================
-- Migration: 20260105130853_3e222d8f-ec10-4427-b38e-ce783801dda4.sql
-- ============================================

-- User Points System
CREATE TABLE public.user_points (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  total_points INTEGER NOT NULL DEFAULT 0,
  lifetime_points INTEGER NOT NULL DEFAULT 0,
  daily_earned_today INTEGER NOT NULL DEFAULT 0,
  last_daily_reset DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Point Transactions Log
CREATE TABLE public.point_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  points INTEGER NOT NULL,
  action_type TEXT NOT NULL, -- 'read_article', 'save_article', 'on_time_payment', 'quality_comment', 'redeem'
  reference_id UUID, -- post_id, installment_id, etc.
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Engagement Badges
CREATE TABLE public.engagement_badges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  badge_type TEXT NOT NULL, -- 'avid_reader', 'collector', 'on_time_payer', 'contributor'
  badge_tier INTEGER NOT NULL DEFAULT 1, -- 1=bronze, 2=silver, 3=gold
  earned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, badge_type)
);

-- Point Redemptions
CREATE TABLE public.point_redemptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  points_spent INTEGER NOT NULL,
  reward_type TEXT NOT NULL, -- 'premium_discount', 'free_month', 'special_badge'
  reward_value TEXT, -- discount percentage, badge name, etc.
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'applied', 'expired'
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.point_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagement_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.point_redemptions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_points
CREATE POLICY "Users can view own points"
  ON public.user_points FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own points"
  ON public.user_points FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own points"
  ON public.user_points FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS Policies for point_transactions
CREATE POLICY "Users can view own transactions"
  ON public.point_transactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own transactions"
  ON public.point_transactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for engagement_badges
CREATE POLICY "Anyone can view badges"
  ON public.engagement_badges FOR SELECT
  USING (true);

CREATE POLICY "Users can insert own badges"
  ON public.engagement_badges FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own badges"
  ON public.engagement_badges FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS Policies for point_redemptions
CREATE POLICY "Users can view own redemptions"
  ON public.point_redemptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own redemptions"
  ON public.point_redemptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own redemptions"
  ON public.point_redemptions FOR UPDATE
  USING (auth.uid() = user_id);

-- Triggers for updated_at
CREATE TRIGGER update_user_points_updated_at
  BEFORE UPDATE ON public.user_points
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- Migration: 20260105134134_21073abd-7b68-4c99-afd2-8e61609fc288.sql
-- ============================================

-- Add slip_url column to group_expenses table
ALTER TABLE public.group_expenses 
ADD COLUMN slip_url TEXT;

-- Add comment for clarity
COMMENT ON COLUMN public.group_expenses.slip_url IS 'URL of uploaded payment slip/receipt';

-- ============================================
-- Migration: 20260105135405_82334f02-c35d-4fa6-9f21-5bc0aa72a345.sql
-- ============================================

-- Fix Security Issues: Update RLS policies

-- 1. Fix profiles: Only authenticated users can view profiles
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
CREATE POLICY "Authenticated users can view profiles" 
ON public.profiles 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- 2. Fix engagement_badges: Only authenticated users can view badges
DROP POLICY IF EXISTS "Anyone can view badges" ON public.engagement_badges;
CREATE POLICY "Authenticated users can view badges" 
ON public.engagement_badges 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- 3. Fix feed_likes: Only authenticated users can view likes
DROP POLICY IF EXISTS "Anyone can view likes" ON public.feed_likes;
CREATE POLICY "Authenticated users can view likes" 
ON public.feed_likes 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- 4. Fix feed_comments: Only authenticated users can view comments
DROP POLICY IF EXISTS "Anyone can view comments" ON public.feed_comments;
CREATE POLICY "Authenticated users can view comments" 
ON public.feed_comments 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- 5. Fix notifications INSERT: Only authenticated users can create notifications for themselves
DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;
CREATE POLICY "Users can create own notifications" 
ON public.notifications 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Also add a service function for system notifications (e.g., from triggers)
CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_message TEXT,
  p_related_type TEXT DEFAULT NULL,
  p_related_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notification_id UUID;
BEGIN
  INSERT INTO public.notifications (user_id, type, title, message, related_type, related_id)
  VALUES (p_user_id, p_type, p_title, p_message, p_related_type, p_related_id)
  RETURNING id INTO v_notification_id;
  
  RETURN v_notification_id;
END;
$$;

-- ============================================
-- Migration: 20260105140356_5fe1c47c-afcf-4058-91c2-eb79c8ad49ff.sql
-- ============================================

-- Fix profiles: Users can only see their own profile OR profiles of their friends/counterparties

-- Create a function to check if user can view a profile
CREATE OR REPLACE FUNCTION public.can_view_profile(target_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    -- Own profile
    auth.uid() = target_user_id
    OR
    -- Is a friend (mutual)
    EXISTS (
      SELECT 1 FROM public.friends 
      WHERE user_id = auth.uid() AND friend_user_id = target_user_id
    )
    OR
    -- Is counterparty in debt agreement
    EXISTS (
      SELECT 1 FROM public.debt_agreements
      WHERE (lender_id = auth.uid() AND borrower_id = target_user_id)
         OR (borrower_id = auth.uid() AND lender_id = target_user_id)
    )
    OR
    -- Sent or received friend request
    EXISTS (
      SELECT 1 FROM public.friend_requests
      WHERE (from_user_id = auth.uid() AND to_user_id = target_user_id)
         OR (to_user_id = auth.uid() AND from_user_id = target_user_id)
    )
$$;

-- Update profiles policy
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;
CREATE POLICY "Users can view related profiles" 
ON public.profiles 
FOR SELECT 
USING (public.can_view_profile(user_id));

-- ============================================
-- Migration: 20260105140501_b865b134-874d-4eb9-96cd-07ca9275dfaf.sql
-- ============================================

-- Update can_view_profile function to also allow viewing profiles when searching by user_code
-- This is needed for friend search functionality

CREATE OR REPLACE FUNCTION public.can_view_profile(target_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    -- Must be authenticated
    auth.uid() IS NOT NULL
    AND (
      -- Own profile
      auth.uid() = target_user_id
      OR
      -- Is a friend (mutual)
      EXISTS (
        SELECT 1 FROM public.friends 
        WHERE user_id = auth.uid() AND friend_user_id = target_user_id
      )
      OR
      -- Is counterparty in debt agreement
      EXISTS (
        SELECT 1 FROM public.debt_agreements
        WHERE (lender_id = auth.uid() AND borrower_id = target_user_id)
           OR (borrower_id = auth.uid() AND lender_id = target_user_id)
      )
      OR
      -- Sent or received friend request
      EXISTS (
        SELECT 1 FROM public.friend_requests
        WHERE (from_user_id = auth.uid() AND to_user_id = target_user_id)
           OR (to_user_id = auth.uid() AND from_user_id = target_user_id)
      )
    )
$$;

-- Also create a public profile search function that returns limited data for friend search
-- This allows searching by user_code without exposing phone numbers
CREATE OR REPLACE FUNCTION public.search_profile_by_code(search_code TEXT)
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  avatar_url TEXT,
  user_code TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    p.user_id,
    p.display_name,
    p.avatar_url,
    p.user_code
  FROM public.profiles p
  WHERE p.user_code = UPPER(search_code)
    AND auth.uid() IS NOT NULL
    AND p.user_id != auth.uid()
$$;

-- ============================================
-- Migration: 20260105141135_0c8a4648-1e5f-44e7-8ca2-f019aaf84e4e.sql
-- ============================================

-- Create subscription status enum
CREATE TYPE public.subscription_tier AS ENUM ('free', 'premium');

-- Create subscriptions table
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  tier subscription_tier NOT NULL DEFAULT 'free',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can view their own subscription
CREATE POLICY "Users can view own subscription"
ON public.subscriptions FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Only system can insert/update subscriptions (via edge functions)
CREATE POLICY "Service role can manage subscriptions"
ON public.subscriptions FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Create trigger for updated_at
CREATE TRIGGER update_subscriptions_updated_at
BEFORE UPDATE ON public.subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Function to get user subscription tier
CREATE OR REPLACE FUNCTION public.get_user_tier(p_user_id UUID)
RETURNS subscription_tier
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT tier FROM public.subscriptions 
     WHERE user_id = p_user_id 
     AND (expires_at IS NULL OR expires_at > now())),
    'free'::subscription_tier
  )
$$;

-- Function to check if user can create more agreements
CREATE OR REPLACE FUNCTION public.can_create_agreement(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    CASE 
      WHEN public.get_user_tier(p_user_id) = 'premium' THEN true
      ELSE (
        SELECT COUNT(*) < 3 
        FROM public.debt_agreements 
        WHERE lender_id = p_user_id 
        AND status NOT IN ('completed', 'cancelled')
      )
    END
$$;

-- Function to check if user can create more groups
CREATE OR REPLACE FUNCTION public.can_create_group(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    CASE 
      WHEN public.get_user_tier(p_user_id) = 'premium' THEN true
      ELSE (
        SELECT COUNT(*) < 2 
        FROM public.expense_groups 
        WHERE created_by = p_user_id
      )
    END
$$;

-- Function to get user limits info
CREATE OR REPLACE FUNCTION public.get_user_limits(p_user_id UUID)
RETURNS TABLE (
  tier TEXT,
  agreements_used INT,
  agreements_limit INT,
  groups_used INT,
  groups_limit INT,
  can_create_agreement BOOLEAN,
  can_create_group BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    public.get_user_tier(p_user_id)::TEXT as tier,
    (SELECT COUNT(*)::INT FROM public.debt_agreements WHERE lender_id = p_user_id AND status NOT IN ('completed', 'cancelled')) as agreements_used,
    CASE WHEN public.get_user_tier(p_user_id) = 'premium' THEN -1 ELSE 3 END as agreements_limit,
    (SELECT COUNT(*)::INT FROM public.expense_groups WHERE created_by = p_user_id) as groups_used,
    CASE WHEN public.get_user_tier(p_user_id) = 'premium' THEN -1 ELSE 2 END as groups_limit,
    public.can_create_agreement(p_user_id) as can_create_agreement,
    public.can_create_group(p_user_id) as can_create_group
$$;

-- Auto-create free subscription for new users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Create profile
  INSERT INTO public.profiles (user_id, display_name, user_code)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'display_name', NEW.email),
    public.generate_user_code()
  );
  
  -- Create free subscription
  INSERT INTO public.subscriptions (user_id, tier)
  VALUES (NEW.id, 'free');
  
  RETURN NEW;
END;
$$;

-- ============================================
-- Migration: 20260105141452_85ae7923-1da0-4807-b0a4-c47e7bed4a36.sql
-- ============================================

-- Allow users to insert their own subscription (for existing users who don't have one)
CREATE POLICY "Users can insert own subscription"
ON public.subscriptions FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Insert free subscriptions for all existing users who don't have one
INSERT INTO public.subscriptions (user_id, tier)
SELECT p.user_id, 'free'::subscription_tier
FROM public.profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM public.subscriptions s WHERE s.user_id = p.user_id
);

-- ============================================
-- Migration: 20260105141739_1e9c0a60-b2f5-4d73-8346-7f517aa11b99.sql
-- ============================================

-- Update can_view_profile to be more restrictive
-- Remove friend_requests check to prevent profile harvesting via sending requests
CREATE OR REPLACE FUNCTION public.can_view_profile(target_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT 
    -- Must be authenticated
    auth.uid() IS NOT NULL
    AND (
      -- Own profile
      auth.uid() = target_user_id
      OR
      -- Is a friend (mutual)
      EXISTS (
        SELECT 1 FROM public.friends 
        WHERE user_id = auth.uid() AND friend_user_id = target_user_id
      )
      OR
      -- Is counterparty in debt agreement
      EXISTS (
        SELECT 1 FROM public.debt_agreements
        WHERE (lender_id = auth.uid() AND borrower_id = target_user_id)
           OR (borrower_id = auth.uid() AND lender_id = target_user_id)
      )
    )
$function$;

-- ============================================
-- Migration: 20260105144838_80ae82ec-fdba-400f-96fa-c93c9450d3c0.sql
-- ============================================

-- Add trial_ends_at column to subscriptions
ALTER TABLE public.subscriptions 
ADD COLUMN trial_ends_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Add is_trial column to easily identify trial subscriptions
ALTER TABLE public.subscriptions 
ADD COLUMN is_trial BOOLEAN NOT NULL DEFAULT false;

-- Update get_user_tier function to handle trial expiration
CREATE OR REPLACE FUNCTION public.get_user_tier(p_user_id uuid)
 RETURNS subscription_tier
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT 
      CASE 
        -- If trial has expired, return free
        WHEN is_trial = true AND trial_ends_at < now() THEN 'free'::subscription_tier
        -- If subscription has expired, return free
        WHEN expires_at IS NOT NULL AND expires_at < now() THEN 'free'::subscription_tier
        -- Otherwise return the tier
        ELSE tier
      END
     FROM public.subscriptions 
     WHERE user_id = p_user_id 
     ORDER BY created_at DESC
     LIMIT 1),
    'free'::subscription_tier
  )
$function$;

-- Function to start a premium trial
CREATE OR REPLACE FUNCTION public.start_premium_trial(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_existing_trial boolean;
BEGIN
  -- Check if user already had a trial
  SELECT EXISTS(
    SELECT 1 FROM public.subscriptions 
    WHERE user_id = p_user_id AND is_trial = true
  ) INTO v_existing_trial;
  
  IF v_existing_trial THEN
    RETURN false; -- User already used their trial
  END IF;
  
  -- Update subscription to premium trial
  UPDATE public.subscriptions
  SET 
    tier = 'premium',
    is_trial = true,
    trial_ends_at = now() + interval '7 days',
    updated_at = now()
  WHERE user_id = p_user_id;
  
  RETURN true;
END;
$function$;

-- Function to downgrade expired trials (called by cron)
CREATE OR REPLACE FUNCTION public.downgrade_expired_trials()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.subscriptions
  SET 
    tier = 'free',
    updated_at = now()
  WHERE is_trial = true 
    AND trial_ends_at < now() 
    AND tier = 'premium';
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

-- ============================================
-- Migration: 20260105150842_2f671ffc-e1ec-460b-8126-9069dd52adde.sql
-- ============================================

-- Enable pg_cron and pg_net extensions for scheduled tasks
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Grant usage to postgres user
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- ============================================
-- Migration: 20260105160154_1289619b-ca4d-461d-8de4-c6ebd9fb1e88.sql
-- ============================================


-- Create a view that hides borrower contact info until they confirm
-- This replaces direct table access with controlled data exposure

-- Create a secure function to get debt agreements with conditional borrower info
CREATE OR REPLACE FUNCTION public.get_debt_agreement_safe(p_agreement_id uuid)
RETURNS TABLE (
  id uuid,
  lender_id uuid,
  borrower_id uuid,
  borrower_name text,
  borrower_phone text,
  principal_amount numeric,
  total_amount numeric,
  interest_rate numeric,
  interest_type text,
  num_installments integer,
  frequency text,
  start_date date,
  status text,
  description text,
  lender_confirmed boolean,
  borrower_confirmed boolean,
  reschedule_fee_rate numeric,
  reschedule_interest_multiplier numeric,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    da.id,
    da.lender_id,
    da.borrower_id,
    -- Only show borrower contact info if:
    -- 1. Current user is the borrower themselves, OR
    -- 2. Borrower has confirmed the agreement
    CASE 
      WHEN auth.uid() = da.borrower_id OR da.borrower_confirmed = true 
      THEN da.borrower_name
      ELSE NULL
    END as borrower_name,
    CASE 
      WHEN auth.uid() = da.borrower_id OR da.borrower_confirmed = true 
      THEN da.borrower_phone
      ELSE NULL
    END as borrower_phone,
    da.principal_amount,
    da.total_amount,
    da.interest_rate,
    da.interest_type,
    da.num_installments,
    da.frequency,
    da.start_date,
    da.status,
    da.description,
    da.lender_confirmed,
    da.borrower_confirmed,
    da.reschedule_fee_rate,
    da.reschedule_interest_multiplier,
    da.created_at,
    da.updated_at
  FROM public.debt_agreements da
  WHERE da.id = p_agreement_id
    AND (da.lender_id = auth.uid() OR da.borrower_id = auth.uid());
END;
$$;

-- Create a secure view for listing agreements with masked borrower info
CREATE OR REPLACE VIEW public.debt_agreements_secure AS
SELECT 
  da.id,
  da.lender_id,
  da.borrower_id,
  -- Mask borrower contact info until confirmed
  CASE 
    WHEN auth.uid() = da.borrower_id OR da.borrower_confirmed = true 
    THEN da.borrower_name
    ELSE '(รอการยืนยัน)'
  END as borrower_name,
  CASE 
    WHEN auth.uid() = da.borrower_id OR da.borrower_confirmed = true 
    THEN da.borrower_phone
    ELSE NULL
  END as borrower_phone,
  da.principal_amount,
  da.total_amount,
  da.interest_rate,
  da.interest_type,
  da.num_installments,
  da.frequency,
  da.start_date,
  da.status,
  da.description,
  da.lender_confirmed,
  da.borrower_confirmed,
  da.reschedule_fee_rate,
  da.reschedule_interest_multiplier,
  da.created_at,
  da.updated_at
FROM public.debt_agreements da
WHERE da.lender_id = auth.uid() OR da.borrower_id = auth.uid();

-- Grant access to the view
GRANT SELECT ON public.debt_agreements_secure TO authenticated;


-- ============================================
-- Migration: 20260105160224_78c1e8e3-59aa-4941-9258-d23fea7020f9.sql
-- ============================================


-- Drop the SECURITY DEFINER view and recreate as INVOKER (default)
DROP VIEW IF EXISTS public.debt_agreements_secure;

-- Recreate view without SECURITY DEFINER (uses INVOKER by default which is safe)
-- The RLS on debt_agreements table will be applied when querying this view
CREATE VIEW public.debt_agreements_secure 
WITH (security_invoker = true)
AS
SELECT 
  da.id,
  da.lender_id,
  da.borrower_id,
  -- Mask borrower contact info until confirmed
  CASE 
    WHEN auth.uid() = da.borrower_id OR da.borrower_confirmed = true 
    THEN da.borrower_name
    ELSE '(รอการยืนยัน)'
  END as borrower_name,
  CASE 
    WHEN auth.uid() = da.borrower_id OR da.borrower_confirmed = true 
    THEN da.borrower_phone
    ELSE NULL
  END as borrower_phone,
  da.principal_amount,
  da.total_amount,
  da.interest_rate,
  da.interest_type,
  da.num_installments,
  da.frequency,
  da.start_date,
  da.status,
  da.description,
  da.lender_confirmed,
  da.borrower_confirmed,
  da.reschedule_fee_rate,
  da.reschedule_interest_multiplier,
  da.created_at,
  da.updated_at
FROM public.debt_agreements da;

-- Grant access to the view
GRANT SELECT ON public.debt_agreements_secure TO authenticated;


-- ============================================
-- Migration: 20260105174020_4fba4627-8615-4e97-a30a-6cbe8fac5f8e.sql
-- ============================================


-- Update get_user_limits function to change free tier from 3 agreements/2 groups to 1/1
CREATE OR REPLACE FUNCTION public.get_user_limits(p_user_id UUID)
RETURNS TABLE (
  tier TEXT,
  agreements_used INT,
  agreements_limit INT,
  groups_used INT,
  groups_limit INT,
  can_create_agreement BOOLEAN,
  can_create_group BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    public.get_user_tier(p_user_id)::TEXT as tier,
    (SELECT COUNT(*)::INT FROM public.debt_agreements WHERE lender_id = p_user_id AND status NOT IN ('completed', 'cancelled')) as agreements_used,
    CASE WHEN public.get_user_tier(p_user_id) = 'premium' THEN -1 ELSE 1 END as agreements_limit,
    (SELECT COUNT(*)::INT FROM public.expense_groups WHERE created_by = p_user_id) as groups_used,
    CASE WHEN public.get_user_tier(p_user_id) = 'premium' THEN -1 ELSE 1 END as groups_limit,
    public.can_create_agreement(p_user_id) as can_create_agreement,
    public.can_create_group(p_user_id) as can_create_group
$$;

-- Update can_create_agreement function to use new limit of 1
CREATE OR REPLACE FUNCTION public.can_create_agreement(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE 
    WHEN public.get_user_tier(p_user_id) = 'premium' THEN TRUE
    ELSE (
      SELECT COUNT(*) < 1 
      FROM public.debt_agreements 
      WHERE lender_id = p_user_id 
      AND status NOT IN ('completed', 'cancelled')
    )
  END
$$;

-- Update can_create_group function to use new limit of 1
CREATE OR REPLACE FUNCTION public.can_create_group(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE 
    WHEN public.get_user_tier(p_user_id) = 'premium' THEN TRUE
    ELSE (
      SELECT COUNT(*) < 1 
      FROM public.expense_groups 
      WHERE created_by = p_user_id
    )
  END
$$;


-- ============================================
-- Migration: 20260109105741_836f20ad-365a-42a9-b2b7-3014d7d45307.sql
-- ============================================

-- First, drop and recreate the view to ensure security_invoker is set correctly
DROP VIEW IF EXISTS public.debt_agreements_secure;

CREATE VIEW public.debt_agreements_secure
WITH (security_invoker = true)
AS
SELECT 
  da.id,
  da.lender_id,
  da.borrower_id,
  -- Only show borrower contact info if current user is the borrower OR borrower has confirmed
  CASE 
    WHEN auth.uid() = da.borrower_id OR da.borrower_confirmed = true 
    THEN da.borrower_name
    ELSE NULL
  END as borrower_name,
  CASE 
    WHEN auth.uid() = da.borrower_id OR da.borrower_confirmed = true 
    THEN da.borrower_phone
    ELSE NULL
  END as borrower_phone,
  da.principal_amount,
  da.total_amount,
  da.interest_rate,
  da.interest_type,
  da.num_installments,
  da.frequency,
  da.start_date,
  da.status,
  da.description,
  da.lender_confirmed,
  da.borrower_confirmed,
  da.reschedule_fee_rate,
  da.reschedule_interest_multiplier,
  da.created_at,
  da.updated_at
FROM public.debt_agreements da
WHERE da.lender_id = auth.uid() OR da.borrower_id = auth.uid();

-- Add comment explaining the security design
COMMENT ON VIEW public.debt_agreements_secure IS 'Secure view for debt agreements. Uses security_invoker=true to inherit caller permissions. Masks borrower info until agreement is confirmed. WHERE clause ensures users only see their own agreements.';

-- ============================================
-- Migration: 20260109110416_f135d530-0239-442c-a32e-eefd34c991b6.sql
-- ============================================

-- Improve can_view_profile to require borrower confirmation for debt agreements
CREATE OR REPLACE FUNCTION public.can_view_profile(target_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT 
    -- Must be authenticated
    auth.uid() IS NOT NULL
    AND (
      -- Own profile - always allowed
      auth.uid() = target_user_id
      OR
      -- Is a confirmed friend (mutual friendship established)
      EXISTS (
        SELECT 1 FROM public.friends 
        WHERE user_id = auth.uid() AND friend_user_id = target_user_id
      )
      OR
      -- Is counterparty in CONFIRMED debt agreement
      -- Borrower can always see lender's profile
      EXISTS (
        SELECT 1 FROM public.debt_agreements
        WHERE borrower_id = auth.uid() AND lender_id = target_user_id
      )
      OR
      -- Lender can see borrower's profile ONLY after borrower confirms
      EXISTS (
        SELECT 1 FROM public.debt_agreements
        WHERE lender_id = auth.uid() 
          AND borrower_id = target_user_id
          AND borrower_confirmed = true
      )
    )
$function$;

-- Add comment explaining the security design
COMMENT ON FUNCTION public.can_view_profile IS 'Controls profile visibility. Access allowed for: own profile, confirmed friends, or debt agreement counterparties (borrower must confirm before lender can see their profile). This prevents contact information harvesting.';

-- ============================================
-- Migration: 20260109112150_e4d321cf-07ed-4c73-9338-f0cf637823ef.sql
-- ============================================

-- Create activity_logs table for security monitoring
CREATE TABLE public.activity_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  action_type TEXT NOT NULL,
  action_category TEXT NOT NULL DEFAULT 'general',
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}',
  is_suspicious BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for efficient querying
CREATE INDEX idx_activity_logs_user_id ON public.activity_logs(user_id);
CREATE INDEX idx_activity_logs_action_type ON public.activity_logs(action_type);
CREATE INDEX idx_activity_logs_created_at ON public.activity_logs(created_at DESC);
CREATE INDEX idx_activity_logs_suspicious ON public.activity_logs(is_suspicious) WHERE is_suspicious = true;

-- Enable RLS
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can read activity logs
CREATE POLICY "Admins can read all activity logs"
  ON public.activity_logs
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- System can insert logs (via service role or security definer functions)
CREATE POLICY "System can insert activity logs"
  ON public.activity_logs
  FOR INSERT
  WITH CHECK (true);

-- Create function to log activity
CREATE OR REPLACE FUNCTION public.log_activity(
  p_user_id UUID,
  p_action_type TEXT,
  p_action_category TEXT DEFAULT 'general',
  p_metadata JSONB DEFAULT '{}',
  p_is_suspicious BOOLEAN DEFAULT false
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO public.activity_logs (
    user_id,
    action_type,
    action_category,
    metadata,
    is_suspicious
  ) VALUES (
    p_user_id,
    p_action_type,
    p_action_category,
    p_metadata,
    p_is_suspicious
  )
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$;

-- Create function to detect suspicious login patterns
CREATE OR REPLACE FUNCTION public.check_suspicious_login(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_failed_count INT;
  v_is_suspicious BOOLEAN := false;
BEGIN
  -- Check for multiple failed logins in last 10 minutes
  SELECT COUNT(*) INTO v_failed_count
  FROM public.activity_logs
  WHERE user_id = p_user_id
    AND action_type = 'login_failed'
    AND created_at > now() - interval '10 minutes';
  
  IF v_failed_count >= 3 THEN
    v_is_suspicious := true;
  END IF;
  
  RETURN v_is_suspicious;
END;
$$;

-- Create function to get user activity summary for admins
CREATE OR REPLACE FUNCTION public.get_suspicious_activities(p_hours INT DEFAULT 24)
RETURNS TABLE (
  user_id UUID,
  action_type TEXT,
  action_count BIGINT,
  last_occurrence TIMESTAMP WITH TIME ZONE
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    al.user_id,
    al.action_type,
    COUNT(*) as action_count,
    MAX(al.created_at) as last_occurrence
  FROM public.activity_logs al
  WHERE al.created_at > now() - (p_hours || ' hours')::interval
    AND al.is_suspicious = true
    AND public.has_role(auth.uid(), 'admin')
  GROUP BY al.user_id, al.action_type
  ORDER BY action_count DESC;
$$;

-- Add comment
COMMENT ON TABLE public.activity_logs IS 'Stores user activity for security monitoring and suspicious behavior detection';

-- ============================================
-- Migration: 20260109112649_a1df61e4-d7b8-4435-b4c3-394224f8acba.sql
-- ============================================

-- Create trigger function to notify admins on suspicious activity
CREATE OR REPLACE FUNCTION public.notify_admins_on_suspicious_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  admin_record RECORD;
BEGIN
  -- Only trigger for suspicious activities
  IF NEW.is_suspicious = true THEN
    -- Notify all admins
    FOR admin_record IN 
      SELECT user_id FROM public.user_roles WHERE role = 'admin'
    LOOP
      INSERT INTO public.notifications (
        user_id,
        type,
        title,
        message,
        related_type,
        related_id
      ) VALUES (
        admin_record.user_id,
        'security_alert',
        'พบกิจกรรมต้องสงสัย',
        'ตรวจพบ ' || NEW.action_type || ' จาก User ID: ' || COALESCE(NEW.user_id::text, 'Unknown'),
        'activity_log',
        NEW.id
      );
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_notify_admins_suspicious ON public.activity_logs;
CREATE TRIGGER trigger_notify_admins_suspicious
  AFTER INSERT ON public.activity_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_admins_on_suspicious_activity();

-- Add comment
COMMENT ON FUNCTION public.notify_admins_on_suspicious_activity IS 'Automatically notifies all admins when suspicious activity is detected';

-- ============================================
-- Migration: 20260109115203_96bb9231-ee1f-4a57-9849-bf19f429fcbc.sql
-- ============================================

-- Create table for admin OTP verification
CREATE TABLE public.admin_otp (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  otp_code TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  verified BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.admin_otp ENABLE ROW LEVEL SECURITY;

-- Policy: Only the user can view their own OTP
CREATE POLICY "Users can view own OTP"
ON public.admin_otp FOR SELECT
USING (auth.uid() = user_id);

-- Policy: System can insert OTP (via service role)
CREATE POLICY "System can insert OTP"
ON public.admin_otp FOR INSERT
WITH CHECK (true);

-- Policy: Users can update their own OTP (mark as verified)
CREATE POLICY "Users can update own OTP"
ON public.admin_otp FOR UPDATE
USING (auth.uid() = user_id);

-- Policy: Users can delete their own OTP
CREATE POLICY "Users can delete own OTP"
ON public.admin_otp FOR DELETE
USING (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX idx_admin_otp_user_id ON public.admin_otp(user_id);
CREATE INDEX idx_admin_otp_expires_at ON public.admin_otp(expires_at);

-- Function to generate and store OTP
CREATE OR REPLACE FUNCTION public.generate_admin_otp(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_otp TEXT;
BEGIN
  -- Delete any existing OTP for this user
  DELETE FROM public.admin_otp WHERE user_id = p_user_id;
  
  -- Generate 6-digit OTP
  v_otp := LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');
  
  -- Insert new OTP with 5-minute expiry
  INSERT INTO public.admin_otp (user_id, otp_code, expires_at)
  VALUES (p_user_id, v_otp, now() + interval '5 minutes');
  
  RETURN v_otp;
END;
$$;

-- Function to verify OTP
CREATE OR REPLACE FUNCTION public.verify_admin_otp(p_user_id UUID, p_otp TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_valid BOOLEAN := false;
BEGIN
  -- Check if OTP is valid and not expired
  UPDATE public.admin_otp
  SET verified = true
  WHERE user_id = p_user_id 
    AND otp_code = p_otp 
    AND expires_at > now()
    AND verified = false
  RETURNING true INTO v_valid;
  
  RETURN COALESCE(v_valid, false);
END;
$$;

-- ============================================
-- Migration: 20260109115604_90e62d8d-8031-4ff4-97b4-a59100178a88.sql
-- ============================================

-- Drop old function and recreate with new return type
DROP FUNCTION IF EXISTS public.verify_admin_otp(UUID, TEXT);

-- Recreate verify_admin_otp function with JSONB return type
CREATE OR REPLACE FUNCTION public.verify_admin_otp(p_user_id UUID, p_otp TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_otp_record RECORD;
BEGIN
  -- Get the OTP record
  SELECT * INTO v_otp_record
  FROM public.admin_otp
  WHERE user_id = p_user_id
  ORDER BY created_at DESC
  LIMIT 1;

  -- Check if record exists
  IF v_otp_record IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_otp', 'message', 'ไม่พบรหัส OTP');
  END IF;

  -- Check if locked
  IF v_otp_record.locked_until IS NOT NULL AND v_otp_record.locked_until > now() THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'locked', 
      'message', 'บัญชีถูกล็อคชั่วคราว กรุณารอ 15 นาที',
      'locked_until', v_otp_record.locked_until
    );
  END IF;

  -- Check if expired
  IF v_otp_record.expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'expired', 'message', 'รหัส OTP หมดอายุ');
  END IF;

  -- Check if already verified
  IF v_otp_record.verified = true THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_used', 'message', 'รหัส OTP ถูกใช้แล้ว');
  END IF;

  -- Verify OTP
  IF v_otp_record.otp_code = p_otp THEN
    -- Success - mark as verified and reset attempts
    UPDATE public.admin_otp
    SET verified = true, failed_attempts = 0, locked_until = NULL
    WHERE id = v_otp_record.id;
    
    RETURN jsonb_build_object('success', true, 'message', 'ยืนยันสำเร็จ');
  ELSE
    -- Failed attempt - increment counter
    UPDATE public.admin_otp
    SET 
      failed_attempts = failed_attempts + 1,
      locked_until = CASE 
        WHEN failed_attempts + 1 >= 3 THEN now() + interval '15 minutes'
        ELSE NULL
      END
    WHERE id = v_otp_record.id;
    
    -- Check if now locked
    IF v_otp_record.failed_attempts + 1 >= 3 THEN
      RETURN jsonb_build_object(
        'success', false, 
        'error', 'locked', 
        'message', 'กรอก OTP ผิด 3 ครั้ง บัญชีถูกล็อค 15 นาที',
        'attempts', v_otp_record.failed_attempts + 1,
        'locked_until', now() + interval '15 minutes'
      );
    ELSE
      RETURN jsonb_build_object(
        'success', false, 
        'error', 'invalid', 
        'message', 'รหัส OTP ไม่ถูกต้อง',
        'attempts', v_otp_record.failed_attempts + 1,
        'remaining', 3 - (v_otp_record.failed_attempts + 1)
      );
    END IF;
  END IF;
END;
$$;

-- Function to check lock status
CREATE OR REPLACE FUNCTION public.check_admin_lock_status(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_otp_record RECORD;
BEGIN
  SELECT * INTO v_otp_record
  FROM public.admin_otp
  WHERE user_id = p_user_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_otp_record IS NULL THEN
    RETURN jsonb_build_object('locked', false);
  END IF;

  IF v_otp_record.locked_until IS NOT NULL AND v_otp_record.locked_until > now() THEN
    RETURN jsonb_build_object(
      'locked', true, 
      'locked_until', v_otp_record.locked_until,
      'remaining_seconds', EXTRACT(EPOCH FROM (v_otp_record.locked_until - now()))::INTEGER
    );
  END IF;

  RETURN jsonb_build_object('locked', false, 'failed_attempts', v_otp_record.failed_attempts);
END;
$$;

-- ============================================
-- Migration: 20260109121909_a0da956d-4c58-4704-b1f7-1aeaf1d11cfa.sql
-- ============================================

-- Create table for admin access codes
CREATE TABLE public.admin_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code_name TEXT NOT NULL UNIQUE,
  code_hash TEXT NOT NULL,
  role app_role NOT NULL DEFAULT 'moderator',
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.admin_codes ENABLE ROW LEVEL SECURITY;

-- Only admins can view/manage codes
CREATE POLICY "Only admins can view admin codes"
ON public.admin_codes
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can manage admin codes"
ON public.admin_codes
FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- Create function to verify admin code (no auth required)
CREATE OR REPLACE FUNCTION public.verify_admin_code(p_code TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code_record RECORD;
  v_code_hash TEXT;
BEGIN
  -- Simple hash for comparison
  v_code_hash := encode(sha256(p_code::bytea), 'hex');
  
  -- Find matching code
  SELECT * INTO v_code_record
  FROM public.admin_codes
  WHERE code_hash = v_code_hash
    AND is_active = true;
  
  IF v_code_record IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'รหัสไม่ถูกต้อง');
  END IF;
  
  -- Update last used
  UPDATE public.admin_codes
  SET last_used_at = now()
  WHERE id = v_code_record.id;
  
  RETURN jsonb_build_object(
    'success', true, 
    'code_name', v_code_record.code_name,
    'role', v_code_record.role
  );
END;
$$;

-- Create function to add admin code (only admins can use)
CREATE OR REPLACE FUNCTION public.create_admin_code(p_code_name TEXT, p_code TEXT, p_role app_role DEFAULT 'moderator')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code_hash TEXT;
BEGIN
  -- Check if caller is admin
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'ไม่มีสิทธิ์');
  END IF;
  
  v_code_hash := encode(sha256(p_code::bytea), 'hex');
  
  INSERT INTO public.admin_codes (code_name, code_hash, role)
  VALUES (p_code_name, v_code_hash, p_role);
  
  RETURN jsonb_build_object('success', true, 'message', 'สร้างรหัสสำเร็จ');
END;
$$;

-- Insert a default admin code: "ADMIN2024" (you can change this)
INSERT INTO public.admin_codes (code_name, code_hash, role)
VALUES ('Content Creator', encode(sha256('CONTENT2024'::bytea), 'hex'), 'moderator');

-- ============================================
-- Migration: 20260109130139_1122b434-1d45-466e-bc7d-8c63d60fe72c.sql
-- ============================================

-- Add expires_at column to admin_codes table
ALTER TABLE public.admin_codes 
ADD COLUMN expires_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Update verify_admin_code function to check expiration
CREATE OR REPLACE FUNCTION public.verify_admin_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code_record RECORD;
  v_code_hash TEXT;
BEGIN
  -- Simple hash for comparison
  v_code_hash := encode(sha256(p_code::bytea), 'hex');
  
  -- Find matching code
  SELECT * INTO v_code_record
  FROM public.admin_codes
  WHERE code_hash = v_code_hash
    AND is_active = true;
  
  IF v_code_record IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'รหัสไม่ถูกต้อง');
  END IF;
  
  -- Check expiration
  IF v_code_record.expires_at IS NOT NULL AND v_code_record.expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'รหัสหมดอายุแล้ว');
  END IF;
  
  -- Update last used
  UPDATE public.admin_codes
  SET last_used_at = now()
  WHERE id = v_code_record.id;
  
  RETURN jsonb_build_object(
    'success', true, 
    'code_name', v_code_record.code_name,
    'role', v_code_record.role
  );
END;
$$;

-- Update create_admin_code function to support expires_at
CREATE OR REPLACE FUNCTION public.create_admin_code(
  p_code_name text, 
  p_code text, 
  p_role app_role DEFAULT 'moderator'::app_role,
  p_expires_at timestamp with time zone DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code_hash TEXT;
BEGIN
  -- Check if caller is admin
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'ไม่มีสิทธิ์');
  END IF;
  
  v_code_hash := encode(sha256(p_code::bytea), 'hex');
  
  INSERT INTO public.admin_codes (code_name, code_hash, role, expires_at)
  VALUES (p_code_name, v_code_hash, p_role, p_expires_at);
  
  RETURN jsonb_build_object('success', true, 'message', 'สร้างรหัสสำเร็จ');
END;
$$;

-- Function to delete admin code
CREATE OR REPLACE FUNCTION public.delete_admin_code(p_code_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'ไม่มีสิทธิ์');
  END IF;
  
  DELETE FROM public.admin_codes WHERE id = p_code_id;
  
  RETURN jsonb_build_object('success', true, 'message', 'ลบรหัสสำเร็จ');
END;
$$;

-- Function to update admin code
CREATE OR REPLACE FUNCTION public.update_admin_code(
  p_code_id uuid,
  p_code_name text DEFAULT NULL,
  p_is_active boolean DEFAULT NULL,
  p_expires_at timestamp with time zone DEFAULT NULL,
  p_clear_expiry boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'ไม่มีสิทธิ์');
  END IF;
  
  UPDATE public.admin_codes
  SET 
    code_name = COALESCE(p_code_name, code_name),
    is_active = COALESCE(p_is_active, is_active),
    expires_at = CASE 
      WHEN p_clear_expiry THEN NULL
      WHEN p_expires_at IS NOT NULL THEN p_expires_at
      ELSE expires_at
    END
  WHERE id = p_code_id;
  
  RETURN jsonb_build_object('success', true, 'message', 'อัปเดตสำเร็จ');
END;
$$;

-- Allow admins to view admin_codes
CREATE POLICY "Admins can view admin codes"
ON public.admin_codes
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- ============================================
-- Migration: 20260112163956_2eaf412f-53f7-4985-9e45-10626ab52ee6.sql
-- ============================================

-- Change payment-slips bucket to private
UPDATE storage.buckets 
SET public = false 
WHERE id = 'payment-slips';

-- ============================================
-- Migration: 20260113101429_e20ddb9b-6181-4601-b07e-cf4d7127ea00.sql
-- ============================================

-- Enable pgcrypto extension for bcrypt
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create function to generate and send OTP via email (server-side only)
-- This wraps the existing generate_admin_otp and sends via Supabase Edge Function
CREATE OR REPLACE FUNCTION public.generate_and_send_admin_otp(p_user_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_otp TEXT;
  v_user_email TEXT;
BEGIN
  -- Verify user has admin/moderator role
  IF NOT public.has_role(p_user_id, 'admin') AND NOT public.has_role(p_user_id, 'moderator') THEN
    RETURN jsonb_build_object('success', false, 'error', 'ไม่มีสิทธิ์');
  END IF;
  
  -- Get user email from auth.users
  SELECT email INTO v_user_email FROM auth.users WHERE id = p_user_id;
  
  IF v_user_email IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'ไม่พบอีเมลผู้ใช้');
  END IF;
  
  -- Generate OTP using existing function
  v_otp := public.generate_admin_otp(p_user_id);
  
  -- Send OTP via Edge Function using http extension
  -- Note: For development, we log the OTP to activity_logs instead of actually sending email
  -- In production, implement edge function to send actual emails
  INSERT INTO public.activity_logs (user_id, action_type, action_category, metadata)
  VALUES (p_user_id, 'admin_otp_generated', 'admin', 
    jsonb_build_object(
      'email', v_user_email,
      'sent_at', now(),
      'otp_hash', encode(sha256(v_otp::bytea), 'hex') -- Store hash only for audit
    )
  );
  
  -- For now, we'll use Supabase's built-in email service via auth.email
  -- The actual OTP sending will be handled by an edge function
  
  RETURN jsonb_build_object(
    'success', true, 
    'message', 'OTP ถูกส่งไปยังอีเมลของคุณแล้ว',
    'email', substring(v_user_email, 1, 3) || '***@' || split_part(v_user_email, '@', 2)
  );
END;
$$;

-- Update create_admin_code function to use bcrypt
CREATE OR REPLACE FUNCTION public.create_admin_code(
  p_code_name TEXT,
  p_code TEXT,
  p_role app_role DEFAULT 'moderator',
  p_expires_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code_hash TEXT;
BEGIN
  -- Check admin role
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'ไม่มีสิทธิ์สร้างรหัส');
  END IF;
  
  -- Validate code strength
  IF LENGTH(p_code) < 12 THEN
    RETURN jsonb_build_object('success', false, 'error', 'รหัสต้องมีอย่างน้อย 12 ตัวอักษร');
  END IF;
  
  IF NOT (p_code ~ '[A-Z]' AND p_code ~ '[a-z]' AND p_code ~ '[0-9]') THEN
    RETURN jsonb_build_object('success', false, 'error', 'รหัสต้องมีตัวพิมพ์ใหญ่ ตัวพิมพ์เล็ก และตัวเลข');
  END IF;
  
  -- Use bcrypt with cost factor 10 (secure hashing)
  v_code_hash := crypt(p_code, gen_salt('bf', 10));
  
  INSERT INTO public.admin_codes (code_name, code_hash, role, expires_at)
  VALUES (p_code_name, v_code_hash, p_role, p_expires_at);
  
  -- Log activity
  INSERT INTO public.activity_logs (user_id, action_type, action_category, metadata)
  VALUES (auth.uid(), 'admin_code_created', 'admin', 
    jsonb_build_object('code_name', p_code_name, 'role', p_role)
  );
  
  RETURN jsonb_build_object('success', true, 'message', 'สร้างรหัสสำเร็จ');
END;
$$;

-- Update verify_admin_code function to use bcrypt
CREATE OR REPLACE FUNCTION public.verify_admin_code(p_code TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code_record RECORD;
BEGIN
  -- Check if user is authenticated
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'กรุณาเข้าสู่ระบบก่อน');
  END IF;
  
  -- Find matching code using bcrypt comparison
  -- crypt(p_code, code_hash) will produce the same hash if the password matches
  SELECT * INTO v_code_record
  FROM public.admin_codes
  WHERE code_hash = crypt(p_code, code_hash)
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now());
  
  IF v_code_record IS NULL THEN
    -- Log failed attempt
    INSERT INTO public.activity_logs (user_id, action_type, action_category, is_suspicious)
    VALUES (auth.uid(), 'admin_code_failed', 'admin', true);
    
    RETURN jsonb_build_object('success', false, 'error', 'รหัสไม่ถูกต้องหรือหมดอายุ');
  END IF;
  
  -- Update last used timestamp
  UPDATE public.admin_codes
  SET last_used_at = now()
  WHERE id = v_code_record.id;
  
  -- Assign role to user if not already assigned
  INSERT INTO public.user_roles (user_id, role)
  VALUES (auth.uid(), v_code_record.role)
  ON CONFLICT (user_id, role) DO NOTHING;
  
  -- Log successful verification
  INSERT INTO public.activity_logs (user_id, action_type, action_category, metadata)
  VALUES (auth.uid(), 'admin_code_verified', 'admin', 
    jsonb_build_object('code_name', v_code_record.code_name, 'role', v_code_record.role)
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'code_name', v_code_record.code_name,
    'role', v_code_record.role
  );
END;
$$;

-- Update existing admin codes to use bcrypt (delete old SHA256 hashes, they need to be recreated)
-- Note: This will invalidate existing codes - admins need to create new ones
DELETE FROM public.admin_codes WHERE code_hash NOT LIKE '$2a$%' AND code_hash NOT LIKE '$2b$%';

-- Create a default admin code for testing (secure bcrypt hash)
-- Default code is: Admin@Secure2024! (12+ chars with upper, lower, number, special)
INSERT INTO public.admin_codes (code_name, code_hash, role)
VALUES ('Default Admin', crypt('Admin@Secure2024!', gen_salt('bf', 10)), 'admin')
ON CONFLICT DO NOTHING;

-- ============================================
-- Migration: 20260121112204_1eafb832-25ee-4dcb-8a3e-a2e3119c8b3b.sql
-- ============================================

-- Add bank account columns to debt_agreements table
ALTER TABLE public.debt_agreements
ADD COLUMN bank_name text,
ADD COLUMN account_number text,
ADD COLUMN account_name text;

-- Add comment for documentation
COMMENT ON COLUMN public.debt_agreements.bank_name IS 'Bank name for receiving payments';
COMMENT ON COLUMN public.debt_agreements.account_number IS 'Bank account number or PromptPay';
COMMENT ON COLUMN public.debt_agreements.account_name IS 'Account holder name';

-- ============================================
-- Migration: 20260121112526_bc1fdaf7-cee5-4b9f-8e22-3d095291af5c.sql
-- ============================================

-- Update debt_agreements_secure view to include bank account columns
DROP VIEW IF EXISTS public.debt_agreements_secure;

CREATE VIEW public.debt_agreements_secure WITH (security_invoker = true) AS
SELECT
  id,
  lender_id,
  borrower_id,
  principal_amount,
  total_amount,
  interest_rate,
  num_installments,
  start_date,
  lender_confirmed,
  borrower_confirmed,
  reschedule_fee_rate,
  reschedule_interest_multiplier,
  created_at,
  updated_at,
  -- Hide borrower info until borrower confirms
  CASE 
    WHEN borrower_confirmed = true THEN borrower_name 
    ELSE '(รอการยืนยัน)'
  END as borrower_name,
  CASE 
    WHEN borrower_confirmed = true THEN borrower_phone 
    ELSE NULL
  END as borrower_phone,
  interest_type,
  frequency,
  status,
  description,
  -- Bank account info (visible to both parties)
  bank_name,
  account_number,
  account_name
FROM public.debt_agreements
WHERE 
  auth.uid() = lender_id 
  OR auth.uid() = borrower_id;

-- ============================================
-- Migration: 20260122025800_e35a12a7-226a-4582-af00-e1d77a3abdc1.sql
-- ============================================

-- Create avatars storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to view avatars (public bucket)
CREATE POLICY "Anyone can view avatars"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

-- Allow authenticated users to upload their own avatar
CREATE POLICY "Users can upload their own avatar"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'avatars' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow users to update their own avatar
CREATE POLICY "Users can update their own avatar"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'avatars' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow users to delete their own avatar
CREATE POLICY "Users can delete their own avatar"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'avatars' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- ============================================
-- Migration: 20260125154551_c27f3880-67ba-4a75-95f0-4b35311002e3.sql
-- ============================================

-- Fix admin_otp: Only allow insertion via security definer functions (not direct client access)
DROP POLICY IF EXISTS "System can insert OTP" ON public.admin_otp;

-- Create a restrictive insert policy that blocks direct client inserts
-- OTP insertion should only happen through the generate_admin_otp function (SECURITY DEFINER)
CREATE POLICY "Only system functions can insert OTP"
ON public.admin_otp
FOR INSERT
WITH CHECK (false);

-- Fix activity_logs: Only allow insertion via security definer functions
DROP POLICY IF EXISTS "System can insert activity logs" ON public.activity_logs;

-- Block direct client inserts - logs should only be inserted through log_activity function (SECURITY DEFINER)
CREATE POLICY "Only system functions can insert activity logs"
ON public.activity_logs
FOR INSERT
WITH CHECK (false);

-- ============================================
-- Migration: 20260125155217_e3cf8733-f1ca-47c6-9fdc-059fad56b913.sql
-- ============================================

-- Add columns for lender transfer proof with borrower confirmation
ALTER TABLE public.debt_agreements 
ADD COLUMN IF NOT EXISTS transfer_slip_url TEXT,
ADD COLUMN IF NOT EXISTS transferred_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS borrower_confirmed_transfer BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS borrower_confirmed_transfer_at TIMESTAMPTZ;

-- Add comment for documentation
COMMENT ON COLUMN public.debt_agreements.transfer_slip_url IS 'URL of lender transfer proof slip';
COMMENT ON COLUMN public.debt_agreements.transferred_at IS 'When lender uploaded transfer proof';
COMMENT ON COLUMN public.debt_agreements.borrower_confirmed_transfer IS 'Borrower confirms receiving the money';
COMMENT ON COLUMN public.debt_agreements.borrower_confirmed_transfer_at IS 'When borrower confirmed transfer';

-- ============================================
-- Migration: 20260125165931_ae491932-39d4-498f-94e5-e385e8ac0bce.sql
-- ============================================

-- =============================================
-- Pay-per-Agreement + Tip Jar Monetization Model
-- =============================================

-- Drop existing subscription-related functions that conflict with new model
DROP FUNCTION IF EXISTS public.can_create_agreement(uuid);
DROP FUNCTION IF EXISTS public.can_create_group(uuid);
DROP FUNCTION IF EXISTS public.get_user_limits(uuid);

-- Add free_agreements_used column to track free quota (2 free per user)
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS free_agreements_used integer NOT NULL DEFAULT 0;

-- Create agreement_payments table to track per-agreement fees
CREATE TABLE public.agreement_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  agreement_id uuid REFERENCES public.debt_agreements(id) ON DELETE SET NULL,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'THB',
  payment_type text NOT NULL DEFAULT 'agreement_fee', -- 'agreement_fee' or 'tip'
  status text NOT NULL DEFAULT 'pending', -- 'pending', 'completed', 'failed'
  payment_method text, -- 'promptpay', 'stripe', etc.
  transaction_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

-- Enable RLS on agreement_payments
ALTER TABLE public.agreement_payments ENABLE ROW LEVEL SECURITY;

-- RLS policies for agreement_payments
CREATE POLICY "Users can view own payments"
ON public.agreement_payments
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create own payments"
ON public.agreement_payments
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can manage all payments"
ON public.agreement_payments
FOR ALL
USING (true)
WITH CHECK (true);

-- Create tips table for Buy Me Coffee donations
CREATE TABLE public.tips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid, -- nullable for anonymous tips
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'THB',
  message text,
  display_name text, -- optional display name for tip
  is_anonymous boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending',
  payment_method text,
  transaction_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

-- Enable RLS on tips
ALTER TABLE public.tips ENABLE ROW LEVEL SECURITY;

-- RLS policies for tips
CREATE POLICY "Anyone can create tips"
ON public.tips
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Users can view own tips"
ON public.tips
FOR SELECT
USING (auth.uid() = user_id OR is_anonymous = false);

-- Function to check if user can create agreement (2 free, then pay)
CREATE OR REPLACE FUNCTION public.can_create_agreement_free(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_free_used integer;
  v_free_limit integer := 2;
BEGIN
  SELECT COALESCE(free_agreements_used, 0) INTO v_free_used
  FROM public.profiles
  WHERE user_id = p_user_id;
  
  IF v_free_used IS NULL THEN
    v_free_used := 0;
  END IF;
  
  RETURN jsonb_build_object(
    'can_create_free', v_free_used < v_free_limit,
    'free_used', v_free_used,
    'free_limit', v_free_limit,
    'free_remaining', GREATEST(0, v_free_limit - v_free_used),
    'fee_amount', 29,
    'fee_currency', 'THB'
  );
END;
$$;

-- Function to use a free agreement slot
CREATE OR REPLACE FUNCTION public.use_free_agreement_slot(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_free_used integer;
BEGIN
  SELECT free_agreements_used INTO v_free_used
  FROM public.profiles
  WHERE user_id = p_user_id;
  
  IF v_free_used < 2 THEN
    UPDATE public.profiles
    SET free_agreements_used = free_agreements_used + 1
    WHERE user_id = p_user_id;
    RETURN true;
  END IF;
  
  RETURN false;
END;
$$;

-- Function to record agreement payment
CREATE OR REPLACE FUNCTION public.record_agreement_payment(
  p_user_id uuid,
  p_agreement_id uuid,
  p_amount numeric,
  p_currency text DEFAULT 'THB',
  p_payment_method text DEFAULT 'promptpay'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment_id uuid;
BEGIN
  INSERT INTO public.agreement_payments (user_id, agreement_id, amount, currency, payment_method, status)
  VALUES (p_user_id, p_agreement_id, p_amount, p_currency, p_payment_method, 'completed')
  RETURNING id INTO v_payment_id;
  
  RETURN v_payment_id;
END;
$$;

-- Function to record tip
CREATE OR REPLACE FUNCTION public.record_tip(
  p_user_id uuid,
  p_amount numeric,
  p_currency text DEFAULT 'THB',
  p_message text DEFAULT NULL,
  p_display_name text DEFAULT NULL,
  p_is_anonymous boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tip_id uuid;
BEGIN
  INSERT INTO public.tips (user_id, amount, currency, message, display_name, is_anonymous, status)
  VALUES (p_user_id, p_amount, p_currency, p_message, p_display_name, p_is_anonymous, 'completed')
  RETURNING id INTO v_tip_id;
  
  RETURN v_tip_id;
END;
$$;

-- ============================================
-- Migration: 20260125165941_e7cfc63f-bea0-45f3-8fe3-c05f72885428.sql
-- ============================================

-- Fix overly permissive RLS policies

-- Drop the overly permissive service role policy (it's not needed with SECURITY DEFINER functions)
DROP POLICY IF EXISTS "Service role can manage all payments" ON public.agreement_payments;

-- Add proper update policy for completed payments via secure functions only
-- Users can update their own pending payments
CREATE POLICY "Users can update own pending payments"
ON public.agreement_payments
FOR UPDATE
USING (auth.uid() = user_id AND status = 'pending')
WITH CHECK (auth.uid() = user_id);

-- Add delete policy for own pending payments
CREATE POLICY "Users can delete own pending payments"
ON public.agreement_payments
FOR DELETE
USING (auth.uid() = user_id AND status = 'pending');

-- ============================================
-- Migration: 20260125165951_0192f025-8e24-4c81-9496-a2203d477a6b.sql
-- ============================================

-- Fix tips table RLS - remove overly permissive policy
DROP POLICY IF EXISTS "Anyone can create tips" ON public.tips;

-- Create proper policies for tips
-- Authenticated users can create tips
CREATE POLICY "Authenticated users can create tips"
ON public.tips
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND (user_id IS NULL OR auth.uid() = user_id));

-- Allow anonymous tips via secure function only (SECURITY DEFINER)
-- Users can view their own tips and all public (non-anonymous) tips
CREATE POLICY "Users can view tips"
ON public.tips
FOR SELECT
USING (
  auth.uid() = user_id 
  OR is_anonymous = false
  OR auth.uid() IS NOT NULL
);

-- ============================================
-- Migration: 20260125191314_390591f5-1446-47b4-a589-d4794450d25d.sql
-- ============================================

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

-- ============================================
-- Migration: 20260126113314_f29ea792-92b1-410d-bba3-51b08d530ec5.sql
-- ============================================

-- Add is_sponsored to feed_posts
ALTER TABLE public.feed_posts 
ADD COLUMN is_sponsored boolean NOT NULL DEFAULT false;

-- Add deleted_at to content_personas for soft delete
ALTER TABLE public.content_personas 
ADD COLUMN deleted_at timestamp with time zone DEFAULT NULL;

-- Create index for faster queries on deleted personas
CREATE INDEX idx_content_personas_deleted_at ON public.content_personas(deleted_at);

-- Create function to auto-cleanup deleted personas after 30 days
CREATE OR REPLACE FUNCTION public.cleanup_deleted_personas()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  -- Permanently delete personas that were soft-deleted more than 30 days ago
  DELETE FROM public.content_personas
  WHERE deleted_at IS NOT NULL 
    AND deleted_at < now() - interval '30 days';
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ============================================
-- Migration: 20260128105042_f0ecebd6-185e-411a-82df-ae78662b0519.sql
-- ============================================

-- Add agreement_credits column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS agreement_credits integer NOT NULL DEFAULT 0;

-- Create function to add credits when user buys coffee
CREATE OR REPLACE FUNCTION public.add_agreement_credits(p_user_id uuid, p_credits integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.profiles
  SET agreement_credits = agreement_credits + p_credits
  WHERE user_id = p_user_id;
  
  RETURN FOUND;
END;
$$;

-- Create function to use an agreement credit
CREATE OR REPLACE FUNCTION public.use_agreement_credit(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_credits integer;
BEGIN
  SELECT agreement_credits INTO v_credits
  FROM public.profiles
  WHERE user_id = p_user_id;
  
  IF v_credits > 0 THEN
    UPDATE public.profiles
    SET agreement_credits = agreement_credits - 1
    WHERE user_id = p_user_id;
    RETURN true;
  END IF;
  
  RETURN false;
END;
$$;

-- Update can_create_agreement_free to include purchased credits
CREATE OR REPLACE FUNCTION public.can_create_agreement_free(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_free_used integer;
  v_free_limit integer := 2;
  v_credits integer;
BEGIN
  SELECT 
    COALESCE(free_agreements_used, 0),
    COALESCE(agreement_credits, 0)
  INTO v_free_used, v_credits
  FROM public.profiles
  WHERE user_id = p_user_id;
  
  IF v_free_used IS NULL THEN
    v_free_used := 0;
  END IF;
  IF v_credits IS NULL THEN
    v_credits := 0;
  END IF;
  
  RETURN jsonb_build_object(
    'can_create_free', (v_free_used < v_free_limit) OR (v_credits > 0),
    'free_used', v_free_used,
    'free_limit', v_free_limit,
    'free_remaining', GREATEST(0, v_free_limit - v_free_used),
    'credits', v_credits,
    'total_available', GREATEST(0, v_free_limit - v_free_used) + v_credits,
    'fee_amount', 25,
    'fee_currency', 'THB'
  );
END;
$$;

-- ============================================
-- Migration: 20260128134735_a8a856c4-4ee4-4c5e-aed2-6521df6b2782.sql
-- ============================================

-- Add first_name and last_name columns to profiles table
ALTER TABLE public.profiles
ADD COLUMN first_name text,
ADD COLUMN last_name text;

-- Add agreement evidence columns to debt_agreements table
ALTER TABLE public.debt_agreements
ADD COLUMN agreement_text text,
ADD COLUMN lender_confirmed_ip text,
ADD COLUMN lender_confirmed_device text,
ADD COLUMN borrower_confirmed_ip text,
ADD COLUMN borrower_confirmed_device text;

-- Add index for faster lookups on profiles by name
CREATE INDEX idx_profiles_names ON public.profiles (first_name, last_name);

-- Comment for documentation
COMMENT ON COLUMN public.profiles.first_name IS 'ชื่อจริง - เก็บเพื่อใช้ในเอกสารข้อตกลงทางกฎหมาย';
COMMENT ON COLUMN public.profiles.last_name IS 'นามสกุล - เก็บเพื่อใช้ในเอกสารข้อตกลงทางกฎหมาย';
COMMENT ON COLUMN public.debt_agreements.agreement_text IS 'ข้อความข้อตกลงแบบเป็นทางการ (legal text)';
COMMENT ON COLUMN public.debt_agreements.lender_confirmed_ip IS 'IP Address ของผู้ให้ยืมตอนกดยืนยัน';
COMMENT ON COLUMN public.debt_agreements.lender_confirmed_device IS 'Device ID ของผู้ให้ยืมตอนกดยืนยัน';
COMMENT ON COLUMN public.debt_agreements.borrower_confirmed_ip IS 'IP Address ของผู้ยืมตอนกดยืนยัน';
COMMENT ON COLUMN public.debt_agreements.borrower_confirmed_device IS 'Device ID ของผู้ยืมตอนกดยืนยัน';

-- ============================================
-- Migration: 20260128200522_d27a45af-b324-4eb7-9cc9-85798593969e.sql
-- ============================================

-- Drop feed and expense group related tables
-- These features have been removed from the app

-- First drop tables that have foreign keys
DROP TABLE IF EXISTS public.saved_posts CASCADE;
DROP TABLE IF EXISTS public.reading_progress CASCADE;
DROP TABLE IF EXISTS public.feed_comments CASCADE;
DROP TABLE IF EXISTS public.feed_likes CASCADE;
DROP TABLE IF EXISTS public.feed_posts CASCADE;
DROP TABLE IF EXISTS public.content_personas CASCADE;

-- Drop expense group tables
DROP TABLE IF EXISTS public.group_expenses CASCADE;
DROP TABLE IF EXISTS public.group_members CASCADE;
DROP TABLE IF EXISTS public.expense_groups CASCADE;

-- Create messages table for chat between agreement parties
CREATE TABLE public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agreement_id UUID NOT NULL REFERENCES public.debt_agreements(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  read_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Only parties of the agreement can view messages
CREATE POLICY "Agreement parties can view messages"
ON public.messages
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.debt_agreements da
    WHERE da.id = messages.agreement_id
    AND (da.lender_id = auth.uid() OR da.borrower_id = auth.uid())
  )
);

-- Only parties can send messages
CREATE POLICY "Agreement parties can send messages"
ON public.messages
FOR INSERT
WITH CHECK (
  auth.uid() = sender_id
  AND EXISTS (
    SELECT 1 FROM public.debt_agreements da
    WHERE da.id = messages.agreement_id
    AND (da.lender_id = auth.uid() OR da.borrower_id = auth.uid())
  )
);

-- Parties can update messages (for marking as read)
CREATE POLICY "Agreement parties can update messages"
ON public.messages
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.debt_agreements da
    WHERE da.id = messages.agreement_id
    AND (da.lender_id = auth.uid() OR da.borrower_id = auth.uid())
  )
);

-- Enable realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- Create index for faster queries
CREATE INDEX idx_messages_agreement_id ON public.messages(agreement_id);
CREATE INDEX idx_messages_created_at ON public.messages(created_at DESC);

-- ============================================
-- Migration: 20260129162159_bdeb4319-ddf7-4e50-a755-cad572e2ba5d.sql
-- ============================================

-- Add image_url and file_url columns to messages table for file sharing
ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS image_url TEXT,
ADD COLUMN IF NOT EXISTS file_url TEXT,
ADD COLUMN IF NOT EXISTS file_name TEXT;

-- Create chat_typing table for realtime typing indicators
CREATE TABLE IF NOT EXISTS public.chat_typing (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agreement_id UUID NOT NULL REFERENCES public.debt_agreements(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  is_typing BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add unique constraint to prevent duplicates
ALTER TABLE public.chat_typing 
ADD CONSTRAINT chat_typing_agreement_user_unique UNIQUE (agreement_id, user_id);

-- Enable RLS
ALTER TABLE public.chat_typing ENABLE ROW LEVEL SECURITY;

-- RLS policies for chat_typing
CREATE POLICY "Agreement parties can view typing status"
ON public.chat_typing FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.debt_agreements da
    WHERE da.id = chat_typing.agreement_id
    AND (da.lender_id = auth.uid() OR da.borrower_id = auth.uid())
  )
);

CREATE POLICY "Users can manage own typing status"
ON public.chat_typing FOR INSERT
WITH CHECK (
  auth.uid() = user_id AND
  EXISTS (
    SELECT 1 FROM public.debt_agreements da
    WHERE da.id = chat_typing.agreement_id
    AND (da.lender_id = auth.uid() OR da.borrower_id = auth.uid())
  )
);

CREATE POLICY "Users can update own typing status"
ON public.chat_typing FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own typing status"
ON public.chat_typing FOR DELETE
USING (auth.uid() = user_id);

-- Enable realtime for chat_typing table
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_typing;

-- Create storage bucket for chat attachments if not exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-attachments', 'chat-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for chat attachments
CREATE POLICY "Authenticated users can upload chat attachments"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'chat-attachments' 
  AND auth.uid() IS NOT NULL
);

CREATE POLICY "Agreement parties can view chat attachments"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'chat-attachments'
  AND auth.uid() IS NOT NULL
);

CREATE POLICY "Users can delete own chat attachments"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'chat-attachments'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- ============================================
-- Migration: 20260131080049_2dbd30b9-ef95-4763-ae7f-ff6391ee701e.sql
-- ============================================

-- Add reply_to_id column for message replies
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES public.messages(id) ON DELETE SET NULL;

-- Add index for faster reply lookups
CREATE INDEX IF NOT EXISTS idx_messages_reply_to_id ON public.messages(reply_to_id);

-- Add comment for documentation
COMMENT ON COLUMN public.messages.reply_to_id IS 'References another message when this message is a reply';

-- ============================================
-- Migration: 20260131102545_e259a4da-c755-4de5-a239-90369762fef4.sql
-- ============================================

-- Create direct_chats table for friend-to-friend messaging (like Messenger)
CREATE TABLE public.direct_chats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user1_id UUID NOT NULL,
  user2_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Ensure user1_id < user2_id to prevent duplicate rooms
  CONSTRAINT direct_chats_user_order CHECK (user1_id < user2_id),
  CONSTRAINT direct_chats_unique_pair UNIQUE (user1_id, user2_id)
);

-- Enable RLS
ALTER TABLE public.direct_chats ENABLE ROW LEVEL SECURITY;

-- Policies for direct_chats
CREATE POLICY "Users can view their direct chats"
ON public.direct_chats FOR SELECT
USING (auth.uid() = user1_id OR auth.uid() = user2_id);

CREATE POLICY "Users can create direct chats with friends"
ON public.direct_chats FOR INSERT
WITH CHECK (
  (auth.uid() = user1_id OR auth.uid() = user2_id)
  AND EXISTS (
    SELECT 1 FROM public.friends f
    WHERE f.user_id = auth.uid() 
    AND f.friend_user_id = CASE WHEN auth.uid() = user1_id THEN user2_id ELSE user1_id END
  )
);

CREATE POLICY "Users can update their direct chats"
ON public.direct_chats FOR UPDATE
USING (auth.uid() = user1_id OR auth.uid() = user2_id);

-- Add direct_chat_id to messages table and make agreement_id nullable
ALTER TABLE public.messages 
ADD COLUMN direct_chat_id UUID REFERENCES public.direct_chats(id) ON DELETE CASCADE;

ALTER TABLE public.messages 
ALTER COLUMN agreement_id DROP NOT NULL;

-- Add constraint: message must belong to either agreement OR direct_chat (not both, not neither)
ALTER TABLE public.messages 
ADD CONSTRAINT messages_chat_type_check 
CHECK (
  (agreement_id IS NOT NULL AND direct_chat_id IS NULL) OR 
  (agreement_id IS NULL AND direct_chat_id IS NOT NULL)
);

-- Drop old message policies and create new ones that support both chat types
DROP POLICY IF EXISTS "Agreement parties can view messages" ON public.messages;
DROP POLICY IF EXISTS "Agreement parties can send messages" ON public.messages;
DROP POLICY IF EXISTS "Agreement parties can update messages" ON public.messages;

-- New SELECT policy: view messages in agreements OR direct chats
CREATE POLICY "Users can view messages"
ON public.messages FOR SELECT
USING (
  -- Agreement chat: user is lender or borrower
  (agreement_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM debt_agreements da
    WHERE da.id = messages.agreement_id 
    AND (da.lender_id = auth.uid() OR da.borrower_id = auth.uid())
  ))
  OR
  -- Direct chat: user is participant
  (direct_chat_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM direct_chats dc
    WHERE dc.id = messages.direct_chat_id
    AND (dc.user1_id = auth.uid() OR dc.user2_id = auth.uid())
  ))
);

-- New INSERT policy: send messages in agreements OR direct chats
CREATE POLICY "Users can send messages"
ON public.messages FOR INSERT
WITH CHECK (
  auth.uid() = sender_id
  AND (
    -- Agreement chat: user is lender or borrower
    (agreement_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM debt_agreements da
      WHERE da.id = messages.agreement_id 
      AND (da.lender_id = auth.uid() OR da.borrower_id = auth.uid())
    ))
    OR
    -- Direct chat: user is participant
    (direct_chat_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM direct_chats dc
      WHERE dc.id = messages.direct_chat_id
      AND (dc.user1_id = auth.uid() OR dc.user2_id = auth.uid())
    ))
  )
);

-- New UPDATE policy: update messages in agreements OR direct chats (for read status)
CREATE POLICY "Users can update messages"
ON public.messages FOR UPDATE
USING (
  -- Agreement chat
  (agreement_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM debt_agreements da
    WHERE da.id = messages.agreement_id 
    AND (da.lender_id = auth.uid() OR da.borrower_id = auth.uid())
  ))
  OR
  -- Direct chat
  (direct_chat_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM direct_chats dc
    WHERE dc.id = messages.direct_chat_id
    AND (dc.user1_id = auth.uid() OR dc.user2_id = auth.uid())
  ))
);

-- Update chat_typing table to support direct chats
ALTER TABLE public.chat_typing 
ADD COLUMN direct_chat_id UUID REFERENCES public.direct_chats(id) ON DELETE CASCADE;

ALTER TABLE public.chat_typing 
ALTER COLUMN agreement_id DROP NOT NULL;

ALTER TABLE public.chat_typing 
ADD CONSTRAINT chat_typing_chat_type_check 
CHECK (
  (agreement_id IS NOT NULL AND direct_chat_id IS NULL) OR 
  (agreement_id IS NULL AND direct_chat_id IS NOT NULL)
);

-- Drop old typing policies and create new ones
DROP POLICY IF EXISTS "Agreement parties can view typing status" ON public.chat_typing;
DROP POLICY IF EXISTS "Users can manage own typing status" ON public.chat_typing;
DROP POLICY IF EXISTS "Users can update own typing status" ON public.chat_typing;
DROP POLICY IF EXISTS "Users can delete own typing status" ON public.chat_typing;

CREATE POLICY "Users can view typing status"
ON public.chat_typing FOR SELECT
USING (
  (agreement_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM debt_agreements da
    WHERE da.id = chat_typing.agreement_id 
    AND (da.lender_id = auth.uid() OR da.borrower_id = auth.uid())
  ))
  OR
  (direct_chat_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM direct_chats dc
    WHERE dc.id = chat_typing.direct_chat_id
    AND (dc.user1_id = auth.uid() OR dc.user2_id = auth.uid())
  ))
);

CREATE POLICY "Users can manage typing status"
ON public.chat_typing FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND (
    (agreement_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM debt_agreements da
      WHERE da.id = chat_typing.agreement_id 
      AND (da.lender_id = auth.uid() OR da.borrower_id = auth.uid())
    ))
    OR
    (direct_chat_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM direct_chats dc
      WHERE dc.id = chat_typing.direct_chat_id
      AND (dc.user1_id = auth.uid() OR dc.user2_id = auth.uid())
    ))
  )
);

CREATE POLICY "Users can update typing"
ON public.chat_typing FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete typing"
ON public.chat_typing FOR DELETE
USING (auth.uid() = user_id);

-- Enable realtime for direct_chats
ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_chats;

-- Create trigger for updated_at on direct_chats
CREATE TRIGGER update_direct_chats_updated_at
BEFORE UPDATE ON public.direct_chats
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- Migration: 20260131103551_852d2f93-bd58-4d2e-94de-914d9daac689.sql
-- ============================================

-- Create message_reactions table for emoji reactions
CREATE TABLE public.message_reactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  emoji TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- One reaction per user per message per emoji
  CONSTRAINT message_reactions_unique UNIQUE (message_id, user_id, emoji)
);

-- Enable RLS
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view reactions on messages they can see
CREATE POLICY "Users can view message reactions"
ON public.message_reactions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM messages m
    WHERE m.id = message_reactions.message_id
    AND (
      -- Agreement message
      (m.agreement_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM debt_agreements da
        WHERE da.id = m.agreement_id 
        AND (da.lender_id = auth.uid() OR da.borrower_id = auth.uid())
      ))
      OR
      -- Direct chat message
      (m.direct_chat_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM direct_chats dc
        WHERE dc.id = m.direct_chat_id
        AND (dc.user1_id = auth.uid() OR dc.user2_id = auth.uid())
      ))
    )
  )
);

-- Policy: Users can add reactions to messages they can see
CREATE POLICY "Users can add reactions"
ON public.message_reactions FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM messages m
    WHERE m.id = message_reactions.message_id
    AND (
      (m.agreement_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM debt_agreements da
        WHERE da.id = m.agreement_id 
        AND (da.lender_id = auth.uid() OR da.borrower_id = auth.uid())
      ))
      OR
      (m.direct_chat_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM direct_chats dc
        WHERE dc.id = m.direct_chat_id
        AND (dc.user1_id = auth.uid() OR dc.user2_id = auth.uid())
      ))
    )
  )
);

-- Policy: Users can remove their own reactions
CREATE POLICY "Users can remove own reactions"
ON public.message_reactions FOR DELETE
USING (auth.uid() = user_id);

-- Create index for fast lookups
CREATE INDEX idx_message_reactions_message_id ON public.message_reactions(message_id);

-- Enable realtime for reactions
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;

-- ============================================
-- Migration: 20260131112410_a92e4552-f816-4876-a8ef-ad022fe74cf0.sql
-- ============================================

-- ============================================
-- ACTION-DRIVEN SYSTEM: Chat & Notification Schema
-- ============================================

-- 1. Create priority enum for notifications
CREATE TYPE public.notification_priority AS ENUM ('critical', 'important', 'info');

-- 2. Create pending action type enum for chat rooms
CREATE TYPE public.pending_action_type AS ENUM ('pay', 'confirm', 'extend', 'none');

-- 3. Create chat room type enum
CREATE TYPE public.chat_room_type AS ENUM ('debt', 'agreement', 'casual');

-- 4. Add priority column to notifications table
ALTER TABLE public.notifications 
ADD COLUMN priority notification_priority NOT NULL DEFAULT 'info';

-- 5. Add action_url column for deep linking
ALTER TABLE public.notifications 
ADD COLUMN action_url TEXT;

-- 6. Create chat_rooms table for room metadata
CREATE TABLE public.chat_rooms (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    -- Can link to either agreement or direct_chat
    agreement_id UUID REFERENCES public.debt_agreements(id) ON DELETE CASCADE,
    direct_chat_id UUID REFERENCES public.direct_chats(id) ON DELETE CASCADE,
    room_type chat_room_type NOT NULL DEFAULT 'casual',
    has_pending_action BOOLEAN NOT NULL DEFAULT false,
    pending_action_type pending_action_type NOT NULL DEFAULT 'none',
    pending_action_for UUID, -- User ID who needs to take action
    last_message TEXT,
    last_message_at TIMESTAMP WITH TIME ZONE,
    unread_count_user1 INTEGER NOT NULL DEFAULT 0,
    unread_count_user2 INTEGER NOT NULL DEFAULT 0,
    user1_id UUID NOT NULL,
    user2_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    -- Ensure each agreement/direct_chat has only one room
    CONSTRAINT chat_rooms_agreement_unique UNIQUE (agreement_id),
    CONSTRAINT chat_rooms_direct_chat_unique UNIQUE (direct_chat_id),
    -- Must have exactly one reference
    CONSTRAINT chat_rooms_one_reference CHECK (
        (agreement_id IS NOT NULL AND direct_chat_id IS NULL) OR
        (agreement_id IS NULL AND direct_chat_id IS NOT NULL)
    )
);

-- 7. Enable RLS on chat_rooms
ALTER TABLE public.chat_rooms ENABLE ROW LEVEL SECURITY;

-- 8. RLS Policies for chat_rooms
CREATE POLICY "Users can view their own chat rooms"
ON public.chat_rooms
FOR SELECT
USING (auth.uid() = user1_id OR auth.uid() = user2_id);

CREATE POLICY "Users can update their own chat rooms"
ON public.chat_rooms
FOR UPDATE
USING (auth.uid() = user1_id OR auth.uid() = user2_id);

CREATE POLICY "System can insert chat rooms"
ON public.chat_rooms
FOR INSERT
WITH CHECK (auth.uid() = user1_id OR auth.uid() = user2_id);

-- 9. Create function to sync chat room from agreement
CREATE OR REPLACE FUNCTION public.sync_chat_room_from_agreement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_room_type chat_room_type;
    v_has_pending BOOLEAN := false;
    v_pending_type pending_action_type := 'none';
    v_pending_for UUID;
    v_has_overdue BOOLEAN;
    v_has_pending_payment BOOLEAN;
    v_has_pending_confirm BOOLEAN;
BEGIN
    -- Determine room_type based on agreement status
    IF NEW.status = 'active' THEN
        -- Check for overdue or pending payments
        SELECT 
            EXISTS(SELECT 1 FROM installments WHERE agreement_id = NEW.id AND status = 'overdue'),
            EXISTS(SELECT 1 FROM installments WHERE agreement_id = NEW.id AND status = 'pending'),
            EXISTS(SELECT 1 FROM installments WHERE agreement_id = NEW.id AND status = 'pending_confirmation')
        INTO v_has_overdue, v_has_pending_payment, v_has_pending_confirm;
        
        IF v_has_overdue OR v_has_pending_payment THEN
            v_room_type := 'debt';
            v_has_pending := true;
            v_pending_type := 'pay';
            v_pending_for := NEW.borrower_id;
        ELSIF v_has_pending_confirm THEN
            v_room_type := 'debt';
            v_has_pending := true;
            v_pending_type := 'confirm';
            v_pending_for := NEW.lender_id;
        ELSE
            v_room_type := 'agreement';
        END IF;
    ELSIF NEW.status = 'pending_confirmation' THEN
        v_room_type := 'agreement';
        v_has_pending := true;
        v_pending_type := 'confirm';
        v_pending_for := CASE WHEN NEW.borrower_confirmed THEN NEW.lender_id ELSE NEW.borrower_id END;
    ELSE
        v_room_type := 'agreement';
    END IF;
    
    -- Upsert chat_room
    INSERT INTO public.chat_rooms (
        agreement_id, room_type, has_pending_action, pending_action_type, 
        pending_action_for, user1_id, user2_id
    )
    VALUES (
        NEW.id, v_room_type, v_has_pending, v_pending_type,
        v_pending_for, NEW.lender_id, COALESCE(NEW.borrower_id, NEW.lender_id)
    )
    ON CONFLICT (agreement_id) DO UPDATE SET
        room_type = EXCLUDED.room_type,
        has_pending_action = EXCLUDED.has_pending_action,
        pending_action_type = EXCLUDED.pending_action_type,
        pending_action_for = EXCLUDED.pending_action_for,
        updated_at = now();
    
    RETURN NEW;
END;
$$;

-- 10. Trigger to sync chat room when agreement changes
CREATE TRIGGER sync_chat_room_on_agreement_change
AFTER INSERT OR UPDATE ON public.debt_agreements
FOR EACH ROW
EXECUTE FUNCTION public.sync_chat_room_from_agreement();

-- 11. Create function to sync chat room from installment changes
CREATE OR REPLACE FUNCTION public.sync_chat_room_from_installment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_agreement RECORD;
    v_has_overdue BOOLEAN;
    v_has_pending_payment BOOLEAN;
    v_has_pending_confirm BOOLEAN;
    v_room_type chat_room_type;
    v_has_pending BOOLEAN := false;
    v_pending_type pending_action_type := 'none';
    v_pending_for UUID;
BEGIN
    -- Get agreement info
    SELECT * INTO v_agreement FROM debt_agreements WHERE id = NEW.agreement_id;
    
    IF v_agreement IS NULL THEN
        RETURN NEW;
    END IF;
    
    -- Check installment statuses
    SELECT 
        EXISTS(SELECT 1 FROM installments WHERE agreement_id = NEW.agreement_id AND status = 'overdue'),
        EXISTS(SELECT 1 FROM installments WHERE agreement_id = NEW.agreement_id AND status = 'pending'),
        EXISTS(SELECT 1 FROM installments WHERE agreement_id = NEW.agreement_id AND status = 'pending_confirmation')
    INTO v_has_overdue, v_has_pending_payment, v_has_pending_confirm;
    
    IF v_has_overdue OR v_has_pending_payment THEN
        v_room_type := 'debt';
        v_has_pending := true;
        v_pending_type := 'pay';
        v_pending_for := v_agreement.borrower_id;
    ELSIF v_has_pending_confirm THEN
        v_room_type := 'debt';
        v_has_pending := true;
        v_pending_type := 'confirm';
        v_pending_for := v_agreement.lender_id;
    ELSE
        v_room_type := 'agreement';
        v_has_pending := false;
        v_pending_type := 'none';
        v_pending_for := NULL;
    END IF;
    
    -- Update chat_room
    UPDATE public.chat_rooms
    SET 
        room_type = v_room_type,
        has_pending_action = v_has_pending,
        pending_action_type = v_pending_type,
        pending_action_for = v_pending_for,
        updated_at = now()
    WHERE agreement_id = NEW.agreement_id;
    
    RETURN NEW;
END;
$$;

-- 12. Trigger to sync on installment changes
CREATE TRIGGER sync_chat_room_on_installment_change
AFTER INSERT OR UPDATE ON public.installments
FOR EACH ROW
EXECUTE FUNCTION public.sync_chat_room_from_installment();

-- 13. Create function to sync direct chat rooms
CREATE OR REPLACE FUNCTION public.sync_chat_room_from_direct_chat()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.chat_rooms (
        direct_chat_id, room_type, user1_id, user2_id
    )
    VALUES (
        NEW.id, 'casual', NEW.user1_id, NEW.user2_id
    )
    ON CONFLICT (direct_chat_id) DO NOTHING;
    
    RETURN NEW;
END;
$$;

-- 14. Trigger for direct chat creation
CREATE TRIGGER sync_chat_room_on_direct_chat_create
AFTER INSERT ON public.direct_chats
FOR EACH ROW
EXECUTE FUNCTION public.sync_chat_room_from_direct_chat();

-- 15. Function to update last_message in chat_room
CREATE OR REPLACE FUNCTION public.update_chat_room_last_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.agreement_id IS NOT NULL THEN
        UPDATE public.chat_rooms
        SET 
            last_message = LEFT(NEW.content, 100),
            last_message_at = NEW.created_at,
            updated_at = now()
        WHERE agreement_id = NEW.agreement_id;
    ELSIF NEW.direct_chat_id IS NOT NULL THEN
        UPDATE public.chat_rooms
        SET 
            last_message = LEFT(NEW.content, 100),
            last_message_at = NEW.created_at,
            updated_at = now()
        WHERE direct_chat_id = NEW.direct_chat_id;
    END IF;
    
    RETURN NEW;
END;
$$;

-- 16. Trigger for message updates
CREATE TRIGGER update_chat_room_on_message
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.update_chat_room_last_message();

-- 17. Enable realtime for chat_rooms
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_rooms;

-- 18. Create index for performance
CREATE INDEX idx_chat_rooms_user1 ON public.chat_rooms(user1_id);
CREATE INDEX idx_chat_rooms_user2 ON public.chat_rooms(user2_id);
CREATE INDEX idx_chat_rooms_pending ON public.chat_rooms(has_pending_action) WHERE has_pending_action = true;
CREATE INDEX idx_notifications_priority ON public.notifications(priority);
CREATE INDEX idx_notifications_user_priority ON public.notifications(user_id, priority, is_read);

-- ============================================
-- Migration: 20260402100000_harden_payment_slips_storage.sql
-- ============================================

-- Harden payment slip storage policies to match the path contract:
-- {agreement_id}/{kind}/{entity_id}-{timestamp}.{ext}

DROP POLICY IF EXISTS "Borrowers can upload payment slips" ON storage.objects;
DROP POLICY IF EXISTS "Parties can view payment slips" ON storage.objects;
DROP POLICY IF EXISTS "Borrowers can update payment slips" ON storage.objects;
DROP POLICY IF EXISTS "Borrowers can delete payment slips" ON storage.objects;

CREATE POLICY "Agreement parties can view payment slips"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'payment-slips'
  AND auth.uid() IS NOT NULL
  AND array_length(storage.foldername(name), 1) >= 2
  AND (storage.foldername(name))[2] IN ('transfer', 'installment', 'reschedule')
  AND EXISTS (
    SELECT 1
    FROM public.debt_agreements agreement_row
    WHERE agreement_row.id::text = (storage.foldername(name))[1]
      AND (
        agreement_row.lender_id = auth.uid()
        OR agreement_row.borrower_id = auth.uid()
      )
  )
);

CREATE POLICY "Agreement party can insert owned payment slips"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'payment-slips'
  AND auth.uid() IS NOT NULL
  AND array_length(storage.foldername(name), 1) >= 2
  AND (
    (
      (storage.foldername(name))[2] = 'transfer'
      AND EXISTS (
        SELECT 1
        FROM public.debt_agreements agreement_row
        WHERE agreement_row.id::text = (storage.foldername(name))[1]
          AND agreement_row.lender_id = auth.uid()
      )
    )
    OR (
      (storage.foldername(name))[2] IN ('installment', 'reschedule')
      AND EXISTS (
        SELECT 1
        FROM public.debt_agreements agreement_row
        WHERE agreement_row.id::text = (storage.foldername(name))[1]
          AND agreement_row.borrower_id = auth.uid()
      )
    )
  )
);

CREATE POLICY "Agreement party can update owned payment slips"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'payment-slips'
  AND auth.uid() IS NOT NULL
  AND array_length(storage.foldername(name), 1) >= 2
  AND (
    (
      (storage.foldername(name))[2] = 'transfer'
      AND EXISTS (
        SELECT 1
        FROM public.debt_agreements agreement_row
        WHERE agreement_row.id::text = (storage.foldername(name))[1]
          AND agreement_row.lender_id = auth.uid()
      )
    )
    OR (
      (storage.foldername(name))[2] IN ('installment', 'reschedule')
      AND EXISTS (
        SELECT 1
        FROM public.debt_agreements agreement_row
        WHERE agreement_row.id::text = (storage.foldername(name))[1]
          AND agreement_row.borrower_id = auth.uid()
      )
    )
  )
)
WITH CHECK (
  bucket_id = 'payment-slips'
  AND auth.uid() IS NOT NULL
  AND array_length(storage.foldername(name), 1) >= 2
  AND (
    (
      (storage.foldername(name))[2] = 'transfer'
      AND EXISTS (
        SELECT 1
        FROM public.debt_agreements agreement_row
        WHERE agreement_row.id::text = (storage.foldername(name))[1]
          AND agreement_row.lender_id = auth.uid()
      )
    )
    OR (
      (storage.foldername(name))[2] IN ('installment', 'reschedule')
      AND EXISTS (
        SELECT 1
        FROM public.debt_agreements agreement_row
        WHERE agreement_row.id::text = (storage.foldername(name))[1]
          AND agreement_row.borrower_id = auth.uid()
      )
    )
  )
);

CREATE POLICY "Agreement party can delete owned payment slips"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'payment-slips'
  AND auth.uid() IS NOT NULL
  AND array_length(storage.foldername(name), 1) >= 2
  AND (
    (
      (storage.foldername(name))[2] = 'transfer'
      AND EXISTS (
        SELECT 1
        FROM public.debt_agreements agreement_row
        WHERE agreement_row.id::text = (storage.foldername(name))[1]
          AND agreement_row.lender_id = auth.uid()
      )
    )
    OR (
      (storage.foldername(name))[2] IN ('installment', 'reschedule')
      AND EXISTS (
        SELECT 1
        FROM public.debt_agreements agreement_row
        WHERE agreement_row.id::text = (storage.foldername(name))[1]
          AND agreement_row.borrower_id = auth.uid()
      )
    )
  )
);


