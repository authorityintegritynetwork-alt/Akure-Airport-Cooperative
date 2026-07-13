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
import { eq, ilike, or, and, sql, isNull, isNotNull } from "drizzle-orm";
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
import { computeMatchSuggestions } from "../lib/matchSuggestions";
import { requireAdminOnly } from "../middlewares/auth";
import { ApproveMatchBody } from "@workspace/api-zod";

router.get("/members", requireAuth, requireAdmin, async (req: AuthRequest, res): Promise<void> => {
  const params = ListMembersQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // The Members section shows only app accounts: rows that are either linked
  // to a Clerk identity (active members) or have a pending sign-up awaiting
  // approval. Pure cooperative records (clerkUserId AND pendingClerkUserId both
  // NULL) live in the separate Cooperative Records view.
  const conditions: any[] = [
    or(
      isNotNull(membersTable.clerkUserId),
      isNotNull(membersTable.pendingClerkUserId),
    )!,
  ];

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

  const members = await db
    .select()
    .from(membersTable)
    .where(conditions.length === 1 ? conditions[0] : and(...conditions));

  res.json(members.map(formatMember));
});

// ── Pending sign-ups awaiting approval/match ────────────────────────────────
// Registered BEFORE "/members/:id" so the literal path isn't parsed as an id.
router.get(
  "/members/pending-signups",
  requireAuth,
  requireAdmin,
  async (_req: AuthRequest, res): Promise<void> => {
    const signups = await db
      .select()
      .from(membersTable)
      .where(
        and(
          isNotNull(membersTable.pendingClerkUserId),
          isNull(membersTable.clerkUserId),
        ),
      );

    const result = [];
    for (const s of signups) {
      const suggestions = await computeMatchSuggestions(
        s.pendingName ?? s.fullName,
        s.organization,
      );
      result.push({
        id: s.id,
        fullName: s.fullName,
        pendingName: s.pendingName,
        pendingEmail: s.pendingEmail,
        organization: s.organization,
        staffId: s.staffId,
        phone: s.phone,
        createdAt: s.createdAt,
        suggestions,
      });
    }

    res.json(result);
  },
);

// ── Cooperative records (not yet linked to an app account) ───────────────────
router.get(
  "/cooperative-records",
  requireAuth,
  requireAdmin,
  async (req: AuthRequest, res): Promise<void> => {
    const conditions: any[] = [
      isNull(membersTable.clerkUserId),
      isNull(membersTable.pendingClerkUserId),
    ];

    const organization = req.query.organization
      ? String(req.query.organization)
      : "";
    if (organization) {
      conditions.push(eq(membersTable.organization, organization));
    }
    const search = req.query.search ? String(req.query.search) : "";
    if (search) {
      conditions.push(
        or(
          ilike(membersTable.fullName, `%${search}%`),
          ilike(membersTable.staffId, `%${search}%`),
        )!,
      );
    }

    const records = await db
      .select()
      .from(membersTable)
      .where(and(...conditions));

    res.json(records.map(formatMember));
  },
);

// ── Search ALL member rows (linked, pending, unclaimed) ──────────────────────
// Registered before "/members/:id" so the literal path isn't parsed as an id.
router.get(
  "/members/search-all",
  requireAuth,
  requireAdmin,
  async (req: AuthRequest, res): Promise<void> => {
    const q = req.query.q ? String(req.query.q).trim() : "";
    const limit = Math.min(parseInt(String(req.query.limit ?? "20"), 10) || 20, 50);
    if (q.length < 2) {
      res.json([]);
      return;
    }
    const rows = await db
      .select()
      .from(membersTable)
      .where(
        or(
          ilike(membersTable.fullName, `%${q}%`),
          ilike(membersTable.staffId, `%${q}%`),
          ilike(membersTable.email, `%${q}%`),
        )!,
      )
      .limit(limit);
    res.json(
      rows.map((r) => ({
        id: r.id,
        fullName: r.fullName,
        organization: r.organization,
        staffId: r.staffId ?? null,
        phone: r.phone ?? null,
        memberType: r.memberType ?? null,
        status: r.status,
        isLinked: !!r.clerkUserId,
      })),
    );
  },
);

