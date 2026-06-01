import { Router, type IRouter } from "express";
import {
  db,
  membersTable,
  openingBalancesTable,
  transactionsTable,
  type OpeningBalance,
} from "@workspace/db";
import { eq, ilike, and, desc, sql } from "drizzle-orm";
import {
  requireAuth,
  requireAdmin,
  requireAdminOnly,
  requireReverification,
  AuthRequest,
} from "../middlewares/auth";
import { logAudit } from "../lib/audit";
import { sendNotification } from "../lib/notifications";
import {
  ListOpeningBalancesQueryParams,
  ClaimOpeningBalanceBody,
} from "@workspace/api-zod";
import { NameMatcher } from "../lib/nameMatcher";
import { formatMember } from "../lib/formatMember";

const router: IRouter = Router();

/**
 * Balance columns shared by `members` and `opening_balances`. `totalLoanBalance`
 * and `totalStoreDebt` are derived aggregates and are handled separately.
 */
export const OPENING_BALANCE_FIELDS: Array<{
  field: keyof OpeningBalance & keyof typeof membersTable.$inferSelect;
  category: string;
  label: string;
}> = [
  { field: "savingsBalance", category: "savings", label: "Savings" },
  { field: "providentBalance", category: "provident", label: "Provision" },
  { field: "christmasBalance", category: "christmas", label: "Christmas Savings" },
  { field: "realLoanBalance", category: "realLoan", label: "Real Loan" },
  { field: "emergencyLoanBalance", category: "emergencyLoan", label: "Emergency Loan" },
  { field: "electronicsDebt", category: "electronics", label: "Electronics Debt" },
  { field: "sElectronicsDebt", category: "sElectronics", label: "Small Electronics Debt" },
  { field: "furnitureDebt", category: "furniture", label: "Furniture Debt" },
  { field: "commodityDebt", category: "commodity", label: "Commodity Debt" },
  { field: "ghlFormDebt", category: "ghlForm", label: "Loan Form Cost" },
  { field: "fireFundBalance", category: "fire", label: "Fire Fund" },
  { field: "fuelVentureBalance", category: "fuelVenture", label: "Fuel Venture" },
  { field: "landLoanBalance", category: "landLoan", label: "Land Loan" },
];

function formatOpeningBalance(o: OpeningBalance) {
  return {
    ...o,
    savingsBalance: parseFloat(o.savingsBalance),
    providentBalance: parseFloat(o.providentBalance),
    christmasBalance: parseFloat(o.christmasBalance),
    realLoanBalance: parseFloat(o.realLoanBalance),
    emergencyLoanBalance: parseFloat(o.emergencyLoanBalance),
    totalLoanBalance: parseFloat(o.totalLoanBalance),
    electronicsDebt: parseFloat(o.electronicsDebt),
    sElectronicsDebt: parseFloat(o.sElectronicsDebt),
    furnitureDebt: parseFloat(o.furnitureDebt),
    commodityDebt: parseFloat(o.commodityDebt),
    ghlFormDebt: parseFloat(o.ghlFormDebt),
    fireFundBalance: parseFloat(o.fireFundBalance),
    fuelVentureBalance: parseFloat(o.fuelVentureBalance),
    landLoanBalance: parseFloat(o.landLoanBalance),
    totalStoreDebt: parseFloat(o.totalStoreDebt),
  };
}

router.get(
  "/opening-balances",
  requireAuth,
  requireAdmin,
  async (req: AuthRequest, res): Promise<void> => {
    const parsed = ListOpeningBalancesQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const conditions = [];
    if (parsed.data.status) {
      conditions.push(eq(openingBalancesTable.status, parsed.data.status as any));
    }
    if (parsed.data.search) {
      conditions.push(ilike(openingBalancesTable.fullName, `%${parsed.data.search}%`));
    }
    const rows = await db
      .select()
      .from(openingBalancesTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(openingBalancesTable.createdAt));
    res.json(rows.map(formatOpeningBalance));
  },
);

