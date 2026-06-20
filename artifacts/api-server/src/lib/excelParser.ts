import xlsx from "xlsx";
import { ObjectStorageService } from "./objectStorage";

export type DeductionCategory =
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
const UNIFIED_CATEGORIES: DeductionCategory[] = [
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
  savings: ["savings", "saving"],
  provident: ["prov", "provident"],
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
  fuelVenture: ["f/vent", "f vent", "fvent", "fuel vent", "fuel venture", "fuel-venture"],
  landLoan: ["land", "land loan", "land/loan"],
};

const NAME_HEADERS = ["name", "names", "member name", "full name"];
const SN_HEADERS = ["n/s", "s/n", "sn", "no", "no.", "#"];
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

    for (let c = 0; c < row.length; c++) {
      const h = normHeader(row[c]);
      if (!h) continue;
      if (c === nameCol) continue;
      if (SN_HEADERS.includes(h)) continue;

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
      return { headerRowIndex: r, nameCol, totalCol, categoryCols };
    }
  }
  return null;
}

export interface ParsedRow {
  rowNumber: number;
  rawName: string;
  amounts: Record<DeductionCategory, number>;
  total: number;
  computedTotal: number;
  totalMismatch: boolean;
  warnings: string[];
  errors: string[];
}

export interface ParsedSheet {
  sheetName: string;
  rows: ParsedRow[];
  detectedColumns: DeductionCategory[];
  headerRowIndex: number;
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
    };
  }

  const detectedColumns = Object.keys(header.categoryCols) as DeductionCategory[];
  const out: ParsedRow[] = [];

  for (let r = header.headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;

    const rawName = row[header.nameCol];
    if (rawName == null) continue;
    const nameStr = String(rawName).trim();
    if (!nameStr) continue;

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

    const amounts = emptyAmounts();
    for (const cat of detectedColumns) {
      const col = header.categoryCols[cat]!;
      amounts[cat] = toNumber(row[col]);
    }

    const computedTotal = ALL_CATEGORIES.reduce((a, c) => a + amounts[c], 0);
    const total = header.totalCol != null ? toNumber(row[header.totalCol]) : computedTotal;

    if (computedTotal === 0 && total === 0) continue;

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
  };
}

export async function downloadWorkbook(fileObjectPath: string): Promise<xlsx.WorkBook> {
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
    | "fire"
    | "fuel_venture_repayment"
    | "land_loan_repayment";
  balanceField: string;
  direction: "credit" | "debit";
  label: string;
  loanStatus?: "real" | "emergency";
}

export const CATEGORY_CONFIG: Record<DeductionCategory, CategoryConfig> = {
  savings: { txType: "savings", balanceField: "savingsBalance", direction: "credit", label: "Savings" },
  provident: { txType: "provident", balanceField: "providentBalance", direction: "credit", label: "Provision" },
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
    return {
      name,
      rowCount: dataRowCount,
      looksValid: !!header,
    };
  });
}
