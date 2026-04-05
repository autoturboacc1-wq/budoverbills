-- IMPORTANT: Run this migration only after setting the new admin code via the admin panel or environment variable
-- NOTE: git history rewrite required to fully purge old password. Run: git filter-branch or use BFG Repo Cleaner
--
-- BUG-ADMIN-03 remediation: the plaintext password 'Admin@Secure2024!' that appeared in the
-- initial seed INSERT of migration 20260113101429 has been removed from the working tree
-- (commit 3e455f0). However, it remains accessible in git history. Until a history rewrite
-- is performed, treat the git repository as compromised for that credential and ensure any
-- environment that ran the original migration has its admin codes rotated.
--
-- How to set a new admin code safely:
--   1. Log in as an admin user via the application.
--   2. Use the Admin Panel → "Create Admin Code" UI, which calls the create_admin_code() RPC.
--      The RPC bcrypt-hashes the code before storing it (cost factor 10).
--   3. Alternatively, run the following from a trusted psql session, substituting a strong
--      random value for <NEW_ADMIN_CODE>:
--
--        SELECT public.create_admin_code(
--          'Rotated Admin Code',
--          '<NEW_ADMIN_CODE>',  -- min 12 chars, must contain upper/lower/digit
--          'admin'
--        );
--
-- This migration deactivates the legacy 'Default Admin' seed code so it can no longer be
-- used, even if it was re-created on an environment that ran the original migration.

UPDATE public.admin_codes
SET is_active = false
WHERE code_name = 'Default Admin';
