import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db, membersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { AuthRequest } from "../middlewares/auth";
import { RegisterMemberBody } from "@workspace/api-zod";

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

  res.json({
    ...member,
    savingsBalance: parseFloat(member.savingsBalance),
    totalLoanBalance: parseFloat(member.totalLoanBalance),
    totalStoreDebt: parseFloat(member.totalStoreDebt),
  });
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

  const clerkUser = auth as any;
  const email = clerkUser?.sessionClaims?.email || "";

  const [member] = await db
    .insert(membersTable)
    .values({
      clerkUserId: userId,
      fullName: parsed.data.fullName,
      email,
      phone: parsed.data.phone ?? undefined,
      staffId: parsed.data.staffId ?? undefined,
      role: "member",
      status: "pending",
    })
    .returning();

  res.status(201).json({
    ...member,
    savingsBalance: parseFloat(member.savingsBalance),
    totalLoanBalance: parseFloat(member.totalLoanBalance),
    totalStoreDebt: parseFloat(member.totalStoreDebt),
  });
});

export default router;
