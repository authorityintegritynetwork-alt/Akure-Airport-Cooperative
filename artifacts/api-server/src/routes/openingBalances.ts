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
import {
  ALL_CATEGORIES,
  CATEGORY_CONFIG,
  downloadWorkbook,
  parseSheet,
  summarizeSheets,
} from "../lib/excelParser";
import { z } from "zod";
import { organizationsTable } from "@workspace/db";

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

// ── Zod schemas for opening-balance bulk upload ─────────────────────────────

const ObUploadPreviewBody = z.object({
  fileObjectPath: z.string().min(1),
  sheetName: z.string().optional(),
});

const ObUploadProcessBody = z.object({
  fileObjectPath: z.string().min(1),
  sheetName: z.string().optional(),
  replaceExisting: z.boolean().optional().default(false),
});

// ── Preview: parse Excel, show what would be imported ───────────────────────

router.post(
  "/uploads/opening-balances/preview",
  requireAuth,
  requireAdmin,
  async (req: AuthRequest, res): Promise<void> => {
    const parsed = ObUploadPreviewBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    try {
      const wb = await downloadWorkbook(parsed.data.fileObjectPath);
      const sheetName = parsed.data.sheetName || wb.SheetNames[0];
      if (!wb.SheetNames.includes(sheetName)) {
        res.status(400).json({ error: `Sheet "${sheetName}" not found in workbook.` });
        return;
      }

      const sheets = summarizeSheets(wb);
      const sheet = parseSheet(wb, sheetName);

      const rows = sheet.rows.map((row) => {
        const values: Record<string, number> = {};
        for (const cat of ALL_CATEGORIES) {
          values[cat] = row.amounts[cat];
        }
        return {
          rowNumber: row.rowNumber,
          rawName: row.rawName,
          ...values,
          total: row.computedTotal,
          warnings: row.warnings,
          errors: row.errors,
        };
      });

      res.json({
        sheetName,
        sheets,
        totalRows: rows.length,
        rows,
      });
    } catch (err: any) {
      res.status(400).json({ error: `Failed to read Excel file: ${err.message}` });
    }
  },
);

// ── Process: insert rows into opening_balances table ────────────────────────

router.post(
  "/uploads/opening-balances/process",
  requireAuth,
  requireAdminOnly,
  requireReverification,
  async (req: AuthRequest, res): Promise<void> => {
    const parsed = ObUploadProcessBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    try {
      const wb = await downloadWorkbook(parsed.data.fileObjectPath);
      const sheetName = parsed.data.sheetName || wb.SheetNames[0];
      if (!wb.SheetNames.includes(sheetName)) {
        res.status(400).json({ error: `Sheet "${sheetName}" not found in workbook.` });
        return;
      }

      const sheet = parseSheet(wb, sheetName);

      let inserted = 0;
      let skipped = 0;

      await db.transaction(async (tx) => {
        for (const row of sheet.rows) {
          if (!row.rawName.trim()) { skipped++; continue; }

          // Check for existing unclaimed row with same name to avoid duplicates
          if (!parsed.data.replaceExisting) {
            const existing = await tx
              .select({ id: openingBalancesTable.id })
              .from(openingBalancesTable)
              .where(
                and(
                  ilike(openingBalancesTable.fullName, row.rawName.trim()),
                  eq(openingBalancesTable.status, "unclaimed"),
                ),
              );
            if (existing.length > 0) { skipped++; continue; }
          }

          // Compute balance values from parsed amounts.
          // Credits (savings/provident/christmas/fire) are stored as positive.
          // Debts (loans, store) are stored as positive amounts owed.
          const savingsBalance = row.amounts.savings;
          const providentBalance = row.amounts.provident;
          const christmasBalance = row.amounts.christmas;
          const realLoanBalance = row.amounts.realLoan;
          const emergencyLoanBalance = row.amounts.emergencyLoan;
          const totalLoanBalance = realLoanBalance + emergencyLoanBalance;
          const electronicsDebt = row.amounts.electronics;
          const sElectronicsDebt = row.amounts.sElectronics;
          const furnitureDebt = row.amounts.furniture;
          const commodityDebt = row.amounts.commodity;
          const ghlFormDebt = row.amounts.ghlForm;
          const totalStoreDebt = electronicsDebt + sElectronicsDebt + commodityDebt + ghlFormDebt;
          const fireFundBalance = row.amounts.fire;
          const fuelVentureBalance = row.amounts.fuelVenture;
          const landLoanBalance = row.amounts.landLoan;

          await tx.insert(openingBalancesTable).values({
            fullName: row.rawName.trim(),
            status: "unclaimed",
            savingsBalance: savingsBalance.toString(),
            providentBalance: providentBalance.toString(),
            christmasBalance: christmasBalance.toString(),
            realLoanBalance: realLoanBalance.toString(),
            emergencyLoanBalance: emergencyLoanBalance.toString(),
            totalLoanBalance: totalLoanBalance.toString(),
            electronicsDebt: electronicsDebt.toString(),
            sElectronicsDebt: sElectronicsDebt.toString(),
            furnitureDebt: furnitureDebt.toString(),
            commodityDebt: commodityDebt.toString(),
            ghlFormDebt: ghlFormDebt.toString(),
            totalStoreDebt: totalStoreDebt.toString(),
            fireFundBalance: fireFundBalance.toString(),
            fuelVentureBalance: fuelVentureBalance.toString(),
            landLoanBalance: landLoanBalance.toString(),
          });
          inserted++;
        }
      });

      await logAudit({
        actorId: req.memberId,
        action: "IMPORT_OPENING_BALANCES",
        entity: "opening_balance",
        entityId: 0,
        details: `Bulk-imported opening balances from "${sheetName}": ${inserted} inserted, ${skipped} skipped.`,
      });

      res.json({ inserted, skipped });
    } catch (err: any) {
      res.status(400).json({ error: `Failed to process file: ${err.message}` });
    }
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
