# Akure Airport Staff Co-operative — Application Overview

*A plain-language summary of what has been built, what it does, and what remains.*

---

## 1. What this application is

This is a complete online platform for the **Akure Airport Staff Co-operative Multipurpose Society**. It moves the co-operative's day-to-day operations — member records, savings, loans, the co-operative store, and monthly salary deductions — out of spreadsheets and paper and into a single, secure system that members and staff can use from a phone or computer.

Think of it as the co-operative's own "online bank and office," available around the clock:

- **Members** can check their savings, apply for loans, shop the store, get notifications, and ask for help — all on their own.
- **Administrators and officers** can manage members, approve loans through the proper chain of command, process the monthly deduction file, and keep the books accurate.

The application works like a normal website **and** can be installed on a phone like a regular app (it has an "Add to Home Screen" option), so members get an app-like experience without going through an app store.

---

## 2. Who uses it — the five roles

Every person who logs in has a role that controls what they can see and do. This keeps responsibilities separated and protects the co-operative's money.

| Role | What they can do |
|---|---|
| **Member** | View their own savings and loan balances, apply for loans, buy from the store, receive notifications, and open support tickets. |
| **Admin** | Manage members, run the first stage of loan approvals, manage the store, and process the monthly deduction file. |
| **Financial Auditor** | Review loans at the second stage and view the audit history. |
| **Treasurer** | Release (disburse) approved loans and manage the financial side. |
| **Super Admin** | Full access; configures system settings and can fast-track approvals when needed. |

---

## 3. How members sign in (simple and secure)

- Members log in using their **email and a one-time code** — there are no passwords to forget. A fresh code is emailed each time, which is both convenient and secure.
- For **sensitive actions** (such as approving or releasing a loan, changing member details, or processing the deduction file), the system asks the person to **re-confirm their identity with a 6-digit code sent to their email**. This is an extra safety check so that important actions can't be done casually or by someone who simply walked up to an unlocked screen.
- If someone enters the wrong confirmation code too many times, the system temporarily locks that action for 15 minutes to block guessing — then clears itself automatically.

---

## 4. The main features (what has been built)

### a. Member management
Administrators can add members, edit their details, assign them to their employer, and activate or deactivate accounts. To protect the financial record, a member who already has loans, transactions, or store purchases **cannot be deleted** — they can only be deactivated, so their history is never lost.

### b. Savings and balances
Each member has their savings and various co-operative balances tracked in the system. Members see their own figures at a glance; officers see the full picture.

### c. Loans — a proper approval chain
Loans follow a clear, multi-step approval process so no single person can approve and release money alone:

1. The member **applies**.
2. An **Admin** approves (or rejects).
3. A **Financial Auditor** reviews.
4. A **Super Admin** gives final approval.
5. The **Treasurer** releases the funds.

There is also a **Super Admin "fast-track"** option for urgent cases, which still records exactly who approved it and which normal stages were skipped — so the trail is always honest and traceable.

**Loan products:** The co-operative offers several loan types, each with its own interest rate and repayment period — Regular, Electronics, Commercial, Emergency, Fuel Venture, and Provision. Admins can manage these from the settings, and members pick the right one when applying.

### d. The co-operative store
Members can make purchases through the store, and store debts are tracked against their accounts.

### e. Monthly salary deduction upload
Each month, the Treasurer or Admin uploads the **deductions spreadsheet** (the file showing how much was deducted from each member's salary). The system reads the file, matches each line to the right member by name, and automatically updates their savings and repayments. This replaces a slow, error-prone manual process.

### f. Opening balances — so new members keep their real figures *(recently completed and fully tested)*
Many staff already had balances **before** the system existed. This feature makes sure that when one of those staff registers later, they **inherit their real balance** instead of starting from zero.

Here's how it works in everyday terms:
- The co-operative's existing balances are held safely in the system, waiting to be claimed.
- When an administrator approves a new member, the system **suggests a likely match by name** and shows it as *"pending verification"* — the administrator reviews and confirms it before anything is applied.
- On confirmation, the member's real starting balances are applied and their account is activated. If there's no match, the administrator simply activates them as a brand-new member starting at zero.
- Meanwhile, the **monthly deduction uploads keep these waiting balances up to date**, so a member who registers months later still gets the correct, current figure.
- If a monthly deduction line matches **both** an existing member **and** a waiting record, the system flags it for an administrator to **review and resolve**, so nothing is ever counted twice.

This was carefully tested from end to end, including the email-confirmation security step, and confirmed to work correctly.

### g. Employers (organizations)
Members are tagged with their employer — for example **FAAN, NAMA, NIMET, or NCAA**. Administrators can add or manage these employers themselves, and the sign-up form shows the current list automatically.

### h. Announcements / broadcasts
Administrators can send **co-operative-wide announcements** that reach members as in-app notifications (and optionally by email). They can target everyone, a specific role, or a hand-picked list of members, and see how many people received and read each message.

### i. Member ↔ Admin support tickets
Members can raise support requests (about loans, deductions, their account, the store, or general questions) and chat with administrators inside the app. Staff can add private internal notes, set priorities, assign tickets, and track them from open to resolved — a built-in help desk.

### j. Notifications
Members are kept informed automatically — for loan status changes, new messages, announcements, and more.

### k. Works on phones (installable app)
The platform is mobile-friendly and can be **installed on a phone's home screen**, with a bottom navigation bar for members and admins for easy thumb-friendly use.

---

## 5. Safety and record-keeping built in

- **Audit trail:** Sensitive actions are logged — who did what and when — so the co-operative always has an accurate history.
- **Money safeguards:** The system prevents impossible values (such as negative balances) at the deepest level, so the books stay clean.
- **Separation of duties:** The approval chain and role system ensure no single person controls money end to end.
- **Identity re-confirmation:** The email-code check on sensitive actions adds a strong layer of protection.

---

## 6. What is left to do

The platform itself is built and working. **The one remaining input needed is the official opening-balances spreadsheet** — the master file of each existing member's current balances.

Once that spreadsheet is provided, it will be loaded into the system so that every existing member's real balance is waiting for them when they register. Until then, those starting balances are entered and managed directly within the system. (The automatic one-time reader for that specific spreadsheet is the final piece, and its exact layout will be confirmed from the file you provide.)

In short: **the features are complete — what's outstanding is obtaining the balance spreadsheet** so the historical figures can be brought in.

---

## 7. Going live

Once all features are complete and the balance spreadsheet has been loaded, the application will be **migrated to its permanent home at akureairportcms.com**, where members and staff will access it day to day.

---

*This document is a non-technical overview intended for co-operative members, officers, and stakeholders.*
