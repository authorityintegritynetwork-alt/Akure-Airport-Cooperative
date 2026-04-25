import { Router, type IRouter } from "express";
import {
  db,
  supportTicketsTable,
  supportMessagesTable,
  membersTable,
  type SupportTicket,
} from "@workspace/db";
import { and, asc, count, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { z } from "@workspace/api-zod";
import { requireAuth, AuthRequest } from "../middlewares/auth";
import { sendNotification } from "../lib/notifications";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

const ADMIN_ROLES = ["admin", "financial_auditor", "treasurer", "super_admin"] as const;
function isAdminRole(role?: string): boolean {
  return !!role && (ADMIN_ROLES as readonly string[]).includes(role);
}

const createTicketBody = z.object({
  subject: z.string().trim().min(1).max(200),
  category: z.enum(["loan", "deduction", "account", "store", "general"]),
  priority: z.enum(["normal", "high", "urgent"]).optional().default("normal"),
  body: z.string().trim().min(1),
});

const addMessageBody = z.object({
  body: z.string().trim().min(1),
  isInternalNote: z.boolean().optional().default(false),
});

const updateTicketBody = z.object({
  status: z.enum(["open", "in_progress", "waiting_member", "resolved", "closed"]).optional(),
  priority: z.enum(["normal", "high", "urgent"]).optional(),
  assignedToMemberId: z.union([z.number().int().positive(), z.null()]).optional(),
});

const listQuery = z.object({
  status: z
    .enum(["open", "in_progress", "waiting_member", "resolved", "closed"])
    .optional(),
  assignee: z.enum(["me", "unassigned", "any"]).optional(),
  category: z.string().optional(),
});

async function memberDisplay(id: number | null | undefined) {
  if (!id) return { name: null as string | null, role: null as string | null };
  const [m] = await db
    .select({ fullName: membersTable.fullName, role: membersTable.role })
    .from(membersTable)
    .where(eq(membersTable.id, id))
    .limit(1);
  return { name: m?.fullName ?? null, role: m?.role ?? null };
}

async function buildTicketSummary(
  ticket: SupportTicket,
  viewerMemberId: number,
  viewerIsAdmin: boolean,
) {
  const owner = await memberDisplay(ticket.memberId);
  const assignee = await memberDisplay(ticket.assignedToMemberId);

  // unread = there's a message since the viewer's last activity that the viewer didn't send
  // (approximation: any message newer than the viewer's last message they sent, by someone else)
  const [{ value: messageCount }] = await db
    .select({ value: count() })
    .from(supportMessagesTable)
    .where(eq(supportMessagesTable.ticketId, ticket.id));

  const [{ value: lastSelf }] = await db
    .select({ value: sql<Date | null>`max(${supportMessagesTable.createdAt})` })
    .from(supportMessagesTable)
    .where(
      and(
        eq(supportMessagesTable.ticketId, ticket.id),
        eq(supportMessagesTable.senderMemberId, viewerMemberId),
      ),
    );

  let unreadForViewer = false;
  const lastMsgAt = ticket.lastMessageAt;
  if (lastMsgAt) {
    if (!lastSelf) unreadForViewer = true;
    else if (new Date(lastMsgAt).getTime() > new Date(lastSelf as Date).getTime())
      unreadForViewer = true;
  }

  return {
    id: ticket.id,
    memberId: ticket.memberId,
    memberName: owner.name ?? "Unknown",
    subject: ticket.subject,
    category: ticket.category,
    status: ticket.status,
    priority: ticket.priority,
    assignedToMemberId: ticket.assignedToMemberId,
    assignedToName: assignee.name,
    unreadForViewer,
    messageCount: Number(messageCount ?? 0),
    lastMessageAt: ticket.lastMessageAt,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
  };
}

async function buildTicketDetail(
  ticket: SupportTicket,
  viewerMemberId: number,
  viewerIsAdmin: boolean,
) {
  const summary = await buildTicketSummary(ticket, viewerMemberId, viewerIsAdmin);

  const messageRows = await db
    .select({
      id: supportMessagesTable.id,
      ticketId: supportMessagesTable.ticketId,
      senderMemberId: supportMessagesTable.senderMemberId,
      body: supportMessagesTable.body,
      isInternalNote: supportMessagesTable.isInternalNote,
      createdAt: supportMessagesTable.createdAt,
      senderName: membersTable.fullName,
      senderRole: membersTable.role,
    })
    .from(supportMessagesTable)
    .innerJoin(membersTable, eq(membersTable.id, supportMessagesTable.senderMemberId))
    .where(eq(supportMessagesTable.ticketId, ticket.id))
    .orderBy(asc(supportMessagesTable.createdAt));

  const visibleMessages = viewerIsAdmin
    ? messageRows
    : messageRows.filter((m) => !m.isInternalNote);

  return { ...summary, messages: visibleMessages };
}

// ── LIST TICKETS ───────────────────────────────────────────────────────────────
router.get(
  "/support/tickets",
  requireAuth,
  async (req: AuthRequest, res): Promise<void> => {
    const parsed = listQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { status, assignee, category } = parsed.data;
    const viewerIsAdmin = isAdminRole(req.memberRole);

    const conditions = [] as any[];
    if (!viewerIsAdmin) {
      conditions.push(eq(supportTicketsTable.memberId, req.memberId!));
    } else {
      if (assignee === "me") {
        conditions.push(eq(supportTicketsTable.assignedToMemberId, req.memberId!));
      } else if (assignee === "unassigned") {
        conditions.push(isNull(supportTicketsTable.assignedToMemberId));
      }
    }
    if (status) conditions.push(eq(supportTicketsTable.status, status));
    if (category) conditions.push(eq(supportTicketsTable.category, category as any));

    const tickets = await db
      .select()
      .from(supportTicketsTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(supportTicketsTable.lastMessageAt))
      .limit(200);

    const summaries = await Promise.all(
      tickets.map((t) => buildTicketSummary(t, req.memberId!, viewerIsAdmin)),
    );
    res.json(summaries);
  },
);

// ── CREATE TICKET ──────────────────────────────────────────────────────────────
router.post(
  "/support/tickets",
  requireAuth,
  async (req: AuthRequest, res): Promise<void> => {
    const parsed = createTicketBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { subject, category, priority, body } = parsed.data;

    const [ticket] = await db
      .insert(supportTicketsTable)
      .values({
        memberId: req.memberId!,
        subject,
        category,
        priority,
        status: "open",
      })
      .returning();

    await db.insert(supportMessagesTable).values({
      ticketId: ticket.id,
      senderMemberId: req.memberId!,
      body,
      isInternalNote: false,
    });

    // Notify all queue-capable admins of new ticket (so they can pick it up)
    const admins = await db
      .select({ id: membersTable.id })
      .from(membersTable)
      .where(
        and(
          eq(membersTable.status, "active"),
          inArray(membersTable.role, [...ADMIN_ROLES]),
        ),
      );
    const link = `/support-admin/${ticket.id}`;
    for (const a of admins) {
      if (a.id === req.memberId) continue;
      void sendNotification({
        memberId: a.id,
        type: "support",
        title: `New support ticket: ${subject}`,
        message: `A member opened a ${category} ticket.`,
        link,
      });
    }

    const detail = await buildTicketDetail(ticket, req.memberId!, isAdminRole(req.memberRole));
    res.status(201).json(detail);
  },
);

// ── GET ONE ────────────────────────────────────────────────────────────────────
router.get(
  "/support/tickets/:id",
  requireAuth,
  async (req: AuthRequest, res): Promise<void> => {
    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(raw, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [ticket] = await db
      .select()
      .from(supportTicketsTable)
      .where(eq(supportTicketsTable.id, id))
      .limit(1);
    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }
    const viewerIsAdmin = isAdminRole(req.memberRole);
    if (!viewerIsAdmin && ticket.memberId !== req.memberId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const detail = await buildTicketDetail(ticket, req.memberId!, viewerIsAdmin);
    res.json(detail);
  },
);

// ── ADD MESSAGE ────────────────────────────────────────────────────────────────
router.post(
  "/support/tickets/:id/messages",
  requireAuth,
  async (req: AuthRequest, res): Promise<void> => {
    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(raw, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = addMessageBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { body, isInternalNote } = parsed.data;
    const viewerIsAdmin = isAdminRole(req.memberRole);
    if (isInternalNote && !viewerIsAdmin) {
      res.status(403).json({ error: "Only admins can post internal notes" });
      return;
    }

    const [ticket] = await db
      .select()
      .from(supportTicketsTable)
      .where(eq(supportTicketsTable.id, id))
      .limit(1);
    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }
    if (!viewerIsAdmin && ticket.memberId !== req.memberId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    if (ticket.status === "closed") {
      res.status(409).json({ error: "Ticket is closed" });
      return;
    }

    await db.insert(supportMessagesTable).values({
      ticketId: id,
      senderMemberId: req.memberId!,
      body,
      isInternalNote,
    });

    // bump status sensibly + lastMessageAt
    const newStatus = isInternalNote
      ? ticket.status
      : viewerIsAdmin
        ? "waiting_member"
        : ticket.status === "waiting_member" || ticket.status === "resolved"
          ? "open"
          : ticket.status;

    const [updated] = await db
      .update(supportTicketsTable)
      .set({
        lastMessageAt: new Date(),
        status: newStatus,
        ...(newStatus === "open" && ticket.status !== "open" ? { resolvedAt: null } : {}),
      })
      .where(eq(supportTicketsTable.id, id))
      .returning();

    if (!isInternalNote) {
      // notify the other side
      if (viewerIsAdmin) {
        // admin -> notify ticket owner
        void sendNotification({
          memberId: ticket.memberId,
          type: "support",
          title: `Reply on your ticket: ${ticket.subject}`,
          message: body.length > 140 ? body.slice(0, 137) + "…" : body,
          link: `/support/${ticket.id}`,
        });
      } else {
        // member -> notify assigned admin (or all admins if unassigned)
        if (ticket.assignedToMemberId) {
          void sendNotification({
            memberId: ticket.assignedToMemberId,
            type: "support",
            title: `New reply: ${ticket.subject}`,
            message: body.length > 140 ? body.slice(0, 137) + "…" : body,
            link: `/support-admin/${ticket.id}`,
          });
        } else {
          const admins = await db
            .select({ id: membersTable.id })
            .from(membersTable)
            .where(
              and(
                eq(membersTable.status, "active"),
                inArray(membersTable.role, [...ADMIN_ROLES]),
              ),
            );
          for (const a of admins) {
            if (a.id === req.memberId) continue;
            void sendNotification({
              memberId: a.id,
              type: "support",
              title: `New reply: ${ticket.subject}`,
              message: body.length > 140 ? body.slice(0, 137) + "…" : body,
              link: `/support-admin/${ticket.id}`,
            });
          }
        }
      }
    }

    const detail = await buildTicketDetail(updated, req.memberId!, viewerIsAdmin);
    res.status(201).json(detail);
  },
);

// ── UPDATE TICKET (admin) ──────────────────────────────────────────────────────
router.patch(
  "/support/tickets/:id",
  requireAuth,
  async (req: AuthRequest, res): Promise<void> => {
    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(raw, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    if (!isAdminRole(req.memberRole)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const parsed = updateTicketBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { status, priority, assignedToMemberId } = parsed.data;

    const [existing] = await db
      .select()
      .from(supportTicketsTable)
      .where(eq(supportTicketsTable.id, id))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    const patch: Partial<SupportTicket> = {};
    if (status !== undefined) {
      patch.status = status;
      if (status === "resolved") patch.resolvedAt = new Date();
      if (status === "closed") patch.closedAt = new Date();
      if (status === "open" || status === "in_progress") patch.resolvedAt = null;
    }
    if (priority !== undefined) patch.priority = priority;
    if (assignedToMemberId !== undefined) patch.assignedToMemberId = assignedToMemberId;

    const [updated] = await db
      .update(supportTicketsTable)
      .set(patch)
      .where(eq(supportTicketsTable.id, id))
      .returning();

    // audit any field changes
    const changes: string[] = [];
    if (status !== undefined && status !== existing.status) {
      changes.push(`status: ${existing.status} → ${status}`);
    }
    if (priority !== undefined && priority !== existing.priority) {
      changes.push(`priority: ${existing.priority} → ${priority}`);
    }
    if (
      assignedToMemberId !== undefined &&
      assignedToMemberId !== existing.assignedToMemberId
    ) {
      changes.push(
        `assignee: ${existing.assignedToMemberId ?? "unassigned"} → ${assignedToMemberId ?? "unassigned"}`,
      );
    }
    if (changes.length > 0) {
      await logAudit({
        actorId: req.memberId,
        action: "UPDATE_SUPPORT_TICKET",
        entity: "support_ticket",
        entityId: updated.id,
        details: `Ticket #${updated.id} (${existing.subject}) — ${changes.join("; ")}`,
      });
    }

    // notify member of status change
    if (status && status !== existing.status && updated.memberId !== req.memberId) {
      const labels: Record<string, string> = {
        open: "re-opened",
        in_progress: "is being worked on",
        waiting_member: "is waiting for your reply",
        resolved: "has been marked resolved",
        closed: "has been closed",
      };
      void sendNotification({
        memberId: updated.memberId,
        type: "support",
        title: `Your ticket ${labels[status] ?? "was updated"}`,
        message: existing.subject,
        link: `/support/${updated.id}`,
      });
    }

    const detail = await buildTicketDetail(updated, req.memberId!, true);
    res.json(detail);
  },
);

// ── ADMIN STATS ────────────────────────────────────────────────────────────────
router.get(
  "/support/stats",
  requireAuth,
  async (req: AuthRequest, res): Promise<void> => {
    if (!isAdminRole(req.memberRole)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const [r] = await db
      .select({
        open: sql<number>`count(*) filter (where status = 'open')::int`,
        inProgress: sql<number>`count(*) filter (where status = 'in_progress')::int`,
        waitingMember: sql<number>`count(*) filter (where status = 'waiting_member')::int`,
        resolved: sql<number>`count(*) filter (where status = 'resolved')::int`,
        unassigned: sql<number>`count(*) filter (where assigned_to_member_id is null and status not in ('resolved','closed'))::int`,
        urgent: sql<number>`count(*) filter (where priority = 'urgent' and status not in ('resolved','closed'))::int`,
      })
      .from(supportTicketsTable);
    res.json({
      open: r.open ?? 0,
      inProgress: r.inProgress ?? 0,
      waitingMember: r.waitingMember ?? 0,
      resolved: r.resolved ?? 0,
      unassigned: r.unassigned ?? 0,
      urgent: r.urgent ?? 0,
    });
  },
);

export default router;
