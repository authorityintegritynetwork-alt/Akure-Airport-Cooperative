import { Router, type IRouter } from "express";
import {
  db,
  broadcastsTable,
  notificationsTable,
  membersTable,
  type BroadcastAudience,
} from "@workspace/db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

const broadcastAudienceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("all") }),
  z.object({
    kind: z.literal("role"),
    role: z.enum(["member", "admin", "financial_auditor", "super_admin", "treasurer"]),
  }),
  z.object({
    kind: z.literal("members"),
    memberIds: z.array(z.number().int().positive()).min(1),
  }),
]);
import { requireAuth, requireAdminOnly, AuthRequest } from "../middlewares/auth";
import { sendNotifications } from "../lib/notifications";
import { sendMail, type MailOptions } from "../lib/mailer";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

const createBroadcastBody = z.object({
  title: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1),
  category: z.enum(["announcement", "policy", "maintenance", "urgent"]),
  audience: broadcastAudienceSchema,
  sendEmail: z.boolean().optional().default(false),
});

async function resolveAudience(audience: BroadcastAudience): Promise<
  Array<{ id: number; fullName: string; email: string | null }>
> {
  if (audience.kind === "all") {
    return db
      .select({ id: membersTable.id, fullName: membersTable.fullName, email: membersTable.email })
      .from(membersTable)
      .where(eq(membersTable.status, "active"));
  }
  if (audience.kind === "role") {
    return db
      .select({ id: membersTable.id, fullName: membersTable.fullName, email: membersTable.email })
      .from(membersTable)
      .where(
        and(eq(membersTable.status, "active"), eq(membersTable.role, audience.role)),
      );
  }
  // members
  if (!audience.memberIds.length) return [];
  return db
    .select({ id: membersTable.id, fullName: membersTable.fullName, email: membersTable.email })
    .from(membersTable)
    .where(inArray(membersTable.id, audience.memberIds));
}

function shapeSummary(row: {
  broadcast: typeof broadcastsTable.$inferSelect;
  senderName: string | null;
  readCount: number | null;
}) {
  const b = row.broadcast;
  return {
    id: b.id,
    title: b.title,
    message: b.message,
    category: b.category,
    audience: b.audience as BroadcastAudience,
    recipientCount: b.recipientCount,
    readCount: row.readCount ?? 0,
    sendEmail: b.sendEmail,
    senderName: row.senderName ?? null,
    createdAt: b.createdAt,
  };
}

async function loadSummary(broadcastId: number) {
  const [row] = await db
    .select({
      broadcast: broadcastsTable,
      senderName: membersTable.fullName,
      readCount: sql<number>`coalesce(count(${notificationsTable.id}) filter (where ${notificationsTable.isRead}), 0)::int`,
    })
    .from(broadcastsTable)
    .leftJoin(membersTable, eq(membersTable.id, broadcastsTable.senderMemberId))
    .leftJoin(
      notificationsTable,
      and(
        eq(notificationsTable.type, "announcement"),
        eq(
          notificationsTable.link,
          sql`'/my-notifications?broadcast=' || ${broadcastsTable.id}::text`,
        ),
      ),
    )
    .where(eq(broadcastsTable.id, broadcastId))
    .groupBy(broadcastsTable.id, membersTable.fullName)
    .limit(1);
  return row ? shapeSummary(row) : null;
}

router.get(
  "/broadcasts",
  requireAuth,
  requireAdminOnly,
  async (_req: AuthRequest, res): Promise<void> => {
    // Single round-trip: broadcasts + sender name + read counts.
    const rows = await db
      .select({
        broadcast: broadcastsTable,
        senderName: membersTable.fullName,
        readCount: sql<number>`coalesce(count(${notificationsTable.id}) filter (where ${notificationsTable.isRead}), 0)::int`,
      })
      .from(broadcastsTable)
      .leftJoin(membersTable, eq(membersTable.id, broadcastsTable.senderMemberId))
      .leftJoin(
        notificationsTable,
        and(
          eq(notificationsTable.type, "announcement"),
          eq(
            notificationsTable.link,
            sql`'/my-notifications?broadcast=' || ${broadcastsTable.id}::text`,
          ),
        ),
      )
      .groupBy(broadcastsTable.id, membersTable.fullName)
      .orderBy(desc(broadcastsTable.createdAt))
      .limit(100);
    res.json(rows.map(shapeSummary));
  },
);

router.post(
  "/broadcasts",
  requireAuth,
  requireAdminOnly,
  async (req: AuthRequest, res): Promise<void> => {
    const parsed = createBroadcastBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { title, message, category, audience, sendEmail } = parsed.data;

    const recipients = await resolveAudience(audience);
    if (recipients.length === 0) {
      res.status(400).json({ error: "Audience resolved to zero recipients" });
      return;
    }

    const [broadcast] = await db
      .insert(broadcastsTable)
      .values({
        senderMemberId: req.memberId!,
        title,
        message,
        category,
        audience,
        recipientCount: recipients.length,
        sendEmail,
      })
      .returning();

    const link = `/my-notifications?broadcast=${broadcast.id}`;
    await sendNotifications(
      recipients.map((r) => ({
        memberId: r.id,
        type: "announcement" as const,
        title,
        message,
        link,
      })),
    );

    if (sendEmail) {
      // fire-and-forget per recipient; don't block the response on SMTP.
      // Skip recipients without a real email (e.g. unmatched cooperative rows).
      const emailable = recipients.filter(
        (r): r is { id: number; fullName: string; email: string } =>
          !!r.email && !r.email.endsWith("@placeholder.aacsms.internal"),
      );
      void Promise.allSettled(
        emailable.map((r) =>
          sendMail({
            to: r.email,
            subject: `[${category.toUpperCase()}] ${title}`,
            text: `${message}\n\n— Akure Airport Staff Co-operative`,
          }),
        ),
      );
    }

    await logAudit({
      actorId: req.memberId!,
      action: "SEND_BROADCAST",
      entity: "broadcast",
      entityId: broadcast.id,
      details: JSON.stringify({
        title,
        category,
        audience,
        recipientCount: recipients.length,
        sendEmail,
      }),
    });

    const summary = await loadSummary(broadcast.id);
    res.status(201).json(summary);
  },
);

router.get(
  "/broadcasts/:id",
  requireAuth,
  requireAdminOnly,
  async (req: AuthRequest, res): Promise<void> => {
    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(raw, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const [row] = await db
      .select()
      .from(broadcastsTable)
      .where(eq(broadcastsTable.id, id))
      .limit(1);
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const summary = await loadSummary(row.id);
    if (!summary) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const link = `/my-notifications?broadcast=${row.id}`;

    const recipients = await db
      .select({
        memberId: notificationsTable.memberId,
        memberName: membersTable.fullName,
        isRead: notificationsTable.isRead,
      })
      .from(notificationsTable)
      .innerJoin(membersTable, eq(membersTable.id, notificationsTable.memberId))
      .where(
        and(
          eq(notificationsTable.type, "announcement"),
          eq(notificationsTable.link, link),
        ),
      )
      .orderBy(membersTable.fullName);

    res.json({ ...summary, recipients });
  },
);

export default router;
