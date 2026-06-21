import { db, membersTable } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";
import { NameMatcher } from "./nameMatcher";

export interface MatchSuggestionDTO {
  recordId: number;
  fullName: string;
  organization: string | null;
  staffId: string | null;
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

/**
 * Suggest cooperative records (members rows not yet linked to an app account)
 * that match a given name. A cooperative record is a row where both
 * clerkUserId and pendingClerkUserId are NULL — i.e. it originates from an
 * opening-balance seed or a deduction upload and nobody has signed up for it.
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
  if (organization) {
    conditions.push(eq(membersTable.organization, organization));
  }

  const records = await db
    .select()
    .from(membersTable)
    .where(and(...conditions));
  if (records.length === 0) return [];

  const matcher = new NameMatcher(
    records.map((r) => ({ id: r.id, fullName: r.fullName })),
  );
  const byId = new Map(records.map((r) => [r.id, r]));

  const toDTO = (
    r: (typeof records)[number],
    confidence: MatchSuggestionDTO["confidence"],
  ): MatchSuggestionDTO => ({
    recordId: r.id,
    fullName: r.fullName,
    organization: r.organization,
    staffId: r.staffId,
    confidence,
    savingsBalance: includeFinancials ? parseFloat(r.savingsBalance) : 0,
    totalLoanBalance: includeFinancials ? parseFloat(r.totalLoanBalance) : 0,
    totalStoreDebt: includeFinancials ? parseFloat(r.totalStoreDebt) : 0,
  });

  const out: MatchSuggestionDTO[] = [];
  const seen = new Set<number>();

  // Primary: the shared matcher's best confident match.
  const best = matcher.match(fullName);
  if (best.memberId != null) {
    const r = byId.get(best.memberId);
    if (r) {
      out.push(toDTO(r, best.confidence === "exact" ? "exact" : "fuzzy"));
      seen.add(r.id);
    }
  }

  // Secondary: surname / token overlap so the admin always has nearby options
  // to override with even when the matcher can't confidently disambiguate.
  const wantTokens = new Set(tokenize(fullName));
  for (const r of records) {
    if (seen.has(r.id)) continue;
    const rTokens = tokenize(r.fullName);
    if (rTokens.some((t) => wantTokens.has(t))) {
      out.push(toDTO(r, "none"));
      seen.add(r.id);
    }
    if (out.length >= limit) break;
  }

  return out.slice(0, limit);
}
