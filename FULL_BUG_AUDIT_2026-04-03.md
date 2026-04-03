# BudOverBills — Full Bug Audit Report
> Generated 2026-04-03 by 20 parallel Sonnet agents auditing every file in the project.
> Total bugs found: **~270+** across all severity levels.

---

## Table of Contents
1. [Summary by Severity](#summary-by-severity)
2. [CRITICAL Bugs](#critical-bugs)
3. [HIGH Bugs](#high-bugs)
4. [MEDIUM Bugs](#medium-bugs)
5. [LOW Bugs](#low-bugs)

---

## Summary by Severity

| Severity | Count | Description |
|----------|-------|-------------|
| **CRITICAL** | ~40 | Security vulnerabilities, data corruption, financial fraud vectors |
| **HIGH** | ~80 | Race conditions, authorization gaps, broken core flows |
| **MEDIUM** | ~100 | Logic errors, UX breakage, performance, i18n, stale state |
| **LOW** | ~50 | Code smells, minor UX, test gaps, dead code |

---

## CRITICAL Bugs

### C-AUTH-01: Admin Session Guard Trivially Bypassed via sessionStorage Forgery
- **File:** `src/components/ProtectedRoute.tsx:29-38`
- **Description:** Admin gate relies entirely on `sessionStorage` values (`admin_verified`, `admin_code_verified`). Any authenticated user can set these via DevTools and gain full admin access.
- **Impact:** Complete admin panel access for any logged-in user.
- **Fix:** Use a server-issued, short-lived signed token (JWT/RPC) for admin verification. Never trust sessionStorage as the sole gate.

### C-AUTH-02: Role Check Is Client-Side Only
- **File:** `src/hooks/useUserRole.ts:26-29`, `src/components/ProtectedRoute.tsx:12-14`
- **Description:** `isAdmin`/`isModerator` derived from client-side query on `user_roles` table. Can be patched via DevTools or response interception.
- **Impact:** Privilege escalation to admin for any user if RLS is misconfigured.
- **Fix:** Enforce role checks via server-side RLS/RPC on every admin action. Client-side flag is UI-only.

### C-AUTH-03: OTP Flow Never Sets `admin_code_verified` — Infinite Redirect Loop
- **File:** `src/pages/AdminLogin.tsx:181` vs `src/components/ProtectedRoute.tsx:36`
- **Description:** `ProtectedRoute` requires BOTH `admin_verified` AND `admin_code_verified`. `AdminLogin` (OTP flow) only sets `admin_verified`. Result: infinite redirect loop.
- **Impact:** The primary secure admin login path is completely broken.
- **Fix:** `AdminLogin` must also set `admin_code_verified=true` after OTP success, OR `ProtectedRoute` should accept either path.

### C-AUTH-04: Onboarding PDPA/PersonalInfo Bypass
- **File:** `src/components/ProtectedRoute.tsx:10-41`
- **Description:** `ProtectedRoute` never checks `profile.first_name` or `profile.pdpa_accepted_at`. Onboarding redirects exist only in `Auth.tsx`'s `useEffect`. Any authenticated user navigating directly to `/` bypasses PDPA consent entirely.
- **Impact:** Legal compliance failure under Thai PDPA. Users use the app without consent.
- **Fix:** Move onboarding checks into `ProtectedRoute` or a dedicated guard component.

### C-PAY-01: Non-Atomic Agreement Creation — Orphaned Agreements
- **File:** `src/hooks/useDebtAgreements.ts:242-265`
- **Description:** Agreement row inserted first, installments in a separate call. If installments fail, orphaned agreement exists with no schedule.
- **Impact:** Broken payment flows, quota desync.
- **Fix:** Wrap both inserts in a single Postgres transaction via RPC.

### C-PAY-02: TOCTOU Race on Installment Confirmation — Double-Confirmation
- **File:** `src/hooks/useDebtAgreements.ts:386-404`
- **Description:** `confirmPayment` has no `WHERE confirmed_by_lender = false` guard. Double-tap or two tabs can confirm and trigger completion logic twice.
- **Impact:** Duplicate completion notifications; double credit in extra-payment flows.
- **Fix:** Add `.eq('confirmed_by_lender', false)` to UPDATE. Check affected row count.

### C-PAY-03: `handleConfirmPayment` in PaymentDialog — No Idempotency Guard
- **File:** `src/components/PaymentDialog.tsx:287-371`
- **Description:** Same pattern as C-PAY-02 but in the UI component. Updates slip_verifications then installments then extra payments — all non-atomic with no prior-state guards.
- **Impact:** Double-confirmation credits extra payments twice.
- **Fix:** Add state guard + server-side RPC.

### C-PAY-04: `processExtraPayment` — No Authorization Check
- **File:** `src/hooks/useExtraPayment.ts:85-193`
- **Description:** Only checks `if (!user)`. Any authenticated user can call this to close installments on any agreement.
- **Impact:** Borrower or third party can zero-out someone else's debt.
- **Fix:** Assert `agreement.lender_id === user.id`. Enforce via RLS.

### C-PAY-05: `processExtraPayment` — Non-Atomic Multi-Step Write
- **File:** `src/hooks/useExtraPayment.ts:139-167`
- **Description:** Bulk-marks installments as paid, then recalculates. Partial failure leaves inconsistent schedule.
- **Impact:** Principal balances become incorrect after a partial failure.
- **Fix:** Single Postgres transaction in Edge Function.

### C-PAY-06: Stale In-Memory Data Used for Recalculation
- **File:** `src/hooks/useExtraPayment.ts:27-76`
- **Description:** Uses `agreement.installments` from React state, not a fresh DB read. Another user may have confirmed installments since dialog opened.
- **Impact:** Incorrect amounts written to all remaining installments.
- **Fix:** Re-fetch installments from DB at start of operation.

### C-PAY-07: Quota Consumed AFTER Agreement Already Created
- **File:** `src/pages/CreateAgreement.tsx:250-268`
- **Description:** Agreement created first, then slot deducted. If deduction fails, agreement exists without consuming quota.
- **Impact:** Users can bypass the 2-free-agreement limit.
- **Fix:** Deduct atomically server-side before/during agreement insert.

### C-PAY-08: TOCTOU Race on Quota Check (30s Stale Cache)
- **File:** `src/pages/CreateAgreement.tsx:190-200`, `src/hooks/useSubscription.ts:91`
- **Description:** Quota cached with 30s staleTime. Two tabs can both see 1 free slot and create 2 agreements.
- **Impact:** Monetization bypass.
- **Fix:** Enforce atomically server-side.

### C-PAY-09: Double-Submission of Agreement Creation
- **File:** `src/pages/CreateAgreement.tsx:213-273`
- **Description:** `isSubmitting` uses React state (async). Rapid double-click passes guard before re-render.
- **Impact:** Duplicate agreements.
- **Fix:** Use `useRef` for synchronous in-flight guard.

### C-PAY-10: Double-Submission of Agreement Confirmation
- **File:** `src/pages/AgreementConfirm.tsx:161-262`
- **Description:** Same pattern — no synchronous guard against double-tap on confirm.
- **Impact:** Duplicate legal text appended; double status transitions.
- **Fix:** `useRef` guard + conditional DB WHERE clause.

### C-PAY-11: Payment Gateway Not Integrated — Credits Without Payment
- **File:** `src/pages/Subscription.tsx:111-128`
- **Description:** `handlePurchaseCoffee` calls `add_agreement_credits` directly. No payment verification, no webhook, no idempotency.
- **Impact:** Any user can grant themselves unlimited credits for free.
- **Fix:** Move credit granting to server-side after verified payment callback.

### C-SUB-01: `add_agreement_credits` RPC — No Caller Ownership Check
- **File:** `supabase/migrations/.../add_agreement_credits`
- **Description:** Accepts any `p_user_id` with no `auth.uid() = p_user_id` assertion.
- **Impact:** Any user can grant credits to anyone.
- **Fix:** Add `IF auth.uid() != p_user_id THEN RAISE EXCEPTION` guard.

### C-SUB-02: `use_free_agreement_slot` / `use_agreement_credit` — No Ownership Check
- **Description:** Same pattern as C-SUB-01.
- **Impact:** Any user can drain another user's quota.
- **Fix:** Same ownership assertion.

### C-SUB-03: `record_agreement_payment` — Inserts `status='completed'` Without Verification
- **Description:** No payment provider reference, no ownership guard. Fabricated payment records.
- **Fix:** Set status='pending' by default; only service-role webhook flips to 'completed'.

### C-FRIEND-01: Non-Atomic Accept Creates Partial Friendship
- **File:** `src/hooks/useFriendRequests.ts:264-301`
- **Description:** Three sequential writes: insert friend1, insert friend2, update status. Partial failure leaves orphaned rows. No unique constraint prevents duplicates.
- **Impact:** Duplicate friend records; inconsistent state.
- **Fix:** Single Postgres RPC with transaction. Add UNIQUE constraint.

### C-FRIEND-02: Bidirectional Friend Request Race
- **File:** `src/hooks/useFriendRequests.ts:176-212`
- **Description:** TOCTOU on duplicate check. A→B and B→A can both be inserted simultaneously.
- **Impact:** Both requests exist with no resolution path.
- **Fix:** Add DB-level unique constraint on unordered pair: `UNIQUE(LEAST(from,to), GREATEST(from,to))`.

### C-FRIEND-03: `acceptRequest` Inserts Row for Other User — RLS Blocks or Bypasses
- **File:** `src/hooks/useFriendRequests.ts:279-290`
- **Description:** Inserts `friends` row with `user_id: request.from_user_id` — not the current user. If RLS enforces `auth.uid() = user_id`, this always fails. If service role, it's a privilege escalation.
- **Impact:** Accept flow is either always broken or always insecure.
- **Fix:** Move to SECURITY DEFINER RPC.

### C-CHAT-01: N+1 Query Storm in fetchThreads (3N queries per page load)
- **File:** `src/pages/Chat.tsx:58-114`
- **Description:** Per-agreement: profile SELECT + last message SELECT + unread count. With 30 chats = 90 round-trips on every page load and every realtime event.
- **Impact:** Severe latency; Supabase connection exhaustion; DoS under load.
- **Fix:** Batch-fetch with single queries + server-side RPC.

### C-CHAT-02: N+1 Query Storm in FriendsList (2-3N queries)
- **File:** `src/pages/Chat.tsx:378-413`
- **Description:** Same pattern for each friend: profile + direct_chat + unread count.
- **Fix:** Same batch-fetch approach.

### C-CHAT-03: TOCTOU Duplicate Direct Chat Room Creation
- **File:** `src/pages/Chat.tsx:437-466`
- **Description:** SELECT then INSERT with no unique constraint. Two simultaneous clicks create duplicate rooms.
- **Impact:** Fragmented message history.
- **Fix:** `INSERT ... ON CONFLICT DO NOTHING` with unique constraint.

### C-CHAT-04: `.single()` Throws on Empty Result — Silently Corrupts State
- **File:** `src/pages/Chat.tsx:79-85,146-152`
- **Description:** `.single()` for last message query. Empty chat rooms trigger PGRST116 error silently swallowed.
- **Impact:** Real DB errors masked as "no messages."
- **Fix:** Use `.maybeSingle()`.

### C-CHAT-05: Global Realtime Subscription Not Scoped to User's Rooms
- **File:** `src/hooks/useGlobalChatNotification.ts:27-48`
- **Description:** Listens on entire `messages` table. Every message from any user triggers the callback.
- **Impact:** Notification sounds for conversations user is not part of; DoS at scale.
- **Fix:** Filter subscription to user's room IDs.

### C-CHAT-06: BottomNav — Same Unscoped Global Subscription
- **File:** `src/components/BottomNav.tsx:73-87`
- **Description:** Second unscoped subscription. Every DB write to messages triggers 4 sequential queries on every client.
- **Impact:** Catastrophic DB load at scale.
- **Fix:** Filter to user's rooms.

### C-POINTS-01: earnPoints / redeemPoints Non-Atomic — Race Allows Unlimited Points
- **File:** `src/hooks/useUserPoints.ts:230-425`
- **Description:** Read-compute-write pattern with no transaction, no SELECT FOR UPDATE, no conditional WHERE.
- **Impact:** Points can be double-earned or double-spent. Manual rollback can destroy concurrent writes.
- **Fix:** Move all point arithmetic into a SECURITY DEFINER Postgres function with FOR UPDATE.

### C-POINTS-02: Duplicate-Earn TOCTOU — No DB Unique Constraint
- **File:** `src/hooks/useUserPoints.ts:257-267`
- **Description:** Idempotency check is a separate SELECT. No unique constraint on `(user_id, action_type, reference_id)`.
- **Impact:** Same action earns points twice via race.
- **Fix:** Add UNIQUE index + ON CONFLICT DO NOTHING.

### C-EDGE-01: CORS `Access-Control-Allow-Origin: "null"` on Edge Functions
- **File:** `supabase/functions/*/index.ts`
- **Description:** String `"null"` matches sandboxed iframes. Internal cron functions callable from malicious pages.
- **Impact:** Cross-origin requests to internal endpoints from phishing pages.
- **Fix:** Remove CORS headers from internal functions. Use explicit origin for public ones.

### C-EDGE-02: `downgrade_expired_trials` Does Not Reset `is_trial` Flag (H-46)
- **File:** `supabase/functions/downgrade-expired-trials/index.ts`
- **Description:** Sets `tier='free'` but leaves `is_trial=true`. Users permanently stuck in "expired trial" state.
- **Impact:** Paid upgrades can be silently overridden by stale `is_trial` flag.
- **Fix:** Add `is_trial = false` to the UPDATE.

### C-EDGE-03: `notify-unconfirmed-transfers` No Method Guard
- **File:** `supabase/functions/notify-unconfirmed-transfers/index.ts:40-45`
- **Description:** Accepts all HTTP methods (GET, PUT, etc.). Any request with correct secret triggers notifications.
- **Impact:** Accidental GET requests trigger side effects.
- **Fix:** Add `if (req.method !== "POST") return 405` guard.

### C-PROFILE-01: Password Verification Uses `signInWithPassword` — Creates New Session
- **File:** `src/components/PasswordConfirmDialog.tsx:112`
- **Description:** Full authentication call overwrites existing tokens, triggers all `onAuthStateChange` listeners.
- **Impact:** Concurrent operations cancelled; duplicate activity logs; potential session corruption.
- **Fix:** Use `supabase.auth.reauthenticate()` instead.

### C-PROFILE-02: Borrower Can Overwrite Lender's Bank Account via Direct API
- **File:** `supabase/migrations/...` (RLS policy on debt_agreements)
- **Description:** UPDATE policy allows both lender and borrower to update ANY column. Borrower can change bank details.
- **Impact:** Financial fraud — borrower redirects payments to their own account.
- **Fix:** Split UPDATE policy; column-level restrictions.

### C-PROFILE-03: Avatar Bucket Has No Server-Side MIME Restriction
- **File:** `supabase/migrations/.../avatars bucket`
- **Description:** No `allowed_mime_types` or `file_size_limit`. Client-side `file.type` check trivially bypassed.
- **Impact:** Stored XSS via SVG/HTML uploads on public CDN.
- **Fix:** Set bucket-level MIME whitelist + file size limit.

### C-DETAIL-01: No Ownership Verification in DebtDetail
- **File:** `src/pages/DebtDetail.tsx:169-174`
- **Description:** `getUserRoleInAgreement` returns `null` for non-parties but page renders anyway.
- **Impact:** Any authenticated user can view another user's agreement details.
- **Fix:** Redirect to 403 when `userRole === null`.

### C-DETAIL-02: Reschedule Approval Not Transactional
- **File:** `src/hooks/useRescheduleRequests.ts:196-297`
- **Description:** Multiple sequential installment updates without transaction. Partial failure = corrupted schedule.
- **Impact:** Installments can be partially shifted with no recovery.
- **Fix:** Single Postgres RPC with transaction.

### C-DETAIL-03: Reschedule Approve/Reject — Client-Side Ownership Only
- **File:** `src/hooks/useRescheduleRequests.ts:211-222`
- **Description:** Lender check is JavaScript only. No server-side RLS enforcement visible.
- **Impact:** Any user with request ID can approve/reject via direct API call.
- **Fix:** Enforce via RLS or server-side RPC.

### C-ADMIN-01: AdminHub Audit Trail Fetches Before 2FA Check
- **File:** `src/pages/AdminHub.tsx:79-149`
- **Description:** `useQuery` fires on mount before `checkVerification` redirects. Data cached client-side.
- **Impact:** Sensitive audit logs exposed without 2FA.
- **Fix:** Add `enabled: isAdmin && sessionStorage check` to useQuery.

### C-ADMIN-02: No Self-Revocation or Escalation Guard on Role Mutations
- **File:** `src/pages/AdminUserRoles.tsx:157-178`
- **Description:** Admin can grant/revoke any role including their own. No secondary confirmation.
- **Impact:** Privilege escalation; admin sabotage; no minimum admin enforcement.
- **Fix:** Server-side guards; prevent self-demotion; require confirmation for admin-level grants.

### C-NOTIF-01: Open Redirect via Notification `action_url`
- **File:** `src/pages/Notifications.tsx:41-55`
- **Description:** `related_id` used in navigation without UUID validation. `getSafeNotificationTarget` not used.
- **Impact:** Path injection via crafted notifications.
- **Fix:** Apply UUID validation and centralize navigation guard.

### C-NOTIF-02: Hard-coded VAPID Public Key in Source
- **File:** `src/hooks/usePushNotifications.ts:6`
- **Description:** VAPID key embedded as string constant. Cannot vary per environment.
- **Impact:** Key rotation requires code change and redeploy.
- **Fix:** Move to `VITE_VAPID_PUBLIC_KEY` env var.

---

## HIGH Bugs

> (~80 bugs) — Grouped by area. Each entry follows the format: ID, File, Description, Impact, Fix.

### Authentication & Routing
| ID | File | Issue |
|----|------|-------|
| H-AUTH-01 | Auth.tsx:49 | Open redirect via `from`/`returnTo` location state |
| H-AUTH-02 | AuthContext.tsx:64-84 | Race: `isLoading=false` before profile fetched |
| H-AUTH-03 | Auth.tsx:52-94 | Redirect effect re-runs on `from` change → loops |
| H-AUTH-04 | AuthContext.tsx:121-126 | PII (email) logged plaintext on failed login |
| H-AUTH-05 | useRateLimiter.ts:24 | Client-side rate limiter reset by page refresh |
| H-AUTH-06 | Auth.tsx:27 | `isNewSignup` never set → onboarding bypass |
| H-AUTH-07 | Auth.tsx:187 | Password reset `redirectTo` uses `window.location.origin` |
| H-AUTH-08 | Index.tsx:21-40 | Stale/null profile on first render → flash of wrong name |

### Payments & Agreements
| ID | File | Issue |
|----|------|-------|
| H-PAY-01 | PaymentDialog.tsx:177 | Multiple pending slip verifications via parallel requests |
| H-PAY-02 | PaymentDialog.tsx:287 | No minimum amount check on confirmed payment |
| H-PAY-03 | useDebtAgreements.ts:343 | `uploadSlip` checks in-memory state, not DB |
| H-PAY-04 | useDebtAgreements.ts:410 | Agreement completion check not atomic → double notification |
| H-PAY-05 | paymentSlipStorage.ts:64 | File extension from untrusted filename |
| H-PAY-06 | Multiple | PDF detection via URL string matching — fragile |
| H-PAY-07 | TransferProofSection.tsx:127 | No guard against re-confirmation |
| H-PAY-08 | PaymentDialog.tsx:220 | Three writes non-atomic; notification sent on partial failure |
| H-PAY-09 | AgreementConfirm.tsx:216 | `agreement_text` appended from stale local state |
| H-PAY-10 | AgreementConfirm.tsx:114 | Orphaned slip in storage on failed confirmation |
| H-PAY-11 | AgreementConfirm.tsx:170 | `willBeFullyConfirmed` TOCTOU window |
| H-PAY-12 | AgreementConfirm.tsx:264 | `handleReject` no ownership filter on cancellation |
| H-PAY-13 | useDebtAgreements.ts:239 | `lender_confirmed: true` pre-set skipping legal flow |
| H-PAY-14 | CreateAgreement.tsx:723 | 15% interest cap client-side only |

### Chat System
| ID | File | Issue |
|----|------|-------|
| H-CHAT-01 | ChatRoom.tsx:66-115 | Missing auth check on chat room access |
| H-CHAT-02 | ChatRoom.tsx:103-114 | Mark-as-read no membership check |
| H-CHAT-03 | VoiceRecorder.tsx:34-46 | Voice recording memory leak on unmount |
| H-CHAT-04 | VoiceRecorder.tsx:120-129 | Timer fires after unmount / stale closure |
| H-CHAT-05 | VoiceMessagePlayer.tsx:34 | Unhandled promise rejection in `togglePlay` |
| H-CHAT-06 | VoiceMessagePlayer.tsx:21 | Signed URL not refreshed after 1h expiry |
| H-CHAT-07 | Chat.tsx:224-268 | Full refetch on every single message INSERT |
| H-CHAT-08 | Chat.tsx:217 | `fetchThreads` bound to `chatId` causes subscription churn |
| H-CHAT-09 | useChatNotificationSound.ts:13 | AudioContext never closed — OS resource leak |
| H-CHAT-10 | useChatNotificationSound.ts:22 | Oscillator nodes never disconnected |
| H-CHAT-11 | useGlobalChatNotification.ts:53 | `playNotificationSound` in deps causes resubscription |
| H-CHAT-12 | useTypingIndicator.ts:122 | SELECT then INSERT TOCTOU race |
| H-CHAT-13 | useTypingIndicator.ts:192 | Cleanup deletes wrong chat room's typing row |

### Friends & Social
| ID | File | Issue |
|----|------|-------|
| H-FRIEND-01 | useFriendRequests.ts:248 | Profiles fetched before ownership confirmed |
| H-FRIEND-02 | useFriendRequests.ts:319 | `rejectRequest` false-positive success |
| H-FRIEND-03 | useFriendRequests.ts:342 | `cancelRequest` false-positive success |
| H-FRIEND-04 | AddFriendSection.tsx:40 | Duplicate hook instances → double subscriptions |
| H-FRIEND-05 | useFriends.ts:1-74 | Dead code with plaintext phone in localStorage |
| H-FRIEND-06 | AddFriendSection.tsx:70 | QR code format validation bypassable in manual search |

### Notifications
| ID | File | Issue |
|----|------|-------|
| H-NOTIF-01 | useNotifications.ts:140 | Hardcoded channel name collision |
| H-NOTIF-02 | usePushNotifications.ts:29-42 | `checkSubscription` doesn't verify DB record |
| H-NOTIF-03 | usePushNotifications.ts:94-123 | Unsubscribe only current device |
| H-NOTIF-04 | NotificationSheet.tsx:66-68 | `isSafeInternalPath` encoded protocol bypass |
| H-NOTIF-05 | Notifications.tsx:46-54 | Navigation bypasses all redirect guards |
| H-NOTIF-06 | NotificationSheet.tsx:129-148 | `navigateToInstallment` no ownership check |

### Admin
| ID | File | Issue |
|----|------|-------|
| H-ADMIN-01 | AdminCodeLogin.tsx:33-90 | No brute-force rate limiting |
| H-ADMIN-02 | AdminLogin.tsx:415-431 | OTP lockout bypassed by Back button cycle |
| H-ADMIN-03 | AdminCodesPage.tsx:166 | Missing `requireAdmin` — Moderators access codes |
| H-ADMIN-04 | AdminSidebar.tsx:151-158 | Code-path logout doesn't clear `admin_verified` |
| H-ADMIN-05 | AdminDashboard.tsx:72-87 | Stats query fires without admin/2FA guard |
| H-ADMIN-06 | AdminUserRoles.tsx:129-178 | Role mutations don't re-check 2FA session |

### Subscription & Points
| ID | File | Issue |
|----|------|-------|
| H-SUB-01 | useSubscription.ts:94-115 | `is_trial` never reset on downgrade |
| H-SUB-02 | useSubscription.ts:199-201 | `trialDaysRemaining` off-by-one with `Math.ceil` |
| H-SUB-03 | Subscription.tsx:87 | `totalAvailable` double-source-of-truth drift |
| H-SUB-04 | record_tip RPC | No ownership guard on `p_user_id` |
| H-SUB-05 | useUserRole.ts:26-29 | Roles fully client-controllable |
| H-POINTS-01 | useUserPoints.ts:165-178 | Daily reset non-atomic + Bangkok/UTC drift |
| H-POINTS-02 | useUserPoints.ts:63-122 | Badge progress stale closure downgrades tiers |
| H-POINTS-03 | useRateLimiter.ts:24 | Module-level store persists across user sessions |
| H-POINTS-04 | useRateLimiter.ts:119-143 | Block timer interval leaks on unmount |

### Profile & Settings
| ID | File | Issue |
|----|------|-------|
| H-PROFILE-01 | ProfileBankAccount.tsx:96-105 | Mass-updates ALL open agreements at once |
| H-PROFILE-02 | ProfileBankAccount.tsx:108-110 | Blocks new users with no agreements |
| H-PROFILE-03 | AvatarUpload.tsx:40-41 | Extension from untrusted filename |
| H-PROFILE-04 | Profile.tsx:118-126 | Unscoped realtime subscription on debt_agreements |

### Domain Logic
| ID | File | Issue |
|----|------|-------|
| H-DOMAIN-01 | calculateRemainingAmount.ts:16 | Includes 'rescheduled' installments in remaining balance |
| H-DOMAIN-02 | calculateRemainingAmount.ts:53 | No guard on undefined `principal_portion` |
| H-DOMAIN-03 | getNextInstallment.ts:71 | String comparison for dates (not parsed) |
| H-DOMAIN-04 | getAgreementDisplayStatus.ts:42-43 | Returns 'paid' for active agreement → split-brain |
| H-DOMAIN-05 | mapAgreementToDebtCard.ts:116 | Overdue items excluded after 7 days |

### Edge Functions
| ID | File | Issue |
|----|------|-------|
| H-EDGE-01 | All cron functions | `constantTimeEquals` leaks secret length |
| H-EDGE-02 | All cron functions | Internal secret via `Authorization: Bearer` header |
| H-EDGE-03 | send-chat-push-notification | Direct-chat path missing friendship check |
| H-EDGE-04 | send-chat-push-notification | `senderName` injected without sanitization |
| H-EDGE-05 | payment-reminder-cron | Hardcoded `+07:00` offset — fragile |
| H-EDGE-06 | notify-unconfirmed-transfers | Sliding deduplication window → notification spam |

### Utilities
| ID | File | Issue |
|----|------|-------|
| H-UTIL-01 | pdfExport.ts:275-283 | PDF confirmation timestamps use `updated_at` |
| H-UTIL-02 | debtStrategies.ts:29 | Daily frequency uses hardcoded 30 days/month |
| H-UTIL-03 | pdfExport.ts:335-357 | Double page-break in installment table |
| H-UTIL-04 | pdfExport.ts:136-155 | `addWrappedText` no page-break guard |
| H-UTIL-05 | pdfExport.ts:199-225 | `drawPartyCard` overflows page footer |
| H-UTIL-06 | deviceInfo.ts:52-68 | `getClientIP` leaks IP to third-party (PDPA risk) |

### Context & Theme
| ID | File | Issue |
|----|------|-------|
| H-CTX-01 | ThemeContext.tsx:167-170 | Theme flicker on page load (FOUC) |
| H-CTX-02 | ThemeContext.tsx:172-178 | Profile theme overwrites explicit user choice |
| H-CTX-03 | ThemeContext.tsx:197 | `disableTransitionOnChange={false}` causes flash |
| H-CTX-04 | PWAInstallPrompt.tsx:68 | Permanently suppresses install prompt after 1 dismiss |
| H-CTX-05 | PWAInstallPrompt.tsx:19-23 | iOS standalone detection broken |
| H-CTX-06 | debtStrategies.ts:96 | Interest rate treated as APR/12 for all frequencies |
| H-CTX-07 | LanguageContext.tsx:1008-1022 | Double localStorage write on language change |

---

## MEDIUM Bugs

> (~100 bugs) — Abbreviated for readability. Full details available from each agent's output.

### Key Medium Issues:
- **M-PAY-01:** `getUnpaidPrincipalInstallments` sorts descending — accounting mismatch with preview
- **M-PAY-02:** `recalculateRemainingEffectiveInstallments` doesn't check Promise.all errors
- **M-PAY-03:** `updateInstallmentStatus` allows status regression (paid→pending)
- **M-PAY-04:** Signed URL cached forever (10min expiry)
- **M-PAY-05:** Lender `isLender` prop is purely client-supplied
- **M-CHAT-01:** XSS risk if message rendering ever switches to dangerouslySetInnerHTML
- **M-CHAT-02:** `console.log` leaks user IDs and message IDs in production
- **M-CHAT-03:** No cancel guard on `fetchMessages` — stale state on thread switching
- **M-NOTIF-01:** Realtime DELETE relies on `payload.old` — needs REPLICA IDENTITY FULL
- **M-NOTIF-02:** Duplicate `useNotifications` instances (5 components)
- **M-NOTIF-03:** `markAllAsRead` no rollback on failure
- **M-SUB-01:** `canCreateFree` defaults to `true` on fetch failure (fail-open)
- **M-SUB-02:** `freeRemaining` defaults to 2 on failure
- **M-SUB-03:** Trial badge condition is dead code (`isTrial && isPremium`)
- **M-SUB-04:** `hasUsedTrial` incorrectly flags paid subscribers
- **M-DOMAIN-01:** Zero-interest last-installment rounding not documented
- **M-DOMAIN-02:** `getPeriodsPerYear` default 12 blocks exhaustiveness check
- **M-DOMAIN-03:** `needsUserConfirmation` accepts untrusted `isLender` param
- **M-ADMIN-01:** `fetchLogs` sessionStorage check not reactive
- **M-ADMIN-02:** Raw metadata JSON rendered in audit logs
- **M-ADMIN-03:** AdminDashboard no independent session verification
- **M-UTIL-01:** `roundMoney` uses Number.EPSILON — insufficient for edge cases
- **M-UTIL-02:** `moneyEquals` float subtraction at tolerance boundary
- **M-UTIL-03:** PromptPay phone validation rejects `07x` numbers
- **M-UTIL-04:** `buildPaymentSlipPath` no path traversal sanitization
- **M-UTIL-05:** `captureException` fire-and-forget — errors silently lost
- **M-PROFILE-01:** EditProfileDialog missing phone validation
- **M-PROFILE-02:** Bank account fields unbounded free-text
- **M-PROFILE-03:** Privacy settings localStorage-only — no server effect
- **M-PROFILE-04:** Old avatar deleted before new upload succeeds
- **M-PROFILE-05:** OAuth "confirmation" is trivially guessable static word
- **M-CTX-01:** No browser language auto-detection
- **M-CTX-02:** ThemePicker hardcoded Thai (no i18n)
- **M-CTX-03:** Help/Support/Terms/Privacy — no i18n
- **M-CTX-04:** LanguageSelector no outside-click dismiss
- **M-CTX-05:** DebtConsolidation frequency labels hardcoded Thai
- **M-HOME-01:** PendingActionsCard realtime not scoped to user
- **M-HOME-02:** PDPAConsent shows form when profile is null
- **M-HOME-03:** PDPA/Terms reference "OnMe" instead of "Bud Over Bills"
- **M-HOME-04:** PersonalInfoOnboarding no row existence check
- **M-EDGE-01:** `payment-reminder-cron` `related_id` type mismatch (string in UUID column)
- **M-EDGE-02:** `send-chat-push-notification` deprecated `serve` import
- **M-EDGE-03:** `parseJsonBody` is a no-op identity function
- **M-SEARCH-01:** `useSearch` ignores Supabase query errors
- **M-SEARCH-02:** Types declare `id: string | null` but cast suppresses it

---

## LOW Bugs

> (~50 bugs) — Key items:

- `navigate(-1)` on Auth can exit the app in PWA mode
- `displayName` no validation — XSS/layout break vector
- Global `retry: 2` retries 401s
- `useFriends.ts` uses `Date.now()` as ID — collision risk
- `SearchDialog` query state not cleared on close
- `Friends.tsx` shows total count not filtered count
- `formatMaskedPhone` exposes 7 of 10 digits
- DebtCard avatar `<img>` no `onError` fallback
- History export button is a stub with no indication
- `mapToCompletedAgreements` epoch sentinel produces 1970 date
- `simulate()` terminates at 600 months with no signal
- `crc16` doesn't handle multi-byte characters
- Test fixtures have inconsistent interest_rate vs total_amount
- Notification list no `aria-live` region
- `AppErrorBoundary` hasError never resets on navigation
- `lovable-tagger` included in `build:dev` production artifacts
- Settings notification toggles have no backend effect

---

## Cross-Cutting Concerns

### 1. Non-Atomic Multi-Step Writes (Systemic)
Nearly every mutation flow (agreement creation, payment confirmation, friend acceptance, reschedule approval, point earn/redeem, extra payment) uses sequential independent Supabase calls with no transaction. **This is the #1 systemic risk.**

### 2. Client-Side-Only Authorization (Systemic)
Role checks, ownership checks, and rate limiting exist only in React hooks/components. Server-side RLS/RPC enforcement is incomplete or absent for many critical operations.

### 3. Unscoped Realtime Subscriptions (Systemic)
Multiple components subscribe to entire tables (`messages`, `installments`, `debt_agreements`) with no row-level filter, causing O(users × events) database load.

### 4. Hardcoded Channel Names (Systemic)
Static realtime channel names cause cross-instance collisions when multiple hook instances exist or multiple tabs are open.

### 5. Stale Closure / Race Conditions in Hooks (Systemic)
Multiple hooks capture values via `useCallback`/`useEffect` closures that go stale between renders, especially during auth state changes.

### 6. i18n Incomplete (Systemic)
Several pages (Help, Support, Terms, Privacy, ThemePicker, DebtConsolidation) have hardcoded Thai strings despite the app supporting 10 languages.
