/**
 * Fresh holistic migration — AACSMS
 *
 * Wipes old test data and rebuilds every member's record from:
 *   1. October 2025 balance sheets (FAAN/MEMBERS, NAMA, PENSIONERS, NON_STAFF)
 *   2. November 2025 payroll deductions (FAAN xlsx "476", NAMA from PDF data)
 *   3. December 2025 payroll deductions (FAAN xlsx, NAMA from PDF data, PENSIONERS xlsx)
 *
 * Split rule (user-approved): each monthly deduction pays down loans/debts first
 * (real loan → emergency → electronics → s-electronics → furniture → commodity
 *  → loan form → fuel venture → land), remainder credited to savings.
 *
 * Usage:
 *   node scripts/dist/migrate-fresh.mjs            # dry-run: report only, no DB writes
 *   node scripts/dist/migrate-fresh.mjs --apply    # wipe + write (target = DATABASE_URL)
 *
 * Dry-run writes .local/migration_report.md and .local/migration_report.json
 * at the workspace root.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import xlsx from "xlsx";
import {
  db,
  membersTable,
  transactionsTable,
  uploadRecordsTable,
  openingBalancesTable,
  openingBalanceImportsTable,
} from "@workspace/db";
import { sql, eq, and, isNull, isNotNull, or } from "drizzle-orm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function findRoot(start: string): string {
  let d = start;
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(d, "attached_assets"))) return d;
    d = path.dirname(d);
  }
  throw new Error("workspace root with attached_assets/ not found");
}
const ROOT = findRoot(__dirname);
const ASSETS = path.join(ROOT, "attached_assets");
const SCRIPTS_DIR = path.join(ROOT, "artifacts/api-server/scripts");
const APPLY = process.argv.includes("--apply");
const ALLOW_AMBIGUOUS_AS_NEW = process.argv.includes("--ambiguous-as-new");

// ── Category machinery ────────────────────────────────────────────────────────
type Cat =
  | "shares" | "savings" | "provident" | "christmas" | "fire"
  | "realLoan" | "emergencyLoan" | "electronics" | "sElectronics"
  | "furniture" | "commodity" | "ghlForm" | "fuelVenture" | "landLoan";

const BALANCE_FIELD: Record<Cat, string> = {
  shares: "sharesBalance",
  savings: "savingsBalance",
  provident: "providentBalance",
  christmas: "christmasBalance",
  fire: "fireFundBalance",
  realLoan: "realLoanBalance",
  emergencyLoan: "emergencyLoanBalance",
  electronics: "electronicsDebt",
  sElectronics: "sElectronicsDebt",
  furniture: "furnitureDebt",
  commodity: "commodityDebt",
  ghlForm: "ghlFormDebt",
  fuelVenture: "fuelVentureBalance",
  landLoan: "landLoanBalance",
};

// Matches CATEGORY_CONFIG in src/lib/excelParser.ts
const TX_TYPE: Record<string, { type: string; label: string }> = {
  savings: { type: "savings", label: "Savings" },
  realLoan: { type: "real_loan_repayment", label: "Real Loan Repayment" },
  emergencyLoan: { type: "emergency_loan_repayment", label: "Emergency Loan Repayment" },
  electronics: { type: "electronics_repayment", label: "Electronics Repayment" },
  sElectronics: { type: "s_electronics_repayment", label: "Small Electronics Repayment" },
  furniture: { type: "furniture_repayment", label: "Furniture Repayment" },
  commodity: { type: "commodity_repayment", label: "Commodity Repayment" },
  ghlForm: { type: "ghl_form_repayment", label: "Loan Form Cost Repayment" },
  fuelVenture: { type: "fuel_venture_repayment", label: "Fuel Venture Loan Repayment" },
  landLoan: { type: "land_loan_repayment", label: "Land Loan Repayment" },
};

/** Debt payoff priority; remainder of a deduction goes to savings. */
const DEBT_ORDER: Cat[] = [
  "realLoan", "emergencyLoan", "electronics", "sElectronics",
  "furniture", "commodity", "ghlForm", "fuelVenture", "landLoan",
];

// Balance-sheet header → category (headers normalised to A–Z only)
const HEADER_MAP: Record<string, Cat> = {
  SHARES: "shares",
  SAVINGS: "savings", SAVING: "savings",
  RLOAN: "realLoan", LOAN: "realLoan",
  PROV: "provident", PROVIDENT: "provident",
  ELECT: "electronics",
  FV: "fuelVenture", FVENT: "fuelVenture", FVENTURE: "fuelVenture",
  EMER: "emergencyLoan", EMERLOAN: "emergencyLoan",
  COMM: "commodity", COMMODITY: "commodity",
  FIRE: "fire",
  GHLF: "ghlForm", GHLFORM: "ghlForm",
  SELAND: "landLoan", // "S/E/LAND" — treated as land loan (flagged assumption)
  XMASS: "christmas", XMAS: "christmas",
};

// ── Small helpers ─────────────────────────────────────────────────────────────
const toKobo = (v: unknown): number => {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
const naira = (k: number) => (k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 });
const numStr = (k: number) => (k / 100).toFixed(2);
const normHeader = (s: unknown) => String(s ?? "").toUpperCase().replace(/[^A-Z]/g, "");
const normName = (s: string) =>
  s.toUpperCase().replace(/0/g, "O").replace(/[^A-Z]+/g, " ").replace(/\s+/g, " ").trim();
