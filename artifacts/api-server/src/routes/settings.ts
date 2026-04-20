import { Router, type IRouter } from "express";
import { db, systemSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireSuperAdmin, AuthRequest } from "../middlewares/auth";
import { logAudit } from "../lib/audit";
import { UpdateSettingsBody } from "@workspace/api-zod";

const router: IRouter = Router();

function formatSettings(s: any) {
  return {
    ...s,
    loanInterestRate: parseFloat(s.loanInterestRate),
    maxLoanAmount: s.maxLoanAmount ? parseFloat(s.maxLoanAmount) : null,
  };
}

router.get("/settings", requireAuth, requireSuperAdmin, async (req: AuthRequest, res): Promise<void> => {
  let [settings] = await db.select().from(systemSettingsTable);
  if (!settings) {
    [settings] = await db.insert(systemSettingsTable).values({}).returning();
  }
  res.json(formatSettings(settings));
});

router.patch("/settings", requireAuth, requireSuperAdmin, async (req: AuthRequest, res): Promise<void> => {
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  let [existing] = await db.select().from(systemSettingsTable);
  if (!existing) {
    [existing] = await db.insert(systemSettingsTable).values({}).returning();
  }

  const updateData: any = {};
  if (parsed.data.loanInterestRate != null) updateData.loanInterestRate = parsed.data.loanInterestRate.toString();
  if (parsed.data.maxLoanAmount != null) updateData.maxLoanAmount = parsed.data.maxLoanAmount.toString();
  if (parsed.data.maxLoanTenureMonths != null) updateData.maxLoanTenureMonths = parsed.data.maxLoanTenureMonths;
  if (parsed.data.cooperativeName != null) updateData.cooperativeName = parsed.data.cooperativeName;

  const [updated] = await db
    .update(systemSettingsTable)
    .set(updateData)
    .where(eq(systemSettingsTable.id, existing.id))
    .returning();

  await logAudit({
    actorId: req.memberId,
    action: "UPDATE_SETTINGS",
    entity: "settings",
    details: `System settings updated`,
  });

  res.json(formatSettings(updated));
});

export default router;
