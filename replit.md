# Akure Airport Staff Cooperative Multipurpose Society

## Overview

Full-stack web application for the Akure Airport Staff Cooperative Multipurpose Society.
pnpm monorepo using TypeScript. Each package manages its own dependencies.

## Project Structure

```
artifacts/
  api-server/     — Express 5 backend + serves cooperative frontend in dev/prod
  cooperative/    — React + Vite frontend (proxied via api-server)
  mockup-sandbox/ — Design mockup sandbox (dev only)
lib/
  api-spec/       — OpenAPI spec + Orval codegen
  api-client-react/ — Generated React Query hooks
  api-zod/        — Generated Zod schemas
  db/             — Drizzle ORM schema + migrations
```

## Stack

- **Monorepo**: pnpm workspaces
- **Node.js**: 24
- **Frontend**: React + Vite + shadcn/ui + Tailwind CSS v4 + Wouter routing
- **Backend**: Express 5 + pino logging
- **Auth**: Clerk (OTP email, 5 roles)
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod, drizzle-zod
- **API codegen**: Orval (OpenAPI spec → React Query hooks + Zod schemas)
- **Build**: esbuild

## Architecture

The API server (port 8080) serves as the single entry point:
- In **development**: proxies all non-API requests to the Vite dev server (port 5173)
- In **production**: serves built frontend static files from `cooperative/dist/public`

The `dev-start.mjs` script in `api-server/` starts both:
1. The Vite dev server for the cooperative frontend (port 5173)
2. The API Express server (port 8080, which proxies to 5173)

## Running on Replit

The app is started via the managed **`artifacts/api-server: API Server`** workflow, which:
1. Builds the API server (`esbuild`)
2. Starts the Vite dev server for the cooperative frontend (port 5173)
3. Starts the Express API server (port 8080), which proxies all non-API traffic to Vite

**Required secrets** (already configured in Replit Secrets):
- `DATABASE_URL` — PostgreSQL connection string
- `CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` — Clerk auth keys
- `VITE_CLERK_PUBLISHABLE_KEY` — public Clerk key exposed to the frontend
- `SESSION_SECRET` — session signing secret
- `SMTP_USER` / `SMTP_APP_PASSWORD` — Gmail SMTP for step-up OTP emails
- `DEFAULT_OBJECT_STORAGE_BUCKET_ID`, `PRIVATE_OBJECT_DIR`, `PUBLIC_OBJECT_SEARCH_PATHS` — object storage

**⚠️ Clerk on Replit dev:** The current `CLERK_PUBLISHABLE_KEY` is a production key locked to `akureairportsociety.com`. To use the app in the Replit preview pane, you need Clerk development keys (starting with `pk_test_`) issued for the `.replit.dev` domain. Update the three Clerk secrets with dev keys from your Clerk dashboard.

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks/schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema (dev only)
- `pnpm --filter @workspace/api-server run dev` — run both API + frontend (combined)

## Roles

- `super_admin` — full system access, configures settings
- `admin` — manages members, approves loans (first stage), manages store
- `financial_auditor` — reviews loans (second stage), views audit logs
- `treasurer` — disburses approved loans, manages financials
- `member` — self-service: savings, loans, store purchases, notifications

## Member Deletion Policy

`DELETE /members/:id` (admin + step-up) **refuses with 409** if the member has any loans, transactions, store purchases, or upload records — admins must deactivate (`POST /members/:id/deactivate`) instead, preserving the financial trail. The route does an explicit pre-check and the schema also enforces the rule via `ON DELETE RESTRICT` foreign keys (and `ON DELETE SET NULL` on `support_tickets.assigned_to_member_id`). Transient data — notifications, OTP codes, step-up grants — cascades on delete.

## Database Integrity Constraints

All money columns (`numeric(15,2)`) and quantity counters carry Postgres `CHECK` constraints (`>= 0` for balances, `> 0` for loan amounts, store quantities, and tenure months). Hot filter columns — `member_id`, `loan_id`, `ticket_id`, `status`, `(year, month)`, `(year, month, organization)` — are indexed in the schema files under `lib/db/src/schema/`.

## Loan Approval Workflow

1. Member applies → status: `pending`
2. Admin approves → status: `admin_approved` (or rejects)
3. Financial Auditor approves → status: `auditor_approved` (or rejects)
4. Super Admin approves → status: `super_admin_approved` (or rejects)
5. Treasurer disburses → status: `disbursed`

**Super-admin fast-track override**: From any non-terminal pre-disbursement status (`pending`, `admin_approved`, `auditor_approved`), a super admin can use `POST /loans/:id/fast-track-approve` to set the loan straight to `super_admin_approved`. This bypasses the standard chain, fills `superAdminApprovedAt/By` only (intermediate fields stay null so the trail accurately reflects who approved what), and writes a dedicated `FAST_TRACK_APPROVE_LOAN` audit entry naming the skipped stages. The UI surfaces this as an amber "Fast-track" button (separate from the normal Approve button) gated behind a confirmation dialog and email-OTP step-up.

Interest: per-product flat rate (see Loan Products below)

## Loan Products

