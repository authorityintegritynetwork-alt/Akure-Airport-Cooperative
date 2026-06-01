---
name: Auth role guards (requireAdmin vs requireAdminOnly)
description: Which Express role-guard middleware to use for sensitive mutations in the cooperative API
---

# Role guards in `artifacts/api-server/src/middlewares/auth.ts`

`requireAdmin` is **broad**: it admits `admin`, `financial_auditor`, `treasurer`, AND `super_admin`. It is meant for read/queue-style admin endpoints.

`requireAdminOnly` = `admin` + `super_admin` only.

**Rule:** Endpoints that mutate member balances or membership state (activate/approve, claim opening balance, reconcile, etc.) must use `requireAdminOnly`, NOT `requireAdmin` — otherwise auditors/treasurers get a privilege they shouldn't have.

**Why:** Code review caught the opening-balances claim/reconcile routes using `requireAdmin`, which silently let auditor/treasurer overwrite balances. Easy to miss because `requireAdmin` *sounds* restrictive.

**How to apply:** When adding a sensitive POST/PATCH/DELETE, default to `requireAdminOnly` + `requireReverification` (step-up). Reserve `requireAdmin` for GET/list views.
