# BudOverBills — Remediation Plan
> Based on Full Bug Audit of 2026-04-03 (20 parallel Sonnet agents)
> Priority: P0 = block deploy, P1 = fix this sprint, P2 = next sprint, P3 = backlog
> Last updated: 2026-04-03 after local remediation pass and feature commits

---

## Task Board

> ใช้ส่วนนี้เป็น checklist สั้นสำหรับดูสถานะเร็ว
> ความหมาย:
> `[x]` เสร็จใน local code
> `[ ]` ยังไม่เสร็จ
> `[-]` ทำไปบางส่วน / ยังมี dependency ภายนอก

### Phase 0 (P0)
- [x] 0.1 ย้าย mutation หลักไปเป็น atomic RPCs
- [-] 0.2 Fix Admin Authentication
  route/admin guard, role mutation guard และ JWT-backed admin session path เสร็จแล้วในโค้ด
  ยังไม่เสร็จ: ต้อง deploy edge function และตั้ง `ADMIN_SESSION_JWT_SECRET` จริง
- [x] 0.3 Fix Onboarding Bypass
- [-] 0.4 Fix Payment Gateway / Subscription RPCs
  ownership guards และ fail-closed path เสร็จแล้ว
  ยังไม่เสร็จ: payment gateway / webhook completion flow จริง
- [x] 0.5 Fix Avatar Upload Security
- [x] 0.6 Fix RLS on `debt_agreements` UPDATE
- [x] 0.7 Fix User Points Atomicity
- [x] 0.8 Fix Bidirectional Friend Request Constraint
- [x] 0.9 Fix `is_trial` Flag
- [ ] Apply migrations ทั้งหมดขึ้น Supabase จริง
- [ ] Deploy edge functions/secrets ใหม่ (`admin-session`, `request-client-context`, `ADMIN_SESSION_JWT_SECRET`)
- [ ] Cleanup ข้อมูลซ้ำเดิมใน DB ถ้ามี ก่อนสร้าง unique indexes บางตัว

### Phase 1 (P1)
- [-] 1.1 Chat Performance
  batching หลักใน `Chat.tsx` เสร็จแล้ว
  ยังไม่เสร็จ: summary/RPC path สำหรับ scale สูงมาก
- [x] 1.2 Realtime Subscription Scoping
- [x] 1.3 AudioContext / Voice Leaks
- [-] 1.4 Auth Flow Hardening
  ส่วนหลักเสร็จแล้ว
  ยังควร verify flow จริงบน staging
- [x] 1.5 Payment Dialog Hardening
- [x] 1.6 Edge Function Fixes
- [x] 1.7 Open Redirect Fixes
- [x] 1.8 Password Verification

### Phase 2 (P2)
- [-] 2.1 Domain Logic Fixes
  ก้อนหลักใน debt domain เสร็จแล้ว
- [-] 2.2 Money & PDF Fixes
  `roundMoney`, `moneyEquals`, PDF page-break guard และ server-side IP path เสร็จแล้ว
  ยังไม่เสร็จ: dedicated `confirmed_at` columns ถ้าต้องแยกจาก field ปัจจุบัน
- [x] 2.3 Subscription Logic Fixes
- [-] 2.4 i18n Completion
  page chrome / labels / branding cleanup และ browser language auto-detect เสร็จแล้วหลายจุด
  ยังไม่เสร็จ: help article body text และ hardcoded copy กระจายบางส่วน
- [x] 2.5 Timezone Consistency
- [x] 2.6 Profile & Settings
- [-] 2.7 Stale Closure / Hook Fixes
  `useTypingIndicator` cleanup/upsert และ single-provider สำหรับ notifications/friend requests เสร็จแล้ว
  ยังไม่เสร็จ: ยังไม่ได้ review ทุก hook ย่อยในระบบแบบ exhaustive

### Phase 3 (P3)
- [-] 3.1 Code Cleanup
  ลบ `useFriends.ts` แล้ว
  ยังไม่เสร็จ: cleanup ย่อยอื่นใน backlog
- [-] 3.2 Test Coverage
  debt/money tests เพิ่มแล้วบางส่วน
  ยังไม่เสร็จ: checklist ที่เหลือใน phase นี้
