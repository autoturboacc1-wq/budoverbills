# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
npm run dev              # Vite dev server on :8080
npm run build            # Production build
npm run build:dev        # Dev-mode build (keeps lovable-tagger)
npm run lint             # ESLint over the whole repo
npm run typecheck        # tsc -b (project references)
npm run test             # vitest (watch)
npm run test:run         # vitest single run
npm run test:coverage    # v8 coverage (scoped to src/domains/** and src/utils/**)
npm run audit:predeploy  # Strict release gate — see docs/pre-deploy-runbook.md
```

Run a single test file or test name:

```sh
npx vitest run src/domains/debt/__tests__/calculateRemainingAmount.test.ts
npx vitest run -t "calculates remaining amount"
```

Tests use jsdom + `@testing-library/jest-dom` (setup in `src/test/setup.ts`). React-component tests should go through the harness in `src/test/reactHarness.tsx`.

The path alias `@/...` resolves to `./src`. Use it in new code instead of relative `../../` chains.

## Release / pre-deploy

`npm run audit:predeploy` (script: `scripts/predeploy-audit.mjs`) is the binding gate for production. It runs `typecheck`, `test:run`, `build`, enforces lint warnings stay at/under `deploy/lint-warning-baseline.json`, verifies a fixed list of required migrations and edge functions exist with the expected `verify_jwt` config, and fails if `BUG_REPORT.md` has unresolved entries that aren't waived in `deploy/release-waivers.json`. Never edit the baseline or waivers casually — they're the release contract. See `docs/pre-deploy-runbook.md` for the full rollout sequence and `deploy/production-rollout-checklist.md` for the step-by-step.

## Architecture

**Frontend stack:** Vite 6 + React 18 + TypeScript + React Router v6 + TanStack Query + shadcn-ui (Radix) + Tailwind + framer-motion. The app is a Thai-first PWA (custom service worker at `public/sw.js`, configured in `vite.config.ts` via `vite-plugin-pwa` with `injectManifest`). Sentry is wired in via `@sentry/react`.

**Backend:** Supabase (Postgres + Auth + Storage + Edge Functions). The frontend talks only to Supabase — there is no separate API server. Authorization is enforced primarily through Postgres RLS policies in `supabase/migrations/` (~120 migration files; treat the migration history as the source of truth for schema and policies).

### Provider tree (`src/App.tsx`)

`QueryClientProvider → AuthProvider → ThemeProvider → LanguageProvider → TooltipProvider → BrowserRouter → AppErrorBoundary → NotificationsProvider → FriendRequestsProvider → GlobalChatNotificationProvider → AnimatedRoutes`. All page components are `lazy()`-imported and wrapped in a Suspense fallback; sensitive areas (chat, agreement confirm/contract) are additionally wrapped in `RouteErrorBoundary`. Route-gating is done with `<ProtectedRoute>` (auth) and `<ProtectedRoute requireAdminSession>` (admin).

The `QueryClient` is constructed inside the App component (not at module scope) with `staleTime: 60s`, `gcTime: 10m`, `retry: 2`, `refetchOnWindowFocus: false`. Keep this — it's been tuned.

### Domain layer (`src/domains/`) — single source of truth

`src/domains/debt/index.ts` is the authoritative export for all debt business logic: status derivation, role checks (lender vs borrower), remaining/paid amount math, installment scheduling, and agreement→DebtCard mapping. The header comment is a hard rule: **UI components must call these helpers** rather than re-deriving status, doing date math inline, or comparing `userId` to figure out roles. When fixing bugs that involve "what does the user see for this agreement," the fix almost always belongs in a domain file, not in a component. `src/domains/role/` mirrors this for role logic. Tests for these live in `src/domains/*/__tests__/` and are the highest-signal suite — coverage config intentionally scopes to `src/domains/**` and `src/utils/**`.

### Data layer

- **Supabase client:** `src/integrations/supabase/client.ts`. `src/integrations/supabase/types.ts` is auto-generated from the DB schema — **do not hand-edit**; regenerate via Supabase CLI when migrations change.
- **Hooks in `src/hooks/`** are the React-query bindings (`useDebtAgreements`, `useRescheduleRequests`, `useNotifications`, `useFriendRequests`, etc.). Provider-style hooks (`NotificationsProvider`, `FriendRequestsProvider`, `GlobalChatNotificationProvider`) are mounted in `App.tsx` and expose context to the whole tree — don't instantiate them per-page.
- **Mutations frequently go through SECURITY DEFINER RPCs** (e.g. `submit_installment_slip`) rather than raw table inserts, because RLS plus cross-user notification inserts need a privileged path. When adding a feature that crosses user boundaries (notify the other party, write to their data), prefer adding/extending an RPC over loosening RLS.

### Auth

`src/contexts/AuthContext.tsx` owns Supabase session state, profile fetching, password-recovery flag, and admin-session clearing. JWT is stored in `localStorage` (acknowledged trade-off, see comment in `client.ts`); the production mitigation is a strict CSP — don't introduce inline scripts or untrusted script-src origins. Admin gating is two-tier: regular login + a separate admin-session step (`src/utils/adminSession.ts`, pages under `src/pages/admin/` and `AdminCodeLogin`).

### Edge Functions (`supabase/functions/`)

`payment-reminder-cron`, `notify-unconfirmed-transfers`, `downgrade-expired-trials` run with `verify_jwt = false` and authenticate via `INTERNAL_FUNCTION_SECRET`. `send-chat-push-notification` runs with `verify_jwt = true` (called from the client). The predeploy audit pins these expectations — flipping `verify_jwt` will fail the gate.

### Storage / payment slips

Storage paths and access for payment slips are governed by migrations like `20260402100000_harden_payment_slips_storage.sql`. Helper utilities are in `src/utils/paymentSlipStorage.ts` and `src/components/PaymentSlipUpload.tsx`. Cross-role access (third party reading another agreement's slip) must remain blocked — the predeploy smoke checklist explicitly verifies this.

### UI conventions

- shadcn-ui primitives live under `src/components/ui/`; treat them as vendored — modify with care because they're shared across the app.
- App-level error boundaries: `AppErrorBoundary` (root) and `RouteErrorBoundary` (per-page). Wrap any new high-risk route in the latter with a Thai `area` label matching the surrounding pattern.
- Feature components live flat under `src/components/` with thematic subfolders (`admin/`, `chat/`, `contract/`, `home/`, `shared/`, `ux/`).

### Required env

Frontend needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (`client.ts` throws on missing). `VITE_SENTRY_DSN` is optional. Edge functions in production need `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `INTERNAL_FUNCTION_SECRET` set in Supabase secrets.

## Project origin

Originally scaffolded by Lovable (`lovable-tagger` is a dev-only Vite plugin, gated to `mode === "development"` in `vite.config.ts`). The repo can be edited and pushed normally; the README's deploy instructions point at Lovable but production rollout in practice is governed by `docs/pre-deploy-runbook.md` and the `deploy/` directory.
