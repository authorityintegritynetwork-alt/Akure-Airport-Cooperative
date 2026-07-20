---
name: Balance column model
description: How the 14 spreadsheet columns are tracked, displayed, and what transaction types map to each one.
---

## Column classification

**Savings columns** (balance grows, show `current` from members table):
- `savings` → savingsBalance
- `christmas` → christmasBalance  
- `shares` → sharesBalance (OB only + annual admin `shares_credit` action)

**Loan repayment columns** (show *total repaid* = sum of months, NOT outstanding debt):
- `provident` → providentBalance
- `realLoan` → realLoanBalance
- `emergencyLoan` → emergencyLoanBalance
- `electronics` → electronicsDebt
- `sElectronics` → sElectronicsDebt (FAAN: combined S/E/LAND column)
- `furniture` → furnitureDebt
- `fuelVenture` → fuelVentureBalance
- `commodity` → commodityDebt
- `fire` → fireFundBalance
- `ghlForm` → ghlFormDebt
- `landLoan` → landLoanBalance (NAMA separate; FAAN merged into sElectronics)

## Transaction type → column key mapping (TX_TO_COL in members.ts)

```
savings → savings
christmas → christmas
christmas_payout → christmas  (admin action zeroes balance)
fire → fire
shares_credit → shares        (admin action credits annually)
provident → provident
provident_loan_repayment → provident  (legacy alias)
real_loan_repayment → realLoan
loan_repayment → realLoan     (legacy alias)
emergency_loan_repayment → emergencyLoan
electronics_repayment → electronics
s_electronics_repayment → sElectronics
furniture_repayment → furniture
commodity_repayment → commodity
ghl_form_repayment → ghlForm
fuel_venture_repayment → fuelVenture
land_loan_repayment → landLoan
```

Skip: `opening_balance`, `store_repayment`

## Admin actions (POST endpoints, require requireTreasurer)

- `POST /api/admin/christmas-payout` — pays out all active members with christmasBalance > 0, zeroes it, creates `christmas_payout` transaction
- `POST /api/admin/shares-credit` — credits fixed amount to all active members' sharesBalance, creates `shares_credit` transaction

**Why:** Christmas Savings is a 4-month savings plan paid out Oct/Nov by admin trigger. Share Capital is credited annually, amount set by admin.

## Display rules

- Savings cards: `displayBalance = history.current` (live from members table)
- Loan cards: `displayBalance = history.months.reduce(sum)` (total repaid, NOT outstanding debt)
- OB shows as "Opening Balance" for savings, "Opening (owed)" for loans
- Cards only render when `ob > 0 || months.length > 0`
