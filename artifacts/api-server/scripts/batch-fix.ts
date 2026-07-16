/**
 * Comprehensive deduction correction script.
 *
 * PHASE 1 — Reverse wrong uploads:
 *   #5  FAAN Nov 2025 (payroll format, wrong categories)
 *   #6  FAAN Dec 2025 (payroll format, wrong categories)
 *   #7  NAMA Nov 2025 (PDF report, unverifiable source)
 *   #8  NAMA Dec 2025 (PDF report, unverifiable source)
 *   #10 FAAN Jan 2026 (only Sheet163 — missed Group-2 Sheet164)
 *
 * PHASE 2 — Reprocess reversed months from cooperative archive:
 *   FAAN Nov 2025  → Sheet 159 + Sheet 160
 *   FAAN Dec 2025  → Sheet161 + Sheet162
 *   FAAN Jan 2026  → Sheet163 + Sheet164   (clean, both groups)
 *   NAMA Nov 2025  → Sheet78
 *   NAMA Dec 2025  → Sheet79
 *
 * PHASE 3 — Process months that were never loaded:
 *   NAMA Jan 2026  → Sheet80
 *   FAAN Feb 2026  → Sheet165 + Sheet166
 *   NAMA Feb 2026  → Sheet81
 *   FAAN Mar 2026  → Sheet167 + Sheet168
 *   NAMA Mar 2026  → Sheet82
 *
 * Uploads #11 (FAAN Apr 2026) and #12 (NAMA Apr 2026) are correct — untouched.
 */

import {
  db,
  membersTable,
  transactionsTable,
  uploadRecordsTable,
  loansTable,
} from "@workspace/db";
import { eq, and, asc, desc, sql, inArray } from "drizzle-orm";
import {
  readLocalWorkbook,
  parseSheet,
  ALL_CATEGORIES,
  CATEGORY_CONFIG,
  DeductionCategory,
} from "../src/lib/excelParser";
import { NameMatcher } from "../src/lib/nameMatcher";

// ─── Type helpers ──────────────────────────────────────────────────────────────

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

interface TxTypeInfo {
  cat: DeductionCategory;
  balanceField: string;
  direction: "credit" | "debit";
  loanStatus?: "real" | "emergency";
}

// Build txType → config reverse lookup (handles legacy "provident" key too)
const TX_TYPE_TO_INFO: Record<string, TxTypeInfo> = {};
for (const [cat, cfg] of Object.entries(CATEGORY_CONFIG) as [DeductionCategory, (typeof CATEGORY_CONFIG)[DeductionCategory]][]) {
  TX_TYPE_TO_INFO[cfg.txType] = { cat, balanceField: cfg.balanceField, direction: cfg.direction, loanStatus: cfg.loanStatus };
}
// Legacy type that might exist in old rows
TX_TYPE_TO_INFO["provident"] = { cat: "provident", balanceField: "providentBalance", direction: "debit" };

// ─── Reversal ──────────────────────────────────────────────────────────────────

