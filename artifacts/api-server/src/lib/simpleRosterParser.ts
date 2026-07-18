/**
 * Simple Roster Parsers — CTAKU and Pension deduction files
 *
 * These files carry one total-deduction amount per member (not per-category).
 * They are treated as payroll_summary (Step 1 of 2) uploads; the per-category
 * breakdown arrives later via the regular FAAN/NAMA cooperative Excel.
 *
 * All file variants share the same structure:
 *   • Rows 0-2 are blank (title/logo area in the original spreadsheet)
 *   • Row 3 contains the actual column headers
 *   • Row 4+ contains data
 *
 * Known header patterns:
 *
 *   CTAKU (5 cols):
 *     Employee No. | Employee Name | (blank) | Grade Level | Amount
 *
 *   Pension-7 (7 cols, AKURE / CTAKU pension, most months):
 *     Pensioner No. | Employee Name | (blank) | Station Code | (blank) | Grade Level | Amount
 *
 *   Pension-5 (5 cols, some months — no Station Code column):
 *     Pensioner No. | Employee Name | (blank) | Grade Level | Amount
 */

import * as xlsx from "xlsx";
import type { PayrollParsedSheet, PayrollParsedRow, ParsedSkip } from "./excelParser";

export type SimpleRosterFormat = "ctaku" | "pension";

// ── Header scanner ──────────────────────────────────────────────────────────

/**
 * Scan up to MAX_SCAN_ROWS to find the header row.
 * Returns { format, headerRowIndex, amountCol } or null.
 */
const MAX_SCAN_ROWS = 12;

interface DetectedInfo {
  format: SimpleRosterFormat;
  headerRowIndex: number;
  amountCol: number;
}

function scanForHeader(
  rows: unknown[][],
): DetectedInfo | null {
  for (let i = 0; i < Math.min(rows.length, MAX_SCAN_ROWS); i++) {
    const row = rows[i];
    if (!Array.isArray(row) || row.length === 0) continue;

    const col0 = String(row[0] ?? "").trim().toLowerCase();

    if (col0 === "pensioner no.") {
      // Pension-7: amount in col 6; Pension-5: amount in col 4
      const amountCol = String(row[6] ?? "").trim().toLowerCase() === "amount" ? 6 : 4;
      return { format: "pension", headerRowIndex: i, amountCol };
    }

    if (col0 === "employee no.") {
      // CTAKU: amount in col 4
      return { format: "ctaku", headerRowIndex: i, amountCol: 4 };
    }
  }
  return null;
}

// ── Format detection (public) ────────────────────────────────────────────────

/**
 * Returns the simple-roster sub-format if this sheet matches a known pattern,
 * or null if it is a regular deduction/payroll sheet.
 */
export function detectSimpleRosterFormat(
  wb: xlsx.WorkBook,
  sheetName: string,
): SimpleRosterFormat | null {
  const ws = wb.Sheets[sheetName];
  if (!ws) return null;

  const rows = xlsx.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: "",
  }) as unknown[][];

  return scanForHeader(rows)?.format ?? null;
}

// ── Amount helper ───────────────────────────────────────────────────────────

function toAmount(raw: unknown): number {
  if (typeof raw === "number") return raw;
  const n = parseFloat(String(raw ?? "").replace(/,/g, "").trim());
  return isNaN(n) ? 0 : n;
}

// ── Main parser ─────────────────────────────────────────────────────────────

/**
 * Parse a CTAKU or Pension Excel sheet into a PayrollParsedSheet.
 * The returned shape is identical to parsePdfRoster / parsePayrollSheet so
 * it can be passed directly to previewPayroll / processPayroll.
 */
export function parseSimpleRosterSheet(
  wb: xlsx.WorkBook,
  sheetName: string,
  _format: SimpleRosterFormat, // kept for API compatibility; actual format re-detected from headers
): PayrollParsedSheet {
  const ws = wb.Sheets[sheetName];
  const allRows = xlsx.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: "",
  }) as unknown[][];

  const detected = scanForHeader(allRows);
  if (!detected) {
    throw new Error("Could not find header row in simple roster sheet");
  }

  const { format, headerRowIndex, amountCol } = detected;
  const idCol   = 0;
  const nameCol = 1;

  const rows: PayrollParsedRow[] = [];
  const skipped: ParsedSkip[]   = [];
  const seenIds = new Map<string, number[]>(); // canonical ID → rowNumbers

  let rowNumber = 0;

  for (let i = headerRowIndex + 1; i < allRows.length; i++) {
    const row = allRows[i];

    const rawId   = String(row[idCol]   ?? "").trim();
    const rawName = String(row[nameCol] ?? "").trim().replace(/\s+/g, " ");

    // Skip truly blank rows
    if (!rawId) continue;
    // Skip any repeated header rows embedded in data
    if (
      rawId.toLowerCase() === "employee no." ||
      rawId.toLowerCase() === "pensioner no."
    ) continue;

    rowNumber++;

    if (!rawName) {
      skipped.push({ row: rowNumber, name: rawId, reason: "Empty name field" });
      continue;
    }

    const amount = toAmount(row[amountCol]);

    // Canonical ID for duplicate detection (strip leading zeros)
    const canon = rawId.replace(/^0+(?=\d)/, "") || rawId;
    if (!seenIds.has(canon)) seenIds.set(canon, []);
    seenIds.get(canon)!.push(rowNumber);

    rows.push({
      rowNumber,
      employeeNo: rawId,
      rawName,
      amount,
      warnings: [],
      errors: [],
    });
  }

  // Flag duplicate IDs
  for (const row of rows) {
    const canon = row.employeeNo.replace(/^0+(?=\d)/, "") || row.employeeNo;
    const dups  = seenIds.get(canon) ?? [];
    if (dups.length > 1) {
      row.errors.push(
        `Duplicate ID "${row.employeeNo}" appears in rows ${dups.join(", ")}.`,
      );
    }
  }

  const label = format === "pension" ? "Pension Deductions" : "CTAKU Payroll";

  return {
    format: "payroll",
    sheetName: label,
    rows,
    headerRowIndex,
    skipped,
    totalAmount: rows.reduce((s, r) => s + r.amount, 0),
  };
}

// ── Sheet summary for /uploads/excel/sheets ─────────────────────────────────

export function summarizeSimpleRosterSheet(
  wb: xlsx.WorkBook,
  sheetName: string,
  format: SimpleRosterFormat,
): Array<{ name: string; rowCount: number; looksValid: boolean; simpleRosterFormat: SimpleRosterFormat }> {
  try {
    const parsed = parseSimpleRosterSheet(wb, sheetName, format);
    return [
      {
        name: parsed.sheetName,
        rowCount: parsed.rows.length,
        looksValid: parsed.rows.length > 0,
        simpleRosterFormat: format,
      },
    ];
  } catch {
    const label = format === "pension" ? "Pension Deductions" : "CTAKU Payroll";
    return [{ name: label, rowCount: 0, looksValid: false, simpleRosterFormat: format }];
  }
}
