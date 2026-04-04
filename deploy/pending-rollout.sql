

-- FILE: supabase/migrations/20260402121000_add_theme_preference_to_profiles.sql

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS theme_preference TEXT NOT NULL DEFAULT 'default'
CHECK (theme_preference IN ('default', 'ocean', 'sunset', 'forest', 'midnight'));

COMMENT ON COLUMN public.profiles.theme_preference IS
'User selected color theme: default, ocean, sunset, forest, midnight';


-- FILE: supabase/migrations/20260403183000_add_partial_unique_pending_slip_verifications.sql

-- Ensure only one pending slip verification can exist per installment at a time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_slip_verifications_one_pending_per_installment
ON public.slip_verifications (installment_id)
WHERE status = 'pending';


-- FILE: supabase/migrations/20260404120000_harden_downgrade_expired_trials.sql

-- Ensure expired trials are fully downgraded, not just re-tiered.

CREATE OR REPLACE FUNCTION public.downgrade_expired_trials()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.subscriptions
  SET
    tier = 'free',
    is_trial = false,
    trial_ends_at = NULL,
    updated_at = now()
  WHERE is_trial = true
    AND trial_ends_at < now()
    AND tier = 'premium';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;


-- FILE: supabase/migrations/20260404133000_harden_debt_agreements_update_rls.sql

DROP POLICY IF EXISTS "Parties can update their own agreements" ON public.debt_agreements;

CREATE POLICY "Lenders can update their agreement fields"
ON public.debt_agreements
FOR UPDATE
USING (auth.uid() = lender_id)
WITH CHECK (auth.uid() = lender_id);

CREATE POLICY "Borrowers can update their agreement fields"
ON public.debt_agreements
FOR UPDATE
USING (auth.uid() = borrower_id)
WITH CHECK (auth.uid() = borrower_id);

CREATE OR REPLACE FUNCTION public.enforce_debt_agreement_role_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  lender_only_changed boolean;
  borrower_only_changed boolean;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  lender_only_changed := (
    NEW.bank_name IS DISTINCT FROM OLD.bank_name OR
    NEW.account_number IS DISTINCT FROM OLD.account_number OR
    NEW.account_name IS DISTINCT FROM OLD.account_name OR
    NEW.lender_confirmed IS DISTINCT FROM OLD.lender_confirmed OR
    NEW.lender_confirmed_ip IS DISTINCT FROM OLD.lender_confirmed_ip OR
    NEW.lender_confirmed_device IS DISTINCT FROM OLD.lender_confirmed_device OR
    NEW.transfer_slip_url IS DISTINCT FROM OLD.transfer_slip_url OR
    NEW.transferred_at IS DISTINCT FROM OLD.transferred_at
  );

  borrower_only_changed := (
    NEW.borrower_confirmed IS DISTINCT FROM OLD.borrower_confirmed OR
    NEW.borrower_confirmed_ip IS DISTINCT FROM OLD.borrower_confirmed_ip OR
    NEW.borrower_confirmed_device IS DISTINCT FROM OLD.borrower_confirmed_device OR
    NEW.borrower_confirmed_transfer IS DISTINCT FROM OLD.borrower_confirmed_transfer OR
    NEW.borrower_confirmed_transfer_at IS DISTINCT FROM OLD.borrower_confirmed_transfer_at
  );

  IF v_actor = OLD.lender_id AND borrower_only_changed THEN
    RAISE EXCEPTION 'Lenders cannot modify borrower confirmation fields';
  END IF;

  IF v_actor = OLD.borrower_id AND lender_only_changed THEN
    RAISE EXCEPTION 'Borrowers cannot modify lender banking or transfer fields';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_debt_agreement_role_updates_trigger ON public.debt_agreements;

CREATE TRIGGER enforce_debt_agreement_role_updates_trigger
BEFORE UPDATE ON public.debt_agreements
FOR EACH ROW
EXECUTE FUNCTION public.enforce_debt_agreement_role_updates();


-- FILE: supabase/migrations/20260404143000_atomic_agreement_mutations.sql

-- Atomic agreement, extra payment, and reschedule mutation hardening.

