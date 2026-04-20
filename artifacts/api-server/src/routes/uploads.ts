import { Router, type IRouter } from "express";
import { db, membersTable, transactionsTable, uploadRecordsTable, loansTable, notificationsTable } from "@workspace/db";
import { eq, ilike, and } from "drizzle-orm";
import { requireAuth, requireAdmin, AuthRequest } from "../middlewares/auth";
import { logAudit } from "../lib/audit";
import { sendNotification } from "../lib/notifications";
import { PreviewExcelUploadBody, ProcessExcelUploadBody } from "@workspace/api-zod";
import xlsx from "xlsx";

const router: IRouter = Router();

interface ExcelRow {
  rowIndex: number;
  name: string;
  savings: number;
  loanRepayment: number;
  errors: string[];
  matched: boolean;
  memberId?: number;
  memberName?: string;
}

async function parseExcelFromPath(fileObjectPath: string): Promise<ExcelRow[]> {
  const objectStorageUrl = process.env.OBJECT_STORAGE_URL || "http://localhost:3000/api/storage/objects";
  const normalizedPath = fileObjectPath.startsWith("/objects/")
    ? fileObjectPath
    : `/objects/${fileObjectPath}`;

  const resp = await fetch(`${objectStorageUrl}${normalizedPath}`);
  if (!resp.ok) {
    throw new Error(`Failed to fetch Excel file: ${resp.status}`);
  }

  const buffer = Buffer.from(await resp.arrayBuffer());
  const workbook = xlsx.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawRows: any[][] = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: null });

  const rows: ExcelRow[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (!row || row.length < 3) continue;

    const nameRaw = row[1];
    if (!nameRaw || typeof nameRaw !== "string" || nameRaw.trim() === "") continue;

    const name = nameRaw.trim();
    if (name.toLowerCase().includes("name") || name.toLowerCase().includes("s/n")) continue;

    const savings = parseFloat(row[2]) || 0;
    const loanRepayment = [row[3], row[4], row[5], row[6], row[7], row[8], row[9]]
      .map((v) => parseFloat(v) || 0)
      .reduce((a, b) => a + b, 0);

    if (savings === 0 && loanRepayment === 0) continue;

    rows.push({
      rowIndex: i + 1,
      name,
      savings,
      loanRepayment,
      errors: [],
      matched: false,
    });
  }

  return rows;
}

async function matchMembersToRows(rows: ExcelRow[]): Promise<ExcelRow[]> {
  const allMembers = await db.select().from(membersTable);

  return rows.map((row) => {
    const normalizedName = row.name.toLowerCase().replace(/\s+/g, " ").trim();
    const match = allMembers.find(
      (m) => m.fullName.toLowerCase().replace(/\s+/g, " ").trim() === normalizedName,
    );

    if (match) {
      return { ...row, matched: true, memberId: match.id, memberName: match.fullName };
    } else {
      return { ...row, matched: false, errors: [`No member found with name: "${row.name}"`] };
    }
  });
}

router.post("/uploads/preview", requireAuth, requireAdmin, async (req: AuthRequest, res): Promise<void> => {
  const parsed = PreviewExcelUploadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const rows = await parseExcelFromPath(parsed.data.fileObjectPath);
    const matchedRows = await matchMembersToRows(rows);

    const matched = matchedRows.filter((r) => r.matched).length;
    const unmatched = matchedRows.filter((r) => !r.matched).length;

    res.json({
      rows: matchedRows,
      summary: {
        totalRows: matchedRows.length,
        matched,
        unmatched,
        month: parsed.data.month,
        year: parsed.data.year,
      },
    });
  } catch (err: any) {
    res.status(400).json({ error: `Failed to parse Excel file: ${err.message}` });
  }
});

