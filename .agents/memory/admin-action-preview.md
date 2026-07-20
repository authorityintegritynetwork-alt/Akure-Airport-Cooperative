---
name: Admin action dry-run preview endpoints
description: christmas-payout and shares-credit have GET preview endpoints that return count + total before the POST fires.
---

Both admin action routes have dry-run GET endpoints:
- `GET /admin/christmas-payout/preview` → `{ count, totalWouldPayout }`
- `GET /admin/shares-credit/preview?amount=X` → `{ count, totalWouldCredit }`

Frontend fetches these with `useQuery({ enabled: confirmOpen })` so the data loads only when the confirmation dialog opens. The result is shown inside `AlertDialogHeader` (below `AlertDialogDescription`) as a styled "N members · ₦X total" pill.

Manual balance correction is also wired: `POST /members/:id/adjustments` (requireTreasurer + requireReverification) records a `manual_adjustment` transaction and recalculates `totalLoanBalance` or `totalStoreDebt` if a constituent column was touched.

**Why:** Prevents the treasurer from confirming an action with unknown scope. The preview is cheap (SELECT only) and always reflects live data.

**How to apply:** Any future bulk admin action should follow the same GET-preview → POST-execute pattern. Always add `requireReverification` to the POST route.
