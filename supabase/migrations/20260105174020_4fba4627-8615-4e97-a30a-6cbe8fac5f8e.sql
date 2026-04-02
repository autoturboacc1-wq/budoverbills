
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
