/**
 * Admin action endpoints — high-impact balance mutations.
 * All POST routes require OTP step-up (requireReverification) and full audit logging.
 *
 *   GET  /admin/christmas-payout/preview  → count + total that would be paid
 *   POST /admin/christmas-payout          → execute payout (step-up required)
 *   GET  /admin/shares-credit/preview     → count + total that would be credited
 *   POST /admin/shares-credit             → execute credit (step-up required)
 */
import { Router } from "express";
import { z } from "zod/v4";
import { eq, sql } from "drizzle-orm";
import {
  db,
  membersTable,
  transactionsTable,
  uploadRecordsTable,
  openingBalancesTable,
  loansTable,
  dataClearRequestsTable,
} from "@workspace/db";
import {
  requireAuth,
  requireRole,
  requireTreasurer,
  requireSuperAdmin,
  requireReverification,
} from "../middlewares/auth";
import type { AuthRequest } from "../middlewares/auth";
import { logAudit } from "../lib/audit";
import { sendMail } from "../lib/mailer";

const router = Router();

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

// ── GET /admin/christmas-payout/preview ──────────────────────────────────────

router.get(
  "/admin/christmas-payout/preview",
  requireAuth,
  requireTreasurer,
  async (_req: AuthRequest, res): Promise<void> => {
    const allActive = await db
      .select({ id: membersTable.id, christmasBalance: membersTable.christmasBalance })
      .from(membersTable)
      .where(eq(membersTable.status, "active"));

    const eligible = allActive.filter((m) => parseFloat(m.christmasBalance) > 0);
    const totalWouldPayout = eligible.reduce((s, m) => s + parseFloat(m.christmasBalance), 0);

    res.json({ count: eligible.length, totalWouldPayout });
  },
);

// ── POST /admin/christmas-payout ─────────────────────────────────────────────

