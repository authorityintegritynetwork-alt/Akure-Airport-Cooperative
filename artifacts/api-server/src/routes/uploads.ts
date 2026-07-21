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
  type RosterMember,
} from "@workspace/db";
import { eq, and, asc, sql, inArray } from "drizzle-orm";
import { requireAuth, requireAdmin, requireTreasurer, requireReverification, AuthRequest } from "../middlewares/auth";
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
  readLocalWorkbook,
  parseSheet,
  ParsedRow,
  summarizeSheets,
  parsePayrollSheet,
  PayrollParsedSheet,
  PayrollParsedRow,
  canonicalEmployeeNo,
  computeDeductionSplit,
} from "../lib/excelParser";
import { parsePdfRoster, summarizePdfRoster } from "../lib/pdfParser";
import {
  detectSimpleRosterFormat,
  parseSimpleRosterSheet,
  summarizeSimpleRosterSheet,
} from "../lib/simpleRosterParser";

function isPdfPath(p: string): boolean {
  return p.toLowerCase().endsWith(".pdf");
}
import { NameMatcher, MatchResult } from "../lib/nameMatcher";
import { z } from "zod/v4";

const router: IRouter = Router();

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// ── Reversal helpers ─────────────────────────────────────────────────────────

/** Maps transaction.type → { member balance field, original direction }. */
const TX_REVERSAL: Record<string, { field: string; direction: "credit" | "debit" }> = {
  shares:                   { field: "sharesBalance",        direction: "credit" },
  savings:                  { field: "savingsBalance",        direction: "credit" },
  provident:                { field: "providentBalance",      direction: "debit"  },
  provident_loan_repayment: { field: "providentBalance",      direction: "debit"  },
  christmas:                { field: "christmasBalance",      direction: "credit" },
  real_loan_repayment:      { field: "realLoanBalance",       direction: "debit"  },
  loan_repayment:           { field: "realLoanBalance",       direction: "debit"  },
  emergency_loan_repayment: { field: "emergencyLoanBalance",  direction: "debit"  },
  electronics_repayment:    { field: "electronicsDebt",       direction: "debit"  },
  s_electronics_repayment:  { field: "sElectronicsDebt",      direction: "debit"  },
  furniture_repayment:      { field: "furnitureDebt",         direction: "debit"  },
  commodity_repayment:      { field: "commodityDebt",         direction: "debit"  },
  ghl_form_repayment:       { field: "ghlFormDebt",           direction: "debit"  },
  fire:                     { field: "fireFundBalance",        direction: "credit" },
  fuel_venture_repayment:   { field: "fuelVentureBalance",    direction: "debit"  },
  land_loan_repayment:      { field: "landLoanBalance",       direction: "debit"  },
};

/**
 * Reverse the balance effects of a set of upload records and delete them.
 * Called before re-processing the same period so re-uploads replace rather
 * than stack on top of the previous data.
 */
async function reverseAndDeleteUploadRecords(tx: Tx, uploadIds: number[]): Promise<void> {
  if (uploadIds.length === 0) return;

  const txns = await tx
    .select({
      memberId: transactionsTable.memberId,
      type:     transactionsTable.type,
      amount:   transactionsTable.amount,
    })
    .from(transactionsTable)
    .where(inArray(transactionsTable.uploadRecordId, uploadIds));

  // Accumulate per-member field deltas (reversed sign vs. original).
  const memberDeltas = new Map<number, Map<string, number>>();
  for (const t of txns) {
    const info = TX_REVERSAL[t.type];
    if (!info) continue;
    const amt = parseFloat(String(t.amount));
    if (!amt || isNaN(amt)) continue;
    // To reverse: credits subtract, debits add back.
    const delta = info.direction === "credit" ? -amt : +amt;
    if (!memberDeltas.has(t.memberId)) memberDeltas.set(t.memberId, new Map());
    const fields = memberDeltas.get(t.memberId)!;
    fields.set(info.field, (fields.get(info.field) ?? 0) + delta);
  }

  // Apply reversed deltas and recompute aggregates.
  for (const [memberId, fields] of memberDeltas) {
    const setClauses: Record<string, ReturnType<typeof sql>> = {};
    for (const [field, delta] of fields) {
      const col = (membersTable as any)[field];
      if (!col) continue;
      setClauses[field] =
        delta >= 0
          ? sql`${col} + ${delta.toString()}::numeric`
          : sql`GREATEST(0, ${col} + ${delta.toString()}::numeric)`;
    }
    if (Object.keys(setClauses).length === 0) continue;

    const exprFor = (f: string, col: any): ReturnType<typeof sql> =>
      (setClauses[f] as any) ?? sql`${col}`;

    setClauses.totalLoanBalance = sql`
      ${exprFor("realLoanBalance",      membersTable.realLoanBalance     as any)} +
      ${exprFor("emergencyLoanBalance", membersTable.emergencyLoanBalance as any)} +
      ${exprFor("providentBalance",     membersTable.providentBalance     as any)} +
      ${exprFor("fuelVentureBalance",   membersTable.fuelVentureBalance   as any)} +
      ${exprFor("landLoanBalance",      membersTable.landLoanBalance      as any)}
    `;
    setClauses.totalStoreDebt = sql`
      ${exprFor("electronicsDebt",  membersTable.electronicsDebt  as any)} +
      ${exprFor("sElectronicsDebt", membersTable.sElectronicsDebt as any)} +
      ${exprFor("furnitureDebt",    membersTable.furnitureDebt    as any)} +
      ${exprFor("commodityDebt",    membersTable.commodityDebt    as any)} +
      ${exprFor("ghlFormDebt",      membersTable.ghlFormDebt      as any)}
    `;

    await tx
      .update(membersTable)
      .set(setClauses as any)
      .where(eq(membersTable.id, memberId));
  }

  // Delete transactions first (FK), then the records.
  await tx.delete(transactionsTable).where(inArray(transactionsTable.uploadRecordId, uploadIds));
  await tx.delete(uploadRecordsTable).where(inArray(uploadRecordsTable.id, uploadIds));
}

