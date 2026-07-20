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

import { formatMember, maskMemberBalances } from "../lib/formatMember";
import { computeMatchSuggestions } from "../lib/matchSuggestions";
import { requireAdminOnly } from "../middlewares/auth";
import { ApproveMatchBody } from "@workspace/api-zod";
import { sendMail } from "../lib/mailer";
import { systemSettingsTable } from "@workspace/db";

/** Fire-and-forget approval welcome email — never blocks the response. */
function sendApprovalEmail(member: { fullName: string; email: string | null }): void {
  if (!member.email) return;
  const appUrl = process.env.APP_URL ?? "https://your-app-url.com";
  const firstName = member.fullName.split(" ")[0];
  void sendMail({
    to: member.email,
    subject: "Your membership has been approved — Akure Airport Co-op",
    text:
      `Dear ${member.fullName},\n\n` +
      `Great news! Your registration for the Akure Airport Staff Co-operative Multipurpose Society has been reviewed and approved.\n\n` +
      `You can now log in to your account to view your savings, loans, and other cooperative benefits:\n\n` +
      `${appUrl}\n\n` +
      `If you have any questions, please contact the cooperative administrator.\n\n` +
      `Warm regards,\nAkure Airport Staff Co-operative`,
    html:
      `<div style="font-family:system-ui,sans-serif;max-width:540px;margin:auto;color:#1a1a1a;">` +
      `<div style="background:#0a2452;padding:24px 32px;border-radius:8px 8px 0 0;">` +
      `<h1 style="color:#fff;margin:0;font-size:20px;font-weight:700;">Akure Airport Staff Co-operative</h1>` +
      `</div>` +
      `<div style="background:#f8f9fb;padding:32px;border-radius:0 0 8px 8px;border:1px solid #e4e7ec;border-top:none;">` +
      `<h2 style="margin:0 0 16px;font-size:22px;color:#0a2452;">🎉 Membership Approved!</h2>` +
      `<p style="margin:0 0 12px;">Dear <strong>${firstName}</strong>,</p>` +
      `<p style="margin:0 0 12px;">Your registration for the <strong>Akure Airport Staff Co-operative Multipurpose Society</strong> has been reviewed and <strong>approved</strong>.</p>` +
      `<p style="margin:0 0 24px;">You can now log in to your account to view your savings balance, loan history, and other cooperative benefits.</p>` +
      `<a href="${appUrl}" style="display:inline-block;background:#0a2452;color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:600;font-size:15px;">Log in to your account</a>` +
      `<p style="margin:32px 0 0;font-size:13px;color:#666;">If you have any questions, please contact the cooperative administrator.</p>` +
      `<p style="margin:8px 0 0;font-size:13px;color:#666;">Warm regards,<br><strong>Akure Airport Staff Co-operative</strong></p>` +
      `</div>` +
      `</div>`,
  });
}

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

  const formatted = formatMember(member);

  // Mask balances for regular members when super-admin has enabled balance hiding.
  if (req.memberRole === "member") {
    const [settings] = await db
      .select({ balancesHidden: systemSettingsTable.balancesHidden })
      .from(systemSettingsTable);
    if (settings?.balancesHidden) {
      res.json(maskMemberBalances(formatted));
      return;
    }
  }

  res.json(formatted);
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

      sendApprovalEmail(member);
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

    sendApprovalEmail({ fullName: linked.fullName, email: signup.pendingEmail ?? linked.email });
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
// Per-column per-member history: opening balance values + monthly uploads +
// current live balance from the members table.  Each spreadsheet column is
// tracked independently — savings columns accumulate upward, loan columns
// show total repaid from monthly deductions.

const MONTH_ORDER: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

