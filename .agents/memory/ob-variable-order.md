---
name: openingBalances computeObValues variable ordering
description: fuelVentureBalance and landLoanBalance must be declared before totalLoanBalance in computeObValues or you get a temporal dead zone error at runtime.
---

In `artifacts/api-server/src/routes/openingBalances.ts`, the helper `computeObValues` computes several local `const` variables. `totalLoanBalance` uses `fuelVentureBalance` and `landLoanBalance`. These must be declared **before** `totalLoanBalance` or JavaScript will throw a ReferenceError (temporal dead zone for `const`).

**Why:** The original code declared them after (they were not included in the sum). When adding them to the aggregate, this order must be respected.

**How to apply:** Any new loan column added to `totalLoanBalance` in `computeObValues` must have its `const` declaration placed above the `totalLoanBalance` line.