/** Compute all 16 balance values from a parsed row's amounts map. */
function computeObValues(row: { amounts: Record<string, number> }) {
  const sharesBalance        = row.amounts.shares        ?? 0;
  const savingsBalance       = row.amounts.savings       ?? 0;
  const providentBalance     = row.amounts.provident     ?? 0;
  const christmasBalance     = row.amounts.christmas     ?? 0;
  const realLoanBalance      = row.amounts.realLoan      ?? 0;
  const emergencyLoanBalance = row.amounts.emergencyLoan ?? 0;
  const fuelVentureBalance   = row.amounts.fuelVenture   ?? 0;
  const landLoanBalance      = row.amounts.landLoan      ?? 0;
  const totalLoanBalance     =
    realLoanBalance + emergencyLoanBalance + providentBalance + fuelVentureBalance + landLoanBalance;
  const electronicsDebt  = row.amounts.electronics  ?? 0;
  const sElectronicsDebt = row.amounts.sElectronics ?? 0;
  const furnitureDebt    = row.amounts.furniture    ?? 0;
  const commodityDebt    = row.amounts.commodity    ?? 0;
  const ghlFormDebt      = row.amounts.ghlForm      ?? 0;
  const totalStoreDebt   = electronicsDebt + sElectronicsDebt + furnitureDebt + commodityDebt + ghlFormDebt;
  const fireFundBalance  = row.amounts.fire         ?? 0;
  return {
    sharesBalance, savingsBalance, providentBalance, christmasBalance,
    realLoanBalance, emergencyLoanBalance, fuelVentureBalance, landLoanBalance,
    totalLoanBalance, electronicsDebt, sElectronicsDebt, furnitureDebt,
    commodityDebt, ghlFormDebt, totalStoreDebt, fireFundBalance,
  };
}

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


function applyManualMatches(
  row: ParsedRow,
  matchResult: MatchResult,
  manualMap: Map<number, number>,
  membersById: Map<number, { id: number; fullName: string }>,
  rejectedRows: Set<number> = new Set(),
): MatchResult {
  const manual = manualMap.get(row.rowNumber);
  if (manual !== undefined) {
    const m = membersById.get(manual);
    if (m) {
      return { memberId: m.id, memberName: m.fullName, confidence: "manual" };
    }
  }
  // Admin rejected the automatic name match → treat as unmatched so the row
  // auto-creates a pending member instead of posting to the wrong person.
  // Only fuzzy matches can be rejected — exact matches are authoritative, so
  // stale or crafted payloads can never demote them.
  if (rejectedRows.has(row.rowNumber) && matchResult.confidence === "fuzzy") {
    return { memberId: null, memberName: null, confidence: "none" };
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
  rejectedRows: Set<number> = new Set(),
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
    // Rejection only suppresses a FUZZY name match — employee-number and
    // exact name matches are authoritative and cannot be rejected.
    if (rejectedRows.has(row.rowNumber) && byName.confidence === "fuzzy") {
      return { member: null, confidence: "none" };
    }
    const m = membersById.get(byName.memberId);
    if (m) return { member: m, confidence: byName.confidence as PayrollConfidence };
  }
  return { member: null, confidence: "none" };
}

interface SheetMemberRef {
  id: number;
  fullName: string;
  organization: string;
  employeeNo: string | null;
}

/**
 * Priority: manual override → employee number (org-scoped, exact) → name
 * match (org-filtered, fuzzy).  Mirrors matchPayrollRow but operates on a
 * ParsedRow from the multi-column cooperative-archive format.
 */
