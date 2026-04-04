# BudOverBills — Bug Fix Tasks
> Generated from `FULL_BUG_AUDIT_2026-04-04.md`  
> Total: ~308 bugs | CRITICAL: 32 | HIGH: 108 | MEDIUM: 118 | LOW: 50

---

## P0 — Critical (แก้ทันที / Block Ship)

### 🔐 Admin & Privilege Escalation
- [x] **BUG-ADMIN-01** — `supabase/functions/admin-session/index.ts` + migration `20260113` — `verify_admin_code` auto-inserts permanent DB role for any user with valid code → privilege escalation ถาวร
- [x] **BUG-ADMIN-02** — `src/pages/admin/AdminUsersPage.tsx:119-165` — ใช้ direct DML แทน `grant_user_role`/`revoke_user_role` RPCs → last-admin lockout เป็นไปได้
- [ ] **BUG-ADMIN-03** — migration `20260113101429` — hardcoded `Admin@Secure2024!` ใน git history → rotate ทันที + ลบออกจาก migration

### 🗄️ RLS / Database
- [ ] **BUG-RLS-02** — migration `20260131` — `tips` SELECT policy มี `OR auth.uid() IS NOT NULL` → ทุกคนอ่านข้อมูล tip ทุกคนได้ (deanonymize donors)
- [ ] **BUG-RLS-03** — migration `20251231` — `installments` UPDATE policy ไม่มี column restriction → borrower self-confirm payment ได้โดยไม่ต้องส่งหลักฐาน
- [ ] **BUG-RLS-05** — migration `20260109` — `activity_logs` SECURITY DEFINER `log_activity` ไม่เช็ค `auth.uid() = p_user_id` → false-flag attack (แจ้ง admin ว่าคนอื่น suspicious)
- [ ] **BUG-RLS-07** — migration `20260125` — `user_points` INSERT policy → ตั้ง `total_points = 999999` ได้โดยตรง
- [ ] **BUG-RLS-08** — migration `20260125` — `subscriptions` INSERT policy → insert `tier='premium', expires_at='2099'` ก่อน trigger ยิง = billing bypass
- [ ] **BUG-RLS-12** — trigger `enforce_debt_agreement_role_updates` — `status` field ไม่ได้รับการป้องกัน → borrower `SET status='completed'` หนี้หายจาก dashboard
- [ ] **BUG-RLS-01** — `create_notification` SECURITY DEFINER — ไม่เช็ค caller = target → inject notification ปลอมให้ใครก็ได้

### 💰 Points & Billing
- [x] **BUG-POINTS-01** — `src/hooks/useUserPoints.ts:89-112` — `earnPoints` ส่ง `crypto.randomUUID()` เป็น `reference_id` → idempotency key ไม่ทำงาน = farm points ไม่จำกัด
- [x] **BUG-POINTS-02** — `src/components/PointsDisplay.tsx:89-134` — badge upsert เรียกจาก client โดยตรง → self-award badge ใดก็ได้ผ่าน console
- [x] **BUG-SUB-01** — `add_agreement_credits` SECURITY DEFINER — ไม่จำกัด caller → self-grant credits ไม่จำกัด

### 🔔 Notifications
- [x] **BUG-NOTIF-01** — `src/utils/navigation.ts:45-68` — `related_id` ไม่ validate เป็น UUID → path traversal ใน notification (`../admin`)

---

## P1 — High Security (แก้ใน sprint นี้)

### 🔐 Auth
- [x] **BUG-AUTH-01** — `src/contexts/AuthContext.tsx:86-120` — `PASSWORD_RECOVERY` ไม่ set session flag → redirect loop หลัง password reset
- [x] **BUG-AUTH-02** — `src/pages/Auth.tsx:89-105` — `from` parameter ไม่ validate → open redirect หลัง login
- [x] **BUG-AUTH-04** — `src/pages/PDPAConsent.tsx:58-72` — ไม่ `await refreshProfile()` หลัง accept PDPA → redirect loop ไม่ออกจากหน้า PDPA
- [x] **BUG-SEC-01** — `src/components/PasswordConfirmDialog.tsx:131-135` — ใช้ `type: "email"` แทน `type: "reauthentication"` → bypass reauth ด้วย magic-link OTP เก่าได้

