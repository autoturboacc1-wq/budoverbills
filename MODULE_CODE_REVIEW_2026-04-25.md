# BudOverBills Module Code Review Report - 2026-04-25

## Scope

Static code review pass for the current workspace:

- Frontend: React/Vite/TypeScript hooks, pages, dialogs, utilities, PWA service worker.
- Backend: Supabase migrations, RLS, RPCs, storage policies, edge functions.
- Docs/release gates: `BUG_REPORT.md`, `task.md`, `scripts/predeploy-audit.mjs`.

Current workspace note: `supabase/migrations/20260425110000_fix_friends_unique_constraint.sql` is untracked local work. This report treats it as present for review context, but does not modify it.

## Baseline

| Check | Result | Evidence | Status |
|---|---:|---|---|
| Typecheck | Passed in `audit:predeploy` baseline | `scripts/predeploy-audit.mjs:139-156` runs `npm run typecheck` | fixed gate |
| Tests | Passed in `audit:predeploy` baseline, 80 tests | `scripts/predeploy-audit.mjs:139-156` runs `npm run test:run` | fixed gate |
| Build | Passed in `audit:predeploy` baseline, with chunk-size warnings | `scripts/predeploy-audit.mjs:139-156` runs `npm run build` | fixed gate |
| Lint baseline | Passed in `audit:predeploy` baseline | `scripts/predeploy-audit.mjs:158-248` | fixed gate |
| Release blocker audit | Failed | `BUG_REPORT.md:56-96` still has unchecked items; `scripts/predeploy-audit.mjs:303-390` fails on those sections | still open |
| Docs consistency | Failed | `task.md:1-3` claims generated total task list and later marks broad tasks done, while `BUG_REPORT.md:56-96` still blocks release | doc drift |

## Executive Summary

The highest-risk live findings are concentrated in payment correctness, release gating, push dispatch, and step-up authentication. Several `BUG_REPORT.md` items are stale because server-side fixes now exist, but at least six blockers are still real:

- P0: payment slip submission is still client-orchestrated across storage, `slip_verifications`, `installments`, and notifications.
- P1: fully paid agreements are inferred as completed in UI/domain code, but the latest payment-confirmation RPC does not persist `debt_agreements.status = 'completed'`.
- P1: push subscriptions are stored and the service worker can receive pushes, but the edge function never dispatches Web Push and chat send paths do not invoke it.
- P1: the coffee/payment gateway is intentionally disabled in production code.
- P1: `PasswordConfirmDialog` still uses `signInWithPassword` as reauth and allows OAuth users to continue with text confirmation only.
- P2: direct chat creation is partly hardened, but `direct_chats` lacks `auth.users` FKs and the server RPC inserts unsorted IDs despite the table ordering constraint.

## Findings

