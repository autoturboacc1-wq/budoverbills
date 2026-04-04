# Production Rollout Checklist

ใช้ checklist นี้สำหรับปล่อย production จาก release commit ที่พร้อมใช้งานจริง

สถานะปัจจุบันของ repo:
- งาน remediation ฝั่งโค้ดส่วนใหญ่เสร็จแล้ว
- rollout นี้ยังต้องพึ่งงานนอก repo:
  - apply migrations บน Supabase จริง
  - deploy edge functions ใหม่
  - set secrets production
  - cleanup ข้อมูลซ้ำเก่าก่อน unique indexes บางตัว
  - ถ้ายังไม่มี payment gateway/webhook จริง ให้คง purchase completion flow เป็น disabled/fail-closed

## 0. Release Scope

release นี้ครอบคลุมอย่างน้อย:
- hardening RPCs/migrations ใน `supabase/migrations/20260403...` ถึง `20260406...`
- edge functions:
  - `admin-session`
  - `request-client-context`
  - `payment-reminder-cron`
  - `notify-unconfirmed-transfers`
  - `downgrade-expired-trials`
  - `send-chat-push-notification`

## 1. Freeze The Release Commit

- เลือก commit ที่จะปล่อยจริง
- หยุด merge งานเพิ่มจนจบ smoke tests
- ยืนยันว่า release ใช้ revision เดียวกันสำหรับ:
  - frontend bundle
  - migrations
  - edge functions

ตัวอย่าง:

```bash
git rev-parse HEAD
git status --short
```

ต้องแน่ใจว่าไม่มี local changes ปนกับ release commit

## 1.1 Supabase CLI Preflight

เครื่องที่ใช้ปล่อยต้องพร้อมก่อน:

```bash
supabase --version
supabase login
supabase link --project-ref taihdoldpcbovubzjjah
```

ถ้าใช้ token ผ่าน environment:

```bash
export SUPABASE_ACCESS_TOKEN="REPLACE_WITH_ACCESS_TOKEN"
```

เช็กว่ามองเห็น project ได้:

```bash
supabase projects list
```

## 2. Run Local Gates

จาก release commit:

```bash
npm run typecheck -- --pretty false
npm run test:run
npm run build
npm run audit:predeploy
```

ถ้ามี waiver ที่ยอมรับได้ ให้ตรวจ:

```bash
cat deploy/release-waivers.json
```

## 3. Backup And Rollback Prep

ก่อนแตะ production:

```bash
mkdir -p backups
supabase db dump --linked --schema public,storage --file "backups/predeploy-$(date +%Y%m%d-%H%M%S).sql"
```

ต้องเตรียม rollback:
- database dump ล่าสุด
- commit SHA ของ frontend release ก่อนหน้า
- commit SHA ของ edge functions release ก่อนหน้า
- ขั้นตอน revert feature flag / disable flow ถ้าจำเป็น

## 4. Production Secrets

ยืนยันว่ามี secrets ครบก่อน deploy functions:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `INTERNAL_FUNCTION_SECRET`
- `ADMIN_SESSION_JWT_SECRET`

frontend env ที่ต้องมี:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

แนะนำ:
- `VITE_SENTRY_DSN`

ตัวอย่าง:

```bash
supabase secrets list --project-ref taihdoldpcbovubzjjah
```

ถ้ายังไม่มี `ADMIN_SESSION_JWT_SECRET` ห้ามเปิดใช้ admin-session path ใน production

## 5. Duplicate Cleanup Readiness

ก่อน apply migrations ที่มี unique index / constraints:

```bash
export SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"

node scripts/predeploy-duplicate-cleanup.mjs
```

ตรวจรายงานให้ครบ:
- `friend_requests`
- `friends`
- `slip_verifications` pending duplicates
- `point_transactions`

ถ้าตรวจแล้วเป็น retry/stale rows จริง ค่อย apply:

```bash
node scripts/predeploy-duplicate-cleanup.mjs --apply
node scripts/predeploy-duplicate-cleanup.mjs
```

อ่านรายละเอียดเพิ่ม:
- [duplicate-cleanup-readiness.md](/Users/iphone/Desktop/budoverbills-main/deploy/duplicate-cleanup-readiness.md)

## 6. Migration Rollout Order

apply migrations ตาม timestamp โดยไม่ข้าม

ขั้นต่ำของ remediation wave นี้:

```text
20260403183000_add_partial_unique_pending_slip_verifications.sql
20260404120000_harden_downgrade_expired_trials.sql
20260404133000_harden_debt_agreements_update_rls.sql
20260404143000_atomic_agreement_mutations.sql
20260404143000_harden_friend_points_atomicity.sql
20260404150000_confirm_installment_payment_rpc.sql
20260404183000_harden_avatar_storage.sql
20260404193000_harden_agreement_payment_credits.sql
20260404195000_harden_admin_role_mutations.sql
20260404210000_harden_chat_typing_upsert.sql
20260404213000_add_profile_settings_preferences.sql
20260404220000_make_can_create_agreement_free_volatile.sql
20260404223000_add_admin_sessions.sql
20260405090000_add_agreement_confirmation_timestamps.sql
20260405100000_add_chat_thread_summaries_rpc.sql
20260406090000_reschedule_request_rpcs.sql
20260406120000_confirm_agreement_transfer_rpc.sql
```

ตัวอย่าง:

```bash
supabase db push --linked
```

