import { getAuth } from "@clerk/express";
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

export const requireAdmin = requireRole("admin", "financial_auditor", "treasurer", "super_admin");
export const requireAdminOnly = requireRole("admin", "super_admin");
export const requireAuditor = requireRole("financial_auditor", "super_admin");
export const requireTreasurer = requireRole("treasurer", "super_admin");
export const requireSuperAdmin = requireRole("super_admin");