### 🗄️ RLS / Database
- [ ] **BUG-RLS-09** — `admin_otp` table — missing columns `failed_attempts` / `locked_until` → OTP lockout พัง = brute-force ไม่จำกัด
- [ ] **BUG-RLS-11** — `chat_rooms` INSERT policy → attacker สร้าง fake debt room ใส่ inbox ใครก็ได้
- [ ] **BUG-RLS-21** — `create_agreement_with_installments` RPC — ข้าม quota check → สร้าง agreement ไม่จำกัดโดยเรียก RPC โดยตรง
- [ ] **BUG-RLS-22** — trigger `enforce_debt_agreement_role_updates` — ไม่ lock financial terms หลัง active → lender เปลี่ยน `interest_rate=99%` หลัง borrower confirm
- [x] **BUG-RLS-16** — `add_agreement_credits` — user-path ยังอยู่ → self-grant credits
- [ ] **BUG-RLS-06** — tips INSERT RPC `record_tip` ไม่เช็ค `auth.uid() = p_user_id` → แต่งข้อมูล tip ของคนอื่น

### 💬 Chat
- [x] **BUG-CHAT-01** — `src/pages/Chat.tsx:67-89` — Realtime subscription ไม่มี filter → subscribe all messages ทุก user
- [ ] **BUG-RLS-02 (messages)** — `messages` UPDATE policy ไม่มี `WITH CHECK (sender_id)` → participant แก้ `image_url` message ของอีกฝ่ายได้ (forged payment slip)
- [x] **BUG-CHAT-02** — `src/components/chat/ChatRoom.tsx:234-256` — `console.log` ใน production leak UUIDs + message content

### 📱 Notifications / PWA
- [ ] **BUG-NOTIF-03** — `dist/sw.js` — ไม่มี `push` event handler → push notifications ไม่ทำงานเลย

### 💳 Payment
- [ ] **BUG-PAY-01** — `src/components/PaymentDialog.tsx:198-247` — race condition: storage upload + RPC แยก operation → orphaned slip files
- [x] **BUG-PAY-02** — `src/utils/promptpay.ts:48` — regex ปฏิเสธ True Move numbers (07x prefix)

### 🔒 Security (new from Agent 17)
- [x] **BUG-SEC-04** — `src/utils/paymentSlipStorage.ts:14-17` — MIME validation ใช้ `file.type` เท่านั้น (browser-reported) ไม่ตรวจ magic bytes → rename `.html` → `.jpg` ผ่านได้
- [x] **BUG-SEC-03** — `src/pages/Auth.tsx:140,153` — raw Supabase error messages leak ถึง user → email enumeration / internal info
- [x] **BUG-SEC-06** — `src/utils/adminSession.ts:57-59` — `hasAdminCodeSession` อ่าน `sessionStorage` flag → XSS ตั้งค่านี้ได้ทันที = admin UI bypass

### 🏠 Dashboard / Domain
- [x] **BUG-DASH-02** — `src/components/PaymentCalendar.tsx:156-178` — dynamic Tailwind classes (`bg-${color}-100`) ถูก purge ใน production → calendar ไม่มีสี
- [x] **BUG-DOMAIN-02** — `src/utils/debtStrategies.ts:89-134` — simulation hardcode `/12` ทุก frequency → weekly/daily interest ผิด 4-30x

### 🪝 React Hooks
- [x] **BUG-HOOK-02** — `src/contexts/AuthContext.tsx:204-216` — `AuthContext.Provider` value ไม่ `useMemo` → cascading re-renders ทั้ง app
- [x] **BUG-HOOK-06** — `src/hooks/useSignedUrl.ts:45-78` — signed URL ไม่ refresh (default 5 min) → payment slip images พัง 5 นาทีหลัง load

### 💰 Money / PDF
- [x] **BUG-PDF-05** — `src/utils/pdfExport.ts:391-400` — `link.download` ไม่ supported บน iOS Safari/PWA → PDF export พังสำหรับ iPhone ทุกคน
- [ ] **BUG-MONEY-07 / BUG-PDF-07** — `src/utils/pdfExport.ts:95-99` — Helvetica font ไม่มี Thai glyphs → ชื่อ/ข้อความภาษาไทยใน PDF เป็น □□□□

---

## P2 — High / Medium (แก้ใน quarter นี้)

### 🔐 Auth
- [x] **BUG-AUTH-03** — `src/contexts/AuthContext.tsx:96-101` — `setTimeout` ใน auth state change ไม่ clear → stale callback ยิง `setAuthLoading(false)` ผิดเวลา
- [x] **BUG-AUTH-05** — `src/components/ProtectedRoute.tsx:42-68` — admin session validation client-side เท่านั้น → ควร verify ด้วย server call
- [ ] **BUG-AUTH-07** — `src/contexts/AuthContext.tsx:58-82` — race condition ระหว่าง `authLoading` กับ `profileLoading`

