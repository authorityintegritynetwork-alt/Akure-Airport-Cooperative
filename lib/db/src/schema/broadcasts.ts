import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  boolean,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { membersTable } from "./members";

export const broadcastsTable = pgTable(
  "broadcasts",
  {
    id: serial("id").primaryKey(),
    senderMemberId: integer("sender_member_id")
      .notNull()
      .references(() => membersTable.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    message: text("message").notNull(),
    category: text("category", {
      enum: ["announcement", "policy", "maintenance", "urgent"],
    })
      .notNull()
      .default("announcement"),
    audience: jsonb("audience").notNull(),
    recipientCount: integer("recipient_count").notNull().default(0),
    sendEmail: boolean("send_email").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    senderIdx: index("broadcasts_sender_idx").on(t.senderMemberId),
    createdIdx: index("broadcasts_created_idx").on(t.createdAt),
  }),
);

export const insertBroadcastSchema = createInsertSchema(broadcastsTable).omit({
  id: true,
  createdAt: true,
  recipientCount: true,
});
export type InsertBroadcast = z.infer<typeof insertBroadcastSchema>;
export type Broadcast = typeof broadcastsTable.$inferSelect;

export const broadcastAudienceSchema = z.discriminatedUnion("kind", [
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
export type BroadcastAudience = z.infer<typeof broadcastAudienceSchema>;