หลัง apply แล้วตรวจทันที:
- `profiles.theme_preference`, `notification_preferences`, `privacy_settings`
- `admin_sessions`
- `lender_confirmed_at`, `borrower_confirmed_at`
- new RPCs ถูกสร้างครบ

## 7. Edge Function Deploy

deploy functions ที่เกี่ยวข้อง:

```bash
supabase functions deploy admin-session --project-ref taihdoldpcbovubzjjah
supabase functions deploy request-client-context --project-ref taihdoldpcbovubzjjah
supabase functions deploy payment-reminder-cron --project-ref taihdoldpcbovubzjjah
supabase functions deploy notify-unconfirmed-transfers --project-ref taihdoldpcbovubzjjah
supabase functions deploy downgrade-expired-trials --project-ref taihdoldpcbovubzjjah
supabase functions deploy send-chat-push-notification --project-ref taihdoldpcbovubzjjah
```

หลัง deploy:
- ตรวจ `supabase/config.toml` ว่า intent ของ `verify_jwt` ถูกกับแต่ละ function
- ยืนยันว่า `admin-session` ใช้ secret จริงใน production

## 8. Frontend Deploy

- deploy frontend จาก release commit เดียวกับ migrations/functions
- clear/refresh CDN cache ถ้า platform ใช้ caching layer
- เตรียม fallback ไป frontend release ก่อนหน้า

## 9. Smoke Test Checklist

### Auth / Admin
- ผู้ใช้ที่ไม่ login เข้า protected routes ไม่ได้
- onboarding redirect ไป `/personal-info` และ `/pdpa-consent` ถูกต้อง
- admin login ด้วย OTP ใช้ได้
- admin code login ใช้ได้
- admin session หมดอายุ/invalid แล้วถูกพาไป login ใหม่
- admin role mutation ยัง enforce self-demotion / last-admin guard

### Agreements / Payments
- create agreement สำเร็จ และ installments ถูกสร้างครบ
- borrower upload slip แล้ว lender เห็นรายการรอยืนยัน
- lender confirm payment ผ่าน RPC สำเร็จ
- lender reject payment ผ่าน RPC สำเร็จ
- extra payment path ยังทำงานถูก
- agreement confirm / transfer confirm path ทำงานผ่าน RPC สำเร็จ
- reschedule create / approve / reject path ทำงานสำเร็จ

### Storage / Security
- avatar รับเฉพาะ jpeg/png/webp และไฟล์เกิน 5MB ถูก block
- third party อ่าน payment slips / voice notes ไม่ได้
- agreement parties อ่านไฟล์ของตัวเองได้

### Chat
- agreement chat ใช้งานได้
- direct chat เปิดได้แม้มี race พร้อมกันจากสองฝั่ง
- thread list / unread counts แสดงผลถูกจาก summary path
- voice recorder / player ไม่ leak หรือค้าง obvious resources

### Notifications / Realtime
- notifications realtime ยังทำงาน
- mark read / mark all read / delete ใช้ได้
- duplicate reminder จาก cron ไม่เกิดซ้ำผิดปกติ

### PDF / Legal Evidence
- export PDF สำเร็จ
- PDF ใช้ confirmation timestamps ใหม่ ไม่ใช่ `updated_at`
- IP/device information แสดงผลตามที่คาด

### Settings / Profile
- privacy settings และ notification preferences persisted
- phone validation ทำงาน
- bank/promptpay validation ทำงาน

## 10. Monetization Go/No-Go

ถ้ายังไม่มี gateway/webhook completion จริง:
- ห้ามเปิด purchase completion เป็น production-ready flow
- keep current client path disabled/fail-closed
- ระบุใน release notes ว่า monetized purchase path ยังไม่ active

ถ้ามี gateway แล้ว:
- ต้องย้าย credit granting ไป webhook/server completion เท่านั้น
- ต้องมี smoke test ว่า completed payment เพิ่ม credits จริงเพียงครั้งเดียว

## 11. Observability And Logs

หลัง deploy ตรวจ:
- function logs ของ `admin-session`
- auth/admin error rates
- cron execution logs
- client error monitoring (เช่น Sentry) ไม่มี spike ใหม่

## 12. Rollback Decision Points

rollback ทันทีถ้าเจอ:
- migration apply fail หรือ partial state ที่แก้สดไม่ได้
- admin login ใช้งานไม่ได้
- payment confirmation / agreement confirmation path พัง
- storage policy ทำให้ user อ่านไฟล์ที่ไม่ควรอ่านได้
- duplicate cleanup script ลบข้อมูลเกินกว่าที่ review ไว้

## 13. Go / No-Go

ปล่อย production ได้เมื่อครบทุกข้อ:
- local gates ผ่าน
- backup พร้อม
- duplicate cleanup review/apply ผ่าน
- migrations apply สำเร็จ
- edge functions deploy สำเร็จ
- secrets ครบ
- smoke tests ผ่าน
- rollback path พร้อม

ถ้ายังไม่ครบ:
- block release
- บันทึก blocker และ owner ชัดเจน

## 14. Minimal Remaining Blockers After Repo Work

หลังจากโค้ดใน repo รอบนี้ สิ่งที่ยังถือเป็น blocker หลักมีแค่:
- production migration apply
- production duplicate cleanup
- edge function deploy
- secret setup
- payment gateway / webhook completion (ถ้าจะเปิด monetized flow จริง)