| module | severity | evidence | root_cause | impact | fix_plan | tests | status |
|---|---|---|---|---|---|---|---|
| Baseline & Docs Reconciliation | P1 | `BUG_REPORT.md:56-96` has blockers; `task.md:1-80` marks many related tasks done; `scripts/predeploy-audit.mjs:303-390` treats unchecked items in `Partial / Needs Backend` and `Still Open` as release blockers. | Doc drift and blocker source-of-truth split. `task.md` is completion-oriented while `BUG_REPORT.md` remains the release gate. | `npm run audit:predeploy` fails even when code gates pass. Release readiness is ambiguous. | Keep `BUG_REPORT.md` as release gate; update each unchecked item only after a confirmed fix or approved waiver. Link this report from release notes and convert stale items to checked with evidence in a dedicated doc cleanup PR. | Run `npm run audit:predeploy` after doc reconciliation. | confirmed open |
| Supabase Backend / Payment RPC | P0 | `PaymentDialog.tsx:356-409` inserts `slip_verifications`, updates `installments`, then inserts notification from client. `useDebtAgreements.ts:430-487` performs the same multi-step mutation. `PaymentCalendar.tsx:548-558` uploads storage before DB update. | Storage and DB state are coordinated by client best-effort rollback instead of one authoritative server transaction/reservation flow. | Orphaned slip files, partial payment state, duplicate pending submissions under race, and notification/state mismatch. Money/payment correctness remains release-blocking. | Add server-owned `submit_installment_slip` or edge function flow. It must validate actor, lock agreement/installment, reserve or validate storage path, upsert pending verification, update installment, and create notification atomically on the DB side. Client becomes UX guard only. Add cleanup/GC for abandoned reserved storage paths. | SQL/RLS race tests for duplicate submit, wrong actor, paid installment, storage path ownership. Component/hook tests for duplicate click guard and failure UI. | confirmed open |
| Agreement / Debt / Payment Completion | P1 | Latest `confirm_installment_payment` definition updates verification and installment at `supabase/migrations/20260407190000_fix_p3_rls_policies.sql:243-267`, then returns at `:289-296`; it does not update `debt_agreements.status`. Quota functions count agreements with `status NOT IN ('completed','cancelled')` in older quota migrations. UI infers completion in domain code. | Server status transition was never added after the payment-confirmation transaction. Completion became a client/domain-derived state. | Fully paid agreements can still count as active for quota, admin/reporting, and history. Any workflow relying on DB status sees stale data. | In `confirm_installment_payment`, after extra-payment processing, lock remaining installments for the agreement and set `debt_agreements.status = 'completed'` when no payable installments remain unpaid. Keep UI derived status as display fallback only. | SQL tests: last installment confirmation completes agreement; extra payment closes future installments and completes when appropriate; partial schedule stays active. Domain tests should match DB status. | confirmed open |
| Chat / Notifications / PWA Push | P1 | `send-chat-push-notification/index.ts:224-274` counts subscriptions and inserts an in-app notification, then returns `pushDispatched: false`. `ChatRoom` message insert paths are not wired to invoke the function. | Subscription capture and service worker support were implemented, but Web Push/VAPID dispatch and send-path integration were not completed. | Browser push notifications never reach devices, despite users granting permission. In-app notifications can diverge from actual push behavior. | Add VAPID/Web Push sending inside the edge function with per-subscription failure cleanup. Invoke from chat send path or from a server queue/DB webhook after successful message insert. Keep JWT enabled and validate sender/recipient scope server-side. | Edge function unit test with mocked Web Push; browser smoke test for subscribe, send message, receive push; regression test for unauthorized sender. | confirmed open |
| Billing / Subscription | P1 | `Subscription.tsx:66` sets `paymentGatewayEnabled = false`; `Subscription.tsx:101-115` blocks purchase and throws. `useSubscription.ts:111` also disables gateway; `useSubscription.ts:233-249` throws before `record_agreement_payment`. | Monetization path is intentionally stubbed. Backend credit RPCs exist, but trusted checkout/webhook integration is missing. | Users cannot buy agreement credits. If quota is exhausted, agreement creation becomes blocked by design. | Integrate a real payment provider checkout and service-role webhook. Only webhook should call payment completion/credit RPCs. If not shipping billing, add explicit release waiver/feature disable for C-02. | Checkout/webhook integration tests; RPC tests for credit grant authorization; browser smoke for quota exhausted purchase flow. | confirmed open |
| Auth / Step-up Verification | P1 | `PasswordConfirmDialog.tsx:70-78` detects Google OAuth and uses text confirmation; `PasswordConfirmDialog.tsx:120-123` verifies password by calling `supabase.auth.signInWithPassword`. | Step-up auth is implemented as a fresh login side effect, not a server-verified recent-auth challenge. OAuth fallback is only user intent confirmation. | Sensitive actions can rely on weak or session-mutating verification. OAuth users do not get equivalent reauth. | Replace with Supabase reauthentication/recent-session challenge where available, or a server-side step-up RPC/edge function that records a short-lived verified action token. OAuth users need provider reauth or a stronger server challenge. | Component tests for OAuth/password branches; auth integration test that stale sessions cannot pass sensitive action; regression test that failed attempts rate-limit. | confirmed open |
| Chat / Direct Rooms | P2 | `direct_chats` table has `user1_id UUID NOT NULL`, `user2_id UUID NOT NULL`, and no `REFERENCES auth.users` at `20260131102545_e259a4da...sql:2-12`. `create_direct_chat_room` inserts `(v_caller_id, p_other_user_id)` without sorting at `20260407051000_fix_chat_rooms_insert_policy.sql:77-81`, despite `direct_chats_user_order`. Client still inserts directly in `Chat.tsx:458-463` with duplicate retry at `:465-499`. | Direct-room hardening was split between client logic, RLS, unique ordering, and an unused RPC. The server RPC does not follow the table invariant. | Orphaned direct chats can survive deleted users. The RPC can fail for valid users depending on UUID order. Client bypasses the intended server creation API. | Cleanup orphans, add FK constraints to `auth.users(id)` with appropriate delete behavior, fix RPC to use `LEAST/GREATEST`, and move client creation to the RPC. Keep duplicate retry server-side. | SQL tests for both UUID orders, deleted user cleanup, not-friends rejection, duplicate concurrent creation. Chat component test for RPC error handling. | confirmed open |
| Chat / Realtime Scale | P2 | `useGlobalChatNotification.ts:82-121` fetches all agreement/direct IDs for the user. `useGlobalChatNotification.ts:206-247` opens one realtime channel per agreement/direct chat target. | Broad all-message subscription was fixed, but the replacement is per-target subscription fan-out. | Users with many debts/direct chats can create many channels and cause refetch storms on inserts. This is reliability/performance risk rather than data leak. | Prefer one server-side unread summary source or a smaller number of scoped channels. Debounce `refreshChatTargets`, separate message count refresh from target refresh, and cap/fallback for high-cardinality users. | Hook tests for channel cleanup and debounced refetch. Browser smoke with many chats. | open performance risk |
| Admin / Audit / Roles | P2 | Role mutations are guarded by `grant_user_role`/`revoke_user_role` and trigger enforcement at `20260406130000_harden_admin_code_and_role_mutations.sql:105-180`. Admin pages query `activity_logs` directly, e.g. `src/pages/AdminHub.tsx:66`. | Mutation hardening is present. Read-side audit queries still depend on RLS/admin session correctness and need production policy verification. | Static pass did not prove an immediate bypass, but admin audit visibility should be verified with non-admin users. | Add explicit RLS tests for `activity_logs` select paths. Consider admin audit RPC if direct table reads need stricter output shaping. | Supabase local tests: admin can read expected logs, non-admin cannot, moderator behavior matches policy. | needs verification |
| Friends / Points / Reschedule | P3 | `accept_friend_request` locks request and writes both friend rows in RPC at `20260404143000_harden_friend_points_atomicity.sql:27-104`; untracked `20260425110000_fix_friends_unique_constraint.sql:54-152` further hardens duplicate handling. `earn_points` locks the user row at `20260404143000_harden_friend_points_atomicity.sql:106-220`. Reschedule RPCs validate borrower/lender and lock rows at `20260407120000_fix_reschedule_request_validation.sql:4-220`. | Earlier client-only and rollback fixes have been moved into RPC/locking flows. The remaining concern is migration deployment/verification, especially the untracked friends constraint migration. | Low residual risk after migrations, but production can still fail if constraints are missing or migration order differs. | Keep these `BUG_REPORT.md` items stale/fixed only after Supabase local migration replay and production schema verification. Commit or intentionally discard the untracked friends migration after review. | Supabase local migration replay; friend accept duplicate/orphan tests; points idempotency tests; reschedule duplicate/paid-installment tests. | mostly stale, verify untracked migration |
| Storage / Upload Validation | P3 | Avatar MIME hardening exists in `20260404183000_harden_avatar_storage.sql`; payment slip upload utilities validate magic bytes and storage path ownership; payment-slip storage policies are in `20260402100000_harden_payment_slips_storage.sql`. | File validation gaps were mostly fixed in storage policy and utility layers. The remaining storage risk is transactional ownership with payment DB rows. | Avatar MIME issue appears stale. Payment slip replacement/orphan risk remains covered by P0 payment finding. | Do not reopen avatar item unless local storage policy replay fails. Fold payment slip replacement into server-owned submit flow. | Storage policy tests for avatar/payment buckets and invalid MIME/path. | mostly stale |
| PDF / Money / Dates | P3 | Domain code now has money/date tests and PDF timestamp inputs are passed separately from `DebtDetail`; `debtStrategies` has frequency-aware tests. | Previous bugs were fixed in utility/domain layers; no new P0/P1 issue found in static pass. | Residual risk is regression from future schedule/PDF layout changes. | Keep targeted unit tests; add one browser/PDF smoke on iOS/PWA if release scope includes PDF export. | Existing unit tests plus manual PDF smoke. | stale/fixed |

