/**
 * Admin action endpoints:
 *   POST /admin/christmas-payout  — trigger Christmas Savings disbursement
 *   POST /admin/shares-credit     — annual Share Capital credit for all active members
 */
import { Router } from "express";
import { z } from "zod/v4";
import { eq, sql } from "drizzle-orm";
import { db, membersTable, transactionsTable } from "@workspace/db";
import { requireAuth, requireTreasurer } from "../middlewares/auth";
import type { AuthRequest } from "../middlewares/auth";

const router = Router();

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

// ── POST /admin/christmas-payout ─────────────────────────────────────────────

router.post(
  "/admin/christmas-payout",
  requireAuth,
  requireTreasurer,
  async (req: AuthRequest, res): Promise<void> => {
    const schema = z.object({
      month: z.enum(MONTHS as [string, ...string[]]),
      year: z.number().int().min(2020).max(2100),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input", issues: parsed.error.issues });
      return;
    }
    const { month, year } = parsed.data;

    // Fetch all active members with christmasBalance > 0
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

    res.json({ count: eligible.length, totalPaidOut, month, year });
  },
);

// ── POST /admin/shares-credit ────────────────────────────────────────────────

router.post(
  "/admin/shares-credit",
  requireAuth,
  requireTreasurer,
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

    res.json({ count: members.length, totalCredited, amount, year });
  },
);

export default router;