### 📝 Agreement
- [ ] **BUG-AGREE-01** — `src/pages/CreateAgreement.tsx:218-245` — non-atomic quota check + creation (TOCTOU race)
- [x] **BUG-AGREE-02** — `src/pages/CreateAgreement.tsx:85` — `parseBangkokDate` ใช้ `T12:00:00Z` (UTC noon) แทน `T00:00:00+07:00` → installment dates ผิด 7 ชั่วโมง
- [x] **BUG-AGREE-03** — `src/pages/CreateAgreement.tsx:312-340` — weekly schedule ไม่ใช้ `startDate` → due dates เริ่มจาก today แทน
- [x] **BUG-AGREE-04** — `src/pages/AgreementConfirm.tsx:89-116` — `willBeFullyConfirmed` ใช้ stale cache
- [x] **BUG-AGREE-05** — `src/pages/AgreementConfirm.tsx:156-180` — reject ทำได้แม้ agreement เป็น `active` แล้ว

### 💳 Payment
- [ ] **BUG-PAY-03** — migration `20260404143000` — `process_extra_payment` principal rounding drift → 1-cent gap ค้างอยู่ตลอด
- [x] **BUG-PAY-04** — `src/components/PaymentDialog.tsx:112-130` — validate ด้วย stale `monthly_payment` prop

### 🏦 Debt
- [x] **BUG-DEBT-01** — `src/pages/DebtDetail.tsx:145-178` — `paymentSummary` นับ `rescheduled` installments เป็น pending → balance แสดงผล 2x
- [ ] **BUG-DEBT-02** — migration `20260406090000` — `submit_reschedule_request` ไม่ block duplicate pending requests
- [ ] **BUG-DEBT-03** — migration `20260406090000` — `approve_reschedule_request` ไม่เช็คว่า installment ยังเป็น `pending`

### 💬 Chat
- [ ] **BUG-CHAT-03** — `src/components/chat/ChatRoom.tsx` — ไม่มี message pagination → load ทั้งหมดทุกครั้ง
- [ ] **BUG-CHAT-04** — `src/components/chat/VoiceRecorder.tsx:145-162` — stale closure ใน auto-stop timer → recording ที่ 2 ถูกหยุดผิดเวลา
- [ ] **BUG-CHAT-05** — migration `20260404210000` — partial UNIQUE INDEX ใช้เป็น PostgREST conflict target ไม่ได้ → typing status stuck

### 👥 Friends
- [ ] **BUG-FRIEND-01** — `src/hooks/useFriendRequests.ts:145-168` — ไม่ award points เมื่อ accept friend request
- [ ] **BUG-FRIEND-02** — `src/components/AddFriendSection.tsx:78-95` — QR path ใช้ direct query แทน `search_profile_by_code` → bypass rate limit + leak full profile
- [ ] **BUG-FRIEND-03** — `friend_requests` UPDATE RLS ไม่มี `WITH CHECK` → recipient แก้ `from_user_id` ได้

### 🔔 Notifications
- [x] **BUG-NOTIF-02** — `src/hooks/useNotifications.ts:89-120` — duplicate channel subscriptions สร้างใหม่โดยไม่ cleanup → badge count inflate
- [x] **BUG-NOTIF-04** — `src/hooks/useNotifications.ts:145-162` — ไม่ deduplicate notification บน reconnect

### 💰 Subscription
- [x] **BUG-SUB-02** — `src/hooks/useSubscription.ts:78-92` — `Math.floor` แสดง "0 days" ขณะ trial ยังไม่หมด → ควรใช้ `Math.ceil`
- [x] **BUG-SUB-03** — `src/hooks/useSubscription.ts:45-62` — fail-closed default ทำให้ premium user ถูกมองเป็น free ตอน network error

### 👤 Profile
- [ ] **BUG-PROF-01** — `src/components/AvatarUpload.tsx:89-145` — old avatar ไม่ลบ + MIME จาก browser เท่านั้น
- [ ] **BUG-PROF-02** — `src/lib/validation.ts:156-170` — validate bank account 10 digits เท่านั้น → GSB/BAAC (12 digits) ใช้ไม่ได้

### 🛠️ Admin
- [ ] **BUG-ADMIN-04** — `src/utils/adminSession.ts:45-67` — `setAdminSession()` ไม่ set `admin_code_verified` flag
- [x] **BUG-ADMIN-05** — `supabase/functions/admin-session/index.ts` — `Access-Control-Allow-Origin: *` บน admin endpoint
- [ ] **BUG-ADMIN-06** — `src/pages/admin/AdminUsersPage.tsx:178-210` — user search client-side บน LIMIT 100 → ไม่เจอ user ที่เกิน 100 คนแรก

