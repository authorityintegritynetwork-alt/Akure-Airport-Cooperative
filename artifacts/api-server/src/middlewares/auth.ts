import { getAuth } from "@clerk/express";
import { Request, Response, NextFunction } from "express";
import { db, membersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { hasActiveStepUpGrant } from "../lib/stepUp";

export type AuthRequest = Request & {
  memberId?: number;
  memberRole?: string;
  memberStatus?: string;
  clerkUserId?: string;
  clerkSessionId?: string;
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
  req.clerkSessionId = auth?.sessionId ?? undefined;

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

  if (member.status === "deactivated") {
    res.status(403).json({
      error: "Your account has been deactivated. Please contact the cooperative administrator.",
    });
    return;
  }

  next();
}

/**
 * Like requireAuth but does NOT require the Clerk user to already have a
 * member row. Used by endpoints that pre-member users need during sign-up
 * (e.g. listing active organizations on the complete-profile page).
 */
export async function requireClerkUser(
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
  req.clerkSessionId = auth?.sessionId ?? undefined;

  const [member] = await db
    .select()
    .from(membersTable)
    .where(eq(membersTable.clerkUserId, userId));

  if (member) {
    req.memberId = member.id;
    req.memberRole = member.role;
    req.memberStatus = member.status;
  }

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
 * Step-up reverification for sensitive actions.
 * Requires the user to have completed an email-OTP step-up (see /auth/step-up/*)
 * within the last 10 minutes. The frontend `useStepUpAction` hook detects the
 * 403 + `step_up_required` body, prompts the user for the code, then retries.
 */
export async function requireReverification(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.memberId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const ok = await hasActiveStepUpGrant(req.memberId, req.clerkSessionId);
  if (!ok) {
    res.status(403).json({
      error: "Step-up verification required",
      step_up_required: true,
    });
    return;
  }
  next();
}

/**
 * Conditional reverification — only enforces the check when `predicate` returns true.
 */
export function requireReverificationIf(predicate: (req: AuthRequest) => boolean) {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!predicate(req)) return next();
    await requireReverification(req, res, next);
  };
}

export const requireAdmin = requireRole("admin", "financial_auditor", "treasurer", "super_admin");
export const requireAdminOnly = requireRole("admin", "super_admin");
export const requireAuditor = requireRole("financial_auditor", "super_admin");
export const requireTreasurer = requireRole("treasurer", "super_admin");
export const requireSuperAdmin = requireRole("super_admin");
