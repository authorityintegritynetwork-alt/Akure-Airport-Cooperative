import xlsx from "xlsx";
import { ObjectStorageService } from "./objectStorage";

export type DeductionCategory =
  | "shares"
  | "savings"
  | "provident"
  | "christmas"
  | "realLoan"
  | "emergencyLoan"
  | "electronics"
  | "sElectronics"
  | "furniture"
  | "commodity"
  | "ghlForm"
  | "fire"
  | "fuelVenture"
  | "landLoan";

export const ALL_CATEGORIES: DeductionCategory[] = [
  "shares",
  "savings",
  "provident",
  "christmas",
  "realLoan",
  "emergencyLoan",
  "electronics",
  "sElectronics",
  "furniture",
  "commodity",
  "ghlForm",
  "fire",
  "fuelVenture",
  "landLoan",
];

export type Organization = "faan" | "nama";

// Unified template: every organisation's spreadsheet may carry any of these
// categories. Columns the org does not use are simply left blank. The
// `furniture` legacy bucket is intentionally omitted — no current spreadsheet
// uses it, the DB column is being phased out.
// `shares` is an opening-balance-only column (capital contribution) — included
// here so the opening-balances parser picks it up from the October balances
// sheet. Monthly deduction sheets never carry a SHARES column, so amounts.shares
// will always be 0 in the deduction context and is harmlessly skipped.
const UNIFIED_CATEGORIES: DeductionCategory[] = [
  "shares",
  "savings",
  "provident",
  "christmas",
  "fire",
  "realLoan",
  "emergencyLoan",
  "fuelVenture",
  "landLoan",
  "electronics",
  "sElectronics",
  "commodity",
  "ghlForm",
];

export const ORG_CATEGORIES: Record<Organization, DeductionCategory[]> = {
  faan: UNIFIED_CATEGORIES,
  nama: UNIFIED_CATEGORIES,
};

const HEADER_ALIASES: Record<DeductionCategory, string[]> = {
  shares: ["shares", "share", "share capital", "shares capital"],
  savings: ["savings", "saving"],
  provident: ["prov", "prov.", "provident"],
  christmas: ["xmass", "xmas", "christmas"],
  realLoan: [
    "real loan",
    "real-loan",
    "realloan",
    "loan",
    "r/loan",
    "r /loan",
    "r loan",
    "r.loan",
  ],
  emergencyLoan: [
    "emer loan",
    "emergency loan",
    "emergency",
    "emer",
    "emer.",
  ],
  electronics: ["elect", "electronics", "electric", "electricity"],
  sElectronics: [
    "s/elect",
    "s elect",
    "s.elect",
    "select",
    "selectronics",
    "s electronics",
    "s.electronics",
    "s/electronics",
    "small elect",
    "small electronics",
    // Legacy FAAN alias: prior to the unified template this single column held
    // both Small-Electronics AND Land-Loan amounts. Going forward the template
    // splits them into separate columns. Keeping this alias so that historical
    // FAAN sheets (pre-template) still parse — values land in S/Electronics
    // exactly as they did before.
    "s/e/land",
    "s e land",
    "se/land",
    "s/eland",
  ],
  furniture: ["furniture", "furn"],
  commodity: ["comm", "commodity", "commodities"],
  ghlForm: [
    "g/h&l/form",
    "g h l form",
    "ghl form",
    "ghlform",
    "ghl",
    "g/h&l",
    "g h l",
    "g/h&l/f",
    "g h l f",
    "g/hl/f",
  ],
  fire: ["fire", "fire fund", "fire contribution", "fire/fund"],
  fuelVenture: ["f/v", "f/vent", "f vent", "fvent", "fuel vent", "fuel venture", "fuel-venture"],
  landLoan: ["land", "land loan", "land/loan"],
};

const NAME_HEADERS = [
  "name",
  "names",
  "member name",
  "members name",
  "member's name",
  "members' name",
  "members names",
  "member names",
  "name of member",
  "names of members",
  "full name",
  "full names",
  "staff name",
  "staff names",
];
const SN_HEADERS = ["n/s", "s/n", "sn", "no", "no.", "#"];

