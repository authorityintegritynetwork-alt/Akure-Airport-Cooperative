---
name: Simple Roster Formats (CTAKU & Pension)
description: Two additional payroll summary file formats supported by the upload pipeline — CTAKU (FAAN sub-group) and Pension (retired FAAN/NAMA members).
---

## Rule
CTAKU and Pension Excel files are `payroll_summary` (Step 1 of 2) uploads — they carry a single total-deduction amount per member. They are parsed by `simpleRosterParser.ts` and treated identically to the NAMA PDF roster.

## File Layouts
All variants share 3 blank header rows; actual column headers are on **row index 3**.

**CTAKU** (`476_CTAKU_*.xlsx`, `476-CTAKU_*.xlsx`):
- `Employee No. | Employee Name | (blank) | Grade Level | Amount`
- Amount at col 4; ~464–466 rows per month
- Employee numbers: `000015` format (6-digit zero-padded)
- Organization: FAAN (sub-group)

**Pension-7** (most months — AKURE / CTAKU pension):
- `Pensioner No. | Employee Name | (blank) | Station Code | (blank) | Grade Level | Amount`
- Amount at col 6; ~64–67 rows per month

**Pension-5** (some months, e.g. December — no Station Code):
- `Pensioner No. | Employee Name | (blank) | Grade Level | Amount`
- Amount at col 4; ~66–69 rows per month

Detection auto-picks col 4 or 6 by checking whether `row[6]` == "Amount".

## Detection Logic
`simpleRosterParser.ts → scanForHeader()` scans up to 12 rows to find the header row.
- `col0 == "pensioner no."` → pension
- `col0 == "employee no."` → ctaku
- Anything else (incl. `PENSIONERS_OCTOBER_BALANCES` full-category sheet) → null → falls through to regular `parseSheet`

## Why payroll_summary (not standalone)
The Amount column is the **total cooperative deduction** for that month, not a per-category breakdown. The category breakdown comes from the regular FAAN/NAMA cooperative Excel (Step 2, `category_breakdown`).
Pensioners are existing FAAN or NAMA members; CTAKU are FAAN employees.

## Where It's Wired
- `artifacts/api-server/src/lib/simpleRosterParser.ts` — parsers
- `artifacts/api-server/src/routes/uploads.ts` — three branch points (sheets / preview / process), detection runs BEFORE `parsePayrollSheet`
- `artifacts/cooperative/src/pages/upload.tsx` — `isSimpleRoster` derived from sheets response; auto-locks uploadType to `payroll_summary`; shows info banner + badge

## PDF Bug Also Fixed (same session)
`pdfParser.ts` EMP_ID_RE changed to `/^[Ee][Mm][Pp]-\d+$/` (was mixed-case only). Fast-path guard changed to `/[Ee][Mm][Pp]-\d/.test(line)`. Fixes missing uppercase `EMP-06070` rows in March/April NAMA PDFs.
