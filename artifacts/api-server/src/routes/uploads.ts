import { Router, type IRouter } from "express";
import {
  db,
  membersTable,
  transactionsTable,
  uploadRecordsTable,
  loansTable,
} from "@workspace/db";
import { eq, and, asc, sql } from "drizzle-orm";
import { requireAuth, requireAdmin, AuthRequest } from "../middlewares/auth";
import { logAudit } from "../lib/audit";
import { sendNotification } from "../lib/notifications";
import {
  ListExcelSheetsBody as ExcelSheetsBody,
  PreviewExcelUploadBody,
  ProcessExcelUploadBody,
} from "@workspace/api-zod";
import {
  ALL_CATEGORIES,
  DeductionCategory,
  downloadWorkbook,
  parseSheet,
  ParsedRow,
  summarizeSheets,
} from "../lib/excelParser";
import { NameMatcher, MatchResult } from "../lib/nameMatcher";

const router: IRouter = Router();

interface CategoryConfig {
  txType:
    | "savings"
    | "provident"
    | "christmas"
    | "real_loan_repayment"
    | "emergency_loan_repayment"
    | "electronics_repayment"
    | "s_electronics_repayment"
    | "furniture_repayment"
    | "commodity_repayment"
    | "ghl_form_repayment"
    | "fire";
  balanceField: keyof typeof membersTable.$inferSelect;
  direction: "credit" | "debit";
  label: string;
  loanStatus?: "real" | "emergency";
}

const CATEGORY_CONFIG: Record<DeductionCategory, CategoryConfig> = {
  savings: {
    txType: "savings",
    balanceField: "savingsBalance",
    direction: "credit",
    label: "Savings",
  },
  provident: {
    txType: "provident",
    balanceField: "providentBalance",
    direction: "credit",
    label: "Provident",
  },
  christmas: {
    txType: "christmas",
    balanceField: "christmasBalance",
    direction: "credit",
    label: "Christmas Savings",
  },
  realLoan: {
    txType: "real_loan_repayment",
    balanceField: "realLoanBalance",
    direction: "debit",
    label: "Real Loan Repayment",
    loanStatus: "real",
  },
  emergencyLoan: {
    txType: "emergency_loan_repayment",
    balanceField: "emergencyLoanBalance",
    direction: "debit",
    label: "Emergency Loan Repayment",
    loanStatus: "emergency",
  },
  electronics: {
    txType: "electronics_repayment",
    balanceField: "electronicsDebt",
    direction: "debit",
    label: "Electronics Repayment",
  },
  sElectronics: {
    txType: "s_electronics_repayment",
    balanceField: "sElectronicsDebt",
    direction: "debit",
    label: "Small Electronics Repayment",
  },
  furniture: {
    txType: "furniture_repayment",
    balanceField: "furnitureDebt",
    direction: "debit",
    label: "Furniture Repayment",
  },
  commodity: {
    txType: "commodity_repayment",
    balanceField: "commodityDebt",
    direction: "debit",
    label: "Commodity Repayment",
  },
  ghlForm: {
    txType: "ghl_form_repayment",
    balanceField: "ghlFormDebt",
    direction: "debit",
    label: "Loan Form Cost Repayment",
  },
  fire: {
    txType: "fire",
    balanceField: "fireFundBalance",
    direction: "credit",
    label: "Fire Fund Contribution",
  },
};

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
      res.status(400).json({ error: parsed.error.message });
      return;
    }

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
        .select({ id: membersTable.id, fullName: membersTable.fullName })
        .from(membersTable);
      const membersById = new Map(allMembers.map((m) => [m.id, m]));

      const manualMap = new Map<number, number>();
      for (const m of parsed.data.manualMatches || []) {
        manualMap.set(m.rowNumber, m.memberId);
      }

      const dup = await db
        .select({ id: uploadRecordsTable.id })
        .from(uploadRecordsTable)
        .where(
          and(
            eq(uploadRecordsTable.month, parsed.data.month),
            eq(uploadRecordsTable.year, parsed.data.year),
            eq(uploadRecordsTable.status, "processed"),
          ),
        );

      const previewRows = sheet.rows.map((row) => {
        const baseMatch = matcher.match(row.rawName);
        const finalMatch = applyManualMatches(row, baseMatch, manualMap, membersById);
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
          total: row.total,
          computedTotal: row.computedTotal,
          totalMismatch: row.totalMismatch,
          errors: row.errors,
          warnings: row.warnings,
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
  async (req: AuthRequest, res): Promise<void> => {
    const parsed = ProcessExcelUploadBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

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
        .select({ id: membersTable.id, fullName: membersTable.fullName })
        .from(membersTable);
      const membersById = new Map(allMembers.map((m) => [m.id, m]));

      const manualMap = new Map<number, number>();
      for (const m of parsed.data.manualMatches || []) {
        manualMap.set(m.rowNumber, m.memberId);
      }

      // Run the entire processing in a single DB transaction so that any
      // failure rolls back all transaction inserts and balance/loan mutations.
      // Use SQL arithmetic (col = col + amt) for race-safe updates and
      // SELECT ... FOR UPDATE to lock member rows during the batch.
      const result = await db.transaction(async (tx) => {
        const [uploadRecord] = await tx
          .insert(uploadRecordsTable)
          .values({
            uploadedBy: req.memberId!,
            month: parsed.data.month,
            year: parsed.data.year,
            fileObjectPath: parsed.data.fileObjectPath,
            status: "pending",
          })
          .returning();

        let processed = 0;
        let skipped = 0;
        const errors: string[] = [];
        const notifications: Array<{ memberId: number; total: number }> = [];

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

          // Lock the member row for the duration of this row's processing.
          const lockedRows = await tx.execute<{ id: number }>(
            sql`SELECT id FROM ${membersTable} WHERE id = ${memberId} FOR UPDATE`,
          );
          if (!lockedRows.rows || lockedRows.rows.length === 0) {
            skipped++;
            continue;
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
            setClauses.totalStoreDebt = sql`${membersTable.electronicsDebt} + ${membersTable.sElectronicsDebt} + ${membersTable.furnitureDebt} + ${membersTable.commodityDebt} + ${membersTable.ghlFormDebt}`;

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

        await tx
          .update(uploadRecordsTable)
          .set({
            rowsProcessed: processed,
            rowsSkipped: skipped,
            status: "processed",
          })
          .where(eq(uploadRecordsTable.id, uploadRecord.id));

        return { uploadRecord, processed, skipped, errors, notifications };
      });

      const { uploadRecord, processed, skipped, errors, notifications } = result;

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
        details: `Sheet "${sheetName}" for ${parsed.data.month} ${parsed.data.year}: ${processed} processed, ${skipped} skipped`,
      });

      res.json({
        uploadRecordId: uploadRecord.id,
        processed,
        skipped,
        errors,
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