const tokensOf = (s: string) => normName(s).split(" ").filter(Boolean);

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 2) return 3;
  const dp = Array.from({ length: m + 1 }, (_, i) => i);
  for (let j = 1; j <= n; j++) {
    let prev = dp[0];
    dp[0] = j;
    for (let i = 1; i <= m; i++) {
      const tmp = dp[i];
      dp[i] = Math.min(dp[i] + 1, dp[i - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[m];
}

/** Similarity of two single tokens: 1 exact/typo, 0.75 prefix, 0.5 initial, 0 none. */
function tokenSim(a: string, b: string): number {
  if (a === b) return a.length === 1 ? 0.5 : 1;
  const min = Math.min(a.length, b.length);
  if (a.length === 1 || b.length === 1) {
    return min >= 1 && a[0] === b[0] ? 0.5 : 0;
  }
  const d = levenshtein(a, b);
  if (d <= 1 && min >= 5) return 1;
  if (d <= 2 && min >= 8) return 1;
  if ((a.startsWith(b) || b.startsWith(a)) && min >= 4 && Math.abs(a.length - b.length) <= 3) return 0.75;
  return 0;
}

/**
 * Name similarity score: greedy best-pair token matching.
 * Also handles one token being the concatenation of two tokens on the other
 * side (e.g. "OLUWAREMILEKUNJOYCE" = "OLUWAREMILEKUN" + "JOYCE") → 1.5.
 */
function nameScore(aTokens: string[], bTokens: string[]): number {
  const aUsed = new Array(aTokens.length).fill(false);
  const bUsed = new Array(bTokens.length).fill(false);
  let score = 0;

  // Concatenation handling (long tokens only)
  for (let i = 0; i < aTokens.length; i++) {
    if (aUsed[i] || aTokens[i].length < 8) continue;
    for (let j = 0; j < bTokens.length; j++) {
      if (bUsed[j]) continue;
      for (let k = 0; k < bTokens.length; k++) {
        if (k === j || bUsed[k]) continue;
        if (aTokens[i] === bTokens[j] + bTokens[k]) {
          aUsed[i] = true; bUsed[j] = true; bUsed[k] = true; score += 1.5;
        }
      }
    }
  }
  for (let j = 0; j < bTokens.length; j++) {
    if (bUsed[j] || bTokens[j].length < 8) continue;
    for (let i = 0; i < aTokens.length; i++) {
      if (aUsed[i]) continue;
      for (let k = 0; k < aTokens.length; k++) {
        if (k === i || aUsed[k]) continue;
        if (bTokens[j] === aTokens[i] + aTokens[k]) {
          bUsed[j] = true; aUsed[i] = true; aUsed[k] = true; score += 1.5;
        }
      }
    }
  }

  // Greedy best-pair matching
  for (;;) {
    let best = 0, bi = -1, bj = -1;
    for (let i = 0; i < aTokens.length; i++) {
      if (aUsed[i]) continue;
      for (let j = 0; j < bTokens.length; j++) {
        if (bUsed[j]) continue;
        const s = tokenSim(aTokens[i], bTokens[j]);
        if (s > best) { best = s; bi = i; bj = j; }
      }
    }
    if (best <= 0) break;
    aUsed[bi] = true; bUsed[bj] = true; score += best;
  }
  return score;
}

// ── Balance sheet parsing ─────────────────────────────────────────────────────
type BalanceRow = { name: string; balances: Partial<Record<Cat, number>>; sheetRow: number };

function parseBalanceSheet(file: string): {
  rows: BalanceRow[]; skippedUnnamed: number; headerCats: Cat[];
} {
  const wb = xlsx.readFile(path.join(ASSETS, file));
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const grid: unknown[][] = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: null });

  let headerIdx = -1;
  for (let i = 0; i < Math.min(grid.length, 10); i++) {
    if ((grid[i] || []).some((c) => normHeader(c).includes("NAME"))) { headerIdx = i; break; }
  }
  if (headerIdx < 0) throw new Error(`${file}: header row with NAME not found`);

  const header = grid[headerIdx] || [];
  let nameCol = -1;
  const colCat = new Map<number, Cat>();
  for (let c = 0; c < header.length; c++) {
    const h = normHeader(header[c]);
    if (!h) continue;
    if (h.includes("NAME")) { nameCol = c; continue; }
    const cat = HEADER_MAP[h];
    if (cat) colCat.set(c, cat);
  }
  if (nameCol < 0) throw new Error(`${file}: NAME column not found`);

  const rows: BalanceRow[] = [];
  let skippedUnnamed = 0;
  for (let r = headerIdx + 1; r < grid.length; r++) {
    const row = grid[r] || [];
    const rawName = row[nameCol];
    const hasValues = [...colCat.keys()].some((c) => toKobo(row[c]) !== 0);
    if (rawName == null || String(rawName).trim() === "") {
      if (hasValues) skippedUnnamed++;
      continue;
    }
    const nm = String(rawName).trim();
    if (/^(GRAND\s*)?TOTALS?$/i.test(normName(nm))) continue;
    const balances: Partial<Record<Cat, number>> = {};
    for (const [c, cat] of colCat) balances[cat] = toKobo(row[c]);
    rows.push({ name: nm, balances, sheetRow: r + 1 });
  }
  return { rows, skippedUnnamed, headerCats: [...colCat.values()] };
}

// ── Payroll xlsx parsing ──────────────────────────────────────────────────────
type PayrollEntry = { employeeNo: string; name: string; amount: number };

function parsePayrollXlsx(file: string): { entries: PayrollEntry[]; total: number; dupNos: string[] } {
  const wb = xlsx.readFile(path.join(ASSETS, file));
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const grid: unknown[][] = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: null });

  let headerIdx = -1, noCol = -1, nameCol = -1, amtCol = -1;
  for (let i = 0; i < Math.min(grid.length, 10); i++) {
    const row = grid[i] || [];
    const no = row.findIndex((c) => /NO$/.test(normHeader(c)) && /(EMPLOYEE|PENSIONER|STAFF)/.test(normHeader(c)));
    const nm = row.findIndex((c) => normHeader(c).includes("NAME"));
    const am = row.findIndex((c) => normHeader(c).includes("AMOUNT"));
    if (no >= 0 && nm >= 0 && am >= 0) { headerIdx = i; noCol = no; nameCol = nm; amtCol = am; break; }
  }
  if (headerIdx < 0) throw new Error(`${file}: payroll header row not found`);

  const byNo = new Map<string, PayrollEntry>();
  const dupNos: string[] = [];
  for (let r = headerIdx + 1; r < grid.length; r++) {
    const row = grid[r] || [];
    const rawNo = row[noCol];
    const rawName = row[nameCol];
    const amount = toKobo(row[amtCol]);
    const nameStr = String(rawName ?? "").trim();
    if (/GRAND\s*TOTAL/i.test(nameStr) || /GRAND\s*TOTAL/i.test(String(rawNo ?? ""))) continue;
    if (rawNo == null || String(rawNo).trim() === "" || nameStr === "" || amount <= 0) continue;
    const no = String(rawNo).trim();
    const existing = byNo.get(no);
    if (existing) { existing.amount += amount; dupNos.push(no); }
    else byNo.set(no, { employeeNo: no, name: nameStr.replace(/\s*,\s*/g, " ").replace(/\s+/g, " ").trim(), amount });
  }
  const entries = [...byNo.values()];
  return { entries, total: entries.reduce((s, e) => s + e.amount, 0), dupNos };
}

