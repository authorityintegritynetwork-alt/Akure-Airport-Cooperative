import { Router, type IRouter } from "express";
import {
  db,
  membersTable,
  openingBalancesTable,
  openingBalanceImportsTable,
  transactionsTable,
  type OpeningBalance,
  type ObImportSkippedRow,
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
  { field: "sharesBalance", category: "shares", label: "Share Capital" },
  { field: "savingsBalance", category: "savings", label: "Savings" },
  { field: "providentBalance", category: "provident", label: "Provision Loan" },
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
    sharesBalance: parseFloat(o.sharesBalance),
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
    if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid member id" }); return; }

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
    if (Number.isNaN(memberId)) { res.status(400).json({ error: "Invalid member id" }); return; }

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

      // Check whether monthly deduction uploads have already been processed for
      // this member. If they have, the current balance columns already equal
      // (ob_value + all monthly deltas) and must NOT be overwritten — doing so
      // would erase every repayment and savings credit earned since the OB
      // cutover. We only initialise balance columns from the OB row when the
      // member has no monthly history yet (the safe, original path).
      const [{ txCount }] = await tx
        .select({ txCount: sql<number>`COUNT(*)::int` })
        .from(transactionsTable)
        .where(
          and(
            eq(transactionsTable.memberId, memberId),
            sql`${transactionsTable.type} != 'opening_balance'`,
          ),
        );
      const hasMonthlyTransactions = (txCount as unknown as number) > 0;

      // Build SET clauses. Always sync the ob_* snapshot so the balance-timeline
      // has a consistent origin point, regardless of whether the OB upload had
      // already matched this member.
      const setClauses: Record<string, any> = {
        obSharesBalance:        opening.sharesBalance,
        obSavingsBalance:       opening.savingsBalance,
        obProvidentBalance:     opening.providentBalance,
        obChristmasBalance:     opening.christmasBalance,
        obRealLoanBalance:      opening.realLoanBalance,
        obEmergencyLoanBalance: opening.emergencyLoanBalance,
        obTotalLoanBalance:     opening.totalLoanBalance,
        obElectronicsDebt:      opening.electronicsDebt,
        obSElectronicsDebt:     opening.sElectronicsDebt,
        obFurnitureDebt:        opening.furnitureDebt,
        obCommodityDebt:        opening.commodityDebt,
        obGhlFormDebt:          opening.ghlFormDebt,
        obFireFundBalance:      opening.fireFundBalance,
        obFuelVentureBalance:   opening.fuelVentureBalance,
        obLandLoanBalance:      opening.landLoanBalance,
        obTotalStoreDebt:       opening.totalStoreDebt,
        // Preserve any timestamp already written by the OB upload; fall back to now
        // for members who are being claimed without a prior OB upload match.
        obUploadedAt: member.obUploadedAt ?? new Date(),
        // Carry through the effective date from the OB row if set.
        ...((opening as any).effectiveMonth != null && {
          obEffectiveMonth: (opening as any).effectiveMonth,
          obEffectiveYear:  (opening as any).effectiveYear,
        }),
        status: "active" as const,
      };

      if (!hasMonthlyTransactions) {
        // No monthly uploads have run yet — safe to initialise current balance
        // columns from the OB row exactly as before.
        for (const { field } of OPENING_BALANCE_FIELDS) {
          setClauses[field] = (opening as any)[field];
        }
        setClauses.totalLoanBalance = opening.totalLoanBalance;
        setClauses.totalStoreDebt   = opening.totalStoreDebt;
      }
      // If hasMonthlyTransactions is true, the current balance columns are left
      // untouched. They already reflect ob_* + every monthly delta correctly.

      const [updated] = await tx
        .update(membersTable)
        .set(setClauses as any)
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
  organization: z.string().optional(),
});

const ObUploadProcessBody = z.object({
  fileObjectPath: z.string().min(1),
  sheetName: z.string().optional(),
  organization: z.string().optional(),
  /** Month (1–12) from which these balances take effect. Required. */
  effectiveMonth: z.number().int().min(1).max(12),
  /** Year from which these balances take effect. Required. */
  effectiveYear: z.number().int().min(2000).max(2100),
});

