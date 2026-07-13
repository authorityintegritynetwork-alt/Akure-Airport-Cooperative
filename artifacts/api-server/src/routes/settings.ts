import { Router, type IRouter } from "express";
import { db, systemSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireSuperAdmin, requireReverification, AuthRequest } from "../middlewares/auth";
import { logAudit } from "../lib/audit";
import { UpdateSettingsBody } from "@workspace/api-zod";

const router: IRouter = Router();

function formatSettings(s: any) {
  return {
    ...s,
    loanInterestRate: parseFloat(s.loanInterestRate),
    maxLoanAmount: s.maxLoanAmount ? parseFloat(s.maxLoanAmount) : null,
    balancesHidden: s.balancesHidden ?? false,
  };
}

/** Read the settings singleton, creating it if it doesn't exist yet. */
async function getOrCreateSettings() {
  let [s] = await db.select().from(systemSettingsTable);
  if (!s) [s] = await db.insert(systemSettingsTable).values({}).returning();
  return s;
}

// Any authenticated member can read settings — they need to know if balances are hidden.
// Mutations (PATCH, POST) remain super-admin only.
router.get("/settings", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  res.json(formatSettings(await getOrCreateSettings()));
});

router.patch("/settings", requireAuth, requireSuperAdmin, requireReverification, async (req: AuthRequest, res): Promise<void> => {
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const existing = await getOrCreateSettings();
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

/**
 * Toggle balance visibility for all members.
 * Super-admin only. No step-up required so the switch can be flipped quickly.
 */
router.post(
  "/settings/balance-visibility",
  requireAuth,
  requireSuperAdmin,
  async (req: AuthRequest, res): Promise<void> => {
    const { hidden } = req.body ?? {};
    if (typeof hidden !== "boolean") {
      res.status(400).json({ error: "hidden must be a boolean" });
      return;
    }

    const existing = await getOrCreateSettings();
    const [updated] = await db
      .update(systemSettingsTable)
      .set({ balancesHidden: hidden })
      .where(eq(systemSettingsTable.id, existing.id))
      .returning();

    await logAudit({
      actorId: req.memberId,
      action: "UPDATE_SETTINGS",
      entity: "settings",
      details: `Balance visibility set to ${hidden ? "hidden (members see 0.00)" : "visible (real figures)"}`,
    });

    res.json(formatSettings(updated));
  },
);

export default router;
