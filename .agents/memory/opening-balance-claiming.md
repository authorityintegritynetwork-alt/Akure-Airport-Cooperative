---
name: Opening-balance claiming requires approval
description: Opening balances must only be claimed at member approval, never auto-claimed during deduction upload.
---

An opening_balance row may only become `status='claimed'` (with `linked_member_id`
+ `claimed_at`) through the member-approval claim flow, which also flips the member
to `active`. It must NOT be claimed as a side-effect of anything else.

**Why:** the deduction-upload route auto-creates a *pending* member for unmatched
names. It used to also name-match an unclaimed opening balance, copy its balances
onto the new member, and mark the OB claimed — producing "claimed" balances for
people who were never approved (members stayed `pending` while their OB showed
claimed). That's the contradiction to watch for: a claimed OB whose linked member
is still pending.

**How to apply:** in the upload auto-create path, create the pending member only —
do not copy ob_*/live balances and do not touch the matching OB; leave it
unclaimed for approval. Also exclude auto-created rows from the `needs_reconcile`
double-match pass (track them in an autoCreatedRows set), otherwise their OB gets
flagged instead of staying cleanly unclaimed.

**Invariant to check if this regresses:** `opening_balances.status='claimed'` should
never have a `linked_member_id` pointing at a member whose status is `pending`.
