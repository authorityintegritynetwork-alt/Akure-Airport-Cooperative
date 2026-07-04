import { Router, type IRouter } from "express";
import { randomUUID } from "crypto";
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
  parsePayrollSheet,
  PayrollParsedSheet,
  PayrollParsedRow,
  canonicalEmployeeNo,
  computeDeductionSplit,
} from "../lib/excelParser";
import { NameMatcher, MatchResult } from "../lib/nameMatcher";

const router: IRouter = Router();

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];


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

// ── Payroll-format helpers ───────────────────────────────────────────────────

interface PayrollMemberRef {
  id: number;
  fullName: string;
  organization: string;
  employeeNo: string | null;
}

/** Index of canonical employee number → member, scoped to the upload's organization. */
function buildEmpNoIndex<M extends PayrollMemberRef>(
  members: M[],
  uploadOrg: string,
): Map<string, M> {
  const idx = new Map<string, M>();
  for (const m of members) {
    if (!m.employeeNo) continue;
    if (m.organization !== uploadOrg) continue;
    idx.set(canonicalEmployeeNo(m.employeeNo), m);
  }
  return idx;
}

type PayrollConfidence = "manual" | "employeeNo" | "exact" | "fuzzy" | "none";

/** Match priority: manual override → employee number (org-scoped) → name matcher. */
function matchPayrollRow<M extends PayrollMemberRef>(
  row: PayrollParsedRow,
  empNoIndex: Map<string, M>,
  matcher: NameMatcher,
  manualMap: Map<number, number>,
  membersById: Map<number, M>,
): { member: M | null; confidence: PayrollConfidence } {
  const manual = manualMap.get(row.rowNumber);
  if (manual !== undefined) {
    const m = membersById.get(manual);
    if (m) return { member: m, confidence: "manual" };
  }
  const byNo = empNoIndex.get(canonicalEmployeeNo(row.employeeNo));
  if (byNo) return { member: byNo, confidence: "employeeNo" };
  const byName = matcher.match(row.rawName);
  if (byName.memberId != null) {
    const m = membersById.get(byName.memberId);
    if (m) return { member: m, confidence: byName.confidence as PayrollConfidence };
  }
  return { member: null, confidence: "none" };
}

/** Map a member record's current debt columns into split-input balances. */
function debtBalancesOf(m: Record<string, unknown>): Partial<Record<DeductionCategory, number>> {
  const num = (v: unknown) => (v == null ? 0 : parseFloat(String(v)) || 0);
  return {
    realLoan: num(m.realLoanBalance),
    emergencyLoan: num(m.emergencyLoanBalance),
    electronics: num(m.electronicsDebt),
    sElectronics: num(m.sElectronicsDebt),
    furniture: num(m.furnitureDebt),
    commodity: num(m.commodityDebt),
    ghlForm: num(m.ghlFormDebt),
    fuelVenture: num(m.fuelVentureBalance),
    landLoan: num(m.landLoanBalance),
  };
}

/**
 * Insert per-category transactions, apply loan-FIFO repayments and atomically
 * update the member's balances for one row of deduction amounts. Shared by the
 * classic multi-column format and the payroll single-amount format.
 * Returns true when at least one category carried an amount.
 */
