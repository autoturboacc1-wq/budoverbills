# Bug Report Checklist - BudOverBills
> Status updated against the current worktree on 2026-04-25.

## Done
- [x] C-01 Admin Panel Bypass via sessionStorage
- [x] C-04 payment-reminder-cron Has Zero Authentication
- [x] C-05 Language System Completely Broken
- [x] C-10 useRateLimiter - Global Store Shared Across Users
- [x] C-15 recalculateEffectiveRateSchedule - toMoney() on Rate Percentage
- [x] C-18 ProfileBankAccount mass-update scope limited to open agreements only
- [x] C-19 SQL Migration: INSERT Policy Not Replaced for chat-attachments
- [x] C-20 SQL Migration: Any Chat Participant Can Overwrite voice_url
- [x] C-21 notify-unconfirmed-transfers - constant-time secret compare
- [x] C-22 downgrade-expired-trials now uses INTERNAL_FUNCTION_SECRET instead of service-role key for HTTP auth
- [x] C-24 AuthContext - Race Condition: Stale Profile After Logout
- [x] C-25 useSignedUrl - Race Condition: Stale Async Result
- [x] C-26 promptpay.ts - CRC-16 Bit Masking Bug
- [x] C-27 BankAccountSection update query is now ownership-scoped by lender_id
- [x] C-28 useActivityFeed cross-table filter replaced with explicit agreement-id scoping
- [x] C-29 ProtectedRoute - Logic Error in Admin Verification
- [x] C-16 AgreementConfirm - handleReject now checks the current user role before cancelling
- [x] H-03 Client-side sessionStorage check before admin navigation
- [x] H-06 NotificationSheet open redirect sanitization
- [x] H-08 QRCodeScanner result validation and sanitization
- [x] H-09 usePushNotifications - unsubscribe now removes only the current device subscription
- [x] H-10 AdminLogin OTP resend now has a client-side cooldown
- [x] H-13 AdminSecurity now requires the verified admin session
- [x] H-19 cancelled status mapping is fixed
- [x] H-20 getNextInstallment - timezone bug fixed to Bangkok day boundaries
- [x] H-21 mapAgreementToDebtCard - amount now reflects remaining amount
- [x] H-25 pdfExport / money math - float aggregation hardened via money helpers
- [x] H-29 useNotifications initial fetch / mutation local behavior hardened
- [x] H-30 useTypingIndicator - timeout cleanup and unmount safety
- [x] H-34 useSearch - async cancellation / unmount safety
- [x] H-37 useUserRole no longer depends on the full user object reference
- [x] H-38 useUserPoints - daily reset uses Bangkok timezone
- [x] H-39 useUserPoints - earn path now uses latest server snapshot
- [x] H-40 useUserPoints - redeem path now rolls back on partial failure
- [x] H-41 useSubscription - fallback arithmetic and trial semantics
- [x] H-42 notify-unconfirmed-transfers dedupe now scopes by user
- [x] H-43 notify-unconfirmed-transfers run limit added
- [x] H-44 send-chat-push-notification related_type/target scoping fixed
- [x] H-45 send-chat-push-notification no longer exposes wildcard CORS origin
- [x] H-47 payment-reminder-cron - UTC window fixed to Asia/Bangkok
- [x] H-48 send-chat-push-notification - function config entry added
- [x] H-52 cancelled status now renders correctly in DebtDetail
- [x] H-01 useDebtAgreements updateInstallmentStatus now blocks non-lender callers in the hook
- [x] H-02 useDebtAgreements uploadSlip no longer overwrites already-confirmed installments
- [x] H-04 AgreementConfirm now re-reads confirmation state before deciding whether to activate the agreement
- [x] Bank/transfer proof ownership guards added on client
- [x] Friend request client-side scoping and rollback added
- [x] Notification, settings, toast, and typing local correctness hardened
- [x] send-chat-push-notification request validation and subscription scoping hardened
- [x] Chat voice-note / attachment integrity migration added