/**
 * Headers that identify a dedicated employee / staff / pensioner number
 * column in the cooperative archive multi-column format.  These are
 * intentionally more specific than SN_HEADERS so generic serial-number
 * columns ("No.", "#") are not misidentified as employee IDs.
 */
const EMP_NO_COL_HEADERS = [
  "staff no",
  "staff no.",
  "staff num",
  "staff number",
  "emp no",
  "emp no.",
  "emp num",
  "emp number",
  "employee no",
  "employee no.",
  "employee num",
  "employee number",
  "pensioner no",
  "pensioner no.",
  "pensioner num",
  "pensioner number",
  "member id",
  "member no",
  "member no.",
  "id no",
  "id no.",
  "id number",
];
const TOTAL_HEADERS = ["total", "totals", "grand total"];

function normHeader(v: unknown): string {
  if (v == null) return "";
  return String(v).toLowerCase().replace(/\s+/g, " ").trim();
}

function toNumber(v: unknown): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return isFinite(v) ? v : 0;
  const s = String(v).replace(/[,₦\s]/g, "").trim();
  if (s === "" || s === "-") return 0;
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

interface HeaderMap {
  headerRowIndex: number;
  nameCol: number;
  empNoCol: number | null;
  totalCol: number | null;
  categoryCols: Partial<Record<DeductionCategory, number>>;
}

function detectHeader(
  rows: unknown[][],
  allowedCategories: DeductionCategory[] = ALL_CATEGORIES,
): HeaderMap | null {
  const scanLimit = Math.min(rows.length, 25);
  for (let r = 0; r < scanLimit; r++) {
    const row = rows[r];
    if (!row) continue;
    let nameCol = -1;
    for (let c = 0; c < row.length; c++) {
      const h = normHeader(row[c]);
      if (NAME_HEADERS.includes(h)) {
        nameCol = c;
        break;
      }
    }
    if (nameCol < 0) continue;

    const categoryCols: Partial<Record<DeductionCategory, number>> = {};
    let totalCol: number | null = null;
    let empNoCol: number | null = null;

    for (let c = 0; c < row.length; c++) {
      const h = normHeader(row[c]);
      if (!h) continue;
      if (c === nameCol) continue;
      if (SN_HEADERS.includes(h)) continue;

      // Dedicated employee-number column (more specific than SN_HEADERS).
      if (empNoCol === null && EMP_NO_COL_HEADERS.includes(h)) {
        empNoCol = c;
        continue;
      }

      if (TOTAL_HEADERS.includes(h)) {
        totalCol = c;
        continue;
      }
      for (const cat of allowedCategories) {
        if (categoryCols[cat] !== undefined) continue;
        if (HEADER_ALIASES[cat].includes(h)) {
          categoryCols[cat] = c;
          break;
        }
      }
    }

    if (Object.keys(categoryCols).length >= 2) {
      return { headerRowIndex: r, nameCol, empNoCol, totalCol, categoryCols };
    }
  }
  return null;
}

export interface ParsedRow {
  rowNumber: number;
  rawName: string;
  /** Employee / staff / pensioner number from a dedicated column in the sheet, if present. */
  employeeNo: string | null;
  amounts: Record<DeductionCategory, number>;
  total: number;
  computedTotal: number;
  totalMismatch: boolean;
  warnings: string[];
  errors: string[];
}

export interface ParsedSkip {
  row: number;
  name: string;
  reason: string;
}

export interface ParsedSheet {
  sheetName: string;
  rows: ParsedRow[];
  detectedColumns: DeductionCategory[];
  headerRowIndex: number;
  skipped: ParsedSkip[];
}

function emptyAmounts(): Record<DeductionCategory, number> {
  return ALL_CATEGORIES.reduce(
    (acc, c) => ({ ...acc, [c]: 0 }),
    {} as Record<DeductionCategory, number>,
  );
}

