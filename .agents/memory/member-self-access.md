---
name: Member self-access to balance timeline
description: The balance-timeline route allows members to view their own data; the My Statement page surfaces this to the member UI.
---

`GET /members/:id/balance-timeline` was previously admin-only (`requireAdmin`). It now accepts:
- Any member whose `req.memberId === id` (self-access)
- Any admin role (admin, auditor, treasurer, super_admin)

The self-access check lives at the top of the handler, before the DB query.

The member-facing **My Statement** page (`/my-statement`) calls `useGetMemberBalanceTimeline(profile.id)` so members see the same BalanceTimeline component that admins see on the member detail page.

**Why:** Members need per-product balance visibility as a first-class feature.

**How to apply:** Do not add `requireAdmin` back to this route. Any new per-member data endpoint should use the same self-vs-admin guard pattern.