Each loan application is tied to a `loan_products` row. Admins manage products from Settings → Loan Products. The seed creates 6 defaults (codes are stable):

| Code | Name | Rate | Default / Max tenure |
|---|---|---|---|
| `regular` | Regular Loan | 10% | 18 / 24 mo |
| `electronics` | Electronics Loan | 10% | 8 / 8 mo |
| `commercial` | Commercial Loan | 5% | 3 / 3 mo |
| `emergency` | Emergency Loan | 5% | 4 / 4 mo |
| `fuel_venture` | Fuel Venture | 5% | 1 / 1 mo |
| `provision` | Provision | 0% | 1 / 1 mo |

- Schema: `lib/db/src/schema/loanProducts.ts`; `loans.loanProductId` is a nullable FK so historical loans (pre-feature) keep working.
- Seeding: `artifacts/api-server/src/lib/seedLoanProducts.ts` runs on boot and only inserts missing rows (idempotent on `code`).
- API:
  - `GET /loan-products` — active only; admins may pass `?includeInactive=true`.
  - `POST/PATCH/DELETE /loan-products[/:id]` — admin + step-up. DELETE refuses (409) if any loan references the product (pre-check + Postgres FK 23503 race fallback).
  - `POST /loans` and `POST /loans/calculate` — `loanProductId` is **required**; tenure must be a positive integer ≤ `product.maxTenureMonths`; calc uses `product.interestRate` (flat % of principal).
- Frontend: member apply dialog (`my-loans.tsx`) renders a 6-card picker that auto-sets default tenure and constrains the max. Admin loans dashboard and "My Loans" rows show a product badge. Settings has full CRUD with active toggle.

## Excel Upload

Treasurer/Admin uploads monthly deduction Excel file.
System matches by full name → credits member savings accounts.
Store repayments tracked only via Excel upload.

## Opening Balances (preloaded member balances)

Existing balances are preloaded into a holding table (`opening_balances`) so a member who registers later inherits their real balance instead of starting at zero. The table mirrors the members' balance columns (all `numeric(15,2)`, `CHECK >= 0`) plus `status` (`unclaimed` / `claimed` / `needs_reconcile`), `linkedMemberId` (FK → members, `ON DELETE SET NULL`), `reconcileNote`, and `claimedAt`. Schema: `lib/db/src/schema/openingBalances.ts`.

**Claim at the approval gate (name match, admin-confirmed):**
- When an admin approves a pending member, the UI fetches `GET /members/:id/opening-balance-suggestion` — name-matched candidates (`NameMatcher` + surname-token-overlap fallback) shown as **"pending verification"** for the admin to confirm.
- `POST /members/:id/claim-opening-balance` (**admin-only + step-up**) **SETs** the member's balances from the chosen row (these are starting balances, not deltas), activates the member, writes one `opening_balance` transaction per non-zero bucket, and marks the opening row `claimed` + `linkedMemberId`. Guards (in a row-locked tx): member must be `pending`; opening row must still be `unclaimed` and unlinked — otherwise `409` (prevents overwriting an active member or re-claiming).
- No match → admin activates the member as **brand-new (zero)** via the normal activate path. Unmatched members stay `pending` until an admin links a record or marks them brand-new.

**Monthly deduction upload also keeps unclaimed rows current** (`uploads.ts`):
- After applying deductions to registered members, a second pass matches the same rows by name against still-`unclaimed` opening rows and applies the deltas (current-balance-only; no carried history).
- If a monthly row matches **both** a registered member **and** an unclaimed opening row, the member is credited and the opening row is flagged `needs_reconcile` (never double-applied). Response surfaces `openingBalancesUpdated` / `openingBalancesFlagged`.

**Admin view** (`/opening-balances`, admin nav): lists rows with status/search filters; flagged (`needs_reconcile`) rows expose a **Resolve** action → `POST /opening-balances/:id/reconcile` (**admin-only + step-up**) which discards the duplicate (only `needs_reconcile` rows; idempotent, `409` otherwise).

- `GET /opening-balances` and the suggestion endpoint are admin-tier (`requireAdmin`) read-only; claim/reconcile are `requireAdminOnly` (admin + super_admin) since they mutate balances/membership.
- `transactions.type` enum includes `opening_balance`.
- Phase 1 (the one-time opening-balance spreadsheet **import** parser, format TBD) is deferred — rows are currently seeded/managed directly.

## Organizations (Employers)

Employers (e.g. FAAN, NAMA, NIMET, NCAA) are configured at runtime by admins via `/organizations`.
- Stored in the `organizations` table with `code` (uppercase, unique, immutable), `name`, `description`, `isActive`.
- `members.organization` is plain text holding an org `code`. Members are tagged with their employer.
- Sign-up (`/complete-profile`) lists active organizations dynamically; `GET /api/organizations` is open to any signed-in Clerk user (pre-members included). `?includeInactive=true` is admin-only.
- Create/Update/Activate/Deactivate require admin role + step-up. The last active organization cannot be deactivated.
- Excel upload uses the unified parser for every org. Duplicate guard keys on `(month, year, organization code)`.
- FAAN, NAMA, NIMET, and NCAA are seeded on first server boot (idempotent on `code`); admins can add more from the UI.