function matchSheetRow(
  row: import("../lib/excelParser").ParsedRow,
  empNoIndex: Map<string, SheetMemberRef>,
  matcher: NameMatcher,
  manualMap: Map<number, number>,
  membersById: Map<number, SheetMemberRef>,
  rejectedSet: Set<number> = new Set(),
): { memberId: number | null; memberName: string | null; confidence: string } {
  // 1. Manual override — admin explicitly mapped this row to a member.
  const manual = manualMap.get(row.rowNumber);
  if (manual !== undefined) {
    const m = membersById.get(manual);
    if (m) return { memberId: m.id, memberName: m.fullName, confidence: "manual" };
  }
  // 2. Employee number (exact, org-scoped) — most reliable; skips name fuzzing.
  if (row.employeeNo) {
    const byNo = empNoIndex.get(canonicalEmployeeNo(row.employeeNo));
    if (byNo) return { memberId: byNo.id, memberName: byNo.fullName, confidence: "employeeNo" };
  }
  // 3. Name match (org-filtered matcher — cross-org false positives are impossible).
  const byName = matcher.match(row.rawName);
  if (byName.memberId != null) {
    if (rejectedSet.has(row.rowNumber) && byName.confidence === "fuzzy") {
      return { memberId: null, memberName: null, confidence: "none" };
    }
    return { memberId: byName.memberId, memberName: byName.memberName, confidence: byName.confidence };
  }
  return { memberId: null, memberName: null, confidence: "none" };
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
    // Recompute aggregates using the SAME expressions already set for each
    // component column. In a single PostgreSQL UPDATE statement every RHS
    // expression reads the ORIGINAL row values, so referencing a column name
    // directly (e.g. `realLoanBalance + emergencyLoanBalance`) would produce
    // the pre-repayment total. By substituting the already-built GREATEST()
    // expressions we get the correct post-update sum within the same statement.
    // If a field wasn't touched this round its SET clause entry is absent and we
    // fall back to the raw column reference (value is unchanged).
    const exprFor = (field: string, col: ReturnType<typeof sql>) =>
      (setClauses[field] as ReturnType<typeof sql> | undefined) ?? sql`${col}`;

    // Include ALL loan repayment columns in the aggregate (provident, fuelVenture,
    // landLoan were previously omitted — fixed here).
    setClauses.totalLoanBalance = sql`
      ${exprFor("realLoanBalance",     membersTable.realLoanBalance     as any)} +
      ${exprFor("emergencyLoanBalance",membersTable.emergencyLoanBalance as any)} +
      ${exprFor("providentBalance",    membersTable.providentBalance    as any)} +
      ${exprFor("fuelVentureBalance",  membersTable.fuelVentureBalance  as any)} +
      ${exprFor("landLoanBalance",     membersTable.landLoanBalance     as any)}
    `;
    // furnitureDebt is included in the store-debt total (fixes latent omission).
    setClauses.totalStoreDebt = sql`${exprFor("electronicsDebt", membersTable.electronicsDebt as any)} + ${exprFor("sElectronicsDebt", membersTable.sElectronicsDebt as any)} + ${exprFor("furnitureDebt", membersTable.furnitureDebt as any)} + ${exprFor("commodityDebt", membersTable.commodityDebt as any)} + ${exprFor("ghlFormDebt", membersTable.ghlFormDebt as any)}`;

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
      if (isPdfPath(parsed.data.fileObjectPath)) {
        const sheets = await summarizePdfRoster(parsed.data.fileObjectPath);
        res.json({ sheets });
        return;
      }
      const wb = await downloadWorkbook(parsed.data.fileObjectPath);
      // ── Simple roster detection (CTAKU / Pension) ────────────────────────
      const firstSheet = wb.SheetNames[0];
      const simpleFormat = firstSheet ? detectSimpleRosterFormat(wb, firstSheet) : null;
      if (simpleFormat) {
        res.json({ sheets: summarizeSimpleRosterSheet(wb, firstSheet, simpleFormat) });
        return;
      }
      res.json({ sheets: summarizeSheets(wb) });
    } catch (err: any) {
      res.status(400).json({ error: `Failed to read file: ${err.message}` });
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
      // ── PDF roster preview ────────────────────────────────────────────────
      if (isPdfPath(parsed.data.fileObjectPath)) {
        const pdfPayroll = await parsePdfRoster(parsed.data.fileObjectPath);
        await previewPayroll(res, parsed.data, orgRecord.code, pdfPayroll);
        return;
      }

      const wb = await downloadWorkbook(parsed.data.fileObjectPath);
      const sheetName = parsed.data.sheetName || wb.SheetNames[0];
      if (!wb.SheetNames.includes(sheetName)) {
        res.status(400).json({ error: `Sheet "${sheetName}" not found in workbook` });
        return;
      }

      // ── Simple roster preview (CTAKU / Pension) ───────────────────────────
      const simpleFormatPreview = detectSimpleRosterFormat(wb, sheetName);
      if (simpleFormatPreview) {
        const simplePayroll = parseSimpleRosterSheet(wb, sheetName, simpleFormatPreview);
        await previewPayroll(res, parsed.data, orgRecord.code, simplePayroll);
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

      // Load all members with org + employee number so we can build an
      // org-filtered name matcher and an employee-number index.
      const allMembers = await db
        .select({
          id: membersTable.id,
          fullName: membersTable.fullName,
          organization: membersTable.organization,
          employeeNo: membersTable.employeeNo,
        })
        .from(membersTable);
      const membersById = new Map(allMembers.map((m) => [m.id, m]));

      const uploadOrg = orgRecord.code;

      // Org-filtered name matcher — only matches members of the same org.
      // This eliminates cross-org false positives at the source.
      const orgMembers = allMembers.filter((m) => m.organization === uploadOrg);
      const matcher = new NameMatcher(orgMembers);
      // Employee-number index: org-scoped exact matching (takes precedence over names).
      const empNoIndex = buildEmpNoIndex(allMembers, uploadOrg) as Map<string, SheetMemberRef>;

      const manualMap = new Map<number, number>();
      for (const m of parsed.data.manualMatches || []) {
        manualMap.set(m.rowNumber, m.memberId);
      }
      const rejectedSet = new Set<number>(parsed.data.rejectedRows || []);

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

      // Load active-member roster when this preview is linked to a payroll summary.
      let rosterMemberIds: Set<number> | null = null;
      if (parsed.data.linkedPayrollUploadId != null) {
        const [rosterRecord] = await db
          .select({ rosterData: uploadRecordsTable.rosterData })
          .from(uploadRecordsTable)
          .where(
            and(
              eq(uploadRecordsTable.id, parsed.data.linkedPayrollUploadId),
              eq(uploadRecordsTable.uploadType, "payroll_summary"),
              eq(uploadRecordsTable.status, "processed"),
            ),
          );
        if (rosterRecord?.rosterData) {
          const rd = rosterRecord.rosterData as { members: RosterMember[] };
          rosterMemberIds = new Set(rd.members.map((m) => m.memberId));
        }
      }

      // Detect duplicate names within the sheet before building preview rows.
      const rawNameCounts = new Map<string, number>();
      for (const row of sheet.rows) {
        const key = row.rawName.toUpperCase();
        rawNameCounts.set(key, (rawNameCounts.get(key) ?? 0) + 1);
      }

      const previewRows = sheet.rows.map((row) => {
        const finalMatch = matchSheetRow(
          row, empNoIndex, matcher, manualMap, membersById as Map<number, SheetMemberRef>, rejectedSet,
        );
        const member =
          finalMatch.memberId != null ? membersById.get(finalMatch.memberId) : null;
        const memberOrg = member?.organization ?? null;
        // Org mismatch can only happen via a manual override now — the name
        // matcher is already org-filtered. Warn but don't error.
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
        const hasOpeningBalance =
          finalMatch.memberId == null
            ? obPreviewMatcher.match(row.rawName).memberId != null
            : null;

        // Roster gate: active = in roster, inactive = matched but absent from roster.
        let rosterStatus: "active" | "inactive" | null = null;
        if (rosterMemberIds != null && finalMatch.memberId != null) {
          rosterStatus = rosterMemberIds.has(finalMatch.memberId) ? "active" : "inactive";
        }

        return {
          rowNumber: row.rowNumber,
          rawName: row.rawName,
          employeeNo: row.employeeNo ?? null,
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
          rosterStatus,
          suggestions:
            finalMatch.confidence === "fuzzy" || finalMatch.confidence === "none"
              ? matcher.suggest(row.rawName, 5)
              : undefined,
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
        rosterGated: rosterMemberIds != null,
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
      // ── PDF roster processing ─────────────────────────────────────────────
      if (isPdfPath(parsed.data.fileObjectPath)) {
        const pdfPayroll = await parsePdfRoster(parsed.data.fileObjectPath);
        const processUploadType = (parsed.data.uploadType ?? "payroll_summary") as
          "standalone" | "payroll_summary" | "category_breakdown";
        await processPayroll(req, res, parsed.data, orgRecord.code, pdfPayroll, "PDF Payroll", processUploadType);
        return;
      }

      const wb = await downloadWorkbook(parsed.data.fileObjectPath);
      const sheetName = parsed.data.sheetName || wb.SheetNames[0];
      if (!wb.SheetNames.includes(sheetName)) {
        res.status(400).json({ error: `Sheet "${sheetName}" not found in workbook` });
        return;
      }

      // ── Simple roster processing (CTAKU / Pension) ────────────────────────
      const simpleFormatProcess = detectSimpleRosterFormat(wb, sheetName);
      if (simpleFormatProcess) {
        const simplePayroll = parseSimpleRosterSheet(wb, sheetName, simpleFormatProcess);
        const processUploadType = (parsed.data.uploadType ?? "payroll_summary") as
          "standalone" | "payroll_summary" | "category_breakdown";
        await processPayroll(req, res, parsed.data, orgRecord.code, simplePayroll, simplePayroll.sheetName, processUploadType);
        return;
      }

      // Payroll single-amount format takes precedence when detected.
      const payroll = parsePayrollSheet(wb, sheetName);
      if (payroll) {
        const processUploadType = (parsed.data.uploadType ?? "standalone") as
          "standalone" | "payroll_summary" | "category_breakdown";
        await processPayroll(req, res, parsed.data, orgRecord.code, payroll, sheetName, processUploadType);
        return;
      }

      const sheet = parseSheet(wb, sheetName);

      // ── Member loading with org + employee number ─────────────────────────
      const allMembersForProcess = await db
        .select({
          id: membersTable.id,
          fullName: membersTable.fullName,
          organization: membersTable.organization,
          employeeNo: membersTable.employeeNo,
        })
        .from(membersTable);
      const membersByIdForProcess = new Map(allMembersForProcess.map((m) => [m.id, m]));

      const uploadOrg = orgRecord.code;
      const autoTag = parsed.data.autoTagOrganization !== false;
      const uploadType = parsed.data.uploadType ?? "standalone";
      const linkedPayrollUploadId = parsed.data.linkedPayrollUploadId ?? null;

      // Org-filtered matcher + emp-no index (prevents cross-org false positives).
      const orgMembersForProcess = allMembersForProcess.filter((m) => m.organization === uploadOrg);
      const matcherForProcess = new NameMatcher(orgMembersForProcess);
      const empNoIndexForProcess = buildEmpNoIndex(
        allMembersForProcess, uploadOrg,
      ) as Map<string, SheetMemberRef>;

      const manualMap = new Map<number, number>();
      for (const m of parsed.data.manualMatches || []) {
        manualMap.set(m.rowNumber, m.memberId);
      }
      const rejectedSet = new Set<number>(parsed.data.rejectedRows || []);

      // ── Validate category_breakdown prerequisites ─────────────────────────
      if (uploadType === "category_breakdown" && linkedPayrollUploadId == null) {
        res.status(422).json({
          error: "category_breakdown upload requires linkedPayrollUploadId pointing to a processed payroll_summary upload.",
        });
        return;
      }

      // Load the active-member roster when this is a roster-gated breakdown.
      let rosterMemberIdsForProcess: Set<number> | null = null;
      if (uploadType === "category_breakdown" && linkedPayrollUploadId != null) {
        const [rosterRec] = await db
          .select({ rosterData: uploadRecordsTable.rosterData, organization: uploadRecordsTable.organization })
          .from(uploadRecordsTable)
          .where(
            and(
              eq(uploadRecordsTable.id, linkedPayrollUploadId),
              eq(uploadRecordsTable.uploadType, "payroll_summary"),
              eq(uploadRecordsTable.status, "processed"),
            ),
          );
        if (!rosterRec) {
          res.status(404).json({
            error: `Payroll summary upload #${linkedPayrollUploadId} not found or not yet processed.`,
          });
          return;
        }
        if (rosterRec.organization !== uploadOrg) {
          res.status(422).json({
            error: `Payroll summary upload #${linkedPayrollUploadId} is for org "${rosterRec.organization}" but this upload is for "${uploadOrg}".`,
          });
          return;
        }
        const rd = rosterRec.rosterData as { members: RosterMember[] } | null;
        rosterMemberIdsForProcess = new Set((rd?.members ?? []).map((m) => m.memberId));
      }

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

      // Duplicate-check key differs by uploadType so that a payroll_summary
      // and category_breakdown for the same period are both allowed.
      const periodKey = `${parsed.data.month.toLowerCase()}-${parsed.data.year}-${uploadOrg}-${uploadType}`;
      const result = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${periodKey}))`);

        // Replace existing upload for this period rather than blocking with 409.
        // category_breakdown: reverse any prior breakdown linked to this roster or period.
        // standalone: reverse any prior standalone upload for this period/org.
        if (uploadType === "category_breakdown") {
          const conditions = linkedPayrollUploadId != null
            ? and(
                eq(uploadRecordsTable.linkedUploadId, linkedPayrollUploadId),
                eq(uploadRecordsTable.uploadType, "category_breakdown"),
                eq(uploadRecordsTable.status, "processed"),
              )
            : and(
                eq(uploadRecordsTable.month, parsed.data.month),
                eq(uploadRecordsTable.year, parsed.data.year),
                eq(uploadRecordsTable.organization, uploadOrg),
                eq(uploadRecordsTable.uploadType, "category_breakdown"),
                eq(uploadRecordsTable.status, "processed"),
              );
          const existing = await tx
            .select({ id: uploadRecordsTable.id })
            .from(uploadRecordsTable)
            .where(conditions!);
          if (existing.length > 0) {
            await reverseAndDeleteUploadRecords(tx, existing.map((r) => r.id));
          }
        } else if (uploadType === "standalone") {
          const dupInTx = await tx
            .select({ id: uploadRecordsTable.id })
            .from(uploadRecordsTable)
            .where(
              and(
                eq(uploadRecordsTable.month, parsed.data.month),
                eq(uploadRecordsTable.year, parsed.data.year),
                eq(uploadRecordsTable.organization, uploadOrg),
                eq(uploadRecordsTable.status, "processed"),
                eq(uploadRecordsTable.uploadType, "standalone"),
              ),
            );
          if (dupInTx.length > 0) {
            await reverseAndDeleteUploadRecords(tx, dupInTx.map((r) => r.id));
          }
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
            uploadType,
            linkedUploadId: linkedPayrollUploadId,
          })
          .returning();

        let processed = 0;
        let skipped = 0;
        let rosterSkipped = 0;
        let autoCreated = 0;
        const errors: string[] = [];
        const notifications: Array<{ memberId: number; total: number }> = [];
        const memberMatchedRows = new Set<number>();
        const autoCreatedRows = new Set<number>();

        const unclaimedOpenings = await tx
          .select({ id: openingBalancesTable.id, fullName: openingBalancesTable.fullName })
          .from(openingBalancesTable)
          .where(eq(openingBalancesTable.status, "unclaimed"))
          .for("update");
        const obMatcher = new NameMatcher(unclaimedOpenings);

        for (const row of sheet.rows) {
          const finalMatch = matchSheetRow(
            row,
            empNoIndexForProcess,
            matcherForProcess,
            manualMap,
            membersByIdForProcess as Map<number, SheetMemberRef>,
            rejectedSet,
          );

          // Roster gate: skip matched members who are not in the active payroll.
          if (
            rosterMemberIdsForProcess != null &&
            finalMatch.memberId != null &&
            !rosterMemberIdsForProcess.has(finalMatch.memberId)
          ) {
            rosterSkipped++;
            continue;
          }

          let rowWasAutoCreated = false;
          if (finalMatch.memberId == null) {
            rowWasAutoCreated = true;
            autoCreatedRows.add(row.rowNumber);
            const placeholderEmail = `unmatched-${randomUUID()}@placeholder.aacsms.internal`;
            const [newMember] = await tx
              .insert(membersTable)
              .values({
                fullName: row.rawName,
                email: placeholderEmail,
                organization: uploadOrg,
                employeeNo: row.employeeNo ?? undefined,
                status: "pending",
              })
              .returning({ id: membersTable.id });
            autoCreated++;
            (finalMatch as { memberId: number | null }).memberId = newMember.id;
          }

          const memberId = finalMatch.memberId!;
          memberMatchedRows.add(row.rowNumber);

          // Lock member row; read employee_no to write it back if missing.
          const lockedRows = await tx.execute<{ id: number; organization: string; employee_no: string | null }>(
            sql`SELECT id, organization, employee_no FROM ${membersTable} WHERE id = ${memberId} FOR UPDATE`,
          );
          if (!lockedRows.rows || lockedRows.rows.length === 0) { skipped++; continue; }
          const locked = lockedRows.rows[0] as { organization: string; employee_no: string | null };

          // Auto-tag org and write permanent employee number when needed.
          const memberFieldUpdates: { organization?: string; employeeNo?: string } = {};
          if (autoTag && locked.organization !== uploadOrg) {
            memberFieldUpdates.organization = uploadOrg;
          }
          if (!locked.employee_no && row.employeeNo) {
            memberFieldUpdates.employeeNo = row.employeeNo;
          }
          if (Object.keys(memberFieldUpdates).length > 0) {
            await tx.update(membersTable).set(memberFieldUpdates).where(eq(membersTable.id, memberId));
          }

          const rowTouched = await applyDeductionAmounts(tx, memberId, row.amounts, {
            month: parsed.data.month,
            year: parsed.data.year,
            uploadRecordId: uploadRecord.id,
          });

          if (rowTouched) {
            if (!rowWasAutoCreated) {
              notifications.push({ memberId, total: row.computedTotal });
              processed++;
            }
          } else {
            if (!rowWasAutoCreated) skipped++;
          }
        }

        // ── Opening-balance reconcile pass ────────────────────────────────
        let openingFlagged = 0;
        const stillUnclaimedIds = new Set(unclaimedOpenings.map((r) => r.id));
        if (stillUnclaimedIds.size > 0) {
          for (const row of sheet.rows) {
            if (!memberMatchedRows.has(row.rowNumber)) continue;
            if (autoCreatedRows.has(row.rowNumber)) continue;
            const obMatch = obMatcher.match(row.rawName);
            if (obMatch.memberId == null) continue;
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
          .set({ rowsProcessed: processed, rowsSkipped: skipped, status: "processed" })
          .where(eq(uploadRecordsTable.id, uploadRecord.id));

        return { uploadRecord, processed, skipped, rosterSkipped, autoCreated, errors, notifications, openingFlagged };
      });

      const { uploadRecord, processed, skipped, rosterSkipped, autoCreated, errors, notifications, openingFlagged } = result;

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
        details: `Sheet "${sheetName}" for ${parsed.data.month} ${parsed.data.year} [${uploadType}]: ${processed} processed, ${autoCreated} auto-created, ${skipped} skipped, ${rosterSkipped} roster-skipped, ${openingFlagged} OB rows flagged`,
      });

      res.json({
        uploadRecordId: uploadRecord.id,
        processed,
        skipped,
        rosterSkipped,
        autoCreated,
        errors,
        uploadType,
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

// ── List available payroll-summary rosters ───────────────────────────────────
router.get(
  "/uploads/payroll-rosters",
  requireAuth,
  requireAdmin,
  async (req: AuthRequest, res): Promise<void> => {
    const { month, year, organization } = req.query as Record<string, string | undefined>;

    const conditions = [
      eq(uploadRecordsTable.uploadType, "payroll_summary"),
      eq(uploadRecordsTable.status, "processed"),
    ];
    if (month) conditions.push(eq(uploadRecordsTable.month, month));
    if (year && !isNaN(parseInt(year))) conditions.push(eq(uploadRecordsTable.year, parseInt(year)));
    if (organization) conditions.push(eq(uploadRecordsTable.organization, organization.toUpperCase()));

    const records = await db
      .select({
        id: uploadRecordsTable.id,
        month: uploadRecordsTable.month,
        year: uploadRecordsTable.year,
        organization: uploadRecordsTable.organization,
        rosterData: uploadRecordsTable.rosterData,
        createdAt: uploadRecordsTable.createdAt,
      })
      .from(uploadRecordsTable)
      .where(and(...conditions))
      .orderBy(asc(uploadRecordsTable.createdAt));

    res.json({
      rosters: records.map((r) => ({
        id: r.id,
        month: r.month,
        year: r.year,
        organization: r.organization,
        rosterSize: ((r.rosterData as { members: RosterMember[] } | null)?.members?.length) ?? 0,
        createdAt: r.createdAt,
      })),
    });
  },
);

// ── Payroll single-amount format: preview ────────────────────────────────────
async function previewPayroll(
  res: import("express").Response,
  body: {
    month: string;
    year: number;
    manualMatches?: Array<{ rowNumber: number; memberId: number }> | null;
    rejectedRows?: number[] | null;
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
  const rejectedSet = new Set<number>(body.rejectedRows || []);

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
      rejectedSet,
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
      suggestions:
        confidence === "fuzzy" || confidence === "none"
          ? matcher.suggest(row.rawName, 5)
          : undefined,
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
    rejectedRows?: number[] | null;
    autoTagOrganization?: boolean | null;
  },
  uploadOrg: string,
  payroll: PayrollParsedSheet,
  sheetName: string,
  uploadType: "standalone" | "payroll_summary" | "category_breakdown" = "standalone",
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
  const rejectedSet = new Set<number>(body.rejectedRows || []);

  // Duplicate-check key is scoped by uploadType so payroll_summary and
  // standalone can coexist for the same period without blocking each other.
  const periodKey = `${body.month.toLowerCase()}-${body.year}-${uploadOrg}-${uploadType}`;
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
          eq(uploadRecordsTable.uploadType, uploadType),
        ),
      );
    if (dupInTx.length > 0) {
      await reverseAndDeleteUploadRecords(tx, dupInTx.map((r) => r.id));
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
        uploadType,
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
    // Payroll format already relies on emp no as primary key; name matcher
    // used only as fallback — keep it org-filtered for consistency.
    const matcher = new NameMatcher(allMembers.filter((m) => m.organization === uploadOrg));

    // ── payroll_summary mode: build roster without creating transactions ────
    if (uploadType === "payroll_summary") {
      const rosterMembers: RosterMember[] = [];
      let rosterMatched = 0;
      let rosterAutoCreated = 0;

      for (const row of payroll.rows) {
        const { member } = matchPayrollRow(row, empNoIndex, matcher, manualMap, membersById, rejectedSet);

        if (member) {
          // Persist employee number on first encounter.
          if (!member.employeeNo) {
            await tx.update(membersTable).set({ employeeNo: row.employeeNo }).where(eq(membersTable.id, member.id));
          }
          rosterMembers.push({ memberId: member.id, employeeNo: row.employeeNo, amount: row.amount });
          rosterMatched++;
        } else {
          // Auto-create a pending member so the employee exists in the DB
          // for matching when the cooperative archive is uploaded next.
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
          rosterAutoCreated++;
          rosterMembers.push({ memberId: newMember.id, employeeNo: row.employeeNo, amount: row.amount });
        }
      }

      await tx
        .update(uploadRecordsTable)
        .set({
          rowsProcessed: rosterMatched,
          rowsSkipped: 0,
          status: "processed",
          rosterData: { members: rosterMembers },
        })
        .where(eq(uploadRecordsTable.id, uploadRecord.id));

      return {
        __rosterOnly: true as const,
        uploadRecord,
        rosterMatched,
        rosterAutoCreated,
        rosterSize: rosterMembers.length,
      };
    }
    // ─────────────────────────────────────────────────────────────────────────

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
      const { member } = matchPayrollRow(row, empNoIndex, matcher, manualMap, membersById, rejectedSet);

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

      const memberUpdates: { organization?: string; employeeNo?: string } = {};
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

  // ── payroll_summary (roster-only) result ──────────────────────────────────
  if ("__rosterOnly" in result && result.__rosterOnly) {
    await logAudit({
      actorId: req.memberId,
      action: "PROCESS_EXCEL_UPLOAD",
      entity: "upload_record",
      entityId: result.uploadRecord.id,
      details: `Payroll roster "${sheetName}" for ${body.month} ${body.year} [payroll_summary]: ${result.rosterMatched} matched, ${result.rosterAutoCreated} auto-created, roster size ${result.rosterSize}`,
    });
    res.json({
      uploadRecordId: result.uploadRecord.id,
      uploadType: "payroll_summary",
      processed: result.rosterMatched,
      skipped: 0,
      rosterSize: result.rosterSize,
      autoCreated: result.rosterAutoCreated,
      errors: [],
    });
    return;
  }
  // ─────────────────────────────────────────────────────────────────────────

  const { uploadRecord, processed, skipped, autoCreated, errors, notifications, openingFlagged } =
    result;

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
    details: `Payroll sheet "${sheetName}" for ${body.month} ${body.year} [${uploadType}]: ${processed} processed, ${autoCreated} auto-created, ${skipped} skipped, ${openingFlagged} OB rows flagged`,
  });

  res.json({
    uploadRecordId: uploadRecord.id,
    processed,
    skipped,
    autoCreated,
    errors,
    uploadType,
    openingBalancesFlagged: openingFlagged,
  });
}

// ── POST /uploads/balance-snapshot/preview ───────────────────────────────────
// Parses a multi-column Excel sheet (same format as opening balances) and
// returns per-member balance values without making any DB changes.

router.post(
  "/uploads/balance-snapshot/preview",
  requireAuth,
  requireAdmin,
  async (req: AuthRequest, res): Promise<void> => {
    const schema = z.object({
      fileObjectPath: z.string(),
      sheetName:      z.string().optional(),
      organization:   z.string(),
      month:          z.string(),
      year:           z.number().int(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const { fileObjectPath, sheetName: sheetNameParam, organization, month, year } = parsed.data;

    const org = await loadOrgOrFail(organization, res);
    if (!org) return;

    try {
      const wb = await downloadWorkbook(fileObjectPath);
      const sheetName = sheetNameParam ?? wb.SheetNames[0];
      if (!wb.SheetNames.includes(sheetName)) {
        res.status(400).json({ error: `Sheet "${sheetName}" not found` }); return;
      }
      const sheet = parseSheet(wb, sheetName);

      const allMembers = await db.select({
        id: membersTable.id, fullName: membersTable.fullName,
        organization: membersTable.organization, employeeNo: membersTable.employeeNo,
      }).from(membersTable);
      const orgMembers  = allMembers.filter((m) => m.organization === org.code);
      const matcher     = new NameMatcher(orgMembers);
      const empNoIdx    = buildEmpNoIndex(allMembers, org.code) as Map<string, SheetMemberRef>;
      const membersById = new Map(allMembers.map((m) => [m.id, m]));

      // Check if a snapshot already exists for this org+period.
      const existing = await db
        .select({ id: uploadRecordsTable.id })
        .from(uploadRecordsTable)
        .where(and(
          eq(uploadRecordsTable.month, month),
          eq(uploadRecordsTable.year, year),
          eq(uploadRecordsTable.organization, org.code),
          eq(uploadRecordsTable.status, "processed"),
          eq(uploadRecordsTable.uploadType, "balance_snapshot" as any),
        ));

      const rows = sheet.rows.map((row) => {
        const match = matchSheetRow(row, empNoIdx, matcher, new Map(), membersById);
        const vals  = computeObValues(row as any);
        return {
          rowNumber:          row.rowNumber,
          rawName:            row.rawName,
          employeeNo:         row.employeeNo ?? null,
          matchedMemberId:    match.memberId  ?? null,
          matchedMemberName:  match.memberName ?? null,
          matchConfidence:    match.confidence ?? null,
          totalLoanBalance:   vals.totalLoanBalance,
          totalStoreDebt:     vals.totalStoreDebt,
          sharesBalance:      vals.sharesBalance,
          savingsBalance:     vals.savingsBalance,
          christmasBalance:   vals.christmasBalance,
          fireFundBalance:    vals.fireFundBalance,
        };
      });

      res.json({
        sheetName, month, year,
        totalRows:   rows.length,
        matchedRows: rows.filter((r) => r.matchedMemberId != null).length,
        willReplace: existing.length > 0,
        rows,
      });
    } catch (err: any) {
      res.status(400).json({ error: `Balance snapshot preview failed: ${err.message}` });
    }
  },
);

// ── POST /uploads/balance-snapshot/process ───────────────────────────────────
// Applies the multi-column sheet as a direct SET on all 16 member balance
// columns.  No transaction rows are created; the upload record is the audit
// trail. An existing snapshot for the same period is deleted first.

router.post(
  "/uploads/balance-snapshot/process",
  requireAuth,
  requireTreasurer,
  requireReverification,
  async (req: AuthRequest, res): Promise<void> => {
    const schema = z.object({
      fileObjectPath: z.string(),
      sheetName:      z.string(),
      organization:   z.string(),
      month:          z.string(),
      year:           z.number().int(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const { fileObjectPath, sheetName, organization, month, year } = parsed.data;

    const org = await loadOrgOrFail(organization, res);
    if (!org) return;

    try {
      const wb = await downloadWorkbook(fileObjectPath);
      if (!wb.SheetNames.includes(sheetName)) {
        res.status(400).json({ error: `Sheet "${sheetName}" not found` }); return;
      }
      const sheet = parseSheet(wb, sheetName);

      const allMembers = await db.select({
        id: membersTable.id, fullName: membersTable.fullName,
        organization: membersTable.organization, employeeNo: membersTable.employeeNo,
      }).from(membersTable);
      const orgMembers  = allMembers.filter((m) => m.organization === org.code);
      const matcher     = new NameMatcher(orgMembers);
      const empNoIdx    = buildEmpNoIndex(allMembers, org.code) as Map<string, SheetMemberRef>;
      const membersById = new Map(allMembers.map((m) => [m.id, m]));

      const outcome = await db.transaction(async (tx) => {
        const periodKey = `balance-snapshot-${month.toLowerCase()}-${year}-${org.code}`;
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${periodKey}))`);

        // Remove any existing snapshot for this period.
        const old = await tx
          .select({ id: uploadRecordsTable.id })
          .from(uploadRecordsTable)
          .where(and(
            eq(uploadRecordsTable.month, month),
            eq(uploadRecordsTable.year, year),
            eq(uploadRecordsTable.organization, org.code),
            eq(uploadRecordsTable.status, "processed"),
            eq(uploadRecordsTable.uploadType, "balance_snapshot" as any),
          ));
        if (old.length > 0) {
          await tx.delete(uploadRecordsTable).where(inArray(uploadRecordsTable.id, old.map((r) => r.id)));
        }

        const [uploadRecord] = await tx.insert(uploadRecordsTable).values({
          uploadedBy:     req.memberId!,
          month, year,
          organization:   org.code,
          fileObjectPath,
          status:         "pending",
          uploadType:     "balance_snapshot" as any,
        }).returning();

        let processed = 0, notFound = 0;
        for (const row of sheet.rows) {
          const match = matchSheetRow(row, empNoIdx, matcher, new Map(), membersById);
          if (match.memberId == null) { notFound++; continue; }
          const vals = computeObValues(row as any);
          await tx.update(membersTable).set({
            sharesBalance:        vals.sharesBalance.toFixed(2),
            savingsBalance:       vals.savingsBalance.toFixed(2),
            providentBalance:     vals.providentBalance.toFixed(2),
            christmasBalance:     vals.christmasBalance.toFixed(2),
            realLoanBalance:      vals.realLoanBalance.toFixed(2),
            emergencyLoanBalance: vals.emergencyLoanBalance.toFixed(2),
            totalLoanBalance:     vals.totalLoanBalance.toFixed(2),
            electronicsDebt:      vals.electronicsDebt.toFixed(2),
            sElectronicsDebt:     vals.sElectronicsDebt.toFixed(2),
            furnitureDebt:        vals.furnitureDebt.toFixed(2),
            commodityDebt:        vals.commodityDebt.toFixed(2),
            ghlFormDebt:          vals.ghlFormDebt.toFixed(2),
            totalStoreDebt:       vals.totalStoreDebt.toFixed(2),
            fireFundBalance:      vals.fireFundBalance.toFixed(2),
            fuelVentureBalance:   vals.fuelVentureBalance.toFixed(2),
            landLoanBalance:      vals.landLoanBalance.toFixed(2),
          }).where(eq(membersTable.id, match.memberId));
          processed++;
        }

        await tx.update(uploadRecordsTable)
          .set({ rowsProcessed: processed, rowsSkipped: notFound, status: "processed" })
          .where(eq(uploadRecordsTable.id, uploadRecord.id));

        return { uploadRecord, processed, notFound };
      });

      await logAudit({
        actorId: req.memberId,
        action: "PROCESS_BALANCE_SNAPSHOT",
        entity: "upload_record",
        entityId: outcome.uploadRecord.id,
        details: `Balance snapshot ${month} ${year} [${org.code}]: ${outcome.processed} members updated, ${outcome.notFound} unmatched`,
      });

      res.json({
        uploadRecordId: outcome.uploadRecord.id,
        processed:      outcome.processed,
        notFound:       outcome.notFound,
        month, year,
      });
    } catch (err: any) {
      res.status(400).json({ error: `Balance snapshot processing failed: ${err.message}` });
    }
  },
);