export function parseSheet(
  workbook: xlsx.WorkBook,
  sheetName: string,
  organization: Organization = "faan",
): ParsedSheet {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error(`Sheet not found: ${sheetName}`);
  }
  const rows: unknown[][] = xlsx.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    blankrows: false,
  });

  const allowed = ORG_CATEGORIES[organization];
  const header = detectHeader(rows, allowed);
  if (!header) {
    return {
      sheetName,
      rows: [],
      detectedColumns: [],
      headerRowIndex: -1,
      skipped: [],
    };
  }

  const detectedColumns = Object.keys(header.categoryCols) as DeductionCategory[];
  const out: ParsedRow[] = [];
  const skipped: ParsedSkip[] = [];

  for (let r = header.headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;

    const rawName = row[header.nameCol];
    // Strip Excel formula prefixes (=, @, +, -) to prevent formula injection
    // from maliciously crafted spreadsheets being evaluated as member names.
    const nameStr = rawName == null ? "" : String(rawName).trim().replace(/^[=@+\-]+/, "").trim();

    // Extract employee number from dedicated column when the sheet has one.
    const empNoRaw = header.empNoCol != null ? row[header.empNoCol] : null;
    const employeeNo =
      empNoRaw != null && String(empNoRaw).trim() !== ""
        ? String(empNoRaw).trim()
        : null;

    const amounts = emptyAmounts();
    for (const cat of detectedColumns) {
      const col = header.categoryCols[cat]!;
      amounts[cat] = toNumber(row[col]);
    }
    const computedTotal = ALL_CATEGORIES.reduce((a, c) => a + amounts[c], 0);
    const total = header.totalCol != null ? toNumber(row[header.totalCol]) : computedTotal;
    const hasAmounts = computedTotal !== 0 || total !== 0;

    if (!nameStr) {
      // Unnamed row carrying balances is a data error worth reporting;
      // a fully empty spacer row is silently ignored.
      if (hasAmounts) {
        skipped.push({ row: r + 1, name: "(blank)", reason: "Missing member name" });
      }
      continue;
    }

    const lower = nameStr.toLowerCase();
    if (
      lower === "total" ||
      lower.startsWith("total ") ||
      lower.startsWith("grand ") ||
      lower.startsWith("sub ") ||
      lower.includes("signature")
    ) {
      continue;
    }

    if (!hasAmounts) {
      skipped.push({ row: r + 1, name: nameStr, reason: "No balance amounts (all zero)" });
      continue;
    }

    const totalMismatch = header.totalCol != null && Math.abs(total - computedTotal) > 0.5;
    const warnings: string[] = [];
    if (totalMismatch) {
      warnings.push(
        `Sheet total (${total.toFixed(2)}) does not match sum of categories (${computedTotal.toFixed(2)})`,
      );
    }

    out.push({
      rowNumber: r + 1,
      rawName: nameStr,
      employeeNo,
      amounts,
      total,
      computedTotal,
      totalMismatch,
      warnings,
      errors: [],
    });
  }

  return {
    sheetName,
    rows: out,
    detectedColumns,
    headerRowIndex: header.headerRowIndex,
    skipped,
  };
}

// ── Payroll deduction format ─────────────────────────────────────────────────
// Monthly payroll files (FAAN "476" downloads, pension deduction downloads)
// carry ONE total deduction per person: Employee/Pensioner No. | Name | Amount.
// The single amount is split by the cooperative's rule: loans and store debts
// are repaid first (in DEBT_ORDER), any remainder is credited to savings.

export interface PayrollHeaderMap {
  headerRowIndex: number;
  noCol: number;
  nameCol: number;
  amountCol: number;
}

const PAYROLL_NO_RE = /^(employee|pensioner|staff|emp)\.?\s*(no|num|number)\.?$/;

export function detectPayrollHeader(rows: unknown[][]): PayrollHeaderMap | null {
  const scanLimit = Math.min(rows.length, 25);
  for (let r = 0; r < scanLimit; r++) {
    const row = rows[r];
    if (!row) continue;
    let noCol = -1;
    let nameCol = -1;
    let amountCol = -1;
    for (let c = 0; c < row.length; c++) {
      const h = normHeader(row[c]);
      if (!h) continue;
      if (noCol < 0 && (PAYROLL_NO_RE.test(h) || /(employee|pensioner|staff)\s*(no|num|number)/.test(h))) {
        noCol = c;
        continue;
      }
      if (nameCol < 0 && NAME_HEADERS.includes(h)) {
        nameCol = c;
        continue;
      }
      if (amountCol < 0 && (h === "amount" || h.startsWith("amount"))) {
        amountCol = c;
      }
    }
    if (noCol >= 0 && nameCol >= 0 && amountCol >= 0) {
      return { headerRowIndex: r, noCol, nameCol, amountCol };
    }
  }
  return null;
}

