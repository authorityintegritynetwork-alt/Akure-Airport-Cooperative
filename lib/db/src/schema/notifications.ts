import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { membersTable } from "./members";

export const notificationsTable = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    memberId: integer("member_id")
      .notNull()
      .references(() => membersTable.id, { onDelete: "cascade" }),
    type: text("type", {
      enum: ["loan_update", "transaction", "store_purchase", "system", "announcement", "support"],
    }).notNull(),
    link: text("link"),
    title: text("title").notNull(),
    message: text("message").notNull(),
    isRead: boolean("is_read").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    memberIdx: index("notifications_member_idx").on(t.memberId),
    memberUnreadIdx: index("notifications_member_unread_idx").on(t.memberId, t.isRead),
    typeLinkIdx: index("notifications_type_link_idx").on(t.type, t.link),
  }),
);

export const insertNotificationSchema = createInsertSchema(notificationsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notificationsTable.$inferSelect;
