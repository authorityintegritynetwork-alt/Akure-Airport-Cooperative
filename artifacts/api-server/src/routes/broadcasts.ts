import { Router, type IRouter } from "express";
import {
  db,
  broadcastsTable,
  notificationsTable,
  membersTable,
  type BroadcastAudience,
} from "@workspace/db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "@workspace/api-zod";

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
import { sendMail } from "../lib/mailer";
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
  Array<{ id: number; fullName: string; email: string }>
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

async function formatSummary(row: typeof broadcastsTable.$inferSelect) {
  const [sender] = await db
    .select({ fullName: membersTable.fullName })
    .from(membersTable)
    .where(eq(membersTable.id, row.senderMemberId))
    .limit(1);

  const [readRow] = await db
    .select({ readCount: sql<number>`count(*) filter (where ${notificationsTable.isRead})::int` })
    .from(notificationsTable)
    .where(
      and(
        eq(notificationsTable.type, "announcement"),
        eq(notificationsTable.link, `/my-notifications?broadcast=${row.id}`),
      ),
    );

  return {
    id: row.id,
    title: row.title,
    message: row.message,
    category: row.category,
    audience: row.audience as BroadcastAudience,
    recipientCount: row.recipientCount,
    readCount: readRow?.readCount ?? 0,
    sendEmail: row.sendEmail,
    senderName: sender?.fullName ?? null,
    createdAt: row.createdAt,
  };
}

router.get(
  "/broadcasts",
  requireAuth,
  requireAdminOnly,
  async (_req: AuthRequest, res): Promise<void> => {
    const rows = await db
      .select()
      .from(broadcastsTable)
      .orderBy(desc(broadcastsTable.createdAt))
      .limit(100);
    const summaries = await Promise.all(rows.map((r) => formatSummary(r)));
    res.json(summaries);
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
      // fire-and-forget per recipient; don't block the response on SMTP
      void Promise.allSettled(
        recipients.map((r) =>
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

    const summary = await formatSummary(broadcast);
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

    const summary = await formatSummary(row);
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