- [-] 3.3 Accessibility
  LanguageSelector, AppErrorBoundary และ `aria-live` notification list ดีขึ้นแล้ว
  ยังไม่เสร็จ: polish เพิ่มเติมในจุดย่อยอื่น
- [x] 3.4 PWA Fixes
- [x] 3.5 Build & Config

## Phase 0: BLOCK DEPLOY (P0) — Critical Security & Data Integrity
> Estimated: 3-5 days of focused work
> Current status: Mostly done in local code. Still pending real migration apply on Supabase and server-signed admin session.

### 0.1 Server-Side Atomic Transactions (kills ~15 CRITICAL bugs at once)
Status: Done in local code via atomic RPC migrations and client integration.

**Create 5 Supabase Edge Functions / RPCs:**

| RPC | Replaces | Bugs Fixed |
|-----|----------|------------|
| `create_agreement_with_installments(...)` | Client-side 2-step insert | C-PAY-01, C-PAY-07, C-PAY-08, C-PAY-09 |
| `confirm_installment_payment(...)` | Client-side confirm + completion check | C-PAY-02, C-PAY-03, H-PAY-04 |
| `process_extra_payment(...)` | Client-side multi-step extra payment | C-PAY-04, C-PAY-05, C-PAY-06 |
| `accept_friend_request(...)` | Client-side 3-step accept | C-FRIEND-01, C-FRIEND-03 |
| `approve_reschedule_request(...)` | Client-side loop of updates | C-DETAIL-02, C-DETAIL-03 |

**Each RPC must:**
- Run inside `BEGIN ... COMMIT`
- Assert `auth.uid()` ownership
- Use `SELECT ... FOR UPDATE` for race prevention
- Return affected row counts

Implemented:
- `create_agreement_with_installments(...)`
- `confirm_installment_payment(...)`
- `process_extra_payment(...)`
- `accept_friend_request(...)`
- `approve_reschedule_request(...)`

Relevant commits:
- `f4c9479` `feat(payments): move agreement and payment writes to atomic RPCs`
- `df42202` `feat(platform): harden social, subscription, and avatar flows`

### 0.2 Fix Admin Authentication (kills 4 CRITICAL bugs)
Status: Partial.

1. **`AdminLogin.tsx`**: Set `admin_code_verified=true` after OTP success → fixes C-AUTH-03
2. **`ProtectedRoute.tsx`**: Accept EITHER path (OTP OR code) not both → fixes C-AUTH-03
3. **Server-side admin token**: Replace sessionStorage with short-lived JWT from admin-verify RPC → fixes C-AUTH-01
4. **Role mutations**: Add server-side guards preventing self-demotion and requiring at least 1 admin → fixes C-ADMIN-02

Done:
- route/admin-session logic hardened in app
- role mutation moved to RPC with self-demotion and last-admin guard

Still pending:
- replace `sessionStorage` admin session with server-signed admin JWT

### 0.3 Fix Onboarding Bypass
Status: Done in local code.

- **`ProtectedRoute.tsx`**: Add `!profile?.first_name → /personal-info` and `!profile?.pdpa_accepted_at → /pdpa-consent` redirects → fixes C-AUTH-04

### 0.4 Fix Payment Gateway / Subscription RPCs (kills 4 CRITICAL bugs)
Status: Mostly done in local code. Real payment gateway/webhook path still pending.

1. **`add_agreement_credits`**: Add `IF auth.uid() != p_user_id THEN RAISE` → fixes C-SUB-01
2. **`use_free_agreement_slot`**: Same ownership guard → fixes C-SUB-02
3. **`use_agreement_credit`**: Same ownership guard → fixes C-SUB-02
4. **`record_agreement_payment`**: Set default `status='pending'`, only service-role can set 'completed' → fixes C-SUB-03
5. **Disable client-side credit granting** until payment gateway integrated → fixes C-PAY-11

Done:
- ownership guards added
- `record_agreement_payment` hardened
- unsafe client-side credit granting disabled/fail-closed

Still pending:
- real payment gateway integration and webhook-driven completion flow

### 0.5 Fix Avatar Upload Security
Status: Done in local code.

1. **Bucket config**: Set `allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp']` and `file_size_limit = 5242880` → fixes C-PROFILE-03
2. **Extension derivation**: Use MIME-to-extension map, not `file.name` → fixes H-PROFILE-03

