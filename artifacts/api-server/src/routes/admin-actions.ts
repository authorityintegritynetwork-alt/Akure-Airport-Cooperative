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
import { eq } from "drizzle-orm";
import { db, membersTable, transactionsTable } from "@workspace/db";
import {
  requireAuth,
  requireTreasurer,
  requireReverification,
} from "../middlewares/auth";
import type { AuthRequest } from "../middlewares/auth";
import { logAudit } from "../lib/audit";

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

export default router;
