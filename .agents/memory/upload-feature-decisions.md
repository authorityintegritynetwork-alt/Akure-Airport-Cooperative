---
name: Upload feature decisions (re-upload, combined, balance snapshot, reset)
description: Key decisions from implementing paired upload, balance snapshot, re-upload-replaces, and full data reset features.
---

## Re-upload replaces (no more 409)
`reverseAndDeleteUploadRecords(tx, uploadIds)` in uploads.ts reverses balance deltas (credits subtract, debits add back, guarded by GREATEST(0,...)), recomputes totalLoanBalance/totalStoreDebt, then deletes old transactions and upload records — all inside the same DB transaction. Loan outstanding balances are NOT individually reversed (too complex), but since reversal+new-upload happen atomically the net result is correct. Known limitation: documented but acceptable.

**Why:** Admins upload corrections regularly; returning 409 forced them to manually reverse and re-upload.

## Combined upload type (frontend-only)
`"combined"` is a frontend-only upload type (not stored in DB). `handlePairedUpload()` uploads roster → processes as `payroll_summary` (fires OTP step-up) → uploads breakdown → auto-selects sheet → shows standard deduction preview. After roster processing, `uploadType` state switches to `"category_breakdown"` so the normal confirm/process flow works unchanged.

**Why:** FAAN (dual-upload orgs) previously needed two separate upload sessions.

## Balance snapshot
`"balance_snapshot"` enum value added to DB `uploadType`. Backend: `POST /uploads/balance-snapshot/preview` (returns matched/unmatched counts + willReplace flag) and `POST /uploads/balance-snapshot/process` (direct SET of all 16 member balance columns; no transaction rows). Old snapshot for same org+month+year deleted before applying new one. Frontend uses `processSnapshotWithStepUp` (a `useStepUpAction`-wrapped fetch) to handle the OTP gate.

**How to apply:** Balance snapshot bypasses the standard hasDuplicateNames / hasMismatchedTotals guards on the confirm button — those are not relevant for a direct SET operation.

## Admin data reset
`POST /admin/reset-all-data` (requireSuperAdmin + requireReverification). Deletes transactions, upload_records, opening_balances; zeros all 16 balance columns + ob_* snapshot columns on every member; restores loan outstanding_balance = amount and flips status = 'disbursed'. Frontend uses `useStepUpAction` directly (not useMutation) for step-up + reset in one call.

**Why:** Needed before importing a fresh balance snapshot when historical data is corrupted or needs full replacement.

## useStepUpAction API
`useStepUpAction(fn)` takes a function and returns a step-up-wrapped function. It does NOT have a `{ withStepUp }` destructure API. Always: `const doThing = useStepUpAction(async (args) => { ... }); await doThing(args);`

**Why:** Common mistake to call `useStepUpAction()` with no args and destructure.
