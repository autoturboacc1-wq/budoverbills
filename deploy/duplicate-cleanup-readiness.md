# Duplicate Cleanup Readiness

Use this before applying the unique-index migrations.

## What it checks

- `friend_requests`: collapses reverse duplicates by canonical user pair.
- `friends`: collapses exact duplicate directional rows.
- `slip_verifications`: collapses multiple `pending` rows per `installment_id`.
- `point_transactions`: collapses repeated `(user_id, action_type, reference_id)` rows where `reference_id` is not null.

## Safe flow

1. Take a fresh backup.
2. Run the report mode and review the sample duplicate groups.
3. Apply cleanup only if the rows are clearly retry duplicates or stale pairs.
4. Re-run the report mode.
5. Apply the pending migrations and indexes.

## Commands

```bash
export SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"

node scripts/predeploy-duplicate-cleanup.mjs
node scripts/predeploy-duplicate-cleanup.mjs --apply
```

If you prefer explicit flags:

```bash
node scripts/predeploy-duplicate-cleanup.mjs \
  --supabase-url "$SUPABASE_URL" \
  --service-role-key "$SUPABASE_SERVICE_ROLE_KEY"
```

## Retention Rules

- `friend_requests`: keep the most recently updated row in each canonical pair.
- `friends`: keep the most recently created row in each exact pair.
- `slip_verifications`: keep the most recently created pending row per installment.
- `point_transactions`: keep the earliest row per unique transaction key so the original event survives.

## Notes

- Null `reference_id` rows in `point_transactions` are reported but not deleted here; the migration backfills them before the unique index is created.
- If any group looks like a real history record instead of a retry duplicate, stop and inspect that pair manually before applying cleanup.
