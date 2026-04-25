CREATE TABLE IF NOT EXISTS public.user_bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label text,
  bank_name text NOT NULL,
  account_number text NOT NULL,
  account_name text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_bank_accounts_user_id_idx
  ON public.user_bank_accounts(user_id);

ALTER TABLE public.user_bank_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own bank accounts" ON public.user_bank_accounts;
CREATE POLICY "Users can view their own bank accounts"
ON public.user_bank_accounts
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own bank accounts" ON public.user_bank_accounts;
CREATE POLICY "Users can insert their own bank accounts"
ON public.user_bank_accounts
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own bank accounts" ON public.user_bank_accounts;
CREATE POLICY "Users can update their own bank accounts"
ON public.user_bank_accounts
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own bank accounts" ON public.user_bank_accounts;
CREATE POLICY "Users can delete their own bank accounts"
ON public.user_bank_accounts
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_user_bank_accounts_updated_at ON public.user_bank_accounts;
CREATE TRIGGER update_user_bank_accounts_updated_at
BEFORE UPDATE ON public.user_bank_accounts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.user_bank_accounts (
  user_id,
  bank_name,
  account_number,
  account_name,
  is_default,
  created_at,
  updated_at
)
SELECT DISTINCT ON (agreement.lender_id)
  agreement.lender_id,
  agreement.bank_name,
  agreement.account_number,
  COALESCE(
    NULLIF(btrim(concat_ws(' ', profile.first_name, profile.last_name)), ''),
    agreement.account_name
  ),
  true,
  now(),
  now()
FROM public.debt_agreements AS agreement
LEFT JOIN public.profiles AS profile
  ON profile.user_id = agreement.lender_id
WHERE agreement.lender_id IS NOT NULL
  AND agreement.bank_name IS NOT NULL
  AND agreement.account_number IS NOT NULL
  AND agreement.account_name IS NOT NULL
  AND btrim(agreement.bank_name) <> ''
  AND btrim(agreement.account_number) <> ''
  AND btrim(agreement.account_name) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_bank_accounts existing
    WHERE existing.user_id = agreement.lender_id
  )
ORDER BY agreement.lender_id, agreement.created_at DESC;

UPDATE public.user_bank_accounts AS account
SET account_name = btrim(concat_ws(' ', profile.first_name, profile.last_name))
FROM public.profiles AS profile
WHERE profile.user_id = account.user_id
  AND NULLIF(btrim(concat_ws(' ', profile.first_name, profile.last_name)), '') IS NOT NULL
  AND account.account_name IS DISTINCT FROM btrim(concat_ws(' ', profile.first_name, profile.last_name));

CREATE OR REPLACE FUNCTION public.set_user_bank_account_name_from_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_name text;
BEGIN
  SELECT NULLIF(btrim(concat_ws(' ', first_name, last_name)), '')
  INTO v_account_name
  FROM public.profiles
  WHERE user_id = NEW.user_id;

  IF v_account_name IS NULL THEN
    RAISE EXCEPTION 'Profile full name is required before saving a bank account';
  END IF;

  NEW.account_name := v_account_name;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_user_bank_account_name_from_profile ON public.user_bank_accounts;
CREATE TRIGGER set_user_bank_account_name_from_profile
BEFORE INSERT OR UPDATE OF user_id, account_name
ON public.user_bank_accounts
FOR EACH ROW
EXECUTE FUNCTION public.set_user_bank_account_name_from_profile();

CREATE OR REPLACE FUNCTION public.sync_user_bank_account_names_from_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_name text;
BEGIN
  v_account_name := NULLIF(btrim(concat_ws(' ', NEW.first_name, NEW.last_name)), '');

  IF v_account_name IS NOT NULL THEN
    UPDATE public.user_bank_accounts
    SET account_name = v_account_name
    WHERE user_id = NEW.user_id
      AND account_name IS DISTINCT FROM v_account_name;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_user_bank_account_names_from_profile ON public.profiles;
CREATE TRIGGER sync_user_bank_account_names_from_profile
AFTER UPDATE OF first_name, last_name
ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_user_bank_account_names_from_profile();
