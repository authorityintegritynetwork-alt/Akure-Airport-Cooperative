---
name: Shares & Provident Direction Fix
description: Key decisions and constraints from the FAAN/NAMA balance accuracy overhaul
---

## PROV is a debit (loan repayment), NOT savings

**Rule:** `CATEGORY_CONFIG.provident.direction = "debit"` and `txType = "provident_loan_repayment"`.

**Why:** Oct 2025 balances showed 0 PROV for ALL 479 FAAN members (fully paid off), then new PROV deductions appeared Jan 2026 with variable amounts — classic loan repayment pattern, not uniform savings. The balance breakdown UI already showed it as "Provision Loan" in red (debit card); now the parser matches.

**How to apply:** Monthly PROV deductions reduce `providentBalance` via `GREATEST(0, balance - amount)`. When a new provident loan is issued, admin sets `providentBalance` manually (no formal loan record — tracked purely via balance field).

## SHARES is a separate credit category (opening balances only)

**Rule:** `shares` is in `ALL_CATEGORIES` and `UNIFIED_CATEGORIES`. Aliases: `["shares","share","share capital","shares capital"]`. DB fields `shares_balance` / `ob_shares_balance` exist on both `members` and `opening_balances` tables.

**Why:** All 479 FAAN members have ₦66,375 share capital in the October balances doc (col header "SHARES"). Monthly deduction sheets never carry a SHARES column, so `amounts.shares` is always 0 in the deduction context (safely skipped). Opening balances upload is the only path that sets sharesBalance.

**How to apply:** When uploading opening balances, the parser reads SHARES → `sharesBalance` (credit). The claim flow copies it to the member record. `DEBT_ORDER` does NOT include shares (not a debt). Do NOT add shares to `DEBT_ORDER`.

## Balance timeline (admin view) — provident moves to loans bucket

**Rule:** In `members.ts` balance timeline, `opening.loan` and `current.loan` include `providentBalance` (it's a loan, not savings).

**Why:** Fixes the admin balance timeline to show provident outstanding as loan debt, matching reality.

## FAAN has two permanent member groups per month

**Rule:** FAAN deduction workbook always has paired sheets — Group 1 (odd) has FIRE column, Group 2 (even) does NOT. This is permanent from March 2018 onwards.

**Why:** Affects which members accumulate fire fund balance. Parser already handles this correctly (header-name detection). No code change needed.

## TX_LABELS includes legacy "provident" key

**Rule:** Keep `provident: "Provision Loan Repayment"` alongside `provident_loan_repayment: "Provision Loan Repayment"` in TX_LABELS to handle any historical rows recorded before the direction fix.
