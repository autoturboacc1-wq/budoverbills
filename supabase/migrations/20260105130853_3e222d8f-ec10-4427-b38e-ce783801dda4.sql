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