// Helper: compute all balance values from parsed row amounts
function computeObValues(row: { amounts: Record<string, number> }) {
  const sharesBalance = row.amounts.shares ?? 0;
  const savingsBalance = row.amounts.savings ?? 0;
  const providentBalance = row.amounts.provident ?? 0;
  const christmasBalance = row.amounts.christmas ?? 0;
  const realLoanBalance = row.amounts.realLoan ?? 0;
  const emergencyLoanBalance = row.amounts.emergencyLoan ?? 0;
  const fuelVentureBalance = row.amounts.fuelVenture ?? 0;
  const landLoanBalance = row.amounts.landLoan ?? 0;
  // Include all loan columns (provident, fuelVenture, landLoan were previously missing).
  const totalLoanBalance =
    realLoanBalance + emergencyLoanBalance + providentBalance + fuelVentureBalance + landLoanBalance;
  const electronicsDebt = row.amounts.electronics ?? 0;
  const sElectronicsDebt = row.amounts.sElectronics ?? 0;
  const furnitureDebt = row.amounts.furniture ?? 0;
  const commodityDebt = row.amounts.commodity ?? 0;
  const ghlFormDebt = row.amounts.ghlForm ?? 0;
  const totalStoreDebt = electronicsDebt + sElectronicsDebt + furnitureDebt + commodityDebt + ghlFormDebt;
  const fireFundBalance = row.amounts.fire ?? 0;
  return {
    sharesBalance,
    savingsBalance, providentBalance, christmasBalance,
    realLoanBalance, emergencyLoanBalance, totalLoanBalance,
    electronicsDebt, sElectronicsDebt, furnitureDebt,
    commodityDebt, ghlFormDebt, totalStoreDebt,
    fireFundBalance, fuelVentureBalance, landLoanBalance,
  };
}

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

