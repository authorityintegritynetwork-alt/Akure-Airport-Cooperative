export interface MemberLite {
  id: number;
  fullName: string;
}

export type MatchConfidence = "exact" | "fuzzy" | "manual" | "none";

export interface MatchResult {
  memberId: number | null;
  memberName: string | null;
  confidence: MatchConfidence;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.,'`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s: string): string[] {
  return normalize(s).split(" ").filter((t) => t.length > 0);
}

interface Decomposed {
  surname: string;
  initials: string[];
  givenNames: string[];
}

function decompose(name: string): Decomposed {
  const toks = tokens(name);
  if (toks.length === 0) {
    return { surname: "", initials: [], givenNames: [] };
  }
  const surname = toks[0];
  const rest = toks.slice(1);
  const initials: string[] = [];
  const givenNames: string[] = [];
  for (const t of rest) {
    if (t.length === 1) initials.push(t);
    else {
      givenNames.push(t);
      initials.push(t[0]);
    }
  }
  return { surname, initials, givenNames };
}

function decomposeMember(fullName: string): Decomposed {
  // Members typically stored as "First Middle Last" — try both orderings.
  const toks = tokens(fullName);
  if (toks.length === 0) return { surname: "", initials: [], givenNames: [] };
  // Treat the LAST token as the surname for member records.
  const surname = toks[toks.length - 1];
  const givenNames = toks.slice(0, -1);
  const initials = givenNames.map((g) => g[0]);
  return { surname, initials, givenNames };
}

export class NameMatcher {
  private members: MemberLite[];
  private byNormalized: Map<string, MemberLite[]>;
  private bySurname: Map<string, MemberLite[]>;

  constructor(members: MemberLite[]) {
    this.members = members;
    this.byNormalized = new Map();
    this.bySurname = new Map();
    for (const m of members) {
      const n = normalize(m.fullName);
      if (!this.byNormalized.has(n)) this.byNormalized.set(n, []);
      this.byNormalized.get(n)!.push(m);

      const decomp = decomposeMember(m.fullName);
      // Index under both possible surname positions for robustness.
      for (const surnameCandidate of [decomp.surname, tokens(m.fullName)[0]]) {
        if (!surnameCandidate) continue;
        if (!this.bySurname.has(surnameCandidate)) this.bySurname.set(surnameCandidate, []);
        if (!this.bySurname.get(surnameCandidate)!.includes(m)) {
          this.bySurname.get(surnameCandidate)!.push(m);
        }
      }
    }
  }

  match(rawName: string): MatchResult {
    const norm = normalize(rawName);
    if (!norm) return { memberId: null, memberName: null, confidence: "none" };

    // Pass 1: exact normalized match.
    const exact = this.byNormalized.get(norm);
    if (exact && exact.length === 1) {
      return { memberId: exact[0].id, memberName: exact[0].fullName, confidence: "exact" };
    }

    // Pass 2: surname + initial matching for "SURNAME .I" style.
    const decomp = decompose(rawName);
    if (decomp.surname) {
      const candidates = this.bySurname.get(decomp.surname) || [];
      const wantedInitials = new Set(decomp.initials);

      if (candidates.length === 1 && wantedInitials.size === 0) {
        return {
          memberId: candidates[0].id,
          memberName: candidates[0].fullName,
          confidence: "fuzzy",
        };
      }

      const filtered = candidates.filter((m) => {
        const md = decomposeMember(m.fullName);
        const memberInitials = new Set(md.initials);
        for (const wi of wantedInitials) {
          if (!memberInitials.has(wi)) return false;
        }
        return true;
      });

      if (filtered.length === 1) {
        return {
          memberId: filtered[0].id,
          memberName: filtered[0].fullName,
          confidence: "fuzzy",
        };
      }
    }

    // Pass 3: full token containment (every token in raw must appear in member).
    const rawToks = tokens(rawName).filter((t) => t.length > 1);
    if (rawToks.length > 0) {
      const containment = this.members.filter((m) => {
        const memberToks = new Set(tokens(m.fullName));
        return rawToks.every((t) => memberToks.has(t));
      });
      if (containment.length === 1) {
        return {
          memberId: containment[0].id,
          memberName: containment[0].fullName,
          confidence: "fuzzy",
        };
      }
    }

    return { memberId: null, memberName: null, confidence: "none" };
  }

  /**
   * Return the top `limit` closest member candidates for a raw sheet name,
   * best first. Scoring favours surname agreement, then initials/given-name
   * overlap, then general token overlap — mirroring the heuristics used by
   * `match()` so the top suggestion usually equals the fuzzy match.
   */
  suggest(rawName: string, limit = 5): Array<{ memberId: number; memberName: string }> {
    const norm = normalize(rawName);
    if (!norm) return [];
    const raw = decompose(rawName);
    const rawToks = new Set(tokens(rawName).filter((t) => t.length > 1));
    const rawInitials = new Set(raw.initials);

    const scored: Array<{ m: MemberLite; score: number }> = [];
    for (const m of this.members) {
      const mNorm = normalize(m.fullName);
      let score = 0;
      if (mNorm === norm) score += 100;

      const md = decomposeMember(m.fullName);
      const memberToks = new Set(tokens(m.fullName));
      const memberInitials = new Set(md.initials);

      // Surname agreement (sheet surname vs either end of the member name).
      const mFirst = tokens(m.fullName)[0] ?? "";
      if (raw.surname && (raw.surname === md.surname || raw.surname === mFirst)) {
        score += 40;
      }

      // Token overlap (multi-letter tokens).
      let overlap = 0;
      for (const t of rawToks) if (memberToks.has(t)) overlap++;
      score += overlap * 15;

      // Initials overlap.
      let initialHits = 0;
      for (const i of rawInitials) if (memberInitials.has(i)) initialHits++;
      score += initialHits * 5;

      // Prefix similarity fallback (handles minor spelling differences).
      if (score === 0) {
        for (const t of rawToks) {
          for (const mt of memberToks) {
            if (t.length >= 4 && mt.length >= 4 && (mt.startsWith(t.slice(0, 4)) || t.startsWith(mt.slice(0, 4)))) {
              score += 3;
            }
          }
        }
      }

      if (score > 0) scored.push({ m, score });
    }

    scored.sort((a, b) => b.score - a.score || a.m.fullName.localeCompare(b.m.fullName));
    return scored.slice(0, limit).map(({ m }) => ({ memberId: m.id, memberName: m.fullName }));
  }
}