export interface PayrollParsedRow {
  rowNumber: number;
  employeeNo: string;
  rawName: string;
  amount: number;
  warnings: string[];
  errors: string[];
}

export interface PayrollParsedSheet {
  format: "payroll";
  sheetName: string;
  rows: PayrollParsedRow[];
  headerRowIndex: number;
  skipped: ParsedSkip[];
  totalAmount: number;
}

export function parsePayrollSheet(
  workbook: xlsx.WorkBook,
  sheetName: string,
): PayrollParsedSheet | null {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`Sheet not found: ${sheetName}`);
  const rows: unknown[][] = xlsx.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    blankrows: false,
  });
  const header = detectPayrollHeader(rows);
  if (!header) return null;

  const out: PayrollParsedRow[] = [];
  const skipped: ParsedSkip[] = [];
  const seenNos = new Map<string, number[]>();

  for (let r = header.headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    const rawNo = row[header.noCol];
    const nameStr = row[header.nameCol] == null ? "" : String(row[header.nameCol]).trim();
    const amount = toNumber(row[header.amountCol]);

    const lower = nameStr.toLowerCase();
    if (lower.includes("grand total") || lower === "total" || lower.startsWith("total ")) continue;
    if (String(rawNo ?? "").toLowerCase().includes("total")) continue;

    const noStr = rawNo == null ? "" : String(rawNo).trim();
    if (!noStr && !nameStr && amount === 0) continue;
    if (!noStr) {
      if (amount > 0) skipped.push({ row: r + 1, name: nameStr || "(blank)", reason: "Missing employee number" });
      continue;
    }
    if (!nameStr) {
      skipped.push({ row: r + 1, name: "(blank)", reason: "Missing name" });
      continue;
    }
    if (amount <= 0) {
      skipped.push({ row: r + 1, name: nameStr, reason: "Zero or missing amount" });
      continue;
    }

    // Key duplicate detection by the CANONICAL form ("015" ≡ "15" ≡ "emp-15")
    // — the canonical number is the permanent matching ID, so raw variants of
    // the same number must be treated as duplicates.
    const canonNo = canonicalEmployeeNo(noStr);
    if (!seenNos.has(canonNo)) seenNos.set(canonNo, []);
    seenNos.get(canonNo)!.push(r + 1);

    out.push({
      rowNumber: r + 1,
      employeeNo: noStr,
      rawName: nameStr.replace(/^[=@+\-]+/, "").replace(/\s*,\s*/g, " ").replace(/\s+/g, " ").trim(),
      amount,
      warnings: [],
      errors: [],
    });
  }

  // Duplicate employee numbers are a data error — the admin must fix the sheet.
  for (const row of out) {
    const dupRows = seenNos.get(canonicalEmployeeNo(row.employeeNo))!;
    if (dupRows.length > 1) {
      row.errors.push(
        `Duplicate employee number "${row.employeeNo}" in sheet (rows ${dupRows.join(", ")}). Fix the spreadsheet before processing.`,
      );
    }
  }

  return {
    format: "payroll",
    sheetName,
    rows: out,
    headerRowIndex: header.headerRowIndex,
    skipped,
    totalAmount: out.reduce((s, r) => s + r.amount, 0),
  };
}

/** Canonical employee-number form for matching: uppercase, no leading zeros. */
export function canonicalEmployeeNo(no: string): string {
  return no.trim().toUpperCase().replace(/^0+(?=\d)/, "");
}

/**
 * Debt payoff priority for the single monthly deduction. Any remainder after
 * all debts are cleared is credited to savings.
 */
export const DEBT_ORDER: DeductionCategory[] = [
  "realLoan",
  "emergencyLoan",
  "electronics",
  "sElectronics",
  "furniture",
  "commodity",
  "ghlForm",
  "fuelVenture",
  "landLoan",
];