## BUG_REPORT.md Reconciliation

| item | current status | evidence / note | next action |
|---|---|---|---|
| C-02 Payment Gateway Not Integrated | still open | gateway disabled in `Subscription.tsx:66` and `useSubscription.ts:111` | fix or waive feature |
| C-03 Push Notifications Never Dispatched | still open | edge function returns `pushDispatched: false` | implement Web Push dispatch |
| C-06 Non-Atomic Payment Confirmation | still open | client writes payment submission state across multiple tables | server submit RPC/edge function |
| C-07 Double Payment Submission Possible | still open as race class | partial unique index helps DB duplicates, but storage/DB client flow remains non-atomic | server submit RPC/edge function |
| C-08 processExtraPayment Called After Paid | likely fixed, needs SQL regression | latest `confirm_installment_payment` locks installment and verification before update | add regression test and then check off |
| C-09 TransferProofSection server enforcement | still partial | storage/RLS exists, but transfer proof should follow same server-owned submit pattern | verify or fold into payment submit API |
| C-11 Reschedule enforcement | stale/fixed | reschedule RPCs validate actor and lock rows | local Supabase test, then check off |
| C-12 Payment Completion TOCTOU | still open | agreement completion is not persisted in payment RPC | update RPC and tests |
| C-13 Points atomicity | stale/fixed | `earn_points` uses row lock and idempotency | local Supabase test, then check off |
| C-14 Friend request atomicity | mostly fixed, pending untracked migration decision | RPC exists; untracked migration fixes missing constraint resilience | review/commit migration, then check off |
| C-17 CreateAgreement quota/create atomic | stale/fixed | `create_agreement_with_installments` calls quota/credit RPCs in latest hardening migrations | add replay test, then check off |
| C-23 PasswordConfirmDialog | still open | uses `signInWithPassword`; OAuth text confirm only | implement real step-up auth |
| C-30 Orphaned row prevention | still open under payment submit | rollback is best-effort client logic | server transaction + storage reservation |
| H-05 Direct chat TOCTOU | mostly fixed, but server API mismatch remains | client handles duplicate 23505; RPC unsorted IDs | fix RPC and move client to RPC |
| H-07 Avatar MIME | stale/fixed | storage policy and magic-byte validation exist | storage policy replay test |
| H-11 AdminHub audit query | needs verification | no static bypass found; direct table reads depend on RLS | add RLS read tests |
| H-12 Role mutation hardening | stale/fixed | trigger requires RPC source; grant/revoke RPCs exist | local RLS/RPC tests |
| H-14/H-15/H-16 Extra payment logic | mostly fixed | extra payment is server RPC and latest confirm RPC calls it under lock | SQL tests for rounding/closing/completion |
| H-17 PaymentDialog server identity | partly fixed | confirm/reject RPC checks lender; submit path still client-write | keep open under payment submit |
| H-18 Payment slip replacement race | still open under payment submit | client replaces slip verification/installment state | server submit RPC/edge function |
| H-22 PDF confirmed timestamps | stale/fixed | DebtDetail passes separate lender/borrower confirmed timestamps | keep PDF regression smoke |
| H-23 debtStrategies daily assumption | stale/fixed | frequency-aware tests exist | keep unit tests |
| H-24 pdfExport page-break/header | stale/fixed enough | page-break handling exists; no static release blocker found | manual PDF smoke |
| H-26/H-27 Chat N+1/.single | stale/fixed | thread summaries use RPC; duplicate/error handling improved | keep chat smoke |
| H-28/H-33/H-35 Global realtime | fixed for data leak, open for scale | not broad all-message now; still one channel per chat target | performance refactor |
| H-31 Typing race | stale/fixed enough | cleanup/maybeSingle pattern reduced race | add hook test if keeping item |
| H-32 AudioContext leak | stale/fixed | hook cleanup closes/disconnects audio context | keep hook test |
| H-36 useFriends stale closures | stale/removed | no tracked `useFriends` hook found in current file list | remove from blocker list |
| H-46 downgrade expired trials | stale/fixed | migration resets `is_trial = false` and `trial_ends_at = NULL` | replay test |
| H-49 chat_rooms insert policy | stale/fixed | service-role-only insert plus creation RPC exists | verify RLS |
| H-50 chat rooms/direct chats missing FKs | still open | `direct_chats.user1_id/user2_id` lack FKs | add cleanup + FK migration |
| H-51 chat_rooms trigger user2 bug | stale/fixed | trigger uses `NEW.user1_id`/`NEW.user2_id`; no current static bug found | add trigger test, then check off |

## Recommended Fix Order

1. Fix P0 payment submit atomicity first. This collapses C-06, C-07, C-09, C-30, H-17, and H-18 into one backend-owned flow.
2. Fix payment completion persistence in `confirm_installment_payment`. This addresses C-12 and quota/history inconsistency.
3. Decide release policy for billing and push. Either implement C-02/C-03 or explicitly waive/disable those features in `deploy/release-waivers.json`.
4. Replace password confirmation with real step-up auth.
5. Fix direct chat server API and FKs, then move client creation to the RPC.
6. Run Supabase local migration replay and RLS tests, then reconcile stale `BUG_REPORT.md` entries.

## Verification Plan

After each fix batch:

- `npm run typecheck`
- `npm run test:run`
- `npm run build`
- `npm run audit:predeploy`

Targeted additions:

- SQL/RLS tests for payment submit, payment completion, direct chat creation, role/audit read policies, friend accept, quota usage.
- Hook/component tests for duplicate submit guards, auth step-up branches, realtime cleanup/debounce, payment dialogs.
- Browser smoke tests for auth, create agreement, upload/confirm payment, chat push, notifications, admin, and PDF export.

