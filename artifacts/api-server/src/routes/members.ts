import { Router, type IRouter } from "express";
import {
  db,
  membersTable,
  transactionsTable,
  loansTable,
  storePurchasesTable,
  notificationsTable,
  uploadRecordsTable,
  organizationsTable,
} from "@workspace/db";
import { eq, ilike, or, and, sql } from "drizzle-orm";
import {
  requireAuth,
  requireAdmin,
  requireSuperAdmin,
  requireReverification,
  requireReverificationIf,
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
  BulkAssignOrganizationBody,
} from "@workspace/api-zod";
import { inArray } from "drizzle-orm";

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
  if ((params.data as any).organization) {
    conditions.push(eq(membersTable.organization, (params.data as any).organization));
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

  const requestedOrg = String((parsed.data as any).organization || "")
    .trim()
    .toUpperCase();
  let orgCode: string;
  if (requestedOrg) {
    const [orgRow] = await db
      .select({ code: organizationsTable.code, isActive: organizationsTable.isActive })
      .from(organizationsTable)
      .where(eq(organizationsTable.code, requestedOrg));
    if (!orgRow) {
      res.status(400).json({ error: `Unknown organization "${requestedOrg}".` });
      return;
    }
    if (!orgRow.isActive) {
      res
        .status(400)
        .json({ error: `Organization "${orgRow.code}" is currently deactivated.` });
      return;
    }
    orgCode = orgRow.code;
  } else {
    // Fall back to the first active organization (alphabetical) so admins can
    // create a member without explicitly picking one when only one exists.
    const [firstOrg] = await db
      .select({ code: organizationsTable.code })
      .from(organizationsTable)
      .where(eq(organizationsTable.isActive, true))
      .orderBy(organizationsTable.code);
    if (!firstOrg) {
      res.status(400).json({
        error: "No organizations have been configured yet. Add one before creating members.",
      });
      return;
    }
    orgCode = firstOrg.code;
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
      organization: orgCode,
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

router.patch(
  "/members/:id",
  requireAuth,
  requireAdmin,
  // Step-up only when role or status is being changed (governance-sensitive)
  requireReverificationIf((req) => {
    const b = req.body || {};
    return b.role != null || b.status != null;
  }),
  async (req: AuthRequest, res): Promise<void> => {
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
  if (parsed.data.status != null) updateData.status = parsed.data.status;
  if ((parsed.data as any).organization != null) {
    const requestedOrg = String((parsed.data as any).organization).trim().toUpperCase();
    if (!requestedOrg) {
      res.status(400).json({ error: "Organization cannot be empty." });
      return;
    }
    const [orgRow] = await db
      .select({ code: organizationsTable.code, isActive: organizationsTable.isActive })
      .from(organizationsTable)
      .where(eq(organizationsTable.code, requestedOrg));
    if (!orgRow) {
      res.status(400).json({ error: `Unknown organization "${requestedOrg}".` });
      return;
    }
    // Allow re-assignment to a deactivated org only if the member is *already*
    // on that code (so admins can edit other fields without flipping a stale
    // org). Otherwise reject so deactivated codes can't be newly assigned.
    if (!orgRow.isActive) {
      const [currentMember] = await db
        .select({ organization: membersTable.organization })
        .from(membersTable)
        .where(eq(membersTable.id, id));
      if (!currentMember || currentMember.organization !== orgRow.code) {
        res.status(400).json({
          error: `Organization "${orgRow.code}" is currently deactivated.`,
        });
        return;
      }
    }
    updateData.organization = orgRow.code;
  }

  if (parsed.data.role != null) {
    if (req.memberRole !== "super_admin") {
      res.status(403).json({ error: "Only Super Admin can change member roles." });
      return;
    }
    if (req.memberId === id && parsed.data.role !== "super_admin") {
      res.status(409).json({ error: "You cannot demote your own super-admin role." });
      return;
    }
    updateData.role = parsed.data.role;
  }

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

router.post(
  "/members/bulk-organization",
  requireAuth,
  requireAdmin,
  requireReverification,
  async (req: AuthRequest, res): Promise<void> => {
    const parsed = BulkAssignOrganizationBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { memberIds, organization } = parsed.data;
    if (memberIds.length === 0) {
      res.json({ updated: 0 });
      return;
    }

    const orgCode = organization.trim().toUpperCase();
    const [orgRow] = await db
      .select({ code: organizationsTable.code, isActive: organizationsTable.isActive })
      .from(organizationsTable)
      .where(eq(organizationsTable.code, orgCode));
    if (!orgRow) {
      res.status(400).json({ error: `Unknown organization "${organization}".` });
      return;
    }
    if (!orgRow.isActive) {
      res.status(400).json({ error: `Organization "${orgRow.code}" is currently deactivated.` });
      return;
    }

    const updated = await db
      .update(membersTable)
      .set({ organization: orgRow.code })
      .where(inArray(membersTable.id, memberIds))
      .returning({ id: membersTable.id });

    await logAudit({
      actorId: req.memberId,
      action: "BULK_ASSIGN_ORGANIZATION",
      entity: "member",
      entityId: 0,
      details: `Assigned ${orgRow.code} to ${updated.length} member(s): ${memberIds.join(",")}`,
    });

    res.json({ updated: updated.length });
  },
);

router.post("/members/:id/activate", requireAuth, requireAdmin, requireReverification, async (req: AuthRequest, res): Promise<void> => {
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

router.post("/members/:id/deactivate", requireAuth, requireAdmin, requireReverification, async (req: AuthRequest, res): Promise<void> => {
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

router.delete(
  "/members/:id",
  requireAuth,
  requireAdmin,
  requireReverification,
  async (req: AuthRequest, res): Promise<void> => {
    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(raw, 10);

    if (req.memberId === id) {
      res.status(409).json({ error: "You cannot delete your own account." });
      return;
    }

    const [member] = await db.select().from(membersTable).where(eq(membersTable.id, id));
    if (!member) {
      res.status(404).json({ error: "Member not found" });
      return;
    }

    try {
      await db.transaction(async (tx) => {
        await tx.delete(notificationsTable).where(eq(notificationsTable.memberId, id));
        await tx.delete(transactionsTable).where(eq(transactionsTable.memberId, id));
        await tx.delete(loansTable).where(eq(loansTable.memberId, id));
        await tx.delete(storePurchasesTable).where(eq(storePurchasesTable.memberId, id));
        await tx.delete(uploadRecordsTable).where(eq(uploadRecordsTable.uploadedBy, id));
        await tx.delete(membersTable).where(eq(membersTable.id, id));
      });
    } catch (err: any) {
      await logAudit({
        actorId: req.memberId,
        action: "DELETE_MEMBER_FAILED",
        entity: "member",
        entityId: id,
        details: `Failed to delete member ${member.fullName}: ${err.message}`,
      });
      res.status(409).json({ error: err.message || "Cannot delete member" });
      return;
    }

    await logAudit({
      actorId: req.memberId,
      action: "DELETE_MEMBER",
      entity: "member",
      entityId: id,
      details: `Deleted member: ${member.fullName} (${member.email})`,
    });

    res.json({ deleted: true });
  },
);

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
    organization: member.organization,
    savingsBalance: parseFloat(member.savingsBalance),
    totalLoanBalance: parseFloat(member.totalLoanBalance),
    totalStoreDebt: parseFloat(member.totalStoreDebt),
    fuelVentureBalance: parseFloat(member.fuelVentureBalance),
    landLoanBalance: parseFloat(member.landLoanBalance),
    totalSavingsContributed: totalSavings,
    totalLoansRepaid,
    activeLoansCount: activeLoans.length,
    pendingStoreDebt: parseFloat(member.totalStoreDebt),
  });
});

export default router;
