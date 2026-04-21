import { getAuth } from "@clerk/express";
function reverificationError(level: "strict" | "moderate" | "lax" = "strict") {
  return {
    clerk_error: {
      type: "forbidden" as const,
      reason: "reverification-error" as const,
      metadata: { reverification: { level } },
    },
  };
}
import { Request, Response, NextFunction } from "express";
import { db, membersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export type AuthRequest = Request & {
  memberId?: number;
  memberRole?: string;
  memberStatus?: string;
  clerkUserId?: string;
};

export async function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const auth = getAuth(req);
  const userId = auth?.userId;

  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  req.clerkUserId = userId;

  const [member] = await db
    .select()
    .from(membersTable)
    .where(eq(membersTable.clerkUserId, userId));

  if (!member) {
    res.status(404).json({ error: "Member not found. Please complete registration." });
    return;
  }

  req.memberId = member.id;
  req.memberRole = member.role;
  req.memberStatus = member.status;

  next();
}

export function requireRole(...roles: string[]) {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.memberRole) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!roles.includes(req.memberRole)) {
      res.status(403).json({ error: "Forbidden: insufficient permissions" });
      return;
    }
    next();
  };
}

export const requireMember = requireRole("member");

/**
 * Step-up reverification for sensitive admin actions.
 * Requires the user to have completed a fresh credential check (email code, etc.)
 * within the last 10 minutes via Clerk's built-in reverification flow.
 *
 * Returns Clerk's standard reverification hint body so the frontend
 * `useReverification()` hook can detect it and prompt the user automatically.
 */
export function requireReverification(req: AuthRequest, res: Response, next: NextFunction): void {
  const auth = getAuth(req);
  const ok = auth?.has?.({ reverification: "strict" });
  if (!ok) {
    res.status(403).json(reverificationError("strict"));
    return;
  }
  next();
}

/**
 * Conditional reverification — only enforces the check when `predicate` returns true.
 * Useful for endpoints where only some payloads are sensitive (e.g. role changes).
 */
export function requireReverificationIf(predicate: (req: AuthRequest) => boolean) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!predicate(req)) return next();
    requireReverification(req, res, next);
  };
}

export const requireAdmin = requireRole("admin", "financial_auditor", "treasurer", "super_admin");
export const requireAdminOnly = requireRole("admin", "super_admin");
export const requireAuditor = requireRole("financial_auditor", "super_admin");
export const requireTreasurer = requireRole("treasurer", "super_admin");
export const requireSuperAdmin = requireRole("super_admin");