### 0.6 Fix RLS on `debt_agreements` UPDATE
Status: Done in local code.

- Split into lender-only policy (bank columns) and borrower-only policy (confirmation columns) → fixes C-PROFILE-02

### 0.7 Fix User Points Atomicity
Status: Done in local code.

- Create `earn_points(p_user_id, p_action_type, p_reference_id, p_points)` SECURITY DEFINER RPC with `FOR UPDATE` → fixes C-POINTS-01, C-POINTS-02
- Add `UNIQUE(user_id, action_type, reference_id)` on `point_transactions`
- Create `redeem_points(...)` RPC similarly
- Remove client-side rollback code

### 0.8 Fix Bidirectional Friend Request Constraint
Status: Done in local code.

- Add `UNIQUE(LEAST(from_user_id, to_user_id), GREATEST(from_user_id, to_user_id))` on `friend_requests` → fixes C-FRIEND-02

Note:
- real DB apply may require cleanup of pre-existing reverse-duplicate rows before the unique index can be created successfully

### 0.9 Fix `is_trial` Flag
Status: Done in local code.

- Add `is_trial = false` to `downgrade_expired_trials()` SQL function → fixes C-EDGE-02 (H-46)

---

## Phase 1: HIGH Priority — This Sprint (P1)
> Estimated: 5-7 days
> Current status: Mostly done for the high-risk/self-contained items. Some broader follow-up work still remains.

### 1.1 Chat Performance (kills N+1 storms)
Status: Partial.

- **Batch-fetch profiles**: Single `IN()` query for all counterparty IDs
- **Batch-fetch last messages**: Postgres RPC with window function
- **Batch-fetch unread counts**: Single aggregate query
- **Scope realtime subscriptions**: Add `filter` to user's room IDs
- **Replace `.single()` with `.maybeSingle()`** everywhere

Done:
- major N+1 reduction in `Chat.tsx` via batching
- `.maybeSingle()` used where appropriate in chat scope

Still pending:
- ideal long-term RPC-backed thread summary / last-message aggregation for very large message volume

### 1.2 Realtime Subscription Scoping (systemic)
Status: Done in local code for listed components.

| Component | Current | Fix |
|-----------|---------|-----|
| `useGlobalChatNotification` | Entire `messages` table | Filter to user's room IDs |
| `BottomNav` | Entire `messages` table | Filter to user's room IDs |
| `PendingActionsCard` | 3 full tables | Add user-scoped filters |
| `Profile.tsx` | Full `debt_agreements` | Add `lender_id=eq.${user.id}` filter |
| `PaymentCalendar` | Full `installments` | Add agreement-scoped filter |
| `useNotifications` | Static channel name | Append userId to channel name |
| `useFriendRequests` | Static channel name | Append userId |

### 1.3 AudioContext / Voice Leaks
Status: Done in local code.

- Close AudioContext in useEffect cleanup
- Disconnect oscillator nodes in `onended` handler
- Add `isMounted` ref guard in VoiceRecorder
- Add audio pause on VoiceMessagePlayer unmount

### 1.4 Auth Flow Hardening
Status: Mostly done in local code.

- Fix `isLoading` to wait for profile fetch (add `profileLoading` flag)
- Handle `PASSWORD_RECOVERY` event in `onAuthStateChange`
- Fix `signOut` double-state-update
- Add Google sign-in destination preservation
- Fix `requireAuth` to actually enforce (navigate + throw)

### 1.5 Payment Dialog Hardening
Status: Done in local code.

- Add `UNIQUE(installment_id, status='pending')` partial index on `slip_verifications`
- Add minimum amount validation in `handleConfirmPayment`
- Re-fetch installment status in `uploadSlip` before writing
- Add `useRef` double-click guards on all submit buttons

### 1.6 Edge Function Fixes
Status: Done in local code.

- Remove CORS headers from internal cron functions
- Add `req.method !== "POST"` guard to `notify-unconfirmed-transfers`
- Fix `constantTimeEquals` to pad to same length
- Remove `Authorization: Bearer` fallback for internal secret
- Fix notification deduplication window (remove sliding cutoff)
- Fix `related_id` type mismatch in payment-reminder-cron
- Update `send-chat-push-notification` to use `Deno.serve()`

