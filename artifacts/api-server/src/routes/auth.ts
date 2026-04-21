import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db, membersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { AuthRequest } from "../middlewares/auth";
import { RegisterMemberBody } from "@workspace/api-zod";
import { getClerkUser } from "../lib/clerk";
import { formatMember } from "../lib/formatMember";

const router: IRouter = Router();

router.get("/auth/profile", async (req: AuthRequest, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const [member] = await db
    .select()
    .from(membersTable)
    .where(eq(membersTable.clerkUserId, userId));

  if (!member) {
    res.status(404).json({ error: "Member not found" });
    return;
  }

  res.json(formatMember(member));
});

router.post("/auth/register", async (req: AuthRequest, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const existing = await db
    .select()
    .from(membersTable)
    .where(eq(membersTable.clerkUserId, userId));
  if (existing.length > 0) {
    res.status(400).json({ error: "Member already registered" });
    return;
  }

  const parsed = RegisterMemberBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const clerkUser = await getClerkUser(userId);
  const email = clerkUser?.emailAddress;
  if (!email) {
    res.status(400).json({ error: "Could not retrieve email from Clerk account" });
    return;
  }

  const memberCount = await db.select().from(membersTable);
  const isFirstUser = memberCount.length === 0;

  const existingByEmail = await db
    .select()
    .from(membersTable)
    .where(eq(membersTable.email, email));

  let member;
  if (existingByEmail.length > 0) {
    [member] = await db
      .update(membersTable)
      .set({
        clerkUserId: userId,
        fullName: parsed.data.fullName,
        phone: parsed.data.phone ?? existingByEmail[0].phone ?? undefined,
        staffId: parsed.data.staffId ?? existingByEmail[0].staffId ?? undefined,
      })
      .where(eq(membersTable.email, email))
      .returning();
  } else {
    [member] = await db
      .insert(membersTable)
      .values({
        clerkUserId: userId,
        fullName: parsed.data.fullName,
        email,
        phone: parsed.data.phone ?? undefined,
        staffId: parsed.data.staffId ?? undefined,
        role: isFirstUser ? "super_admin" : "member",
        status: isFirstUser ? "active" : "pending",
      })
      .returning();
  }

  res.status(201).json(formatMember(member));
});

export default router;