## Key Files

- `artifacts/api-server/src/app.ts` — Express app with frontend proxy
- `artifacts/api-server/dev-start.mjs` — Combined dev startup script
- `artifacts/api-server/src/routes/index.ts` — All API routes
- `artifacts/cooperative/src/App.tsx` — Frontend routing + Clerk config
- `artifacts/cooperative/src/components/layout.tsx` — Sidebar + layout (mobile bottom nav for member & admin; sidebar/hamburger kept on mobile for auditor & treasurer)
- `artifacts/cooperative/src/components/admin-mobile-bottom-nav.tsx` — Admin mobile bottom nav
- `artifacts/cooperative/public/manifest.webmanifest` + `public/sw.js` — PWA manifest & service worker
- `artifacts/cooperative/src/lib/use-install-prompt.tsx` — Hook capturing `beforeinstallprompt`, iOS detection, 7-day dismiss TTL keyed per user
- `artifacts/cooperative/src/components/install-banner.tsx` — Slim sticky-top install banner; opens an "Add to Home Screen" sheet on iOS
- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth)
- `lib/db/src/schema.ts` — Database schema (Drizzle ORM)

## Step-Up Verification (custom email OTP)

Sensitive actions require a fresh email-OTP step-up within a 10-minute window. Built in-house because Clerk's MFA is paid-tier only.

**How it works:**
1. Frontend calls a sensitive endpoint — backend `requireReverification` middleware checks `step_up_grants` for the user.
2. If no fresh grant, returns `403 { step_up_required: true }`.
3. Frontend `useStepUpAction` hook (`artifacts/cooperative/src/lib/step-up.tsx`) catches that, opens the modal in `StepUpProvider`, calls `POST /auth/step-up/request` (emails a 6-digit code via Gmail SMTP), then `POST /auth/step-up/verify` on submit. On success a 10-minute `step_up_grants` row is inserted and the original mutation is retried.

**Required secrets:** `SMTP_USER` (Gmail address) and `SMTP_APP_PASSWORD` (16-character Google App Password).

**Tables:** `otp_codes` (hashed codes, 10-min TTL, max 5 attempts per code) and `step_up_grants` (memberId + expiresAt).

**Per-member lockout:** After 5 consecutive failed step-up verifications, the member's `members.stepUpLockedUntil` is set to `now() + 15 min` and `failedStepUpAttempts` is reset. While locked, both `/auth/step-up/request` and `/auth/step-up/verify` return `423 Locked` with a `Retry-After` header. A successful verification (or the lockout expiring) clears the counter — no admin reset required.

**Sensitive actions:**
- Loan approve / reject / disburse
- Settings updates
- Member role/status changes, deletions, bulk org assignment, activate/deactivate
- Excel deduction file processing

## Admin Broadcasts

Admins can post organization-wide announcements that fan out as in-app notifications (and optional emails) to a chosen audience.

- Tables: `broadcasts` (sender, title, message, category, audience JSON, recipientCount, sendEmail) and reuses `notifications` (type=`announcement`).
- Audience targeting: `{kind:"all"}` (every active member), `{kind:"role", role}` (single role), `{kind:"members", memberIds:[…]}` (explicit list).
- Endpoints: `POST /api/broadcasts`, `GET /api/broadcasts`, `GET /api/broadcasts/:id` (admin only). Each sender's audit log records the broadcast.
- Frontend: `/announcements` (admin) — composer + recent broadcasts list with per-broadcast read stats and recipient detail dialog. Members see broadcasts in their existing notifications page.
- Implementation note: the audience zod schema is defined inline in the route in zod v3 (the db package's `broadcastAudienceSchema` is built with `zod/v4`, which is incompatible with v3 parsers).

## Member ↔ Admin Support Tickets

Asynchronous ticket-based chat between members and admins, with internal notes and audit trail.

- Tables: `support_tickets` (memberId, subject, category, status, priority, assignedToMemberId, timestamps) and `support_messages` (ticketId, senderMemberId, body, isInternalNote).
- Statuses: `open`, `in_progress`, `waiting_member`, `resolved`, `closed`. Categories: `loan`, `deduction`, `account`, `store`, `general`. Priorities: `normal`, `high`, `urgent`.
- Endpoints: `POST/GET /api/support/tickets`, `GET/PATCH /api/support/tickets/:id`, `POST /api/support/tickets/:id/messages`, `GET /api/support/stats` (admin).
- Authorization: members see only their own tickets and never receive `isInternalNote` messages in API responses; admin roles (`admin`, `financial_auditor`, `treasurer`, `super_admin`) see all tickets and can post internal notes.
- Notifications fan out on every non-internal message and on admin status changes. Status/priority/assignee changes are recorded in the audit log (action `UPDATE_SUPPORT_TICKET`).
- Frontend: `/support` (member) — own tickets + new-ticket modal + `TicketThreadDialog`. `/support-admin` (admin) — queue with stats tiles, filters (status/assignee/category), and the same `TicketThreadDialog` with status/assign controls and internal-note toggle.