/** Maps every known transaction type to its spreadsheet column key. */
const TX_TO_COL: Record<string, string> = {
  savings:                  "savings",
  christmas:                "christmas",
  christmas_payout:         "christmas",  // payout credited back out
  fire:                     "fire",
  shares_credit:            "shares",
  provident:                "provident",
  provident_loan_repayment: "provident",  // legacy alias
  real_loan_repayment:      "realLoan",
  emergency_loan_repayment: "emergencyLoan",
  loan_repayment:           "realLoan",   // legacy alias
  electronics_repayment:    "electronics",
  s_electronics_repayment:  "sElectronics",
  furniture_repayment:      "furniture",
  commodity_repayment:      "commodity",
  ghl_form_repayment:       "ghlForm",
  fuel_venture_repayment:   "fuelVenture",
  land_loan_repayment:      "landLoan",
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

    const hasOb = member.obUploadedAt !== null;

    // Fetch transactions and disbursed loans in parallel.
    const [txns, loanRows] = await Promise.all([
      db
        .select({
          type: transactionsTable.type,
          amount: transactionsTable.amount,
          month: transactionsTable.month,
          year: transactionsTable.year,
        })
        .from(transactionsTable)
        .where(eq(transactionsTable.memberId, id)),
      db
        .select({
          id: loansTable.id,
          loanType: loansTable.loanType,
          amount: loansTable.amount,
          totalRepayable: loansTable.totalRepayable,
          outstandingBalance: loansTable.outstandingBalance,
          monthlyRepayment: loansTable.monthlyRepayment,
          tenureMonths: loansTable.tenureMonths,
          disbursedAt: loansTable.disbursedAt,
          purpose: loansTable.purpose,
        })
        .from(loansTable)
        .where(
          and(
            eq(loansTable.memberId, id),
            eq(loansTable.status, "disbursed"),
          ),
        )
        .orderBy(loansTable.disbursedAt),
    ]);

    // Build per-column, per-period accumulator.
    // periodKey (`${year}-${month}`) → colKey → total amount for that column/month.
    const periodColMap = new Map<string, Map<string, number>>();
    const periodMeta = new Map<string, { year: number; month: string }>();

    for (const t of txns) {
      if (t.type === "opening_balance" || t.type === "store_repayment") continue;
      if (!t.month || t.year == null) continue;
      const colKey = TX_TO_COL[t.type];
      if (!colKey) continue;

      const pk = `${t.year}-${t.month}`;
      if (!periodColMap.has(pk)) {
        periodColMap.set(pk, new Map());
        periodMeta.set(pk, { year: t.year, month: t.month });
      }
      const colMap = periodColMap.get(pk)!;
      colMap.set(colKey, (colMap.get(colKey) ?? 0) + num(t.amount));
    }

    // Sort period keys chronologically.
    const sortedPeriodKeys = Array.from(periodMeta.entries())
      .sort(([, a], [, b]) => {
        if (a.year !== b.year) return a.year - b.year;
        return (
          (MONTH_ORDER[a.month.toLowerCase()] ?? 0) -
          (MONTH_ORDER[b.month.toLowerCase()] ?? 0)
        );
      })
      .map(([k]) => k);

    // Build a ColumnHistory object for one column key.
    const buildHistory = (ob: number, current: number, colKey: string) => {
      const months: { year: number; month: string; label: string; amount: number }[] = [];
      for (const pk of sortedPeriodKeys) {
        const amt = periodColMap.get(pk)?.get(colKey) ?? 0;
        if (amt === 0) continue;
        const meta = periodMeta.get(pk)!;
        months.push({
          year: meta.year,
          month: meta.month,
          label: `${meta.month} ${meta.year}`,
          amount: amt,
        });
      }
      return { ob, current, months };
    };

    const columns = {
      savings:      buildHistory(num(member.obSavingsBalance),       num(member.savingsBalance),       "savings"),
      christmas:    buildHistory(num(member.obChristmasBalance),     num(member.christmasBalance),     "christmas"),
      shares:       buildHistory(num(member.obSharesBalance),        num(member.sharesBalance),        "shares"),
      provident:    buildHistory(num(member.obProvidentBalance),     num(member.providentBalance),     "provident"),
      realLoan:     buildHistory(num(member.obRealLoanBalance),      num(member.realLoanBalance),      "realLoan"),
      emergencyLoan:buildHistory(num(member.obEmergencyLoanBalance), num(member.emergencyLoanBalance), "emergencyLoan"),
      electronics:  buildHistory(num(member.obElectronicsDebt),      num(member.electronicsDebt),      "electronics"),
      sElectronics: buildHistory(num(member.obSElectronicsDebt),     num(member.sElectronicsDebt),     "sElectronics"),
      furniture:    buildHistory(num(member.obFurnitureDebt),        num(member.furnitureDebt),        "furniture"),
      fuelVenture:  buildHistory(num(member.obFuelVentureBalance),   num(member.fuelVentureBalance),   "fuelVenture"),
      commodity:    buildHistory(num(member.obCommodityDebt),        num(member.commodityDebt),        "commodity"),
      fire:         buildHistory(num(member.obFireFundBalance),      num(member.fireFundBalance),      "fire"),
      ghlForm:      buildHistory(num(member.obGhlFormDebt),          num(member.ghlFormDebt),          "ghlForm"),
      landLoan:     buildHistory(num(member.obLandLoanBalance),      num(member.landLoanBalance),      "landLoan"),
    };

    const loanEvents = loanRows.map((l) => ({
      id: l.id,
      loanType: l.loanType ?? "real",
      amount: num(l.amount as unknown as string),
      totalRepayable: num(l.totalRepayable as unknown as string),
      outstandingBalance: num(l.outstandingBalance as unknown as string),
      monthlyRepayment: num(l.monthlyRepayment as unknown as string),
      tenureMonths: l.tenureMonths ?? 0,
      disbursedAt: l.disbursedAt ? new Date(l.disbursedAt).toISOString() : null,
      purpose: l.purpose ?? null,
      productName: null,
    }));

    res.json({
      memberId: member.id,
      fullName: member.fullName,
      memberStatus: member.status,
      hasOb,
      columns,
      loanEvents,
    });
  },
);

export default router;
