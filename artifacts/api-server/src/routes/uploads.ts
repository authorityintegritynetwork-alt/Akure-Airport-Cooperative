import { Router, type IRouter } from "express";
import {
  db,
  membersTable,
  transactionsTable,
  uploadRecordsTable,
  loansTable,
  organizationsTable,
  openingBalancesTable,
} from "@workspace/db";
import { eq, and, asc, sql } from "drizzle-orm";
import { requireAuth, requireAdmin, requireReverification, AuthRequest } from "../middlewares/auth";
import { logAudit } from "../lib/audit";
import { sendNotification } from "../lib/notifications";
import {
  ListExcelSheetsBody as ExcelSheetsBody,
  PreviewExcelUploadBody,
  ProcessExcelUploadBody,
} from "@workspace/api-zod";
import {
  ALL_CATEGORIES,
  CATEGORY_CONFIG,
  DeductionCategory,
  downloadWorkbook,
  parseSheet,
  ParsedRow,
  summarizeSheets,
} from "../lib/excelParser";
import { NameMatcher, MatchResult } from "../lib/nameMatcher";

const router: IRouter = Router();


async function loadOrgOrFail(
  code: string,
  res: import("express").Response,
): Promise<{ id: number; code: string; isActive: boolean } | null> {
  const normalised = code.trim().toUpperCase();
  const [org] = await db
    .select({
      id: organizationsTable.id,
      code: organizationsTable.code,
      isActive: organizationsTable.isActive,
    })
    .from(organizationsTable)
    .where(eq(organizationsTable.code, normalised));
  if (!org) {
    res.status(400).json({ error: `Unknown organization "${code}".` });
    return null;
  }
  if (!org.isActive) {
    res.status(400).json({ error: `Organization "${org.code}" is currently deactivated.` });
    return null;
  }
  return org;
}

async function loadMatcher(): Promise<NameMatcher> {
  const all = await db
    .select({ id: membersTable.id, fullName: membersTable.fullName })
    .from(membersTable);
  return new NameMatcher(all);
}

function applyManualMatches(
  row: ParsedRow,
  matchResult: MatchResult,
  manualMap: Map<number, number>,
  membersById: Map<number, { id: number; fullName: string }>,
): MatchResult {
  const manual = manualMap.get(row.rowNumber);
  if (manual !== undefined) {
    const m = membersById.get(manual);
    if (m) {
      return { memberId: m.id, memberName: m.fullName, confidence: "manual" };
    }
  }
  return matchResult;
}

router.post(
  "/uploads/excel/sheets",
  requireAuth,
  requireAdmin,
  async (req: AuthRequest, res): Promise<void> => {
    const parsed = ExcelSheetsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const org = await loadOrgOrFail(parsed.data.organization, res);
    if (!org) return;
    try {
      const wb = await downloadWorkbook(parsed.data.fileObjectPath);
      res.json({ sheets: summarizeSheets(wb) });
    } catch (err: any) {
      res.status(400).json({ error: `Failed to read Excel file: ${err.message}` });
    }
  },
);

