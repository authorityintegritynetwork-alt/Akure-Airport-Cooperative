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

## Organizations (Employers)

Employers (e.g. FAAN, NAMA) are configured at runtime by admins via `/organizations`.
- Stored in the `organizations` table with `code` (uppercase, unique, immutable), `name`, `description`, `excelFormat` (`faan` or `nama` — controls Excel parser), `isActive`.
- `members.organization` is plain text holding an org `code`. Members are tagged with their employer.
- Sign-up (`/complete-profile`) lists active organizations dynamically; `GET /api/organizations` is open to any signed-in Clerk user (pre-members included). `?includeInactive=true` is admin-only.
- Create/Update/Activate/Deactivate require admin role + step-up. The last active organization cannot be deactivated.
- Excel upload picks the parser based on the chosen organization's `excelFormat`. Duplicate guard keys on `(month, year, organization code)`.
- FAAN and NAMA are seeded on first server boot if no organizations exist.

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

**Tables:** `otp_codes` (hashed codes, 10-min TTL, max 5 attempts) and `step_up_grants` (memberId + expiresAt).

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