### 1.7 Open Redirect Fixes
Status: Done in local code.

- Centralize `getSafeNotificationTarget` as shared utility
- Apply UUID validation in `Notifications.tsx` before navigation
- Fix `isSafeInternalPath` to URL-decode before regex check
- Fix Auth.tsx `from` validation: assert `startsWith('/')`

### 1.8 Password Verification
Status: Done in local code.

- Replace `signInWithPassword` with `supabase.auth.reauthenticate()` in PasswordConfirmDialog

Note:
- end-to-end reauth behavior should still be validated against Supabase staging/auth config

---

## Phase 2: MEDIUM Priority — Next Sprint (P2)
> Estimated: 5-7 days
> Current status: Partially started. Domain/money correctness fixes are in progress; most other items remain pending.

### 2.1 Domain Logic Fixes
Status: Mostly done in local code.

- Exclude 'rescheduled' from remaining balance calculation
- Add `principal_portion || 0` guard
- Use parsed date comparison (not string) in `isInstallmentOverdue`
- Fix `getAgreementDisplayStatus` to return 'completed' not 'paid' for all-paid active
- Fix `mapToUpcomingInstallments` to include all overdue (no 7-day cap)
- Add exhaustiveness check in `getPeriodsPerYear`

### 2.2 Money & PDF Fixes
Status: Partial.

- Fix `roundMoney` to use string-parsing approach
- Fix `moneyEquals` to use cent-integer subtraction
- Fix PDF page-break guards (`addWrappedText`, `drawPartyCard`)
- Add dedicated `confirmed_at` columns for PDF timestamps
- Fix `getClientIP` to use server-side extraction (not ipify)

Done:
- `roundMoney`
- `moneyEquals`

Still pending:
- PDF/page-break/timestamp/IP items

### 2.3 Subscription Logic Fixes
Status: Partial.

- Fix `isTrial` derivation: must check `trial_ends_at > now()`
- Fix `trialDaysRemaining` to use `Math.floor`
- Fix `canCreateFree` default to `false` (fail-closed)
- Fix `freeRemaining` default to `0`
- Remove dead trial badge condition
- Fix `hasUsedTrial` to ignore `expires_at`
- Fix `can_create_agreement_free` volatility from STABLE to VOLATILE

Done:
- fail-closed default behavior on client improved

Still pending:
- remaining trial derivation/volatility cleanup

### 2.4 i18n Completion
Status: Pending.

- Import `useLanguage` in: ThemePicker, DebtConsolidation, Help, Support, Terms, Privacy
- Replace all hardcoded Thai strings with `t()` calls
- Fix "OnMe" references to "Bud Over Bills" in PDPA/Terms
- Add browser language auto-detection in `getInitialLanguage()`

### 2.5 Timezone Consistency
Status: Pending.

- Use Bangkok midnight parsing everywhere: `new Date(\`${date}T00:00:00+07:00\`)`
- Fix `PaymentCalendar` to use Thai date key
- Fix `useActivityFeed` due-date calculation
- Fix `CreateAgreement` `startDate` default

### 2.6 Profile & Settings
Status: Partial.

- Store privacy settings in DB (not just localStorage)
- Store notification preferences in DB
- Fix avatar upload order (upload new first, then delete old)
- Add phone validation to EditProfileDialog
- Add bank account format validation

Done:
- avatar upload order fixed

Still pending:
- DB-backed settings and remaining field validation

### 2.7 Stale Closure / Hook Fixes
Status: Partial.

- Stabilize `user` object reference in AuthContext (useMemo)
- Lift `useNotifications` to context (single instance)
- Lift `useFriendRequests` to context
- Fix `useTypingIndicator` cleanup to capture old chatId
- Replace `sendTypingStatus` SELECT+INSERT with `.upsert()`

Done:
- some auth-loading/state cleanup already landed

Still pending:
- notification/friend context unification
- typing indicator cleanup/upsert work

---

## Phase 3: LOW Priority — Backlog (P3)
> Current status: Largely untouched.

### 3.1 Code Cleanup
Status: Pending.
- Delete dead `useFriends.ts` (localStorage-based)
- Clean up `localStorage.removeItem('paymate-friends')` on startup
- Remove redundant `isLender` prop in BankAccountSection
- Add `displayName` length/character validation

