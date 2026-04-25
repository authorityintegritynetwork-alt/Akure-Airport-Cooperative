import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { membersTable } from "./members";

export const supportTicketsTable = pgTable("support_tickets", {
  id: serial("id").primaryKey(),
  memberId: integer("member_id")
    .notNull()
    .references(() => membersTable.id),
  subject: text("subject").notNull(),
  category: text("category", {
    enum: ["loan", "deduction", "account", "store", "general"],
  })
    .notNull()
    .default("general"),
  status: text("status", {
    enum: ["open", "in_progress", "waiting_member", "resolved", "closed"],
  })
    .notNull()
    .default("open"),
  priority: text("priority", {
    enum: ["normal", "high", "urgent"],
  })
    .notNull()
    .default("normal"),
  assignedToMemberId: integer("assigned_to_member_id").references(() => membersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
});

export const supportMessagesTable = pgTable("support_messages", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id")
    .notNull()
    .references(() => supportTicketsTable.id, { onDelete: "cascade" }),
  senderMemberId: integer("sender_member_id")
    .notNull()
    .references(() => membersTable.id),
  body: text("body").notNull(),
  isInternalNote: boolean("is_internal_note").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSupportTicketSchema = createInsertSchema(supportTicketsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastMessageAt: true,
  resolvedAt: true,
  closedAt: true,
});
export type InsertSupportTicket = z.infer<typeof insertSupportTicketSchema>;
export type SupportTicket = typeof supportTicketsTable.$inferSelect;

export const insertSupportMessageSchema = createInsertSchema(supportMessagesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertSupportMessage = z.infer<typeof insertSupportMessageSchema>;
export type SupportMessage = typeof supportMessagesTable.$inferSelect;
