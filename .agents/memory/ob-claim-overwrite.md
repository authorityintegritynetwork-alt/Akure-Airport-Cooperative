---
name: OB claim overwrite bug
description: OB claim was overwriting current balance columns for pending members who had already accumulated monthly deductions — erasing 6 months of savings and loan repayments. Fixed July 2026.
---

## The bug

`OPENING_BALANCE_FIELDS` lists every balance column (savingsBalance, realLoanBalance, etc.).
The claim endpoint iterated that list and wrote `setClauses[field] = opening[field]` — overwriting
the member's CURRENT balance with the OB snapshot value, even if monthly deductions had been
running for months.

For 395 pending members this would have erased ₦35.3M in monthly savings.
For 204 pending members this would have restored ₦66.7M in already-repaid loan balances.

## The fix (openingBalances.ts — claim handler)

Before building SET clauses, count `transactions WHERE member_id = X AND type != 'opening_balance'`.

- `hasMonthlyTransactions = false` → set balance columns from OB as before (member is fresh).
- `hasMonthlyTransactions = true` → skip balance column overwrite entirely; the columns already
  equal `ob_value + all_monthly_deltas` and are correct.

In BOTH cases: always write the `ob_*` snapshot columns from the claimed OB row (ensures the
balance-timeline has a correct origin even for members whose OB wasn't matched at upload time).

## Why the current balance columns are already correct for pending members

The OB UPLOAD (lines 494–514) sets only the `ob_*` snapshot columns, not the current balance
columns. Monthly deduction uploads call `applyDeductionAmounts` for every matched member
regardless of status (active OR pending), so pending members accumulate deductions in their
current balance columns normally. By the time OB is claimed, those columns are already exact.

## Related code bugs fixed at the same time

- `totalLoanBalance` stale in single PostgreSQL UPDATE: fixed in `uploads.ts` by substituting
  the already-built GREATEST() expressions (setClauses[field]) into the aggregate expression
  instead of raw column references (which PostgreSQL evaluates from pre-update values).
- `furnitureDebt` excluded from `totalStoreDebt`: fixed in both `uploads.ts` and the
  `computeObValues` helper in `openingBalances.ts`.