### 3.2 Test Coverage
Status: Partial.
- Add test for `calculateDaysUntilDue` when date = today
- Add test for partially-paid `mapAgreementToDebtCard`
- Fix test fixture interest_rate/total_amount mismatch
- Add test for `getOverdueInstallments` with rescheduled status

Done:
- debt/money focused tests expanded

Still pending:
- remaining specific cases above

### 3.3 Accessibility
Status: Pending.
- Add `aria-live` region for notification list
- Add `aria-expanded`/`aria-haspopup` to LanguageSelector
- Fix `AppErrorBoundary` to reset on navigation (key={pathname})

### 3.4 PWA Fixes
Status: Pending.
- Fix iOS standalone detection (`navigator.standalone`)
- Add cooldown (7-30 days) instead of permanent dismiss
- Move `PWAInstallPrompt` inside `BrowserRouter`

### 3.5 Build & Config
Status: Pending.
- Add `ImportMetaEnv` declarations to `vite-env.d.ts`
- Remove unused `VITE_SUPABASE_PROJECT_ID` from `.env`
- Explicitly set `build: { sourcemap: false }` in vite.config
- Guard `lovable-tagger` against `build:dev` production inclusion

---

## Architecture Recommendations (Long-Term)

### A1: Move All Mutations to Server-Side RPCs
Every client-side multi-step write should be a single atomic RPC. This eliminates the entire class of TOCTOU, partial-failure, and authorization-bypass bugs.

### A2: Implement Proper Rate Limiting
Replace the client-side `useRateLimiter` with server-side rate limiting (Redis or Postgres counter per IP/email). Keep client-side for UX only.

### A3: Integrate Real Payment Gateway
Integrate PromptPay/Omise. Move all credit granting to webhook-triggered server-side flows. Remove all client-side `add_agreement_credits` calls.

### A4: Add Server-Side Admin Session
Replace `sessionStorage` admin verification with a server-signed, time-limited admin JWT issued after OTP/code verification.

### A5: Unify Notification State
Lift `useNotifications` into a single React Context provider. Remove all duplicate hook instances.

### A6: Add Database Constraints
- `UNIQUE(user_id, friend_user_id)` on `friends`
- `UNIQUE(LEAST(from_user_id,to_user_id), GREATEST(from_user_id,to_user_id))` on `friend_requests`
- `UNIQUE(user_id, action_type, reference_id)` on `point_transactions`
- `CHECK(interest_rate <= 15)` on `debt_agreements`
- `CHECK(char_length(message) <= 500)` on `tips`
- Column-level RLS or triggers on sensitive columns

---

## Tracking

| Phase | Status | Target Date |
|-------|--------|-------------|
| Phase 0 (P0) | Mostly done locally; pending migration apply + admin JWT gap | ASAP — block deploy |
| Phase 1 (P1) | Mostly done for high-risk/self-contained items | Current sprint |
| Phase 2 (P2) | Partially started | Next sprint |
| Phase 3 (P3) | Largely not started | Backlog |

## Progress Snapshot

Completed local feature commits:
- `f4c9479` `feat(payments): move agreement and payment writes to atomic RPCs`
- `844b24d` `feat(edge): harden internal functions and cron guards`
- `71300c9` `feat(realtime): scope subscriptions to user data`
- `df42202` `feat(platform): harden social, subscription, and avatar flows`
- `9312317` `fix(chat): clean up voice and audio resources`
- `a86fc48` `feat(chat): batch thread and friend queries`
- `eeacf46` `fix(domain): tighten debt and money correctness`

Still required before calling the whole remediation complete:
- apply new migrations on real Supabase environments
- deploy new edge functions and set required secrets
- clean up legacy duplicate data where unique indexes may fail
- finish remaining P2/P3 items

Remaining code tasks worth doing next:
- finish full i18n coverage for long-form help/article content and remaining hardcoded copy
- review remaining accessibility polish such as broader `aria-live` coverage
- decide whether PDF export needs dedicated `confirmed_at` schema fields beyond current data

---

*This plan supersedes the previous `REMEDIATION_PLAN.md`. Cross-reference with `FULL_BUG_AUDIT_2026-04-03.md` for detailed descriptions of each bug.*