async function reverseUpload(uploadId: number): Promise<void> {
  console.log(`\n  Reversing upload #${uploadId}...`);

  const record = await db
    .select({ id: uploadRecordsTable.id, month: uploadRecordsTable.month, year: uploadRecordsTable.year, org: uploadRecordsTable.organization })
    .from(uploadRecordsTable)
    .where(eq(uploadRecordsTable.id, uploadId));
  if (!record.length) {
    console.log(`    Upload #${uploadId} not found — skipping`);
    return;
  }

  const txns = await db
    .select({
      id: transactionsTable.id,
      memberId: transactionsTable.memberId,
      type: transactionsTable.type,
      amount: transactionsTable.amount,
    })
    .from(transactionsTable)
    .where(eq(transactionsTable.uploadRecordId, uploadId));

  console.log(`    Found ${txns.length} transactions across ${new Set(txns.map(t => t.memberId)).size} members`);

  if (txns.length === 0) {
    await db.delete(uploadRecordsTable).where(eq(uploadRecordsTable.id, uploadId));
    console.log(`    Upload record deleted (no transactions)`);
    return;
  }

  // Group by member
  const byMember = new Map<number, typeof txns>();
  for (const t of txns) {
    if (!byMember.has(t.memberId)) byMember.set(t.memberId, []);
    byMember.get(t.memberId)!.push(t);
  }

  await db.transaction(async (tx) => {
    let membersReversed = 0;

    for (const [memberId, memberTxns] of byMember) {
      // Acquire row lock
      await tx.execute(sql`SELECT id FROM ${membersTable} WHERE id = ${memberId} FOR UPDATE`);

      const balanceDeltas: Record<string, number> = {};
      const loanRestorations: Partial<Record<"real" | "emergency", number>> = {};

      for (const t of memberTxns) {
        const amt = parseFloat(String(t.amount));
        const info = TX_TYPE_TO_INFO[t.type];
        if (!info) {
          console.log(`    Warning: unknown txType "${t.type}" — skipping for member ${memberId}`);
          continue;
        }

        // Reverse the direction: credits become negative, debits become positive
        const sign = info.direction === "credit" ? -1 : +1;
        balanceDeltas[info.balanceField] = (balanceDeltas[info.balanceField] ?? 0) + sign * amt;

        if (info.loanStatus) {
          loanRestorations[info.loanStatus] = (loanRestorations[info.loanStatus] ?? 0) + amt;
        }
      }

      // Apply member balance reversals
      if (Object.keys(balanceDeltas).length > 0) {
        const setClauses: Record<string, unknown> = {};
        for (const [field, delta] of Object.entries(balanceDeltas)) {
          const col = (membersTable as any)[field];
          if (delta < 0) {
            // Was a credit being reversed — don't go below 0
            setClauses[field] = sql`GREATEST(0, ${col} + ${delta.toString()}::numeric)`;
          } else {
            // Was a debit being restored — add back (no negative possible here)
            setClauses[field] = sql`${col} + ${delta.toString()}::numeric`;
          }
        }
        setClauses.totalLoanBalance = sql`${membersTable.realLoanBalance} + ${membersTable.emergencyLoanBalance}`;
        setClauses.totalStoreDebt = sql`${membersTable.electronicsDebt} + ${membersTable.sElectronicsDebt} + ${membersTable.commodityDebt} + ${membersTable.ghlFormDebt}`;
        await tx.update(membersTable).set(setClauses).where(eq(membersTable.id, memberId));
      }

      // Restore outstanding balances on loans (LIFO — latest loan first, reverse of application order)
      for (const [loanType, amountToRestore] of Object.entries(loanRestorations) as ["real" | "emergency", number][]) {
        const loans = await tx
          .select({
            id: loansTable.id,
            outstandingBalance: loansTable.outstandingBalance,
            totalRepayable: loansTable.totalRepayable,
          })
          .from(loansTable)
          .where(
            and(
              eq(loansTable.memberId, memberId),
              eq(loansTable.status, "disbursed"),
              eq(loansTable.loanType, loanType),
            ),
          )
          .orderBy(desc(loansTable.disbursedAt), desc(loansTable.id));

        let remaining = amountToRestore;
        for (const loan of loans) {
          if (remaining <= 0) break;
          const maxRestore =
            Math.max(0, parseFloat(String(loan.totalRepayable)) - parseFloat(String(loan.outstandingBalance)));
          const restore = Math.min(maxRestore, remaining);
          if (restore > 0) {
            await tx
              .update(loansTable)
              .set({
                outstandingBalance: sql`LEAST(
                  ${loan.totalRepayable}::numeric,
                  ${loansTable.outstandingBalance} + ${restore.toString()}::numeric
                )`,
              })
              .where(eq(loansTable.id, loan.id));
            remaining -= restore;
          }
        }
      }

      membersReversed++;
    }

    // Delete all transactions for this upload
    await tx.delete(transactionsTable).where(eq(transactionsTable.uploadRecordId, uploadId));

    // Delete the upload record itself
    await tx.delete(uploadRecordsTable).where(eq(uploadRecordsTable.id, uploadId));

    console.log(`    ✓ Reversed ${txns.length} transactions for ${membersReversed} members, upload record deleted`);
  });
}

// ─── Application (same as batch-process.ts) ────────────────────────────────────

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
    balanceDeltas[cfg.balanceField as string] = (balanceDeltas[cfg.balanceField as string] ?? 0) + signed;
    rowTouched = true;

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
        const out = parseFloat(String(loan.outstandingBalance));
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
    const setClauses: Record<string, unknown> = {};
    for (const [field, delta] of Object.entries(balanceDeltas)) {
      const col = (membersTable as any)[field];
      if (delta >= 0) {
        setClauses[field] = sql`${col} + ${delta.toString()}::numeric`;
      } else {
        setClauses[field] = sql`GREATEST(0, ${col} - ${Math.abs(delta).toString()}::numeric)`;
      }
    }
    setClauses.totalLoanBalance = sql`${membersTable.realLoanBalance} + ${membersTable.emergencyLoanBalance}`;
    setClauses.totalStoreDebt = sql`${membersTable.electronicsDebt} + ${membersTable.sElectronicsDebt} + ${membersTable.commodityDebt} + ${membersTable.ghlFormDebt}`;
    await tx.update(membersTable).set(setClauses).where(eq(membersTable.id, memberId));
  }

  return rowTouched;
}