router.post("/uploads/process", requireAuth, requireAdmin, async (req: AuthRequest, res): Promise<void> => {
  const parsed = ProcessExcelUploadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const rows = await parseExcelFromPath(parsed.data.fileObjectPath);
    const matchedRows = await matchMembersToRows(rows);

    const [uploadRecord] = await db
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

    for (const row of matchedRows) {
      if (!row.matched || !row.memberId) {
        if (!parsed.data.skipErrors) {
          skipped++;
          continue;
        }
        skipped++;
        continue;
      }

      const [member] = await db.select().from(membersTable).where(eq(membersTable.id, row.memberId));
      if (!member) {
        skipped++;
        continue;
      }

      if (row.savings > 0) {
        await db.insert(transactionsTable).values({
          memberId: row.memberId,
          type: "savings",
          amount: row.savings.toString(),
          description: `Monthly savings deduction - ${parsed.data.month} ${parsed.data.year}`,
          uploadRecordId: uploadRecord.id,
          month: parsed.data.month,
          year: parsed.data.year,
        });

        await db
          .update(membersTable)
          .set({
            savingsBalance: (parseFloat(member.savingsBalance) + row.savings).toString(),
          })
          .where(eq(membersTable.id, row.memberId));

        await sendNotification({
          memberId: row.memberId,
          type: "transaction",
          title: "Savings Deduction Recorded",
          message: `₦${row.savings.toLocaleString()} has been credited to your savings for ${parsed.data.month} ${parsed.data.year}.`,
        });
      }

      if (row.loanRepayment > 0) {
        await db.insert(transactionsTable).values({
          memberId: row.memberId,
          type: "loan_repayment",
          amount: row.loanRepayment.toString(),
          description: `Monthly loan repayment deduction - ${parsed.data.month} ${parsed.data.year}`,
          uploadRecordId: uploadRecord.id,
          month: parsed.data.month,
          year: parsed.data.year,
        });

        const disbursedLoans = await db
          .select()
          .from(loansTable)
          .where(and(eq(loansTable.memberId, row.memberId), eq(loansTable.status, "disbursed")));

        if (disbursedLoans.length > 0) {
          const loan = disbursedLoans[0];
          const newBalance = Math.max(0, parseFloat(loan.outstandingBalance) - row.loanRepayment);
          await db
            .update(loansTable)
            .set({ outstandingBalance: newBalance.toString() })
            .where(eq(loansTable.id, loan.id));
        }

        const [refreshedMember] = await db.select().from(membersTable).where(eq(membersTable.id, row.memberId));
        const newLoanBalance = Math.max(0, parseFloat(refreshedMember.totalLoanBalance) - row.loanRepayment);
        await db
          .update(membersTable)
          .set({ totalLoanBalance: newLoanBalance.toString() })
          .where(eq(membersTable.id, row.memberId));

        await sendNotification({
          memberId: row.memberId,
          type: "transaction",
          title: "Loan Repayment Recorded",
          message: `₦${row.loanRepayment.toLocaleString()} has been applied to your loan repayment for ${parsed.data.month} ${parsed.data.year}.`,
        });
      }

      processed++;
    }

    await db
      .update(uploadRecordsTable)
      .set({ rowsProcessed: processed, rowsSkipped: skipped, status: "processed" })
      .where(eq(uploadRecordsTable.id, uploadRecord.id));

    await logAudit({
      actorId: req.memberId,
      action: "PROCESS_EXCEL_UPLOAD",
      entity: "upload_record",
      entityId: uploadRecord.id,
      details: `Processed Excel upload: ${processed} rows processed, ${skipped} skipped for ${parsed.data.month} ${parsed.data.year}`,
    });

    res.json({
      uploadId: uploadRecord.id,
      rowsProcessed: processed,
      rowsSkipped: skipped,
      month: parsed.data.month,
      year: parsed.data.year,
    });
  } catch (err: any) {
    res.status(400).json({ error: `Failed to process Excel file: ${err.message}` });
  }
});

router.get("/uploads/history", requireAuth, requireAdmin, async (req: AuthRequest, res): Promise<void> => {
  const records = await db
    .select()
    .from(uploadRecordsTable)
    .orderBy(uploadRecordsTable.createdAt);

  const members = await db.select({ id: membersTable.id, fullName: membersTable.fullName }).from(membersTable);
  const memberMap = Object.fromEntries(members.map((m) => [m.id, m.fullName]));

  res.json(
    records.map((r) => ({
      ...r,
      uploadedByName: memberMap[r.uploadedBy] || "Unknown",
    })),
  );
});

export default router;