### 🏠 Dashboard
- [ ] **BUG-DASH-01** — `src/components/PaymentCalendar.tsx:89-134` — ไม่ใช้ Bangkok timezone → due dates ผิดวันสำหรับ user ที่ท่องเที่ยว
- [x] **BUG-DASH-03** — `src/components/DashboardStats.tsx:67-89` — นับ `completed` agreements ใน active count
- [x] **BUG-DASH-04** — `src/pages/Index.tsx:123-145` — `rescheduling` agreements หายจาก list โดยไม่บอกเหตุผล

### 🧮 Domain Logic
- [x] **BUG-DOMAIN-01** — `src/domains/debt/mapAgreementToDebtCard.ts:45-67` — `DebtCard.amount` ใช้ `remainingAmount` แทน `total_amount`
- [x] **BUG-DOMAIN-03** — `src/hooks/useDebtAgreements.ts:89-112` — dep array ใช้ `user` object แทน `user?.id` → refetch ทุกครั้ง auth context เปลี่ยน

### 💵 Money
- [x] **BUG-MONEY-01** — `src/utils/money.ts:40` — `toMoneyCents` double-rounding → 1-cent error บน boundary values
- [x] **BUG-MONEY-02** — `src/utils/money.ts:52-55` — `moneyEquals` default tolerance = 1 cent → 1-cent underpayment pass เป็น "paid"
- [x] **BUG-MONEY-03** — `src/utils/money.ts:57-63` — `isWithinMoneyTolerance` float comparison ไม่ safe
- [x] **BUG-MONEY-04** — `src/utils/pdfExport.ts:51-55` — PDF formatMoney ใช้ `en-US` locale แทน `th-TH`
- [x] **BUG-MONEY-05** — `src/utils/pdfExport.ts:50-55` — formatMoney ไม่ handle `NaN`/`Infinity`

### 🪝 Hooks
- [x] **BUG-HOOK-01** — `src/contexts/AuthContext.tsx:96-101` — `setTimeout` ใน auth state change ไม่ clear
- [x] **BUG-HOOK-03** — `src/hooks/useActivityFeed.ts:68-253` — ไม่มี cleanup/cancellation → stale user data leak ระหว่าง sessions
- [x] **BUG-HOOK-04** — `src/hooks/useUserPoints.ts:74-133` — `badges` state ใน `useCallback` dep → duplicate badge upserts
- [ ] **BUG-HOOK-05** — `src/hooks/useUserPoints.ts:155-189` — first-time user creation race condition

### ⚡ Realtime
- [x] **BUG-RT-01** — `src/components/BottomNav.tsx` + `src/hooks/useGlobalChatNotification.ts` — duplicate channel subscriptions → badge count 2x
- [x] **BUG-RT-02** — `src/hooks/useDebtAgreements.ts` — ไม่มี Realtime subscription → ต้อง refresh มือเพื่อดู agreement updates
- [ ] **BUG-RT-03** — `src/App.tsx:45-78` — providers remount ทุก navigation → kills Realtime subscriptions

### 🔒 Security (from Agent 17)
- [x] **BUG-SEC-02** — `src/components/PasswordConfirmDialog.tsx` — ไม่มี rate limiting บน OTP verification attempts
- [x] **BUG-SEC-05** — `src/utils/paymentSlipStorage.ts:26-35` — storage path จาก unvalidated IDs → path traversal ถ้า future code change
- [ ] **BUG-SEC-07** — `src/hooks/useRateLimiter.ts` — rate limiter client-side เท่านั้น → bypass ด้วย F5 หรือ fetch โดยตรง
- [x] **BUG-SEC-09** — `src/contexts/AuthContext.tsx:43-48` — `getSafeAuthDestination` ไม่ decode URL ก่อน validate → `/\evil.com` ผ่านได้

### 🏅 Points/History
- [ ] **BUG-POINTS-03** — `src/hooks/useUserPoints.ts:145-178` — `redeemPoints` double-spend: 2 tabs อ่าน balance เดิม → spend 2x
- [ ] **BUG-POINTS-04** — `src/hooks/useUserPoints.ts:178-198` — daily reset client-side → reset ไม่ fire ถ้าเปิด app ค้างคืน

### 🌐 RLS (Medium)
- [ ] **BUG-RLS-13** — `can_create_agreement_free` — ไม่เช็ค caller = p_user_id → probe quota ของคนอื่นได้
- [ ] **BUG-RLS-19** — `messages` UPDATE trigger — `image_url`, `file_url` columns ไม่ได้รับการป้องกัน
- [ ] **BUG-RLS-24** — `profiles` SELECT policy — `auth.uid() IS NOT NULL` → อ่าน phone/name ของทุกคนได้ (PDPA violation)