router.post(
  "/admin/christmas-payout",
  requireAuth,
  requireTreasurer,
  requireReverification,
  async (req: AuthRequest, res): Promise<void> => {
    const schema = z.object({
      month: z.enum(MONTHS),
      year: z.number().int().min(2020).max(2100),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input", issues: parsed.error.issues });
      return;
    }
    const { month, year } = parsed.data;

    const allActive = await db
      .select({ id: membersTable.id, christmasBalance: membersTable.christmasBalance })
      .from(membersTable)
      .where(eq(membersTable.status, "active"));

    const eligible = allActive.filter((m) => parseFloat(m.christmasBalance) > 0);

    if (eligible.length === 0) {
      res.json({
        count: 0,
        totalPaidOut: 0,
        message: "No active members have a Christmas Savings balance to pay out.",
      });
      return;
    }

    let totalPaidOut = 0;

    await db.transaction(async (tx) => {
      for (const m of eligible) {
        const balance = parseFloat(m.christmasBalance);
        if (balance <= 0) continue;
        totalPaidOut += balance;

        await tx.insert(transactionsTable).values({
          memberId: m.id,
          type: "christmas_payout" as any,
          amount: balance.toFixed(2),
          month,
          year,
          description: `Christmas Savings payout — ${month} ${year}`,
        });

        await tx
          .update(membersTable)
          .set({ christmasBalance: "0" })
          .where(eq(membersTable.id, m.id));
      }
    });

    await logAudit({
      actorId: req.memberId,
      action: "CHRISTMAS_PAYOUT",
      entity: "member",
      entityId: 0,
      details: `Christmas Savings payout for ${month} ${year}: ${eligible.length} members, ₦${totalPaidOut.toLocaleString(undefined, { maximumFractionDigits: 2 })} total`,
    });

    res.json({ count: eligible.length, totalPaidOut, month, year });
  },
);

// ── GET /admin/shares-credit/preview ─────────────────────────────────────────

router.get(
  "/admin/shares-credit/preview",
  requireAuth,
  requireTreasurer,
  async (req: AuthRequest, res): Promise<void> => {
    const amountParam = parseFloat(String(req.query.amount ?? "0"));

    const members = await db
      .select({ id: membersTable.id })
      .from(membersTable)
      .where(eq(membersTable.status, "active"));

    res.json({
      count: members.length,
      totalWouldCredit:
        Number.isFinite(amountParam) && amountParam > 0
          ? parseFloat((amountParam * members.length).toFixed(2))
          : 0,
    });
  },
);

// ── POST /admin/shares-credit ─────────────────────────────────────────────────

router.post(
  "/admin/shares-credit",
  requireAuth,
  requireTreasurer,
  requireReverification,
  async (req: AuthRequest, res): Promise<void> => {
    const schema = z.object({
      amount: z.number().positive(),
      year: z.number().int().min(2020).max(2100),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input", issues: parsed.error.issues });
      return;
    }
    const { amount, year } = parsed.data;

    const members = await db
      .select({ id: membersTable.id, sharesBalance: membersTable.sharesBalance })
      .from(membersTable)
      .where(eq(membersTable.status, "active"));

    if (members.length === 0) {
      res.json({ count: 0, totalCredited: 0, message: "No active members found." });
      return;
    }

    const totalCredited = parseFloat((amount * members.length).toFixed(2));

    await db.transaction(async (tx) => {
      for (const m of members) {
        const newBalance = (parseFloat(m.sharesBalance) + amount).toFixed(2);

        await tx.insert(transactionsTable).values({
          memberId: m.id,
          type: "shares_credit" as any,
          amount: amount.toFixed(2),
          year,
          description: `Annual Share Capital credit — ${year}`,
        });

        await tx
          .update(membersTable)
          .set({ sharesBalance: newBalance })
          .where(eq(membersTable.id, m.id));
      }
    });

    await logAudit({
      actorId: req.memberId,
      action: "SHARES_CREDIT",
      entity: "member",
      entityId: 0,
      details: `Annual Share Capital credit for ${year}: ${members.length} members × ₦${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}, total ₦${totalCredited.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
    });

    res.json({ count: members.length, totalCredited, amount, year });
  },
);

// ── GET /admin/reset-all-data/preview ────────────────────────────────────────

router.get(
  "/admin/reset-all-data/preview",
  requireAuth,
  requireSuperAdmin,
  async (_req: AuthRequest, res): Promise<void> => {
    const [txCount] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(transactionsTable);
    const [uploadCount] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(uploadRecordsTable);
    const [memberCount] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(membersTable);
    res.json({
      memberCount: Number(memberCount?.n ?? 0),
      txCount: Number(txCount?.n ?? 0),
      uploadCount: Number(uploadCount?.n ?? 0),
    });
  },
);

// ── POST /admin/reset-all-data ────────────────────────────────────────────────
// Wipes all transactions, upload records, opening balances, and resets every
// member's balance columns to zero. Super-admin + OTP step-up required.

router.post(
  "/admin/reset-all-data",
  requireAuth,
  requireSuperAdmin,
  requireReverification,
  async (req: AuthRequest, res): Promise<void> => {
    const schema = z.object({ confirm: z.literal("RESET") });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Send { confirm: \"RESET\" } to confirm." });
      return;
    }

    await db.transaction(async (tx) => {
      // 1. Delete all financial transaction rows.
      await tx.delete(transactionsTable);
      // 2. Delete all upload records.
      await tx.delete(uploadRecordsTable);
      // 3. Delete all opening-balance staging rows.
      await tx.delete(openingBalancesTable);
      // 4. Zero every member's 14 balance columns + OB snapshot columns.
      await tx.update(membersTable).set({
        sharesBalance:        "0",
        savingsBalance:       "0",
        providentBalance:     "0",
        christmasBalance:     "0",
        realLoanBalance:      "0",
        emergencyLoanBalance: "0",
        totalLoanBalance:     "0",
        electronicsDebt:      "0",
        sElectronicsDebt:     "0",
        furnitureDebt:        "0",
        commodityDebt:        "0",
        ghlFormDebt:          "0",
        totalStoreDebt:       "0",
        fireFundBalance:      "0",
        fuelVentureBalance:   "0",
        landLoanBalance:      "0",
        obSharesBalance:      null,
        obSavingsBalance:     null,
        obProvidentBalance:   null,
        obChristmasBalance:   null,
        obRealLoanBalance:    null,
        obEmergencyLoanBalance: null,
        obTotalLoanBalance:   null,
        obElectronicsDebt:    null,
        obSElectronicsDebt:   null,
        obFurnitureDebt:      null,
        obCommodityDebt:      null,
        obGhlFormDebt:        null,
        obTotalStoreDebt:     null,
        obFireFundBalance:    null,
        obFuelVentureBalance: null,
        obLandLoanBalance:    null,
        obUploadedAt:         null,
      });
      // 5. Restore each loan's outstanding balance to its original disbursed amount
      //    and reopen any loans that had been fully repaid.
      await tx.execute(
        sql`UPDATE ${loansTable} SET outstanding_balance = amount, status = 'disbursed'
            WHERE status IN ('disbursed', 'fully_repaid')`,
      );
    });

    await logAudit({
      actorId: req.memberId,
      action: "RESET_ALL_DATA",
      entity: "system",
      entityId: 0,
      details:
        "FULL DATA RESET: all transactions, upload records, opening balances and member balance columns wiped to zero by super_admin.",
    });

    res.json({ ok: true, message: "All balance data has been reset." });
  },
);

// ── POST /admin/request-data-clear ───────────────────────────────────────────
// Any member with the "admin" role (not super_admin — they can do it directly)
// can raise a request.  Super admins are notified by email immediately.

router.post(
  "/admin/request-data-clear",
  requireAuth,
  requireRole("admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const schema = z.object({ reason: z.string().max(500).optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body." });
      return;
    }

    // Confirm there is no already-pending request from any admin.
    const existing = await db
      .select({ id: dataClearRequestsTable.id })
      .from(dataClearRequestsTable)
      .where(eq(dataClearRequestsTable.status, "pending"))
      .limit(1);

    if (existing.length > 0) {
      res.status(409).json({
        error: "A data-clear request is already pending super-admin review.",
      });
      return;
    }

    const requester = await db
      .select({ fullName: membersTable.fullName, email: membersTable.email })
      .from(membersTable)
      .where(eq(membersTable.id, req.memberId!))
      .limit(1);

    const requesterName = requester[0]?.fullName ?? "Unknown admin";
    const requesterEmail = requester[0]?.email ?? null;

    const [inserted] = await db
      .insert(dataClearRequestsTable)
      .values({
        requestedById: req.memberId!,
        reason: parsed.data.reason ?? null,
        requesterName,
        requesterEmail,
      })
      .returning();

    await logAudit({
      actorId: req.memberId,
      action: "REQUEST_DATA_CLEAR",
      entity: "system",
      entityId: inserted.id,
      details: `Admin "${requesterName}" raised a data-clear request${parsed.data.reason ? `: "${parsed.data.reason}"` : ""}. Awaiting super-admin approval.`,
    });

    // Email all super admins.
    const superAdmins = await db
      .select({ fullName: membersTable.fullName, email: membersTable.email })
      .from(membersTable)
      .where(eq(membersTable.role, "super_admin"));

    const reasonLine = parsed.data.reason
      ? `\n\nReason given: "${parsed.data.reason}"`
      : "";

    for (const sa of superAdmins) {
      if (!sa.email) continue;
      await sendMail({
        to: sa.email,
        subject: "Action required: Data Clear Request — Akure Airport Co-op",
        text: `Hello ${sa.fullName},\n\n${requesterName} has submitted a request to reset all balance data in the cooperative management system.${reasonLine}\n\nPlease log in to review and approve or reject this request:\nhttps://akureairportsociety.com\n\nThis request will remain open until you act on it.\n\n— Akure Airport Staff Cooperative`,
        html: `<p>Hello ${sa.fullName},</p><p><strong>${requesterName}</strong> has submitted a request to <strong>reset all balance data</strong> in the cooperative management system.${parsed.data.reason ? `</p><p>Reason: <em>${parsed.data.reason}</em>` : ""}</p><p>Please <a href="https://akureairportsociety.com">log in</a> to review and approve or reject this request.</p><p>This request will remain open until you act on it.</p><p style="color:#888">— Akure Airport Staff Cooperative</p>`,
      });
    }

    res.json({ ok: true, requestId: inserted.id });
  },
);

// ── GET /admin/data-clear-requests/pending ───────────────────────────────────

router.get(
  "/admin/data-clear-requests/pending",
  requireAuth,
  requireSuperAdmin,
  async (_req: AuthRequest, res): Promise<void> => {
    const rows = await db
      .select()
      .from(dataClearRequestsTable)
      .where(eq(dataClearRequestsTable.status, "pending"));
    res.json({ requests: rows });
  },
);

// ── GET /admin/data-clear-request/status ─────────────────────────────────────
// Accessible to any admin role — returns whether a pending request exists so
// the admin UI can show a "pending" state without hitting the super-admin-only
// endpoint above.

router.get(
  "/admin/data-clear-request/status",
  requireAuth,
  requireRole("admin", "super_admin"),
  async (_req: AuthRequest, res): Promise<void> => {
    const [row] = await db
      .select({
        id: dataClearRequestsTable.id,
        createdAt: dataClearRequestsTable.createdAt,
        reason: dataClearRequestsTable.reason,
        requesterName: dataClearRequestsTable.requesterName,
      })
      .from(dataClearRequestsTable)
      .where(eq(dataClearRequestsTable.status, "pending"))
      .limit(1);
    res.json({ pending: row != null, request: row ?? null });
  },
);

// ── POST /admin/data-clear-requests/:id/approve ──────────────────────────────
// Super admin approves — the actual wipe runs here (step-up required).

router.post(
  "/admin/data-clear-requests/:id/approve",
  requireAuth,
  requireSuperAdmin,
  requireReverification,
  async (req: AuthRequest, res): Promise<void> => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid request id." }); return; }

    const [request] = await db
      .select()
      .from(dataClearRequestsTable)
      .where(eq(dataClearRequestsTable.id, id))
      .limit(1);

    if (!request) { res.status(404).json({ error: "Request not found." }); return; }
    if (request.status !== "pending") {
      res.status(409).json({ error: `Request is already ${request.status}.` });
      return;
    }

    // Execute the full wipe inside a transaction (same logic as reset-all-data).
    await db.transaction(async (tx) => {
      await tx.delete(transactionsTable);
      await tx.delete(uploadRecordsTable);
      await tx.delete(openingBalancesTable);
      await tx.update(membersTable).set({
        savingsBalance:         "0",
        providentBalance:       "0",
        christmasBalance:       "0",
        realLoanBalance:        "0",
        emergencyLoanBalance:   "0",
        totalLoanBalance:       "0",
        electronicsDebt:        "0",
        sElectronicsDebt:       "0",
        furnitureDebt:          "0",
        commodityDebt:          "0",
        ghlFormDebt:            "0",
        totalStoreDebt:         "0",
        fireFundBalance:        "0",
        fuelVentureBalance:     "0",
        landLoanBalance:        "0",
        sharesBalance:          "0",
        obSharesBalance:        null,
        obSavingsBalance:       null,
        obProvidentBalance:     null,
        obChristmasBalance:     null,
        obRealLoanBalance:      null,
        obEmergencyLoanBalance: null,
        obTotalLoanBalance:     null,
        obElectronicsDebt:      null,
        obSElectronicsDebt:     null,
        obFurnitureDebt:        null,
        obCommodityDebt:        null,
        obGhlFormDebt:          null,
        obTotalStoreDebt:       null,
        obFireFundBalance:      null,
        obFuelVentureBalance:   null,
        obLandLoanBalance:      null,
        obUploadedAt:           null,
      });
      await tx.execute(
        sql`UPDATE ${loansTable} SET outstanding_balance = amount, status = 'disbursed'
            WHERE status IN ('disbursed', 'fully_repaid')`,
      );
      // Mark the request as approved.
      await tx
        .update(dataClearRequestsTable)
        .set({ status: "approved", reviewedById: req.memberId!, reviewedAt: new Date() })
        .where(eq(dataClearRequestsTable.id, id));
    });

    await logAudit({
      actorId: req.memberId,
      action: "APPROVE_DATA_CLEAR",
      entity: "system",
      entityId: id,
      details: `Super-admin approved data-clear request #${id} (raised by "${request.requesterName}"). Full data wipe executed.`,
    });

    // Notify the requester.
    if (request.requesterEmail) {
      await sendMail({
        to: request.requesterEmail,
        subject: "Your data-clear request has been approved — Akure Airport Co-op",
        text: `Hello ${request.requesterName},\n\nYour request to reset all balance data has been approved and executed by a super administrator. All transaction history, upload records, and opening balances have been wiped.\n\n— Akure Airport Staff Cooperative`,
        html: `<p>Hello ${request.requesterName},</p><p>Your request to <strong>reset all balance data</strong> has been <strong>approved and executed</strong> by a super administrator. All transaction history, upload records, and opening balances have been wiped.</p><p style="color:#888">— Akure Airport Staff Cooperative</p>`,
      });
    }

    res.json({ ok: true, message: "Data-clear request approved and data wiped." });
  },
);

