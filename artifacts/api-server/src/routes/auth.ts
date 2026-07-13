import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db, membersTable, organizationsTable } from "@workspace/db";
import { eq, and, isNotNull, isNull } from "drizzle-orm";
import { AuthRequest } from "../middlewares/auth";
import { RegisterMemberBody } from "@workspace/api-zod";
import { getClerkUser } from "../lib/clerk";
import { formatMember } from "../lib/formatMember";
import { computeMatchSuggestions } from "../lib/matchSuggestions";

const router: IRouter = Router();

router.get("/auth/profile", async (req: AuthRequest, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // An active app account has its clerkUserId set.
  const [member] = await db
    .select()
    .from(membersTable)
    .where(eq(membersTable.clerkUserId, userId));

  if (member) {
    res.json(formatMember(member));
    return;
  }

  // A signed-up-but-not-yet-approved user only has pendingClerkUserId set.
  // Surface them as a pending profile so the frontend shows the
  // "awaiting approval" screen instead of sending them back to complete-profile.
  const [pending] = await db
    .select()
    .from(membersTable)
    .where(eq(membersTable.pendingClerkUserId, userId));

  if (pending) {
    res.json({
      ...formatMember(pending),
      clerkUserId: pending.clerkUserId ?? pending.pendingClerkUserId,
      status: "pending",
    });
    return;
  }

  // Email-based fallback: look up by the email address on the Clerk account.
  // This handles existing/imported members whose clerk_user_id was set for a
  // different Clerk instance (dev → prod migration) or was never set at all.
  // If found, auto-link the current Clerk user ID so subsequent logins are fast.
  const clerkUser = await getClerkUser(userId);
  if (clerkUser?.emailAddress) {
    const [byEmail] = await db
      .select()
      .from(membersTable)
      .where(eq(membersTable.email, clerkUser.emailAddress));

    if (byEmail && byEmail.status === "active") {
      // Link this Clerk user ID to the member record permanently.
      await db
        .update(membersTable)
        .set({ clerkUserId: userId })
        .where(eq(membersTable.id, byEmail.id));

      res.json(formatMember({ ...byEmail, clerkUserId: userId }));
      return;
    }
  }

  res.status(404).json({ error: "Member not found" });
});

router.get(
  "/auth/match-suggestions",
  async (req: AuthRequest, res): Promise<void> => {
    const auth = getAuth(req);
    const userId = auth?.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const fullName = String(req.query.fullName ?? "").trim();
    const organization = String(req.query.organization ?? "")
      .trim()
      .toUpperCase();
    if (!fullName || !organization) {
      res.json({ suggestions: [] });
      return;
    }

    // Pre-approval signup flow: never expose cooperative records' financial
    // balances to a not-yet-approved user. Only identity/match metadata.
    const suggestions = await computeMatchSuggestions(
      fullName,
      organization,
      6,
      false,
    );
    res.json({ suggestions });
  },
);

router.post("/auth/register", async (req: AuthRequest, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // Already an active app account?
  const existingActive = await db
    .select()
    .from(membersTable)
    .where(eq(membersTable.clerkUserId, userId));
  if (existingActive.length > 0) {
    res.status(400).json({ error: "Member already registered" });
    return;
  }

  // Already submitted a sign-up awaiting approval?
  const existingPending = await db
    .select()
    .from(membersTable)
    .where(eq(membersTable.pendingClerkUserId, userId));
  if (existingPending.length > 0) {
    res
      .status(400)
      .json({ error: "Your registration is already awaiting approval." });
    return;
  }

  const parsed = RegisterMemberBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const requestedOrg = String((parsed.data as any).organization || "")
    .trim()
    .toUpperCase();
  if (!requestedOrg) {
    res.status(400).json({ error: "Please select an organization." });
    return;
  }
  const [orgRow] = await db
    .select({ code: organizationsTable.code })
    .from(organizationsTable)
    .where(
      and(
        eq(organizationsTable.code, requestedOrg),
        eq(organizationsTable.isActive, true),
      ),
    );
  if (!orgRow) {
    res.status(400).json({
      error: `Organization "${requestedOrg}" is not available. Please pick from the list.`,
    });
    return;
  }

  const clerkUser = await getClerkUser(userId);
  const email = clerkUser?.emailAddress;
  if (!email) {
    res.status(400).json({ error: "Could not retrieve email from Clerk account" });
    return;
  }

  // Enforce uniqueness of staffId across all members (active, pending, or records).
  const staffIdValue = parsed.data.staffId.trim();
  const [existingStaffId] = await db
    .select({ id: membersTable.id })
    .from(membersTable)
    .where(eq(membersTable.staffId, staffIdValue));
  if (existingStaffId) {
    res.status(409).json({
      error: "A member with this Staff/Pensioner number already exists. If this is your number, please contact an administrator.",
    });
    return;
  }

  // The very first app account bootstraps the system as an active super admin.
  const appAccounts = await db
    .select({ id: membersTable.id })
    .from(membersTable)
    .where(isNotNull(membersTable.clerkUserId));
  const isFirstUser = appAccounts.length === 0;

  if (isFirstUser) {
    const [member] = await db
      .insert(membersTable)
      .values({
        clerkUserId: userId,
        fullName: parsed.data.fullName,
        email,
        phone: parsed.data.phone ?? undefined,
        memberType: parsed.data.memberType,
        staffId: staffIdValue,
        organization: orgRow.code,
        role: "super_admin",
        status: "active",
      })
      .returning();
    res.status(201).json(formatMember(member));
    return;
  }

  // Everyone else creates a dedicated pending sign-up row. It holds the Clerk
  // identity in pending* fields (clerkUserId stays NULL so they don't get a
  // live profile) with zero balances until an admin approves and optionally
  // links it to an existing cooperative record.
  const [signup] = await db
    .insert(membersTable)
    .values({
      clerkUserId: null,
      pendingClerkUserId: userId,
      pendingEmail: email,
      pendingName: parsed.data.fullName,
      fullName: parsed.data.fullName,
      phone: parsed.data.phone ?? undefined,
      memberType: parsed.data.memberType,
      staffId: staffIdValue,
      organization: orgRow.code,
      role: "member",
      status: "pending",
    })
    .returning();

  res.status(201).json({
    ...formatMember(signup),
    clerkUserId: signup.clerkUserId ?? signup.pendingClerkUserId,
    status: "pending",
  });
});

export default router;