---

## P3 — Low (Backlog)

### 📦 i18n / PWA / Build
- [ ] **BUG-I18N-01** — `src/components/PWAInstallPrompt.tsx` — hardcoded Thai strings ไม่ใช้ `t()`
- [ ] **BUG-I18N-02** — `vite.config.ts` — `sourcemap: false` → production errors debug ไม่ได้ใน Sentry
- [x] **BUG-I18N-03** — `src/pages/NotFound.tsx` — ใช้ `<a href="/">` แทน `<Link>` → full page reload + English only
- [ ] **BUG-I18N-04** — `src/components/ux/PageTransition.tsx` — `minHeight: 100dvh` → layout shift ระหว่าง AnimatePresence
- [ ] **BUG-I18N-05** — `src/App.tsx` — `<Suspense>` inside `<AnimatePresence>` → double animation ทุก lazy route

### 🧭 Routing / UX
- [x] **BUG-UX-01** — `src/components/BottomNav.tsx:215` — active state ใช้ strict equality → ไม่ highlight บน nested routes
- [ ] **BUG-UX-02** — `src/App.tsx:45-78` — providers remount ทุก redirect → state/subscription loss
- [ ] **BUG-UX-04** — `src/hooks/useDebtAgreements.ts` — ไม่มี skeleton loader ระหว่าง fetch

### 🔒 Security (Low)
- [ ] **BUG-SEC-08** — auth JWT ใน `localStorage` → XSS exfiltration target (trade-off, แก้ด้วย CSP)
- [ ] **BUG-SEC-10** — `src/utils/adminSession.ts` — ไม่ store `expires_at` client-side → admin UI ยังแสดงหลัง token หมดอายุ
- [ ] **BUG-SEC-11** — `src/components/ui/chart.tsx:70-83` — CSS injection ผ่าน `dangerouslySetInnerHTML` (latent)
- [ ] **BUG-SEC-12** — `src/utils/promptpay.ts` — TLV `padStart(2)` ไม่ cap → 3-digit length field ถ้า value > 99 chars (future risk)

### 🗄️ RLS (Low)
- [ ] **BUG-RLS-20** — avatars CDN URL accessible ตลอดแม้ delete account
- [ ] **BUG-RLS-23** — `reschedule_requests` policy ไม่ใช้ `public.` prefix
- [ ] **BUG-RLS-25** — `chat_rooms` UPDATE → participant reset pending_action_type เองได้
- [ ] **BUG-RLS-26** — `verify_admin_otp_and_issue_session` ไม่เช็ค `auth.uid() = p_user_id`
- [ ] **BUG-RLS-27** — `generate_admin_otp` — ใครก็ invalidate admin OTP คนอื่นได้
- [ ] **BUG-RLS-28** — `chat-attachments` bucket ไม่มี MIME type หรือ size limit
- [ ] **BUG-RLS-29** — lock ordering inconsistency ใน payment RPCs → deadlock risk

### 📊 Domain / Money (Low)
- [ ] **BUG-DOMAIN-04** — `src/hooks/useDebtAgreements.ts:150-156` — `as unknown as` double-cast ลบ type safety
- [x] **BUG-AUTH-06** — `src/pages/Auth.tsx:134-140` — dead state `isNewSignup` ไม่มีประโยชน์
- [x] **BUG-MONEY-06** — `src/utils/money.ts:25-37` — `toMoney(null)` silently returns `0`
- [ ] **BUG-PAY-05** — `src/components/PaymentDialog.tsx:285-310` — blob URL ไม่ revoke → memory leak
- [ ] **BUG-PROF-04** — `src/components/AvatarUpload.tsx:112` — file size validation client-side เท่านั้น
- [ ] **BUG-FRIEND-04** — `src/hooks/useFriendRequests.ts:62-80` — duplicate check in-memory เท่านั้น

---

## Progress

| Priority | Total | Done | Remaining |
|----------|-------|------|-----------|
| P0 Critical | 14 | 6 | 8 |
| P1 High Security | 25 | 16 | 9 |
| P2 High/Medium | 54 | 30 | 24 |
| P3 Low | 25 | 4 | 21 |
| **Total** | **148** | **0** | **148** |

> อัปเดต progress โดยเปลี่ยน `- [ ]` → `- [x]` เมื่อแก้เสร็จ

---

*Source: FULL_BUG_AUDIT_2026-04-04.md — 20 parallel Sonnet agents*