// ─── Job runner ────────────────────────────────────────────────────────────────

interface Job {
  label: string;
  filePath: string;
  organization: string;
  month: string;
  year: number;
  sheetNames: string[];
}

const WORKSPACE_ROOT = new URL("../../../", import.meta.url).pathname;
const FAAN_FILE = `${WORKSPACE_ROOT}attached_assets/FAAN_APRIL_DEDUCTION_2026_(Autosaved)_(1)_1781948209966.xlsx`;
const NAMA_FILE = `${WORKSPACE_ROOT}attached_assets/APRIL_2026_DEDUCTION_NAMA_1781948209967.xlsx`;

/** Jobs in strict chronological order after reversals. */
const JOBS: Job[] = [
  // Nov 2025 —————————————————————————————————————————————
  { label: "FAAN November 2025", filePath: FAAN_FILE, organization: "FAAN", month: "November", year: 2025, sheetNames: ["Sheet 159", "Sheet 160"] },
  { label: "NAMA November 2025", filePath: NAMA_FILE, organization: "NAMA", month: "November", year: 2025, sheetNames: ["Sheet78"] },
  // Dec 2025 —————————————————————————————————————————————
  { label: "FAAN December 2025", filePath: FAAN_FILE, organization: "FAAN", month: "December", year: 2025, sheetNames: ["Sheet161", "Sheet162"] },
  { label: "NAMA December 2025", filePath: NAMA_FILE, organization: "NAMA", month: "December", year: 2025, sheetNames: ["Sheet79"] },
  // Jan 2026 —————————————————————————————————————————————
  { label: "FAAN January 2026",  filePath: FAAN_FILE, organization: "FAAN", month: "January",  year: 2026, sheetNames: ["Sheet163", "Sheet164"] },
  { label: "NAMA January 2026",  filePath: NAMA_FILE, organization: "NAMA", month: "January",  year: 2026, sheetNames: ["Sheet80"] },
  // Feb 2026 —————————————————————————————————————————————
  { label: "FAAN February 2026", filePath: FAAN_FILE, organization: "FAAN", month: "February", year: 2026, sheetNames: ["Sheet165", "Sheet166"] },
  { label: "NAMA February 2026", filePath: NAMA_FILE, organization: "NAMA", month: "February", year: 2026, sheetNames: ["Sheet81"] },
  // Mar 2026 —————————————————————————————————————————————
  { label: "FAAN March 2026",    filePath: FAAN_FILE, organization: "FAAN", month: "March",    year: 2026, sheetNames: ["Sheet167", "Sheet168"] },
  { label: "NAMA March 2026",    filePath: NAMA_FILE, organization: "NAMA", month: "March",    year: 2026, sheetNames: ["Sheet82"] },
];