router.post(
  "/uploads/excel/preview",
  requireAuth,
  requireAdmin,
  async (req: AuthRequest, res): Promise<void> => {
    const parsed = PreviewExcelUploadBody.safeParse(req.body);
    if (!parsed.success) {
      req.log?.warn({ issues: parsed.error.issues, body: req.body }, "preview body invalid");
      res.status(400).json({ error: parsed.error.message, issues: parsed.error.issues });
      return;
    }

    const orgRecord = await loadOrgOrFail(parsed.data.organization, res);
    if (!orgRecord) return;
    try {
      const wb = await downloadWorkbook(parsed.data.fileObjectPath);
      const sheetName = parsed.data.sheetName || wb.SheetNames[0];
      if (!wb.SheetNames.includes(sheetName)) {
        res.status(400).json({ error: `Sheet "${sheetName}" not found in workbook` });
        return;
      }

      const sheet = parseSheet(wb, sheetName);
      const matcher = await loadMatcher();

      const allMembers = await db
        .select({
          id: membersTable.id,
          fullName: membersTable.fullName,
          organization: membersTable.organization,
        })
        .from(membersTable);
      const membersById = new Map(allMembers.map((m) => [m.id, m]));

      const manualMap = new Map<number, number>();
      for (const m of parsed.data.manualMatches || []) {
        manualMap.set(m.rowNumber, m.memberId);
      }

      const uploadOrg = orgRecord.code;
      const dup = await db
        .select({ id: uploadRecordsTable.id })
        .from(uploadRecordsTable)
        .where(
          and(
            eq(uploadRecordsTable.month, parsed.data.month),
            eq(uploadRecordsTable.year, parsed.data.year),
            eq(uploadRecordsTable.organization, uploadOrg),
            eq(uploadRecordsTable.status, "processed"),
          ),
        );
      const previewRows = sheet.rows.map((row) => {
        const baseMatch = matcher.match(row.rawName);
        const finalMatch = applyManualMatches(row, baseMatch, manualMap, membersById);
        const member =
          finalMatch.memberId != null ? membersById.get(finalMatch.memberId) : null;
        const memberOrg = member?.organization ?? null;
        const orgMismatch = memberOrg != null && memberOrg !== uploadOrg;
        const warnings = [...row.warnings];
        if (orgMismatch) {
          warnings.push(
            `Member is tagged as ${memberOrg} but this upload is for ${uploadOrg}.`,
          );
        }
        return {
          rowNumber: row.rowNumber,
          rawName: row.rawName,
          matchedMemberId: finalMatch.memberId,
          matchedMemberName: finalMatch.memberName,
          matchConfidence: finalMatch.confidence,
          savings: row.amounts.savings,
          provident: row.amounts.provident,
          christmas: row.amounts.christmas,
          realLoan: row.amounts.realLoan,
          emergencyLoan: row.amounts.emergencyLoan,
          electronics: row.amounts.electronics,
          sElectronics: row.amounts.sElectronics,
          furniture: row.amounts.furniture,
          commodity: row.amounts.commodity,
          ghlForm: row.amounts.ghlForm,
          fire: row.amounts.fire,
          fuelVenture: row.amounts.fuelVenture,
          landLoan: row.amounts.landLoan,
          memberOrganization: memberOrg,
          orgMismatch,
          total: row.total,
          computedTotal: row.computedTotal,
          totalMismatch: row.totalMismatch,
          errors: row.errors,
          warnings,
        };
      });

      const matched = previewRows.filter((r) => r.matchedMemberId != null).length;
      const unmatched = previewRows.length - matched;
      const errorRows = previewRows.filter((r) => r.errors.length > 0).length;

      res.json({
        sheetName,
        month: parsed.data.month,
        year: parsed.data.year,
        totalRows: previewRows.length,
        matchedRows: matched,
        unmatchedRows: unmatched,
        errorRows,
        duplicateMonth: dup.length > 0,
        rows: previewRows,
      });
    } catch (err: any) {
      console.error("Preview error", err);
      res.status(400).json({ error: `Failed to preview Excel file: ${err.message}` });
    }
  },
);

