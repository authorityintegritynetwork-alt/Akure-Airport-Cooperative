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

Interest: 10% flat (configurable in Settings)

## Excel Upload

Treasurer/Admin uploads monthly deduction Excel file.
System matches by full name → credits member savings accounts.
Store repayments tracked only via Excel upload.

## Key Files

- `artifacts/api-server/src/app.ts` — Express app with frontend proxy
- `artifacts/api-server/dev-start.mjs` — Combined dev startup script
- `artifacts/api-server/src/routes/index.ts` — All API routes
- `artifacts/cooperative/src/App.tsx` — Frontend routing + Clerk config
- `artifacts/cooperative/src/components/layout.tsx` — Sidebar + layout
- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth)
- `lib/db/src/schema.ts` — Database schema (Drizzle ORM)
