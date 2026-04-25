# Pre-Deploy Runbook

ใช้ runbook นี้คู่กับ `npm run audit:predeploy` ก่อน production deploy ทุกครั้ง

ถ้าต้องการ checklist แบบ step-by-step สำหรับ rollout จริง ให้ใช้ร่วมกับ:
- [production-rollout-checklist.md](/Users/iphone/Desktop/budoverbills-main/deploy/production-rollout-checklist.md)

ก่อนเริ่ม rollout จริง ต้องทำ CLI preflight ให้ผ่านก่อน:

```bash
supabase --version
supabase login
supabase link --project-ref taihdoldpcbovubzjjah
supabase projects list
```

## 1. Local Strict Gate

รันจาก release commit ที่จะปล่อยจริง:

```bash
npm run audit:predeploy
```

สิ่งที่ command นี้เช็กให้อัตโนมัติ:
- `typecheck`, `test:run`, `build`
- lint warnings ต้องไม่เกิน baseline ใน `deploy/lint-warning-baseline.json`
- migrations สำคัญสำหรับ release นี้ต้องมีครบและเรียงตาม timestamp
- edge functions หลักต้องมีครบ
- `supabase/config.toml` ต้องกำหนด `verify_jwt` ตาม intent
- `BUG_REPORT.md` ต้องไม่มีรายการ unresolved ใน `Partial / Needs Backend` และ `Still Open` ยกเว้นมี waiver หรือปิด feature แล้วใน `deploy/release-waivers.json`

## 2. Freeze Release Candidate

- ตรึง branch/commit ที่จะ deploy
- หยุด merge งานใหม่จนกว่าจะจบ smoke test
- ใช้ revision เดียวกันทั้ง frontend, migrations, และ edge functions

## 3. Production Backup And Rollback Prep

ตัวอย่างคำสั่งที่ควรเตรียมก่อน apply migrations:

```bash
mkdir -p backups
supabase db dump --linked --schema public,storage --file "backups/predeploy-$(date +%Y%m%d-%H%M%S).sql"
```

ต้องเตรียม rollback path ล่วงหน้า:
- rollback ของ schema: ใช้ dump ที่เพิ่งสร้างหรือ migration down script ที่ทดสอบแล้ว
- rollback ของ edge functions: เก็บ commit SHA ล่าสุดที่ deploy สำเร็จ
- rollback ของ frontend: เก็บ artifact หรือ deploy target ของ release ก่อนหน้า

ก่อน apply unique-index migrations ให้เช็กข้อมูลซ้ำด้วย `node scripts/predeploy-duplicate-cleanup.mjs` ตามแนวทางใน `deploy/duplicate-cleanup-readiness.md`

## 4. Migration Rollout Order

apply ตามลำดับนี้โดยไม่ข้าม:

```text
20260402100000_harden_payment_slips_storage.sql
20260402120000_add_voice_to_messages.sql
20260402121000_add_theme_preference_to_profiles.sql
20260403150000_restrict_chat_attachments_voice_notes.sql
20260404110000_harden_chat_voice_notes.sql
```

ตัวอย่าง rollout:

```bash
supabase db push --linked
```

หลัง apply แล้วต้องตรวจ:
- `payment-slips` ยังอ่าน legacy paths ได้
- path ใหม่ของ payment slips enforce role ถูกต้อง
- `messages.voice_url` และ `messages.voice_duration` insert ได้เฉพาะ sender ที่ถูกต้อง
- `messages` update ได้เฉพาะ `read_at`
- `profiles.theme_preference` รับได้เฉพาะค่าที่อนุญาต

## 5. Edge Function Rollout

deploy ให้ตรงกับ code ปัจจุบัน:

```bash
supabase functions deploy payment-reminder-cron --project-ref taihdoldpcbovubzjjah
supabase functions deploy notify-unconfirmed-transfers --project-ref taihdoldpcbovubzjjah
supabase functions deploy downgrade-expired-trials --project-ref taihdoldpcbovubzjjah
supabase functions deploy send-chat-push-notification --project-ref taihdoldpcbovubzjjah
```

ก่อน deploy ต้องยืนยัน production secrets:
- Frontend required: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`
- Frontend recommended: `VITE_SENTRY_DSN`
- Functions: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `INTERNAL_FUNCTION_SECRET`

ต้องยืนยัน behavior ด้วย:
- `send-chat-push-notification` ต้อง require valid JWT
- internal functions ต้อง reject secret ที่ไม่มีหรือผิด
- cron schedules ต้องยังถูกตั้งใน Supabase dashboard หรือ infra จริง เพราะ repo นี้ไม่ได้ provision ให้อัตโนมัติ

### Payment Reminder Cron Readiness

ก่อนเปิด schedule จริงสำหรับ `payment-reminder-cron`:
- ตั้ง `INTERNAL_FUNCTION_SECRET` ใน Supabase functions ให้ตรงกับ caller
- schedule ต้องเรียก `POST` พร้อม header `x-internal-secret`
- manual invoke ด้วย secret ถูกต้องต้องได้ `success: true`
- manual invoke ด้วย secret ผิดต้องได้ `401`
- notification ที่สร้างใหม่ต้องมี `action_url` รูปแบบ `/debt/{agreement_id}?pay={installment_id}`
- run ซ้ำสำหรับวัน/offset เดิมต้องเพิ่ม `duplicates_skipped` ไม่สร้าง notification ซ้ำ
- กด notification แล้วต้องเปิดหน้ารายละเอียดสัญญาและ dialog ชำระงวดที่ตรงกับ `pay`

## 6. Smoke Test Checklist

### Auth And Access
- ผู้ใช้ที่ไม่ login เข้า protected routes ไม่ได้
- admin routes เข้าได้เฉพาะ session ที่ผ่าน admin verification

### Payment And Storage
- lender อัปโหลด transfer slip ได้เฉพาะของตัวเอง
- borrower อัปโหลด installment/reschedule slip ได้เฉพาะของตัวเอง
- lender/borrower ดู slip ของสัญญาตนเองได้
- third party อ่าน slip หรือ voice note ไม่ได้

### Chat
- ส่งข้อความ text ใน agreement chat และ direct chat ได้
- ส่ง voice note ได้ และ owner/participant เล่นกลับได้
- update message field อื่นนอกจาก `read_at` ถูก block

### Profile And Theme
- เปลี่ยน theme แล้ว refresh/logout-login ยังได้ค่าเดิม

### Functions And Notifications
- invoke internal functions ด้วย secret ถูกต้องแล้วทำงาน
- invoke ด้วย secret ผิดแล้วได้ `401`
- payment reminder ไม่สร้าง notification ซ้ำในวันเดียวกัน
- payment reminder notification มี `action_url` ไปยัง `/debt/:agreementId?pay=:installmentId`
- borrower submit slip แล้ว lender notification เปิด review dialog ของงวดนั้นได้
- lender confirm/reject แล้ว borrower notification เปิด payment dialog ของงวดนั้นได้
- ถ้า push notifications ยังไม่ส่งจริง end-to-end ให้ block release หรือ hard-disable flow นั้นก่อน

## 7. Go/No-Go Rule

ปล่อยได้เมื่อครบทุกข้อ:
- ไม่มี failing automated checks
- ไม่มี exposed critical/high issue ที่ยังไม่ fix, disable, หรือ waive
- migrations และ edge functions deploy สำเร็จ
- smoke tests ผ่านครบ
- rollback materials พร้อมใช้งาน

ถ้าจะ waive issue ใด ให้บันทึกใน `deploy/release-waivers.json` พร้อม owner, วันหมดอายุ, และเหตุผล