// ── POST /admin/data-clear-requests/:id/reject ───────────────────────────────

router.post(
  "/admin/data-clear-requests/:id/reject",
  requireAuth,
  requireSuperAdmin,
  async (req: AuthRequest, res): Promise<void> => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid request id." }); return; }

    const schema = z.object({ reason: z.string().max(500).optional() });
    const parsed = schema.safeParse(req.body);

    const [request] = await db
      .select()
      .from(dataClearRequestsTable)
      .where(eq(dataClearRequestsTable.id, id))
      .limit(1);

    if (!request) { res.status(404).json({ error: "Request not found." }); return; }
    if (request.status !== "pending") {
      res.status(409).json({ error: `Request is already ${request.status}.` });
      return;
    }

    await db
      .update(dataClearRequestsTable)
      .set({ status: "rejected", reviewedById: req.memberId!, reviewedAt: new Date() })
      .where(eq(dataClearRequestsTable.id, id));

    await logAudit({
      actorId: req.memberId,
      action: "REJECT_DATA_CLEAR",
      entity: "system",
      entityId: id,
      details: `Super-admin rejected data-clear request #${id} (raised by "${request.requesterName}")${parsed.success && parsed.data.reason ? `: "${parsed.data.reason}"` : ""}.`,
    });

    // Notify the requester.
    if (request.requesterEmail) {
      const reasonLine = parsed.success && parsed.data.reason
        ? `\n\nReason: "${parsed.data.reason}"`
        : "";
      await sendMail({
        to: request.requesterEmail,
        subject: "Your data-clear request has been rejected — Akure Airport Co-op",
        text: `Hello ${request.requesterName},\n\nYour request to reset all balance data has been reviewed and rejected by a super administrator. No data has been deleted.${reasonLine}\n\nIf you think this was an error, please contact a super admin directly.\n\n— Akure Airport Staff Cooperative`,
        html: `<p>Hello ${request.requesterName},</p><p>Your request to reset all balance data has been <strong>rejected</strong> by a super administrator. No data has been deleted.</p>${parsed.success && parsed.data.reason ? `<p>Reason: <em>${parsed.data.reason}</em></p>` : ""}<p style="color:#888">— Akure Airport Staff Cooperative</p>`,
      });
    }

    res.json({ ok: true, message: "Data-clear request rejected." });
  },
);

export default router;
