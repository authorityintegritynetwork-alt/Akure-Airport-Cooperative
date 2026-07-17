/**
 * PDF Payroll Roster Parser — NAMA "COOP MULTIPURPOSE Analysis Report"
 *
 * pdf-parse v2 renders each data row as a tab-separated string.
 * Actual column order in the text stream (differs from visual order):
 *
 *   [0] Amount      e.g. "288,958.00"
 *   [1] Name        e.g. "BALOGUN OLALEKAN KAZEEM "
 *   [2] GL/Step     e.g. "GL_13_09 "
 *   [3] Location    e.g. "HEADQUATERS LAGOS ANNEX"
 *   [4] Employee ID e.g. "Emp-03506"
 *   [5] Serial No   e.g. "1 "          (resets per location section)
 *   [6] Department  e.g. "COMMERCIAL"
 *
 * A data row is identified by the presence of an "Emp-NNNNN" token in field[4].
 * The amount IS captured — NAMA PDFs carry each member's monthly deduction.
 *
 * Returns a PayrollParsedSheet compatible with the existing previewPayroll /
 * processPayroll pipeline — no changes to those functions required.
 */

import { ObjectStorageService } from "./objectStorage";
import type { PayrollParsedSheet, PayrollParsedRow } from "./excelParser";
import type { ParsedSkip } from "./excelParser";

// ── Buffer download (object storage or /tmp local) ─────────────────────────

async function downloadPdfBuffer(fileObjectPath: string): Promise<Buffer> {
  if (fileObjectPath.startsWith("/tmp/")) {
    const { readFile } = await import("fs/promises");
    return readFile(fileObjectPath);
  }
  const svc = new ObjectStorageService();
  const normalized = fileObjectPath.startsWith("/objects/")
    ? fileObjectPath
    : `/objects/${fileObjectPath.replace(/^\//, "")}`;
  const file = await svc.getObjectEntityFile(normalized);
  const [buf] = await file.download();
  return buf as Buffer;
}

// ── Helpers ────────────────────────────────────────────────────────────────

// Case-insensitive: handles both "Emp-03506" (standard) and "EMP-06070" (newer entries)
const EMP_ID_RE = /^[Ee][Mm][Pp]-\d+$/;

function parseAmount(raw: string): number {
  // "-" (dash) appears in the PDF when a member's amount is nil — treat as 0.
  const cleaned = raw.replace(/,/g, "").trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

/** Canonical employee-number key for duplicate detection (strips "Emp-" prefix and leading zeros). */
function canonEmpNo(empId: string): string {
  return empId.replace(/[^0-9]/g, "").replace(/^0+/, "") || empId;
}

// ── Main parser ────────────────────────────────────────────────────────────

export async function parsePdfRoster(
  fileObjectPath: string,
): Promise<PayrollParsedSheet> {
  const buf = await downloadPdfBuffer(fileObjectPath);

  // pdf-parse v2 — use { data: Buffer } constructor option so we don't need
  // a file:// URL or temp file.
  const { PDFParse } = (await import("pdf-parse")) as unknown as {
    PDFParse: new (opts: { data: Buffer }) => { getText(): Promise<{ text: string }> };
  };

  const { text } = await new PDFParse({ data: buf }).getText();

  const lines = text.split(/\r?\n/);

  const rows: PayrollParsedRow[] = [];
  const skipped: ParsedSkip[] = [];
  const seenEmpIds = new Map<string, number[]>(); // canonEmpNo → rowNumbers
  let rowNumber = 0;

  for (const line of lines) {
    if (!line.includes("\t")) continue;                    // skip non-tabular lines fast
    if (!/[Ee][Mm][Pp]-\d/.test(line)) continue;          // skip non-data lines fast (case-insensitive)

    const tabs = line.split("\t");

    // Guard: must have at least 5 fields and field[4] must be an Emp-ID.
    if (tabs.length < 5 || !EMP_ID_RE.test(tabs[4].trim())) continue;

    rowNumber++;

    const amount     = parseAmount(tabs[0]);
    const rawName    = tabs[1].trim().replace(/\s+/g, " ");
    const employeeNo = tabs[4].trim(); // "Emp-03506"

    if (!rawName) {
      skipped.push({ row: rowNumber, name: "(blank)", reason: "Empty name field" });
      continue;
    }

    // Track duplicates.
    const canon = canonEmpNo(employeeNo);
    if (!seenEmpIds.has(canon)) seenEmpIds.set(canon, []);
    seenEmpIds.get(canon)!.push(rowNumber);

    rows.push({
      rowNumber,
      employeeNo,
      rawName,
      amount,
      warnings: [],
      errors: [],
    });
  }

  // Flag duplicate Employee IDs.
  for (const row of rows) {
    const dups = seenEmpIds.get(canonEmpNo(row.employeeNo)) ?? [];
    if (dups.length > 1) {
      row.errors.push(
        `Duplicate Employee ID "${row.employeeNo}" appears in rows ${dups.join(", ")}.`,
      );
    }
  }

  const totalAmount = rows.reduce((s, r) => s + r.amount, 0);

  return {
    format: "payroll",
    sheetName: "PDF Payroll",
    rows,
    headerRowIndex: -1,
    skipped,
    totalAmount,
  };
}

// ── Sheet-summary for /uploads/excel/sheets ────────────────────────────────

export async function summarizePdfRoster(
  fileObjectPath: string,
): Promise<Array<{ name: string; rowCount: number; looksValid: boolean }>> {
  try {
    const parsed = await parsePdfRoster(fileObjectPath);
    return [
      {
        name: "PDF Payroll",
        rowCount: parsed.rows.length,
        looksValid: parsed.rows.length > 0,
      },
    ];
  } catch {
    return [{ name: "PDF Payroll", rowCount: 0, looksValid: false }];
  }
}