// ── Create a blank cooperative record (no Clerk IDs, zero balances) ───────────
router.post(
  "/members/blank-record",
  requireAuth,
  requireAdminOnly,
  async (req: AuthRequest, res): Promise<void> => {
    const { fullName, organization, staffId, phone, memberType } = req.body ?? {};
    if (!fullName || typeof fullName !== "string" || !fullName.trim()) {
      res.status(400).json({ error: "Full name is required." });
      return;
    }

    // Resolve org
    let orgCode = "FAAN";
    const requestedOrg = String(organization || "").trim().toUpperCase();
    if (requestedOrg) {
      const [orgRow] = await db
        .select({ code: organizationsTable.code })
        .from(organizationsTable)
        .where(eq(organizationsTable.code, requestedOrg));
      if (!orgRow) {
        res.status(400).json({ error: `Unknown organization "${requestedOrg}".` });
        return;
      }
      orgCode = orgRow.code;
    } else {
      const [firstOrg] = await db
        .select({ code: organizationsTable.code })
        .from(organizationsTable)
        .where(eq(organizationsTable.isActive, true))
        .orderBy(organizationsTable.code);
      if (firstOrg) orgCode = firstOrg.code;
    }

    const [record] = await db
      .insert(membersTable)
      .values({
        fullName: fullName.trim(),
        organization: orgCode,
        staffId: staffId ? String(staffId).trim() || undefined : undefined,
        phone: phone ? String(phone).trim() || undefined : undefined,
        memberType: ((memberType === "pensioner" ? "pensioner" : "staff") as any),
        status: "active" as any,
      })
      .returning();

    await logAudit({
      actorId: req.memberId,
      action: "CREATE_BLANK_RECORD",
      entity: "member",
      entityId: record.id,
      details: `Admin created blank cooperative record: ${record.fullName}`,
    });

    res.status(201).json({
      id: record.id,
      fullName: record.fullName,
      organization: record.organization,
      staffId: record.staffId ?? null,
      phone: record.phone ?? null,
      memberType: record.memberType ?? null,
      status: record.status,
      isLinked: false,
    });
  },
);

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

  const staffIdValue = (parsed.data.staffId ?? "").trim();
  if (!staffIdValue) {
    res.status(400).json({ error: "Staff/Pensioner number is required." });
    return;
  }
  const [existingStaffId] = await db
    .select({ id: membersTable.id })
    .from(membersTable)
    .where(eq(membersTable.staffId, staffIdValue));
  if (existingStaffId) {
    res.status(409).json({ error: `A member with Staff/Pensioner number "${staffIdValue}" already exists.` });
    return;
  }

  const [member] = await db
    .insert(membersTable)
    .values({
      fullName: parsed.data.fullName,
      email: parsed.data.email,
      phone: parsed.data.phone ?? undefined,
      memberType: (parsed.data as any).memberType ?? "staff",
      staffId: staffIdValue,
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
  const invite = member.email
    ? await createClerkInvitation({
        emailAddress: member.email,
        redirectUrl: `${appUrl}/sign-up`,
        publicMetadata: { memberId: member.id, fullName: member.fullName },
      })
    : { ok: false };

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
  if ((parsed.data as any).memberType != null) updateData.memberType = (parsed.data as any).memberType;
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
      .returning({ id: membersTable.id, fullName: membersTable.fullName });

    await logAudit({
      actorId: req.memberId,
      action: "BULK_ASSIGN_ORGANIZATION",
      entity: "member",
      entityId: 0,
      details: `Assigned ${orgRow.code} to ${updated.length} member(s)`,
    });

    // Per-member audit entries so each affected member's history is searchable.
    for (const m of updated) {
      await logAudit({
        actorId: req.memberId,
        action: "ASSIGN_ORGANIZATION",
        entity: "member",
        entityId: m.id,
        details: `Assigned to ${orgRow.code} via bulk action: ${m.fullName}`,
      });
    }

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

router.post(
  "/members/:id/approve-match",
  requireAuth,
  requireAdminOnly,
  requireReverification,
  async (req: AuthRequest, res): Promise<void> => {
    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(raw, 10);

    const parsed = ApproveMatchBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const cooperativeRecordId =
      (parsed.data as any).cooperativeRecordId ?? null;

    const [signup] = await db
      .select()
      .from(membersTable)
      .where(eq(membersTable.id, id));
    if (!signup || !signup.pendingClerkUserId || signup.clerkUserId) {
      res.status(404).json({ error: "Pending sign-up not found" });
      return;
    }

    const overrides = (parsed.data as any).overrides ?? {};

    // Approve WITHOUT a cooperative record: promote the sign-up row itself into
    // an active app account with zero balances.
    if (cooperativeRecordId == null) {
      const [member] = await db
        .update(membersTable)
        .set({
          clerkUserId: signup.pendingClerkUserId,
          email: signup.pendingEmail,
          status: "active",
          pendingClerkUserId: null,
          pendingEmail: null,
          pendingName: null,
        })
        .where(eq(membersTable.id, id))
        .returning();

      await logAudit({
        actorId: req.memberId,
        action: "APPROVE_SIGNUP_NEW",
        entity: "member",
        entityId: id,
        details: `Approved sign-up as new member (zero balance): ${member.fullName}`,
      });

      res.json(formatMember(member));
      return;
    }

    // Approve WITH a cooperative record: link the Clerk identity to that record
    // (which already holds the balances + transaction history), then discard the
    // temporary sign-up row. Strict 1-to-1: the record must be unclaimed.
    const [record] = await db
      .select()
      .from(membersTable)
      .where(eq(membersTable.id, cooperativeRecordId));
    if (!record) {
      res.status(404).json({ error: "Cooperative record not found" });
      return;
    }
    if (record.clerkUserId || record.pendingClerkUserId) {
      res.status(409).json({
        error: "That cooperative record is already linked to an app account.",
      });
      return;
    }

    // Link + delete must be atomic: a partial success would either leave a
    // stale pending row or orphan the Clerk identity. Re-check the record is
    // still unclaimed inside the transaction to close the approve/approve race.
    type LinkResult =
      | { ok: true; member: typeof signup }
      | { ok: false; status: number; error: string };
    let result: LinkResult;
    try {
      result = await db.transaction(async (tx): Promise<LinkResult> => {
        const [current] = await tx
          .select()
          .from(membersTable)
          .where(eq(membersTable.id, cooperativeRecordId));
        if (!current) {
          return { ok: false, status: 404, error: "Cooperative record not found" };
        }
        if (current.clerkUserId || current.pendingClerkUserId) {
          return {
            ok: false,
            status: 409,
            error: "That cooperative record is already linked to an app account.",
          };
        }

        // Delete the signup row BEFORE updating the target record.
        // The signup row may share unique-constrained values (staffId, email) with
        // the data we're about to write to the cooperative record. If we update first,
        // two rows briefly hold the same unique value → 23505. Deleting first ensures
        // only one row ever owns each value.
        await tx.delete(membersTable).where(eq(membersTable.id, id));

        const [updated] = await tx
          .update(membersTable)
          .set({
            clerkUserId: signup.pendingClerkUserId,
            email: signup.pendingEmail,
            // Admin overrides take priority; member's self-reported staffId overrides
            // the imported cooperative record value (most imported records have no staffId).
            fullName: overrides.fullName ?? current.fullName,
            phone: overrides.phone ?? current.phone ?? signup.phone ?? undefined,
            staffId: overrides.staffId ?? signup.staffId ?? current.staffId ?? undefined,
            organization: overrides.organization ?? current.organization,
            memberType: overrides.memberType ?? current.memberType ?? undefined,
            status: "active",
          })
          .where(eq(membersTable.id, cooperativeRecordId))
          .returning();

        return { ok: true, member: updated };
      });
    } catch (err: any) {
      const code = err?.code ?? err?.cause?.code;
      if (code === "23505") {
        res.status(409).json({
          error: "This account or email is already linked to a member.",
        });
        return;
      }
      throw err;
    }

    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    const linked = result.member;

    await logAudit({
      actorId: req.memberId,
      action: "APPROVE_SIGNUP_MATCH",
      entity: "member",
      entityId: linked.id,
      details: `Linked sign-up "${signup.pendingName ?? signup.fullName}" to cooperative record: ${linked.fullName}`,
    });

    res.json(formatMember(linked));
  },
);

router.post(
  "/members/:id/reject-match",
  requireAuth,
  requireAdminOnly,
  requireReverification,
  async (req: AuthRequest, res): Promise<void> => {
    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(raw, 10);

    const [signup] = await db
      .select()
      .from(membersTable)
      .where(eq(membersTable.id, id));
    if (!signup || !signup.pendingClerkUserId || signup.clerkUserId) {
      res.status(404).json({ error: "Pending sign-up not found" });
      return;
    }

    // A pending sign-up row carries no financial history, so it is safe to
    // delete. The person can re-register if the rejection was a mistake.
    await db.delete(membersTable).where(eq(membersTable.id, id));

    await logAudit({
      actorId: req.memberId,
      action: "REJECT_SIGNUP",
      entity: "member",
      entityId: id,
      details: `Rejected sign-up: ${signup.pendingName ?? signup.fullName}`,
    });

    res.json({ rejected: true });
  },
);

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

    // Refuse deletion if the member has any financial / audit history.
    // Co-op records (loans, transactions, store purchases, uploads, broadcasts,
    // support tickets/messages) must be preserved, so the member must be
    // deactivated rather than deleted.
    const [counts] = await db
      .select({
        loans: sql<number>`(select count(*)::int from ${loansTable} where ${loansTable.memberId} = ${id})`,
        transactions: sql<number>`(select count(*)::int from ${transactionsTable} where ${transactionsTable.memberId} = ${id})`,
        purchases: sql<number>`(select count(*)::int from ${storePurchasesTable} where ${storePurchasesTable.memberId} = ${id})`,
        uploads: sql<number>`(select count(*)::int from ${uploadRecordsTable} where ${uploadRecordsTable.uploadedBy} = ${id})`,
      })
      .from(membersTable)
      .where(eq(membersTable.id, id));

    const blockers: string[] = [];
    if ((counts?.loans ?? 0) > 0) blockers.push(`${counts!.loans} loan(s)`);
    if ((counts?.transactions ?? 0) > 0)
      blockers.push(`${counts!.transactions} transaction(s)`);
    if ((counts?.purchases ?? 0) > 0)
      blockers.push(`${counts!.purchases} store purchase(s)`);
    if ((counts?.uploads ?? 0) > 0)
      blockers.push(`${counts!.uploads} upload record(s)`);

    if (blockers.length > 0) {
      const reason = `Member has financial history (${blockers.join(", ")}). Deactivate instead.`;
      await logAudit({
        actorId: req.memberId,
        action: "DELETE_MEMBER_FAILED",
        entity: "member",
        entityId: id,
        details: `Refused delete of ${member.fullName}: ${reason}`,
      });
      res.status(409).json({ error: reason });
      return;
    }

    try {
      // Cascade rules in the schema take care of transient data
      // (notifications, otp_codes, step_up_grants).  If a new restricted FK
      // ever points at members, Postgres will raise 23503 and we surface that.
      await db.delete(membersTable).where(eq(membersTable.id, id));
    } catch (err: any) {
      const code = err?.code ?? err?.cause?.code;
      const isFkViolation = code === "23503";
      await logAudit({
        actorId: req.memberId,
        action: "DELETE_MEMBER_FAILED",
        entity: "member",
        entityId: id,
        details: `Failed to delete member ${member.fullName}: ${err.message}`,
      });
      res.status(isFkViolation ? 409 : 500).json({
        error: isFkViolation
          ? "Member is referenced by other records. Deactivate instead."
          : "Failed to delete member",
      });
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

// ── BALANCE TIMELINE ────────────────────────────────────────────────────────
// Per-member journey: opening balance snapshot → each uploaded month → current
// live balance, with savings/loan/store running totals.
const MONTH_ORDER: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

const SAVINGS_CREDIT_TYPES = new Set([
  "savings", "provident", "christmas", "fire",
]);
const LOAN_DEBIT_TYPES = new Set([
  "real_loan_repayment", "emergency_loan_repayment", "loan_repayment",
  "fuel_venture_repayment", "land_loan_repayment",
]);
const STORE_DEBIT_TYPES = new Set([
  "electronics_repayment", "s_electronics_repayment", "furniture_repayment",
  "commodity_repayment", "ghl_form_repayment", "store_repayment",
]);

const TX_LABELS: Record<string, string> = {
  savings: "Savings", provident: "Provident", christmas: "Christmas",
  fire: "Fire Fund", real_loan_repayment: "Real Loan Repayment",
  emergency_loan_repayment: "Emergency Loan Repayment",
  loan_repayment: "Loan Repayment",
  fuel_venture_repayment: "Fuel Venture Repayment",
  land_loan_repayment: "Land Loan Repayment",
  electronics_repayment: "Electronics Repayment",
  s_electronics_repayment: "Staff Electronics Repayment",
  furniture_repayment: "Furniture Repayment",
  commodity_repayment: "Commodity Repayment",
  ghl_form_repayment: "GHL Form Repayment",
  store_repayment: "Store Repayment",
};

router.get(
  "/members/:id/balance-timeline",
  requireAuth,
  requireAdmin,
  async (req: AuthRequest, res): Promise<void> => {
    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(raw, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid member id" });
      return;
    }

    const [member] = await db
      .select()
      .from(membersTable)
      .where(eq(membersTable.id, id));
    if (!member) {
      res.status(404).json({ error: "Member not found" });
      return;
    }

    const num = (v: string | null | undefined): number =>
      v == null ? 0 : parseFloat(v) || 0;

    const opening = {
      savings:
        num(member.obSavingsBalance) +
        num(member.obProvidentBalance) +
        num(member.obChristmasBalance) +
        num(member.obFireFundBalance),
      loan: num(member.obTotalLoanBalance),
      store: num(member.obTotalStoreDebt),
    };

    const current = {
      savings:
        num(member.savingsBalance) +
        num(member.providentBalance) +
        num(member.christmasBalance) +
        num(member.fireFundBalance),
      loan: num(member.totalLoanBalance),
      store: num(member.totalStoreDebt),
    };

    const txns = await db
      .select({
        type: transactionsTable.type,
        amount: transactionsTable.amount,
        month: transactionsTable.month,
        year: transactionsTable.year,
      })
      .from(transactionsTable)
      .where(eq(transactionsTable.memberId, id));

    type PeriodAgg = {
      year: number;
      month: string;
      savingsAdded: number;
      loanRepaid: number;
      storeRepaid: number;
      items: Map<string, { amount: number; direction: "credit" | "debit" }>;
    };
    const periodMap = new Map<string, PeriodAgg>();

    for (const t of txns) {
      if (t.type === "opening_balance") continue;
      if (!t.month || t.year == null) continue;
      const key = `${t.year}-${t.month}`;
      let p = periodMap.get(key);
      if (!p) {
        p = {
          year: t.year,
          month: t.month,
          savingsAdded: 0,
          loanRepaid: 0,
          storeRepaid: 0,
          items: new Map(),
        };
        periodMap.set(key, p);
      }
      const amt = num(t.amount);
      let direction: "credit" | "debit" = "credit";
      if (SAVINGS_CREDIT_TYPES.has(t.type)) {
        p.savingsAdded += amt;
        direction = "credit";
      } else if (LOAN_DEBIT_TYPES.has(t.type)) {
        p.loanRepaid += amt;
        direction = "debit";
      } else if (STORE_DEBIT_TYPES.has(t.type)) {
        p.storeRepaid += amt;
        direction = "debit";
      } else {
        continue;
      }
      const existing = p.items.get(t.type);
      if (existing) existing.amount += amt;
      else p.items.set(t.type, { amount: amt, direction });
    }

    const sorted = Array.from(periodMap.values()).sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return (
        (MONTH_ORDER[a.month.toLowerCase()] || 0) -
        (MONTH_ORDER[b.month.toLowerCase()] || 0)
      );
    });

    let runSavings = opening.savings;
    let runLoan = opening.loan;
    let runStore = opening.store;
    const periods = sorted.map((p) => {
      runSavings += p.savingsAdded;
      runLoan = Math.max(0, runLoan - p.loanRepaid);
      runStore = Math.max(0, runStore - p.storeRepaid);
      return {
        year: p.year,
        month: p.month,
        label: `${p.month} ${p.year}`,
        savingsAdded: p.savingsAdded,
        loanRepaid: p.loanRepaid,
        storeRepaid: p.storeRepaid,
        running: { savings: runSavings, loan: runLoan, store: runStore },
        items: Array.from(p.items.entries()).map(([type, v]) => ({
          label: TX_LABELS[type] || type,
          amount: v.amount,
          direction: v.direction,
        })),
      };
    });

    res.json({
      memberId: member.id,
      fullName: member.fullName,
      opening,
      periods,
      current,
    });
  },
);

export default router;
