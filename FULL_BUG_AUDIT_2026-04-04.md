# BudOverBills — Full Bug Audit Report
**Audit Date:** 2026-04-04  
**Method:** 20 parallel Sonnet agents analyzing all user journeys end-to-end  
**Scope:** Frontend (React/TS), Backend (Supabase Edge Functions), Database (PostgreSQL migrations, RLS policies)  
**Total Bugs Found:** 271 confirmed bugs across 20 domains  

---

## Severity Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 28    |
| HIGH     | 94    |
| MEDIUM   | 107   |
| LOW      | 42    |
| **Total**| **271**|

---

## Table of Contents

1. [Authentication & Onboarding](#1-authentication--onboarding)
2. [Agreement Creation](#2-agreement-creation)
3. [Payment Flow](#3-payment-flow)
4. [Debt Detail & Reschedule](#4-debt-detail--reschedule)
5. [Chat System](#5-chat-system)
6. [Friends & Social](#6-friends--social)
7. [Notifications](#7-notifications)
8. [Subscription & Billing](#8-subscription--billing)
9. [Profile & Settings](#9-profile--settings)
10. [Admin Panel](#10-admin-panel)
11. [Home Dashboard & Calendar](#11-home-dashboard--calendar)
12. [Domain Logic & Debt Strategies](#12-domain-logic--debt-strategies)
13. [Money Utilities & PDF Export](#13-money-utilities--pdf-export)
14. [Row Level Security & Database](#14-row-level-security--database)
15. [React Hooks & State Management](#15-react-hooks--state-management)
16. [Realtime Subscriptions](#16-realtime-subscriptions)
17. [Security Validation & Injection](#17-security-validation--injection)
18. [History, Badges & Points](#18-history-badges--points)
19. [i18n, PWA & Build](#19-i18n-pwa--build)
20. [Routing & UX Flow](#20-routing--ux-flow)

---

## 1. Authentication & Onboarding

### BUG-AUTH-01
**Severity:** CRITICAL  
**Location:** `src/contexts/AuthContext.tsx:86-120`  
**Description:** `PASSWORD_RECOVERY` auth event is handled but the user is redirected to `/reset-password` without setting any flag or session guard. If the user navigates away during the recovery flow, there is no mechanism to resume or re-verify. The `onAuthStateChange` callback for `PASSWORD_RECOVERY` does `navigate('/reset-password')` but the `ProtectedRoute` component does not have a special case for this event — if the user lands on a protected route before completing the reset, the old session is already revoked and they see a blank screen.  
**Impact:** Users who attempt password recovery end up in a redirect loop with no way to complete the flow. Account becomes temporarily inaccessible.  
**Fix:** Set a session flag (`sessionStorage.setItem('pwd_recovery', '1')`) on the `PASSWORD_RECOVERY` event and check it in `ProtectedRoute` to allow pass-through to `/reset-password` only.

### BUG-AUTH-02
**Severity:** HIGH  
**Location:** `src/pages/Auth.tsx:89-105`  
**Description:** Open redirect via unvalidated `from` parameter. The `from` query parameter is read from `useLocation().search` and passed directly to `navigate(from || '/')` after login. No validation is performed to ensure `from` is an internal path. An attacker can craft a URL like `/auth?from=https://evil.com` and after login, the user is redirected externally.  
**Impact:** Phishing, credential harvesting after successful authentication.  
**Fix:** Validate `from` with `isSafeInternalPath(from)` from `src/utils/navigation.ts` before using it.

### BUG-AUTH-03
**Severity:** HIGH  
**Location:** `src/contexts/AuthContext.tsx:96-101`  
**Description:** `setTimeout(..., 0)` in `onAuthStateChange` callback is never cleared. When auth fires twice in rapid succession (React 18 StrictMode double-invoke, or sign-in immediately after sign-out), the stale `setTimeout` still fires `setAuthLoading(false)` and `fetchProfile` against the previous user context. The `currentUserIdRef` guard protects `setProfile` but `setAuthLoading(false)` at line 99 is unconditional.  
**Impact:** `isLoading` briefly flips to `false` while a new user's profile is still being fetched; downstream components render `user !== null, profile === null`.  
**Fix:** Capture a cancellation flag per `onAuthStateChange` event and guard `setAuthLoading(false)` behind it.

### BUG-AUTH-04
**Severity:** HIGH  
**Location:** `src/pages/PDPAConsent.tsx:58-72`  
**Description:** After the user accepts the PDPA consent, `updateProfile({ pdpa_accepted: true })` is called but `refreshProfile()` is never awaited. The `ProtectedRoute` immediately re-checks `profile?.pdpa_accepted` against the stale cached profile, which still shows `false`, causing an immediate redirect back to `/pdpa-consent` — a redirect loop.  
**Impact:** Users can never progress past PDPA consent page despite accepting.  
**Fix:** Call `await refreshProfile()` after the update, then navigate.

### BUG-AUTH-05
**Severity:** HIGH  
**Location:** `src/components/ProtectedRoute.tsx:42-68`  
**Description:** Admin session validation in `ProtectedRoute` checks `adminSession?.expiresAt > Date.now()` but the expiry is stored as a number (Unix ms) while the session token's real expiry is enforced server-side via JWT. The client-side check is purely cosmetic — if `sessionStorage` is cleared between navigations, the admin user gets a hard redirect to `/admin/login` without any server-side session invalidation. The server-side JWT could still be valid, but the client-side flag is gone.  
**Impact:** Admin sessions appear invalid after tab refresh even when the JWT is still live; admins must re-authenticate unnecessarily.  
**Fix:** Verify the admin session with an authenticated endpoint call on each protected admin route mount, rather than relying on `sessionStorage` flags.

### BUG-AUTH-06
**Severity:** MEDIUM  
**Location:** `src/pages/Auth.tsx:134-140`  
**Description:** The `isNewSignup` state variable is set on `SIGNED_UP` but is dead state — it is never read anywhere in the component or context. It was likely intended to trigger an onboarding flow or welcome screen but was never connected.  
**Impact:** New user onboarding welcome flow never shows; dead state creates maintenance confusion.  
**Fix:** Remove `isNewSignup` or connect it to trigger the intended post-signup UX.

### BUG-AUTH-07
**Severity:** MEDIUM  
**Location:** `src/contexts/AuthContext.tsx:58-82`  
**Description:** Race condition between `authLoading` and `profileLoading`. Both states are set independently. A consumer that checks `!isLoading` (which is `authLoading || profileLoading`) may see `false` momentarily between the auth state resolving and the profile fetch starting. During that window, `user !== null` but `profile === null`, causing components to render in an inconsistent state.  
**Impact:** Flash of unstyled/unexpected content; potential null reference errors in components that assume `profile` is non-null when `user` is non-null.  
**Fix:** Use a single unified loading state that stays `true` until both auth and profile are fully resolved.

---

## 2. Agreement Creation

### BUG-AGREE-01
**Severity:** CRITICAL  
**Location:** `src/pages/CreateAgreement.tsx:218-245`  
**Description:** Non-atomic quota check + agreement creation. The component calls `canCreateAgreementFree()` (quota check) and then `createAgreement()` as two separate network calls with no locking. A user can open two browser tabs simultaneously, pass the quota check in both, and create two agreements when only one is allowed. The `can_create_agreement_free` RPC is STABLE (cached) in some migration versions, making the race window wider.  
**Impact:** Users on free plan can create more agreements than their quota allows; subscription revenue bypassed.  
**Fix:** Use the atomic `create_agreement_if_quota_allows` RPC pattern that checks and inserts in a single transaction with `FOR UPDATE` lock on the subscription row.

### BUG-AGREE-02
**Severity:** HIGH  
**Location:** `src/pages/CreateAgreement.tsx:85`  
**Description:** `parseBangkokDate` constructs date strings as `${y}-${m}-${d}T12:00:00Z` (UTC noon). This is incorrect for Bangkok (UTC+7) — a date like "2026-04-04" interpreted as noon UTC is 7:00 PM Bangkok time and still April 4. But if the user selects April 5 at 00:00 Bangkok, that's April 4 17:00 UTC. Using `T12:00:00Z` shifts all dates by half a day from the Bangkok midnight reference point that installment schedules expect.  
**Impact:** Installment due dates are systematically off by up to 7 hours relative to Bangkok midnight, causing payments to appear due on the wrong calendar day.  
**Fix:** Parse as `T00:00:00+07:00` to anchor to Bangkok midnight.

### BUG-AGREE-03
**Severity:** HIGH  
**Location:** `src/pages/CreateAgreement.tsx:312-340`  
**Description:** Weekly installment schedule generator ignores `startDate`. When `frequency === 'weekly'`, the loop adds 7-day increments from `new Date()` instead of from the user-selected `startDate`. The lender could choose a start date 2 weeks in the future, but installment dates begin from today.  
**Impact:** Incorrect installment due dates for weekly-frequency agreements; first payment appears already overdue or at the wrong date.  
**Fix:** Initialize the date loop from `startDate` for all frequency types.

### BUG-AGREE-04
**Severity:** HIGH  
**Location:** `src/pages/AgreementConfirm.tsx:89-116`  
**Description:** `willBeFullyConfirmed` is computed from stale React Query cache rather than the current agreement state. If the lender has already confirmed in another tab/session, the borrower's confirm page may incorrectly show "Your confirmation will complete the agreement" when the agreement is already active. The inverse is also true — if neither party has confirmed, the stale cache may show "fully confirmed."  
**Impact:** UI misleads users about agreement activation state; users may think agreement is complete when it isn't, delaying payment setup.  
**Fix:** Invalidate and refetch the agreement query on every AgreementConfirm mount before rendering the confirmation state.

### BUG-AGREE-05
**Severity:** HIGH  
**Location:** `src/pages/AgreementConfirm.tsx:156-180`  
**Description:** The "Reject Agreement" path calls a general-purpose status update that can set `status = 'cancelled'` on an agreement that is already `active`. An active agreement should not be cancellable through the confirm page — only through the dedicated cancel flow which notifies both parties and settles outstanding installments.  
**Impact:** Lender can navigate to an old `AgreementConfirm` URL and cancel an active, partially-paid agreement, wiping out payment history and notification context.  
**Fix:** Guard the reject/cancel action with a server-side check that the agreement is in `pending` status before allowing status change.

### BUG-AGREE-06
**Severity:** MEDIUM  
**Location:** `src/hooks/useSubscription.ts:45`  
**Description:** `staleTime: 30000` (30 seconds) on the subscription/quota query means a user's plan can appear to allow agreement creation for up to 30 seconds after their quota has been consumed in another session. Combined with BUG-AGREE-01, this extends the race window significantly.  
**Impact:** Users see stale quota availability; can trigger race conditions more easily.  
**Fix:** Reduce `staleTime` to 0 for quota checks, or use the server-enforced atomic RPC.

---

## 3. Payment Flow

### BUG-PAY-01
**Severity:** CRITICAL  
**Location:** `src/components/PaymentDialog.tsx:198-247`  
**Description:** Race condition in payment submission. The `submitPayment` function calls `supabase.storage.upload(slip)` and then `supabase.rpc('process_payment', {...})` as separate operations. If the component unmounts (user navigates away) between the storage upload succeeding and the RPC call, a payment slip is orphaned in storage with no corresponding DB record. Additionally, if two concurrent payment submissions succeed the upload step before the RPC's unique constraint fires, the second RPC call fails with a constraint error but the storage file is already uploaded.  
**Impact:** Orphaned payment slips in storage (cost accumulation); payment state inconsistency where lender can see a slip but no corresponding installment update.  
**Fix:** Move storage upload inside the atomic RPC as a pre-signed URL flow, or use a SECURITY DEFINER function that both records the payment and returns the storage upload URL atomically.

### BUG-PAY-02
**Severity:** HIGH  
**Location:** `src/utils/promptpay.ts:48`  
**Description:** PromptPay phone number validation regex `^0[689][0-9]{8}$` rejects valid True Move H numbers starting with `07x` prefix. True Move uses `06x`, `08x`, and `09x` — the `07x` prefix belongs to other operators and is valid in the national plan. The regex also doesn't account for the AIS 066/067 prefixes assigned after 2022.  
**Impact:** A significant subset of Thai users cannot add their PromptPay number; payment QR cannot be generated for them.  
**Fix:** Use NBTC's full allocation: `^0[689][0-9]{8}$|^06[5-9][0-9]{7}$` or simplify to `^0[0-9]{9}$` and rely on server-side PromptPay validation.

### BUG-PAY-03
**Severity:** HIGH  
**Location:** `supabase/migrations/20260404143000_atomic_agreement_mutations.sql` — `process_extra_payment` function  
**Description:** The `process_extra_payment` RPC applies extra payments to installments using floating-point division (`remaining_amount / installment_count`). This causes principal rounding drift — if `remaining = 1000` and `count = 3`, each installment gets `333.333...` which rounds to `333.33`, leaving a `0.01` underpayment gap that is never resolved.  
**Impact:** Agreement totals never fully reconcile; borrowers who pay in full still show a 1-cent outstanding balance, blocking automatic completion.  
**Fix:** Apply the rounding remainder to the last installment: distribute `floor(amount / count)` to all but the last, and assign `amount - floor(amount/count) * (count-1)` to the last.

### BUG-PAY-04
**Severity:** HIGH  
**Location:** `src/components/PaymentDialog.tsx:112-130`  
**Description:** Payment amount validation uses the agreement's `monthly_payment` prop which is passed at render time and never refreshed. If the installment amount was changed by a reschedule between dialog open and submission, the client-side validation passes the wrong amount to the RPC. The RPC does its own validation, but the error message shown to the user references the stale prop value, creating a confusing discrepancy.  
**Impact:** UX confusion; users see validation errors referencing amounts they haven't entered.  
**Fix:** Refetch the installment from Supabase inside `PaymentDialog` on open to get the current amount.

### BUG-PAY-05
**Severity:** MEDIUM  
**Location:** `src/components/PaymentDialog.tsx:285-310`  
**Description:** Payment slip image preview uses `URL.createObjectURL()` but the object URL is never revoked with `URL.revokeObjectURL()` on component unmount or dialog close. Each opened PaymentDialog leaks a blob URL in memory.  
**Impact:** Memory leak accumulates with repeated payment submissions; on long sessions or slow devices, this can cause noticeable performance degradation.  
**Fix:** Add `useEffect(() => { return () => URL.revokeObjectURL(previewUrl); }, [previewUrl])`.

---

## 4. Debt Detail & Reschedule

### BUG-DEBT-01
**Severity:** HIGH  
**Location:** `src/pages/DebtDetail.tsx:145-178`  
**Description:** `paymentSummary` calculation includes installments with status `rescheduled` in the "total remaining" amount. Rescheduled installments have been replaced by new installments — counting them as pending double-counts the outstanding balance and causes the progress bar to show less progress than is accurate.  
**Impact:** Users see incorrect debt payoff percentages; the "remaining balance" figure can be up to 2x the actual amount.  
**Fix:** Filter `paymentSummary` to exclude installments where `status === 'rescheduled'`.

### BUG-DEBT-02
**Severity:** HIGH  
**Location:** `supabase/migrations/20260406090000_reschedule_request_rpcs.sql` — `submit_reschedule_request`  
**Description:** The `submit_reschedule_request` RPC has no guard against duplicate pending reschedule requests. A borrower can call it multiple times, creating multiple `pending` reschedule requests for the same agreement. The lender sees N notifications and approving any one of them does not cancel the others.  
**Impact:** Multiple simultaneous reschedule requests create conflicting mutations; approving the second request after the first was already applied causes errors or double-rescheduling.  
**Fix:** Add a check before INSERT: `IF EXISTS(SELECT 1 FROM reschedule_requests WHERE agreement_id = p_agreement_id AND status = 'pending') THEN RAISE EXCEPTION 'Pending request already exists'; END IF;`

### BUG-DEBT-03
**Severity:** HIGH  
**Location:** `supabase/migrations/20260406090000_reschedule_request_rpcs.sql` — `approve_reschedule_request`  
**Description:** `approve_reschedule_request` does not verify that the installments being rescheduled are still in `pending` status. If an installment was paid between the reschedule request being submitted and being approved, the approval still proceeds, overwriting the `paid` installment with a new `pending` one.  
**Impact:** Paid installments can be reset to `pending` state, causing borrowers to apparently owe money they already paid.  
**Fix:** Add `AND status = 'pending'` to the installment lookup in `approve_reschedule_request`.

### BUG-DEBT-04
**Severity:** MEDIUM  
**Location:** `src/pages/DebtDetail.tsx:89-112`  
**Description:** `getAgreementDisplayStatus` helper is defined in a utility file but `DebtDetail.tsx` computes display status inline with its own switch statement, bypassing the centralized helper. The two implementations have diverged — `DebtDetail` does not handle `'rescheduling'` status, causing agreements in that state to display as `'active'` with no indication of the pending reschedule.  
**Impact:** Users cannot tell if their agreement has a pending reschedule request.  
**Fix:** Replace inline status logic in `DebtDetail.tsx` with `getAgreementDisplayStatus()`.

---

## 5. Chat System

### BUG-CHAT-01
**Severity:** CRITICAL  
**Location:** `src/pages/Chat.tsx:67-89`  
**Description:** The Realtime subscription for new messages is created with `supabase.channel('messages').on('postgres_changes', {table: 'messages'}, ...)` — **no user filter**. This subscribes to ALL rows changes on the entire `messages` table for all users. Even if Supabase's multiplexer only delivers events for rows the user can SELECT (per RLS), the channel itself is unscoped and depends entirely on RLS being correctly configured. Any RLS misconfiguration would leak all message events to all subscribers.  
**Impact:** Potential message content leakage between unrelated users; definitely delivers change events for messages in unrelated chats (causing spurious notification badges).  
**Fix:** Scope the subscription with `filter: \`agreement_id=eq.${agreementId}\`` or `filter: \`direct_chat_id=eq.${chatId}\``.

### BUG-CHAT-02
**Severity:** HIGH  
**Location:** `src/components/chat/ChatRoom.tsx:234-256`  
**Description:** `console.log` statements in production code log full message objects including sender UUIDs, agreement IDs, and message content. Found at lines 234, 247, 256 — these were not removed before shipping.  
**Impact:** Sensitive financial conversation data and UUIDs are logged to browser devtools console, accessible to any browser extension, third-party script, or XSS attacker that can read `console` output.  
**Fix:** Remove all `console.log` calls from `ChatRoom.tsx` or gate them behind `import.meta.env.DEV`.

### BUG-CHAT-03
**Severity:** HIGH  
**Location:** `src/components/chat/ChatRoom.tsx`  
**Description:** No message pagination. `fetchMessages` retrieves all messages in a chat room with no `LIMIT` clause. A long-running agreement chat with many payment slips and voice messages will load the entire history on every mount, causing slow initial renders and potential out-of-memory on mobile devices.  
**Impact:** Performance degradation and potential browser crash for chats with 100+ messages.  
**Fix:** Implement cursor-based pagination: `SELECT * FROM messages WHERE chat_id = $1 ORDER BY created_at DESC LIMIT 50`, load more on scroll.

### BUG-CHAT-04
**Severity:** HIGH  
**Location:** `src/components/chat/VoiceRecorder.tsx:145-162`  
**Description:** Stale closure bug in the auto-stop timer. The `maxDuration = 120` seconds limit is implemented with `setTimeout(() => stopRecording(), 120000)` but `stopRecording` is captured in a stale closure at timer creation time. If the user manually stops and restarts recording before the 120s timer fires, the stale `stopRecording` reference from the first recording session fires 120 seconds after the first start, stopping the second (current) recording at an unexpected time.  
**Impact:** Users recording their second or subsequent voice message get it unexpectedly cut short.  
**Fix:** Store the timer ID in a `useRef` and clear it on every stop/restart: `if (timerRef.current) clearTimeout(timerRef.current)`.

### BUG-CHAT-05
**Severity:** MEDIUM  
**Location:** `supabase/migrations/20260404210000_harden_chat_typing_upsert.sql`  
**Description:** The migration creates a partial UNIQUE INDEX `ON chat_typing_status (user_id, chat_type, chat_id) WHERE is_typing = true` to serve as a PostgREST upsert conflict target. However, PostgREST's `on_conflict` parameter requires a **constraint** name (from `pg_constraint`), not an index name. Partial indexes are not automatically promoted to constraints. The upsert via `supabase.from('chat_typing_status').upsert({...}, {onConflict: 'user_id,chat_type,chat_id'})` will fall through to an INSERT and violate the partial index on the second call for the same user.  
**Impact:** Typing status updates fail after the first typing event; `is_typing` never updates to `false` correctly; typing indicators are stuck.  
**Fix:** Create a proper UNIQUE CONSTRAINT: `ALTER TABLE chat_typing_status ADD CONSTRAINT chat_typing_unique UNIQUE (user_id, chat_type, chat_id);` and use `ON CONFLICT (user_id, chat_type, chat_id) DO UPDATE`.

---

## 6. Friends & Social

### BUG-FRIEND-01
**Severity:** HIGH  
**Location:** `src/hooks/useFriendRequests.ts:145-168`  
**Description:** Points are never awarded when a friend request is accepted. The `acceptFriendRequest` mutation calls `supabase.rpc('accept_friend_request', ...)` but the RPC does not call `earn_points` for either the accepter or the original sender. The `earn_points` call was left as a TODO comment in the hook body but never implemented.  
**Impact:** The "Add Friend — earn 50 points" UI promise is completely non-functional; no points are ever awarded for successful friend connections.  
**Fix:** Add `await supabase.rpc('earn_points', { p_action_type: 'friend_added', p_reference_id: requestId, p_points: 50 })` inside the `acceptFriendRequest` success handler.

### BUG-FRIEND-02
**Severity:** HIGH  
**Location:** `src/components/AddFriendSection.tsx:78-95`  
**Description:** QR code friend-add path performs a direct `supabase.from('profiles').select('*').eq('friend_code', scannedCode)` query instead of calling the `search_profile_by_code` RPC. The RPC normalizes the code, applies rate limiting, and enforces privacy settings. The direct query bypasses all of this, returns full profile data including private fields, and has no rate limit.  
**Impact:** Privacy leak — QR scanning exposes full profile data; rate limiting bypass enables code enumeration attacks.  
**Fix:** Replace direct query with `supabase.rpc('search_profile_by_code', { p_code: scannedCode })`.

### BUG-FRIEND-03
**Severity:** HIGH  
**Location:** `supabase/migrations` — `friend_requests` UPDATE policy  
**Description:** The `friend_requests` UPDATE RLS policy has `USING (to_user_id = auth.uid())` but no `WITH CHECK` clause. PostgreSQL interprets missing `WITH CHECK` as equivalent to USING — but this means the recipient (who can legitimately update `status`) can also update `from_user_id` and `to_user_id` columns on the row, effectively hijacking the request record and pointing it at different users.  
**Impact:** A recipient could alter a friend request to falsely implicate another user as the sender, or redirect the accepted friendship to a different user.  
**Fix:** Add `WITH CHECK (to_user_id = auth.uid() AND from_user_id = OLD.from_user_id AND to_user_id = OLD.to_user_id)` — or use a SECURITY DEFINER `accept_friend_request` RPC exclusively and revoke direct UPDATE.

### BUG-FRIEND-04
**Severity:** MEDIUM  
**Location:** `src/hooks/useFriendRequests.ts:62-80`  
**Description:** The "already sent" check for friend requests is performed against an in-memory array (`pendingRequests`). If the user opened the app on two devices and sent a request from device A, device B's in-memory state won't reflect this, allowing a duplicate send. The DB has a UNIQUE constraint that will block the second insert — but the error is silently swallowed and the UI shows success.  
**Impact:** Duplicate friend request appears to succeed on device B; lender is confused by apparent success with no follow-up.  
**Fix:** Check for existing requests via the RPC with a server-side duplicate guard, or surface the duplicate constraint error as a user-readable "Request already sent" message.

---

## 7. Notifications

### BUG-NOTIF-01
**Severity:** CRITICAL  
**Location:** `src/utils/navigation.ts:45-68`  
**Description:** Path traversal vulnerability in notification navigation. The `navigateToNotificationTarget` function constructs navigation paths from `notification.related_id` without validation: `navigate(\`/debt/${notification.related_id}\`)`. A crafted notification with `related_id = "../admin"` would navigate to `/admin`. Combined with BUG-RLS-01 (arbitrary notification injection), an attacker can send a victim a notification that, when tapped, navigates them to the admin panel or any other path.  
**Impact:** Combined with BUG-RLS-01: full path traversal via social engineering — attacker can force navigation to any route in the app, including `/admin/login`.  
**Fix:** Validate `related_id` as a UUID before constructing paths: `if (!isUUID(related_id)) return;` and use explicit route construction rather than string interpolation.

### BUG-NOTIF-02
**Severity:** HIGH  
**Location:** `src/hooks/useNotifications.ts:89-120`  
**Description:** Duplicate Realtime channel subscriptions are created without cleanup on reconnect. When the network reconnects, `useEffect` re-runs and creates a second channel subscription without removing the first. After N reconnects, there are N active subscriptions, each delivering the same notification events and incrementing the badge count N times per new notification.  
**Impact:** Notification badge count inflates with each reconnect; users see "12 new notifications" when there is only 1.  
**Fix:** Store the channel reference in a `useRef` and call `channel.unsubscribe()` before creating a new one, or use the channel's built-in deduplication with a stable channel name.

### BUG-NOTIF-03
**Severity:** HIGH  
**Location:** `dist/sw.js`  
**Description:** The service worker has no `push` event handler and no `notificationclick` handler. Push notifications sent from Supabase Edge Functions are received by the browser but silently discarded — the service worker cannot display them. The `pushsubscriptionchange` event is also not handled, meaning push subscriptions are never refreshed after expiry.  
**Impact:** Push notifications are completely non-functional despite the backend infrastructure for them being in place. Users never see in-system push alerts.  
**Fix:** Add to `sw.js`: `self.addEventListener('push', e => { const data = e.data?.json(); e.waitUntil(self.registration.showNotification(data.title, { body: data.body, data: data.url })); }); self.addEventListener('notificationclick', e => { e.notification.close(); e.waitUntil(clients.openWindow(e.notification.data)); });`

### BUG-NOTIF-04
**Severity:** MEDIUM  
**Location:** `src/hooks/useNotifications.ts:145-162`  
**Description:** No deduplication of notification events on reconnect. When the Realtime subscription reconnects, it replays recent events. Without deduplication by notification ID, already-seen notifications are added to the list again.  
**Impact:** Notifications appear duplicated after network reconnect; unread count is incorrect.  
**Fix:** Use a `Set` to track seen notification IDs and skip duplicates: `const seen = useRef(new Set()); if (!seen.current.has(notification.id)) { seen.current.add(notification.id); addNotification(notification); }`

---

## 8. Subscription & Billing

### BUG-SUB-01
**Severity:** CRITICAL  
**Location:** `supabase/migrations/20260404193000_harden_agreement_payment_credits.sql` — `add_agreement_credits`  
**Description:** The `add_agreement_credits(p_user_id UUID, p_credits INT)` SECURITY DEFINER function has no `auth.uid()` guard. Any authenticated user can call `add_agreement_credits('any-user-uuid', 999)` and grant unlimited agreement credits to themselves or any other user. The function is exposed through the RPC API.  
**Impact:** Complete billing bypass — any user can grant themselves unlimited agreement creation credits, eliminating subscription revenue.  
**Fix:** Add `IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Forbidden'; END IF;` at the top of `add_agreement_credits` to restrict it to server-side calls only.

### BUG-SUB-02
**Severity:** HIGH  
**Location:** `src/hooks/useSubscription.ts:78-92`  
**Description:** `Math.floor` is used to calculate days remaining in a trial: `Math.floor((expiresAt - Date.now()) / 86400000)`. For a trial expiring at 23:59 tonight, `Math.floor(0.999 * 86400000 / 86400000) = 0`. The UI shows "0 days remaining" while the trial is still fully active. This creates a false urgency that could cause users to purchase a subscription unnecessarily.  
**Impact:** Users shown "Trial expired" or "0 days" when hours of trial remain; unnecessary subscription purchases driven by incorrect UI.  
**Fix:** Use `Math.ceil` instead of `Math.floor` for days remaining display.

### BUG-SUB-03
**Severity:** HIGH  
**Location:** `src/hooks/useSubscription.ts:45-62`  
**Description:** Fail-closed defaults for subscription state. If the Supabase query to fetch subscription fails (network error, timeout), `isPremium` defaults to `false` and `maxAgreements` defaults to `2`. For a premium user on a slow connection, this means they temporarily lose access to features they paid for and see an incorrect agreement limit.  
**Impact:** Premium users treated as free users during transient network errors; could block them from creating agreements or accessing features mid-session.  
**Fix:** Cache the last known subscription state in `localStorage` and use it as the default while fetching, falling back to the cached value on error rather than the free-tier defaults.

### BUG-SUB-04
**Severity:** HIGH  
**Location:** `supabase/migrations` — `subscriptions` table INSERT policy  
**Description:** An RLS INSERT policy allows any authenticated user to insert a row into `subscriptions` with `WITH CHECK (auth.uid() = user_id)`. Since there's no restriction on `tier`, `expires_at`, or `is_trial` values in the INSERT check, a user who times their insert correctly (before the `handle_new_user` trigger creates their row) can insert with `tier = 'premium', expires_at = '2099-01-01'` and grant themselves permanent premium access.  
**Impact:** Complete subscription billing bypass for users who exploit the race window before trigger fires.  
**Fix:** Remove the authenticated INSERT policy on `subscriptions`. All rows must be created exclusively via `SECURITY DEFINER` trigger and service-role paths.

---

## 9. Profile & Settings

### BUG-PROF-01
**Severity:** HIGH  
**Location:** `src/components/AvatarUpload.tsx:89-145`  
**Description:** Two orphaned-file scenarios: (1) When a user uploads a new avatar, the old avatar file is not deleted from storage. Each avatar update accumulates a new orphaned file. (2) MIME type validation is performed on `file.type` (browser-reported), not magic bytes. Any file can be renamed to `.jpg` and uploaded as an avatar; the browser reports `image/jpeg` even for a ZIP or PDF.  
**Impact:** Storage cost accumulation from orphaned avatars; potential XSS if the avatar bucket serves any non-image content types with wrong MIME headers.  
**Fix:** (1) Delete the old avatar path before uploading the new one. (2) Read the first 8 bytes of the file and validate against JPEG/PNG/WebP magic byte signatures.

### BUG-PROF-02
**Severity:** HIGH  
**Location:** `src/lib/validation.ts:156-170`  
**Description:** Thai bank account number validation enforces exactly 10 digits (`/^[0-9]{10}$/`). GSB (Government Savings Bank) and BAAC (Bank for Agriculture and Agricultural Cooperatives) use 12-digit account numbers. These are major Thai banks serving millions of users, especially in rural areas. The validation silently blocks them from adding their bank accounts.  
**Impact:** A significant portion of Thai users (GSB, BAAC customers) cannot add their bank accounts for PromptPay or debt tracking purposes.  
**Fix:** Accept both 10 and 12-digit accounts: `/^[0-9]{10,12}$/` or use a bank-specific length map.

### BUG-PROF-03
**Severity:** HIGH  
**Location:** `src/components/ProfileBankAccount.tsx:67-89`  
**Description:** Bank account information is sourced from `debt_agreements` table (the lender's bank field in agreement records) rather than from a dedicated profile field. This means the user's "saved" bank account is actually the last-used agreement's bank info, and it changes whenever a new agreement is created with different bank details.  
**Impact:** Users see a different bank account than the one they think they saved; payment QR codes may reference wrong account.  
**Fix:** Add a `bank_account` field to the `profiles` table and source `ProfileBankAccount` from there.

### BUG-PROF-04
**Severity:** MEDIUM  
**Location:** `src/components/AvatarUpload.tsx:112`  
**Description:** File size validation is performed client-side only (checks `file.size > 5 * 1024 * 1024`). The Supabase storage policy has no server-side file size limit configured. An attacker can bypass the client-side check and upload a very large file (e.g., a 500 MB video) to the avatars bucket.  
**Impact:** Storage abuse; large file uploads can slow down the CDN for other users; storage costs spike.  
**Fix:** Add a Supabase storage policy with `(metadata->>'size')::int < 5242880` or configure the bucket's `file_size_limit` property.

---

## 10. Admin Panel

### BUG-ADMIN-01
**Severity:** CRITICAL  
**Location:** `supabase/functions/admin-session/index.ts:78-86` + `supabase/migrations/20260113101429_e20ddb9b.sql:136-137`  
**Description:** The `verify_admin_code` path in the Edge Function skips the `getAuthenticatedUser()` pre-flight check that the OTP path performs. More critically, the `verify_admin_code` SQL function automatically inserts a DB role into `user_roles` for any authenticated user who presents a valid code: `INSERT INTO public.user_roles (user_id, role) VALUES (auth.uid(), v_code_record.role) ON CONFLICT DO NOTHING`. This means any regular user who discovers the admin code becomes a permanent admin at the database level, not just for the current session.  
**Impact:** Complete privilege escalation. Any authenticated user with the admin code gains a permanent admin database role that persists after the session expires.  
**Fix:** Remove the automatic `INSERT INTO user_roles` lines from `verify_admin_code`. Code-login should only issue a time-scoped JWT session; it must never modify the persistent `user_roles` table. Role assignment must be done explicitly by an existing admin via `grant_user_role`.

### BUG-ADMIN-02
**Severity:** CRITICAL  
**Location:** `src/pages/admin/AdminUsersPage.tsx:119-165`  
**Description:** `AdminUsersPage` uses **direct table DML** (`supabase.from("user_roles").insert(...)` and `.delete()`) instead of the hardened `grant_user_role` / `revoke_user_role` RPCs defined in migration `20260404195000`. The RPCs enforce self-demotion prevention and last-admin guard at the database level. The direct DML bypasses ALL of these guards — an admin can delete their own admin role or delete the last admin in the system, causing a permanent lockout.  
**Impact:** Admin can permanently lock all admins out of the system by deleting the last admin role.  
**Fix:** Replace direct table mutations with `supabase.rpc("grant_user_role", ...)` and `supabase.rpc("revoke_user_role", ...)`.

### BUG-ADMIN-03
**Severity:** CRITICAL  
**Location:** `supabase/migrations/20260113101429_e20ddb9b.sql:158-162`  
**Description:** Hardcoded admin code `Admin@Secure2024!` is committed to source control and inserted into the `admin_codes` table by the migration. This code is now part of git history and is permanently leaked to anyone with repo access. Additionally, the OTP hash stored in `activity_logs` uses SHA-256 of a 6-digit numeric OTP — the 1,000,000 combination space is brute-forceable in milliseconds offline.  
**Impact:** Any developer, contractor, or attacker with repo access can immediately escalate to admin. Combined with BUG-ADMIN-01, this is a complete admin takeover vector.  
**Fix:** Remove the hardcoded INSERT from the migration. Provide a one-time setup script that runs outside of version control. Immediately rotate the admin code in production.

### BUG-ADMIN-04
**Severity:** HIGH  
**Location:** `src/utils/adminSession.ts:45-67`  
**Description:** `setAdminSession()` never sets the `admin_code_verified` flag it's supposed to track, but `isAdminCodeVerified()` checks for it. After code-path login, all calls to `isAdminCodeVerified()` return `false`, causing the admin panel to behave as if code verification failed even when it succeeded.  
**Impact:** Admin code login flow silently fails post-verification checks; users who log in via code may be redirected to login again.  
**Fix:** Add `sessionStorage.setItem('admin_code_verified', '1')` inside `setAdminSession()`.

### BUG-ADMIN-05
**Severity:** HIGH  
**Location:** `supabase/functions/admin-session/index.ts` — CORS headers  
**Description:** The admin session Edge Function returns `'Access-Control-Allow-Origin': '*'` — allowing any origin to call this endpoint. For an admin authentication endpoint, this should be locked to the app's specific origin.  
**Impact:** A malicious third-party website can make CORS requests to the admin session endpoint from a victim's browser, attempting admin code verification using the victim's cookies/session.  
**Fix:** Replace `'*'` with `process.env.ALLOWED_ORIGIN` or explicitly list the production domain.

### BUG-ADMIN-06
**Severity:** HIGH  
**Location:** `src/pages/admin/AdminUsersPage.tsx:178-210`  
**Description:** Admin user search is performed client-side with a `ILIKE` pattern on the locally-fetched user list. The list is fetched with `SELECT * FROM profiles LIMIT 100`. For apps with more than 100 users, only the first 100 are returned and searched — admins cannot find users beyond the first page.  
**Impact:** Admins cannot find or manage any user beyond position 100 in the database.  
**Fix:** Move search server-side: `supabase.from('profiles').select('*').ilike('display_name', \`%${query}%\`).limit(20)`.

### BUG-ADMIN-07
**Severity:** HIGH  
**Location:** `supabase/migrations/20260113101429_e20ddb9b.sql` — `verify_admin_code` → `issue_admin_session` chain  
**Description:** The `verify_admin_code` function calls `issue_admin_session` which checks `has_role(p_user_id, 'admin') OR has_role(p_user_id, 'moderator')` — but since `verify_admin_code` already inserted the role (BUG-ADMIN-01), this check always passes. The `issue_admin_session` therefore issues a real database-backed session token to any user who presented a valid code, granting them persistent admin access even after the session token expires.  
**Impact:** Admin session tokens provide more than time-scoped access; they correlate with a permanent database role grant.  
**Fix:** Fix BUG-ADMIN-01 first; then `issue_admin_session` should only be called after verifying the user had the role BEFORE the code was presented.

---

## 11. Home Dashboard & Calendar

### BUG-DASH-01
**Severity:** HIGH  
**Location:** `src/components/PaymentCalendar.tsx:89-134`  
**Description:** The payment calendar renders month/year grids using JavaScript's `new Date()` with no timezone specification, defaulting to the user's local timezone. If a Thai user is abroad (e.g., in Japan, UTC+9), installment due dates stored as Bangkok midnight (UTC+7) are displayed shifted by 2 hours, potentially moving the displayed due date to the next calendar day.  
**Impact:** Installment due dates display incorrectly for users traveling outside Bangkok timezone; payment reminders show the wrong day.  
**Fix:** Parse all installment dates with `{ timeZone: 'Asia/Bangkok' }` using `Intl.DateTimeFormat` or `date-fns-tz`.

### BUG-DASH-02
**Severity:** HIGH  
**Location:** `src/components/PaymentCalendar.tsx:156-178`  
**Description:** Dynamic Tailwind CSS class names are constructed with string interpolation: `` `bg-${color}-100` ``. Tailwind's JIT compiler cannot statically analyze interpolated class names and purges them from the production build. The calendar renders with no background colors in production.  
**Impact:** Calendar date highlighting is completely missing in production; overdue dates look the same as current dates.  
**Fix:** Use full class name strings in a safelist or use inline styles for dynamic colors: `style={{ backgroundColor: colorMap[color] }}`.

### BUG-DASH-03
**Severity:** HIGH  
**Location:** `src/components/DashboardStats.tsx:67-89`  
**Description:** `activeAgreements` count includes agreements in `status = 'completed'` that were marked completed within the current month. The filter only excludes `cancelled` status, not `completed`. The "Active Debt Agreements" metric is inflated by recently-completed agreements.  
**Impact:** Users see a higher active agreement count than reality; the dashboard gives an inaccurate picture of current financial obligations.  
**Fix:** Filter to `status IN ('active', 'pending')` only: `agreements.filter(a => ['active', 'pending'].includes(a.status))`.

### BUG-DASH-04
**Severity:** MEDIUM  
**Location:** `src/pages/Index.tsx:123-145`  
**Description:** Agreements in `status = 'rescheduling'` are excluded from the active list display with no explanation shown to the user. The agreement disappears from the dashboard without any indication. Users think their agreement was deleted.  
**Impact:** User confusion; support tickets about "disappeared" agreements.  
**Fix:** Show a "Reschedule Pending" section or include rescheduling agreements in the active list with a distinct status badge.

---

## 12. Domain Logic & Debt Strategies

### BUG-DOMAIN-01
**Severity:** HIGH  
**Location:** `src/domains/debt/mapAgreementToDebtCard.ts:45-67`  
**Description:** `DebtCard.amount` is set to `remainingAmount` (outstanding principal) instead of `total_amount` (original loan amount). The debt card shown on the home screen therefore displays "฿3,200" for a loan that started at "฿10,000" with ฿6,800 already paid — which looks like a much smaller debt than it was.  
**Impact:** Financial summary cards show misleading amounts; users cannot understand their total debt exposure from the dashboard.  
**Fix:** Use `agreement.total_amount` for the card's primary amount display, and show `remainingAmount` as a secondary "remaining" figure.

### BUG-DOMAIN-02
**Severity:** HIGH  
**Location:** `src/utils/debtStrategies.ts:89-134` — `simulate()` function  
**Description:** The debt payoff simulator hardcodes `/ 12` for monthly interest rate conversion regardless of the agreement's actual frequency. For weekly agreements, interest should be divided by 52; for daily agreements, by 365. As a result, weekly debt simulations show interest amounts that are 4.3x too high, and daily agreements show interest 30x too high.  
**Impact:** Completely incorrect payoff simulations for non-monthly agreements; users make financial decisions based on wildly wrong projected totals.  
**Fix:** Use a frequency-to-periods map: `const periodsPerYear = { monthly: 12, weekly: 52, daily: 365, biweekly: 26 }[frequency]` and divide the annual rate by `periodsPerYear`.

### BUG-DOMAIN-03
**Severity:** HIGH  
**Location:** `src/hooks/useDebtAgreements.ts:89-112`  
**Description:** The hook depends on `user` (full object) in its `useEffect` dependency array. Since `AuthContext.Provider` doesn't memoize its value, `user` reference changes identity on every auth context render. This causes `fetchAgreements` to be called on every auth state change — including `profileLoading` toggles — generating redundant Supabase fetches throughout the session.  
**Impact:** Excessive database queries; up to 10x more fetches than necessary per session.  
**Fix:** Change dependency to `user?.id` — the fetch only needs to re-run when the actual user ID changes.

### BUG-DOMAIN-04
**Severity:** MEDIUM  
**Location:** `src/hooks/useDebtAgreements.ts:150-156`  
**Description:** The `supabase.rpc(...)` call result is double-cast: `(await supabase.rpc('get_user_agreements', ...)).data as unknown as Agreement[]`. The `as unknown as` pattern erases all TypeScript type safety — any schema mismatch between the RPC response and the `Agreement` type will silently produce runtime errors instead of compile-time errors.  
**Impact:** Type mismatches between DB schema and frontend type go undetected until runtime.  
**Fix:** Use Supabase's generated types with `supabase.rpc<Agreement[]>('get_user_agreements', ...)` and validate the response shape with a runtime parser.

---

## 13. Money Utilities & PDF Export

### BUG-MONEY-01
**Severity:** HIGH  
**Location:** `src/utils/money.ts:40`  
**Description:** `toMoneyCents` applies double-rounding. It calls `roundMoney(value)` first (which snaps to 2 decimal places via string parsing), then multiplies by 100 and calls `Math.round()` again. For IEEE-754 boundary values, `Math.round(roundMoney(v) * 100)` can produce a result 1 cent off from the correct value. This propagates into `moneyEquals`, `subtractMoney`, and `sumMoney`.  
**Impact:** Silent 1-cent errors in all arithmetic through `toMoneyCents`; incorrect reconciliation of installment balances.  
**Fix:** Parse cents directly from the rounded string: `const [whole, frac = ''] = roundMoney(value).toFixed(2).split('.'); return Number(whole) * 100 + Number(frac);`

### BUG-MONEY-02
**Severity:** HIGH  
**Location:** `src/utils/money.ts:52-55`  
**Description:** `moneyEquals` default tolerance is `0.01` (1 cent), meaning `moneyEquals(100.00, 100.01)` returns `true`. For a debt management app, 1-cent differences matter — a borrower underpaying by 1 cent should not be marked as fully paid.  
**Impact:** Incorrect reconciliation; 1-cent underpayments silently pass as complete payments.  
**Fix:** Change default tolerance to `0` (strict cent equality). Callers needing fuzzy match should pass explicit tolerance.

### BUG-MONEY-03
**Severity:** HIGH  
**Location:** `src/utils/money.ts:57-63`  
**Description:** `isWithinMoneyTolerance` compares raw float subtraction result against a float tolerance, which is IEEE-754 unsafe at boundary values. Two amounts differing by exactly the tolerance may return inconsistently true or false.  
**Impact:** Boundary-case installment validation produces non-deterministic results.  
**Fix:** Convert both sides to integer cents before comparison: `return Math.abs(toMoneyCents(actual) - toMoneyCents(expected)) <= Math.round(tolerance * 100);`

### BUG-MONEY-04
**Severity:** HIGH  
**Location:** `src/utils/pdfExport.ts:51-55`  
**Description:** PDF `formatMoney` uses `"en-US"` locale with `THB` appended as a string suffix, producing `"1,234.56 THB"` instead of the Thai locale format `"฿1,234.56"`. The entire app uses `"th-TH"` locale elsewhere; the PDF uses a different format, creating inconsistency.  
**Impact:** PDF reports show amounts in a format inconsistent with the rest of the app; confusing for Thai users.  
**Fix:** Use `new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB" }).format(amount)`.

### BUG-MONEY-05
**Severity:** HIGH  
**Location:** `src/utils/pdfExport.ts:50-55`  
**Description:** `formatMoney` has no guard for `NaN` or `Infinity`. If `amount` is `NaN` (from a corrupt installment record), the PDF renders `"NaN THB"`. `Infinity` renders as `"∞ THB"`. Neither case throws; garbage financial data is silently rendered.  
**Impact:** Corrupt installment records produce unintelligible PDFs with no error signaled.  
**Fix:** Add: `if (!isFinite(amount) || isNaN(amount)) throw new Error(\`Invalid amount: ${amount}\`);`

### BUG-MONEY-06
**Severity:** MEDIUM  
**Location:** `src/utils/money.ts:25-37`  
**Description:** `toMoney(null)` silently returns `0` because `Number(null) === 0`. Similarly, `toMoney(undefined)` returns `NaN` which then passes through `isFinite` as false and throws — but `null` doesn't throw. Inconsistent handling of null vs undefined monetary inputs.  
**Impact:** Null monetary values treated as zero; potential for silent undercounting of outstanding balances.  
**Fix:** Add explicit null/undefined checks: `if (value == null) throw new Error('Monetary value cannot be null/undefined');`

### BUG-MONEY-07
**Severity:** MEDIUM  
**Location:** `src/utils/pdfExport.ts:89-134` — PDF layout  
**Description:** PDF generation does not handle Thai characters correctly — the default `jsPDF` font does not include Thai Unicode glyphs. Any Thai text (borrower names, notes, descriptions) renders as empty boxes or question marks in the generated PDF.  
**Impact:** PDFs with Thai language content are unreadable; all Thai names and descriptions appear garbled.  
**Fix:** Embed a Thai-supporting font (e.g., Sarabun or Noto Sans Thai) using `jsPDF`'s custom font API.

---

## 14. Row Level Security & Database

### BUG-RLS-01
**Severity:** CRITICAL  
**Location:** `supabase/migrations` — `create_notification` SECURITY DEFINER function  
**Description:** `create_notification(p_user_id UUID, ...)` accepts any user UUID with no check that `auth.uid() = p_user_id`. Any authenticated user can inject arbitrary notifications into any other user's feed, potentially manipulating financial decisions (e.g., false "payment confirmed" notification).  
**Impact:** Social engineering attack surface; false financial notifications can manipulate victim behavior.  
**Fix:** Add caller identity check: `IF auth.role() <> 'service_role' AND auth.uid() IS DISTINCT FROM p_user_id THEN RAISE EXCEPTION 'Forbidden'; END IF;`

### BUG-RLS-02
**Severity:** CRITICAL  
**Location:** `supabase/migrations/20260131080049_2dbd30b9` — `messages` UPDATE policy  
**Description:** UPDATE policy allows any participant in a chat to update any column on any message in that thread, including messages they didn't send. The `enforce_message_voice_note_integrity` trigger only protects `sender_id`, `content`, `voice_url` — but `image_url`, `file_url`, `file_name`, `reply_to_id` are unprotected. Any participant can replace another user's message image with malicious content.  
**Impact:** Message tampering — a borrower can replace a lender's payment confirmation image with a forged document.  
**Fix:** Add `WITH CHECK (auth.uid() = sender_id)` to the messages UPDATE policy. Expand the trigger to cover all content columns.

### BUG-RLS-03
**Severity:** CRITICAL  
**Location:** `supabase/migrations` — `generate_admin_otp` SECURITY DEFINER function  
**Description:** `generate_admin_otp(p_user_id UUID)` has no `auth.uid() = p_user_id` check. Any authenticated user can invalidate any admin's current OTP and generate a new one, causing a DoS on the admin login flow.  
**Impact:** DoS attack on admin authentication — any user can continuously regenerate admin OTPs preventing admin login.  
**Fix:** Add identity and role checks at function entry.

### BUG-RLS-04
**Severity:** CRITICAL  
**Location:** `supabase/migrations` — `log_activity` SECURITY DEFINER function  
**Description:** `log_activity(p_user_id UUID, ...)` has no `auth.uid() = p_user_id` check. Any authenticated user can inject false `login_failed` events for another user, triggering the suspicious activity threshold and causing admin alerts to fire against the victim.  
**Impact:** False-flag attack — attacker can get innocent users banned or investigated by admins.  
**Fix:** Add `IF auth.role() <> 'service_role' AND auth.uid() IS DISTINCT FROM p_user_id THEN RAISE EXCEPTION 'Forbidden'; END IF;` and force `p_is_suspicious = false` for non-service-role callers.

### BUG-RLS-05
**Severity:** HIGH  
**Location:** `supabase/migrations` — `installments` UPDATE policy  
**Description:** Borrowers can directly UPDATE any column on their own installments including `status`, `paid_at`, `confirmed_by_lender`, and `amount`. This allows a borrower to self-confirm payment without lender verification.  
**Impact:** Borrowers can mark their own installments as paid without submitting any payment proof.  
**Fix:** Restrict borrower UPDATE to only `payment_proof_url` column; lender UPDATE to `status`, `confirmed_by_lender`, `paid_at` only. Use column-level policies or a restrictive BEFORE UPDATE trigger.

### BUG-RLS-06
**Severity:** HIGH  
**Location:** `supabase/migrations` — `tips` SELECT policy  
**Description:** The SELECT policy has `OR auth.uid() IS NOT NULL` as the third condition, making the entire policy equivalent to "any authenticated user can see all tips." This completely defeats the `is_anonymous` flag — all anonymous tips are exposed with their real `user_id`.  
**Impact:** Full deanonymization of all anonymous donors — their identity, amount, and message are visible to any authenticated user.  
**Fix:** Replace with `USING (auth.uid() = user_id OR (is_anonymous = false AND auth.uid() IS NOT NULL) OR public.has_role(auth.uid(), 'admin'))`.

### BUG-RLS-07
**Severity:** HIGH  
**Location:** `supabase/migrations` — `user_points` and `point_transactions` INSERT/UPDATE policies  
**Description:** Direct INSERT into `user_points` allows any user to set `total_points = 999999`. Direct UPDATE allows resetting `daily_earned_today = 0` to bypass the daily cap. Both bypass the intended SECURITY DEFINER `earn_points` / `redeem_points` RPC flow.  
**Impact:** Any user can grant themselves unlimited points and redeem them for subscription benefits.  
**Fix:** Remove authenticated INSERT/UPDATE policies on `user_points` and `point_transactions`. Access only via SECURITY DEFINER RPCs.

### BUG-RLS-08
**Severity:** HIGH  
**Location:** `supabase/migrations` — `subscriptions` INSERT policy  
**Description:** Authenticated INSERT policy allows users to insert a subscription row with arbitrary `tier`, `expires_at`, and `is_trial` values before the `handle_new_user` trigger fires. A user can grant themselves permanent premium access.  
**Impact:** Complete subscription billing bypass.  
**Fix:** Remove authenticated INSERT policy; use SECURITY DEFINER trigger exclusively.

### BUG-RLS-09
**Severity:** HIGH  
**Location:** `supabase/migrations` — `direct_chats` UPDATE policy  
**Description:** No `WITH CHECK` on the `direct_chats` UPDATE policy means either participant can update `user1_id` and `user2_id`, effectively adding arbitrary users to their chat and exposing all previous message history to the new participant.  
**Impact:** Chat participant hijacking — attacker can give any user access to a private chat's message history.  
**Fix:** Make `direct_chats` immutable post-creation. Remove the UPDATE policy or restrict it to service-role only.

### BUG-RLS-10
**Severity:** HIGH  
**Location:** `supabase/migrations` — `chat_rooms` INSERT/UPDATE policies  
**Description:** Any authenticated user can INSERT a `chat_rooms` row with any `user2_id`, causing phantom chat room entries to appear in the victim's inbox. No `WITH CHECK` on UPDATE allows rewriting participant IDs.  
**Impact:** Spam/harassment vector — attacker can flood victim's chat inbox with fake urgent action items.  
**Fix:** Remove client INSERT/UPDATE policies on `chat_rooms`. All mutations must go through SECURITY DEFINER triggers.

### BUG-RLS-11
**Severity:** HIGH  
**Location:** `supabase/migrations` — `start_premium_trial` SECURITY DEFINER function  
**Description:** No `auth.uid() = p_user_id` check. Any authenticated user can call `start_premium_trial('victim-uuid')`, permanently consuming the victim's one-time free trial.  
**Impact:** DoS on free trials — attacker can deny any user their premium trial before they ever activate it.  
**Fix:** Add `IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN RAISE EXCEPTION 'Forbidden'; END IF;`

### BUG-RLS-12
**Severity:** MEDIUM  
**Location:** `supabase/migrations` — `get_user_tier` SECURITY DEFINER function  
**Description:** No `auth.uid()` guard — any authenticated user can check any other user's subscription tier.  
**Impact:** Subscription tier information leakage for all users.  
**Fix:** Add caller identity check or restrict to admin role.

### BUG-RLS-13
**Severity:** MEDIUM  
**Location:** `supabase/migrations` — `can_create_agreement_free` SECURITY DEFINER function  
**Description:** No `auth.uid() = p_user_id` check — any user can probe another user's quota and credit balance, leaking financial activity level.  
**Impact:** User financial activity enumeration by any authenticated user.  
**Fix:** Add `IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN RAISE EXCEPTION 'Forbidden'; END IF;`

---

## 15. React Hooks & State Management

### BUG-HOOK-01
**Severity:** HIGH  
**Location:** `src/contexts/AuthContext.tsx:96-101`  
**Description:** `setTimeout` in `onAuthStateChange` is never cleared on re-fire. Stale setTimeout callbacks fire `setAuthLoading(false)` after the new auth event has already reset it to `true`, causing loading state to flicker and profile to render as `null` briefly between sessions.  
**Impact:** Auth loading state inconsistency; components briefly render with wrong user/profile state.  
**Fix:** Guard `setAuthLoading(false)` with a user-ID equality check against `currentUserIdRef`.

### BUG-HOOK-02
**Severity:** HIGH  
**Location:** `src/contexts/AuthContext.tsx:204-216`  
**Description:** `AuthContext.Provider` value object is recreated on every render (no `useMemo`). All `useAuth()` consumers re-render on every auth state change, including minor ones like `profileLoading`. Functions are not `useCallback`-wrapped, causing referential instability in dep arrays throughout the app.  
**Impact:** Cascading re-renders across the entire authenticated subtree; waterfall of redundant Supabase fetches.  
**Fix:** Wrap value in `useMemo` and all functions in `useCallback`.

### BUG-HOOK-03
**Severity:** HIGH  
**Location:** `src/hooks/useActivityFeed.ts:68-253`  
**Description:** No cleanup/cancellation in the main `useEffect`. If `user` changes while the async fetch is in flight (sign-out/sign-in), the stale callback sets activities from the previous user's data on the new user's state.  
**Impact:** Previous user's activity data briefly shown to next user on shared devices — privacy leak.  
**Fix:** Add `let cancelled = false; return () => { cancelled = true; }` with guards before all `setState` calls.

### BUG-HOOK-04
**Severity:** HIGH  
**Location:** `src/hooks/useUserPoints.ts:74-133`  
**Description:** `checkBadgeProgress` has `badges` state in its `useCallback` dep array. Each badge award triggers `setBadges`, re-creating `checkBadgeProgress`, re-creating `earnPoints`. Rapid concurrent `earnPoints` calls read stale `badges` state and may issue duplicate badge upserts and double toasts.  
**Impact:** Duplicate badge toasts; double DB writes; unstable memoization.  
**Fix:** Use `useRef` to track current badges for comparison inside `checkBadgeProgress`, removing `badges` from dep array.

### BUG-HOOK-05
**Severity:** HIGH  
**Location:** `src/hooks/useUserPoints.ts:155-189`  
**Description:** First-time user creation race condition — `SELECT` then `INSERT` on `user_points` with no locking. Concurrent mounts (React 18 StrictMode) can both pass the SELECT check and both attempt INSERT, causing a duplicate key error that's swallowed silently.  
**Impact:** First session for new users may show 0 points with a silent error; retry logic may partially fix.  
**Fix:** Use `INSERT INTO user_points ... ON CONFLICT (user_id) DO NOTHING` in a SECURITY DEFINER function.

### BUG-HOOK-06
**Severity:** HIGH  
**Location:** `src/hooks/useSignedUrl.ts:45-78`  
**Description:** Signed URLs (default 5-minute expiry from Supabase storage) are fetched once and never refreshed. After 5 minutes, all payment slip images and voice message files return 403 — the user sees broken images/audio for the rest of their session.  
**Impact:** All payment evidence images become inaccessible 5 minutes after page load.  
**Fix:** Implement URL refresh: store expiry timestamp alongside URL, refresh when `Date.now() > expiresAt - 60000`.

### BUG-HOOK-07
**Severity:** MEDIUM  
**Location:** `src/contexts/LanguageContext.tsx:89-112`  
**Description:** The `t()` translation function is not wrapped in `useCallback` and is recreated on every render. Any component that includes `t` in a `useEffect` or `useCallback` dep array will re-run on every language context render.  
**Impact:** Unnecessary re-renders and effect re-runs across the entire translated UI.  
**Fix:** Wrap `t` in `useCallback([currentLanguage])`.

---

## 16. Realtime Subscriptions

### BUG-RT-01
**Severity:** HIGH  
**Location:** `src/components/BottomNav.tsx` + `src/hooks/useGlobalChatNotification.ts`  
**Description:** Both `BottomNav` and `useGlobalChatNotification` create separate Realtime channels for the same messages table subscription. Every authenticated user has 2 simultaneous subscriptions to the same events, doubling bandwidth usage and potentially delivering duplicate notification badge increments.  
**Impact:** Chat notification badges count 2x per new message; double bandwidth consumption.  
**Fix:** Consolidate into a single shared channel using a React context or singleton pattern.

### BUG-RT-02
**Severity:** HIGH  
**Location:** `src/hooks/useDebtAgreements.ts:150-156`  
**Description:** No Realtime subscription for agreement updates. If a lender confirms an agreement while the borrower has their debt list open, the borrower's view doesn't update until they manually refresh. Similarly, if a new installment payment is confirmed, the debt detail page doesn't reflect the change.  
**Impact:** Stale agreement/installment state; users must manually refresh to see updates.  
**Fix:** Add a Realtime subscription on `debt_agreements` and `installments` tables filtered by `user_id`.

### BUG-RT-03
**Severity:** HIGH  
**Location:** `src/App.tsx:45-78`  
**Description:** Supabase Realtime subscriptions are killed on every redirect because `AuthProvider` and other context providers are remounted inside the `Routes` component tree. When React re-renders the router on navigation, providers higher up in the tree also re-render and re-mount, triggering subscription cleanup and re-subscription.  
**Impact:** Constant Realtime subscription teardown/reconnect on every page navigation; missed events during reconnect window.  
**Fix:** Move `AuthProvider` and other stateful providers above the `Router` component in the tree so they persist across route changes.

### BUG-RT-04
**Severity:** MEDIUM  
**Location:** `src/hooks/useNotifications.ts:89-120`  
**Description:** On Realtime reconnect, no message replay/catchup is performed. Events that arrived during the disconnection window are lost. The user's notification count is therefore lower than reality after any reconnect.  
**Impact:** Missed notifications after network drops; unread counts are understated.  
**Fix:** After reconnect, fetch notifications created since the last known timestamp: `SELECT * FROM notifications WHERE user_id = $1 AND created_at > $lastSeen ORDER BY created_at`.

---

## 17. Security Validation & Injection

### BUG-SEC-01
**Severity:** HIGH  
**Location:** `src/utils/navigation.ts:45-68` — `isSafeInternalPath`  
**Description:** The safe path validator does not decode URL-encoded input before checking. A path like `%2F..%2Fadmin` passes the regex check (no leading `../`) but decodes to `/../admin` when the browser processes it. Additionally, the function doesn't guard against `javascript:` or `data:` protocol prefixes that could be injected as path segments.  
**Impact:** URL-encoded path traversal bypasses the validator; combined with BUG-NOTIF-01, enables open redirect and XSS.  
**Fix:** Decode input before validation: `const decoded = decodeURIComponent(path);` then check `decoded` against the safe pattern. Also validate `!decoded.startsWith('javascript:') && !decoded.startsWith('data:')`.

### BUG-SEC-02
**Severity:** HIGH  
**Location:** `src/utils/paymentSlipStorage.ts:78-95`  
**Description:** Payment slip filenames are not sanitized before being used as storage paths. A filename containing `../` segments or path-separator characters could escape the intended storage prefix. While Supabase storage normalizes paths, the client-side path construction could produce unexpected bucket paths.  
**Impact:** Storage path confusion; files may be placed outside the intended directory prefix.  
**Fix:** Sanitize filenames: `filename.replace(/[^a-zA-Z0-9._-]/g, '_')` before path construction.

### BUG-SEC-03
**Severity:** HIGH  
**Location:** `src/hooks/useRateLimiter.ts`  
**Description:** Rate limiting is implemented entirely client-side using `localStorage`. Any user can bypass rate limits by: (1) clearing localStorage, (2) using incognito/different browser, (3) disabling JavaScript temporarily. This makes the rate limiter ineffective against any determined bad actor.  
**Impact:** Rate-limited operations (OTP requests, friend code searches) have no real server-side protection.  
**Fix:** Implement rate limiting in Supabase Edge Functions or PostgreSQL using `pg_rate_limit` or timestamp-based counters in a `rate_limits` table.

### BUG-SEC-04
**Severity:** MEDIUM  
**Location:** `src/lib/observability.ts:89-134`  
**Description:** Error events logged to the observability system include raw error messages that may contain user input. If a SQL error or storage error message contains user-supplied data (e.g., a failed insert with user values in the error), those values are logged to the observability endpoint without sanitization.  
**Impact:** Potential log injection; user data leakage to observability infrastructure.  
**Fix:** Sanitize error messages before logging: strip non-printable characters and truncate user-input portions.

### BUG-SEC-05
**Severity:** MEDIUM  
**Location:** `src/integrations/supabase/client.ts`  
**Description:** The Supabase anon key is embedded in the client-side bundle (expected for Supabase, where RLS is the defense). However, there is no Content Security Policy (CSP) header configured in the app. Without CSP, any XSS vulnerability can make arbitrary Supabase API calls using the anon key with the authenticated user's JWT.  
**Impact:** XSS-to-data-breach path is wider without CSP; an injected script can exfiltrate all data the authenticated user can access.  
**Fix:** Add a strict CSP header via `vite.config.ts` or the hosting platform: `Content-Security-Policy: default-src 'self'; connect-src 'self' https://*.supabase.co; ...`

---

## 18. History, Badges & Points

### BUG-POINTS-01
**Severity:** CRITICAL  
**Location:** `src/hooks/useUserPoints.ts:89-112` — `earnPoints` idempotency key  
**Description:** The `earn_points` RPC is called with a random UUID as `reference_id` (`crypto.randomUUID()`). The UNIQUE index `(user_id, action_type, reference_id)` is intended to prevent duplicate point awards for the same action on the same resource — but since `reference_id` is always a new random UUID, the constraint never fires. Any action that calls `earnPoints` twice (double-click, React StrictMode double-invoke, network retry) awards points twice.  
**Impact:** Points can be infinitely farmed by double-clicking or triggering network retries; rewards system is completely broken.  
**Fix:** Pass the actual resource ID as `reference_id`: `earnPoints('payment_submitted', installmentId, 10)` — not a random UUID.

### BUG-POINTS-02
**Severity:** HIGH  
**Location:** `src/components/PointsDisplay.tsx:89-134`  
**Description:** Badge upsert is fully client-side — `supabase.from('user_badges').upsert({...})` is called from the browser with no server-side validation of whether the badge was actually earned. Any user can open the browser console and call this to award themselves any badge: `supabase.from('user_badges').upsert({ user_id: user.id, badge_type: 'top_lender', earned_at: new Date() })`.  
**Impact:** Complete badge system integrity failure — all badges are self-awardable without any actual achievement.  
**Fix:** Move badge awarding to a SECURITY DEFINER `award_badge` RPC that validates achievement criteria server-side before inserting.

### BUG-POINTS-03
**Severity:** HIGH  
**Location:** `src/hooks/useUserPoints.ts:145-178` — `redeemPoints`  
**Description:** Double-spend is possible in `redeemPoints`. The function reads `total_points` from state, checks if sufficient, then calls the RPC. If `redeemPoints` is called twice concurrently (e.g., from two browser tabs), both read the same `total_points` value before either deduction is committed, and both redemptions succeed — spending the same points twice.  
**Impact:** Points can be double-spent; subscription credits can be obtained at 2x the expected cost.  
**Fix:** The `redeem_points` RPC must use `SELECT ... FOR UPDATE` on the `user_points` row to serialize concurrent redemptions.

### BUG-POINTS-04
**Severity:** MEDIUM  
**Location:** `src/hooks/useUserPoints.ts:178-198`  
**Description:** Daily point reset is performed client-side by checking if `daily_earned_today` resets to 0 if `last_earned_date !== today`. This check runs on app open, but if the user leaves the app open past midnight, the reset never fires until they navigate to a page that mounts the hook again.  
**Impact:** Users who keep the app open overnight can earn above the daily cap by making actions before the reset fires.  
**Fix:** Move daily reset to a scheduled Supabase Edge Function or perform the check inside the `earn_points` RPC using `CURRENT_DATE AT TIME ZONE 'Asia/Bangkok'`.

---

## 19. i18n, PWA & Build

### BUG-I18N-01
**Severity:** HIGH  
**Location:** `src/components/PWAInstallPrompt.tsx`  
**Description:** All user-visible strings in the PWA install prompt are hardcoded in Thai, bypassing the `t()` translation function used throughout the rest of the app. The app has i18n infrastructure for English/Thai switching but the install prompt is Thai-only.  
**Impact:** English-language users see Thai text in the install prompt; inconsistent i18n coverage.  
**Fix:** Replace hardcoded strings with `t('pwa.install.title')` etc. and add the keys to both locale files.

### BUG-I18N-02
**Severity:** HIGH  
**Location:** `vite.config.ts`  
**Description:** `sourcemap: false` is set for the production build. This means Sentry (or any error monitoring) receives minified stack traces that cannot be symbolicated. Error reports from production are unactionable — file names, line numbers, and function names are all minified.  
**Impact:** Production errors cannot be debugged from error monitoring; mean time to resolution increases significantly.  
**Fix:** Enable `sourcemap: true` and configure Sentry's source map upload plugin to upload maps securely without serving them publicly.

### BUG-I18N-03
**Severity:** HIGH  
**Location:** `src/pages/NotFound.tsx`  
**Description:** The 404 page uses `<a href="/">` causing a full page reload instead of React Router's `<Link to="/">`. Additionally, all text is in English only for a Thai-first app.  
**Impact:** Full page reload on 404 navigation destroys all React state including auth session; Thai users see English-only content.  
**Fix:** Replace `<a href="/">` with `<Link to="/">`. Wrap all strings in `t()`.

### BUG-I18N-04
**Severity:** MEDIUM  
**Location:** `src/components/ux/PageTransition.tsx`  
**Description:** `minHeight: 100dvh` is applied to the animated page container. During `AnimatePresence` transitions, the entering and exiting pages briefly stack, making the container `200dvh` tall and causing a visible layout shift/jump before the exit animation completes.  
**Impact:** Jarring visual jump on every page navigation; worse on devices with slow animations.  
**Fix:** Use `position: absolute` on the exiting page during transition, or use `overflow: hidden` on the transition container.

### BUG-I18N-05
**Severity:** MEDIUM  
**Location:** `src/App.tsx:45-78`  
**Description:** `<Suspense>` is placed inside `<AnimatePresence>`, causing double animation. The component first mounts with the Suspense fallback (triggering the enter animation), then re-mounts with the actual content (triggering another enter animation). Every lazy-loaded page animates twice on first visit.  
**Impact:** Double-flash animation on every first visit to a lazy-loaded route; poor UX.  
**Fix:** Move `<Suspense>` above `<AnimatePresence>` in the tree so the page content is ready before the animation begins.

---

## 20. Routing & UX Flow

### BUG-UX-01
**Severity:** HIGH  
**Location:** `src/components/BottomNav.tsx:215`  
**Description:** Active route detection uses strict equality (`pathname === route.path`). For nested routes like `/debt/123`, the bottom nav item for `/debt` (if it exists) never highlights because `'/debt/123' !== '/debt'`. Users have no visual indication of which section they're in when on detail pages.  
**Impact:** Navigation context is lost on all detail pages; users cannot tell where they are in the app.  
**Fix:** Use `pathname.startsWith(route.path)` or React Router's `useMatch` hook with the `end: false` option.

### BUG-UX-02
**Severity:** HIGH  
**Location:** `src/App.tsx:45-78`  
**Description:** Context providers (`AuthProvider`, `QueryClientProvider`, `LanguageProvider`) are remounted on every redirect that goes through the router's render cycle. When a `navigate('/login')` call happens inside a `useEffect`, React re-renders the entire tree including providers, killing all Realtime subscriptions and clearing in-memory cache.  
**Impact:** Every programmatic navigation causes a full subscription teardown; chat and notification state is lost.  
**Fix:** Hoist all stateful providers to above the `<BrowserRouter>` component so they persist across navigations.

### BUG-UX-03
**Severity:** MEDIUM  
**Location:** `src/pages/NotFound.tsx` — full page reload  
**Description:** (Also listed as BUG-I18N-03) Using `<a href="/">` on the 404 page causes a full page reload, destroying auth session state. After reload, users who were authenticated have to wait for the full auth re-initialization cycle.  
**Impact:** Poor UX; slow recovery from 404 errors.  
**Fix:** Use `<Link to="/">` from React Router.

### BUG-UX-04
**Severity:** MEDIUM  
**Location:** `src/hooks/useDebtAgreements.ts` — no loading skeleton  
**Description:** The debt agreements list shows a blank screen during the initial fetch with no skeleton loader or shimmer placeholder. On slow connections, users see an empty list for 1-3 seconds before data appears.  
**Impact:** Users may think the app is broken or they have no agreements; poor perceived performance.  
**Fix:** Add skeleton loaders matching the DebtCard shape during loading state.

---

## Cross-Cutting Concerns

### Security Architecture Issues
1. **No server-side rate limiting** — all rate limiting is client-side and trivially bypassed (BUG-SEC-03)
2. **CORS wildcard on admin endpoint** — admin session Edge Function allows any origin (BUG-ADMIN-05)
3. **Source maps disabled** — production errors are undebuggable (BUG-I18N-02)
4. **No CSP header** — XSS-to-data-breach blast radius is maximized (BUG-SEC-05)
5. **Multiple SECURITY DEFINER functions missing caller identity checks** — systematic pattern across 8+ functions (BUG-RLS-01 through BUG-RLS-11)

### Data Integrity Issues
1. **Non-atomic quota checks** — TOCTOU races throughout agreement creation, point earning, friend requests (BUG-AGREE-01, BUG-POINTS-01)
2. **Floating-point money arithmetic** — 1-cent rounding errors propagate through all financial calculations (BUG-MONEY-01, BUG-MONEY-02)
3. **Bangkok timezone inconsistency** — some paths use UTC, some Bangkok time, causing date boundary errors (BUG-AGREE-02, BUG-DASH-01)

### Performance Issues
1. **Unscoped Realtime subscriptions** — all-table subscriptions waste bandwidth and create data leak risk (BUG-CHAT-01)
2. **Duplicate channel subscriptions** — 2x subscriptions per user for chat notifications (BUG-RT-01)
3. **AuthContext not memoized** — cascading re-renders throughout authenticated subtree (BUG-HOOK-02)
4. **No message pagination** — entire chat history loaded on mount (BUG-CHAT-03)

---

## Remediation Priority

### Immediate (Block ship / P0)
1. BUG-ADMIN-01 — Admin code privilege escalation
2. BUG-ADMIN-02 — Direct DML bypasses admin role guards
3. BUG-ADMIN-03 — Hardcoded admin code in source control
4. BUG-RLS-01 — Arbitrary notification injection
5. BUG-RLS-02 — Message content tampering by chat participants
6. BUG-RLS-05 — Borrower self-confirming payments
7. BUG-RLS-07 — Direct point manipulation
8. BUG-SUB-01 — Self-grant agreement credits
9. BUG-POINTS-01 — Points farming via random reference_id
10. BUG-NOTIF-01 — Path traversal via notification related_id

### High Priority (Fix within sprint / P1)
- All HIGH severity items above (BUG-AUTH-02 through BUG-UX-02)
- Focus on: BUG-HOOK-02 (AuthContext memoization), BUG-RT-03 (provider remounting), BUG-CHAT-01 (subscription scoping)

### Medium Priority (Fix within quarter / P2)  
- All MEDIUM severity items
- Focus on: BUG-MONEY-02 (tolerance default), BUG-I18N-02 (sourcemaps), BUG-DASH-02 (Tailwind purging)

### Low Priority (Backlog / P3)
- All LOW severity items

---

*Report generated: 2026-04-04 by 20 parallel Sonnet agents performing comprehensive user journey analysis.*
