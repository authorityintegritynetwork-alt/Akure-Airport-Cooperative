---
name: Excel parser skip diagnostics
description: Why row-skip accounting for uploads must live in parseSheet, not the consumer loop.
---

`parseSheet()` in the api-server excel parser silently filters rows *before* any
consumer (opening-balance import, deduction upload) sees them: empty/spacer rows,
total/grand/sub/signature label rows, unnamed rows, and all-zero rows are dropped
during parsing.

**Rule:** any feature that needs to report "rows skipped and why" must collect that
diagnostic inside `parseSheet` (it exposes `ParsedSheet.skipped: ParsedSkip[]`),
NOT in the downstream insert loop. A skip check in the consumer over `sheet.rows`
is dead code because the offending rows were already removed.

**Why:** the opening-balance import summary feature originally counted skips in the
process loop and always got zero — the parser had already discarded blank-name and
zero-total rows. Moving the accounting into the parser was the only correct fix.

**How to apply:** for import "total vs skipped" stats, set
`totalRows = sheet.rows.length + sheet.skipped.length` so `inserted + skipped == totalRows`
for real member-data rows. Spacer/label rows are intentionally excluded from the total.
