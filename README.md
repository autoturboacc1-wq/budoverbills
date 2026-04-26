<div align="center">

# Bud Over Bills (BOB)

### บันทึกและจัดการคำมั่น&middot;ข้อตกลงเงินกู้ระหว่างเพื่อน เพื่อรักษามิตรภาพ

*A Thai-first Progressive Web App for personal lending agreements between friends &mdash; built so money never gets in the way of friendship.*

<br />

[![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![React](https://img.shields.io/badge/React-18.3-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind](https://img.shields.io/badge/Tailwind-3.4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![shadcn/ui](https://img.shields.io/badge/shadcn%2Fui-Radix-000000)](https://ui.shadcn.com/)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20RLS-3FCF8E?logo=supabase&logoColor=white)](https://supabase.com/)
[![PWA](https://img.shields.io/badge/PWA-installable-5A0FC8?logo=pwa&logoColor=white)](https://web.dev/progressive-web-apps/)
[![Sentry](https://img.shields.io/badge/Sentry-monitored-362D59?logo=sentry&logoColor=white)](https://sentry.io/)
[![Vitest](https://img.shields.io/badge/Vitest-3-6E9F18?logo=vitest&logoColor=white)](https://vitest.dev/)
[![License](https://img.shields.io/badge/License-Proprietary-red)](#license)

</div>

---

## Table of Contents

- [Overview](#overview)
- [Highlights](#highlights)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Available Scripts](#available-scripts)
- [Domain Layer](#domain-layer-the-rule-that-keeps-bugs-out)
- [Database &amp; RLS](#database--rls)
- [Edge Functions](#edge-functions)
- [Authentication &amp; Authorization](#authentication--authorization)
- [Testing](#testing)
- [Pre-deploy Audit](#pre-deploy-audit)
- [Deployment](#deployment)
- [Security &amp; Compliance](#security--compliance)
- [Internationalization](#internationalization)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

**Bud Over Bills** (BOB) คือแพลตฟอร์มสำหรับบันทึก แชร์ และจัดการ *ข้อตกลงเงินกู้ระหว่างบุคคล* (peer-to-peer loan agreements) อย่างโปร่งใส มีลายเซ็นดิจิทัลและหลักฐานการโอน เพื่อให้การยืม-คืนเงินระหว่างเพื่อน ครอบครัว และคนรู้จัก เป็นไปอย่างเป็นมิตรและตรวจสอบได้

> BOB lets two friends create a written, signed agreement, schedule installments, attach proof-of-transfer slips, and track repayment &mdash; all without a third-party intermediary holding their money.

**Who it's for:** consumers in Thailand who lend or borrow money from friends and want a structured, low-friction record &mdash; not a fintech or credit product.

**What it isn't:** BOB does not move money, does not extend credit, does not perform KYC, and is not a licensed financial institution. Funds are transferred peer-to-peer through normal Thai banking rails (PromptPay etc.); BOB just records the agreement and the proof.

---

## Highlights

| Capability | What it does |
|---|---|
| **Two-party signed contracts** | Lender drafts, borrower confirms; both parties typed-sign. Server re-hashes the snapshot with SHA-256 and refuses to sign tampered HTML. Thai national-ID checksum validated server-side. |
| **Installment scheduling** | Flexible installment plans with interest, principal/interest split tracking, overdue detection, reschedule requests with approval flow. |
| **PromptPay QR + slip upload** | Generates PromptPay QR for the lender's account; borrower uploads transfer slip. OCR badge surfaces extracted slip metadata. |
| **Verify-payment-slip edge function** | Server-side slip verification with structured trust signals before marking an installment paid. |
| **PDPA-compliant consent** | `agreement_pdpa_consents` is enforced at the RPC layer &mdash; you cannot sign without a recorded consent for `loan_contract_identity`. |
| **Realtime chat per agreement** | Threaded messaging tied to each agreement, with global cross-route notifications and push notifications via service worker. |
| **Friends graph** | Bidirectional friend requests power the lender/borrower selection. |
| **Admin console** | Two-tier auth (regular login + admin code session). Manage codes, security settings, user roles. |
| **Thai-first PWA** | Custom service worker (`public/sw.js`), `vite-plugin-pwa` with `injectManifest`, full splash-screen set, installable on iOS/Android. |
| **Observability** | Sentry React SDK wired into root error boundaries, route-level boundaries on sensitive flows (chat, contract). |

---

## Tech Stack

### Frontend

| Layer | Choice | Notes |
|---|---|---|
| Build tool | **Vite 6** + `@vitejs/plugin-react-swc` | SWC for fast HMR; PWA via `vite-plugin-pwa` (injectManifest mode) |
| Framework | **React 18** + **TypeScript 5.8** | Strict project references (`tsc -b`) |
| Routing | **React Router v6** | Lazy-imported routes, `<ProtectedRoute>` gates |
| Data | **TanStack Query v5** | `staleTime: 60s`, `gcTime: 10m`, `retry: 2`, no refetch-on-focus |
| UI | **shadcn/ui** + **Radix Primitives** + **Tailwind CSS** | Vendored under [src/components/ui/](src/components/ui/) |
| Forms | **react-hook-form** + **zod** + `@hookform/resolvers` | |
| Animation | **framer-motion** | Page transitions in [AnimatedRoutes](src/App.tsx) |
| Charts | **recharts** | Dashboard stats |
| PDF | **jspdf** | Contract export |
| QR | **qrcode.react** + **html5-qrcode** | PromptPay generation + scanning |
| Toasts | **sonner** | |
| Theming | **next-themes** | Light/dark + custom palettes |
| Monitoring | **@sentry/react** | DSN via `VITE_SENTRY_DSN` |

### Backend

| Layer | Choice | Notes |
|---|---|---|
| Database | **Supabase Postgres** | ~131 migrations under [supabase/migrations/](supabase/migrations/) &mdash; the source of truth for schema and policies |
| Authorization | **Postgres RLS** | Enforced on every table; cross-user writes go through SECURITY DEFINER RPCs |
| Auth | **Supabase Auth** | Email/password; admin tier requires extra session step |
| Storage | **Supabase Storage** | Payment slips with hardened access policy &mdash; see [20260402100000_harden_payment_slips_storage.sql](supabase/migrations/20260402100000_harden_payment_slips_storage.sql) |
| Edge functions | **Deno + Supabase Functions** | See [Edge Functions](#edge-functions) |

### Tooling

| Tool | Purpose |
|---|---|
| **Vitest** + **jsdom** + **@testing-library/jest-dom** | Test runner + DOM env (setup in [src/test/setup.ts](src/test/setup.ts)) |
| **ESLint 9** + **typescript-eslint** | Lint with warning baseline at [deploy/lint-warning-baseline.json](deploy/lint-warning-baseline.json) |
| **scripts/predeploy-audit.mjs** | Strict release gate (typecheck + tests + build + baselines) |

---

## Architecture

```
                    Browser (Thai-first PWA)
              installable, offline-aware via sw.js
   ┌─────────────────────────────────────────────────────┐
   │  React 18 + TanStack Query + shadcn/ui + Tailwind   │
   │                                                     │
   │  ┌──────────────────────────────────────────────┐   │
   │  │  Provider tree (src/App.tsx)                 │   │
   │  │  Query → Auth → Theme → Language → Tooltip   │   │
   │  │  → Router → ErrorBoundary → Notifications    │   │
   │  │  → FriendRequests → GlobalChatNotifications  │   │
   │  └──────────────────────────────────────────────┘   │
   │                                                     │
   │  ┌──────────────────────────────────────────────┐   │
   │  │  Domain layer (src/domains/)                 │   │
   │  │  debt, role  ── single source of truth       │   │
   │  │  status / amounts / dates / role checks      │   │
   │  └──────────────────────────────────────────────┘   │
   │                                                     │
   │  Components under src/components/                   │
   │  Pages under src/pages/ (lazy-imported)             │
   └─────────────────┬───────────────────────────────────┘
                     │ HTTPS  (anon JWT in localStorage)
                     ▼
   ┌─────────────────────────────────────────────────────┐
   │                    Supabase                         │
   │                                                     │
   │  ┌─────────────┐   ┌──────────────────────────┐     │
   │  │   Auth      │   │   Postgres + RLS         │     │
   │  │             │   │   ~131 migrations        │     │
   │  └─────────────┘   │   SECURITY DEFINER RPCs  │     │
   │                    │   (cross-user writes)    │     │
   │  ┌─────────────┐   └──────────────────────────┘     │
   │  │   Storage   │                                    │
   │  │ slips/...   │   ┌──────────────────────────┐     │
   │  └─────────────┘   │   Edge Functions         │     │
   │                    │   payment-reminder-cron  │     │
   │                    │   notify-unconfirmed     │     │
   │                    │   downgrade-trials       │     │
   │                    │   verify-payment-slip    │     │
   │                    │   send-chat-push         │     │
   │                    │   admin-session          │     │
   │                    │   request-client-context │     │
   │                    └──────────────────────────┘     │
   └─────────────────────────────────────────────────────┘
```

The frontend talks **only** to Supabase. There is no separate API server. Authorization is enforced primarily through Postgres RLS policies; mutations that cross user boundaries (notify the other party, write to their data) go through SECURITY DEFINER RPCs rather than loosening RLS.

---

## Project Structure

```
budoverbills-main/
├── src/
│   ├── App.tsx                      # Provider tree + animated routes
│   ├── main.tsx                     # Sentry init + bootstrap
│   ├── pages/                       # Route components (lazy-loaded)
│   │   ├── Index.tsx                # Dashboard
│   │   ├── CreateAgreement.tsx      # Lender draft flow
│   │   ├── AgreementInvite.tsx      # Borrower invite link
│   │   ├── AgreementConfirm.tsx     # Borrower confirms terms
│   │   ├── AgreementContract.tsx    # Two-party signed contract
│   │   ├── DebtDetail.tsx           # Repayment + slips + reschedule
│   │   ├── Chat.tsx                 # Realtime per-agreement thread
│   │   ├── Friends.tsx              # Friend graph
│   │   ├── Profile.tsx | Settings.tsx
│   │   ├── PDPAConsent.tsx          # Required consent gate
│   │   └── admin/                   # Admin console (gated)
│   ├── components/
│   │   ├── ui/                      # shadcn/ui primitives (vendored)
│   │   ├── contract/                # Contract template + party form
│   │   ├── chat/ home/ admin/ shared/ ux/
│   │   └── PaymentSlipUpload.tsx, PromptPayQR.tsx, ...
│   ├── domains/                     # SINGLE SOURCE OF TRUTH
│   │   ├── debt/                    # status, amounts, installments
│   │   └── role/                    # lender/borrower role checks
│   ├── hooks/                       # React-query bindings
│   ├── contexts/                    # AuthContext, theme, language, ...
│   ├── integrations/supabase/       # client.ts, types.ts (generated)
│   ├── utils/                       # adminSession, paymentSlipStorage, ...
│   └── test/                        # Vitest setup + reactHarness
├── supabase/
│   ├── migrations/                  # ~131 SQL migrations (source of truth)
│   └── functions/                   # 7 Deno edge functions
├── public/
│   ├── sw.js                        # Custom service worker
│   ├── pwa-*.png splash-*.png       # Full PWA icon set
│   └── og-image.png ...
├── docs/
│   ├── pre-deploy-runbook.md        # Release sequence (binding)
│   ├── phase-1-critical.md          # Roadmap phases
│   └── phase-2/3/4-*.md
├── deploy/
│   ├── lint-warning-baseline.json   # Lint warning ceiling
│   ├── release-waivers.json         # BUG_REPORT.md exemptions
│   └── production-rollout-checklist.md
├── scripts/
│   └── predeploy-audit.mjs          # Strict release gate
├── vite.config.ts                   # Dev :8080, PWA, lovable-tagger (dev only)
├── tailwind.config.ts
├── tsconfig.json                    # Project references
└── package.json
```

The path alias `@/...` resolves to `./src`. **Use it in new code** instead of relative `../../` chains.

---

## Getting Started

### Prerequisites

- **Node.js >= 18** (LTS recommended). Install via [nvm](https://github.com/nvm-sh/nvm#installing-and-updating) for easy version switching.
- **npm >= 9** (ships with Node 18+).
- A **Supabase project** with the migrations from [supabase/migrations/](supabase/migrations/) applied. You'll need the project URL and the publishable (anon) key.

### Install

```sh
git clone <your-fork-url> budoverbills
cd budoverbills
npm install
```

### Configure environment

```sh
cp .env.example .env.local
# then edit .env.local with your Supabase URL + anon key
```

See [Environment Variables](#environment-variables) below for the full list.

### Run

```sh
npm run dev
```

Open [http://localhost:8080](http://localhost:8080). HMR is on; the app boots with the Thai locale.

### Build

```sh
npm run build       # Production
npm run preview     # Serve the production bundle locally
```

---

## Environment Variables

### Frontend (`.env.local`)

| Variable | Required | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | **Yes** | Your Supabase project URL. The client throws on missing &mdash; see [src/integrations/supabase/client.ts](src/integrations/supabase/client.ts). |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | **Yes** | Supabase anon (publishable) key. **Never** ship the service-role key to the client. |
| `VITE_SENTRY_DSN` | No | Enable Sentry error reporting. Leave blank in dev to skip init. |

### Edge functions (Supabase secrets)

Set in the Supabase dashboard or via `supabase secrets set ...`:

| Variable | Required by | Purpose |
|---|---|---|
| `SUPABASE_URL` | All functions | Auto-set by Supabase runtime |
| `SUPABASE_SERVICE_ROLE_KEY` | All functions | Privileged DB access; never log |
| `INTERNAL_FUNCTION_SECRET` | `payment-reminder-cron`, `notify-unconfirmed-transfers`, `downgrade-expired-trials` | Shared secret &mdash; these run with `verify_jwt = false` and authenticate via this header |

> **Warning** &mdash; The predeploy audit pins `verify_jwt` for each function. Flipping a function's JWT verification will fail the gate. See [scripts/predeploy-audit.mjs](scripts/predeploy-audit.mjs).

---

## Available Scripts

| Script | What it runs | When to use |
|---|---|---|
| `npm run dev` | Vite dev server on `:8080` | Local development with HMR |
| `npm run build` | Production build | Deployment artifact |
| `npm run build:dev` | Dev-mode build (keeps `lovable-tagger`) | Lovable preview environment |
| `npm run preview` | Serve the built bundle | Smoke-test the production output locally |
| `npm run lint` | ESLint over the whole repo | Before every push |
| `npm run typecheck` | `tsc -b` (project references) | Catches type errors fast |
| `npm run test` | Vitest in watch mode | Iterating on tests |
| `npm run test:run` | Vitest single run | CI-style |
| `npm run test:coverage` | v8 coverage scoped to `src/domains/**` and `src/utils/**` | Coverage report |
| `npm run audit:predeploy` | The strict release gate | **Required before production deploy** |

#### Run a single test

```sh
npx vitest run src/domains/debt/__tests__/calculateRemainingAmount.test.ts
npx vitest run -t "calculates remaining amount"
```

---

## Domain Layer &mdash; the rule that keeps bugs out

[src/domains/debt/index.ts](src/domains/debt/index.ts) is the **authoritative export** for all debt business logic. The header comment is a hard rule:

> UI components MUST use these helpers instead of:
> - direct status comparisons,
> - date math inline in JSX,
> - amount calculations in components,
> - role checks via raw `userId === ...` comparisons.

When fixing a bug like *"why does the borrower see 'completed' here but the lender sees 'overdue'?"*, the fix almost always belongs in a domain function &mdash; **not** in a component.

### Public surface (excerpt)

```ts
// Status
getAgreementDisplayStatus, getDebtCardStatus,
isAgreementPaymentReady, needsUserConfirmation

// Amounts
calculateRemainingAmount, calculatePaidAmount,
calculateInterestPaid, calculatePrincipalPaid,
countPaidInstallments, isAgreementEffectivelyCompleted

// Installments / dates
getNextInstallment, formatDueDate, calculateDaysUntilDue,
isInstallmentOverdue, getOverdueInstallments, isAgreementOverdue

// Roles (re-exported from src/domains/role/)
getUserRoleInAgreement, isUserLender, isUserBorrower
```

Tests live in [src/domains/debt/\_\_tests\_\_/](src/domains/debt/__tests__/) and are the highest-signal suite in the repo. Coverage config intentionally scopes to `src/domains/**` and `src/utils/**`.

---

## Database &amp; RLS

The schema and authorization model are defined entirely in SQL migrations under [supabase/migrations/](supabase/migrations/) &mdash; treat the migration history as the source of truth. As of this writing, ~131 migrations are applied.

Key principles:

1. **Every table has RLS enabled.** No exceptions.
2. **Cross-user writes go through SECURITY DEFINER RPCs.** Examples: `submit_installment_slip`, `sign_agreement_contract`. Loosening RLS to allow these would be wrong &mdash; the privileged path lets the function validate and audit before writing.
3. **Server-side validation is duplicated, not delegated.** The contract-signing RPC, for example, re-hashes the contract HTML with SHA-256 and refuses to sign tampered snapshots, and re-validates the Thai national ID checksum even though the form already did.
4. **Storage paths are scoped per agreement.** Cross-role reads are explicitly blocked &mdash; see [20260402100000_harden_payment_slips_storage.sql](supabase/migrations/20260402100000_harden_payment_slips_storage.sql). The predeploy smoke checklist verifies this still holds.

> **Do not hand-edit** [src/integrations/supabase/types.ts](src/integrations/supabase/types.ts). Regenerate it via the Supabase CLI after adding migrations.

---

## Edge Functions

Located under [supabase/functions/](supabase/functions/). Seven in total:

| Function | `verify_jwt` | Trigger | Purpose |
|---|---|---|---|
| `payment-reminder-cron` | `false` | Scheduled cron | Sends reminders for upcoming installments |
| `notify-unconfirmed-transfers` | `false` | Scheduled cron | Nags lenders who haven't confirmed received transfers |
| `downgrade-expired-trials` | `false` | Scheduled cron | Reverts expired trial accounts |
| `verify-payment-slip` | `true` | Client | Server-side slip verification + trust signals |
| `send-chat-push-notification` | `true` | Client | Sends web-push to the other party in a chat |
| `admin-session` | `true` | Client | Issues / validates the admin code session |
| `request-client-context` | `true` | Client | Returns IP/UA for audit logging |

The three cron functions authenticate via the `INTERNAL_FUNCTION_SECRET` header. The predeploy audit pins each function's `verify_jwt` value &mdash; changing it will fail the release gate.

---

## Authentication &amp; Authorization

[src/contexts/AuthContext.tsx](src/contexts/AuthContext.tsx) owns Supabase session state, profile fetching, password-recovery flag, and admin-session clearing.

- **JWT storage:** localStorage (acknowledged trade-off &mdash; see comment in [client.ts](src/integrations/supabase/client.ts)). The production mitigation is a **strict CSP** &mdash; do not introduce inline scripts or untrusted `script-src` origins.
- **Route gating:** `<ProtectedRoute>` for auth, `<ProtectedRoute requireAdminSession>` for admin pages.
- **Admin tier:** two-step. Regular login + a separate admin code session (`src/utils/adminSession.ts`, [AdminCodeLogin](src/pages/AdminCodeLogin.tsx)).
- **Error boundaries:** root [AppErrorBoundary](src/components/) plus [RouteErrorBoundary](src/components/) wrapping sensitive areas (chat, agreement confirm/contract).

---

## Testing

```sh
npm run test            # watch
npm run test:run        # single run
npm run test:coverage   # v8 coverage (scoped)
```

- jsdom + `@testing-library/jest-dom`, setup in [src/test/setup.ts](src/test/setup.ts).
- React-component tests should go through the harness in [src/test/reactHarness.tsx](src/test/reactHarness.tsx).
- The highest-signal suite is in [src/domains/debt/\_\_tests\_\_/](src/domains/debt/__tests__/) &mdash; pure-function tests for status, amounts, dates, and role logic.

Coverage is intentionally narrow (`src/domains/**`, `src/utils/**`) so that meaningful bugs &mdash; the kind that change what a user sees &mdash; are caught, without diluting the signal with low-value component-render assertions.

---

## Pre-deploy Audit

```sh
npm run audit:predeploy
```

This is the **binding gate for production**. It runs:

1. `typecheck`
2. `test:run`
3. `build`
4. Lint &mdash; fails if warnings exceed [deploy/lint-warning-baseline.json](deploy/lint-warning-baseline.json).
5. Verifies a **fixed list of required migrations** exists.
6. Verifies a **fixed list of edge functions** with the expected `verify_jwt` config.
7. Fails if [BUG_REPORT.md](BUG_REPORT.md) has unresolved entries that aren't waived in [deploy/release-waivers.json](deploy/release-waivers.json).

> **Never edit the baseline or waivers casually.** They are the release contract.

For the full rollout sequence see [docs/pre-deploy-runbook.md](docs/pre-deploy-runbook.md), with the step-by-step in [deploy/production-rollout-checklist.md](deploy/production-rollout-checklist.md).

---

## Deployment

The repo was originally scaffolded by Lovable (`lovable-tagger` is a dev-only Vite plugin, gated to `mode === "development"` in [vite.config.ts](vite.config.ts)). It can be edited and pushed normally. Production rollout in practice is governed by:

- [docs/pre-deploy-runbook.md](docs/pre-deploy-runbook.md)
- [deploy/production-rollout-checklist.md](deploy/production-rollout-checklist.md)

Hosting target: any static host that can serve the built `dist/`, plus your Supabase project (Postgres + Auth + Storage + Functions). The PWA service worker is generated at build time by `vite-plugin-pwa` (`injectManifest`).

---

## Security &amp; Compliance

- **PDPA** &mdash; The app records explicit consent in `agreement_pdpa_consents` before any signed contract exists. The `sign_agreement_contract` RPC refuses to proceed if `loan_contract_identity` consent is not on file for the signing user.
- **Thai national ID validation** &mdash; Validated client-side in [PartyInfoForm.tsx](src/components/contract/PartyInfoForm.tsx) and **re-validated server-side** in the RPC using the official Luhn-style weights `13..2`. Off-by-one weight bugs are tracked in migration history (e.g. [20260426030000_fix_id_card_checksum_weights.sql](supabase/migrations/20260426030000_fix_id_card_checksum_weights.sql)).
- **Contract integrity** &mdash; Signed contract HTML is hashed with SHA-256 server-side; mismatched hashes are rejected. The hash at sign-time is recorded in `agreement_signatures.contract_hash_at_sign` for audit.
- **Storage isolation** &mdash; Payment slips are scoped per-agreement. Cross-role reads (a third party reading another agreement's slip) are explicitly blocked at the storage policy level.
- **CSP** &mdash; localStorage JWT is mitigated by a strict Content Security Policy. **Do not** add inline scripts or untrusted script-src origins.
- **Sentry** &mdash; Wired in but optional; leave `VITE_SENTRY_DSN` blank to skip in dev.

If you find a security issue, please report it privately rather than filing a public issue.

---

## Internationalization

The app is **Thai-first**. The HTML root sets `lang="th"`, all default copy is Thai, and the contract template renders Thai legal text. A LanguageProvider is in the tree to support future locales. UI components should not hardcode currency formatting &mdash; use the helpers in [src/utils/](src/utils/).

---

## Contributing

1. **Read [CLAUDE.md](CLAUDE.md) first.** It contains binding architectural rules &mdash; especially the domain-layer rule (UI components must call `src/domains/debt/*` helpers, not re-derive status / role / amounts inline).
2. Create a feature branch off `main`.
3. Run `npm run lint && npm run typecheck && npm run test:run` locally.
4. Add tests for new domain logic in [src/domains/](src/domains/) and for new utils in [src/utils/](src/utils/).
5. Open a PR. For any change touching contracts, signatures, RLS, RPCs, storage policies, or edge-function `verify_jwt` config, expect a careful review &mdash; these are the load-bearing parts of the system.
6. Before merging anything tagged for release, ensure `npm run audit:predeploy` is green.

---

## License

Proprietary &mdash; all rights reserved. Contact the maintainers before reusing any portion of this codebase.

---

<div align="center">

**Bud Over Bills** &mdash; built for Thailand, with care.

</div>