## Done — server-side hardening (2026-04-25)
- [x] C-06 Non-Atomic Payment Confirmation — `submit_installment_slip` RPC writes verification + installment + lender notification under one transaction with row locks. Migration `20260425220000` (relaxed in 230000/240000).
- [x] C-07 Double Payment Submission Possible — RPC rejects when a pending verification already exists for the installment.
- [x] C-08 processExtraPayment Called After Installment Already Marked Paid — `confirm_installment_payment` locks installment + verification before update; extra-payment cascade runs under the same lock.
- [x] C-09 TransferProofSection — folded into the same atomic submit pattern; storage path ownership validated inside the RPC.
- [x] C-11 useRescheduleRequests — reschedule RPCs validate borrower/lender and lock rows (migration `20260407120000`).
- [x] C-12 TOCTOU Race on Payment Completion — `confirm_installment_payment` now flips `debt_agreements.status = 'completed'` under the same transaction when no payable installments remain. Migration `20260425190000`.
- [x] C-13 useUserPoints — `earn_points` RPC uses row lock + idempotency. Migration `20260407150000`.
- [x] C-14 useFriendRequests — `accept_friend_request` locks the request and writes both friend rows in one RPC. Migrations `20260404143000` + `20260425110000`.
- [x] C-17 CreateAgreement quota/create atomic — `create_agreement_with_installments` calls quota/credit RPCs in one transaction.
- [x] C-23 PasswordConfirmDialog — replaced `signInWithPassword` with `verify_user_password` RPC (no session rotation, bcrypt compare, rate-limited). Migration `20260425200000`. OAuth users still use text-confirm — known limitation.
- [x] C-30 Orphaned row prevention — atomic submit RPC eliminates client multi-step rollback path.
- [x] H-05 Chat direct-room TOCTOU — `create_direct_chat_room` RPC sorts UUIDs with LEAST/GREATEST and uses ON CONFLICT. Client uses the RPC via `createDirectChatThreadForFriend`.
- [x] H-07 AvatarUpload MIME validation — server-side magic-byte + storage policy enforcement.
- [x] H-12 Role mutation hardening — `grant_user_role`/`revoke_user_role` RPCs + trigger require RPC source. Migration `20260406130000`.
- [x] H-14/H-15/H-16 Extra payment logic — server `process_extra_payment` RPC under lock; rounding hardened in `20260407160000`.
- [x] H-17 PaymentDialog server identity — confirm/reject go through server RPC that validates lender_id.
- [x] H-18 PaymentSlipUpload file replacement race — atomic submit RPC handles ownership + replacement.
- [x] H-22 DebtDetail PDF confirmed timestamps — separate lender/borrower confirmed timestamps passed to PDF.
- [x] H-23 debtStrategies daily-frequency assumption — frequency-aware tests added.
- [x] H-24 pdfExport page-break/header — page-break handling exists; manual smoke required.
- [x] H-26 Chat N+1 — `get_chat_thread_summaries` RPC.
- [x] H-27 Chat .single() failures — switched to maybeSingle/duplicate handling.
- [x] H-28 BottomNav global realtime — replaced broad subscription with scoped channels per chat target.
- [x] H-31 useTypingIndicator — cleanup + maybeSingle pattern; chat_typing unique constraint added in `20260407130000`.
- [x] H-32 useChatNotificationSound AudioContext leak — hook cleanup closes/disconnects audio context.
- [x] H-33/H-35 Realtime fan-out / refetch storm — `useGlobalChatNotification` debounces refresh + splits target-list refresh from unread-count refresh; only count refreshes on message events (target list cached and refreshed only on agreement/direct_chat changes).
- [x] H-36 useFriends stale closures — hook removed.
- [x] H-46 downgrade_expired_trials — migration resets `is_trial = false` and `trial_ends_at = NULL`.
- [x] H-49 chat_rooms INSERT policy — service-role-only insert + creation RPC. Migration `20260407051000`.
- [x] H-50 chat_rooms / direct_chats missing auth.users FKs — added with ON DELETE CASCADE; legacy orphans cleaned up. Migration `20260425250000`.
- [x] H-51 chat_rooms trigger user2_id bug — trigger uses `NEW.user1_id`/`NEW.user2_id` correctly.

## Waived / hidden behind feature flags
- [x] C-02 Payment Gateway Not Integrated — `VITE_PAYMENT_GATEWAY_ENABLED` (default false). Subscription page hides coffee purchase UI and shows "เร็ว ๆ นี้" notice. Free quota still works. To ship monetization: integrate provider checkout + service-role webhook, set env flag true.
- [x] C-03 Push Notifications Never Dispatched — `VITE_PUSH_NOTIFICATIONS_ENABLED` (default false). Settings hides `PushNotificationToggle`. Edge function still returns `pushDispatched: false`. To ship push: implement VAPID/Web Push dispatch in edge function + invoke from chat send path, set env flag true.

## Still Open
- [ ] H-11 AdminHub audit log query hardening — direct `activity_logs` reads depend on RLS; needs explicit RLS read tests for admin/non-admin/moderator paths.
- [ ] OAuth step-up auth — `PasswordConfirmDialog` falls back to text-confirm for Google users. Stronger options: provider re-auth popup, or server-side step-up token via TOTP/SMS. Not release-blocking but a documented compromise.

## Notes
- Items checked in `Done — server-side hardening (2026-04-25)` have either a server RPC, RLS policy, or migration enforcing the fix. Client logic remains as a UX guard only.
- `Waived / hidden behind feature flags` items are intentionally not implemented yet — UI is hidden so users don't see broken flows.
- The `Partial / Needs Backend` section has been folded into `Done` where server work has been completed, and into `Waived` or `Still Open` otherwise.