router.post(
  "/uploads/excel/process",
  requireAuth,
  requireAdmin,
  requireReverification,
  async (req: AuthRequest, res): Promise<void> => {
    const parsed = ProcessExcelUploadBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const orgRecord = await loadOrgOrFail(parsed.data.organization, res);
    if (!orgRecord) return;
    try {
      const wb = await downloadWorkbook(parsed.data.fileObjectPath);
      const sheetName = parsed.data.sheetName || wb.SheetNames[0];
      if (!wb.SheetNames.includes(sheetName)) {
        res.status(400).json({ error: `Sheet "${sheetName}" not found in workbook` });
        return;
      }

      const sheet = parseSheet(wb, sheetName);
      const matcher = await loadMatcher();

      const allMembers = await db
        .select({
          id: membersTable.id,
          fullName: membersTable.fullName,
          organization: membersTable.organization,
        })
        .from(membersTable);
      const membersById = new Map(allMembers.map((m) => [m.id, m]));

      const manualMap = new Map<number, number>();
      for (const m of parsed.data.manualMatches || []) {
        manualMap.set(m.rowNumber, m.memberId);
      }

      const uploadOrg = orgRecord.code;
      const autoTag = parsed.data.autoTagOrganization !== false;

      // Run the entire processing in a single DB transaction so that any
      // failure rolls back all transaction inserts and balance/loan mutations.
      // Use SQL arithmetic (col = col + amt) for race-safe updates and
      // SELECT ... FOR UPDATE to lock member rows during the batch.
      // A Postgres advisory lock keyed on (month, year) serializes any
      // concurrent attempts for the same period so the duplicate check
      // and insertion happen atomically.
      const periodKey = `${parsed.data.month.toLowerCase()}-${parsed.data.year}`;
      const result = await db.transaction(async (tx) => {
        // Acquire a transaction-scoped advisory lock for this period.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${periodKey}))`);

        // Re-check duplicates inside the lock so two concurrent requests
        // cannot both pass the guard.
        const dupInTx = await tx
          .select({ id: uploadRecordsTable.id })
          .from(uploadRecordsTable)
          .where(
            and(
              eq(uploadRecordsTable.month, parsed.data.month),
              eq(uploadRecordsTable.year, parsed.data.year),
              eq(uploadRecordsTable.organization, uploadOrg),
              eq(uploadRecordsTable.status, "processed"),
            ),
          );
        if (dupInTx.length > 0) {
          return {
            __duplicate: true as const,
            existingUploadId: dupInTx[0].id,
          };
        }

        const [uploadRecord] = await tx
          .insert(uploadRecordsTable)
          .values({
            uploadedBy: req.memberId!,
            month: parsed.data.month,
            year: parsed.data.year,
            organization: uploadOrg,
            fileObjectPath: parsed.data.fileObjectPath,
            status: "pending",
          })
          .returning();

        let processed = 0;
        let skipped = 0;
        const errors: string[] = [];
        const notifications: Array<{ memberId: number; total: number }> = [];
        // Track which sheet rows matched a registered member so the opening
        // balance pass below can detect (and flag) double matches.
        const memberMatchedRows = new Set<number>();

        for (const row of sheet.rows) {
          const baseMatch = matcher.match(row.rawName);
          const finalMatch = applyManualMatches(row, baseMatch, manualMap, membersById);

          if (finalMatch.memberId == null) {
            skipped++;
            if (!parsed.data.skipErrors) {
              errors.push(`Row ${row.rowNumber}: no member matched for "${row.rawName}"`);
            }
            continue;
          }

          const memberId = finalMatch.memberId;
          memberMatchedRows.add(row.rowNumber);

          // Lock the member row for the duration of this row's processing.
          const lockedRows = await tx.execute<{ id: number; organization: string }>(
            sql`SELECT id, organization FROM ${membersTable} WHERE id = ${memberId} FOR UPDATE`,
          );
          if (!lockedRows.rows || lockedRows.rows.length === 0) {
            skipped++;
            continue;
          }
          const lockedMemberOrg = (lockedRows.rows[0] as any).organization as
            | "faan"
            | "nama";

          // Auto-tag matched member to upload's organization when configured.
          if (autoTag && lockedMemberOrg !== uploadOrg) {
            await tx
              .update(membersTable)
              .set({ organization: uploadOrg })
              .where(eq(membersTable.id, memberId));
          }

          const balanceDeltas: Record<string, number> = {};
          let rowTouched = false;

          for (const cat of ALL_CATEGORIES) {
            const amt = row.amounts[cat];
            if (!amt || amt <= 0) continue;
            const cfg = CATEGORY_CONFIG[cat];

            await tx.insert(transactionsTable).values({
              memberId,
              type: cfg.txType,
              category: cat,
              amount: amt.toString(),
              description: `${cfg.label} - ${parsed.data.month} ${parsed.data.year}`,
              uploadRecordId: uploadRecord.id,
              month: parsed.data.month,
              year: parsed.data.year,
            });

            const signed = cfg.direction === "credit" ? amt : -amt;
            balanceDeltas[cfg.balanceField as string] =
              (balanceDeltas[cfg.balanceField as string] || 0) + signed;
            rowTouched = true;

            // Apply loan repayment FIFO: oldest disbursed loan with outstanding > 0.
            // NOTE: schema does not yet distinguish real vs emergency loans;
            // when added, filter by loan type here.
            if (cfg.loanStatus) {
              const loans = await tx
                .select()
                .from(loansTable)
                .where(
                  and(
                    eq(loansTable.memberId, memberId),
                    eq(loansTable.status, "disbursed"),
                  ),
                )
                .orderBy(asc(loansTable.disbursedAt), asc(loansTable.id));

              let remaining = amt;
              for (const loan of loans) {
                if (remaining <= 0) break;
                const out = parseFloat(loan.outstandingBalance);
                if (out <= 0) continue;
                const pay = Math.min(out, remaining);
                await tx
                  .update(loansTable)
                  .set({
                    outstandingBalance: sql`GREATEST(0, ${loansTable.outstandingBalance} - ${pay.toString()}::numeric)`,
                  })
                  .where(eq(loansTable.id, loan.id));
                remaining -= pay;
              }
            }
          }

          if (rowTouched) {
            // Build atomic SQL update applying all deltas at once and recomputing aggregates.
            const setClauses: Record<string, any> = {};
            for (const [field, delta] of Object.entries(balanceDeltas)) {
              const col = (membersTable as any)[field];
              if (delta >= 0) {
                setClauses[field] = sql`${col} + ${delta.toString()}::numeric`;
              } else {
                setClauses[field] = sql`GREATEST(0, ${col} - ${Math.abs(delta).toString()}::numeric)`;
              }
            }
            // Recompute aggregates from the new column values in the same UPDATE.
            setClauses.totalLoanBalance = sql`${membersTable.realLoanBalance} + ${membersTable.emergencyLoanBalance}`;
            setClauses.totalStoreDebt = sql`${membersTable.electronicsDebt} + ${membersTable.sElectronicsDebt} + ${membersTable.commodityDebt} + ${membersTable.ghlFormDebt}`;

            await tx
              .update(membersTable)
              .set(setClauses)
              .where(eq(membersTable.id, memberId));

            notifications.push({ memberId, total: row.computedTotal });
            processed++;
          } else {
            skipped++;
          }
        }

        // ── Opening-balance pass ────────────────────────────────────────────
        // Deductions must also flow into still-unclaimed opening balances so a
        // member who registers later inherits the post-deduction figure. Match
        // by name against unclaimed rows only. If a sheet row already matched a
        // registered member, flag the duplicate opening row for admin review
        // instead of double-applying.
        let openingProcessed = 0;
        let openingFlagged = 0;
        const unclaimedOpenings = await tx
          .select({ id: openingBalancesTable.id, fullName: openingBalancesTable.fullName })
          .from(openingBalancesTable)
          .where(eq(openingBalancesTable.status, "unclaimed"))
          .for("update");

        if (unclaimedOpenings.length > 0) {
          const obMatcher = new NameMatcher(unclaimedOpenings);
          for (const row of sheet.rows) {
            const obMatch = obMatcher.match(row.rawName);
            if (obMatch.memberId == null) continue;
            const openingId = obMatch.memberId;

            if (memberMatchedRows.has(row.rowNumber)) {
              await tx
                .update(openingBalancesTable)
                .set({
                  status: "needs_reconcile",
                  reconcileNote: `Monthly deduction for ${parsed.data.month} ${parsed.data.year} also matched a registered member ("${row.rawName}"). Applied to the member; this row was left untouched for review.`,
                })
                .where(eq(openingBalancesTable.id, openingId));
              openingFlagged++;
              continue;
            }

            const obDeltas: Record<string, number> = {};
            let obTouched = false;
            for (const cat of ALL_CATEGORIES) {
              const amt = row.amounts[cat];
              if (!amt || amt <= 0) continue;
              const cfg = CATEGORY_CONFIG[cat];
              const signed = cfg.direction === "credit" ? amt : -amt;
              obDeltas[cfg.balanceField as string] =
                (obDeltas[cfg.balanceField as string] || 0) + signed;
              obTouched = true;
            }

            if (!obTouched) continue;

            const obSet: Record<string, any> = {};
            for (const [field, delta] of Object.entries(obDeltas)) {
              const col = (openingBalancesTable as any)[field];
              if (delta >= 0) {
                obSet[field] = sql`${col} + ${delta.toString()}::numeric`;
              } else {
                obSet[field] = sql`GREATEST(0, ${col} - ${Math.abs(delta).toString()}::numeric)`;
              }
            }
            obSet.totalLoanBalance = sql`${openingBalancesTable.realLoanBalance} + ${openingBalancesTable.emergencyLoanBalance}`;
            obSet.totalStoreDebt = sql`${openingBalancesTable.electronicsDebt} + ${openingBalancesTable.sElectronicsDebt} + ${openingBalancesTable.commodityDebt} + ${openingBalancesTable.ghlFormDebt}`;

            await tx
              .update(openingBalancesTable)
              .set(obSet)
              .where(eq(openingBalancesTable.id, openingId));
            openingProcessed++;
          }
        }

        await tx
          .update(uploadRecordsTable)
          .set({
            rowsProcessed: processed,
            rowsSkipped: skipped,
            status: "processed",
          })
          .where(eq(uploadRecordsTable.id, uploadRecord.id));

        return {
          uploadRecord,
          processed,
          skipped,
          errors,
          notifications,
          openingProcessed,
          openingFlagged,
        };
      });

      if ("__duplicate" in result && result.__duplicate) {
        res.status(409).json({
          error: `An upload for ${parsed.data.month} ${parsed.data.year} has already been processed (record #${result.existingUploadId}). Void it first if you need to re-run.`,
          existingUploadId: result.existingUploadId,
        });
        return;
      }

      const { uploadRecord, processed, skipped, errors, notifications, openingProcessed, openingFlagged } =
        result;

      // Notifications are sent post-commit so that a rollback never leaves
      // members notified about transactions that did not actually persist.
      for (const n of notifications) {
        await sendNotification({
          memberId: n.memberId,
          type: "transaction",
          title: `Monthly Deductions Recorded - ${parsed.data.month} ${parsed.data.year}`,
          message: `Your deductions of ₦${n.total.toLocaleString()} have been processed.`,
        });
      }

      await logAudit({
        actorId: req.memberId,
        action: "PROCESS_EXCEL_UPLOAD",
        entity: "upload_record",
        entityId: uploadRecord.id,
        details: `Sheet "${sheetName}" for ${parsed.data.month} ${parsed.data.year}: ${processed} processed, ${skipped} skipped, ${openingProcessed} opening balance(s) updated, ${openingFlagged} flagged for review`,
      });

      res.json({
        uploadRecordId: uploadRecord.id,
        processed,
        skipped,
        errors,
        openingBalancesUpdated: openingProcessed,
        openingBalancesFlagged: openingFlagged,
      });
    } catch (err: any) {
      console.error("Process error", err);
      res.status(400).json({ error: `Failed to process Excel file: ${err.message}` });
    }
  },
);

router.get(
  "/uploads/history",
  requireAuth,
  requireAdmin,
  async (_req: AuthRequest, res): Promise<void> => {
    const records = await db
      .select()
      .from(uploadRecordsTable)
      .orderBy(uploadRecordsTable.createdAt);

    const members = await db
      .select({ id: membersTable.id, fullName: membersTable.fullName })
      .from(membersTable);
    const memberMap = Object.fromEntries(members.map((m) => [m.id, m.fullName]));

    res.json(
      records.map((r) => ({
        ...r,
        uploaderName: memberMap[r.uploadedBy] || "Unknown",
      })),
    );
  },
);

export default router;
