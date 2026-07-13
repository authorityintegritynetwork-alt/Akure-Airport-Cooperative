import { Router, type IRouter } from "express";
import { db, membersTable, systemSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireAdmin, AuthRequest } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/savings/my", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const [[member], [settings]] = await Promise.all([
    db.select().from(membersTable).where(eq(membersTable.id, req.memberId!)),
    db.select().from(systemSettingsTable),
  ]);
  if (!member) {
    res.status(404).json({ error: "Member not found" });
    return;
  }
  const hidden = req.memberRole === "member" && settings?.balancesHidden === true;
  res.json({
    memberId: member.id,
    balance: hidden ? 0 : parseFloat(member.savingsBalance),
    lastUpdated: member.updatedAt,
  });
});

router.get("/savings/:memberId", requireAuth, requireAdmin, async (req: AuthRequest, res): Promise<void> => {
  const raw = Array.isArray(req.params.memberId) ? req.params.memberId[0] : req.params.memberId;
  const memberId = parseInt(raw, 10);

  const [member] = await db.select().from(membersTable).where(eq(membersTable.id, memberId));
  if (!member) {
    res.status(404).json({ error: "Member not found" });
    return;
  }
  res.json({
    memberId: member.id,
    balance: parseFloat(member.savingsBalance),
    lastUpdated: member.updatedAt,
  });
});

export default router;