// ── Data sources ──────────────────────────────────────────────────────────────
const FILES = {
  FAAN_BAL: "MEMBERS_OCTOBER_BALANCES_1783194509728.xlsx",
  NAMA_BAL: "NAMA_OCTOBER_BALANCES_1783194509690.xlsx",
  PENS_BAL: "PENSIONERS_OCTOBER_BALANCES_1783194509516.xlsx",
  NS_BAL: "NON_STAFF_OCTOBER_BALANCES_1783194509760.xlsx",
  FAAN_NOV: "476_1783194509864.xlsx",
  FAAN_DEC: "Code_476_December_2025_Download_1783194509811.xlsx",
  PENS_DEC: "December_2025_Code_005511_CTAKR_Pension_Deduction_Download_1783194509837.xlsx",
};

type Org = "FAAN" | "NAMA" | "PENSIONERS" | "NON_STAFF";
type Month = "November" | "December";

type RosterEntry = {
  org: Org;
  name: string;            // display / stored full name
  balanceName: string | null;
  employeeNo: string | null;
  oct: Partial<Record<Cat, number>>;   // October opening (kobo)
  deductions: Partial<Record<Month, number>>; // kobo
  final?: Record<string, number>;
  txs?: { month: Month; cat: Cat; amount: number; source: string }[];
  linkedMemberId?: number;
  linkedMemberName?: string;
};

type Ambiguity = { org: Org; payrollName: string; employeeNo: string; candidates: { name: string; score: number }[] };

// overrides: { "FAAN:000123": "EXACT BALANCE SHEET NAME" | "NEW", "LINK:4": "ROSTER FULL NAME" | "NONE" }
function loadOverrides(): Record<string, string> {
  const f = path.join(SCRIPTS_DIR, "data", "migration-overrides.json");
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : {};
}

// ── Matching payroll → balance rows ──────────────────────────────────────────
type MatchOutput = {
  matched: Map<number, { employeeNo: string; name: string; amounts: Partial<Record<Month, number>> }>;
  newPersons: { employeeNo: string; name: string; amounts: Partial<Record<Month, number>> }[];
  overrideApplied: string[];
  lowConfidence: { payrollName: string; employeeNo: string; balanceName: string; score: number }[];
};

