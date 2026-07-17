/**
 * PDF Payroll Roster Parser
 *
 * Parses a clean-table PDF payroll (e.g. NAMA head-office payroll) into the
 * same PayrollParsedSheet shape that the Excel pipeline uses, so the existing
 * previewPayroll / processPayroll functions work unchanged.
 *
 * Only used for "payroll_summary" (Roster - Step 1) uploads where the source
 * file is a PDF.  We only need employee number + name; amount is set to 0.
 */

import { ObjectStorageService } from "./objectStorage";
import type { PayrollParsedSheet, PayrollParsedRow } from "./excelParser";
import type { ParsedSkip } from "./excelParser";

// ── Object-storage download ────────────────────────────────────────────────

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

// ── Text helpers ───────────────────────────────────────────────────────────

/** Tokens that signal a totals / summary row — skip these. */
const SKIP_WORDS = new Set([
  "total", "grand", "sub-total", "subtotal", "sum", "nil", "none",
]);

/** Words that look like grade levels / pay bands — not names. */
const GRADE_PATTERN = /^(gl|ss|conhess|contiss|consolidated|band|level|grade|conmess|conpass|contediss)\b/i;
const AMOUNT_PATTERN = /^[\d,]+(\.\d+)?$/;

function isNameWord(token: string): boolean {
  if (token.length < 2) return false;
  if (AMOUNT_PATTERN.test(token)) return false;
  if (GRADE_PATTERN.test(token)) return false;
  if (/^\d/.test(token)) return false;
  // Accept fully-capitalised words (Nigerian civil-service convention) or
  // title-case words, allowing hyphens and trailing initials like "A."
  return /^[A-Z][A-Z'-]{0,}\.?$/.test(token) || /^[A-Z][a-z]/.test(token);
}

/**
 * Extract a person's full name from a token slice.
 * Collects consecutive name-like tokens (minimum 2).
 */
function extractName(tokens: string[]): string {
  const words: string[] = [];
  for (const t of tokens) {
    if (isNameWord(t)) {
      words.push(t);
    } else if (words.length > 0) {
      break; // stop on first non-name token after we've started collecting
    }
  }
  return words.length >= 2 ? words.join(" ") : "";
}

/** True when the line looks like a table header. */
function isHeaderLine(line: string): boolean {
  const u = line.toUpperCase();
  const hasName = u.includes("NAME") || u.includes("STAFF");
  const hasNum  = u.includes("STAFF NO") || u.includes("EMP NO") ||
                  u.includes("EMPLOYEE") || u.includes("S/N") ||
                  u.includes("NO.") || (u.includes(" NO") && hasName);
  return hasName && hasNum;
}

/** True when the line looks like a data row (starts with serial number). */
function isDataLine(line: string): boolean {
  return /^\s*\d{1,4}\s+\S/.test(line);
}

/** Try to extract employee number from the token slice before the name. */
function extractEmployeeNo(tokens: string[]): string {
  for (const t of tokens) {
    // Pure numeric like "00123" or alpha-numeric like "NAMA/001"
    if (/^\d{3,}$/.test(t) || /^[A-Z]{0,6}[/\\-]?\d{2,}$/i.test(t)) {
      return t;
    }
  }
  return "";
}

// ── Main parser ────────────────────────────────────────────────────────────

export async function parsePdfRoster(
  fileObjectPath: string,
): Promise<PayrollParsedSheet> {
  const buf = await downloadPdfBuffer(fileObjectPath);

  // pdf-parse is a CJS module; use dynamic import to keep this file ESM-safe.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = (await import("pdf-parse")).default as (
    buf: Buffer,
  ) => Promise<{ text: string; numpages: number }>;

  const { text } = await pdfParse(buf);

  const lines = text.split(/\r?\n/);

  // ── Locate header ────────────────────────────────────────────────────────
  let headerLineIdx = -1;
  let nameColChar = -1;

  for (let i = 0; i < lines.length; i++) {
    if (isHeaderLine(lines[i])) {
      headerLineIdx = i;
      const upper = lines[i].toUpperCase();
      // Find where "NAME" starts in the header for position-based extraction.
      nameColChar = upper.indexOf("NAME");
      if (nameColChar < 0) nameColChar = upper.indexOf("STAFF");
      break;
    }
  }

  // ── Parse data rows ──────────────────────────────────────────────────────
  const rows: PayrollParsedRow[] = [];
  const skipped: ParsedSkip[] = [];
  const seenNos = new Map<string, number[]>();
  let rowNumber = 0;

  const startIdx = headerLineIdx >= 0 ? headerLineIdx + 1 : 0;

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    if (!isDataLine(line)) continue;

    const tokens = line.trim().split(/\s+/);
    if (tokens.length < 3) continue;

    rowNumber++;

    // tokens[0] = serial number — skip it.
    const afterSerial = tokens.slice(1);

    // ── Employee number ────────────────────────────────────────────────────
    let employeeNo = "";
    let nameTokens = afterSerial;

    // If the first token after serial looks like an employee number, consume it.
    const firstToken = afterSerial[0] ?? "";
    if (/^\d{3,}$/.test(firstToken) || /^[A-Z]{0,6}[/\\-]?\d{2,}$/i.test(firstToken)) {
      employeeNo = firstToken;
      nameTokens = afterSerial.slice(1);
    } else {
      // Fallback: try to find an emp-no anywhere in the remaining tokens.
      employeeNo = extractEmployeeNo(afterSerial);
    }

    // ── Name extraction ────────────────────────────────────────────────────
    // Prefer position-based (char offset from header) when available.
    let rawName = "";
    if (nameColChar >= 0 && line.length > nameColChar) {
      const fromNameCol = line.slice(nameColChar).trim();
      const nameTokensPos = fromNameCol.split(/\s+/);
      rawName = extractName(nameTokensPos);
    }
    // Fall back to token-based extraction.
    if (!rawName) {
      rawName = extractName(nameTokens);
    }

    // ── Skip / validate ────────────────────────────────────────────────────
    if (!rawName) {
      skipped.push({ row: rowNumber, name: "(blank)", reason: "Could not extract a name from row" });
      continue;
    }
    const lowerName = rawName.toLowerCase();
    if (
      SKIP_WORDS.has(lowerName) ||
      lowerName.includes("total") ||
      lowerName.includes("grand")
    ) {
      continue;
    }

    // Normalise the extracted name.
    const cleanName = rawName
      .replace(/^[=@+\-]+/, "")
      .replace(/\s*,\s*/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // Track duplicate employee numbers.
    if (employeeNo) {
      const canon = employeeNo.replace(/\D/g, "").replace(/^0+/, "") || employeeNo;
      if (!seenNos.has(canon)) seenNos.set(canon, []);
      seenNos.get(canon)!.push(rowNumber);
    }

    rows.push({
      rowNumber,
      employeeNo,
      rawName: cleanName,
      amount: 0, // Roster-only — amounts not in PDF; cooperative archive carries them.
      warnings: employeeNo
        ? []
        : ["No employee number detected — will fall back to name-only matching"],
      errors: [],
    });
  }

  // ── Flag duplicate employee numbers ─────────────────────────────────────
  for (const row of rows) {
    if (!row.employeeNo) continue;
    const canon = row.employeeNo.replace(/\D/g, "").replace(/^0+/, "") || row.employeeNo;
    const dups = seenNos.get(canon) ?? [];
    if (dups.length > 1) {
      row.errors.push(
        `Duplicate employee number "${row.employeeNo}" in PDF (rows ${dups.join(", ")}).`,
      );
    }
  }

  return {
    format: "payroll",
    sheetName: "PDF Payroll",
    rows,
    headerRowIndex: headerLineIdx,
    skipped,
    totalAmount: 0,
  };
}

/** Returns a single-item sheet summary array matching the Excel pipeline's shape. */
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
  } catch (err: any) {
    return [{ name: "PDF Payroll", rowCount: 0, looksValid: false }];
  }
}