CREATE OR REPLACE FUNCTION public.create_agreement_with_installments(
  p_lender_id uuid,
  p_borrower_id uuid DEFAULT NULL,
  p_borrower_phone text DEFAULT NULL,
  p_borrower_name text DEFAULT NULL,
  p_principal_amount numeric,
  p_interest_rate numeric DEFAULT 0,
  p_interest_type text DEFAULT 'none',
  p_total_amount numeric,
  p_num_installments integer,
  p_frequency text DEFAULT 'monthly',
  p_start_date date,
  p_description text DEFAULT NULL,
  p_reschedule_fee_rate numeric DEFAULT 5,
  p_reschedule_interest_multiplier numeric DEFAULT 1,
  p_bank_name text DEFAULT NULL,
  p_account_number text DEFAULT NULL,
  p_account_name text DEFAULT NULL,
  p_installments jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_agreement_id uuid;
  v_installment_count integer;
  v_expected_installment_count integer;
  v_installment_sum numeric;
BEGIN
  IF v_user_id IS NULL OR v_user_id <> p_lender_id THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_borrower_id IS NOT NULL AND p_borrower_id = p_lender_id THEN
    RAISE EXCEPTION 'Borrower cannot be the same as lender';
  END IF;

  IF p_installments IS NULL OR jsonb_typeof(p_installments) <> 'array' THEN
    RAISE EXCEPTION 'Invalid installments payload';
  END IF;

  v_installment_count := jsonb_array_length(p_installments);
  v_expected_installment_count := COALESCE(p_num_installments, 0);

  IF v_installment_count <> v_expected_installment_count THEN
    RAISE EXCEPTION 'Installment count mismatch';
  END IF;

  SELECT COALESCE(SUM((item ->> 'amount')::numeric), 0)
  INTO v_installment_sum
  FROM jsonb_array_elements(p_installments) AS item;

  IF ABS(v_installment_sum - p_total_amount) > 0.01 THEN
    RAISE EXCEPTION 'Installment total does not match agreement total';
  END IF;

  INSERT INTO public.debt_agreements (
    lender_id,
    borrower_id,
    borrower_phone,
    borrower_name,
    principal_amount,
    interest_rate,
    interest_type,
    total_amount,
    num_installments,
    frequency,
    start_date,
    description,
    reschedule_fee_rate,
    reschedule_interest_multiplier,
    bank_name,
    account_number,
    account_name,
    lender_confirmed
  )
  VALUES (
    p_lender_id,
    p_borrower_id,
    p_borrower_phone,
    p_borrower_name,
    p_principal_amount,
    p_interest_rate,
    p_interest_type,
    p_total_amount,
    p_num_installments,
    p_frequency,
    p_start_date,
    p_description,
    p_reschedule_fee_rate,
    p_reschedule_interest_multiplier,
    p_bank_name,
    p_account_number,
    p_account_name,
    true
  )
  RETURNING id INTO v_agreement_id;

  INSERT INTO public.installments (
    agreement_id,
    installment_number,
    due_date,
    amount,
    principal_portion,
    interest_portion
  )
  SELECT
    v_agreement_id,
    item.installment_number,
    item.due_date,
    item.amount,
    item.principal_portion,
    item.interest_portion
  FROM jsonb_to_recordset(p_installments) AS item(
    installment_number integer,
    due_date date,
    amount numeric,
    principal_portion numeric,
    interest_portion numeric
  );

  RETURN jsonb_build_object(
    'success', true,
    'agreement_id', v_agreement_id,
    'installments_created', v_installment_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.process_extra_payment(
  p_agreement_id uuid,
  p_extra_amount numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_agreement public.debt_agreements%ROWTYPE;
  v_remaining_payment numeric;
  v_requested_payment numeric;
  v_total_remaining_principal numeric;
  v_closed_count integer := 0;
  v_remaining_installments integer := 0;
  v_remaining_principal numeric := 0;
  v_periods_per_year integer := 12;
  v_period_rate numeric := 0;
  v_payment numeric := 0;
  v_last_installment_amount numeric := 0;
  v_installment record;
  v_current_principal numeric;
  v_current_interest numeric;
  v_current_total numeric;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT *
  INTO v_agreement
  FROM public.debt_agreements
  WHERE id = p_agreement_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agreement not found';
  END IF;

  IF v_agreement.lender_id <> v_user_id THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_extra_amount IS NULL OR p_extra_amount <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'principal_reduction', 0,
      'installments_closed', 0,
      'new_last_installment_amount', NULL
    );
  END IF;

  SELECT COALESCE(SUM(principal_portion), 0)
  INTO v_total_remaining_principal
  FROM public.installments
  WHERE agreement_id = p_agreement_id
    AND status <> 'paid'
    AND principal_portion > 0;

  v_requested_payment := LEAST(ROUND(p_extra_amount, 2), ROUND(v_total_remaining_principal, 2));
  v_remaining_payment := v_requested_payment;

  IF v_remaining_payment <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'principal_reduction', 0,
      'installments_closed', 0,
      'new_last_installment_amount', NULL
    );
  END IF;

  FOR v_installment IN
    SELECT id, installment_number, principal_portion, interest_portion, amount
    FROM public.installments
    WHERE agreement_id = p_agreement_id
      AND status <> 'paid'
      AND principal_portion > 0
    ORDER BY installment_number DESC
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining_payment <= 0;

    IF v_remaining_payment >= v_installment.principal_portion THEN
      UPDATE public.installments
      SET
        status = 'paid',
        paid_at = now(),
        confirmed_by_lender = true
      WHERE id = v_installment.id;

      v_remaining_payment := ROUND(v_remaining_payment - v_installment.principal_portion, 2);
      v_closed_count := v_closed_count + 1;
    ELSIF v_agreement.interest_type = 'flat' THEN
      v_current_principal := ROUND(GREATEST(0, v_installment.principal_portion - v_remaining_payment), 2);
      v_current_interest := COALESCE(v_installment.interest_portion, 0);
      v_current_total := ROUND(v_current_principal + v_current_interest, 2);

      UPDATE public.installments
      SET
        principal_portion = v_current_principal,
        amount = v_current_total
      WHERE id = v_installment.id;

      v_last_installment_amount := v_current_total;
      v_remaining_payment := 0;
    END IF;
  END LOOP;

  IF v_agreement.interest_type = 'effective' THEN
    SELECT COUNT(*), COALESCE(SUM(principal_portion), 0)
    INTO v_remaining_installments, v_remaining_principal
    FROM public.installments
    WHERE agreement_id = p_agreement_id
      AND status <> 'paid'
      AND principal_portion > 0;

    IF v_remaining_installments > 0 AND v_remaining_principal > 0 THEN
      v_remaining_principal := ROUND(GREATEST(0, v_total_remaining_principal - v_requested_payment), 2);

      IF v_agreement.frequency = 'daily' THEN
        v_periods_per_year := 365;
      ELSIF v_agreement.frequency = 'weekly' THEN
        v_periods_per_year := 52;
      ELSE
        v_periods_per_year := 12;
      END IF;

      v_period_rate := (COALESCE(v_agreement.interest_rate, 0) / 100) / v_periods_per_year;
      v_payment := 0;

      IF v_period_rate > 0 THEN
        v_payment := (
          v_remaining_principal * (v_period_rate * POWER(1 + v_period_rate, v_remaining_installments))
        ) / (POWER(1 + v_period_rate, v_remaining_installments) - 1);
      END IF;

      FOR v_installment IN
        SELECT id, installment_number
        FROM public.installments
        WHERE agreement_id = p_agreement_id
          AND status <> 'paid'
          AND principal_portion > 0
        ORDER BY installment_number ASC
        FOR UPDATE
      LOOP
        IF v_remaining_installments = 1 OR v_period_rate <= 0 THEN
          v_current_principal := ROUND(v_remaining_principal, 2);
          v_current_interest := 0;
        ELSE
          v_current_interest := ROUND(v_remaining_principal * v_period_rate, 2);
          v_current_principal := ROUND(GREATEST(0, v_payment - v_current_interest), 2);
        END IF;

        v_current_total := ROUND(v_current_principal + v_current_interest, 2);

        UPDATE public.installments
        SET
          principal_portion = v_current_principal,
          interest_portion = v_current_interest,
          amount = v_current_total
        WHERE id = v_installment.id;

        v_last_installment_amount := v_current_total;
        v_remaining_principal := ROUND(GREATEST(0, v_remaining_principal - v_current_principal), 2);
        v_remaining_installments := v_remaining_installments - 1;
      END LOOP;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'principal_reduction', ROUND(v_requested_payment - v_remaining_payment, 2),
    'installments_closed', v_closed_count,
    'new_last_installment_amount', v_last_installment_amount
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_reschedule_request(
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_request public.reschedule_requests%ROWTYPE;
  v_agreement public.debt_agreements%ROWTYPE;
  v_target_installment_number integer;
  v_days_diff integer;
  v_shifted_count integer := 0;
  v_installment record;
  v_due_date date;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT *
  INTO v_request
  FROM public.reschedule_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'Request is not pending';
  END IF;

  SELECT *
  INTO v_agreement
  FROM public.debt_agreements
  WHERE id = v_request.agreement_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agreement not found';
  END IF;

  IF v_agreement.lender_id <> v_user_id THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT installment_number
  INTO v_target_installment_number
  FROM public.installments
  WHERE id = v_request.installment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Installment not found';
  END IF;

  v_days_diff := v_request.new_due_date - v_request.original_due_date;

  FOR v_installment IN
    SELECT id, installment_number, due_date, status
    FROM public.installments
    WHERE agreement_id = v_request.agreement_id
      AND installment_number >= v_target_installment_number
      AND status <> 'paid'
    ORDER BY installment_number ASC
    FOR UPDATE
  LOOP
    v_due_date := v_installment.due_date + v_days_diff;
    v_shifted_count := v_shifted_count + 1;

    IF v_installment.id = v_request.installment_id THEN
      UPDATE public.installments
      SET
        due_date = v_due_date,
        status = 'pending',
        original_due_date = v_request.original_due_date
      WHERE id = v_installment.id;
    ELSE
      UPDATE public.installments
      SET due_date = v_due_date
      WHERE id = v_installment.id;
    END IF;
  END LOOP;

  UPDATE public.reschedule_requests
  SET
    status = 'approved',
    approved_by = v_user_id,
    approved_at = now()
  WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'success', true,
    'request_id', p_request_id,
    'shifted_count', v_shifted_count
  );
END;
$$;


-- FILE: supabase/migrations/20260404143000_harden_friend_points_atomicity.sql

-- =============================================
-- Friend Requests + Points Atomicity Hardening
-- =============================================

-- Prevent duplicate friend request pairs in either direction
CREATE UNIQUE INDEX IF NOT EXISTS friend_requests_unique_pair_idx
  ON public.friend_requests (LEAST(from_user_id, to_user_id), GREATEST(from_user_id, to_user_id));

-- Prevent duplicate friendship rows per direction
CREATE UNIQUE INDEX IF NOT EXISTS friends_unique_pair_idx
  ON public.friends (user_id, friend_user_id);

-- Make point transactions idempotent when a stable reference_id is supplied
ALTER TABLE public.point_transactions
  ALTER COLUMN reference_id SET DEFAULT gen_random_uuid();

UPDATE public.point_transactions
SET reference_id = gen_random_uuid()
WHERE reference_id IS NULL;

ALTER TABLE public.point_transactions
  ALTER COLUMN reference_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS point_transactions_unique_user_action_reference_idx
  ON public.point_transactions (user_id, action_type, reference_id);

CREATE OR REPLACE FUNCTION public.accept_friend_request(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.friend_requests%ROWTYPE;
  v_from_display_name text;
  v_from_user_code text;
  v_to_display_name text;
  v_to_user_code text;
  v_inserted_count integer := 0;
  v_rows_inserted integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT *
  INTO v_request
  FROM public.friend_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Friend request not found';
  END IF;

  IF v_request.to_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'Friend request is not pending';
  END IF;

  SELECT display_name, user_code
  INTO v_from_display_name, v_from_user_code
  FROM public.profiles
  WHERE user_id = v_request.from_user_id;

  SELECT display_name, user_code
  INTO v_to_display_name, v_to_user_code
  FROM public.profiles
  WHERE user_id = v_request.to_user_id;

  INSERT INTO public.friends (user_id, friend_user_id, friend_name)
  VALUES (
    v_request.to_user_id,
    v_request.from_user_id,
    COALESCE(NULLIF(v_from_display_name, ''), 'User ' || COALESCE(v_from_user_code, 'Unknown'))
  )
  ON CONFLICT (user_id, friend_user_id) DO NOTHING;
  GET DIAGNOSTICS v_rows_inserted = ROW_COUNT;
  v_inserted_count := v_inserted_count + v_rows_inserted;

  INSERT INTO public.friends (user_id, friend_user_id, friend_name)
  VALUES (
    v_request.from_user_id,
    v_request.to_user_id,
    COALESCE(NULLIF(v_to_display_name, ''), 'User ' || COALESCE(v_to_user_code, 'Unknown'))
  )
  ON CONFLICT (user_id, friend_user_id) DO NOTHING;
  GET DIAGNOSTICS v_rows_inserted = ROW_COUNT;
  v_inserted_count := v_inserted_count + v_rows_inserted;

  UPDATE public.friend_requests
  SET status = 'accepted'
  WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'success', true,
    'request_id', p_request_id,
    'friends_created', v_inserted_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.earn_points(
  p_user_id uuid,
  p_action_type text,
  p_reference_id uuid DEFAULT NULL,
  p_points integer DEFAULT 0,
  p_description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_points_row public.user_points%ROWTYPE;
  v_today date := (now() AT TIME ZONE 'Asia/Bangkok')::date;
  v_points_to_add integer;
  v_reference_id uuid := COALESCE(p_reference_id, gen_random_uuid());
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_points <= 0 THEN
    RAISE EXCEPTION 'Points must be positive';
  END IF;

  INSERT INTO public.user_points (user_id, total_points, lifetime_points, daily_earned_today, last_daily_reset)
  VALUES (p_user_id, 0, 0, 0, v_today)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT *
  INTO v_points_row
  FROM public.user_points
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unable to load points row';
  END IF;

  IF v_points_row.last_daily_reset IS DISTINCT FROM v_today THEN
    UPDATE public.user_points
    SET daily_earned_today = 0,
        last_daily_reset = v_today
    WHERE user_id = p_user_id;

    v_points_row.daily_earned_today := 0;
    v_points_row.last_daily_reset := v_today;
  END IF;

  IF p_reference_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.point_transactions
    WHERE user_id = p_user_id
      AND action_type = p_action_type
      AND reference_id = p_reference_id
  ) THEN
    RETURN jsonb_build_object(
      'success', true,
      'duplicate', true,
      'points_earned', 0,
      'reference_id', p_reference_id,
      'total_points', v_points_row.total_points,
      'lifetime_points', v_points_row.lifetime_points,
      'daily_earned_today', v_points_row.daily_earned_today
    );
  END IF;

  v_points_to_add := LEAST(p_points, GREATEST(0, 50 - v_points_row.daily_earned_today));

  IF v_points_to_add <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'duplicate', false,
      'points_earned', 0,
      'reason', 'daily_limit',
      'reference_id', v_reference_id,
      'total_points', v_points_row.total_points,
      'lifetime_points', v_points_row.lifetime_points,
      'daily_earned_today', v_points_row.daily_earned_today
    );
  END IF;

  UPDATE public.user_points
  SET total_points = total_points + v_points_to_add,
      lifetime_points = lifetime_points + v_points_to_add,
      daily_earned_today = daily_earned_today + v_points_to_add,
      last_daily_reset = v_today
  WHERE user_id = p_user_id
  RETURNING * INTO v_points_row;

  INSERT INTO public.point_transactions (
    user_id,
    points,
    action_type,
    reference_id,
    description
  ) VALUES (
    p_user_id,
    v_points_to_add,
    p_action_type,
    v_reference_id,
    p_description
  );

  RETURN jsonb_build_object(
    'success', true,
    'duplicate', false,
    'points_earned', v_points_to_add,
    'reference_id', v_reference_id,
    'total_points', v_points_row.total_points,
    'lifetime_points', v_points_row.lifetime_points,
    'daily_earned_today', v_points_row.daily_earned_today
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.redeem_points(
  p_user_id uuid,
  p_points integer,
  p_reward_type text,
  p_reward_value text,
  p_description text DEFAULT NULL,
  p_reference_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_points_row public.user_points%ROWTYPE;
  v_today date := (now() AT TIME ZONE 'Asia/Bangkok')::date;
  v_redemption_id uuid;
  v_reference_id uuid := COALESCE(p_reference_id, gen_random_uuid());
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_points <= 0 THEN
    RAISE EXCEPTION 'Points must be positive';
  END IF;

  INSERT INTO public.user_points (user_id, total_points, lifetime_points, daily_earned_today, last_daily_reset)
  VALUES (p_user_id, 0, 0, 0, v_today)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT *
  INTO v_points_row
  FROM public.user_points
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unable to load points row';
  END IF;

  IF v_points_row.last_daily_reset IS DISTINCT FROM v_today THEN
    UPDATE public.user_points
    SET daily_earned_today = 0,
        last_daily_reset = v_today
    WHERE user_id = p_user_id;

    v_points_row.daily_earned_today := 0;
    v_points_row.last_daily_reset := v_today;
  END IF;

  IF p_reference_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.point_transactions
    WHERE user_id = p_user_id
      AND action_type = 'redeem'
      AND reference_id = p_reference_id
  ) THEN
    RETURN jsonb_build_object(
      'success', true,
      'duplicate', true,
      'redemption_id', NULL,
      'points_spent', 0,
      'reference_id', p_reference_id,
      'total_points', v_points_row.total_points
    );
  END IF;

  IF v_points_row.total_points < p_points THEN
    RAISE EXCEPTION 'Insufficient points';
  END IF;

  UPDATE public.user_points
  SET total_points = total_points - p_points,
      lifetime_points = lifetime_points,
      daily_earned_today = daily_earned_today,
      last_daily_reset = v_today
  WHERE user_id = p_user_id
  RETURNING * INTO v_points_row;

  INSERT INTO public.point_redemptions (
    user_id,
    points_spent,
    reward_type,
    reward_value,
    status
  ) VALUES (
    p_user_id,
    p_points,
    p_reward_type,
    p_reward_value,
    'pending'
  )
  RETURNING id INTO v_redemption_id;

  INSERT INTO public.point_transactions (
    user_id,
    points,
    action_type,
    reference_id,
    description
  ) VALUES (
    p_user_id,
    -p_points,
    'redeem',
    v_reference_id,
    p_description
  );

  RETURN jsonb_build_object(
    'success', true,
    'duplicate', false,
    'redemption_id', v_redemption_id,
    'points_spent', p_points,
    'reference_id', v_reference_id,
    'total_points', v_points_row.total_points
  );
END;
$$;


-- FILE: supabase/migrations/20260404150000_confirm_installment_payment_rpc.sql

-- Atomic installment confirmation/rejection RPCs.

CREATE OR REPLACE FUNCTION public.confirm_installment_payment(
  p_installment_id uuid,
  p_verification_id uuid,
  p_verified_amount numeric,
  p_verified_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_installment public.installments%ROWTYPE;
  v_verification public.slip_verifications%ROWTYPE;
  v_agreement public.debt_agreements%ROWTYPE;
  v_extra_amount numeric := 0;
  v_extra_result jsonb := '{}'::jsonb;
  v_notification_id uuid;
  v_is_fee boolean;
  v_installment_label text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT *
  INTO v_installment
  FROM public.installments
  WHERE id = p_installment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Installment not found';
  END IF;

  SELECT *
  INTO v_agreement
  FROM public.debt_agreements
  WHERE id = v_installment.agreement_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agreement not found';
  END IF;

  IF v_agreement.lender_id <> v_user_id THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT *
  INTO v_verification
  FROM public.slip_verifications
  WHERE id = p_verification_id
    AND installment_id = p_installment_id
    AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending verification not found';
  END IF;

  IF v_verification.agreement_id <> v_agreement.id THEN
    RAISE EXCEPTION 'Verification does not match agreement';
  END IF;

  IF p_verified_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid verified amount';
  END IF;

  UPDATE public.slip_verifications
  SET
    verified_amount = p_verified_amount,
    verified_by = v_user_id,
    status = 'approved',
    verified_at = COALESCE(p_verified_at, now())
  WHERE id = p_verification_id;

  UPDATE public.installments
  SET
    confirmed_by_lender = true,
    status = 'paid',
    paid_at = COALESCE(p_verified_at, now())
  WHERE id = p_installment_id;

  v_is_fee := COALESCE(v_installment.principal_portion, 0) = 0 AND COALESCE(v_installment.amount, 0) > 0;
  v_installment_label := CASE
    WHEN v_is_fee THEN 'ค่าเลื่อนงวด'
    ELSE format('งวดที่ %s', v_installment.installment_number)
  END;

  IF p_verified_amount > v_installment.amount THEN
    v_extra_amount := ROUND(p_verified_amount - v_installment.amount, 2);
    v_extra_result := public.process_extra_payment(v_agreement.id, v_extra_amount);
  END IF;

  IF v_agreement.borrower_id IS NOT NULL THEN
    PERFORM public.create_notification(
      v_agreement.borrower_id,
      'payment_confirmed',
      CASE
        WHEN v_extra_amount > 0 THEN 'ยืนยันการชำระ + ชำระเพิ่มเติม'
        WHEN v_is_fee THEN 'ยืนยันการชำระค่าเลื่อนงวด'
        ELSE 'ยืนยันการชำระแล้ว'
      END,
      CASE
        WHEN v_extra_amount > 0 THEN format('%s ยืนยันแล้ว + ตัดเงินต้นเพิ่ม ฿%s', v_installment_label, to_char(v_extra_amount, 'FM999G999G999G990D00'))
        ELSE format('%s เจ้าหนี้ยืนยันยอด ฿%s และรับเงินแล้ว', v_installment_label, to_char(p_verified_amount, 'FM999G999G999G990D00'))
      END,
      'installment',
      p_installment_id
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'verification_id', p_verification_id,
    'installment_id', p_installment_id,
    'verified_amount', p_verified_amount,
    'extra_amount', v_extra_amount,
    'extra_payment_result', v_extra_result
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_installment_payment(
  p_installment_id uuid,
  p_verification_id uuid,
  p_reason text DEFAULT 'ยอดเงินไม่ตรงกับสลิป',
  p_rejected_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_installment public.installments%ROWTYPE;
  v_verification public.slip_verifications%ROWTYPE;
  v_agreement public.debt_agreements%ROWTYPE;
  v_is_fee boolean;
  v_installment_label text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT *
  INTO v_installment
  FROM public.installments
  WHERE id = p_installment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Installment not found';
  END IF;

  SELECT *
  INTO v_agreement
  FROM public.debt_agreements
  WHERE id = v_installment.agreement_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agreement not found';
  END IF;

  IF v_agreement.lender_id <> v_user_id THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT *
  INTO v_verification
  FROM public.slip_verifications
  WHERE id = p_verification_id
    AND installment_id = p_installment_id
    AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending verification not found';
  END IF;

  UPDATE public.slip_verifications
  SET
    status = 'rejected',
    rejection_reason = COALESCE(NULLIF(btrim(p_reason), ''), 'ยอดเงินไม่ตรงกับสลิป'),
    verified_by = v_user_id,
    verified_amount = NULL,
    verified_at = COALESCE(p_rejected_at, now())
  WHERE id = p_verification_id;

  UPDATE public.installments
  SET
    payment_proof_url = NULL,
    status = 'pending'
  WHERE id = p_installment_id;

  v_is_fee := COALESCE(v_installment.principal_portion, 0) = 0 AND COALESCE(v_installment.amount, 0) > 0;
  v_installment_label := CASE
    WHEN v_is_fee THEN 'ค่าเลื่อนงวด'
    ELSE format('งวดที่ %s', v_installment.installment_number)
  END;

  IF v_agreement.borrower_id IS NOT NULL THEN
    PERFORM public.create_notification(
      v_agreement.borrower_id,
      'payment_rejected',
      'ยอดเงินไม่ตรง',
      format(
        '%s: เจ้าหนี้แจ้งว่ายอดเงินที่กรอก (฿%s) ไม่ตรงกับสลิป กรุณาตรวจสอบและส่งใหม่',
        v_installment_label,
        to_char(v_verification.submitted_amount, 'FM999G999G999G990D00')
      ),
      'installment',
      p_installment_id
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'verification_id', p_verification_id,
    'installment_id', p_installment_id
  );
END;
$$;


-- FILE: supabase/migrations/20260404183000_harden_avatar_storage.sql

-- Harden avatar storage bucket with strict size and MIME constraints.
UPDATE storage.buckets
SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'avatars';



-- FILE: supabase/migrations/20260404193000_harden_agreement_payment_credits.sql

-- Harden agreement credit and payment RPCs so only the owner or a privileged path can mutate balances.

DROP FUNCTION IF EXISTS public.add_agreement_credits(uuid, integer);
DROP FUNCTION IF EXISTS public.use_free_agreement_slot(uuid);
DROP FUNCTION IF EXISTS public.use_agreement_credit(uuid);
DROP FUNCTION IF EXISTS public.record_agreement_payment(uuid, uuid, numeric, text, text);

CREATE OR REPLACE FUNCTION public.add_agreement_credits(p_user_id uuid, p_credits integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_effective_uid uuid := auth.uid();
  v_role text := COALESCE(auth.role(), '');
BEGIN
  IF p_credits IS NULL OR p_credits <= 0 THEN
    RAISE EXCEPTION 'Invalid credit amount';
  END IF;

  IF v_role <> 'service_role' AND (v_effective_uid IS NULL OR v_effective_uid <> p_user_id) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  UPDATE public.profiles
  SET agreement_credits = COALESCE(agreement_credits, 0) + p_credits
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.use_free_agreement_slot(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_effective_uid uuid := auth.uid();
  v_free_used integer;
BEGIN
  IF v_effective_uid IS NULL OR v_effective_uid <> p_user_id THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  SELECT COALESCE(free_agreements_used, 0)
  INTO v_free_used
  FROM public.profiles
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF v_free_used < 2 THEN
    UPDATE public.profiles
    SET free_agreements_used = COALESCE(free_agreements_used, 0) + 1
    WHERE user_id = p_user_id;
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.use_agreement_credit(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_effective_uid uuid := auth.uid();
  v_credits integer;
BEGIN
  IF v_effective_uid IS NULL OR v_effective_uid <> p_user_id THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  SELECT COALESCE(agreement_credits, 0)
  INTO v_credits
  FROM public.profiles
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF v_credits > 0 THEN
    UPDATE public.profiles
    SET agreement_credits = agreement_credits - 1
    WHERE user_id = p_user_id;
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_agreement_payment(
  p_user_id uuid,
  p_agreement_id uuid,
  p_amount numeric,
  p_currency text DEFAULT 'THB',
  p_payment_method text DEFAULT 'promptpay',
  p_status text DEFAULT 'pending'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment_id uuid;
  v_status text := COALESCE(lower(btrim(p_status)), 'pending');
  v_role text := COALESCE(auth.role(), '');
BEGIN
  IF v_role <> 'service_role' AND (auth.uid() IS NULL OR auth.uid() <> p_user_id) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  IF v_status NOT IN ('pending', 'completed', 'failed') THEN
    v_status := 'pending';
  END IF;

  IF v_status = 'completed' AND v_role <> 'service_role' THEN
    RAISE EXCEPTION 'Only service role can complete payments';
  END IF;

  INSERT INTO public.agreement_payments (
    user_id,
    agreement_id,
    amount,
    currency,
    payment_method,
    status
  )
  VALUES (
    p_user_id,
    p_agreement_id,
    p_amount,
    p_currency,
    p_payment_method,
    v_status
  )
  RETURNING id INTO v_payment_id;

  RETURN v_payment_id;
END;
$$;


-- FILE: supabase/migrations/20260404195000_harden_admin_role_mutations.sql

-- Harden admin role mutation flow behind SECURITY DEFINER RPCs.

DROP POLICY IF EXISTS "Only admins can manage roles" ON public.user_roles;

DROP FUNCTION IF EXISTS public.grant_user_role(uuid, app_role);
DROP FUNCTION IF EXISTS public.revoke_user_role(uuid, app_role);

CREATE OR REPLACE FUNCTION public.grant_user_role(p_user_id uuid, p_role app_role)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_inserted integer;
BEGIN
  IF v_actor_id IS NULL OR NOT public.has_role(v_actor_id, 'admin') THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  IF p_role NOT IN ('admin', 'moderator') THEN
    RAISE EXCEPTION 'Invalid role';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_user_id, p_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'role_exists',
      'message', 'ผู้ใช้มีสิทธิ์นี้อยู่แล้ว'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'เพิ่มสิทธิ์สำเร็จ'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_user_role(p_user_id uuid, p_role app_role)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_admin_count integer;
  v_deleted integer;
BEGIN
  IF v_actor_id IS NULL OR NOT public.has_role(v_actor_id, 'admin') THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  IF p_role NOT IN ('admin', 'moderator') THEN
    RAISE EXCEPTION 'Invalid role';
  END IF;

  IF p_user_id = v_actor_id AND p_role = 'admin' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'self_demote_blocked',
      'message', 'ไม่สามารถถอดสิทธิ์ Admin ของตัวเองได้'
    );
  END IF;

  IF p_role = 'admin' THEN
    SELECT COUNT(*)
    INTO v_admin_count
    FROM public.user_roles
    WHERE role = 'admin';

    IF v_admin_count <= 1 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'last_admin',
        'message', 'ต้องมี Admin อย่างน้อย 1 คน'
      );
    END IF;
  END IF;

  DELETE FROM public.user_roles
  WHERE user_id = p_user_id
    AND role = p_role;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'role_not_found',
      'message', 'ไม่พบสิทธิ์นี้ของผู้ใช้'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'ถอดสิทธิ์สำเร็จ'
  );
END;
$$;


-- FILE: supabase/migrations/20260404210000_harden_chat_typing_upsert.sql

CREATE UNIQUE INDEX IF NOT EXISTS chat_typing_direct_chat_user_unique_idx
ON public.chat_typing (direct_chat_id, user_id)
WHERE direct_chat_id IS NOT NULL AND agreement_id IS NULL;


-- FILE: supabase/migrations/20260404213000_add_profile_settings_preferences.sql

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


-- FILE: supabase/migrations/20260404220000_make_can_create_agreement_free_volatile.sql

ALTER FUNCTION public.can_create_agreement_free(uuid) VOLATILE;


-- FILE: supabase/migrations/20260404223000_add_admin_sessions.sql

CREATE TABLE IF NOT EXISTS public.admin_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_token_hash text NOT NULL UNIQUE,
  verified_via text NOT NULL CHECK (verified_via IN ('otp', 'code')),
  code_name text,
  code_role public.app_role,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own admin sessions" ON public.admin_sessions;
CREATE POLICY "Users can view own admin sessions"
ON public.admin_sessions
FOR SELECT
USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.issue_admin_session(
  p_user_id uuid,
  p_verified_via text,
  p_code_name text DEFAULT NULL,
  p_code_role public.app_role DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF NOT public.has_role(p_user_id, 'admin') AND NOT public.has_role(p_user_id, 'moderator') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  UPDATE public.admin_sessions
  SET revoked_at = now()
  WHERE user_id = p_user_id
    AND revoked_at IS NULL
    AND expires_at > now();

  v_token := encode(gen_random_bytes(32), 'hex');

  INSERT INTO public.admin_sessions (
    user_id,
    session_token_hash,
    verified_via,
    code_name,
    code_role
  ) VALUES (
    p_user_id,
    encode(digest(v_token, 'sha256'), 'hex'),
    p_verified_via,
    p_code_name,
    p_code_role
  );

  RETURN jsonb_build_object(
    'success', true,
    'session_token', v_token,
    'verified_via', p_verified_via,
    'code_name', p_code_name,
    'code_role', p_code_role,
    'expires_in_seconds', 1800
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_admin_otp_and_issue_session(
  p_user_id uuid,
  p_otp text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.verify_admin_otp(p_user_id, p_otp);

  IF COALESCE((v_result ->> 'success')::boolean, false) IS NOT TRUE THEN
    RETURN v_result;
  END IF;

  RETURN public.issue_admin_session(p_user_id, 'otp');
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_admin_code_and_issue_session(
  p_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_result jsonb;
  v_role_text text;
  v_role public.app_role;
  v_code_name text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_result := public.verify_admin_code(p_code);

  IF COALESCE((v_result ->> 'success')::boolean, false) IS NOT TRUE THEN
    RETURN v_result;
  END IF;

  v_role_text := v_result ->> 'role';
  v_code_name := v_result ->> 'code_name';
  v_role := v_role_text::public.app_role;

  IF v_role NOT IN ('admin', 'moderator') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_role');
  END IF;

  RETURN public.issue_admin_session(v_user_id, 'code', v_code_name, v_role);
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_admin_session(
  p_session_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.admin_sessions%ROWTYPE;
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL OR p_session_token IS NULL OR length(trim(p_session_token)) = 0 THEN
    RETURN jsonb_build_object('valid', false);
  END IF;

  SELECT *
  INTO v_session
  FROM public.admin_sessions
  WHERE user_id = v_user_id
    AND session_token_hash = encode(digest(p_session_token, 'sha256'), 'hex')
    AND revoked_at IS NULL
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false);
  END IF;

  IF NOT public.has_role(v_user_id, 'admin') AND NOT public.has_role(v_user_id, 'moderator') THEN
    UPDATE public.admin_sessions
    SET revoked_at = now()
    WHERE id = v_session.id;

    RETURN jsonb_build_object('valid', false);
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'verified_via', v_session.verified_via,
    'code_name', v_session.code_name,
    'code_role', v_session.code_role,
    'expires_at', v_session.expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_admin_session(
  p_session_token text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_session_token IS NULL OR length(trim(p_session_token)) = 0 THEN
    RETURN false;
  END IF;

  UPDATE public.admin_sessions
  SET revoked_at = now()
  WHERE user_id = auth.uid()
    AND session_token_hash = encode(digest(p_session_token, 'sha256'), 'hex')
    AND revoked_at IS NULL;

  RETURN FOUND;
END;
$$;


-- FILE: supabase/migrations/20260405090000_add_agreement_confirmation_timestamps.sql

-- Add dedicated confirmation timestamps for agreement PDF evidence.
ALTER TABLE public.debt_agreements
ADD COLUMN IF NOT EXISTS lender_confirmed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS borrower_confirmed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.debt_agreements.lender_confirmed_at IS 'When the lender confirmed the agreement';
COMMENT ON COLUMN public.debt_agreements.borrower_confirmed_at IS 'When the borrower confirmed the agreement';

-- Backfill legacy confirmed agreements with the best available timestamp.
UPDATE public.debt_agreements
SET lender_confirmed_at = COALESCE(lender_confirmed_at, updated_at)
WHERE lender_confirmed = true
  AND lender_confirmed_at IS NULL;

UPDATE public.debt_agreements
SET borrower_confirmed_at = COALESCE(borrower_confirmed_at, updated_at)
WHERE borrower_confirmed = true
  AND borrower_confirmed_at IS NULL;

CREATE OR REPLACE FUNCTION public.enforce_debt_agreement_role_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  lender_only_changed boolean;
  borrower_only_changed boolean;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  lender_only_changed := (
    NEW.bank_name IS DISTINCT FROM OLD.bank_name OR
    NEW.account_number IS DISTINCT FROM OLD.account_number OR
    NEW.account_name IS DISTINCT FROM OLD.account_name OR
    NEW.lender_confirmed IS DISTINCT FROM OLD.lender_confirmed OR
    NEW.lender_confirmed_at IS DISTINCT FROM OLD.lender_confirmed_at OR
    NEW.lender_confirmed_ip IS DISTINCT FROM OLD.lender_confirmed_ip OR
    NEW.lender_confirmed_device IS DISTINCT FROM OLD.lender_confirmed_device OR
    NEW.transfer_slip_url IS DISTINCT FROM OLD.transfer_slip_url OR
    NEW.transferred_at IS DISTINCT FROM OLD.transferred_at
  );

  borrower_only_changed := (
    NEW.borrower_confirmed IS DISTINCT FROM OLD.borrower_confirmed OR
    NEW.borrower_confirmed_at IS DISTINCT FROM OLD.borrower_confirmed_at OR
    NEW.borrower_confirmed_ip IS DISTINCT FROM OLD.borrower_confirmed_ip OR
    NEW.borrower_confirmed_device IS DISTINCT FROM OLD.borrower_confirmed_device OR
    NEW.borrower_confirmed_transfer IS DISTINCT FROM OLD.borrower_confirmed_transfer OR
    NEW.borrower_confirmed_transfer_at IS DISTINCT FROM OLD.borrower_confirmed_transfer_at
  );

  IF v_actor = OLD.lender_id AND borrower_only_changed THEN
    RAISE EXCEPTION 'Lenders cannot modify borrower confirmation fields';
  END IF;

  IF v_actor = OLD.borrower_id AND lender_only_changed THEN
    RAISE EXCEPTION 'Borrowers cannot modify lender banking or transfer fields';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE VIEW public.debt_agreements_secure
WITH (security_invoker = true)
AS
SELECT
  da.id,
  da.lender_id,
  da.borrower_id,
  CASE
    WHEN auth.uid() = da.borrower_id OR da.borrower_confirmed = true
    THEN da.borrower_name
    ELSE '(รอการยืนยัน)'
  END AS borrower_name,
  CASE
    WHEN auth.uid() = da.borrower_id OR da.borrower_confirmed = true
    THEN da.borrower_phone
    ELSE NULL
  END AS borrower_phone,
  da.principal_amount,
  da.total_amount,
  da.interest_rate,
  da.interest_type,
  da.num_installments,
  da.frequency,
  da.start_date,
  da.status,
  da.description,
  da.bank_name,
  da.account_number,
  da.account_name,
  da.lender_confirmed,
  da.lender_confirmed_at,
  da.lender_confirmed_ip,
  da.lender_confirmed_device,
  da.borrower_confirmed,
  da.borrower_confirmed_at,
  da.borrower_confirmed_ip,
  da.borrower_confirmed_device,
  da.transfer_slip_url,
  da.transferred_at,
  da.borrower_confirmed_transfer,
  da.borrower_confirmed_transfer_at,
  da.agreement_text,
  da.reschedule_fee_rate,
  da.reschedule_interest_multiplier,
  da.created_at,
  da.updated_at
FROM public.debt_agreements da
WHERE da.lender_id = auth.uid() OR da.borrower_id = auth.uid();

CREATE OR REPLACE FUNCTION public.create_agreement_with_installments(
  p_lender_id uuid,
  p_borrower_id uuid DEFAULT NULL,
  p_borrower_phone text DEFAULT NULL,
  p_borrower_name text DEFAULT NULL,
  p_principal_amount numeric,
  p_interest_rate numeric DEFAULT 0,
  p_interest_type text DEFAULT 'none',
  p_total_amount numeric,
  p_num_installments integer,
  p_frequency text DEFAULT 'monthly',
  p_start_date date,
  p_description text DEFAULT NULL,
  p_reschedule_fee_rate numeric DEFAULT 5,
  p_reschedule_interest_multiplier numeric DEFAULT 1,
  p_bank_name text DEFAULT NULL,
  p_account_number text DEFAULT NULL,
  p_account_name text DEFAULT NULL,
  p_installments jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_agreement_id uuid;
  v_installment_count integer;
  v_expected_installment_count integer;
  v_installment_sum numeric;
BEGIN
  IF v_user_id IS NULL OR v_user_id <> p_lender_id THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_borrower_id IS NOT NULL AND p_borrower_id = p_lender_id THEN
    RAISE EXCEPTION 'Borrower cannot be the same as lender';
  END IF;

  IF p_installments IS NULL OR jsonb_typeof(p_installments) <> 'array' THEN
    RAISE EXCEPTION 'Invalid installments payload';
  END IF;

  v_installment_count := jsonb_array_length(p_installments);
  v_expected_installment_count := COALESCE(p_num_installments, 0);

  IF v_installment_count <> v_expected_installment_count THEN
    RAISE EXCEPTION 'Installment count mismatch';
  END IF;

  SELECT COALESCE(SUM((item ->> 'amount')::numeric), 0)
  INTO v_installment_sum
  FROM jsonb_array_elements(p_installments) AS item;

  IF ABS(v_installment_sum - p_total_amount) > 0.01 THEN
    RAISE EXCEPTION 'Installment total does not match agreement total';
  END IF;

  INSERT INTO public.debt_agreements (
    lender_id,
    borrower_id,
    borrower_phone,
    borrower_name,
    principal_amount,
    interest_rate,
    interest_type,
    total_amount,
    num_installments,
    frequency,
    start_date,
    description,
    reschedule_fee_rate,
    reschedule_interest_multiplier,
    bank_name,
    account_number,
    account_name,
    lender_confirmed,
    lender_confirmed_at
  )
  VALUES (
    p_lender_id,
    p_borrower_id,
    p_borrower_phone,
    p_borrower_name,
    p_principal_amount,
    p_interest_rate,
    p_interest_type,
    p_total_amount,
    p_num_installments,
    p_frequency,
    p_start_date,
    p_description,
    p_reschedule_fee_rate,
    p_reschedule_interest_multiplier,
    p_bank_name,
    p_account_number,
    p_account_name,
    true,
    now()
  )
  RETURNING id INTO v_agreement_id;

  INSERT INTO public.installments (
    agreement_id,
    installment_number,
    due_date,
    amount,
    principal_portion,
    interest_portion
  )
  SELECT
    v_agreement_id,
    item.installment_number,
    item.due_date,
    item.amount,
    item.principal_portion,
    item.interest_portion
  FROM jsonb_to_recordset(p_installments) AS item(
    installment_number integer,
    due_date date,
    amount numeric,
    principal_portion numeric,
    interest_portion numeric
  );

  RETURN jsonb_build_object(
    'success', true,
    'agreement_id', v_agreement_id,
    'installments_created', v_installment_count
  );
END;
$$;


-- FILE: supabase/migrations/20260405100000_add_chat_thread_summaries_rpc.sql

-- Consolidate chat thread summary and unread count lookup into a single server-side path.
-- This keeps the client from scanning every message just to build the inbox and friend badges.

CREATE OR REPLACE FUNCTION public.get_chat_thread_summaries()
RETURNS TABLE (
  chat_id uuid,
  chat_type text,
  agreement_id uuid,
  direct_chat_id uuid,
  room_type text,
  has_pending_action boolean,
  pending_action_type text,
  pending_action_for uuid,
  counterparty_id uuid,
  counterparty_name text,
  counterparty_avatar text,
  last_message text,
  last_message_at timestamptz,
  unread_count integer,
  role text,
  agreement_status text,
  principal_amount double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH agreement_threads AS (
    SELECT
      da.id AS chat_id,
      'agreement'::text AS chat_type,
      da.id AS agreement_id,
      NULL::uuid AS direct_chat_id,
      COALESCE(cr.room_type::text, 'agreement') AS room_type,
      COALESCE(cr.has_pending_action, false) AS has_pending_action,
      COALESCE(cr.pending_action_type::text, 'none') AS pending_action_type,
      cr.pending_action_for,
      CASE
        WHEN da.lender_id = auth.uid() THEN da.borrower_id
        ELSE da.lender_id
      END AS counterparty_id,
      COALESCE(cp.display_name, da.borrower_name, 'ผู้ยืม') AS counterparty_name,
      cp.avatar_url AS counterparty_avatar,
      cr.last_message,
      cr.last_message_at,
      COALESCE((
        SELECT count(*)::int
        FROM public.messages m
        WHERE m.agreement_id = da.id
          AND m.sender_id <> auth.uid()
          AND m.read_at IS NULL
      ), 0) AS unread_count,
      CASE
        WHEN da.lender_id = auth.uid() THEN 'lender'
        ELSE 'borrower'
      END AS role,
      da.status::text AS agreement_status,
      da.principal_amount::double precision AS principal_amount
    FROM public.debt_agreements da
    LEFT JOIN public.chat_rooms cr
      ON cr.agreement_id = da.id
    LEFT JOIN public.profiles cp
      ON cp.user_id = CASE
        WHEN da.lender_id = auth.uid() THEN da.borrower_id
        ELSE da.lender_id
      END
    WHERE auth.uid() IS NOT NULL
      AND auth.uid() IN (da.lender_id, da.borrower_id)
      AND da.status IN ('active', 'pending_confirmation')
  ),
  direct_threads AS (
    SELECT
      dc.id AS chat_id,
      'direct'::text AS chat_type,
      NULL::uuid AS agreement_id,
      dc.id AS direct_chat_id,
      COALESCE(cr.room_type::text, 'casual') AS room_type,
      COALESCE(cr.has_pending_action, false) AS has_pending_action,
      COALESCE(cr.pending_action_type::text, 'none') AS pending_action_type,
      cr.pending_action_for,
      CASE
        WHEN dc.user1_id = auth.uid() THEN dc.user2_id
        ELSE dc.user1_id
      END AS counterparty_id,
      COALESCE(cp.display_name, 'ผู้ใช้') AS counterparty_name,
      cp.avatar_url AS counterparty_avatar,
      cr.last_message,
      cr.last_message_at,
      COALESCE((
        SELECT count(*)::int
        FROM public.messages m
        WHERE m.direct_chat_id = dc.id
          AND m.sender_id <> auth.uid()
          AND m.read_at IS NULL
      ), 0) AS unread_count,
      NULL::text AS role,
      NULL::text AS agreement_status,
      NULL::double precision AS principal_amount
    FROM public.direct_chats dc
    LEFT JOIN public.chat_rooms cr
      ON cr.direct_chat_id = dc.id
    LEFT JOIN public.profiles cp
      ON cp.user_id = CASE
        WHEN dc.user1_id = auth.uid() THEN dc.user2_id
        ELSE dc.user1_id
      END
    WHERE auth.uid() IS NOT NULL
      AND auth.uid() IN (dc.user1_id, dc.user2_id)
  )
  SELECT * FROM agreement_threads
  UNION ALL
  SELECT * FROM direct_threads;
$$;

REVOKE ALL ON FUNCTION public.get_chat_thread_summaries() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_chat_thread_summaries() TO authenticated;

CREATE INDEX IF NOT EXISTS idx_messages_agreement_unread
  ON public.messages(agreement_id)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_messages_direct_chat_unread
  ON public.messages(direct_chat_id)
  WHERE read_at IS NULL;


-- FILE: supabase/migrations/20260406090000_reschedule_request_rpcs.sql

-- Move reschedule request create/reject mutations behind RPCs so the client
-- no longer writes directly to reschedule_requests for those actions.

CREATE OR REPLACE FUNCTION public.create_reschedule_request(
  p_installment_id uuid,
  p_agreement_id uuid,
  p_original_due_date date,
  p_new_due_date date,
  p_principal_per_installment numeric,
  p_interest_per_installment numeric,
  p_current_interest_rate numeric,
  p_interest_type text,
  p_fee_installments integer DEFAULT 1,
  p_custom_fee_rate numeric DEFAULT NULL,
  p_slip_url text DEFAULT NULL,
  p_submitted_amount numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_agreement public.debt_agreements%ROWTYPE;
  v_installment public.installments%ROWTYPE;
  v_base_fee_rate numeric;
  v_applied_fee_rate numeric;
  v_total_fee numeric;
  v_fee_per_installment numeric;
  v_safeguard_applied boolean := false;
  v_fee_installments integer := GREATEST(COALESCE(p_fee_installments, 1), 1);
  v_request public.reschedule_requests%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT *
  INTO v_agreement
  FROM public.debt_agreements
  WHERE id = p_agreement_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agreement not found';
  END IF;

  IF v_agreement.borrower_id <> v_user_id THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT *
  INTO v_installment
  FROM public.installments
  WHERE id = p_installment_id
    AND agreement_id = p_agreement_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Installment not found';
  END IF;

  IF p_interest_type IS DISTINCT FROM 'none' THEN
    v_total_fee := CEIL(COALESCE(p_interest_per_installment, 0) * COALESCE(p_custom_fee_rate, 100) / 100.0);
    v_fee_per_installment := CEIL(v_total_fee / v_fee_installments);
  ELSE
    v_base_fee_rate := COALESCE(p_custom_fee_rate, 5);
    v_safeguard_applied := (v_base_fee_rate * 12 > 15);
    v_applied_fee_rate := CASE
      WHEN v_safeguard_applied THEN GREATEST(1, FLOOR(15 / 12.0))
      ELSE v_base_fee_rate
    END;
    v_total_fee := CEIL(COALESCE(p_principal_per_installment, 0) * v_applied_fee_rate / 100.0);
    v_fee_per_installment := CEIL(v_total_fee / v_fee_installments);
  END IF;

  INSERT INTO public.reschedule_requests (
    installment_id,
    agreement_id,
    requested_by,
    original_due_date,
    new_due_date,
    reschedule_fee,
    fee_installments,
    fee_per_installment,
    original_fee_rate,
    applied_fee_rate,
    safeguard_applied,
    custom_fee_rate,
    slip_url,
    submitted_amount,
    status
  ) VALUES (
    p_installment_id,
    p_agreement_id,
    v_user_id,
    p_original_due_date,
    p_new_due_date,
    v_total_fee,
    v_fee_installments,
    v_fee_per_installment,
    COALESCE(p_custom_fee_rate, 0),
    COALESCE(v_applied_fee_rate, 0),
    v_safeguard_applied,
    p_custom_fee_rate,
    p_slip_url,
    p_submitted_amount,
    'pending'
  )
  RETURNING * INTO v_request;

  RETURN jsonb_build_object(
    'success', true,
    'request_id', v_request.id,
    'reschedule_fee', v_request.reschedule_fee,
    'fee_per_installment', v_request.fee_per_installment,
    'status', v_request.status
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_reschedule_request(
  p_request_id uuid,
  p_rejection_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_request public.reschedule_requests%ROWTYPE;
  v_agreement public.debt_agreements%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT *
  INTO v_request
  FROM public.reschedule_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'Request is not pending';
  END IF;

  SELECT *
  INTO v_agreement
  FROM public.debt_agreements
  WHERE id = v_request.agreement_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agreement not found';
  END IF;

  IF v_agreement.lender_id <> v_user_id THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  UPDATE public.reschedule_requests
  SET
    status = 'rejected',
    approved_by = v_user_id,
    approved_at = now(),
    rejection_reason = p_rejection_reason
  WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'success', true,
    'request_id', p_request_id
  );
END;
$$;


-- FILE: supabase/migrations/20260406120000_confirm_agreement_transfer_rpc.sql

-- Atomic agreement confirmation and transfer-proof mutations.

DROP FUNCTION IF EXISTS public.confirm_agreement_transfer(
  uuid,
  text,
  boolean,
  boolean,
  boolean,
  timestamptz,
  text,
  text
);

CREATE OR REPLACE FUNCTION public.confirm_agreement_transfer(
  p_agreement_id uuid,
  p_transfer_slip_url text DEFAULT NULL,
  p_mark_lender_confirmed boolean DEFAULT false,
  p_mark_borrower_confirmed boolean DEFAULT false,
  p_mark_borrower_transfer_confirmed boolean DEFAULT false,
  p_confirmed_at timestamptz DEFAULT now(),
  p_client_ip text DEFAULT NULL,
  p_device_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_agreement public.debt_agreements%ROWTYPE;
  v_lender_display_name text;
  v_lender_first_name text;
  v_lender_last_name text;
  v_lender_name text := 'ผู้ให้ยืม';
  v_borrower_name text := 'ผู้ยืม';
  v_local_time timestamp;
  v_month_name text;
  v_formatted_date text;
  v_confirmation_text text;
  v_confirmed_at timestamptz := COALESCE(p_confirmed_at, now());
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_mark_lender_confirmed AND p_mark_borrower_confirmed THEN
    RAISE EXCEPTION 'Invalid confirmation request';
  END IF;

  SELECT *
  INTO v_agreement
  FROM public.debt_agreements
  WHERE id = p_agreement_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agreement not found';
  END IF;

  IF v_user_id <> v_agreement.lender_id AND v_user_id <> v_agreement.borrower_id THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_mark_lender_confirmed OR (
    p_transfer_slip_url IS NOT NULL AND v_user_id <> v_agreement.lender_id
  ) THEN
    IF v_user_id <> v_agreement.lender_id THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;
  END IF;

  IF p_mark_borrower_confirmed OR p_mark_borrower_transfer_confirmed THEN
    IF v_user_id <> v_agreement.borrower_id THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;
  END IF;

  IF p_mark_lender_confirmed AND COALESCE(NULLIF(btrim(COALESCE(p_transfer_slip_url, v_agreement.transfer_slip_url)), ''), NULL) IS NULL THEN
    RAISE EXCEPTION 'Transfer slip is required';
  END IF;

  SELECT display_name, first_name, last_name
  INTO v_lender_display_name, v_lender_first_name, v_lender_last_name
  FROM public.profiles
  WHERE user_id = v_agreement.lender_id
  LIMIT 1;

  v_lender_name := COALESCE(
    NULLIF(btrim(COALESCE(v_lender_first_name, '') || ' ' || COALESCE(v_lender_last_name, '')), ''),
    NULLIF(btrim(v_lender_display_name), ''),
    'ผู้ให้ยืม'
  );
  v_borrower_name := COALESCE(NULLIF(btrim(v_agreement.borrower_name), ''), 'ผู้ยืม');

  v_local_time := timezone('Asia/Bangkok', v_confirmed_at);
  v_month_name := CASE EXTRACT(MONTH FROM v_local_time)::int
    WHEN 1 THEN 'มกราคม'
    WHEN 2 THEN 'กุมภาพันธ์'
    WHEN 3 THEN 'มีนาคม'
    WHEN 4 THEN 'เมษายน'
    WHEN 5 THEN 'พฤษภาคม'
    WHEN 6 THEN 'มิถุนายน'
    WHEN 7 THEN 'กรกฎาคม'
    WHEN 8 THEN 'สิงหาคม'
    WHEN 9 THEN 'กันยายน'
    WHEN 10 THEN 'ตุลาคม'
    WHEN 11 THEN 'พฤศจิกายน'
    WHEN 12 THEN 'ธันวาคม'
  END;
  v_formatted_date := format(
    '%s %s %s เวลา %s:%s น.',
    EXTRACT(DAY FROM v_local_time)::int,
    v_month_name,
    EXTRACT(YEAR FROM v_local_time)::int,
    lpad(EXTRACT(HOUR FROM v_local_time)::int::text, 2, '0'),
    lpad(EXTRACT(MINUTE FROM v_local_time)::int::text, 2, '0')
  );

  IF p_mark_lender_confirmed THEN
    v_confirmation_text := format(
      'ข้าพเจ้า %s ยืนยันว่าได้โอนเงินจำนวน %s บาท ให้แก่ %s เมื่อวันที่ %s และตกลงรับชำระคืนตามข้อตกลงที่ระบุในแอพ Budoverbills',
      v_lender_name,
      to_char(v_agreement.principal_amount, 'FM999G999G999G990'),
      v_borrower_name,
      v_formatted_date
    );
  ELSIF p_mark_borrower_confirmed THEN
    v_confirmation_text := format(
      'ข้าพเจ้า %s ยืนยันว่าได้รับเงินจำนวน %s บาท จาก %s เมื่อวันที่ %s และตกลงจะชำระคืนตามข้อตกลงที่ระบุในแอพ Budoverbills',
      v_borrower_name,
      to_char(v_agreement.principal_amount, 'FM999G999G999G990'),
      v_lender_name,
      v_formatted_date
    );
  END IF;

  UPDATE public.debt_agreements
  SET
    transfer_slip_url = CASE
      WHEN p_transfer_slip_url IS NOT NULL THEN p_transfer_slip_url
      ELSE transfer_slip_url
    END,
    transferred_at = CASE
      WHEN p_transfer_slip_url IS NOT NULL THEN v_confirmed_at
      ELSE transferred_at
    END,
    lender_confirmed = CASE
      WHEN p_mark_lender_confirmed THEN true
      ELSE lender_confirmed
    END,
    lender_confirmed_ip = CASE
      WHEN p_mark_lender_confirmed THEN p_client_ip
      ELSE lender_confirmed_ip
    END,
    lender_confirmed_device = CASE
      WHEN p_mark_lender_confirmed THEN p_device_id
      ELSE lender_confirmed_device
    END,
    lender_confirmed_at = CASE
      WHEN p_mark_lender_confirmed THEN v_confirmed_at
      ELSE lender_confirmed_at
    END,
    borrower_confirmed = CASE
      WHEN p_mark_borrower_confirmed THEN true
      ELSE borrower_confirmed
    END,
    borrower_confirmed_ip = CASE
      WHEN p_mark_borrower_confirmed THEN p_client_ip
      ELSE borrower_confirmed_ip
    END,
    borrower_confirmed_device = CASE
      WHEN p_mark_borrower_confirmed THEN p_device_id
      ELSE borrower_confirmed_device
    END,
    borrower_confirmed_at = CASE
      WHEN p_mark_borrower_confirmed THEN v_confirmed_at
      ELSE borrower_confirmed_at
    END,
    borrower_confirmed_transfer = CASE
      WHEN p_mark_borrower_transfer_confirmed THEN true
      ELSE borrower_confirmed_transfer
    END,
    borrower_confirmed_transfer_at = CASE
      WHEN p_mark_borrower_transfer_confirmed THEN v_confirmed_at
      ELSE borrower_confirmed_transfer_at
    END,
    agreement_text = CASE
      WHEN v_confirmation_text IS NULL THEN agreement_text
      WHEN COALESCE(agreement_text, '') <> '' THEN agreement_text || E'\n\n---\n\n' || v_confirmation_text
      ELSE v_confirmation_text
    END,
    status = CASE
      WHEN (
        CASE WHEN p_mark_lender_confirmed THEN true ELSE lender_confirmed END
      ) AND (
        CASE WHEN p_mark_borrower_confirmed THEN true ELSE borrower_confirmed END
      ) THEN 'active'
      ELSE status
    END,
    updated_at = now()
  WHERE id = v_agreement.id;

  RETURN jsonb_build_object(
    'success', true,
    'agreement_id', v_agreement.id,
    'lender_confirmed', CASE WHEN p_mark_lender_confirmed THEN true ELSE v_agreement.lender_confirmed END,
    'borrower_confirmed', CASE WHEN p_mark_borrower_confirmed THEN true ELSE v_agreement.borrower_confirmed END,
    'borrower_confirmed_transfer', CASE WHEN p_mark_borrower_transfer_confirmed THEN true ELSE v_agreement.borrower_confirmed_transfer END
  );
END;
$$;