async function applyDeductionAmounts(
  tx: Tx,
  memberId: number,
  amounts: Record<DeductionCategory, number>,
  ctx: { month: string; year: number; uploadRecordId: number },
): Promise<boolean> {
  const balanceDeltas: Record<string, number> = {};
  let rowTouched = false;

  for (const cat of ALL_CATEGORIES) {
    const amt = amounts[cat];
    if (!amt || amt <= 0) continue;
    const cfg = CATEGORY_CONFIG[cat];

    await tx.insert(transactionsTable).values({
      memberId,
      type: cfg.txType,
      category: cat,
      amount: amt.toString(),
      description: `${cfg.label} - ${ctx.month} ${ctx.year}`,
      uploadRecordId: ctx.uploadRecordId,
      month: ctx.month,
      year: ctx.year,
    });

    const signed = cfg.direction === "credit" ? amt : -amt;
    balanceDeltas[cfg.balanceField as string] =
      (balanceDeltas[cfg.balanceField as string] || 0) + signed;
    rowTouched = true;

    // Apply loan repayment FIFO — scoped strictly by loan type.
    // realLoan column → only reduces Real loans (loanStatus='real').
    // emergencyLoan column → only reduces Emergency loans (loanStatus='emergency').
    // This prevents cross-type repayment (e.g. real-loan money paying off an emergency loan).
    if (cfg.loanStatus) {
      const loans = await tx
        .select()
        .from(loansTable)
        .where(
          and(
            eq(loansTable.memberId, memberId),
            eq(loansTable.status, "disbursed"),
            eq(loansTable.loanType, cfg.loanStatus),
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
  }

  return rowTouched;
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

      // Payroll single-amount format (Employee No | Name | Amount) takes
      // precedence when detected — monthly deduction files carry one total
      // per person that is split loans-first with the remainder to savings.
      const payroll = parsePayrollSheet(wb, sheetName);
      if (payroll) {
        await previewPayroll(res, parsed.data, orgRecord.code, payroll);
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
      // For unmatched rows, check whether an unclaimed opening balance exists — surfaced in preview UI
      const unclaimedObPreview = await db
        .select({ id: openingBalancesTable.id, fullName: openingBalancesTable.fullName })
        .from(openingBalancesTable)
        .where(eq(openingBalancesTable.status, "unclaimed"));
      const obPreviewMatcher = new NameMatcher(unclaimedObPreview);

      // Detect duplicate names within the sheet before building preview rows.
      const rawNameCounts = new Map<string, number>();
      for (const row of sheet.rows) {
        const key = row.rawName.toUpperCase();
        rawNameCounts.set(key, (rawNameCounts.get(key) ?? 0) + 1);
      }

      const previewRows = sheet.rows.map((row) => {
        const baseMatch = matcher.match(row.rawName);
        const finalMatch = applyManualMatches(row, baseMatch, manualMap, membersById);
        const member =
          finalMatch.memberId != null ? membersById.get(finalMatch.memberId) : null;
        const memberOrg = member?.organization ?? null;
        const orgMismatch = memberOrg != null && memberOrg !== uploadOrg;
        const isDuplicateName = (rawNameCounts.get(row.rawName.toUpperCase()) ?? 0) > 1;
        const warnings = [...row.warnings];
        const errors = [...row.errors];
        if (orgMismatch) {
          warnings.push(
            `Member is tagged as ${memberOrg} but this upload is for ${uploadOrg}.`,
          );
        }
        if (isDuplicateName) {
          errors.push(`Duplicate name in sheet: "${row.rawName}" appears more than once. Fix the spreadsheet before processing.`);
        }
        // null for matched rows; true/false for unmatched rows
        const hasOpeningBalance =
          finalMatch.memberId == null
            ? obPreviewMatcher.match(row.rawName).memberId != null
            : null;
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
          isDuplicateName,
          total: row.total,
          computedTotal: row.computedTotal,
          totalMismatch: row.totalMismatch,
          errors,
          warnings,
          hasOpeningBalance,
        };
      });

      const matched = previewRows.filter((r) => r.matchedMemberId != null).length;
      const unmatched = previewRows.length - matched;
      const errorRows = previewRows.filter((r) => r.errors.length > 0).length;
      const hasMismatchedTotals = previewRows.some((r) => r.totalMismatch);
      const hasDuplicateNames = previewRows.some((r) => r.isDuplicateName);

      res.json({
        format: "categories",
        sheetName,
        month: parsed.data.month,
        year: parsed.data.year,
        totalRows: previewRows.length,
        matchedRows: matched,
        unmatchedRows: unmatched,
        errorRows,
        duplicateMonth: dup.length > 0,
        hasMismatchedTotals,
        hasDuplicateNames,
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

      // Payroll single-amount format takes precedence when detected.
      const payroll = parsePayrollSheet(wb, sheetName);
      if (payroll) {
        await processPayroll(req, res, parsed.data, orgRecord.code, payroll, sheetName);
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

      // ── Pre-flight: reject if the sheet contains duplicate names ──────────
      const processNameCounts = new Map<string, number[]>();
      for (const row of sheet.rows) {
        const key = row.rawName.toUpperCase();
        if (!processNameCounts.has(key)) processNameCounts.set(key, []);
        processNameCounts.get(key)!.push(row.rowNumber);
      }
      const duplicatedNames = [...processNameCounts.entries()]
        .filter(([, rows]) => rows.length > 1)
        .map(([name, rows]) => `"${name}" (rows ${rows.join(", ")})`);
      if (duplicatedNames.length > 0) {
        res.status(422).json({
          error: `Upload rejected: the sheet contains duplicate member names. Fix the spreadsheet and re-upload.`,
          duplicates: duplicatedNames,
        });
        return;
      }

      // ── Pre-flight: require acknowledgement for total mismatches ──────────
      const hasMismatches = sheet.rows.some((r) => r.totalMismatch);
      if (hasMismatches && !parsed.data.acknowledgeMismatch) {
        res.status(422).json({
          error: "Some rows have a mismatch between the sheet Total column and the sum of individual columns. Run preview to review them, then re-submit with acknowledgeMismatch: true.",
          code: "TOTAL_MISMATCH",
        });
        return;
      }

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
        let autoCreated = 0;
        const errors: string[] = [];
        const notifications: Array<{ memberId: number; total: number }> = [];
        // Track which sheet rows matched a registered member so the opening
        // balance pass below can detect (and flag) double matches.
        const memberMatchedRows = new Set<number>();
        // Track rows for which we auto-created a brand-new pending member. Their
        // matching opening balance (if any) is deliberately left UNCLAIMED so it
        // is only linked/copied when an admin approves the member. These rows are
        // therefore excluded from the needs_reconcile double-match pass below.
        const autoCreatedRows = new Set<number>();

        // Pre-load unclaimed OB rows once for the entire transaction (FOR UPDATE
        // so concurrent processes see a stable snapshot).
        const unclaimedOpenings = await tx
          .select({ id: openingBalancesTable.id, fullName: openingBalancesTable.fullName })
          .from(openingBalancesTable)
          .where(eq(openingBalancesTable.status, "unclaimed"))
          .for("update");
        const obMatcher = new NameMatcher(unclaimedOpenings);

        for (const row of sheet.rows) {
          const baseMatch = matcher.match(row.rawName);
          const finalMatch = applyManualMatches(row, baseMatch, manualMap, membersById);

          let rowWasAutoCreated = false;
          if (finalMatch.memberId == null) {
            // Auto-create a pending member so deductions are never silently lost.
            // We intentionally do NOT copy any matching opening balance onto the
            // member or mark that OB as claimed here — claiming only happens when
            // an admin approves the member. The OB stays unclaimed and is picked
            // up at approval time. This avoids "claiming" balances for someone who
            // was never approved.
            rowWasAutoCreated = true;
            autoCreatedRows.add(row.rowNumber);
            const newMemberId = await (async () => {
              const placeholderEmail = `unmatched-${randomUUID()}@placeholder.aacsms.internal`;
              const [newMember] = await tx
                .insert(membersTable)
                .values({
                  fullName: row.rawName,
                  email: placeholderEmail,
                  organization: uploadOrg,
                  status: "pending",
                })
                .returning({ id: membersTable.id });

              autoCreated++;
              return newMember.id;
            })();

            // Re-assign memberId and fall through to transaction processing.
            (finalMatch as { memberId: number | null }).memberId = newMemberId;
          }

          const memberId = finalMatch.memberId!;
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

          const rowTouched = await applyDeductionAmounts(tx, memberId, row.amounts, {
            month: parsed.data.month,
            year: parsed.data.year,
            uploadRecordId: uploadRecord.id,
          });

          if (rowTouched) {
            // Only notify and count as "processed" for existing matched members.
            // Auto-created rows are tracked separately via autoCreated counter.
            if (!rowWasAutoCreated) {
              notifications.push({ memberId, total: row.computedTotal });
              processed++;
            }
          } else {
            if (!rowWasAutoCreated) skipped++;
          }
        }

        // ── Opening-balance reconcile pass ──────────────────────────────────
        // Unmatched rows now auto-create members and claim their OB directly
        // in the main loop above. This pass only handles the remaining edge
        // case: a sheet row matched a *registered* member but an unclaimed OB
        // row also matches the same name — flag those for admin review so they
        // are not silently double-counted.
        let openingFlagged = 0;

        // Build a Set of still-unclaimed OB IDs for O(1) lookup.
        // The auto-create loop above splices claimed entries from unclaimedOpenings,
        // so this set correctly excludes OBs that were already claimed.
        const stillUnclaimedIds = new Set(unclaimedOpenings.map((r) => r.id));

        if (stillUnclaimedIds.size > 0) {
          for (const row of sheet.rows) {
            if (!memberMatchedRows.has(row.rowNumber)) continue;
            // Auto-created members leave their matching OB unclaimed for approval —
            // do not flag it for reconcile.
            if (autoCreatedRows.has(row.rowNumber)) continue;
            const obMatch = obMatcher.match(row.rawName);
            if (obMatch.memberId == null) continue;
            // Skip if this OB was already claimed by the auto-create step above.
            if (!stillUnclaimedIds.has(obMatch.memberId)) continue;
            await tx
              .update(openingBalancesTable)
              .set({
                status: "needs_reconcile",
                reconcileNote: `Monthly deduction for ${parsed.data.month} ${parsed.data.year} also matched a registered member ("${row.rawName}"). Applied to the member; this row was left untouched for review.`,
              })
              .where(eq(openingBalancesTable.id, obMatch.memberId));
            openingFlagged++;
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
          autoCreated,
          errors,
          notifications,
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

      const { uploadRecord, processed, skipped, autoCreated, errors, notifications, openingFlagged } =
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
        details: `Sheet "${sheetName}" for ${parsed.data.month} ${parsed.data.year}: ${processed} processed, ${autoCreated} auto-created, ${skipped} skipped, ${openingFlagged} OB rows flagged for review`,
      });

      res.json({
        uploadRecordId: uploadRecord.id,
        processed,
        skipped,
        autoCreated,
        errors,
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

// ── Payroll single-amount format: preview ────────────────────────────────────
async function previewPayroll(
  res: import("express").Response,
  body: {
    month: string;
    year: number;
    manualMatches?: Array<{ rowNumber: number; memberId: number }> | null;
  },
  uploadOrg: string,
  payroll: PayrollParsedSheet,
): Promise<void> {
  const allMembers = await db
    .select({
      id: membersTable.id,
      fullName: membersTable.fullName,
      organization: membersTable.organization,
      employeeNo: membersTable.employeeNo,
      realLoanBalance: membersTable.realLoanBalance,
      emergencyLoanBalance: membersTable.emergencyLoanBalance,
      electronicsDebt: membersTable.electronicsDebt,
      sElectronicsDebt: membersTable.sElectronicsDebt,
      furnitureDebt: membersTable.furnitureDebt,
      commodityDebt: membersTable.commodityDebt,
      ghlFormDebt: membersTable.ghlFormDebt,
      fuelVentureBalance: membersTable.fuelVentureBalance,
      landLoanBalance: membersTable.landLoanBalance,
    })
    .from(membersTable);
  const membersById = new Map(allMembers.map((m) => [m.id, m]));
  const empNoIndex = buildEmpNoIndex(allMembers, uploadOrg);
  const matcher = new NameMatcher(allMembers);

  const manualMap = new Map<number, number>();
  for (const m of body.manualMatches || []) manualMap.set(m.rowNumber, m.memberId);

  const dup = await db
    .select({ id: uploadRecordsTable.id })
    .from(uploadRecordsTable)
    .where(
      and(
        eq(uploadRecordsTable.month, body.month),
        eq(uploadRecordsTable.year, body.year),
        eq(uploadRecordsTable.organization, uploadOrg),
        eq(uploadRecordsTable.status, "processed"),
      ),
    );

  const unclaimedObPreview = await db
    .select({ id: openingBalancesTable.id, fullName: openingBalancesTable.fullName })
    .from(openingBalancesTable)
    .where(eq(openingBalancesTable.status, "unclaimed"));
  const obPreviewMatcher = new NameMatcher(unclaimedObPreview);

  // Track multiple rows resolving to the same member — an error the admin must fix.
  const memberRowMap = new Map<number, number[]>();

  const rows = payroll.rows.map((row) => {
    const { member, confidence } = matchPayrollRow(
      row,
      empNoIndex,
      matcher,
      manualMap,
      membersById,
    );
    // Split preview against the member's CURRENT balances (re-computed at
    // process time inside the transaction, so this is indicative).
    const split = computeDeductionSplit(member ? debtBalancesOf(member) : {}, row.amount);
    const memberOrg = member?.organization ?? null;
    const orgMismatch = memberOrg != null && memberOrg !== uploadOrg;
    const warnings = [...row.warnings];
    const errors = [...row.errors];
    if (orgMismatch) {
      warnings.push(`Member is tagged as ${memberOrg} but this upload is for ${uploadOrg}.`);
    }
    if (member) {
      if (!memberRowMap.has(member.id)) memberRowMap.set(member.id, []);
      memberRowMap.get(member.id)!.push(row.rowNumber);
      if (
        member.employeeNo &&
        canonicalEmployeeNo(member.employeeNo) !== canonicalEmployeeNo(row.employeeNo)
      ) {
        warnings.push(
          `Member is on file with employee no. ${member.employeeNo}, but the sheet says ${row.employeeNo}.`,
        );
      }
      if (!member.employeeNo) {
        warnings.push(
          `Employee no. ${row.employeeNo} will be saved to this member when processed.`,
        );
      }
    }
    const hasOpeningBalance =
      member == null ? obPreviewMatcher.match(row.rawName).memberId != null : null;
    return {
      rowNumber: row.rowNumber,
      rawName: row.rawName,
      employeeNo: row.employeeNo,
      amount: row.amount,
      matchedMemberId: member?.id ?? null,
      matchedMemberName: member?.fullName ?? null,
      matchConfidence: confidence,
      savings: split.savings,
      provident: split.provident,
      christmas: split.christmas,
      realLoan: split.realLoan,
      emergencyLoan: split.emergencyLoan,
      electronics: split.electronics,
      sElectronics: split.sElectronics,
      furniture: split.furniture,
      commodity: split.commodity,
      ghlForm: split.ghlForm,
      fire: split.fire,
      fuelVenture: split.fuelVenture,
      landLoan: split.landLoan,
      memberOrganization: memberOrg,
      orgMismatch,
      isDuplicateName: false,
      total: row.amount,
      computedTotal: row.amount,
      totalMismatch: false,
      errors,
      warnings,
      hasOpeningBalance,
    };
  });

  for (const r of rows) {
    if (r.matchedMemberId == null) continue;
    const rowNums = memberRowMap.get(r.matchedMemberId) ?? [];
    if (rowNums.length > 1) {
      r.errors.push(
        `Rows ${rowNums.join(", ")} all match member "${r.matchedMemberName}". Fix the sheet or adjust the matches before processing.`,
      );
    }
  }

  const matched = rows.filter((r) => r.matchedMemberId != null).length;
  res.json({
    format: "payroll",
    sheetName: payroll.sheetName,
    month: body.month,
    year: body.year,
    totalRows: rows.length,
    matchedRows: matched,
    unmatchedRows: rows.length - matched,
    errorRows: rows.filter((r) => r.errors.length > 0).length,
    duplicateMonth: dup.length > 0,
    hasMismatchedTotals: false,
    hasDuplicateNames: false,
    totalAmount: payroll.totalAmount,
    skippedRows: payroll.skipped,
    rows,
  });
}

// ── Payroll single-amount format: process ────────────────────────────────────
async function processPayroll(
  req: AuthRequest,
  res: import("express").Response,
  body: {
    fileObjectPath: string;
    month: string;
    year: number;
    manualMatches?: Array<{ rowNumber: number; memberId: number }> | null;
    autoTagOrganization?: boolean | null;
  },
  uploadOrg: string,
  payroll: PayrollParsedSheet,
  sheetName: string,
): Promise<void> {
  // Duplicate employee numbers are a data error that must be fixed upstream.
  // Defensive re-check on CANONICAL numbers ("015" ≡ "15") in addition to the
  // parser's own gate, so collisions can never slip into processing.
  const canonSeen = new Map<string, number[]>();
  for (const r of payroll.rows) {
    const canon = canonicalEmployeeNo(r.employeeNo);
    if (!canonSeen.has(canon)) canonSeen.set(canon, []);
    canonSeen.get(canon)!.push(r.rowNumber);
  }
  for (const r of payroll.rows) {
    const rowsWithNo = canonSeen.get(canonicalEmployeeNo(r.employeeNo))!;
    if (rowsWithNo.length > 1 && r.errors.length === 0) {
      r.errors.push(
        `Duplicate employee number "${r.employeeNo}" in sheet (rows ${rowsWithNo.join(", ")}). Fix the spreadsheet before processing.`,
      );
    }
  }
  const badRows = payroll.rows.filter((r) => r.errors.length > 0);
  if (badRows.length > 0) {
    res.status(422).json({
      error:
        "Upload rejected: the sheet contains duplicate employee numbers. Fix the spreadsheet and re-upload.",
      duplicates: badRows.map((r) => `Row ${r.rowNumber}: ${r.errors.join("; ")}`),
    });
    return;
  }

  const autoTag = body.autoTagOrganization !== false;
  const manualMap = new Map<number, number>();
  for (const m of body.manualMatches || []) manualMap.set(m.rowNumber, m.memberId);

  const periodKey = `${body.month.toLowerCase()}-${body.year}`;
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${periodKey}))`);

    const dupInTx = await tx
      .select({ id: uploadRecordsTable.id })
      .from(uploadRecordsTable)
      .where(
        and(
          eq(uploadRecordsTable.month, body.month),
          eq(uploadRecordsTable.year, body.year),
          eq(uploadRecordsTable.organization, uploadOrg),
          eq(uploadRecordsTable.status, "processed"),
        ),
      );
    if (dupInTx.length > 0) {
      return { __duplicate: true as const, existingUploadId: dupInTx[0].id };
    }

    const [uploadRecord] = await tx
      .insert(uploadRecordsTable)
      .values({
        uploadedBy: req.memberId!,
        month: body.month,
        year: body.year,
        organization: uploadOrg,
        fileObjectPath: body.fileObjectPath,
        status: "pending",
      })
      .returning();

    const allMembers = await tx
      .select({
        id: membersTable.id,
        fullName: membersTable.fullName,
        organization: membersTable.organization,
        employeeNo: membersTable.employeeNo,
      })
      .from(membersTable);
    const membersById = new Map(allMembers.map((m) => [m.id, m]));
    const empNoIndex = buildEmpNoIndex(allMembers, uploadOrg);
    const matcher = new NameMatcher(allMembers);

    let processed = 0;
    let skipped = 0;
    let autoCreated = 0;
    const errors: string[] = [];
    const notifications: Array<{ memberId: number; total: number }> = [];
    const memberMatchedRows = new Set<number>();
    const autoCreatedRows = new Set<number>();
    const usedMemberIds = new Map<number, number>();

    const unclaimedOpenings = await tx
      .select({ id: openingBalancesTable.id, fullName: openingBalancesTable.fullName })
      .from(openingBalancesTable)
      .where(eq(openingBalancesTable.status, "unclaimed"))
      .for("update");
    const obMatcher = new NameMatcher(unclaimedOpenings);

    for (const row of payroll.rows) {
      const { member } = matchPayrollRow(row, empNoIndex, matcher, manualMap, membersById);

      let memberId: number;
      let rowWasAutoCreated = false;
      if (!member) {
        // Auto-create a pending member (with the permanent employee no.) so
        // deductions are never silently lost.
        rowWasAutoCreated = true;
        autoCreatedRows.add(row.rowNumber);
        const placeholderEmail = `unmatched-${randomUUID()}@placeholder.aacsms.internal`;
        const [newMember] = await tx
          .insert(membersTable)
          .values({
            fullName: row.rawName,
            email: placeholderEmail,
            organization: uploadOrg,
            employeeNo: row.employeeNo,
            status: "pending",
          })
          .returning({ id: membersTable.id });
        autoCreated++;
        memberId = newMember.id;
      } else {
        memberId = member.id;
        const prevRow = usedMemberIds.get(memberId);
        if (prevRow !== undefined) {
          skipped++;
          errors.push(
            `Row ${row.rowNumber} ("${row.rawName}") matches the same member as row ${prevRow} — skipped; post it manually.`,
          );
          continue;
        }
      }
      usedMemberIds.set(memberId, row.rowNumber);
      memberMatchedRows.add(row.rowNumber);

      // Lock the member row and read CURRENT balances — the loans-first split
      // must be computed against up-to-date debts inside the transaction.
      const lockedRows = await tx.execute<Record<string, unknown>>(
        sql`SELECT id, organization, employee_no AS "employeeNo",
               real_loan_balance AS "realLoanBalance",
               emergency_loan_balance AS "emergencyLoanBalance",
               electronics_debt AS "electronicsDebt",
               s_electronics_debt AS "sElectronicsDebt",
               furniture_debt AS "furnitureDebt",
               commodity_debt AS "commodityDebt",
               ghl_form_debt AS "ghlFormDebt",
               fuel_venture_balance AS "fuelVentureBalance",
               land_loan_balance AS "landLoanBalance"
             FROM ${membersTable} WHERE id = ${memberId} FOR UPDATE`,
      );
      if (!lockedRows.rows || lockedRows.rows.length === 0) {
        skipped++;
        continue;
      }
      const locked = lockedRows.rows[0] as Record<string, unknown>;

      const memberUpdates: Record<string, unknown> = {};
      if (autoTag && locked.organization !== uploadOrg) {
        memberUpdates.organization = uploadOrg;
      }
      // Adopt the payroll employee number as the member's permanent ID when missing.
      if (!locked.employeeNo) {
        memberUpdates.employeeNo = row.employeeNo;
      }
      if (Object.keys(memberUpdates).length > 0) {
        await tx.update(membersTable).set(memberUpdates).where(eq(membersTable.id, memberId));
      }

      // Split rule: loans/debts repaid first (DEBT_ORDER), remainder to savings.
      const split = computeDeductionSplit(debtBalancesOf(locked), row.amount);

      const rowTouched = await applyDeductionAmounts(tx, memberId, split, {
        month: body.month,
        year: body.year,
        uploadRecordId: uploadRecord.id,
      });

      if (rowTouched) {
        if (!rowWasAutoCreated) {
          notifications.push({ memberId, total: row.amount });
          processed++;
        }
      } else if (!rowWasAutoCreated) {
        skipped++;
      }
    }

    // ── Opening-balance reconcile pass (same semantics as classic format) ──
    let openingFlagged = 0;
    const stillUnclaimedIds = new Set(unclaimedOpenings.map((r) => r.id));
    if (stillUnclaimedIds.size > 0) {
      for (const row of payroll.rows) {
        if (!memberMatchedRows.has(row.rowNumber)) continue;
        if (autoCreatedRows.has(row.rowNumber)) continue;
        const obMatch = obMatcher.match(row.rawName);
        if (obMatch.memberId == null) continue;
        if (!stillUnclaimedIds.has(obMatch.memberId)) continue;
        await tx
          .update(openingBalancesTable)
          .set({
            status: "needs_reconcile",
            reconcileNote: `Monthly deduction for ${body.month} ${body.year} also matched a registered member ("${row.rawName}"). Applied to the member; this row was left untouched for review.`,
          })
          .where(eq(openingBalancesTable.id, obMatch.memberId));
        openingFlagged++;
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

    return { uploadRecord, processed, skipped, autoCreated, errors, notifications, openingFlagged };
  });

  if ("__duplicate" in result && result.__duplicate) {
    res.status(409).json({
      error: `An upload for ${body.month} ${body.year} has already been processed (record #${result.existingUploadId}). Void it first if you need to re-run.`,
      existingUploadId: result.existingUploadId,
    });
    return;
  }

  const { uploadRecord, processed, skipped, autoCreated, errors, notifications, openingFlagged } =
    result;

  // Notifications are sent post-commit so that a rollback never leaves
  // members notified about transactions that did not actually persist.
  for (const n of notifications) {
    await sendNotification({
      memberId: n.memberId,
      type: "transaction",
      title: `Monthly Deduction Recorded - ${body.month} ${body.year}`,
      message: `Your monthly deduction of ₦${n.total.toLocaleString()} has been processed (loans and debts first, remainder to savings).`,
    });
  }

  await logAudit({
    actorId: req.memberId,
    action: "PROCESS_EXCEL_UPLOAD",
    entity: "upload_record",
    entityId: uploadRecord.id,
    details: `Payroll sheet "${sheetName}" for ${body.month} ${body.year}: ${processed} processed, ${autoCreated} auto-created, ${skipped} skipped, ${openingFlagged} OB rows flagged for review`,
  });

  res.json({
    uploadRecordId: uploadRecord.id,
    processed,
    skipped,
    autoCreated,
    errors,
    openingBalancesFlagged: openingFlagged,
  });
}

export default router;