/**
 * Split a single payroll deduction across debts (loans first) with the
 * remainder going to savings. `balances` holds the member's CURRENT
 * outstanding amounts per debt category.
 */
export function computeDeductionSplit(
  balances: Partial<Record<DeductionCategory, number>>,
  amount: number,
): Record<DeductionCategory, number> {
  const split = emptyAmounts();
  let remaining = Math.round(amount * 100);
  for (const cat of DEBT_ORDER) {
    if (remaining <= 0) break;
    const owe = Math.round(Math.max(0, balances[cat] ?? 0) * 100);
    if (owe <= 0) continue;
    const pay = Math.min(owe, remaining);
    split[cat] = pay / 100;
    remaining -= pay;
  }
  if (remaining > 0) split.savings = remaining / 100;
  return split;
}

/** Read a workbook directly from a local filesystem path (batch-processing use). */
export async function readLocalWorkbook(filePath: string): Promise<xlsx.WorkBook> {
  const { readFile } = await import("fs/promises");
  const buf = await readFile(filePath);
  return xlsx.read(buf, { type: "buffer" });
}

export async function downloadWorkbook(fileObjectPath: string): Promise<xlsx.WorkBook> {
  if (fileObjectPath.startsWith("/tmp/")) {
    const { readFile } = await import("fs/promises");
    const buf = await readFile(fileObjectPath);
    return xlsx.read(buf, { type: "buffer" });
  }
  const svc = new ObjectStorageService();
  const normalized = fileObjectPath.startsWith("/objects/")
    ? fileObjectPath
    : `/objects/${fileObjectPath.replace(/^\//, "")}`;
  const file = await svc.getObjectEntityFile(normalized);
  const [buf] = await file.download();
  return xlsx.read(buf, { type: "buffer" });
}

export interface CategoryConfig {
  txType:
    | "shares"
    | "savings"
    | "provident"
    | "provident_loan_repayment"
    | "christmas"
    | "real_loan_repayment"
    | "emergency_loan_repayment"
    | "electronics_repayment"
    | "s_electronics_repayment"
    | "furniture_repayment"
    | "commodity_repayment"
    | "ghl_form_repayment"
    | "fire"
    | "fuel_venture_repayment"
    | "land_loan_repayment";
  balanceField: string;
  direction: "credit" | "debit";
  label: string;
  loanStatus?: "real" | "emergency";
}

export const CATEGORY_CONFIG: Record<DeductionCategory, CategoryConfig> = {
  // Share capital — opening-balance-only; never appears in monthly deductions.
  shares: { txType: "shares", balanceField: "sharesBalance", direction: "credit", label: "Share Capital" },
  savings: { txType: "savings", balanceField: "savingsBalance", direction: "credit", label: "Savings" },
  // Provident is a LOAN (members borrow, then repay monthly). Direction is
  // "debit" — each PROV deduction reduces the outstanding providentBalance.
  provident: { txType: "provident_loan_repayment", balanceField: "providentBalance", direction: "debit", label: "Provision Loan Repayment" },
  christmas: { txType: "christmas", balanceField: "christmasBalance", direction: "credit", label: "Christmas Savings" },
  realLoan: { txType: "real_loan_repayment", balanceField: "realLoanBalance", direction: "debit", label: "Real Loan Repayment", loanStatus: "real" },
  emergencyLoan: { txType: "emergency_loan_repayment", balanceField: "emergencyLoanBalance", direction: "debit", label: "Emergency Loan Repayment", loanStatus: "emergency" },
  electronics: { txType: "electronics_repayment", balanceField: "electronicsDebt", direction: "debit", label: "Electronics Repayment" },
  sElectronics: { txType: "s_electronics_repayment", balanceField: "sElectronicsDebt", direction: "debit", label: "Small Electronics Repayment" },
  furniture: { txType: "furniture_repayment", balanceField: "furnitureDebt", direction: "debit", label: "Furniture Repayment" },
  commodity: { txType: "commodity_repayment", balanceField: "commodityDebt", direction: "debit", label: "Commodity Repayment" },
  ghlForm: { txType: "ghl_form_repayment", balanceField: "ghlFormDebt", direction: "debit", label: "Loan Form Cost Repayment" },
  fire: { txType: "fire", balanceField: "fireFundBalance", direction: "credit", label: "Fire Fund Contribution" },
  fuelVenture: { txType: "fuel_venture_repayment", balanceField: "fuelVentureBalance", direction: "debit", label: "Fuel Venture Loan Repayment" },
  landLoan: { txType: "land_loan_repayment", balanceField: "landLoanBalance", direction: "debit", label: "Land Loan Repayment" },
};