function matchPayroll(
  org: Org,
  payroll: { employeeNo: string; name: string; amounts: Partial<Record<Month, number>> }[],
  balRows: BalanceRow[],
  overrides: Record<string, string>,
  ambiguities: Ambiguity[],
): MatchOutput {
  const balTokens = balRows.map((b) => tokensOf(b.name));
  const forcedNew = new Set<number>();
  const overrideApplied: string[] = [];
  const bTaken = new Map<number, number>(); // bIdx -> pIdx
  const pTaken = new Set<number>();
  const matched: MatchOutput["matched"] = new Map();
  const lowConfidence: MatchOutput["lowConfidence"] = [];

  // 1. Overrides first
  payroll.forEach((p, pIdx) => {
    const ov = overrides[`${org}:${p.employeeNo}`];
    if (ov === "NEW") { forcedNew.add(pIdx); overrideApplied.push(`${org}:${p.employeeNo} → NEW`); return; }
    if (ov) {
      const bIdx = balRows.findIndex((b) => normName(b.name) === normName(ov));
      if (bIdx < 0) throw new Error(`Override ${org}:${p.employeeNo} → "${ov}" not found in balance sheet`);
      if (bTaken.has(bIdx)) throw new Error(`Override conflict: two payroll persons forced to "${balRows[bIdx].name}"`);
      bTaken.set(bIdx, pIdx);
      pTaken.add(pIdx);
      matched.set(bIdx, p);
      overrideApplied.push(`${org}:${p.employeeNo} → "${balRows[bIdx].name}"`);
    }
  });

  // 2. Score all remaining pairs
  const scoresByP = payroll.map((p, pIdx) => {
    if (pTaken.has(pIdx) || forcedNew.has(pIdx)) return [];
    const pTok = tokensOf(p.name);
    return balTokens
      .map((bt, bIdx) => ({ bIdx, score: nameScore(pTok, bt) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);
  });

  // 3. Strict greedy pass (score >= 2), highest first; ties resolved only
  //    when all-but-one tie candidates are already taken.
  const order = payroll
    .map((_, pIdx) => pIdx)
    .filter((i) => !pTaken.has(i) && !forcedNew.has(i) && scoresByP[i].length > 0)
    .sort((a, b) => (scoresByP[b][0]?.score ?? 0) - (scoresByP[a][0]?.score ?? 0));
  for (const pIdx of order) {
    const avail = scoresByP[pIdx].filter((x) => x.score >= 2 && !bTaken.has(x.bIdx));
    if (avail.length === 0) continue;
    const best = avail[0];
    const ties = avail.filter((x) => x.score === best.score);
    if (ties.length > 1) {
      ambiguities.push({
        org, payrollName: payroll[pIdx].name, employeeNo: payroll[pIdx].employeeNo,
        candidates: ties.slice(0, 5).map((t) => ({ name: balRows[t.bIdx].name, score: t.score })),
      });
      continue;
    }
    bTaken.set(best.bIdx, pIdx);
    pTaken.add(pIdx);
    matched.set(best.bIdx, payroll[pIdx]);
  }

  // 4. Low-confidence mutual-best pass on the leftovers. Pensioner sheets are
  //    initials/typo-heavy and near-bijective with the payroll file, so a
  //    lower threshold is safe there; elsewhere require 1.5.
  const threshold = org === "PENSIONERS" || org === "NAMA" ? 1.0 : 1.5;
  const ambiguousNos = new Set(ambiguities.filter((a) => a.org === org).map((a) => a.employeeNo));
  for (;;) {
    let progress = false;
    for (let pIdx = 0; pIdx < payroll.length; pIdx++) {
      if (pTaken.has(pIdx) || forcedNew.has(pIdx) || ambiguousNos.has(payroll[pIdx].employeeNo)) continue;
      const avail = scoresByP[pIdx].filter((x) => x.score >= threshold && !bTaken.has(x.bIdx));
      if (avail.length === 0) continue;
      const best = avail[0];
      if (avail.length > 1 && avail[1].score === best.score) continue; // not unique
      // mutual: is this payroll person also the best remaining claimant of that balance row?
      let mutual = true;
      for (let q = 0; q < payroll.length; q++) {
        if (q === pIdx || pTaken.has(q) || forcedNew.has(q)) continue;
        const qs = scoresByP[q].find((x) => x.bIdx === best.bIdx);
        if (qs && qs.score > best.score) { mutual = false; break; }
      }
      if (!mutual) continue;
      bTaken.set(best.bIdx, pIdx);
      pTaken.add(pIdx);
      matched.set(best.bIdx, payroll[pIdx]);
      lowConfidence.push({
        payrollName: payroll[pIdx].name, employeeNo: payroll[pIdx].employeeNo,
        balanceName: balRows[best.bIdx].name, score: best.score,
      });
      progress = true;
    }
    if (!progress) break;
  }

  const newPersons = payroll.filter(
    (p, i) => !pTaken.has(i) && (forcedNew.has(i) || !ambiguousNos.has(p.employeeNo)),
  );
  return { matched, newPersons, overrideApplied, lowConfidence };
}

// ── Deduction split rule ──────────────────────────────────────────────────────
function applyDeductions(entry: RosterEntry, sourceByMonth: Partial<Record<Month, string>>) {
  const w: Record<string, number> = {};
  for (const cat of Object.keys(BALANCE_FIELD) as Cat[]) w[cat] = entry.oct[cat] ?? 0;
  const txs: NonNullable<RosterEntry["txs"]> = [];

  for (const month of ["November", "December"] as Month[]) {
    let remaining = entry.deductions[month] ?? 0;
    if (remaining <= 0) continue;
    for (const cat of DEBT_ORDER) {
      if (remaining <= 0) break;
      const owe = w[cat];
      if (owe <= 0) continue;
      const pay = Math.min(owe, remaining);
      w[cat] -= pay;
      remaining -= pay;
      txs.push({ month, cat, amount: pay, source: sourceByMonth[month]! });
    }
    if (remaining > 0) {
      w.savings += remaining;
      txs.push({ month, cat: "savings", amount: remaining, source: sourceByMonth[month]! });
    }
  }
  entry.final = w;
  entry.txs = txs;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const overrides = loadOverrides();
  const ambiguities: Ambiguity[] = [];
  const report: string[] = [];
  const push = (s: string) => { report.push(s); console.log(s); };

  push(`# Fresh migration ${APPLY ? "APPLY" : "DRY-RUN"} — ${new Date().toISOString()}`);

  // 1. Balance sheets
  const faanBal = parseBalanceSheet(FILES.FAAN_BAL);
  const namaBal = parseBalanceSheet(FILES.NAMA_BAL);
  const pensBal = parseBalanceSheet(FILES.PENS_BAL);
  const nsBal = parseBalanceSheet(FILES.NS_BAL);
  push(`\n## October 2025 balance sheets`);
  for (const [org, b] of [["FAAN", faanBal], ["NAMA", namaBal], ["PENSIONERS", pensBal], ["NON_STAFF", nsBal]] as const) {
    push(`- ${org}: ${b.rows.length} named rows (skipped ${b.skippedUnnamed} unnamed rows with values); columns: ${b.headerCats.join(", ")}`);
    const names = new Map<string, number>();
    for (const r of b.rows) names.set(normName(r.name), (names.get(normName(r.name)) ?? 0) + 1);
    const dups = [...names].filter(([, n]) => n > 1);
    if (dups.length) push(`  - DUPLICATE names in sheet: ${dups.map(([n, c]) => `${n} ×${c}`).join("; ")}`);
  }

  // 2. Payrolls
  const faanNov = parsePayrollXlsx(FILES.FAAN_NOV);
  const faanDec = parsePayrollXlsx(FILES.FAAN_DEC);
  const pensDec = parsePayrollXlsx(FILES.PENS_DEC);
  const namaJson = JSON.parse(
    fs.readFileSync(path.join(SCRIPTS_DIR, "data", "nama-deductions.json"), "utf8"),
  ) as { roster: { employeeNo: string; name: string; novAmount: number; decAmount: number }[] };

  push(`\n## Payroll deduction files`);
  push(`- FAAN November ("476"): ${faanNov.entries.length} rows, total ₦${naira(faanNov.total)}${faanNov.dupNos.length ? ` (merged dup emp nos: ${faanNov.dupNos.join(", ")})` : ""}`);
  push(`- FAAN December: ${faanDec.entries.length} rows, total ₦${naira(faanDec.total)}${faanDec.dupNos.length ? ` (merged dup emp nos: ${faanDec.dupNos.join(", ")})` : ""}`);
  push(`- NAMA November (PDF): ${namaJson.roster.filter((r) => r.novAmount > 0).length} payers, total ₦${naira(namaJson.roster.reduce((s, r) => s + r.novAmount, 0) * 100)}`);
  push(`- NAMA December (PDF): ${namaJson.roster.filter((r) => r.decAmount > 0).length} payers, total ₦${naira(namaJson.roster.reduce((s, r) => s + r.decAmount, 0) * 100)}`);
  push(`- PENSIONERS December: ${pensDec.entries.length} rows, total ₦${naira(pensDec.total)}`);

  // 3. Unify payroll persons per org (keyed by employeeNo)
  const faanPersons = new Map<string, { employeeNo: string; name: string; amounts: Partial<Record<Month, number>> }>();
  for (const e of faanNov.entries) faanPersons.set(e.employeeNo, { employeeNo: e.employeeNo, name: e.name, amounts: { November: e.amount } });
  for (const e of faanDec.entries) {
    const ex = faanPersons.get(e.employeeNo);
    if (ex) { ex.amounts.December = e.amount; ex.name = e.name; }
    else faanPersons.set(e.employeeNo, { employeeNo: e.employeeNo, name: e.name, amounts: { December: e.amount } });
  }
  const namaPersons = namaJson.roster.map((r) => ({
    employeeNo: r.employeeNo,
    name: r.name.replace(/\s*,\s*/g, " ").replace(/\s+/g, " ").trim(),
    amounts: {
      ...(r.novAmount > 0 ? { November: Math.round(r.novAmount * 100) } : {}),
      ...(r.decAmount > 0 ? { December: Math.round(r.decAmount * 100) } : {}),
    } as Partial<Record<Month, number>>,
  }));
  const pensPersons = pensDec.entries.map((e) => ({ employeeNo: e.employeeNo, name: e.name, amounts: { December: e.amount } as Partial<Record<Month, number>> }));

  // 4. Match payroll persons to balance rows
  const faanMatch = matchPayroll("FAAN", [...faanPersons.values()], faanBal.rows, overrides, ambiguities);
  const namaMatch = matchPayroll("NAMA", namaPersons, namaBal.rows, overrides, ambiguities);
  const pensMatch = matchPayroll("PENSIONERS", pensPersons, pensBal.rows, overrides, ambiguities);

  push(`\n## Payroll ↔ balance-sheet matching`);
  push(`- FAAN: ${faanMatch.matched.size}/${faanPersons.size} payroll persons matched; ${faanMatch.newPersons.length} new (payroll-only); ${ambiguities.filter((a) => a.org === "FAAN").length} ambiguous`);
  push(`- NAMA: ${namaMatch.matched.size}/${namaPersons.length} matched; ${namaMatch.newPersons.length} new; ${ambiguities.filter((a) => a.org === "NAMA").length} ambiguous`);
  push(`- PENSIONERS: ${pensMatch.matched.size}/${pensPersons.length} matched; ${pensMatch.newPersons.length} new; ${ambiguities.filter((a) => a.org === "PENSIONERS").length} ambiguous`);
  for (const ap of [...faanMatch.overrideApplied, ...namaMatch.overrideApplied, ...pensMatch.overrideApplied]) push(`  - override applied: ${ap}`);
  const allLowConf = [
    ...faanMatch.lowConfidence.map((l) => ({ org: "FAAN" as Org, ...l })),
    ...namaMatch.lowConfidence.map((l) => ({ org: "NAMA" as Org, ...l })),
    ...pensMatch.lowConfidence.map((l) => ({ org: "PENSIONERS" as Org, ...l })),
  ];
  if (allLowConf.length) {
    push(`\n### Low-confidence matches (review these; force apart with "<ORG>:<empNo>": "NEW" if wrong)`);
    for (const l of allLowConf) push(`- [${l.org}:${l.employeeNo}] payroll "${l.payrollName}" ↔ balance "${l.balanceName}" (score ${l.score})`);
  }

  // 5. Build roster
  const roster: RosterEntry[] = [];
  const buildOrg = (
    org: Org,
    balRows: BalanceRow[],
    matched: Map<number, { employeeNo: string; name: string; amounts: Partial<Record<Month, number>> }>,
    newPersons: { employeeNo: string; name: string; amounts: Partial<Record<Month, number>> }[],
  ) => {
    balRows.forEach((b, i) => {
      const p = matched.get(i);
      roster.push({
        org,
        name: p ? p.name : b.name,
        balanceName: b.name,
        employeeNo: p?.employeeNo ?? null,
        oct: b.balances,
        deductions: p?.amounts ?? {},
      });
    });
    for (const p of newPersons) {
      roster.push({ org, name: p.name, balanceName: null, employeeNo: p.employeeNo, oct: {}, deductions: p.amounts });
    }
  };
  buildOrg("FAAN", faanBal.rows, faanMatch.matched, faanMatch.newPersons);
  buildOrg("NAMA", namaBal.rows, namaMatch.matched, namaMatch.newPersons);
  buildOrg("PENSIONERS", pensBal.rows, pensMatch.matched, pensMatch.newPersons);
  buildOrg("NON_STAFF", nsBal.rows, new Map(), []);

  // 6. Apply split rule
  const SOURCE: Record<Org, Partial<Record<Month, string>>> = {
    FAAN: { November: "FAAN_NOV", December: "FAAN_DEC" },
    NAMA: { November: "NAMA_NOV", December: "NAMA_DEC" },
    PENSIONERS: { December: "PENS_DEC" },
    NON_STAFF: {},
  };
  for (const e of roster) applyDeductions(e, SOURCE[e.org]);

  // Conservation check
  for (const e of roster) {
    for (const month of ["November", "December"] as Month[]) {
      const d = e.deductions[month] ?? 0;
      const applied = (e.txs ?? []).filter((t) => t.month === month).reduce((s, t) => s + t.amount, 0);
      if (d !== applied) throw new Error(`Conservation failed for ${e.org}/${e.name} ${month}: ${d} vs ${applied}`);
    }
  }

  // 7. Aggregates
  push(`\n## Roster summary (to be written)`);
  push(`- Total member records: ${roster.length}`);
  for (const org of ["FAAN", "NAMA", "PENSIONERS", "NON_STAFF"] as Org[]) {
    const rs = roster.filter((r) => r.org === org);
    push(`- ${org}: ${rs.length} members (${rs.filter((r) => r.balanceName).length} from balance sheet, ${rs.filter((r) => !r.balanceName).length} payroll-only)`);
  }
  const sumField = (f: Cat, when: "oct" | "final") =>
    roster.reduce((s, r) => s + (when === "oct" ? r.oct[f] ?? 0 : r.final![f] ?? 0), 0);
  push(`\n| Category | Oct total | Final (Dec) total |`);
  push(`|---|---|---|`);
  for (const cat of Object.keys(BALANCE_FIELD) as Cat[]) {
    push(`| ${cat} | ₦${naira(sumField(cat, "oct"))} | ₦${naira(sumField(cat, "final"))} |`);
  }
  const totalTx = roster.reduce((s, r) => s + (r.txs?.length ?? 0), 0);
  const totalDeducted = roster.reduce((s, r) => s + Object.values(r.deductions).reduce((a, b) => a + (b ?? 0), 0), 0);
  push(`\n- Transactions to create: ${totalTx}`);
  push(`- Total deductions applied (Nov+Dec): ₦${naira(totalDeducted)}`);
  const toSavings = roster.reduce((s, r) => s + (r.txs ?? []).filter((t) => t.cat === "savings").reduce((a, t) => a + t.amount, 0), 0);
  push(`- → to savings: ₦${naira(toSavings)}; → to loan/debt repayment: ₦${naira(totalDeducted - toSavings)}`);

  // 8. Link registered clerk accounts
  const kept = await db
    .select({ id: membersTable.id, fullName: membersTable.fullName, role: membersTable.role, clerkUserId: membersTable.clerkUserId, pendingClerkUserId: membersTable.pendingClerkUserId })
    .from(membersTable)
    .where(or(isNotNull(membersTable.clerkUserId), isNotNull(membersTable.pendingClerkUserId)));
  push(`\n## Registered accounts (kept through wipe): ${kept.length}`);
  const rosterTokens = roster.map((r) => ({ a: tokensOf(r.name), b: r.balanceName ? tokensOf(r.balanceName) : null }));
  for (const m of kept) {
    const ov = overrides[`LINK:${m.id}`];
    let target: RosterEntry | undefined;
    if (ov === "NONE") {
      push(`- #${m.id} ${m.fullName} (${m.role}): override → NOT linked (balances reset to 0)`);
      continue;
    } else if (ov) {
      target = roster.find((r) => normName(r.name) === normName(ov) || (r.balanceName && normName(r.balanceName) === normName(ov)));
      if (!target) throw new Error(`LINK:${m.id} override "${ov}" not found in roster`);
    } else {
      const mt = tokensOf(m.fullName);
      const scored = roster
        .map((r, i) => ({ i, score: Math.max(nameScore(mt, rosterTokens[i].a), rosterTokens[i].b ? nameScore(mt, rosterTokens[i].b!) : 0) }))
        .filter((x) => x.score >= 2)
        .sort((x, y) => y.score - x.score);
      if (scored.length && (scored.length === 1 || scored[0].score > scored[1].score)) target = roster[scored[0].i];
      else if (scored.length > 1) {
        push(`- #${m.id} ${m.fullName} (${m.role}): AMBIGUOUS roster match — top: ${scored.slice(0, 3).map((s) => roster[s.i].name).join(" | ")} → resolve with "LINK:${m.id}" override; for now NOT linked`);
        continue;
      }
    }
    if (target) {
      if (target.linkedMemberId) throw new Error(`Roster entry "${target.name}" linked twice`);
      target.linkedMemberId = m.id;
      target.linkedMemberName = m.fullName;
      push(`- #${m.id} ${m.fullName} (${m.role}): linked → "${target.name}" [${target.org}${target.employeeNo ? ", " + target.employeeNo : ""}] final savings ₦${naira(target.final!.savings)}`);
    } else {
      push(`- #${m.id} ${m.fullName} (${m.role}): no roster match — kept with zeroed balances`);
    }
  }

  // 9. Ambiguities
  push(`\n## Ambiguous payroll matches: ${ambiguities.length}`);
  for (const a of ambiguities) {
    push(`- [${a.org}:${a.employeeNo}] "${a.payrollName}" → candidates: ${a.candidates.map((c) => `${c.name} (${c.score})`).join(" | ")}`);
  }
  if (ambiguities.length) {
    push(`\nResolve via scripts/data/migration-overrides.json ("${ambiguities[0].org}:${ambiguities[0].employeeNo}": "<exact balance name>" or "NEW").`);
    push(ALLOW_AMBIGUOUS_AS_NEW
      ? `--ambiguous-as-new set: ambiguous persons will be created as NEW members with payroll-only balances.`
      : `Apply will REFUSE while unresolved ambiguities remain (unless --ambiguous-as-new).`);
  }

  // Ambiguous persons currently excluded from roster: with flag, add as new
  if (ALLOW_AMBIGUOUS_AS_NEW) {
    const allPersons: Record<Org, { employeeNo: string; name: string; amounts: Partial<Record<Month, number>> }[]> = {
      FAAN: [...faanPersons.values()], NAMA: namaPersons, PENSIONERS: pensPersons, NON_STAFF: [],
    };
    for (const a of ambiguities) {
      const p = allPersons[a.org].find((x) => x.employeeNo === a.employeeNo);
      if (!p) continue;
      const e: RosterEntry = { org: a.org, name: p.name, balanceName: null, employeeNo: p.employeeNo, oct: {}, deductions: p.amounts };
      applyDeductions(e, SOURCE[a.org]);
      roster.push(e);
    }
  }

  // 10. Write report files
  const detail = {
    generatedAt: new Date().toISOString(),
    apply: APPLY,
    ambiguities,
    roster: roster.map((r) => ({
      org: r.org, name: r.name, balanceName: r.balanceName, employeeNo: r.employeeNo,
      linkedMemberId: r.linkedMemberId ?? null,
      oct: Object.fromEntries(Object.entries(r.oct).map(([k, v]) => [k, numStr(v as number)])),
      deductions: Object.fromEntries(Object.entries(r.deductions).map(([k, v]) => [k, numStr(v as number)])),
      final: Object.fromEntries(Object.entries(r.final!).filter(([, v]) => v !== 0).map(([k, v]) => [k, numStr(v as number)])),
      txs: (r.txs ?? []).map((t) => ({ month: t.month, cat: t.cat, amount: numStr(t.amount) })),
    })),
  };
  fs.mkdirSync(path.join(ROOT, ".local"), { recursive: true });
  fs.writeFileSync(path.join(ROOT, ".local/migration_report.md"), report.join("\n"));
  fs.writeFileSync(path.join(ROOT, ".local/migration_report.json"), JSON.stringify(detail, null, 1));
  console.log(`\nReport written to .local/migration_report.md and .local/migration_report.json`);

  if (!APPLY) {
    console.log(`\nDRY-RUN complete. No database writes performed.`);
    return;
  }

  // ── APPLY ───────────────────────────────────────────────────────────────────
  if (ambiguities.length && !ALLOW_AMBIGUOUS_AS_NEW) {
    throw new Error(`Refusing to apply: ${ambiguities.length} unresolved ambiguous matches. Resolve via overrides.`);
  }

  console.log(`\nAPPLYING to database…`);
  await db.transaction(async (tx) => {
    // Wipe
    await tx.delete(transactionsTable);
    await tx.delete(uploadRecordsTable);
    await tx.delete(openingBalanceImportsTable);
    await tx.delete(openingBalancesTable);

    // Delete rows in any table referencing members that we are about to delete
    const fks = await tx.execute<{ table_name: string; column_name: string }>(sql`
      SELECT tc.table_name, kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND ccu.table_name = 'members' AND ccu.column_name = 'id'
        AND tc.table_schema = 'public'
    `);
    const victimCond = `clerk_user_id IS NULL AND pending_clerk_user_id IS NULL`;
    for (const fk of fks.rows as any[]) {
      if (["transactions", "upload_records", "opening_balances", "opening_balance_imports"].includes(fk.table_name)) continue;
      const res = await tx.execute(sql.raw(
        `DELETE FROM "${fk.table_name}" WHERE "${fk.column_name}" IN (SELECT id FROM members WHERE ${victimCond})`,
      ));
      if ((res as any).rowCount) console.log(`  cleaned ${(res as any).rowCount} rows from ${fk.table_name}.${fk.column_name}`);
    }
    const del = await tx.execute(sql.raw(`DELETE FROM members WHERE ${victimCond}`));
    console.log(`  deleted ${(del as any).rowCount} old member rows`);

    // Reset kept members
    await tx.execute(sql.raw(`
      UPDATE members SET
        shares_balance=0, savings_balance=0, provident_balance=0, christmas_balance=0,
        real_loan_balance=0, emergency_loan_balance=0, total_loan_balance=0,
        electronics_debt=0, s_electronics_debt=0, furniture_debt=0, commodity_debt=0,
        ghl_form_debt=0, fire_fund_balance=0, fuel_venture_balance=0, land_loan_balance=0,
        total_store_debt=0, employee_no=NULL,
        ob_shares_balance=NULL, ob_savings_balance=NULL, ob_provident_balance=NULL,
        ob_christmas_balance=NULL, ob_real_loan_balance=NULL, ob_emergency_loan_balance=NULL,
        ob_total_loan_balance=NULL, ob_electronics_debt=NULL, ob_s_electronics_debt=NULL,
        ob_furniture_debt=NULL, ob_commodity_debt=NULL, ob_ghl_form_debt=NULL,
        ob_fire_fund_balance=NULL, ob_fuel_venture_balance=NULL, ob_land_loan_balance=NULL,
        ob_total_store_debt=NULL, ob_uploaded_at=NULL
      WHERE NOT (${victimCond})
    `));

    // Upload records for the 3 payroll sources ×
    const [uploader] = await tx
      .select({ id: membersTable.id })
      .from(membersTable)
      .where(eq(membersTable.role, "super_admin"))
      .limit(1);
    const uploaderId = uploader?.id ?? kept.find((k) => k.role === "admin")?.id;
    if (!uploaderId) throw new Error("No super_admin/admin member found to own upload records");

    const uploadDefs: Record<string, { month: Month; year: number; organization: string; file: string }> = {
      FAAN_NOV: { month: "November", year: 2025, organization: "FAAN", file: FILES.FAAN_NOV },
      FAAN_DEC: { month: "December", year: 2025, organization: "FAAN", file: FILES.FAAN_DEC },
      NAMA_NOV: { month: "November", year: 2025, organization: "NAMA", file: "NAMA_November_2025_Analysis_Report.pdf" },
      NAMA_DEC: { month: "December", year: 2025, organization: "NAMA", file: "NAMA_December_2025_Analysis_Report.pdf" },
      PENS_DEC: { month: "December", year: 2025, organization: "PENSIONERS", file: FILES.PENS_DEC },
    };
    const uploadIds: Record<string, number> = {};
    for (const [key, d] of Object.entries(uploadDefs)) {
      const rows = roster.filter((r) => (r.txs ?? []).some((t) => t.source === key)).length;
      const [rec] = await tx.insert(uploadRecordsTable).values({
        uploadedBy: uploaderId,
        month: d.month,
        year: d.year,
        organization: d.organization,
        fileObjectPath: `migration/${d.file}`,
        rowsProcessed: rows,
        rowsSkipped: 0,
        status: "processed",
      }).returning({ id: uploadRecordsTable.id });
      uploadIds[key] = rec.id;
    }

    // Member values builder
    const now = new Date();
    const memberValues = (r: RosterEntry) => {
      const f = r.final!;
      const octOr0 = (c: Cat) => r.oct[c] ?? 0;
      const hasOct = r.balanceName != null;
      return {
        fullName: r.name,
        organization: r.org,
        employeeNo: r.employeeNo,
        sharesBalance: numStr(f.shares),
        savingsBalance: numStr(f.savings),
        providentBalance: numStr(f.provident),
        christmasBalance: numStr(f.christmas),
        realLoanBalance: numStr(f.realLoan),
        emergencyLoanBalance: numStr(f.emergencyLoan),
        totalLoanBalance: numStr(f.realLoan + f.emergencyLoan),
        electronicsDebt: numStr(f.electronics),
        sElectronicsDebt: numStr(f.sElectronics),
        furnitureDebt: numStr(f.furniture),
        commodityDebt: numStr(f.commodity),
        ghlFormDebt: numStr(f.ghlForm),
        fireFundBalance: numStr(f.fire),
        fuelVentureBalance: numStr(f.fuelVenture),
        landLoanBalance: numStr(f.landLoan),
        totalStoreDebt: numStr(f.electronics + f.sElectronics + f.commodity + f.ghlForm),
        obSharesBalance: hasOct ? numStr(octOr0("shares")) : null,
        obSavingsBalance: hasOct ? numStr(octOr0("savings")) : null,
        obProvidentBalance: hasOct ? numStr(octOr0("provident")) : null,
        obChristmasBalance: hasOct ? numStr(octOr0("christmas")) : null,
        obRealLoanBalance: hasOct ? numStr(octOr0("realLoan")) : null,
        obEmergencyLoanBalance: hasOct ? numStr(octOr0("emergencyLoan")) : null,
        obTotalLoanBalance: hasOct ? numStr(octOr0("realLoan") + octOr0("emergencyLoan")) : null,
        obElectronicsDebt: hasOct ? numStr(octOr0("electronics")) : null,
        obSElectronicsDebt: hasOct ? numStr(octOr0("sElectronics")) : null,
        obFurnitureDebt: hasOct ? numStr(octOr0("furniture")) : null,
        obCommodityDebt: hasOct ? numStr(octOr0("commodity")) : null,
        obGhlFormDebt: hasOct ? numStr(octOr0("ghlForm")) : null,
        obFireFundBalance: hasOct ? numStr(octOr0("fire")) : null,
        obFuelVentureBalance: hasOct ? numStr(octOr0("fuelVenture")) : null,
        obLandLoanBalance: hasOct ? numStr(octOr0("landLoan")) : null,
        obTotalStoreDebt: hasOct
          ? numStr(octOr0("electronics") + octOr0("sElectronics") + octOr0("commodity") + octOr0("ghlForm"))
          : null,
        obUploadedAt: hasOct ? now : null,
      };
    };

    // Linked (registered) members: update in place
    let linkedCount = 0;
    for (const r of roster) {
      if (!r.linkedMemberId) continue;
      await tx.update(membersTable).set(memberValues(r)).where(eq(membersTable.id, r.linkedMemberId));
      linkedCount++;
    }
    console.log(`  updated ${linkedCount} registered member(s) with migrated balances`);

    // New members
    const newEntries = roster.filter((r) => !r.linkedMemberId);
    const idOf = new Map<RosterEntry, number>();
    for (let i = 0; i < newEntries.length; i += 200) {
      const chunk = newEntries.slice(i, i + 200);
      const inserted = await tx.insert(membersTable)
        .values(chunk.map((r) => ({ ...memberValues(r), status: "pending" as const, email: null })))
        .returning({ id: membersTable.id });
      chunk.forEach((r, j) => idOf.set(r, inserted[j].id));
    }
    console.log(`  inserted ${newEntries.length} member rows`);

    // Transactions
    type TxRow = typeof transactionsTable.$inferInsert;
    const txRows: TxRow[] = [];
    for (const r of roster) {
      const mid = r.linkedMemberId ?? idOf.get(r);
      if (!mid) throw new Error(`No member id for ${r.name}`);
      for (const t of r.txs ?? []) {
        const cfg = t.cat === "savings" ? TX_TYPE.savings : TX_TYPE[t.cat];
        txRows.push({
          memberId: mid,
          type: cfg.type as TxRow["type"],
          category: t.cat,
          amount: numStr(t.amount),
          description: `${cfg.label} - ${t.month} 2025 (payroll deduction migration)`,
          uploadRecordId: uploadIds[t.source],
          month: t.month,
          year: 2025,
        });
      }
    }
    for (let i = 0; i < txRows.length; i += 500) {
      await tx.insert(transactionsTable).values(txRows.slice(i, i + 500));
    }
    console.log(`  inserted ${txRows.length} transactions`);
  });

  // Post-apply verification
  const [counts] = await db.execute<any>(sql`
    SELECT (SELECT count(*) FROM members) AS members,
           (SELECT count(*) FROM transactions) AS transactions,
           (SELECT count(*) FROM upload_records) AS uploads,
           (SELECT coalesce(sum(savings_balance),0) FROM members) AS savings_sum,
           (SELECT coalesce(sum(shares_balance),0) FROM members) AS shares_sum,
           (SELECT coalesce(sum(total_loan_balance),0) FROM members) AS loan_sum
  `).then((r: any) => r.rows);
  console.log(`\nAPPLY complete. DB now has: ${JSON.stringify(counts)}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error("MIGRATION FAILED:", err); process.exit(1); });
