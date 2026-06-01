---
name: Testing step-up / OTP-gated flows
description: How to drive email-OTP step-up actions in automated Playwright tests, and a false-negative trap.
---

Sensitive actions are protected by a custom email-OTP step-up. Tests can't read email, so the OTP cannot be obtained normally. There is ALSO a full-screen `StepUpGate` that appears right after Clerk sign-in (once the member is active) — every authenticated session must clear it before the app renders.

**How to pass step-up in a test (no email):**
- The gate/modal auto-creates an `otp_codes` row (purpose `step_up`, `code_hash` = sha256(code) hex, `used_at` NULL).
- After the gate/modal appears, run a `[DB]` step to overwrite the latest unused hash with the hash of a known code, then type that code:
  - `UPDATE otp_codes SET code_hash='<sha256(known)>' WHERE id = (SELECT id FROM otp_codes WHERE member_id=<ADMIN_ID> AND purpose='step_up' AND used_at IS NULL ORDER BY created_at DESC LIMIT 1);`
  - e.g. code `654321` → `481f6cc0511143ccdd7e2d1b1b94faf0a700a8b49cd13922a70b5ae28acaa8c5`.
- This exercises the REAL verify→grant→retry path (not a bypass). Use the SIGNED-IN admin's member id, not the target member.

**Why this works / how to apply:** grants are keyed `(member_id, clerk_session_id, expires_at)`; the real Clerk testing-token session has a `sess_...` id, so a verify creates a properly-scoped grant.

**False-negative trap:** a successful verify grants a **10-minute** window. A second sensitive action within that window will NOT re-prompt — that is correct, not a bug. Don't assert "the step-up modal must appear" for a second gated action shortly after the first (or after passing the post-login gate). Assert the action SUCCEEDS instead; only assert the modal for the first action of a session, or after expiring the grant.

**Test user setup:** a new Clerk sign-in has no member row → app shows complete-profile. Fill it (unique phone/staff id), then `[DB] UPDATE members SET role='super_admin', status='active' WHERE email=...` and reload to reach admin pages.