export interface SheetSummary {
  name: string;
  rowCount: number;
  looksValid: boolean;
  detectedMonth?: string;
  detectedYear?: number;
}

const MONTH_NAMES: Record<string, string> = {
  jan: "January", january: "January",
  feb: "February", february: "February",
  mar: "March", march: "March",
  apr: "April", april: "April",
  may: "May",
  jun: "June", june: "June",
  jul: "July", july: "July",
  aug: "August", august: "August",
  sep: "September", sept: "September", september: "September",
  oct: "October", october: "October",
  nov: "November", november: "November",
  dec: "December", december: "December",
};

// Month-name regex fragment (full names and 3-letter abbreviations)
const MONTH_RE_FRAGMENT =
  "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";

// Primary: parse sheet name in the convention MONTHYEAR (e.g. "NOVEMBER2025").
// Accepts any separator (none, space, dash, underscore) between month and year.
const NAME_RE = new RegExp(
  `^.*?(${MONTH_RE_FRAGMENT})[\\s\\-_]*(\\d{4}).*$`,
  "i",
);

/**
 * Try to detect month+year from the sheet name first (convention: MONTHYEAR,
 * e.g. "NOVEMBER2025"). Returns null if the name doesn't match.
 */
export function detectMonthYearFromName(
  sheetName: string,
): { month: string; year: number } | null {
  const m = sheetName.match(NAME_RE);
  if (!m) return null;
  const fullMonth = MONTH_NAMES[m[1].toLowerCase()];
  if (!fullMonth) return null;
  const year = parseInt(m[2], 10);
  if (year < 2000 || year > 2100) return null;
  return { month: fullMonth, year };
}

/**
 * Scan the first 15 rows of a sheet's raw cell values for a month+year
 * combination (e.g. "November 2025", "NOV-25", "Nov 2025").
 * Used as a fallback when the sheet name doesn't follow the convention.
 */
export function detectMonthYear(
  rows: unknown[][],
): { month: string; year: number } | null {
  const scanRows = Math.min(rows.length, 15);
  const RE = new RegExp(
    `\\b(${MONTH_RE_FRAGMENT})[^a-z0-9]*(\\d{2,4})\\b`,
    "i",
  );

  for (let r = 0; r < scanRows; r++) {
    const row = rows[r];
    if (!row) continue;
    for (const cell of row) {
      if (cell == null) continue;
      const text = String(cell).trim();
      if (!text) continue;
      const m = text.match(RE);
      if (!m) continue;
      const monthKey = m[1].toLowerCase();
      const fullMonth = MONTH_NAMES[monthKey];
      if (!fullMonth) continue;
      let year = parseInt(m[2], 10);
      if (year < 100) year += year >= 50 ? 1900 : 2000;
      if (year < 2000 || year > 2100) continue;
      return { month: fullMonth, year };
    }
  }
  return null;
}

export function summarizeSheets(
  workbook: xlsx.WorkBook,
  organization: Organization = "faan",
): SheetSummary[] {
  const allowed = ORG_CATEGORIES[organization];
  return workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const rows: unknown[][] = xlsx.utils.sheet_to_json(sheet, {
      header: 1,
      defval: null,
      blankrows: false,
    });
    const header = detectHeader(rows, allowed);
    const dataRowCount = header
      ? Math.max(0, rows.length - header.headerRowIndex - 1)
      : 0;
    // Prefer sheet-name detection (NOVEMBER2025 convention); fall back to cell scan
    const detected = detectMonthYearFromName(name) ?? detectMonthYear(rows);
    return {
      name,
      rowCount: dataRowCount,
      looksValid: !!header,
      ...(detected ? { detectedMonth: detected.month, detectedYear: detected.year } : {}),
    };
  });
}