router.get(
  "/members/:id/opening-balance-suggestion",
  requireAuth,
  requireAdmin,
  async (req: AuthRequest, res): Promise<void> => {
    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(raw, 10);

    const [member] = await db
      .select({ id: membersTable.id, fullName: membersTable.fullName })
      .from(membersTable)
      .where(eq(membersTable.id, id));
    if (!member) {
      res.status(404).json({ error: "Member not found" });
      return;
    }

    const unclaimed = await db
      .select()
      .from(openingBalancesTable)
      .where(eq(openingBalancesTable.status, "unclaimed"));

    const matcher = new NameMatcher(
      unclaimed.map((o) => ({ id: o.id, fullName: o.fullName })),
    );
    const byId = new Map(unclaimed.map((o) => [o.id, o]));

    // Primary suggestion via the shared matcher (member name → opening row).
    const best = matcher.match(member.fullName);
    const suggestions: Array<{ openingBalance: any; confidence: string }> = [];
    const seen = new Set<number>();
    if (best.memberId != null) {
      const row = byId.get(best.memberId);
      if (row) {
        suggestions.push({
          openingBalance: formatOpeningBalance(row),
          confidence: best.confidence,
        });
        seen.add(row.id);
      }
    }

    // Secondary: surname-token overlap so the admin always has nearby options
    // to pick from even when the matcher can't confidently disambiguate.
    const memberTokens = new Set(
      member.fullName.toLowerCase().replace(/[.,'`]/g, " ").split(/\s+/).filter((t) => t.length > 1),
    );
    for (const o of unclaimed) {
      if (seen.has(o.id)) continue;
      const oTokens = o.fullName
        .toLowerCase()
        .replace(/[.,'`]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length > 1);
      if (oTokens.some((t) => memberTokens.has(t))) {
        suggestions.push({
          openingBalance: formatOpeningBalance(o),
          confidence: "none",
        });
        seen.add(o.id);
      }
      if (suggestions.length >= 6) break;
    }

    res.json({
      memberId: member.id,
      memberName: member.fullName,
      suggestions,
    });
  },
);

router.post(
  "/members/:id/claim-opening-balance",
  requireAuth,
  requireAdminOnly,
  requireReverification,
  async (req: AuthRequest, res): Promise<void> => {
    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const memberId = parseInt(raw, 10);

    const parsed = ClaimOpeningBalanceBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const openingBalanceId = parsed.data.openingBalanceId;

    const result = await db.transaction(async (tx) => {
      const [member] = await tx
        .select()
        .from(membersTable)
        .where(eq(membersTable.id, memberId))
        .for("update");
      if (!member) return { error: "not_found" as const };
      // Only pending members may be claimed onto — never overwrite the balances
      // of an already-active (or inactive) member.
      if (member.status !== "pending") {
        return { error: "not_pending" as const };
      }

      const [opening] = await tx
        .select()
        .from(openingBalancesTable)
        .where(eq(openingBalancesTable.id, openingBalanceId))
        .for("update");
      if (!opening) return { error: "ob_not_found" as const };
      // The row must still be free to claim: unclaimed and not already linked.
      if (opening.status !== "unclaimed" || opening.linkedMemberId != null) {
        return { error: "already_claimed" as const };
      }

      // Set member balances directly from the opening row (these are starting
      // balances, not deltas). Aggregates are copied verbatim.
      const setClauses: Record<string, string> = {};
      for (const { field } of OPENING_BALANCE_FIELDS) {
        setClauses[field] = (opening as any)[field];
      }
      setClauses.totalLoanBalance = opening.totalLoanBalance;
      setClauses.totalStoreDebt = opening.totalStoreDebt;

      const [updated] = await tx
        .update(membersTable)
        .set({ ...setClauses, status: "active" } as any)
        .where(eq(membersTable.id, memberId))
        .returning();

      // Audit trail: one transaction row per non-zero opening bucket.
      for (const { field, category, label } of OPENING_BALANCE_FIELDS) {
        const amt = parseFloat((opening as any)[field]);
        if (!amt || amt <= 0) continue;
        await tx.insert(transactionsTable).values({
          memberId,
          type: "opening_balance",
          category,
          amount: amt.toString(),
          description: `Opening balance - ${label}`,
        });
      }

      await tx
        .update(openingBalancesTable)
        .set({
          status: "claimed",
          linkedMemberId: memberId,
          claimedAt: new Date(),
        })
        .where(eq(openingBalancesTable.id, openingBalanceId));

      return { member: updated, opening };
    });

    if ("error" in result) {
      if (result.error === "not_found") {
        res.status(404).json({ error: "Member not found" });
      } else if (result.error === "ob_not_found") {
        res.status(404).json({ error: "Opening balance not found" });
      } else if (result.error === "not_pending") {
        res.status(409).json({
          error:
            "Only pending members can be linked to an opening balance. This member is already active or inactive.",
        });
      } else {
        res
          .status(409)
          .json({ error: "This opening balance has already been claimed." });
      }
      return;
    }

    await logAudit({
      actorId: req.memberId,
      action: "CLAIM_OPENING_BALANCE",
      entity: "member",
      entityId: memberId,
      details: `Applied opening balance #${openingBalanceId} ("${result.opening.fullName}") to ${result.member.fullName} and activated the account.`,
    });

    await sendNotification({
      memberId,
      type: "system",
      title: "Welcome — your account is active",
      message:
        "Your membership has been approved and your existing balances have been loaded. You can now view your account.",
    });

    res.json(formatMember(result.member));
  },
);

router.post(
  "/opening-balances/:id/reconcile",
  requireAuth,
  requireAdminOnly,
  requireReverification,
  async (req: AuthRequest, res): Promise<void> => {
    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(raw, 10);

    // Only flagged duplicates may be reconciled, and only while still flagged —
    // this guards against discarding legitimate unclaimed/claimed rows and makes
    // the operation idempotent against concurrent callers.
    const [updated] = await db
      .update(openingBalancesTable)
      .set({
        status: "claimed",
        claimedAt: new Date(),
        reconcileNote: sql`COALESCE(${openingBalancesTable.reconcileNote}, '') || ' [resolved by admin]'`,
      })
      .where(
        and(
          eq(openingBalancesTable.id, id),
          eq(openingBalancesTable.status, "needs_reconcile"),
        ),
      )
      .returning();

    if (!updated) {
      const [existing] = await db
        .select({ id: openingBalancesTable.id })
        .from(openingBalancesTable)
        .where(eq(openingBalancesTable.id, id));
      if (!existing) {
        res.status(404).json({ error: "Opening balance not found" });
      } else {
        res.status(409).json({
          error: "Only records flagged for reconciliation can be resolved.",
        });
      }
      return;
    }

    await logAudit({
      actorId: req.memberId,
      action: "RECONCILE_OPENING_BALANCE",
      entity: "opening_balance",
      entityId: id,
      details: `Resolved flagged opening balance "${updated.fullName}" (discarded as duplicate).`,
    });

    res.json(formatOpeningBalance(updated));
  },
);

export default router;