async function runJob(
  job: Job,
  matcher: NameMatcher,
  allMembers: { id: number; fullName: string; organization: string; employeeNo: string | null }[],
): Promise<void> {
  const uploadOrg = job.organization.toUpperCase();
  console.log(`\n--- ${job.label} (${uploadOrg}) ---`);

  // Duplicate guard (upload record with same month/year/org and status=processed)
  const dup = await db
    .select({ id: uploadRecordsTable.id })
    .from(uploadRecordsTable)
    .where(
      and(
        eq(uploadRecordsTable.month, job.month),
        eq(uploadRecordsTable.year, job.year),
        eq(uploadRecordsTable.organization, uploadOrg),
        eq(uploadRecordsTable.status, "processed"),
      ),
    );
  if (dup.length > 0) {
    console.log(`  SKIPPED — already processed (upload #${dup[0].id})`);
    return;
  }

  const wb = await readLocalWorkbook(job.filePath);
  const membersById = new Map(allMembers.map((m) => [m.id, m]));

  const result = await db.transaction(async (tx) => {
    const [uploadRecord] = await tx
      .insert(uploadRecordsTable)
      .values({
        uploadedBy: 3, // super_admin (Steven)
        month: job.month,
        year: job.year,
        organization: uploadOrg,
        fileObjectPath: `archive:${job.filePath}:${job.sheetNames.join("+")}`,
        status: "pending",
      })
      .returning();

    let totalProcessed = 0;
    let totalSkipped = 0;
    let totalUnmatched = 0;

    for (const sheetName of job.sheetNames) {
      // Find sheet by exact or trimmed name
      const actualName = wb.SheetNames.find((n) => n.trim() === sheetName.trim());
      if (!actualName) {
        console.log(`  WARNING: sheet "${sheetName}" not found (available: ${wb.SheetNames.slice(0, 5).join(", ")}...)`);
        continue;
      }

      const sheet = parseSheet(wb, actualName);
      let sheetProcessed = 0;
      let sheetSkipped = 0;
      let sheetUnmatched = 0;

      for (const row of sheet.rows) {
        const match = matcher.match(row.rawName);
        if (match.memberId == null) {
          sheetUnmatched++;
          continue;
        }

        const locked = await tx.execute(
          sql`SELECT id FROM ${membersTable} WHERE id = ${match.memberId} FOR UPDATE`,
        );
        if (!locked.rows?.length) {
          sheetSkipped++;
          continue;
        }

        const touched = await applyDeductionAmounts(tx, match.memberId, row.amounts, {
          month: job.month,
          year: job.year,
          uploadRecordId: uploadRecord.id,
        });

        if (touched) sheetProcessed++;
        else sheetSkipped++;
      }

      console.log(
        `  [${actualName}] ${sheetProcessed} processed, ${sheetSkipped} skipped, ${sheetUnmatched} unmatched`,
      );
      totalProcessed += sheetProcessed;
      totalSkipped += sheetSkipped;
      totalUnmatched += sheetUnmatched;
    }

    await tx
      .update(uploadRecordsTable)
      .set({ rowsProcessed: totalProcessed, rowsSkipped: totalSkipped, status: "processed" })
      .where(eq(uploadRecordsTable.id, uploadRecord.id));

    return { uploadRecord, totalProcessed, totalSkipped, totalUnmatched };
  });

  console.log(
    `  ✓ DONE — upload #${result.uploadRecord.id}: ${result.totalProcessed} processed, ` +
    `${result.totalSkipped} skipped, ${result.totalUnmatched} unmatched`,
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Deduction Fix Script ===\n");

  // ── Phase 1: Reversals ─────────────────────────────────────────────────────
  console.log("PHASE 1 — Reversing wrong/incomplete uploads");
  const UPLOADS_TO_REVERSE = [5, 6, 7, 8, 10]; // Nov FAAN, Dec FAAN, Nov NAMA, Dec NAMA, Jan FAAN (partial)
  for (const id of UPLOADS_TO_REVERSE) {
    await reverseUpload(id);
  }

  // ── Load members + matcher after reversals (balances changed, but names haven't) ──
  console.log("\nLoading member list and name matcher...");
  const allMembers = await db
    .select({
      id: membersTable.id,
      fullName: membersTable.fullName,
      organization: membersTable.organization,
      employeeNo: membersTable.employeeNo,
    })
    .from(membersTable);
  const matcher = new NameMatcher(allMembers);
  console.log(`  ${allMembers.length} members loaded`);

  // ── Phase 2 + 3: Process all months ───────────────────────────────────────
  console.log("\nPHASE 2+3 — Processing all months from cooperative archive");
  for (const job of JOBS) {
    await runJob(job, matcher, allMembers);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n=== Final upload records ===");
  const records = await db
    .select({
      id: uploadRecordsTable.id,
      org: uploadRecordsTable.organization,
      month: uploadRecordsTable.month,
      year: uploadRecordsTable.year,
      status: uploadRecordsTable.status,
      processed: uploadRecordsTable.rowsProcessed,
      skipped: uploadRecordsTable.rowsSkipped,
    })
    .from(uploadRecordsTable)
    .orderBy(
      uploadRecordsTable.year,
      sql`CASE ${uploadRecordsTable.month}
        WHEN 'January' THEN 1 WHEN 'February' THEN 2 WHEN 'March' THEN 3
        WHEN 'April' THEN 4 WHEN 'May' THEN 5 WHEN 'June' THEN 6
        WHEN 'July' THEN 7 WHEN 'August' THEN 8 WHEN 'September' THEN 9
        WHEN 'October' THEN 10 WHEN 'November' THEN 11 WHEN 'December' THEN 12
      END`,
      uploadRecordsTable.organization,
    );

  console.log(
    records
      .map((r) => `  #${r.id} ${r.org} ${r.month} ${r.year}: ${r.processed} processed, ${r.skipped} skipped [${r.status}]`)
      .join("\n"),
  );

  console.log("\n=== Done ===");
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