// ── GET /uploads/:id/column-summary ─────────────────────────────────────────
// Returns per-transaction-type totals for a single upload record, so auditors
// can see exactly how much went into each column without re-opening the file.

router.get(
  "/uploads/:id/column-summary",
  requireAuth,
  requireAdmin,
  async (req: AuthRequest, res): Promise<void> => {
    const uploadId = parseInt(String(req.params.id), 10);
    if (isNaN(uploadId)) {
      res.status(400).json({ error: "Invalid upload ID" });
      return;
    }

    const [upload] = await db
      .select({
        id: uploadRecordsTable.id,
        month: uploadRecordsTable.month,
        year: uploadRecordsTable.year,
        organization: uploadRecordsTable.organization,
        uploadType: uploadRecordsTable.uploadType,
      })
      .from(uploadRecordsTable)
      .where(eq(uploadRecordsTable.id, uploadId));

    if (!upload) {
      res.status(404).json({ error: "Upload not found" });
      return;
    }

    const rows = await db
      .select({
        type: transactionsTable.type,
        total: sql<number>`SUM(${transactionsTable.amount}::numeric)`,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(transactionsTable)
      .where(eq(transactionsTable.uploadRecordId, uploadId))
      .groupBy(transactionsTable.type)
      .orderBy(transactionsTable.type);

    res.json({
      uploadId: upload.id,
      month: upload.month,
      year: upload.year,
      organization: upload.organization,
      uploadType: upload.uploadType,
      columns: rows.map((r) => ({
        type: r.type,
        total: Number(r.total),
        count: Number(r.count),
      })),
      grandTotal: rows.reduce((s, r) => s + Number(r.total), 0),
    });
  },
);

// NOTE: A one-time batch-process script lives at scripts/batch-process.ts.
// It was used to apply Jan 2026 and Apr 2026 FAAN/NAMA deductions from
// attached_assets. Run it again if additional historical months need to be
// loaded: rebuild with the same esbuild call in scripts/, update JOBS[], then
// `node scripts/batch-process.mjs`.

export default router;
