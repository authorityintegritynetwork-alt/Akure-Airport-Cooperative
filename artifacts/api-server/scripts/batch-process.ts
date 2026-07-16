/**
 * One-time batch processor: applies monthly deduction files from attached_assets
 * to member balances using the same logic as the admin upload endpoint.
 *
 * Run via: node scripts/run-batch.mjs
 */
import { db, membersTable, transactionsTable, uploadRecordsTable, loansTable } from "@workspace/db";
import { eq, and, asc, sql } from "drizzle-orm";
import {
  readLocalWorkbook,
  parseSheet,
  parsePayrollSheet,
  ALL_CATEGORIES,
  CATEGORY_CONFIG,
  DeductionCategory,
  canonicalEmployeeNo,
  computeDeductionSplit,
} from "../src/lib/excelParser";
import { NameMatcher } from "../src/lib/nameMatcher";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

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
    balanceDeltas[cfg.balanceField as string] =
      (balanceDeltas[cfg.balanceField as string] || 0) + signed;
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
        const out = parseFloat(loan.outstandingBalance);
        if (out <= 0) continue;
        const pay = Math.min(out, remaining);
        await tx
          .update(loansTable)
          .set({ outstandingBalance: sql`GREATEST(0, ${loansTable.outstandingBalance} - ${pay.toString()}::numeric)` })
          .where(eq(loansTable.id, loan.id));
        remaining -= pay;
      }
    }
  }

  if (rowTouched) {
    const setClauses: Record<string, any> = {};
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

interface Job {
  filePath: string;
  organization: string;
  month: string;
  year: number;
  sheetNames: string[];
  label: string;
}

const WORKSPACE_ROOT = new URL("../../../", import.meta.url).pathname;

const JOBS: Job[] = [
  {
    label: "FAAN January 2026",
    filePath: `${WORKSPACE_ROOT}attached_assets/FAAN_JAN_2026_1_1783199170405.xlsx`,
    organization: "FAAN",
    month: "January",
    year: 2026,
    sheetNames: ["Sheet1"],
  },
  {
    label: "FAAN April 2026",
    filePath: `${WORKSPACE_ROOT}attached_assets/FAAN_APRIL_DEDUCTION_2026_(Autosaved)_(1)_1781948209966.xlsx`,
    organization: "FAAN",
    month: "April",
    year: 2026,
    sheetNames: ["Sheet169", "Sheet170"],
  },
  {
    label: "NAMA April 2026",
    filePath: `${WORKSPACE_ROOT}attached_assets/APRIL_2026_DEDUCTION_NAMA_1781948209967.xlsx`,
    organization: "NAMA",
    month: "April",
    year: 2026,
    sheetNames: ["Sheet83"],
  },
];

async function runBatch() {
  // Use the super_admin member (Steven, id=3) as the actor for upload records
  const ACTOR_ID = 3;

  console.log("=== Batch Processor ===");
  console.log(`Processing ${JOBS.length} job(s)...\n`);

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
  const matcher = new NameMatcher(allMembers);

  function buildEmpNoIndex(uploadOrg: string): Map<string, typeof allMembers[0]> {
    const idx = new Map<string, typeof allMembers[0]>();
    for (const m of allMembers) {
      if (!m.employeeNo) continue;
      if (m.organization !== uploadOrg) continue;
      idx.set(canonicalEmployeeNo(m.employeeNo), m);
    }
    return idx;
  }

  for (const job of JOBS) {
    const uploadOrg = job.organization.trim().toUpperCase();
    console.log(`--- ${job.label} (${job.month} ${job.year} / ${uploadOrg}) ---`);

    // Duplicate guard
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
      console.log(`  SKIPPED — already processed (upload record #${dup[0].id})\n`);
      continue;
    }

    let wb: Awaited<ReturnType<typeof readLocalWorkbook>>;
    try {
      wb = await readLocalWorkbook(job.filePath);
    } catch (err: any) {
      console.error(`  ERROR reading file: ${err.message}\n`);
      continue;
    }

    const empNoIndex = buildEmpNoIndex(uploadOrg);

    try {
      const result = await db.transaction(async (tx) => {
        const [uploadRecord] = await tx
          .insert(uploadRecordsTable)
          .values({
            uploadedBy: ACTOR_ID,
            month: job.month,
            year: job.year,
            organization: uploadOrg,
            fileObjectPath: `local:${job.filePath}:${job.sheetNames.join("+")}`,
            status: "pending",
          })
          .returning();

        let totalProcessed = 0, totalSkipped = 0, totalUnmatched = 0;

        for (const sheetName of job.sheetNames) {
          if (!wb.SheetNames.includes(sheetName)) {
            console.log(`  Sheet "${sheetName}" not found in workbook — skipping`);
            continue;
          }

          let sheetProcessed = 0, sheetSkipped = 0, sheetUnmatched = 0;

          const payroll = parsePayrollSheet(wb, sheetName);
          if (payroll) {
            // Payroll single-amount format
            for (const row of payroll.rows) {
              let member = empNoIndex.get(canonicalEmployeeNo(row.employeeNo));
              if (!member) {
                const byName = matcher.match(row.rawName);
                if (byName.memberId != null) {
                  member = membersById.get(byName.memberId);
                }
              }
              if (!member) { sheetUnmatched++; continue; }

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
                     FROM ${membersTable} WHERE id = ${member.id} FOR UPDATE`,
              );
              if (!lockedRows.rows?.length) { sheetSkipped++; continue; }
              const locked = lockedRows.rows[0] as Record<string, unknown>;

              if (!locked.employeeNo) {
                await tx.update(membersTable)
                  .set({ employeeNo: row.employeeNo })
                  .where(eq(membersTable.id, member.id));
              }

              const split = computeDeductionSplit(debtBalancesOf(locked), row.amount);
              const touched = await applyDeductionAmounts(tx, member.id, split, {
                month: job.month, year: job.year, uploadRecordId: uploadRecord.id,
              });
              if (touched) sheetProcessed++; else sheetSkipped++;
            }
            console.log(`  [payroll] ${sheetName}: ${sheetProcessed} processed, ${sheetSkipped} skipped, ${sheetUnmatched} unmatched`);
          } else {
            // Multi-column cooperative format
            const sheet = parseSheet(wb, sheetName);
            for (const row of sheet.rows) {
              const match = matcher.match(row.rawName);
              if (match.memberId == null) { sheetUnmatched++; continue; }

              const locked = await tx.execute(
                sql`SELECT id FROM ${membersTable} WHERE id = ${match.memberId} FOR UPDATE`,
              );
              if (!locked.rows?.length) { sheetSkipped++; continue; }

              const touched = await applyDeductionAmounts(tx, match.memberId, row.amounts, {
                month: job.month, year: job.year, uploadRecordId: uploadRecord.id,
              });
              if (touched) sheetProcessed++; else sheetSkipped++;
            }
            console.log(`  [coop] ${sheetName}: ${sheetProcessed} processed, ${sheetSkipped} skipped, ${sheetUnmatched} unmatched`);
          }

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
        `  ✓ DONE — upload record #${result.uploadRecord.id}: ${result.totalProcessed} members updated, ` +
        `${result.totalSkipped} skipped, ${result.totalUnmatched} unmatched\n`
      );
    } catch (err: any) {
      console.error(`  ERROR processing job: ${err.message}\n`);
    }
  }

  console.log("=== Batch complete ===");
  process.exit(0);
}

runBatch().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
