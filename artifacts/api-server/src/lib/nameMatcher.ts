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
}