// ── Process: supersede all existing rows and sync member book balances ───────
//
// Every upload is a full replacement:
//   1. All existing opening_balance rows for the organisation are deleted
//      (regardless of claimed/unclaimed status).
//   2. New rows are inserted from the sheet.
//   3. For each row, if a registered member's name matches, their ob_* snapshot
//      columns are updated so they immediately see the new book balances.
//      This covers both pending and active members.

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
      const org = parsed.data.organization?.trim().toUpperCase() || null;

      // Load all members for name-matching (to sync ob_* columns)
      const allMembers = await db
        .select({ id: membersTable.id, fullName: membersTable.fullName })
        .from(membersTable);
      const { NameMatcher } = await import("../lib/nameMatcher");
      const matcher = new NameMatcher(allMembers);

      let inserted = 0;
      let membersSynced = 0;
      // Rows the parser rejected before they reached the insert loop
      // (unnamed rows carrying balances, named rows with all-zero amounts).
      const skippedDetails: ObImportSkippedRow[] = sheet.skipped.map((s) => ({
        row: s.row,
        name: s.name,
        reason: s.reason,
      }));
      // Total meaningful data rows = those we attempt to insert + those skipped.
      const totalRows = sheet.rows.length + skippedDetails.length;
      const uploadedAt = new Date();

      const effectiveMonth = parsed.data.effectiveMonth;
      const effectiveYear = parsed.data.effectiveYear;

      // Fetch full member rows so we can distinguish active vs pending.
      const allMembersWithStatus = await db
        .select({ id: membersTable.id, fullName: membersTable.fullName, status: membersTable.status })
        .from(membersTable);
      const memberStatusMap = new Map(allMembersWithStatus.map((m) => [m.id, m.status]));
      let activeOverridden = 0;

      await db.transaction(async (tx) => {
        // Step 1: Delete all existing opening_balance rows for this org
        // (or all rows if no org specified — global sheet)
        if (org) {
          await tx
            .delete(openingBalancesTable)
            .where(eq(openingBalancesTable.organization, org));
        } else {
          // No org filter — wipe everything and replace with the new sheet
          await tx.delete(openingBalancesTable);
        }

        // Step 2: Insert new rows and sync members.
        // The parser guarantees every kept row has a non-blank name and at
        // least one non-zero balance; rejected rows are already in
        // skippedDetails above.
        for (const row of sheet.rows) {
          const name = row.rawName.trim();
          const vals = computeObValues(row);
          const match = matcher.match(name);
          const matchedMemberId = match.memberId ?? null;
          const matchedStatus = matchedMemberId != null ? memberStatusMap.get(matchedMemberId) : undefined;
          // Mark the OB row as claimed immediately for active members since we
          // apply their balances in this same transaction; keep unclaimed for
          // pending/unmatched members so the approval-gate claim flow still works.
          const obStatus = matchedStatus === "active" ? "claimed" : "unclaimed";

          const [insertedRow] = await tx.insert(openingBalancesTable).values({
            fullName: name,
            organization: org,
            status: obStatus,
            effectiveMonth,
            effectiveYear,
            linkedMemberId: matchedStatus === "active" ? matchedMemberId : null,
            claimedAt: matchedStatus === "active" ? uploadedAt : null,
            sharesBalance: vals.sharesBalance.toString(),
            savingsBalance: vals.savingsBalance.toString(),
            providentBalance: vals.providentBalance.toString(),
            christmasBalance: vals.christmasBalance.toString(),
            realLoanBalance: vals.realLoanBalance.toString(),
            emergencyLoanBalance: vals.emergencyLoanBalance.toString(),
            totalLoanBalance: vals.totalLoanBalance.toString(),
            electronicsDebt: vals.electronicsDebt.toString(),
            sElectronicsDebt: vals.sElectronicsDebt.toString(),
            furnitureDebt: vals.furnitureDebt.toString(),
            commodityDebt: vals.commodityDebt.toString(),
            ghlFormDebt: vals.ghlFormDebt.toString(),
            totalStoreDebt: vals.totalStoreDebt.toString(),
            fireFundBalance: vals.fireFundBalance.toString(),
            fuelVentureBalance: vals.fuelVentureBalance.toString(),
            landLoanBalance: vals.landLoanBalance.toString(),
          } as any).returning();
          inserted++;

          // Step 3: Sync ob_* snapshot columns and effective date on any matched member.
          if (matchedMemberId != null) {
            const memberUpdate: Record<string, any> = {
              // ob_* snapshot — always updated
              obSharesBalance: vals.sharesBalance.toString(),
              obSavingsBalance: vals.savingsBalance.toString(),
              obProvidentBalance: vals.providentBalance.toString(),
              obChristmasBalance: vals.christmasBalance.toString(),
              obRealLoanBalance: vals.realLoanBalance.toString(),
              obEmergencyLoanBalance: vals.emergencyLoanBalance.toString(),
              obTotalLoanBalance: vals.totalLoanBalance.toString(),
              obElectronicsDebt: vals.electronicsDebt.toString(),
              obSElectronicsDebt: vals.sElectronicsDebt.toString(),
              obFurnitureDebt: vals.furnitureDebt.toString(),
              obCommodityDebt: vals.commodityDebt.toString(),
              obGhlFormDebt: vals.ghlFormDebt.toString(),
              obFireFundBalance: vals.fireFundBalance.toString(),
              obFuelVentureBalance: vals.fuelVentureBalance.toString(),
              obLandLoanBalance: vals.landLoanBalance.toString(),
              obTotalStoreDebt: vals.totalStoreDebt.toString(),
              obUploadedAt: uploadedAt,
              // Effective date — controls where the balance timeline starts
              obEffectiveMonth: effectiveMonth,
              obEffectiveYear: effectiveYear,
            };

            if (matchedStatus === "active") {
              // Active member: directly override current balance columns with
              // the new values so the upload becomes the new balance baseline.
              for (const { field } of OPENING_BALANCE_FIELDS) {
                memberUpdate[field] = (vals as any)[field]?.toString() ?? "0";
              }
              memberUpdate.totalLoanBalance = vals.totalLoanBalance.toString();
              memberUpdate.totalStoreDebt   = vals.totalStoreDebt.toString();
              activeOverridden++;
            }
            // Pending members: ob_* and effective date are set above; current
            // balance columns are initialised at the approval-gate claim step.

            await tx
              .update(membersTable)
              .set(memberUpdate)
              .where(eq(membersTable.id, matchedMemberId));
            membersSynced++;
          }
        }

        // Persist a revisitable summary of this import run so the admin can
        // later confirm everyone came in (totalRows vs inserted) and inspect
        // exactly which rows were skipped and why.
        await tx.insert(openingBalanceImportsTable).values({
          uploadedBy: req.memberId!,
          organization: org,
          sheetName,
          totalRows,
          inserted,
          skipped: skippedDetails.length,
          membersSynced,
          skippedDetails,
          effectiveMonth,
          effectiveYear,
        } as any);
      });

      await logAudit({
        actorId: req.memberId,
        action: "IMPORT_OPENING_BALANCES",
        entity: "opening_balance",
        entityId: 0,
        details: `Re-uploaded opening balances from "${sheetName}"${org ? ` (${org})` : ""} effective ${effectiveMonth}/${effectiveYear}: ${inserted} inserted, ${skippedDetails.length} skipped, ${membersSynced} members synced (${activeOverridden} active balances overridden).`,
      });

      res.json({ inserted, skipped: skippedDetails.length, membersSynced, activeOverridden, totalRows, skippedDetails });
    } catch (err: any) {
      res.status(400).json({ error: `Failed to process file: ${err.message}` });
    }
  },
);

router.get(
  "/opening-balances/imports",
  requireAuth,
  requireAdmin,
  async (_req: AuthRequest, res): Promise<void> => {
    const imports = await db
      .select()
      .from(openingBalanceImportsTable)
      .orderBy(desc(openingBalanceImportsTable.createdAt))
      .limit(50);

    const members = await db
      .select({ id: membersTable.id, fullName: membersTable.fullName })
      .from(membersTable);
    const memberMap = Object.fromEntries(members.map((m) => [m.id, m.fullName]));

    res.json(
      imports.map((r) => ({
        ...r,
        uploaderName: memberMap[r.uploadedBy] || "Unknown",
      })),
    );
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
    if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

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
