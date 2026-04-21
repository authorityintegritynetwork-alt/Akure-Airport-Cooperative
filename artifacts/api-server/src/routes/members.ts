import { Router, type IRouter } from "express";
import { db, membersTable, transactionsTable, loansTable, storePurchasesTable } from "@workspace/db";
import { eq, ilike, or, and, sql } from "drizzle-orm";
import {
  requireAuth,
  requireAdmin,
  requireSuperAdmin,
  AuthRequest,
} from "../middlewares/auth";
import { logAudit } from "../lib/audit";
import { createClerkInvitation } from "../lib/clerk";
import {
  ListMembersQueryParams,
  GetMemberParams,
  CreateMemberBody,
  UpdateMemberBody,
  UpdateMemberParams,
  ActivateMemberParams,
  DeactivateMemberParams,
  GetMemberSummaryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

import { formatMember } from "../lib/formatMember";

router.get("/members", requireAuth, requireAdmin, async (req: AuthRequest, res): Promise<void> => {
  const params = ListMembersQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  let query = db.select().from(membersTable);
  const conditions = [];

  if (params.data.status) {
    conditions.push(eq(membersTable.status, params.data.status as any));
  }
  if (params.data.search) {
    conditions.push(
      or(
        ilike(membersTable.fullName, `%${params.data.search}%`),
        ilike(membersTable.email, `%${params.data.search}%`),
      )!,
    );
  }

  const members = conditions.length
    ? await db
        .select()
        .from(membersTable)
        .where(conditions.length === 1 ? conditions[0] : and(...conditions))
    : await db.select().from(membersTable);

  res.json(members.map(formatMember));
});

router.post("/members", requireAuth, requireAdmin, async (req: AuthRequest, res): Promise<void> => {
  const parsed = CreateMemberBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [member] = await db
    .insert(membersTable)
    .values({
      fullName: parsed.data.fullName,
      email: parsed.data.email,
      phone: parsed.data.phone ?? undefined,
      staffId: parsed.data.staffId ?? undefined,
      role: (parsed.data.role as any) ?? "member",
      status: (parsed.data.status as any) ?? "active",
    })
    .returning();

  await logAudit({
    actorId: req.memberId,
    action: "CREATE_MEMBER",
    entity: "member",
    entityId: member.id,
    details: `Created member: ${member.fullName}`,
  });

  const appUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
  const invite = await createClerkInvitation({
    emailAddress: member.email,
    redirectUrl: `${appUrl}/sign-up`,
    publicMetadata: { memberId: member.id, fullName: member.fullName },
  });

  res.status(201).json({ ...formatMember(member), invitationSent: invite.ok });
});

router.get("/members/:id", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  if (
    req.memberRole === "member" &&
    req.memberId !== id
  ) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [member] = await db.select().from(membersTable).where(eq(membersTable.id, id));
  if (!member) {
    res.status(404).json({ error: "Member not found" });
    return;
  }
  res.json(formatMember(member));
});

router.patch("/members/:id", requireAuth, requireAdmin, async (req: AuthRequest, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);

  const parsed = UpdateMemberBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: any = {};
  if (parsed.data.fullName != null) updateData.fullName = parsed.data.fullName;
  if (parsed.data.phone != null) updateData.phone = parsed.data.phone;
  if (parsed.data.staffId != null) updateData.staffId = parsed.data.staffId;
  if (parsed.data.role != null) updateData.role = parsed.data.role;
  if (parsed.data.status != null) updateData.status = parsed.data.status;

  const [member] = await db
    .update(membersTable)
    .set(updateData)
    .where(eq(membersTable.id, id))
    .returning();

  if (!member) {
    res.status(404).json({ error: "Member not found" });
    return;
  }

  await logAudit({
    actorId: req.memberId,
    action: "UPDATE_MEMBER",
    entity: "member",
    entityId: id,
    details: `Updated member: ${member.fullName}`,
  });

  res.json(formatMember(member));
});

router.post("/members/:id/activate", requireAuth, requireAdmin, async (req: AuthRequest, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const [member] = await db
    .update(membersTable)
    .set({ status: "active" })
    .where(eq(membersTable.id, id))
    .returning();

  if (!member) {
    res.status(404).json({ error: "Member not found" });
    return;
  }

  await logAudit({
    actorId: req.memberId,
    action: "ACTIVATE_MEMBER",
    entity: "member",
    entityId: id,
    details: `Activated member: ${member.fullName}`,
  });

  res.json(formatMember(member));
});

router.post("/members/:id/deactivate", requireAuth, requireAdmin, async (req: AuthRequest, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const [member] = await db
    .update(membersTable)
    .set({ status: "inactive" })
    .where(eq(membersTable.id, id))
    .returning();

  if (!member) {
    res.status(404).json({ error: "Member not found" });
    return;
  }

  await logAudit({
    actorId: req.memberId,
    action: "DEACTIVATE_MEMBER",
    entity: "member",
    entityId: id,
    details: `Deactivated member: ${member.fullName}`,
  });

  res.json(formatMember(member));
});

router.get("/members/:id/summary", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  if (req.memberRole === "member" && req.memberId !== id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [member] = await db.select().from(membersTable).where(eq(membersTable.id, id));
  if (!member) {
    res.status(404).json({ error: "Member not found" });
    return;
  }

  const allTx = await db
    .select()
    .from(transactionsTable)
    .where(eq(transactionsTable.memberId, id));

  const totalSavings = allTx
    .filter((t) => t.type === "savings")
    .reduce((sum, t) => sum + parseFloat(t.amount), 0);

  const totalLoansRepaid = allTx
    .filter((t) => t.type === "loan_repayment")
    .reduce((sum, t) => sum + parseFloat(t.amount), 0);

  const activeLoans = await db
    .select()
    .from(loansTable)
    .where(and(eq(loansTable.memberId, id), eq(loansTable.status, "disbursed")));

  res.json({
    memberId: member.id,
    fullName: member.fullName,
    savingsBalance: parseFloat(member.savingsBalance),
    totalLoanBalance: parseFloat(member.totalLoanBalance),
    totalStoreDebt: parseFloat(member.totalStoreDebt),
    totalSavingsContributed: totalSavings,
    totalLoansRepaid,
    activeLoansCount: activeLoans.length,
    pendingStoreDebt: parseFloat(member.totalStoreDebt),
  });
});

export default router;
