import { db, membersTable } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";
import { NameMatcher } from "./nameMatcher";

export interface MatchSuggestionDTO {
  recordId: number;
  fullName: string;
  organization: string | null;
  staffId: string | null;
  phone: string | null;
  memberType: "staff" | "pensioner" | null;
  confidence: "exact" | "fuzzy" | "none";
  savingsBalance: number;
  totalLoanBalance: number;
  totalStoreDebt: number;
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[.,'`]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

type MemberRow = Awaited<ReturnType<typeof db.select>>[number] & {
  fullName: string;
};

/**
 * Core matching logic that operates on a pre-loaded set of unlinked records.
 * Callers that process many signups at once should fetch the records once and
 * call this for each signup to avoid N×1 full-table scans.
 */
export function computeMatchSuggestionsFromRecords(
  allUnlinkedRecords: Awaited<ReturnType<typeof db.select>>[number][],
  fullName: string,
  organization?: string | null,
  limit = 6,
  includeFinancials = true,
): MatchSuggestionDTO[] {
  // Filter by org client-side — records are already loaded.
  const records = organization
    ? allUnlinkedRecords.filter((r: any) => r.organization === organization)
    : allUnlinkedRecords;

  if (records.length === 0) return [];

  const matcher = new NameMatcher(
    records.map((r: any) => ({ id: r.id, fullName: r.fullName })),
  );
  const byId = new Map(records.map((r: any) => [r.id, r]));

  const toDTO = (
    r: any,
    confidence: MatchSuggestionDTO["confidence"],
  ): MatchSuggestionDTO => ({
    recordId: r.id,
    fullName: r.fullName,
    organization: r.organization,
    staffId: r.staffId,
    phone: r.phone ?? null,
    memberType: (r.memberType as "staff" | "pensioner" | null) ?? null,
    confidence,
    savingsBalance: includeFinancials ? parseFloat(r.savingsBalance) : 0,
    totalLoanBalance: includeFinancials ? parseFloat(r.totalLoanBalance) : 0,
    totalStoreDebt: includeFinancials ? parseFloat(r.totalStoreDebt) : 0,
  });

  const out: MatchSuggestionDTO[] = [];
  const seen = new Set<number>();

  const best = matcher.match(fullName);
  if (best.memberId != null) {
    const r = byId.get(best.memberId);
    if (r) {
      out.push(toDTO(r, best.confidence === "exact" ? "exact" : "fuzzy"));
      seen.add(r.id);
    }
  }

  const wantTokens = new Set(tokenize(fullName));
  for (const r of records as any[]) {
    if (seen.has(r.id)) continue;
    const rTokens = tokenize(r.fullName);
    if (rTokens.some((t: string) => wantTokens.has(t))) {
      out.push(toDTO(r, "none"));
      seen.add(r.id);
    }
    if (out.length >= limit) break;
  }

  return out.slice(0, limit);
}

/**
 * Suggest cooperative records (members rows not yet linked to an app account)
 * that match a given name. A cooperative record is a row where both
 * clerkUserId and pendingClerkUserId are NULL — i.e. it originates from an
 * opening-balance seed or a deduction upload and nobody has signed up for it.
 *
 * Fetches unlinked records from the DB on every call. When processing multiple
 * signups, prefer `computeMatchSuggestionsFromRecords` with a shared prefetch.
 */
export async function computeMatchSuggestions(
  fullName: string,
  organization?: string | null,
  limit = 6,
  includeFinancials = true,
): Promise<MatchSuggestionDTO[]> {
  const conditions = [
    isNull(membersTable.clerkUserId),
    isNull(membersTable.pendingClerkUserId),
  ];

  const records = await db
    .select()
    .from(membersTable)
    .where(and(...conditions));

  return computeMatchSuggestionsFromRecords(records, fullName, organization, limit, includeFinancials);
}
